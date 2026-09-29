import type { AccountRepository } from '../../infrastructure/database/account-repository.js'
import type { AccountManager } from '../../plugin/accounts.js'
import type { KiroConfig } from '../../plugin/config/index.js'
import { AccountRefreshService } from '../account/account-refresh-service.js'
import { TokenRefresher } from '../auth/token-refresher.js'
export {
  STREAM_ATTEMPT_STARTED_LOG,
  STREAM_MISSING_COMPLETION_LOG,
  STREAM_REQUEST_STARTED_LOG,
  STREAM_TERMINAL_LOG
} from './stream-log-events.js'
type ToastFunction = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void
export declare class RequestHandler {
  private accountManager
  private config
  private repository
  private client?
  private reauthenticate?
  private accountSelector
  private accountRefreshService
  private tokenRefresher
  private errorHandler
  private responseHandler
  private usageTracker
  private retryStrategy
  private reauthInFlight
  private lastFailedReauthAt
  private accountAttemptEpochs
  private streamRetryRandom
  private static kiroRequestQueue
  constructor(
    accountManager: AccountManager,
    config: KiroConfig,
    repository: AccountRepository,
    client?:
      | {
          provider: {
            oauth: {
              authorize: (input: {
                path: {
                  id: string
                }
                body: {
                  method: number
                }
              }) => Promise<unknown>
              callback: (input: {
                path: {
                  id: string
                }
                body: {
                  method: number
                }
              }) => Promise<unknown>
            }
          }
        }
      | undefined,
    reauthenticate?: (() => Promise<void>) | undefined
  )
  get sharedTokenRefresher(): TokenRefresher
  get sharedAccountRefreshService(): AccountRefreshService
  handle(input: any, init: any, showToast: ToastFunction): Promise<Response>
  private enqueueKiroRequest
  private handleKiroRequest
  private extractModel
  /**
   * Seam over the module-level SDK client factory so tests can inject a fake
   * client without a real network call or a leaky module mock. Behavior is
   * identical to calling createSdkClient directly.
   */
  private makeSdkClient
  private prepareSdkRequest
  private handleSuccessfulRequest
  private logSdkRequest
  private logSdkResponse
  private logSdkError
  private triggerReauth
  private performReauth
  private hasUsableAccount
  private allAccountsPermanentlyUnhealthy
  private commitReasoningCorrelation
  private nextAccountAttemptEpoch
  private getStreamRetryDelay
  private sleep
}
