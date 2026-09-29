import type { AccountSelectionStrategy, KiroAuthDetails, ManagedAccount } from './types.js'
export declare function createDeterministicAccountId(
  email: string,
  method: string,
  clientId?: string,
  profileArn?: string
): string
export declare class AccountManager {
  private accounts
  private cursor
  private strategy
  private lastToastTime
  private lastUsageToastTime
  private rrCursor
  private stickyId?
  private startIndex
  private perRequestSpread
  private quotaAvoidanceEnabled
  private quotaReserveThreshold
  private stopOnOverage
  private overageThreshold
  private lastHealthDataVersion
  private lastHealthRefreshAt
  private pendingHealthWriteCounts
  private healthWriteStates
  private invalidateAccountCache?
  constructor(
    accounts: ManagedAccount[],
    strategy?: AccountSelectionStrategy,
    opts?: {
      quotaAvoidanceEnabled?: boolean
      quotaReserveThreshold?: number
      stopOnOverage?: boolean
      overageThreshold?: number
      startIndex?: number
      perRequestSpread?: boolean
      invalidateAccountCache?: (accountId: string) => void
    }
  )
  static loadFromDisk(
    strategy?: AccountSelectionStrategy,
    opts?: {
      quotaAvoidanceEnabled?: boolean
      quotaReserveThreshold?: number
      stopOnOverage?: boolean
      overageThreshold?: number
      distributeAcrossProcesses?: boolean
      perRequestSpread?: boolean
      invalidateAccountCache?: (accountId: string) => void
    }
  ): Promise<AccountManager>
  getAccountCount(): number
  getAccounts(): ManagedAccount[]
  shouldShowToast(debounce?: number): boolean
  shouldShowUsageToast(debounce?: number): boolean
  getMinWaitTime(): number
  allSelectableBlockedByOverage(): boolean
  getCurrentOrNext(options?: {
    excludedIds?: ReadonlySet<string>
    recoverUnhealthy?: boolean
  }): ManagedAccount | null
  private refreshAccountHealthIfNeeded
  private applyHealthSnapshot
  private persistLocalHealthMutation
  private drainHealthWrites
  updateUsage(
    id: string,
    meta: {
      usedCount: number
      limitCount: number
      overageCount?: number
      email?: string
      lastSync?: number
    }
  ): void
  addAccount(a: ManagedAccount): void
  removeAccount(a: ManagedAccount): void
  updateFromAuth(a: ManagedAccount, auth: KiroAuthDetails): void
  createAuthCandidate(a: ManagedAccount, auth: KiroAuthDetails): ManagedAccount
  publishAuthCandidate(candidate: ManagedAccount, syncKiroCli?: boolean): void
  private writeAuthCandidateToKiroCli
  recordFailure(a: ManagedAccount): number
  markHealthy(a: ManagedAccount): void
  markRateLimited(a: ManagedAccount, ms: number): void
  markUnhealthy(a: ManagedAccount, reason: string, recovery?: number): void
  saveToDisk(): Promise<void>
  toAuthDetails(a: ManagedAccount): KiroAuthDetails
  private isOverageBlocked
}
