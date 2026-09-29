import { RegionSchema } from '../../plugin/config/schema.js';
import { isRefreshTokenDead } from '../../plugin/health.js';
import * as logger from '../../plugin/logger.js';
import { PLUGIN_VERSION } from '../../version.js';
import { IdcAuthMethod } from './idc-auth-method.js';
import { isInteractiveTty, ttyConfirm, ttySelect } from './tty-menu.js';
const USAGE_TOAST_DELAY_MS = 3000;
function hasUnref(timer) {
    return typeof timer === 'object' && timer !== null && 'unref' in timer;
}
function scheduleUsageToast(showToast, message, variant) {
    const timer = setTimeout(() => showToast(message, variant), USAGE_TOAST_DELAY_MS);
    if (hasUnref(timer))
        timer.unref();
}
export class AuthHandler {
    config;
    repository;
    accountManager;
    accountRefreshService;
    constructor(config, repository) {
        this.config = config;
        this.repository = repository;
    }
    async initialize(showToast) {
        const { syncFromKiroCli } = await import('../../plugin/sync/kiro-cli.js');
        logger.log('Auth init', { autoSyncKiroCli: !!this.config.auto_sync_kiro_cli });
        if (this.config.auto_sync_kiro_cli) {
            logger.log('Kiro CLI sync: start');
            await syncFromKiroCli();
            this.repository.invalidateCache();
            const accounts = await this.repository.findAll();
            if (this.accountManager) {
                for (const a of accounts)
                    this.accountManager.addAccount(a);
            }
            logger.log('Kiro CLI sync: done', { importedAccounts: accounts.length });
        }
        this.logUsageSummary(showToast);
    }
    logUsageSummary(showToast) {
        if (!this.accountManager)
            return;
        const accounts = this.accountManager.getAccounts();
        if (!accounts.length)
            return;
        const toastEntries = [];
        for (const acc of accounts) {
            const used = acc.usedCount ?? 0;
            const limit = acc.limitCount ?? 0;
            if (limit > 0) {
                const pct = Math.round((used / limit) * 100);
                const msg = `Kiro usage (${acc.email}): ${used}/${limit} (${pct}%)`;
                logger.log(msg);
                toastEntries.push({ message: msg, variant: pct >= 90 ? 'warning' : 'info' });
            }
            else if (used > 0) {
                const msg = `Kiro usage (${acc.email}): ${used} requests used`;
                logger.log(msg);
                toastEntries.push({ message: msg, variant: 'info' });
            }
        }
        if (!showToast || toastEntries.length === 0)
            return;
        if (toastEntries.length === 1) {
            const entry = toastEntries[0];
            scheduleUsageToast(showToast, entry.message, entry.variant);
            return;
        }
        const warningCount = toastEntries.filter((entry) => entry.variant === 'warning').length;
        const warningSuffix = warningCount > 0 ? `; ${warningCount} at or above 90%` : '';
        scheduleUsageToast(showToast, `Kiro usage: ${toastEntries.length}/${accounts.length} accounts tracked${warningSuffix}`, warningCount > 0 ? 'warning' : 'info');
    }
    setAccountManager(am) {
        this.accountManager = am;
    }
    setAccountRefreshService(accountRefreshService) {
        this.accountRefreshService = accountRefreshService;
    }
    /** Summarize stored accounts for a label; guards limit=0 divide-by-zero. */
    buildUsageSummary(accounts) {
        if (!accounts.length)
            return '';
        const CAP = 3;
        const parts = accounts.slice(0, CAP).map((acc) => {
            const email = acc.email || 'unknown';
            const used = acc.usedCount ?? 0;
            const limit = acc.limitCount ?? 0;
            const marker = isRefreshTokenDead(acc.unhealthyReason) ? ' (needs re-login)' : '';
            if (limit > 0) {
                const pct = Math.round((used / limit) * 100);
                return `${email} ${used}/${limit} (${pct}%)${marker}`;
            }
            return `${email} ${used} used${marker}`;
        });
        const remaining = accounts.length - Math.min(accounts.length, CAP);
        const body = remaining > 0 ? `${parts.join(' · ')} +${remaining} more` : parts.join(' · ');
        return `[current: ${body}]`;
    }
    /** Format a single account as a select-option label for the remove flow. */
    formatAccountOption(acc) {
        const email = acc.email || 'unknown';
        const used = acc.usedCount ?? 0;
        const limit = acc.limitCount ?? 0;
        const region = acc.region || 'unknown-region';
        const health = acc.isHealthy ? 'healthy' : 'unhealthy';
        return `${email} — ${used}/${limit} (${region}, ${health})`;
    }
    getMethods() {
        if (!this.accountManager) {
            return [];
        }
        const currentAccounts = this.accountManager.getAccounts?.() ?? [];
        const usageSummary = this.buildUsageSummary(currentAccounts);
        const firstLabelBase = `Add account · AWS Builder ID / IAM Identity Center · plugin v${PLUGIN_VERSION}`;
        const firstLabel = usageSummary ? `${firstLabelBase}  ${usageSummary}` : firstLabelBase;
        const idcMethod = new IdcAuthMethod(this.config, this.repository, this.accountManager);
        const configStartUrl = this.config.idc_start_url;
        const configRegion = this.config.idc_region;
        const methods = [
            {
                label: firstLabel,
                type: 'oauth',
                prompts: [
                    {
                        type: 'text',
                        key: 'start_url',
                        message: configStartUrl
                            ? `IAM Identity Center Start URL (current: ${configStartUrl}, leave blank to keep)`
                            : 'IAM Identity Center Start URL (leave blank for AWS Builder ID)',
                        placeholder: 'https://your-company.awsapps.com/start',
                        validate: (value) => {
                            if (!value)
                                return undefined;
                            try {
                                new URL(value);
                                return undefined;
                            }
                            catch {
                                return 'Please enter a valid URL';
                            }
                        }
                    },
                    {
                        type: 'text',
                        key: 'idc_region',
                        message: configRegion && configRegion !== 'us-east-1'
                            ? `IAM Identity Center region (sso_region) (current: ${configRegion}, leave blank to keep)`
                            : 'IAM Identity Center region (sso_region) (leave blank for us-east-1)',
                        placeholder: 'us-east-1',
                        validate: (value) => {
                            if (!value)
                                return undefined;
                            return RegionSchema.safeParse(value.trim()).success
                                ? undefined
                                : 'Please enter a valid AWS region';
                        }
                    }
                ],
                authorize: (inputs) => idcMethod.authorize(inputs)
            },
            {
                label: 'Add account · IAM Identity Center (with Profile ARN)',
                type: 'oauth',
                prompts: [
                    {
                        type: 'text',
                        key: 'start_url',
                        message: configStartUrl
                            ? `IAM Identity Center Start URL (current: ${configStartUrl}, leave blank to keep)`
                            : 'IAM Identity Center Start URL (leave blank for AWS Builder ID)',
                        placeholder: 'https://your-company.awsapps.com/start',
                        validate: (value) => {
                            if (!value)
                                return undefined;
                            try {
                                new URL(value);
                                return undefined;
                            }
                            catch {
                                return 'Please enter a valid URL';
                            }
                        }
                    },
                    {
                        type: 'text',
                        key: 'idc_region',
                        message: configRegion && configRegion !== 'us-east-1'
                            ? `IAM Identity Center region (sso_region) (current: ${configRegion}, leave blank to keep)`
                            : 'IAM Identity Center region (sso_region) (leave blank for us-east-1)',
                        placeholder: 'us-east-1',
                        validate: (value) => {
                            if (!value)
                                return undefined;
                            return RegionSchema.safeParse(value.trim()).success
                                ? undefined
                                : 'Please enter a valid AWS region';
                        }
                    },
                    {
                        type: 'text',
                        key: 'profile_arn',
                        message: this.config.idc_profile_arn
                            ? `Profile ARN (current: ${this.config.idc_profile_arn}, leave blank to keep)`
                            : 'Profile ARN (e.g. arn:aws:codewhisperer:eu-central-1:428597928572:profile/HE7XVERQ9VXW)',
                        placeholder: 'arn:aws:codewhisperer:us-east-1:123456789012:profile/XXXXXXXXXX',
                        validate: (value) => {
                            if (!value && this.config.idc_profile_arn)
                                return undefined;
                            if (!value)
                                return 'Profile ARN is required for this method';
                            return value.startsWith('arn:aws:codewhisperer:') ||
                                value.startsWith('arn:aws:qdeveloper:')
                                ? undefined
                                : 'Please enter a valid CodeWhisperer or Q Developer profile ARN';
                        }
                    }
                ],
                authorize: (inputs) => idcMethod.authorize(inputs)
            }
        ];
        // Account-management methods must be `type:'oauth'`, not `type:'api'`:
        // OpenCode forces an "Enter your API key" prompt for `api` methods.
        methods.push({
            label: 'Refresh all accounts · tokens + usage',
            type: 'oauth',
            authorize: async () => this.authorizeRefreshAllAccounts()
        });
        methods.push({
            label: 'Manage accounts',
            type: 'oauth',
            authorize: async () => this.authorizeRemoveAccounts()
        });
        return methods;
    }
    formatRefreshHeadline(summary) {
        if (summary.skippedReason === 'cooldown')
            return 'Refresh skipped: cooldown is still active.';
        if (summary.skippedReason === 'lock_unavailable') {
            return 'Refresh skipped: another process is already refreshing accounts.';
        }
        return `Refreshed ${summary.totalAccounts} accounts · ${summary.tokenRenewed} token renewed · ${summary.usageUpdated} usage updated · ${summary.failed} failed`;
    }
    printRefreshSummary(summary) {
        process.stdout.write(`${this.formatRefreshHeadline(summary)}\n`);
        for (const account of summary.accounts) {
            const error = account.error ? ` · ${account.error}` : '';
            process.stdout.write(`- ${account.email} — ${account.before.usedCount}/${account.before.limitCount} → ` +
                `${account.after.usedCount}/${account.after.limitCount} · token ${account.tokenStatus} · ` +
                `usage ${account.usageStatus}${error}\n`);
        }
        if (summary.proceededWithoutLock) {
            process.stdout.write('Note: refresh proceeded without the shared keep-alive lock.\n');
        }
    }
    async authorizeRefreshAllAccounts() {
        const accounts = this.accountManager?.getAccounts?.() ?? [];
        if (accounts.length === 0) {
            return this.endWithoutCredential('No accounts to refresh.');
        }
        if (!this.accountRefreshService) {
            logger.error('Kiro account refresh service is unavailable');
            return this.endWithoutCredential('Account refresh is unavailable.');
        }
        const summary = await this.accountRefreshService.refreshAll({ force: true });
        this.printRefreshSummary(summary);
        return this.endWithRemainingCredentialOrFailed(this.formatRefreshHeadline(summary));
    }
    /** Ends the auth flow cleanly with no key prompt and no credential written. */
    endWithoutCredential(instructions) {
        return {
            url: '',
            instructions,
            method: 'auto',
            callback: async () => ({ type: 'failed' })
        };
    }
    /**
     * Ends the flow after a successful deletion. If a healthy account (or any
     * account with a usable access token) remains, returns a SUCCESS callback
     * keyed on that account's token so OpenCode shows success and persists a
     * still-valid credential. If nothing usable remains, falls back to a failed
     * callback (nothing left to authorize with).
     */
    endWithRemainingCredentialOrFailed(instructions) {
        const remaining = this.accountManager?.getAccounts?.() ?? [];
        const hasToken = (acc) => typeof acc?.accessToken === 'string' && acc.accessToken.length > 0;
        const fallback = remaining.find((acc) => acc?.isHealthy && hasToken(acc)) ??
            remaining.find((acc) => hasToken(acc));
        if (fallback) {
            const key = fallback.accessToken;
            return {
                url: '',
                instructions: `${instructions} Using ${fallback.email || 'a remaining account'} for future requests.`,
                method: 'auto',
                callback: async () => ({ type: 'success', key })
            };
        }
        return this.endWithoutCredential(`${instructions} No accounts remain — run \`opencode auth login\` to reauthenticate.`);
    }
    /**
     * Self-drawn account-management flow. No-op paths end with method:'auto' + a
     * failed callback so no key prompt appears. Successful refresh/delete paths
     * end with a remaining-account credential so OpenCode reports success.
     */
    async authorizeRemoveAccounts() {
        const accounts = this.accountManager?.getAccounts?.() ?? [];
        if (accounts.length === 0) {
            logger.log('Manage Kiro accounts: no accounts');
            return this.endWithoutCredential('No accounts to manage.');
        }
        if (!isInteractiveTty()) {
            logger.log('Manage Kiro accounts: non-TTY, skipping interactive menu');
            const sqliteHint = 'sqlite3 ~/.config/opencode/kiro.db "DELETE FROM accounts WHERE email=\'<email>\';"';
            return this.endWithoutCredential('Account management requires an interactive terminal. Run `opencode auth login` ' +
                `in a TTY, or remove via: ${sqliteHint}`);
        }
        const items = accounts.map((acc) => ({
            label: this.formatAccountOption(acc),
            value: acc
        }));
        items.push({ label: 'Cancel', value: null });
        const target = await ttySelect(items, { message: 'Select an account' });
        if (!target) {
            logger.log('Manage Kiro accounts: cancelled (no-op)');
            return this.endWithoutCredential('Cancelled. No account changed.');
        }
        const action = await ttySelect([
            { label: 'Refresh token & usage', value: 'refresh' },
            { label: 'Delete account', value: 'delete' },
            { label: 'Cancel', value: 'cancel' }
        ], { message: `Manage ${target.email || 'this account'}` });
        if (!action || action === 'cancel') {
            logger.log('Manage Kiro accounts: action cancelled (no-op)');
            return this.endWithoutCredential('Cancelled. No account changed.');
        }
        if (action === 'refresh') {
            if (!this.accountRefreshService) {
                logger.error('Kiro account refresh service is unavailable');
                return this.endWithoutCredential('Account refresh is unavailable.');
            }
            const summary = await this.accountRefreshService.refreshAccount(String(target.id), {
                force: true
            });
            this.printRefreshSummary(summary);
            const refreshedAccounts = this.accountManager?.getAccounts?.() ?? [];
            const refreshed = refreshedAccounts.find((account) => account.id === target.id) ?? target;
            process.stdout.write(`${this.formatAccountOption(refreshed)}\n`);
            return this.endWithRemainingCredentialOrFailed(this.formatRefreshHeadline(summary));
        }
        const confirmed = await ttyConfirm(`Delete ${target.email || 'this account'}?`);
        if (!confirmed) {
            logger.log('Remove Kiro account: delete not confirmed (no-op)');
            return this.endWithoutCredential('Cancelled. No account removed.');
        }
        this.accountManager.removeAccount(target);
        logger.log('Removed Kiro account', { email: target.email, accountId: String(target.id) });
        process.stdout.write('Account deleted.\n');
        return this.endWithRemainingCredentialOrFailed(`Account deleted: ${target.email || 'unknown'}.`);
    }
}
