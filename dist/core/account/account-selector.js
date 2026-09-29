import * as logger from '../../plugin/logger.js';
export class AccountSelector {
    accountManager;
    config;
    syncFromKiroCli;
    repository;
    accountRefreshService;
    triedEmptySync = false;
    circuitBreakerTrips = 0;
    lastCircuitBreakerReset = Date.now();
    constructor(accountManager, config, syncFromKiroCli, repository, accountRefreshService) {
        this.accountManager = accountManager;
        this.config = config;
        this.syncFromKiroCli = syncFromKiroCli;
        this.repository = repository;
        this.accountRefreshService = accountRefreshService;
    }
    async selectHealthyAccount(showToast, signal) {
        this.checkCircuitBreaker();
        let count = this.accountManager.getAccountCount();
        if (count === 0 && this.config.auto_sync_kiro_cli && !this.triedEmptySync) {
            this.triedEmptySync = true;
            await this.handleEmptyAccounts();
            count = this.accountManager.getAccountCount();
        }
        if (count === 0) {
            throw new Error('No accounts');
        }
        let acc = this.accountManager.getCurrentOrNext();
        if (!acc) {
            this.circuitBreakerTrips++;
            if (this.accountManager.allSelectableBlockedByOverage()) {
                throw new Error('All accounts have exceeded their free quota and entered paid overage. Set "stop_on_overage": false in ~/.config/opencode/kiro-auth-plugin/kiro.json to continue with paid overage, or wait for the quota to reset.');
            }
            const wait = this.accountManager.getMinWaitTime();
            if (wait > 0 && wait < 30000) {
                if (this.accountManager.shouldShowToast()) {
                    showToast(`All accounts rate-limited. Waiting ${Math.ceil(wait / 1000)}s...`, 'warning');
                }
                await this.sleep(wait, signal);
                return null;
            }
            throw new Error('All accounts are unhealthy or rate-limited: reauth required');
        }
        this.resetCircuitBreaker();
        const used = acc.usedCount ?? 0;
        const limit = acc.limitCount ?? 0;
        if (limit > 0 && used / limit >= 0.9 && this.accountManager.shouldShowUsageToast()) {
            showToast(this.formatUsageMessage(used, limit, acc.email || ''), 'warning');
        }
        return acc;
    }
    async selectAlternativeAccount(excludedIds, signal) {
        if (this.config.refresh_before_switch_enabled !== false && this.accountRefreshService) {
            try {
                await this.accountRefreshService.refreshAll({
                    force: false,
                    deadlineMs: this.config.refresh_all_deadline_ms ?? 5000,
                    signal
                });
            }
            catch (error) {
                logger.warn('Kiro pre-switch account refresh failed; selecting with cached usage', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        return this.accountManager.getCurrentOrNext({ excludedIds, recoverUnhealthy: false });
    }
    async handleEmptyAccounts() {
        await this.syncFromKiroCli();
        this.repository.invalidateCache();
        const accounts = await this.repository.findAll();
        for (const a of accounts) {
            this.accountManager.addAccount(a);
        }
    }
    formatUsageMessage(usedCount, limitCount, email) {
        if (limitCount > 0) {
            const percentage = Math.round((usedCount / limitCount) * 100);
            return `Usage (${email}): ${usedCount}/${limitCount} (${percentage}%)`;
        }
        return `Usage (${email}): ${usedCount}`;
    }
    checkCircuitBreaker() {
        if (Date.now() - this.lastCircuitBreakerReset > 60000) {
            this.circuitBreakerTrips = 0;
            this.lastCircuitBreakerReset = Date.now();
        }
        if (this.circuitBreakerTrips >= 10) {
            throw new Error('Circuit breaker tripped: Too many consecutive failures selecting accounts');
        }
    }
    resetCircuitBreaker() {
        if (this.circuitBreakerTrips > 0) {
            this.circuitBreakerTrips = 0;
            this.lastCircuitBreakerReset = Date.now();
        }
    }
    sleep(ms, signal) {
        if (signal?.aborted)
            return Promise.reject(signal.reason);
        let onAbort;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, ms);
            onAbort = () => {
                clearTimeout(timer);
                reject(signal?.reason);
            };
            signal?.addEventListener('abort', onAbort, { once: true });
        }).finally(() => {
            if (onAbort)
                signal?.removeEventListener('abort', onAbort);
        });
    }
}
