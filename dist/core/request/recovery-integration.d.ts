import type { StreamTerminalSource } from '../../plugin/streaming/stream-observer.js'
import type { ManagedAccount } from '../../plugin/types.js'
import type { RecoveryAttemptFactory } from './recovery-attempt.js'
import { type StreamRecoveryMode } from './stream-recovery.js'
export type LiveRecoveryOptions = {
  readonly mode: StreamRecoveryMode
  readonly maxAttempts: number
  readonly priorStreamFailures: number
  readonly signal: AbortSignal
  readonly initialAccount: ManagedAccount
  readonly failedAccountIds: Set<string>
  readonly attemptFactory: Pick<RecoveryAttemptFactory, 'open'>
  readonly retryDelay: (failureCount: number) => number
  readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>
  readonly selectAlternativeAccount: (
    excludedAccountIds: ReadonlySet<string>
  ) => Promise<ManagedAccount | null>
  readonly markRateLimited: (account: ManagedAccount, milliseconds: number) => void
  readonly describeError: (error: unknown) => unknown
  /**
   * Request-level terminal ownership. Lifecycle ownership transfers to the
   * Response, so this only ever fires on a path where the Response was actually
   * delivered to the caller — i.e. from the coordinator, exactly once.
   */
  readonly onTerminal: (details: RecoveryTerminalLogDetails) => void
  /**
   * Attempt-level release for an initial `openAttempt(1)` failure. That failure is
   * pre-output and is re-thrown for the caller's outer retry loop, so ownership has
   * NOT transferred: this callback must not run request-level cleanup and must not
   * detach the inbound abort listener, or the retry loses caller cancellation.
   */
  readonly onInitialOpenFailure: () => void
  readonly onCancel: (reason: unknown) => void
}
type RecoveryTerminalLogDetails = Readonly<Record<string, unknown>> & {
  readonly terminalSource: StreamTerminalSource
}
export declare function createLiveRecoveryResponse(options: LiveRecoveryOptions): Promise<Response>
export {}
