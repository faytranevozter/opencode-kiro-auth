import { accessTokenExpired } from '../../kiro/auth.js';
import { isPermanentError } from '../../plugin/health.js';
import * as logger from '../../plugin/logger.js';
import { tryAcquireKeepAliveLock } from '../../plugin/storage/locked-operations.js';
const INITIAL_TICK_DELAY_MS = 5000;
const noopToast = () => { };
function hasUnref(timer) {
    return typeof timer === 'object' && timer !== null && 'unref' in timer;
}
function unrefTimer(timer) {
    if (hasUnref(timer)) {
        timer.unref();
    }
}
function normalizeError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
export class KeepAliveController {
    config;
    accountManager;
    tokenRefresher;
    repository;
    initialDelayTimer = null;
    intervalTimer = null;
    running = false;
    disposed = false;
    activeLeaderLockRelease = null;
    constructor(config, accountManager, tokenRefresher, repository) {
        this.config = config;
        this.accountManager = accountManager;
        this.tokenRefresher = tokenRefresher;
        this.repository = repository;
    }
    start() {
        if (!this.config.token_keepalive_enabled) {
            return;
        }
        if (this.initialDelayTimer || this.intervalTimer) {
            return;
        }
        this.disposed = false;
        this.initialDelayTimer = setTimeout(() => {
            this.initialDelayTimer = null;
            void this.tick();
        }, INITIAL_TICK_DELAY_MS);
        this.intervalTimer = setInterval(() => {
            void this.tick();
        }, this.config.token_keepalive_interval_ms);
        unrefTimer(this.initialDelayTimer);
        unrefTimer(this.intervalTimer);
    }
    dispose() {
        this.disposed = true;
        if (this.initialDelayTimer) {
            clearTimeout(this.initialDelayTimer);
            this.initialDelayTimer = null;
        }
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }
        void this.releaseLeaderLock();
    }
    async runOnceForTest() {
        await this.tick();
    }
    async tick() {
        if (this.disposed) {
            return;
        }
        if (this.running) {
            logger.debug('Kiro token keep-alive tick skipped because previous tick is still running');
            return;
        }
        this.running = true;
        try {
            const release = await tryAcquireKeepAliveLock();
            if (!release) {
                return;
            }
            this.activeLeaderLockRelease = release;
            try {
                await this.refreshNearExpiryAccounts();
            }
            finally {
                await this.releaseLeaderLock();
            }
        }
        catch (error) {
            logger.error('Kiro token keep-alive tick failed', normalizeError(error));
        }
        finally {
            this.running = false;
        }
    }
    async refreshNearExpiryAccounts() {
        this.repository.invalidateCache();
        const accounts = this.accountManager.getAccounts();
        for (const account of accounts) {
            if (this.disposed) {
                return;
            }
            try {
                await this.refreshAccountIfNeeded(account);
            }
            catch (error) {
                logger.error('Kiro token keep-alive account refresh failed', {
                    email: account.email,
                    message: normalizeError(error).message
                });
            }
        }
    }
    async refreshAccountIfNeeded(account) {
        if (!account.isHealthy || isPermanentError(account.unhealthyReason)) {
            return;
        }
        const auth = this.accountManager.toAuthDetails(account);
        if (!accessTokenExpired(auth, this.config.token_expiry_buffer_ms)) {
            return;
        }
        await this.tokenRefresher.refreshIfNeeded(account, auth, noopToast);
    }
    async releaseLeaderLock() {
        const release = this.activeLeaderLockRelease;
        if (!release) {
            return;
        }
        this.activeLeaderLockRelease = null;
        try {
            await release();
        }
        catch (error) {
            logger.warn('Failed to release Kiro token keep-alive leader lock', normalizeError(error));
        }
    }
}
