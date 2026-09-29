import type { AccountManager } from '../../plugin/accounts.js'
import type { KiroAuthDetails, ManagedAccount } from '../../plugin/types.js'
import { fetchUsageLimits } from '../../plugin/usage.js'
import type { TokenRefresher } from '../auth/token-refresher.js'
declare const noopToast: () => void
type UsageSnapshot = Awaited<ReturnType<typeof fetchUsageLimits>>
type LockRelease = () => Promise<void>
export type RefreshAllSkipReason = 'cooldown' | 'lock_unavailable'
export type AccountTokenRefreshStatus =
  'renewed' | 'not_needed' | 'skipped_unhealthy' | 'failed' | 'timeout' | 'aborted'
export type AccountUsageRefreshStatus = 'updated' | 'failed' | 'timeout' | 'aborted'
export interface AccountRefreshResult {
  readonly accountId: string
  readonly email: string
  readonly before: {
    readonly usedCount: number
    readonly limitCount: number
  }
  readonly after: {
    readonly usedCount: number
    readonly limitCount: number
  }
  readonly tokenStatus: AccountTokenRefreshStatus
  readonly usageStatus: AccountUsageRefreshStatus
  readonly error?: string
}
export interface RefreshAllSummary {
  readonly startedAt: number
  readonly completedAt: number
  readonly totalAccounts: number
  readonly tokenRenewed: number
  readonly tokenSkipped: number
  readonly usageUpdated: number
  readonly failed: number
  readonly timedOut: boolean
  readonly skippedReason?: RefreshAllSkipReason
  readonly lockAcquired: boolean
  readonly proceededWithoutLock: boolean
  readonly accounts: readonly AccountRefreshResult[]
}
export interface RefreshAllOptions {
  readonly force?: boolean
  readonly deadlineMs?: number
  readonly signal?: AbortSignal
}
interface AccountRefreshConfig {
  readonly refresh_all_cooldown_ms: number
  readonly refresh_all_deadline_ms: number
  readonly token_expiry_buffer_ms: number
}
interface AccountRefreshManager {
  getAccounts(): ManagedAccount[]
  toAuthDetails(account: ManagedAccount): KiroAuthDetails
  updateUsage(
    id: string,
    meta: UsageSnapshot & {
      lastSync: number
    }
  ): void
}
interface TokenRefreshPort {
  refreshIfNeeded(
    account: ManagedAccount,
    auth: KiroAuthDetails,
    showToast: typeof noopToast
  ): Promise<{
    account: ManagedAccount
    shouldContinue: boolean
  }>
}
interface AccountRefreshDependencies {
  readonly fetchUsageLimits: (auth: KiroAuthDetails, signal?: AbortSignal) => Promise<UsageSnapshot>
  readonly tryAcquireKeepAliveLock: () => Promise<LockRelease | null>
  readonly now: () => number
}
export declare class AccountRefreshService {
  private readonly config
  private readonly accountManager
  private readonly tokenRefresher
  private readonly inFlight
  private lastSuccessfulRefreshAt
  private readonly dependencies
  constructor(
    config: AccountRefreshConfig,
    accountManager: AccountRefreshManager,
    tokenRefresher: TokenRefreshPort,
    dependencies?: Partial<AccountRefreshDependencies>
  )
  refreshAll(options?: RefreshAllOptions): Promise<RefreshAllSummary>
  refreshAccount(accountId: string, options?: RefreshAllOptions): Promise<RefreshAllSummary>
  private runRefresh
  private refreshAccounts
  private refreshOne
  private usageCounts
  private terminalResult
  private buildSummary
  private emptySummary
}
export type AccountRefreshServiceAccountManager = Pick<
  AccountManager,
  'getAccounts' | 'toAuthDetails' | 'updateUsage'
>
export type AccountRefreshServiceTokenRefresher = Pick<TokenRefresher, 'refreshIfNeeded'>
export {}
