export { KiroOAuthPlugin } from './plugin.js';
export { KiroV2Plugin } from './plugin/v2.js';
export default {
    ...(await import('./plugin/v2.js')).KiroV2Plugin,
    id: 'kiro-auth',
    server: (await import('./plugin.js')).KiroOAuthPlugin
};
