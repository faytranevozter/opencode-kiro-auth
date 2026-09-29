import * as logger from '../../plugin/logger.js';
import { classifyAccountFailure } from './account-failure-classifier.js';
import { accountLogAlias } from './recovery-request-identity.js';
import { encodeSseChunk } from './response-handler.js';
import { UpstreamUnexpectedError } from './stream-error.js';
import { STREAM_EMPTY_CLEAN_EOF_RETRY_LOG } from './stream-log-events.js';
import { StreamRecoveryCoordinator } from './stream-recovery.js';
const RECOVERY_QUOTA_COOLDOWN_MS = 30_000;
function requestLogIdentity(details) {
    const identity = {
        ...(typeof details['recoveryGroupId'] === 'string'
            ? { recoveryGroupId: details['recoveryGroupId'] }
            : {}),
        ...(typeof details['semanticFingerprint'] === 'string'
            ? { semanticFingerprint: details['semanticFingerprint'] }
            : {}),
        ...(typeof details['wireConversationId'] === 'string'
            ? { wireConversationId: details['wireConversationId'] }
            : {}),
        ...(typeof details['requestKind'] === 'string' ? { requestKind: details['requestKind'] } : {}),
        ...(typeof details['sameSemanticAsInitial'] === 'boolean'
            ? { sameSemanticAsInitial: details['sameSemanticAsInitial'] }
            : {}),
        ...(typeof details['sameConversationIdAsInitial'] === 'boolean'
            ? { sameConversationIdAsInitial: details['sameConversationIdAsInitial'] }
            : {}),
        ...(typeof details['conversationId'] === 'string'
            ? { conversationId: details['conversationId'] }
            : {}),
        ...(typeof details['model'] === 'string' ? { model: details['model'] } : {}),
        ...(typeof details['processId'] === 'number' ? { processId: details['processId'] } : {})
    };
    return Object.keys(identity).length > 0 ? identity : undefined;
}
export async function createLiveRecoveryResponse(options) {
    let nextAccount = options.initialAccount;
    let completedAttempt;
    let currentAttempt;
    let latestRequestLogIdentity;
    const failedAccountIds = options.failedAccountIds;
    let terminalFinished = false;
    const accountAliasesTried = new Set();
    let initialFailure;
    let finalFailure;
    let quotaRelevant = false;
    let emptyCleanEofRetried = false;
    const getCurrentAttempt = () => {
        if (!currentAttempt)
            throw new Error('No active Kiro recovery attempt context is available');
        return currentAttempt;
    };
    const failurePhase = (context) => context.openFailed ? 'pre_stream_open' : 'stream_iteration';
    const recordFailure = (failure) => {
        const context = getCurrentAttempt();
        const failureClass = classifyAccountFailure(failure);
        if (initialFailure === undefined)
            initialFailure = failure;
        finalFailure = failure;
        quotaRelevant ||= failureClass === 'quota_or_rate_limit';
        accountAliasesTried.add(accountLogAlias(context.attemptedAccount.id));
        if (!context.failureRecorded) {
            context.failureRecorded = true;
            failedAccountIds.add(context.attemptedAccount.id);
            if (failureClass === 'quota_or_rate_limit') {
                options.markRateLimited(context.resolvedAccount ?? context.attemptedAccount, RECOVERY_QUOTA_COOLDOWN_MS);
            }
        }
        return {
            context,
            phase: failurePhase(context),
            failureClass
        };
    };
    const attemptLogDetails = (context, phase, cause, details = {}) => {
        const baseDetails = context.logDetails
            ? context.logDetails()
            : {
                ...latestRequestLogIdentity,
                ...(latestRequestLogIdentity ? { identitySource: 'previous_attempt' } : {})
            };
        return {
            ...baseDetails,
            ...details,
            attemptedAccountAlias: accountLogAlias(context.attemptedAccount.id),
            ...(context.resolvedAccount
                ? { resolvedAccountAlias: accountLogAlias(context.resolvedAccount.id) }
                : {}),
            attemptIndex: context.attemptIndex,
            phase,
            cause: cause === undefined ? null : options.describeError(cause),
            ...(cause === undefined ? {} : { failureClass: classifyAccountFailure(cause) })
        };
    };
    const observedTerminalSource = (details) => {
        const source = details['terminalSource'];
        switch (source) {
            case 'clean_eof_without_completion_metadata':
            case 'completion_metadata_received':
            case 'iterator_failure':
            case 'semantic_truncation':
            case 'caller_abort':
            case 'stream_attempt_budget_exhausted':
            case 'stream_processing_failure':
                return source;
            default:
                return null;
        }
    };
    const finishTerminal = (terminationReason) => {
        if (terminalFinished)
            return;
        terminalFinished = true;
        const terminalSummary = {
            attemptsUsed: options.priorStreamFailures + (currentAttempt?.attemptIndex ?? 0),
            accountsTried: accountAliasesTried.size,
            accountAliases: [...accountAliasesTried],
            initialFailure: initialFailure === undefined ? null : options.describeError(initialFailure),
            finalFailure: finalFailure === undefined ? null : options.describeError(finalFailure),
            recovered: terminationReason === 'completed' && (initialFailure !== undefined || emptyCleanEofRetried),
            quotaRelevant
        };
        if (currentAttempt) {
            const observed = currentAttempt.logDetails
                ? observedTerminalSource(currentAttempt.logDetails())
                : null;
            const terminalSource = options.signal.aborted
                ? 'caller_abort'
                : terminationReason === 'coordinator_failure'
                    ? 'stream_processing_failure'
                    : terminationReason === 'attempt_budget_exhausted'
                        ? 'stream_attempt_budget_exhausted'
                        : observed === 'semantic_truncation'
                            ? observed
                            : (observed ?? 'iterator_failure');
            const phase = currentAttempt.openFailed
                ? 'pre_stream_open'
                : terminalSource === 'clean_eof_without_completion_metadata' ||
                    terminalSource === 'completion_metadata_received'
                    ? 'completed'
                    : 'stream_iteration';
            options.onTerminal({
                ...attemptLogDetails(currentAttempt, phase, undefined, {
                    outcome: 'terminal',
                    terminalSource,
                    ...terminalSummary
                }),
                terminalSource
            });
            return;
        }
        options.onTerminal({
            outcome: 'terminal',
            phase: 'stream_iteration',
            ...terminalSummary,
            terminalSource: options.signal.aborted
                ? 'caller_abort'
                : terminationReason === 'coordinator_failure'
                    ? 'stream_processing_failure'
                    : terminationReason === 'attempt_budget_exhausted'
                        ? 'stream_attempt_budget_exhausted'
                        : 'iterator_failure'
        });
    };
    const openAttempt = async (attemptIndex) => {
        const attemptedAccount = nextAccount;
        accountAliasesTried.add(accountLogAlias(attemptedAccount.id));
        const context = {
            attemptIndex,
            attemptedAccount,
            openFailed: false,
            failureRecorded: false
        };
        currentAttempt = context;
        try {
            const result = await options.attemptFactory.open(attemptIndex, attemptedAccount);
            context.resolvedAccount = result.account;
            context.logDetails = result.logDetails;
            latestRequestLogIdentity = requestLogIdentity(result.logDetails());
            completedAttempt = result.handle;
            return result.handle;
        }
        catch (error) {
            context.openFailed = true;
            recordFailure(error);
            throw error;
        }
    };
    let initialAttempt;
    try {
        initialAttempt = await openAttempt(1);
    }
    catch (error) {
        options.onInitialOpenFailure();
        throw error;
    }
    const coordinator = new StreamRecoveryCoordinator({
        mode: options.mode,
        maxAttempts: options.maxAttempts,
        signal: options.signal,
        initialAttempt,
        attemptFactory: openAttempt,
        delayFn: async (failedAttemptIndex, recoverySignal, failure) => {
            const { context, phase, failureClass } = recordFailure(failure);
            const failureCount = options.priorStreamFailures + failedAttemptIndex;
            const delayMs = options.retryDelay(failureCount);
            await options.wait(delayMs, recoverySignal);
            const currentAccount = context.resolvedAccount ?? context.attemptedAccount;
            let selectionReason;
            if (failureCount === 1 && failureClass !== 'quota_or_rate_limit') {
                nextAccount = currentAccount;
                selectionReason = 'first_stream_retry_reuses_current_account';
            }
            else {
                const alternative = await options.selectAlternativeAccount(failedAccountIds);
                if (alternative && !failedAccountIds.has(alternative.id)) {
                    nextAccount = alternative;
                    selectionReason = 'selected_untried_account';
                }
                else {
                    nextAccount = currentAccount;
                    selectionReason = alternative
                        ? 'selector_returned_excluded_account'
                        : 'all_candidate_accounts_excluded';
                }
            }
            logger.warn('Kiro SDK event stream iteration failed', attemptLogDetails(context, phase, failure, {
                outcome: 'retrying',
                platform: process.platform,
                nextAttempt: failureCount + 1,
                delayMs,
                nextAccountAlias: accountLogAlias(nextAccount.id),
                failedAccountAliases: [...failedAccountIds].map(accountLogAlias),
                selectionReason
            }));
        },
        mapError: (error) => {
            const { context, phase } = recordFailure(error);
            logger.error('Kiro SDK event stream iteration failed', attemptLogDetails(context, phase, error, {
                outcome: 'terminated_after_output',
                platform: process.platform,
                emittedOutput: true
            }));
            return new UpstreamUnexpectedError(error, true);
        },
        encodeChunk: encodeSseChunk,
        onComplete: async (completion) => {
            const attempt = completedAttempt;
            if (!attempt)
                throw new Error('No completed Kiro recovery attempt is available');
            await attempt.complete(completion);
            if (options.priorStreamFailures > 0 || completion.recoveryTier !== 'none') {
                logger.log('Kiro SDK event stream retry recovered', attemptLogDetails(getCurrentAttempt(), 'completed', undefined, {
                    outcome: 'recovered',
                    attempts: options.priorStreamFailures + completion.attemptIndex,
                    ...(emptyCleanEofRetried ? { recoveryTrigger: 'clean_eof_empty_response' } : {})
                }));
            }
        },
        onReplayAttempt: (telemetry, failure) => {
            const context = getCurrentAttempt();
            if (failure !== undefined)
                recordFailure(failure);
            logger.log('Kiro exact replay attempt finished', attemptLogDetails(context, failure === undefined ? 'exact_replay' : failurePhase(context), failure, {
                ...telemetry,
                quotaNote: 'each exact replay attempt consumes one real SDK send'
            }));
        },
        onEmptyCleanEofRetry: (telemetry) => {
            emptyCleanEofRetried = true;
            logger.warn(STREAM_EMPTY_CLEAN_EOF_RETRY_LOG, attemptLogDetails(getCurrentAttempt(), 'reasoning_restart', undefined, {
                outcome: 'retrying',
                recoveryTrigger: 'clean_eof_empty_response',
                nextAttempt: options.priorStreamFailures + telemetry.attemptIndex + 1,
                quotaNote: 'the one empty clean EOF retry consumes one real SDK send'
            }));
        },
        onTerminal: finishTerminal,
        onCancel: options.onCancel
    });
    return new Response(coordinator.stream, {
        headers: { 'Content-Type': 'text/event-stream' }
    });
}
