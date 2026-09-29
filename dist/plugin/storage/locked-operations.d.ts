import type { ManagedAccount } from '../types.js'
export { getKeepAliveLockPath, getRefreshLockPath } from '../paths.js'
type LockRelease = () => Promise<void>
export declare function withDatabaseLockSync<T>(dbPath: string, fn: () => T): T
export declare function withRefreshLock<T>(accountId: string, fn: () => Promise<T>): Promise<T>
export declare function tryAcquireKeepAliveLock(): Promise<LockRelease | null>
export declare function withKeepAliveLock<T>(fn: () => Promise<T>): Promise<T | null>
export declare function createDeterministicId(
  email: string,
  authMethod: string,
  clientId?: string,
  profileArn?: string
): string
export declare function mergeAccounts(
  existing: ManagedAccount[],
  incoming: ManagedAccount[]
): ManagedAccount[]
export declare function deduplicateAccounts(accounts: ManagedAccount[]): ManagedAccount[]
