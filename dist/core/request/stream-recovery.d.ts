/**
 * Coordinates one outbound SSE byte stream across transformed OpenAI-chunk iterators from
 * multiple SDK attempts. Attempts stay pre-SSE-encoding so each attempt keeps its own
 * transformer, EmittedOutputAccumulator, and StreamObserver; the caller injects the existing
 * SSE encoder at the sole publication point. A terminal chunk and every chunk after it are
 * withheld until that attempt drains cleanly, preventing failed attempts from publishing a
 * synthetic success before recovery starts.
 */
import type { StreamTerminalSource } from '../../plugin/streaming/stream-observer.js'
import { type ReplayDivergenceChannel, type ReplayMatchProgress } from './replay-matcher.js'
export type StreamRecoveryMode = 'off' | 'reasoning_restart' | 'exact_replay'
export type RecoveryTier = 'reasoning_restart' | 'exact_replay' | 'none'
export type RecoveryDecisionInput = {
  readonly mode: StreamRecoveryMode
  readonly emitted: {
    readonly visibleChars: number
    readonly toolCount: number
  }
  readonly sawToolIntent: boolean
}
export type AttemptObservation = {
  readonly emitted: {
    readonly visibleChars: number
    readonly toolCount: number
  }
  readonly sawToolIntent: boolean
  readonly terminalSource?: StreamTerminalSource | null
}
export type AttemptHandle = {
  readonly chunks: AsyncIterator<unknown>
  readonly observed: () => AttemptObservation
  readonly close: () => Promise<void>
}
export type AttemptFactory = (attemptIndex: number) => Promise<AttemptHandle>
export type StreamRecoveryCompletion = {
  /** One-based index of the attempt that drained successfully. */
  readonly attemptIndex: number
  readonly recoveryTier: RecoveryTier
  readonly recovered: boolean
}
export type ReplayAttemptTelemetry = ReplayMatchProgress & {
  readonly divergenceChannel: ReplayDivergenceChannel
  readonly replayOutcome: 'caught_up' | 'diverged' | 'failed'
  readonly attempts: number
}
export type EmptyCleanEofRetryTelemetry = {
  readonly attemptIndex: number
}
export type StreamRecoveryTerminationReason =
  | 'completed'
  | 'caller_abort'
  | 'consumer_cancel'
  | 'recovery_unavailable'
  | 'attempt_budget_exhausted'
  | 'coordinator_failure'
export type StreamRecoveryOptions = {
  readonly mode: StreamRecoveryMode
  readonly maxAttempts: number
  readonly signal: AbortSignal
  /** Already primed through the first semantic chunk so pre-output failures stay caller-owned. */
  readonly initialAttempt?: AttemptHandle
  readonly attemptFactory: AttemptFactory
  /** Receives the one-based index and cause of the failed attempt being backed off. */
  readonly delayFn: (attemptIndex: number, signal: AbortSignal, failure: Error) => Promise<void>
  readonly mapError: (failure: unknown) => Error
  readonly encodeChunk: (chunk: unknown) => Uint8Array
  readonly onComplete: (completion: StreamRecoveryCompletion) => void | Promise<void>
  readonly onTerminal: (reason: StreamRecoveryTerminationReason) => void
  readonly onCancel?: (reason: unknown) => void
  readonly onReplayAttempt?: (telemetry: ReplayAttemptTelemetry, failure?: Error) => void
  readonly onEmptyCleanEofRetry?: (telemetry: EmptyCleanEofRetryTelemetry) => void | Promise<void>
}
export declare function decideRecoveryTier(input: RecoveryDecisionInput): RecoveryTier
export declare class StreamRecoveryCoordinator {
  readonly stream: ReadableStream<Uint8Array>
  private readonly options
  private activeAttempt
  private attemptIndex
  private readonly delivered
  private sawToolIntent
  private activeRecoveryTier
  private replayMatcher
  private emptyCleanEofRetryUsed
  private terminal
  private completionFired
  private abortListener
  private readonly pendingTerminalChunks
  private readonly pendingDeliveryChunks
  constructor(options: StreamRecoveryOptions)
  private start
  private pull
  private publishNext
  private publishChunk
  private openAttemptOrRecover
  private recoverOrTerminate
  private emptyCleanEofRetryTelemetry
  private retryEmptyCleanEof
  private mergeObservation
  private reportReplayAttempt
  private complete
  private cancel
  private closeActiveAttempt
  private finish
}
