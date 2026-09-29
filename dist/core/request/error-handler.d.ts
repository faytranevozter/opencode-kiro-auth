import type { AccountRepository } from '../../infrastructure/database/account-repository.js'
import type { AccountManager } from '../../plugin/accounts.js'
import type { ManagedAccount } from '../../plugin/types.js'
import type { AccountRefreshService } from '../account/account-refresh-service.js'
import type { ForceRefreshResult } from '../auth/token-refresher.js'
type ToastFunction = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void
export declare function isKiroContextOverflowBody(text: string): boolean
export declare const THINKING_SIGNATURE_INVALID_REASON = 'THINKING_SIGNATURE_INVALID'
export interface RequestContext {
  retry: number
  forcedRefreshAccountIds?: Set<string>
  signatureRecoveryAttempted?: boolean
  disableReasoningReplay?: boolean
}
export interface ErrorHandlerResult {
  shouldRetry: boolean
  newContext?: RequestContext
  switchAccount?: boolean
  pinAccount?: boolean
}
type ForceRefreshFn = (
  account: ManagedAccount,
  showToast: ToastFunction
) => Promise<ForceRefreshResult>
interface ErrorHandlerConfig {
  rate_limit_max_retries: number
  rate_limit_retry_delay_ms: number
  refresh_before_switch_enabled?: boolean
  refresh_all_deadline_ms?: number
}
export declare class ErrorHandler {
  private config
  private accountManager
  private repository
  private forceRefresh?
  private accountRefreshService?
  constructor(
    config: ErrorHandlerConfig,
    accountManager: AccountManager,
    repository: AccountRepository,
    forceRefresh?: ForceRefreshFn | undefined,
    accountRefreshService?: Pick<AccountRefreshService, 'refreshAll'> | undefined
  )
  handle(
    error: any,
    response: Response,
    account: ManagedAccount,
    context: RequestContext,
    showToast: ToastFunction,
    signal?: AbortSignal
  ): Promise<ErrorHandlerResult>
  private markDeadAndSwitchOrFail
  private transientForbidden
  private refreshBeforeSwitch
  handleNetworkError(
    error: any,
    context: RequestContext,
    showToast: ToastFunction,
    signal?: AbortSignal
  ): Promise<{
    shouldRetry: boolean
    newContext?: RequestContext
  }>
  private isNetworkError
  private sleep
}
export {}
