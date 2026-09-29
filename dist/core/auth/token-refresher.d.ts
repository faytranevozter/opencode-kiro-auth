import type { AccountRepository } from '../../infrastructure/database/account-repository.js'
import type { AccountManager } from '../../plugin/accounts.js'
import { refreshAccessToken } from '../../plugin/token.js'
import type { KiroAuthDetails, ManagedAccount } from '../../plugin/types.js'
type ToastFunction = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void
interface TokenRefresherConfig {
  token_expiry_buffer_ms: number
  auto_sync_kiro_cli: boolean
  account_selection_strategy: 'sticky' | 'round-robin' | 'lowest-usage'
}
interface TokenRefresherDependencies {
  refreshAccessToken: typeof refreshAccessToken
  sleep: (delayMs: number) => Promise<void>
  random: () => number
}
/** Outcome of a forced refresh; `dead` distinguishes refresh-token-dead
 *  (needs re-login) from a transient failure (network/5xx). */
export interface ForceRefreshResult {
  ok: boolean
  dead: boolean
}
/**
 * Decide whether a refresh failure means the refresh token / OIDC client is
 * dead (permanent, needs re-login) or is merely transient (network/5xx).
 * A missing/unusable-credential decode error (e.g. a corrupted refresh_token
 * that never reaches the wire, or an empty response) is treated as dead:
 * the stored credentials are unusable, so the account needs a re-login.
 */
export declare function isRefreshErrorDead(error: unknown): boolean
export declare class TokenRefresher {
  private config
  private accountManager
  private syncFromKiroCli
  private repository
  private readonly inFlight
  private readonly pendingPersistence
  private readonly lastDeadToastAt
  private readonly refreshAccessToken
  private readonly sleep
  private readonly random
  constructor(
    config: TokenRefresherConfig,
    accountManager: AccountManager,
    syncFromKiroCli: () => Promise<void>,
    repository: AccountRepository,
    dependencies?: Partial<TokenRefresherDependencies>
  )
  refreshIfNeeded(
    account: ManagedAccount,
    auth: KiroAuthDetails,
    showToast: ToastFunction
  ): Promise<{
    account: ManagedAccount
    shouldContinue: boolean
  }>
  forceRefresh(account: ManagedAccount, showToast: ToastFunction): Promise<ForceRefreshResult>
  private startOrJoinRefresh
  private runLockedRefresh
  private persistRefreshedAccount
  private readLatestAuth
  private syncPersistedAccountReference
  private handleRefreshError
}
export {}
