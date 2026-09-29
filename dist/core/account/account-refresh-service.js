import { accessTokenExpired } from '../../kiro/auth.js';
import { isPermanentError } from '../../plugin/health.js';
import * as logger from '../../plugin/logger.js';
import { tryAcquireKeepAliveLock } from '../../plugin/storage/locked-operations.js';
import { fetchUsageLimits, updateAccountQuota } from '../../plugin/usage.js';
const USAGE_FETCH_CONCURRENCY = 4;
// Manual auth-menu refreshes get a generous bound while still guaranteeing
// that an unresponsive usage endpoint cannot freeze the TTY indefinitely.
const MANUAL_REFRESH_DEADLINE_MULTIPLIER = 6;
const noopToast = () => { };
function normalizeError(error) {
    return error instanceof Error ? error.message : String(error);
}
function createRefreshScope(parent, deadlineMs) {
    const controller = new AbortController();
    let deadlineReached = false;
    let timer;
    const abortFromParent = () => controller.abort(parent?.reason);
    if (parent?.aborted) {
        abortFromParent();
    }
    else {
        parent?.addEventListener('abort', abortFromParent, { once: true });
    }
    if (deadlineMs !== undefined) {
        timer = setTimeout(() => {
            deadlineReached = true;
            controller.abort(new DOMException('Account refresh deadline exceeded', 'TimeoutError'));
        }, deadlineMs);
    }
    return {
        signal: controller.signal,
        timedOut: () => deadlineReached,
        cleanup: () => {
            if (timer)
                clearTimeout(timer);
            parent?.removeEventListener('abort', abortFromParent);
        }
    };
}
function waitForCompletionOrAbort(operation, signal) {
    if (signal.aborted)
        return Promise.resolve(false);
    return new Promise((resolve) => {
        let settled = false;
        const finish = (completed) => {
            if (settled)
                return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            resolve(completed);
        };
        const onAbort = () => finish(false);
        signal.addEventListener('abort', onAbort, { once: true });
        operation.then(() => finish(true), (error) => {
            logger.error('Kiro account refresh pass failed', { error: normalizeError(error) });
            finish(true);
        });
    });
}
export class AccountRefreshService {
    config;
    accountManager;
    tokenRefresher;
    inFlight = new Map();
    lastSuccessfulRefreshAt = 0;
    dependencies;
    constructor(config, accountManager, tokenRefresher, dependencies = {}) {
        this.config = config;
        this.accountManager = accountManager;
        this.tokenRefresher = tokenRefresher;
        this.dependencies = {
            fetchUsageLimits: dependencies.fetchUsageLimits ?? fetchUsageLimits,
            tryAcquireKeepAliveLock: dependencies.tryAcquireKeepAliveLock ?? tryAcquireKeepAliveLock,
            now: dependencies.now ?? Date.now
        };
    }
    refreshAll(options = {}) {
        const force = options.force === true;
        // A forced pass can satisfy either caller. An automatic pass can only
        // satisfy another automatic caller because it may legitimately skip.
        const compatible = this.inFlight.get(force) ?? (!force ? this.inFlight.get(true) : undefined);
        if (compatible)
            return compatible;
        const refresh = this.runRefresh(this.accountManager.getAccounts(), options).then((summary) => {
            if (!summary.skippedReason &&
                !summary.timedOut &&
                summary.failed === 0 &&
                !options.signal?.aborted) {
                this.lastSuccessfulRefreshAt = this.dependencies.now();
            }
            return summary;
        });
        const tracked = refresh.finally(() => {
            if (this.inFlight.get(force) === tracked)
                this.inFlight.delete(force);
        });
        this.inFlight.set(force, tracked);
        return tracked;
    }
    refreshAccount(accountId, options = { force: true }) {
        const account = this.accountManager
            .getAccounts()
            .find((candidate) => candidate.id === accountId);
        return this.runRefresh(account ? [account] : [], { ...options, force: options.force ?? true });
    }
    async runRefresh(accounts, options) {
        const startedAt = this.dependencies.now();
        const force = options.force === true;
        if (!force &&
            this.lastSuccessfulRefreshAt > 0 &&
            startedAt - this.lastSuccessfulRefreshAt < this.config.refresh_all_cooldown_ms) {
            return this.emptySummary(startedAt, accounts.length, 'cooldown');
        }
        if (accounts.length === 0) {
            return this.emptySummary(startedAt, 0);
        }
        const defaultDeadlineMs = this.config.refresh_all_deadline_ms * (force ? MANUAL_REFRESH_DEADLINE_MULTIPLIER : 1);
        const scope = createRefreshScope(options.signal, options.deadlineMs ?? defaultDeadlineMs);
        let release = null;
        let lockAcquired = false;
        let proceededWithoutLock = false;
        const results = new Map();
        try {
            release = await this.dependencies.tryAcquireKeepAliveLock();
            lockAcquired = release !== null;
            if (!release && !force) {
                return this.emptySummary(startedAt, accounts.length, 'lock_unavailable');
            }
            proceededWithoutLock = !release;
            const operation = this.refreshAccounts(accounts, results, scope.signal);
            const completed = await waitForCompletionOrAbort(operation, scope.signal);
            if (!completed) {
                void operation.catch(() => { });
            }
            const timedOut = scope.timedOut();
            const terminalStatus = timedOut ? 'timeout' : 'aborted';
            for (const account of accounts) {
                if (!results.has(account.id)) {
                    results.set(account.id, this.terminalResult(account, terminalStatus, timedOut ? 'Account refresh timed out.' : 'Account refresh was aborted.'));
                }
            }
            return this.buildSummary(startedAt, accounts, results, timedOut, lockAcquired, proceededWithoutLock);
        }
        finally {
            scope.cleanup();
            if (release) {
                try {
                    await release();
                }
                catch (error) {
                    logger.warn('Failed to release Kiro account refresh leader lock', {
                        error: normalizeError(error)
                    });
                }
            }
        }
    }
    async refreshAccounts(accounts, results, signal) {
        let nextIndex = 0;
        const worker = async () => {
            while (!signal.aborted) {
                const account = accounts[nextIndex++];
                if (!account)
                    return;
                const result = await this.refreshOne(account, signal);
                results.set(account.id, result);
            }
        };
        const workerCount = Math.min(USAGE_FETCH_CONCURRENCY, accounts.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
    }
    async refreshOne(account, signal) {
        const before = this.usageCounts(account);
        let tokenStatus = 'not_needed';
        const errors = [];
        if (!account.isHealthy || isPermanentError(account.unhealthyReason)) {
            tokenStatus = 'skipped_unhealthy';
            errors.push('Token refresh skipped: account needs re-login.');
        }
        else {
            const auth = this.accountManager.toAuthDetails(account);
            if (accessTokenExpired(auth, this.config.token_expiry_buffer_ms)) {
                const previousAccessToken = account.accessToken;
                const previousExpiry = account.expiresAt;
                try {
                    const result = await this.tokenRefresher.refreshIfNeeded(account, auth, noopToast);
                    if (result.shouldContinue) {
                        tokenStatus = 'failed';
                        errors.push('Token refresh did not complete.');
                    }
                    else if (account.accessToken !== previousAccessToken ||
                        account.expiresAt !== previousExpiry) {
                        tokenStatus = 'renewed';
                    }
                }
                catch (error) {
                    tokenStatus = 'failed';
                    errors.push(`Token refresh failed: ${normalizeError(error)}`);
                }
            }
        }
        if (signal.aborted) {
            const status = signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
                ? 'timeout'
                : 'aborted';
            return {
                accountId: account.id,
                email: account.email,
                before,
                after: this.usageCounts(account),
                tokenStatus,
                usageStatus: status,
                error: [
                    ...errors,
                    status === 'timeout' ? 'Usage refresh timed out.' : 'Usage refresh aborted.'
                ].join(' ')
            };
        }
        let usageStatus = 'updated';
        try {
            const auth = this.accountManager.toAuthDetails(account);
            const usage = await this.dependencies.fetchUsageLimits(auth, signal);
            if (signal.aborted) {
                usageStatus =
                    signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
                        ? 'timeout'
                        : 'aborted';
            }
            else {
                updateAccountQuota(account, usage, this.accountManager);
            }
        }
        catch (error) {
            if (signal.aborted) {
                usageStatus =
                    signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
                        ? 'timeout'
                        : 'aborted';
            }
            else {
                usageStatus = 'failed';
                errors.push(`Usage refresh failed: ${normalizeError(error)}`);
            }
        }
        if (usageStatus === 'timeout')
            errors.push('Usage refresh timed out.');
        if (usageStatus === 'aborted')
            errors.push('Usage refresh aborted.');
        return {
            accountId: account.id,
            email: account.email,
            before,
            after: this.usageCounts(account),
            tokenStatus,
            usageStatus,
            ...(errors.length > 0 ? { error: errors.join(' ') } : {})
        };
    }
    usageCounts(account) {
        return {
            usedCount: account.usedCount ?? 0,
            limitCount: account.limitCount ?? 0
        };
    }
    terminalResult(account, status, error) {
        const counts = this.usageCounts(account);
        return {
            accountId: account.id,
            email: account.email,
            before: counts,
            after: counts,
            tokenStatus: status,
            usageStatus: status,
            error
        };
    }
    buildSummary(startedAt, accounts, results, timedOut, lockAcquired, proceededWithoutLock) {
        const accountResults = accounts.map((account) => results.get(account.id)).filter(Boolean);
        const failed = accountResults.filter((result) => !['renewed', 'not_needed'].includes(result.tokenStatus) || result.usageStatus !== 'updated').length;
        return {
            startedAt,
            completedAt: this.dependencies.now(),
            totalAccounts: accounts.length,
            tokenRenewed: accountResults.filter((result) => result.tokenStatus === 'renewed').length,
            tokenSkipped: accountResults.filter((result) => result.tokenStatus !== 'renewed').length,
            usageUpdated: accountResults.filter((result) => result.usageStatus === 'updated').length,
            failed,
            timedOut,
            lockAcquired,
            proceededWithoutLock,
            accounts: accountResults
        };
    }
    emptySummary(startedAt, totalAccounts, skippedReason) {
        return {
            startedAt,
            completedAt: this.dependencies.now(),
            totalAccounts,
            tokenRenewed: 0,
            tokenSkipped: 0,
            usageUpdated: 0,
            failed: 0,
            timedOut: false,
            ...(skippedReason ? { skippedReason } : {}),
            lockAcquired: false,
            proceededWithoutLock: false,
            accounts: []
        };
    }
}
