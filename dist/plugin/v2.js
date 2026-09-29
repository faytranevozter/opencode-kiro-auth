import { Integration, Model, Plugin, Provider } from '@opencode/plugin';
import { getModelContextLimit, MODEL_MAPPING } from '../constants.js';
import { AuthHandler } from '../core/auth/auth-handler.js';
import { IdcAuthMethod } from '../core/auth/idc-auth-method.js';
import { KeepAliveController } from '../core/auth/token-keepalive.js';
import { RequestHandler } from '../core/request/request-handler.js';
import { hashDiagnosticIdentity, KIRO_DIAGNOSTIC_AGENT_HEADER, KIRO_DIAGNOSTIC_SESSION_HEADER, KIRO_DIAGNOSTIC_TRACE_HEADER, KIRO_REQUEST_KIND_HEADER } from '../core/request/request-kind.js';
import { AccountCache } from '../infrastructure/database/account-cache.js';
import { AccountRepository } from '../infrastructure/database/account-repository.js';
import { AccountManager } from './accounts.js';
import { loadConfig } from './config/index.js';
import { migrateSafeFilesIfNeeded } from './storage/migrate-layout.js';
import { startKiroBridge } from './v2-bridge.js';
const id = 'kiro-auth';
const providerID = Provider.ID.make(id);
export const KiroV2Plugin = Plugin.define({
    id,
    async setup(ctx) {
        const lifecycle = new AbortController();
        try {
            migrateSafeFilesIfNeeded();
        }
        catch (error) {
            console.warn('Kiro storage layout migration failed non-fatally:', error);
        }
        const config = loadConfig(ctx.location.directory);
        const repository = new AccountRepository(new AccountCache(60000));
        const auth = new AuthHandler(config, repository);
        const accounts = await AccountManager.loadFromDisk(config.account_selection_strategy, {
            quotaAvoidanceEnabled: config.quota_avoidance_enabled,
            quotaReserveThreshold: config.quota_reserve_threshold,
            stopOnOverage: config.stop_on_overage,
            overageThreshold: config.overage_threshold,
            distributeAcrossProcesses: config.distribute_across_processes,
            perRequestSpread: config.per_request_spread,
            invalidateAccountCache: (accountId) => repository.invalidateAccount(accountId)
        });
        auth.setAccountManager(accounts);
        const handler = new RequestHandler(accounts, config, repository, undefined, async () => {
            const attempt = await ctx.integration.oauth.connect({
                integrationID: id,
                methodID: 'builder-id'
            });
            try {
                console.info(`[kiro-auth] ${attempt.data.instructions}\n${attempt.data.url}`);
                while (Date.now() < attempt.data.time.expires) {
                    lifecycle.signal.throwIfAborted();
                    const status = await ctx.integration.oauth.status({
                        integrationID: id,
                        attemptID: attempt.data.attemptID
                    });
                    if (status.data.status === 'complete')
                        return;
                    if (status.data.status !== 'pending')
                        throw new Error('Kiro reauthentication failed or expired');
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
                throw new Error('Kiro reauthentication expired');
            }
            finally {
                await ctx.integration.oauth
                    .cancel({ integrationID: id, attemptID: attempt.data.attemptID })
                    .catch(() => { });
            }
        });
        auth.setAccountRefreshService(handler.sharedAccountRefreshService);
        const keepAlive = new KeepAliveController(config, accounts, handler.sharedTokenRefresher, repository);
        const showToast = (message) => console.info(`[kiro-auth] ${message}`);
        const bridge = await startKiroBridge(handler, showToast);
        try {
            keepAlive.start();
            await auth.initialize(showToast);
            const idc = new IdcAuthMethod(config, repository, accounts);
            await ctx.integration.transform((editor) => {
                // V2 integration methods are bound to a registered integration. The
                // provider id doubles as its integration id; account tokens stay in
                // kiro.db, which remains the authority for multi-account rotation.
                for (const [methodID, label, withProfile] of [
                    ['builder-id', 'AWS Builder ID / IAM Identity Center', false],
                    ['identity-center-profile', 'IAM Identity Center (with Profile ARN)', true]
                ]) {
                    editor.method.update({
                        integrationID: id,
                        method: {
                            id: Integration.MethodID.make(methodID),
                            type: 'oauth',
                            label,
                            form: [
                                {
                                    type: 'string',
                                    key: 'start_url',
                                    title: 'IAM Identity Center Start URL (blank for Builder ID)'
                                },
                                {
                                    type: 'string',
                                    key: 'idc_region',
                                    title: 'Identity Center region',
                                    default: config.idc_region || 'us-east-1'
                                },
                                ...(withProfile
                                    ? [
                                        {
                                            type: 'string',
                                            key: 'profile_arn',
                                            title: 'Profile ARN',
                                            required: true
                                        }
                                    ]
                                    : [])
                            ]
                        },
                        authorize: async (answer) => {
                            const inputs = Object.fromEntries(Object.entries(answer).filter((entry) => typeof entry[1] === 'string'));
                            const authorization = await idc.authorize(inputs, {
                                signal: lifecycle.signal,
                                openBrowser: false
                            });
                            return {
                                mode: 'auto',
                                url: authorization.url,
                                instructions: authorization.instructions,
                                callback: authorization.callback('').then((result) => {
                                    if (result.type !== 'success')
                                        throw new Error('Kiro authentication failed');
                                    // OpenCode stores a connection marker; kiro.db owns the real
                                    // rotating token and is never overwritten by this credential.
                                    return {
                                        type: 'oauth',
                                        methodID: Integration.MethodID.make(methodID),
                                        refresh: 'kiro-managed',
                                        access: 'kiro-managed',
                                        expires: Date.now() + 365 * 24 * 60 * 60 * 1000
                                    };
                                })
                            };
                        }
                    });
                }
                editor.update(id, (integration) => {
                    integration.name = 'Kiro';
                });
            });
            const models = Object.keys(MODEL_MAPPING)
                .filter((model) => !model.endsWith('-thinking') &&
                !model.endsWith('-1m') &&
                !model.startsWith('claude-3-7') &&
                !['nova-swe', 'gpt-oss-120b', 'minimax-m2', 'kimi-k2-thinking'].includes(model))
                .map((name) => {
                const model = Model.Info.default(providerID, Model.ID.make(name));
                return {
                    ...model,
                    name,
                    capabilities: {
                        ...model.capabilities,
                        input: (name.startsWith('gpt-') || name.startsWith('claude-') || name === 'auto'
                            ? ['text', 'image']
                            : ['text'])
                    },
                    limit: {
                        context: getModelContextLimit(name.replace(/-(low|medium|high|xhigh|max)$/, '')),
                        output: 64000
                    }
                };
            });
            // Keep effort aliases identical to V1. resolveModelVariant, rather than
            // MODEL_MAPPING, resolves these to a probe-confirmed wire model.
            for (const base of [
                'claude-sonnet-4-6',
                'claude-sonnet-5',
                'claude-opus-4-7',
                'claude-opus-4-8',
                'claude-opus-5',
                'gpt-5.6-sol',
                'gpt-5.6-terra',
                'gpt-5.6-luna'
            ]) {
                const source = models.find((model) => model.id === base);
                if (!source)
                    continue;
                for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
                    if (base === 'claude-sonnet-4-6' && effort === 'xhigh')
                        continue;
                    const alias = Model.ID.make(`${base}-${effort}`);
                    models.push({ ...source, id: alias, modelID: alias, name: `${base} (${effort})` });
                }
            }
            await ctx.provider.transform((editor) => {
                if (editor.get(id)) {
                    editor.update(id, (provider) => {
                        provider.package = '@opencode/ai/providers/openai-compatible';
                        provider.settings = {
                            ...provider.settings,
                            baseURL: bridge.baseURL,
                            apiKey: 'kiro-local'
                        };
                        provider.activation = 'enabled';
                    });
                    const existingModels = editor.get(id)?.models;
                    const missing = models.filter((model) => !existingModels?.has(model.id));
                    if (missing.length)
                        editor.models.set(id, [...(existingModels?.values() ?? []), ...missing]);
                    return;
                }
                editor.add({
                    info: {
                        ...Provider.Info.empty(providerID),
                        name: 'Kiro',
                        activation: 'enabled',
                        package: '@opencode/ai/providers/openai-compatible',
                        settings: { baseURL: bridge.baseURL, apiKey: 'kiro-local' }
                    },
                    models
                });
            });
            await ctx.session.hook('model.request', (event) => {
                if (event.model.providerID !== id)
                    return;
                if (event.kind === 'compaction')
                    event.headers[KIRO_REQUEST_KIND_HEADER] = 'compaction';
                if (config.diagnostic_log_level !== 'off') {
                    event.headers[KIRO_DIAGNOSTIC_TRACE_HEADER] = crypto.randomUUID();
                    const sessionHash = hashDiagnosticIdentity(event.sessionID);
                    const agentHash = hashDiagnosticIdentity(event.agent);
                    if (sessionHash)
                        event.headers[KIRO_DIAGNOSTIC_SESSION_HEADER] = sessionHash;
                    if (agentHash)
                        event.headers[KIRO_DIAGNOSTIC_AGENT_HEADER] = agentHash;
                }
            }, { providerID: id });
            return async () => {
                lifecycle.abort();
                keepAlive.dispose();
                await bridge.close();
            };
        }
        catch (error) {
            lifecycle.abort();
            keepAlive.dispose();
            await bridge.close();
            throw error;
        }
    }
});
