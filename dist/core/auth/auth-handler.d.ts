import type { AuthHook } from '@opencode-ai/plugin'
import type { AccountRepository } from '../../infrastructure/database/account-repository.js'
import type { AccountRefreshService } from '../account/account-refresh-service.js'
type ToastFunction = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void
export declare class AuthHandler {
  private config
  private repository
  private accountManager?
  private accountRefreshService?
  constructor(config: any, repository: AccountRepository)
  initialize(showToast?: ToastFunction): Promise<void>
  private logUsageSummary
  setAccountManager(am: any): void
  setAccountRefreshService(
    accountRefreshService: Pick<AccountRefreshService, 'refreshAll' | 'refreshAccount'>
  ): void
  /** Summarize stored accounts for a label; guards limit=0 divide-by-zero. */
  private buildUsageSummary
  /** Format a single account as a select-option label for the remove flow. */
  private formatAccountOption
  getMethods(): AuthHook['methods']
  private formatRefreshHeadline
  private printRefreshSummary
  private authorizeRefreshAllAccounts
  /** Ends the auth flow cleanly with no key prompt and no credential written. */
  private endWithoutCredential
  /**
   * Ends the flow after a successful deletion. If a healthy account (or any
   * account with a usable access token) remains, returns a SUCCESS callback
   * keyed on that account's token so OpenCode shows success and persists a
   * still-valid credential. If nothing usable remains, falls back to a failed
   * callback (nothing left to authorize with).
   */
  private endWithRemainingCredentialOrFailed
  /**
   * Self-drawn account-management flow. No-op paths end with method:'auto' + a
   * failed callback so no key prompt appears. Successful refresh/delete paths
   * end with a remaining-account credential so OpenCode reports success.
   */
  private authorizeRemoveAccounts
}
export {}
