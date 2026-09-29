import type { ManagedAccount } from '../types.js'
export declare const DB_PATH: string
export interface AccountHealthSnapshot {
  readonly id: string
  readonly rateLimitResetTime: number
  readonly isHealthy: boolean
  readonly unhealthyReason?: string
  readonly recoveryTime?: number
  readonly failCount: number
}
export declare class KiroDatabase {
  private db
  private path
  constructor(path?: string)
  private withImmediateTransaction
  private init
  getAccounts(): any[]
  getDataVersion(): number
  getAccountHealthSnapshots(accountIds: readonly string[]): AccountHealthSnapshot[]
  private upsertAccountInternal
  private isRemovedSync
  private purgeRemovedAccountsSync
  upsertAccount(acc: ManagedAccount): Promise<void>
  batchUpsertAccounts(accounts: ManagedAccount[]): Promise<void>
  deleteAccount(id: string): Promise<void>
  removeAccountWithTombstone(id: string): Promise<void>
  cleanupSupersededIdentities(
    keepId: string,
    email: string,
    authMethod: string,
    profileArn: string | undefined
  ): Promise<string[]>
  addRemovedAccount(id: string): Promise<void>
  isAccountRemoved(id: string): Promise<boolean>
  clearRemovedAccount(id: string): Promise<void>
  listRemovedAccounts(): Promise<string[]>
  nextAssignmentIndex(): Promise<number>
  markAccountsUnhealthy(ids: string[], reason: string): Promise<void>
  private rowToAccount
  close(): void
}
export declare function createDatabase(path?: string): KiroDatabase
export declare const kiroDb: KiroDatabase
