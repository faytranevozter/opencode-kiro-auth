import {
  EmittedOutputAccumulator,
  type EmittedToolUse
} from '../../plugin/reasoning/emitted-output.js'
import type { StreamObserver } from '../../plugin/streaming/stream-observer.js'
import type { KiroReasoningContent } from '../../plugin/types.js'
import { SdkEventStreamIterationError } from './stream-error.js'
import type {
  AttemptHandle,
  StreamRecoveryCompletion,
  StreamRecoveryMode
} from './stream-recovery.js'
/**
 * What a completed SDK stream hands back to the request layer.
 *
 * `loopId` is optional and that is load-bearing: `onComplete` also commits
 * success state and usage for a plain no-tool answer, which has no loop at all.
 * Typing it required would force a fabricated value on exactly the responses
 * that must leave the correlation cache untouched.
 */
export interface SdkCompletionPayload {
  envelope?: KiroReasoningContent
  reasoningText: string
  visibleText: string
  toolUses: EmittedToolUse[]
  attemptId: string
  loopId?: string
  effectiveModel: string
  recovered?: boolean
}
export type SdkStreamingAttempt = AttemptHandle & {
  readonly complete: (completion: StreamRecoveryCompletion) => Promise<void>
}
export type SdkStreamingAttemptInput = {
  readonly sdkResponse: unknown
  readonly model: string
  readonly conversationId: string
  readonly lifecycle: SdkResponseLifecycle
  readonly recoveryMode: StreamRecoveryMode
}
export interface SdkResponseLifecycle {
  signal?: AbortSignal
  onUpstreamWaitStart?: (context: { eventIndex: number }) => void
  onUpstreamWaitEnd?: () => void
  onIterationError?: (error: unknown, afterCompletionMetadata: boolean) => void
  onComplete?: (completed: SdkCompletionPayload) => void | Promise<void>
  onTerminal?: () => void
  onCancel?: (reason: unknown) => void
  mapError?: (error: SdkEventStreamIterationError, emittedOutput: true) => unknown
  bufferUntilComplete?: boolean
  /** Request-scoped, unique per SDK send attempt. Unrelated to account epochs. */
  attemptId?: string
  /** Loop root recovered from inbound history, if any. */
  inheritedLoopId?: string
  effectiveModel?: string
  /**
   * Owned by the caller so the ingestion-time signals stay readable after this
   * attempt fails — the streaming branch only feeds it.
   */
  streamObserver?: StreamObserver
  /**
   * Owned by the caller for the same reason as `streamObserver`: the emitted
   * per-channel volume has to stay readable after the attempt fails. Defaults to
   * an internal instance when absent, so callers that do not observe are unchanged.
   */
  emittedOutput?: EmittedOutputAccumulator
  /**
   * The SDK iterator reached a clean `done` without ever delivering completion
   * metadata. Observation only — success handling proceeds exactly as before.
   */
  onCleanEofWithoutCompletionMetadata?: () => void
  recoveryMode?: StreamRecoveryMode
}
export declare function encodeSseChunk(chunk: unknown): Uint8Array
export declare class ResponseHandler {
  private fireCompletion
  prepareSdkStreamingAttempt(input: SdkStreamingAttemptInput): Promise<SdkStreamingAttempt>
  handleSuccess(
    response: Response,
    model: string,
    conversationId: string,
    streaming: boolean
  ): Promise<Response>
  handleSdkSuccess(
    sdkResponse: any,
    model: string,
    conversationId: string,
    streaming: boolean,
    lifecycle?: SdkResponseLifecycle
  ): Promise<Response>
  private handleStreaming
  private handleSdkStreaming
  private handleSdkNonStreaming
  private handleNonStreaming
}
