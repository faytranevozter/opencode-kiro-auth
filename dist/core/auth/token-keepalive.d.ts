import type { AccountRepository } from '../../infrastructure/database/account-repository.js'
import type { AccountManager } from '../../plugin/accounts.js'
import type { TokenRefresher } from './token-refresher.js'
export interface KeepAliveConfig {
  readonly token_keepalive_enabled: boolean
  readonly token_keepalive_interval_ms: number
  readonly token_expiry_buffer_ms: number
}
export declare class KeepAliveController {
  private readonly config
  private readonly accountManager
  private readonly tokenRefresher
  private readonly repository
  private initialDelayTimer
  private intervalTimer
  private running
  private disposed
  private activeLeaderLockRelease
  constructor(
    config: KeepAliveConfig,
    accountManager: AccountManager,
    tokenRefresher: TokenRefresher,
    repository: AccountRepository
  )
  start(): void
  dispose(): void
  runOnceForTest(): Promise<void>
  private tick
  private refreshNearExpiryAccounts
  private refreshAccountIfNeeded
  private releaseLeaderLock
}
