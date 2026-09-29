/**
 * Coordinates one outbound SSE byte stream across transformed OpenAI-chunk iterators from
 * multiple SDK attempts. Attempts stay pre-SSE-encoding so each attempt keeps its own
 * transformer, EmittedOutputAccumulator, and StreamObserver; the caller injects the existing
 * SSE encoder at the sole publication point. A terminal chunk and every chunk after it are
 * withheld until that attempt drains cleanly, preventing failed attempts from publishing a
 * synthetic success before recovery starts.
 */
import { EmittedOutputAccumulator } from '../../plugin/reasoning/emitted-output.js';
import { ExactReplayMatcher } from './replay-matcher.js';
export function decideRecoveryTier(input) {
    const reasoningRestartEligible = input.emitted.visibleChars === 0 && input.emitted.toolCount === 0 && !input.sawToolIntent;
    switch (input.mode) {
        case 'off':
            return 'none';
        case 'reasoning_restart':
            return reasoningRestartEligible ? 'reasoning_restart' : 'none';
        case 'exact_replay':
            if (reasoningRestartEligible)
                return 'reasoning_restart';
            return input.emitted.visibleChars > 0 || input.emitted.toolCount > 0 ? 'exact_replay' : 'none';
        default:
            return assertNever(input.mode);
    }
}
function assertNever(value) {
    throw new TypeError(`Unexpected stream recovery mode: ${String(value)}`);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isTerminalChunk(chunk) {
    if (!isRecord(chunk))
        return false;
    const choices = chunk['choices'];
    if (!Array.isArray(choices))
        return false;
    const first = choices[0];
    if (!isRecord(first))
        return false;
    return first['finish_reason'] !== null && first['finish_reason'] !== undefined;
}
function abortReason(signal) {
    return signal.reason ?? new DOMException('The request was aborted', 'AbortError');
}
function errorFrom(failure) {
    return failure instanceof Error
        ? failure
        : new TypeError('Stream attempt rejected with a non-Error value', { cause: failure });
}
class ReplayDivergenceError extends Error {
    channel;
    name = 'ReplayDivergenceError';
    constructor(channel) {
        super(`Exact replay diverged in the ${channel} channel`);
        this.channel = channel;
    }
}
export class StreamRecoveryCoordinator {
    stream;
    options;
    activeAttempt;
    attemptIndex = 0;
    delivered = new EmittedOutputAccumulator();
    sawToolIntent = false;
    activeRecoveryTier = 'none';
    replayMatcher;
    emptyCleanEofRetryUsed = false;
    terminal = false;
    completionFired = false;
    abortListener;
    pendingTerminalChunks = [];
    pendingDeliveryChunks = [];
    constructor(options) {
        if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) {
            throw new RangeError('maxAttempts must be a positive integer');
        }
        this.options = options;
        if (options.initialAttempt) {
            this.activeAttempt = options.initialAttempt;
            this.attemptIndex = 1;
        }
        this.stream = new ReadableStream({
            start: (controller) => this.start(controller),
            pull: (controller) => this.pull(controller),
            cancel: (reason) => this.cancel(reason)
        }, { highWaterMark: 0 });
    }
    start(controller) {
        this.abortListener = () => {
            if (this.terminal)
                return;
            const reason = abortReason(this.options.signal);
            this.finish('caller_abort');
            controller.error(reason);
            void this.closeActiveAttempt();
        };
        if (this.options.signal.aborted)
            this.abortListener();
        else
            this.options.signal.addEventListener('abort', this.abortListener, { once: true });
    }
    async pull(controller) {
        if (this.terminal)
            return;
        try {
            await this.publishNext(controller);
        }
        catch (failure) {
            const error = failure instanceof Error ? failure : errorFrom(failure);
            if (this.terminal)
                return;
            await this.closeActiveAttempt();
            if (this.terminal)
                return;
            this.finish('coordinator_failure');
            controller.error(this.options.signal.aborted ? abortReason(this.options.signal) : error);
        }
    }
    async publishNext(controller) {
        while (!this.terminal) {
            if (this.options.signal.aborted)
                throw abortReason(this.options.signal);
            if (!this.activeAttempt) {
                const ready = await this.openAttemptOrRecover(controller);
                if (!ready)
                    return;
            }
            const attempt = this.activeAttempt;
            if (!attempt)
                continue;
            const pending = this.pendingDeliveryChunks.shift();
            if (pending !== undefined) {
                if (this.publishChunk(pending, controller))
                    return;
                continue;
            }
            let item;
            try {
                item = await attempt.chunks.next();
            }
            catch (failure) {
                const error = failure instanceof Error ? failure : errorFrom(failure);
                if (!(await this.recoverOrTerminate(error, attempt, controller)))
                    return;
                continue;
            }
            if (this.terminal)
                return;
            if (item.done) {
                if (this.replayMatcher) {
                    const failure = new ReplayDivergenceError('early_end');
                    this.reportReplayAttempt('diverged', 'early_end', failure);
                    if (!(await this.recoverOrTerminate(failure, attempt, controller))) {
                        return;
                    }
                    continue;
                }
                const observation = attempt.observed();
                const emptyCleanEofRetry = this.emptyCleanEofRetryTelemetry(observation);
                if (emptyCleanEofRetry) {
                    if (!(await this.retryEmptyCleanEof(observation, emptyCleanEofRetry)))
                        return;
                    continue;
                }
                await this.complete(controller);
                return;
            }
            const match = this.replayMatcher?.consume(item.value);
            if (match?.kind === 'withheld')
                continue;
            if (match?.kind === 'diverged') {
                const failure = new ReplayDivergenceError(match.channel);
                this.reportReplayAttempt('diverged', match.channel, failure);
                if (!(await this.recoverOrTerminate(failure, attempt, controller))) {
                    return;
                }
                continue;
            }
            if (match?.kind === 'release') {
                if (match.caughtUp)
                    this.reportReplayAttempt('caught_up', 'none');
                this.pendingDeliveryChunks.push(...match.chunks);
                continue;
            }
            if (this.publishChunk(item.value, controller))
                return;
        }
    }
    publishChunk(chunk, controller) {
        if (this.pendingTerminalChunks.length > 0 || isTerminalChunk(chunk)) {
            this.pendingTerminalChunks.push(chunk);
            return false;
        }
        this.delivered.observeChunk(chunk);
        controller.enqueue(this.options.encodeChunk(chunk));
        return true;
    }
    async openAttemptOrRecover(controller) {
        this.attemptIndex++;
        try {
            const attempt = await this.options.attemptFactory(this.attemptIndex);
            if (this.terminal || this.options.signal.aborted) {
                await Promise.allSettled([attempt.close()]);
                return false;
            }
            this.activeAttempt = attempt;
            return true;
        }
        catch (failure) {
            const error = failure instanceof Error ? failure : errorFrom(failure);
            if (this.replayMatcher && !this.options.signal.aborted) {
                this.reportReplayAttempt('failed', 'none', error);
            }
            return this.recoverOrTerminate(error, undefined, controller);
        }
    }
    async recoverOrTerminate(failure, failedAttempt, controller) {
        if (this.terminal)
            return false;
        if (failedAttempt)
            this.mergeObservation(failedAttempt.observed());
        if (this.replayMatcher && !this.options.signal.aborted) {
            this.reportReplayAttempt('failed', 'none', failure);
        }
        this.pendingTerminalChunks.length = 0;
        this.pendingDeliveryChunks.length = 0;
        await this.closeActiveAttempt();
        if (this.terminal)
            return false;
        const tier = decideRecoveryTier({
            mode: this.options.mode,
            emitted: {
                visibleChars: this.delivered.visibleText.length,
                toolCount: this.delivered.toolUses().length
            },
            sawToolIntent: this.sawToolIntent
        });
        if (tier === 'none' || this.attemptIndex >= this.options.maxAttempts) {
            this.finish(this.attemptIndex >= this.options.maxAttempts
                ? 'attempt_budget_exhausted'
                : 'recovery_unavailable');
            controller.error(this.options.mapError(failure));
            return false;
        }
        this.activeRecoveryTier = tier;
        if (tier === 'exact_replay') {
            this.replayMatcher = new ExactReplayMatcher({
                reasoningText: this.delivered.reasoningText,
                visibleText: this.delivered.visibleText,
                toolUses: this.delivered.toolUses()
            });
        }
        await this.options.delayFn(this.attemptIndex, this.options.signal, failure);
        return !this.terminal;
    }
    emptyCleanEofRetryTelemetry(observation) {
        if (this.options.mode === 'off' ||
            this.emptyCleanEofRetryUsed ||
            this.attemptIndex >= this.options.maxAttempts ||
            observation.terminalSource !== 'clean_eof_without_completion_metadata' ||
            observation.emitted.visibleChars !== 0 ||
            observation.emitted.toolCount !== 0 ||
            this.delivered.visibleText.length !== 0 ||
            this.delivered.toolUses().length !== 0 ||
            observation.sawToolIntent ||
            this.sawToolIntent) {
            return null;
        }
        return { attemptIndex: this.attemptIndex };
    }
    async retryEmptyCleanEof(observation, telemetry) {
        this.emptyCleanEofRetryUsed = true;
        this.mergeObservation(observation);
        this.pendingTerminalChunks.length = 0;
        this.pendingDeliveryChunks.length = 0;
        await this.closeActiveAttempt();
        if (this.terminal)
            return false;
        this.activeRecoveryTier = 'reasoning_restart';
        await this.options.onEmptyCleanEofRetry?.(telemetry);
        return !this.terminal;
    }
    mergeObservation(observation) {
        this.sawToolIntent ||= observation.sawToolIntent;
    }
    reportReplayAttempt(replayOutcome, divergenceChannel, failure) {
        const matcher = this.replayMatcher;
        if (!matcher)
            return;
        this.options.onReplayAttempt?.({
            ...matcher.progress(),
            divergenceChannel,
            replayOutcome,
            attempts: this.attemptIndex
        }, failure);
        this.replayMatcher = undefined;
    }
    async complete(controller) {
        const succeededAttempt = this.attemptIndex;
        await this.closeActiveAttempt();
        if (this.terminal)
            return;
        if (!this.completionFired) {
            this.completionFired = true;
            await this.options.onComplete({
                attemptIndex: succeededAttempt,
                recoveryTier: this.activeRecoveryTier,
                // Tier A concatenates unrelated reasoning attempts, so its envelope cannot
                // describe the delivered output. Exact replay matched every delivered channel;
                // prefix + suffix equals the successful replay itself, making its envelope safe.
                recovered: this.activeRecoveryTier === 'reasoning_restart'
            });
        }
        if (this.terminal)
            return;
        for (const chunk of this.pendingTerminalChunks) {
            controller.enqueue(this.options.encodeChunk(chunk));
        }
        this.pendingTerminalChunks.length = 0;
        this.finish('completed');
        controller.close();
    }
    async cancel(reason) {
        if (this.terminal)
            return;
        // Let the owner abort its request signal before terminal logging runs, so a
        // consumer cancellation is recorded as caller_abort rather than a transport end.
        this.options.onCancel?.(reason);
        const closing = this.closeActiveAttempt();
        this.finish('consumer_cancel');
        await closing;
    }
    async closeActiveAttempt() {
        const attempt = this.activeAttempt;
        this.activeAttempt = undefined;
        if (!attempt)
            return;
        await Promise.allSettled([attempt.close()]);
    }
    finish(reason) {
        if (this.terminal)
            return;
        this.terminal = true;
        if (this.abortListener) {
            this.options.signal.removeEventListener('abort', this.abortListener);
            this.abortListener = undefined;
        }
        this.options.onTerminal(reason);
    }
}
