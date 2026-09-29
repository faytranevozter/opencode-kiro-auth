import { homedir } from 'node:os';
import { join } from 'node:path';
export function getOpencodeConfigDir() {
    const p = process.platform;
    if (p === 'win32')
        return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'opencode');
    return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode');
}
export function getPluginDir() {
    return join(getOpencodeConfigDir(), 'kiro-auth-plugin');
}
export function getUserConfigPath() {
    return join(getPluginDir(), 'kiro.json');
}
export function getLegacyUserConfigPath() {
    return join(getOpencodeConfigDir(), 'kiro.json');
}
export function getLogsDir() {
    return join(getPluginDir(), 'logs');
}
export function getLegacyLogsDir() {
    return join(getOpencodeConfigDir(), 'kiro-logs');
}
export function getRefreshLockPath(accountId) {
    const safeAccountId = accountId.replace(/[^A-Za-z0-9_-]/g, '');
    return join(getPluginDir(), `.kiro-refresh-${safeAccountId}.lock`);
}
export function getKeepAliveLockPath() {
    return join(getPluginDir(), '.kiro-keepalive.lock');
}
export function getMigrationLockPath() {
    return join(getOpencodeConfigDir(), '.kiro-auth-migration.lock');
}
