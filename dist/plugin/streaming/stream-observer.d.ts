import type { DialectToolResolution } from '../../infrastructure/transformers/tool-call-parser.js'
/**
 * Where the reasoning/thinking channel stands at the moment of observation.
 *
 * - `none`   — no reasoning block has ever opened on this attempt.
 * - `active` — a reasoning block is open right now (nothing closed it yet).
 * - `ended`  — a reasoning block opened and was closed.
 */
export type ReasoningPhase = 'none' | 'active' | 'ended'
export type ObservedDialectResolution = DialectToolResolution | 'not_finalized'
export declare const STREAM_TERMINAL_SOURCES: readonly [
  'clean_eof_without_completion_metadata',
  'completion_metadata_received',
  'iterator_failure',
  'semantic_truncation',
  'caller_abort',
  'stream_attempt_budget_exhausted',
  'stream_processing_failure'
]
export type StreamTerminalSource = (typeof STREAM_TERMINAL_SOURCES)[number]
export declare const REQUEST_TERMINAL_SOURCES: readonly [
  'clean_eof_without_completion_metadata',
  'completion_metadata_received',
  'iterator_failure',
  'semantic_truncation',
  'caller_abort',
  'stream_attempt_budget_exhausted',
  'stream_processing_failure',
  'http_error',
  'network_error',
  'request_error'
]
export type RequestTerminalSource = (typeof REQUEST_TERMINAL_SOURCES)[number]
export interface StreamObservedState {
  /**
   * True once the attempt has ANY evidence of tool intent, at ingestion time —
   * long before the transformer flushes `tool_calls` at stream end. Two sources:
   * a raw `toolUseEvent` from the SDK, or a text-dialect tool marker entering
   * the dialect gate.
   */
  sawToolIntent: boolean
  /** True while a raw or dialect tool intent has not reached a valid close signal. */
  hasOpenToolIntent: boolean
  reasoningPhase: ReasoningPhase
  /** True once the dialect gate started withholding text (a marker appeared). */
  dialectActive: boolean
  /** Earliest raw dialect marker offset, including markers inside code examples. */
  dialectMarkerIndex: number | null
  /** Whether that marker is inside fenced/inline code; null means no marker. */
  dialectMarkerInCodeRegion: boolean | null
  /** Final parser verdict, or `not_finalized` when iteration stopped first. */
  dialectResolution: ObservedDialectResolution
  /** Counts only raw event discriminator names; event payloads are never retained. */
  eventTypeCounts: Record<string, number>
  /** The transport/parser/caller decision that ended this attempt, if reached. */
  terminalSource: StreamTerminalSource | null
}
/**
 * Observes ONE stream attempt's ingestion-time signals for the recovery tier
 * decision. Observation only: the transformer never reads it back, so attaching
 * an observer cannot change a single emitted chunk.
 *
 * Read it AFTER the attempt ends — successfully or by iterator failure. The
 * whole point is that `sawToolIntent` is already true when a stream dies before
 * the transformer's end-of-stream tool flush, which is exactly the case where
 * naive replay would double-execute a tool.
 */
export declare class StreamObserver {
  private rawToolIntentSeen
  private readonly openRawToolIntents
  private anonymousRawToolIntent
  private dialectToolIntentSeen
  private dialectToolIntentOpen
  private phase
  private dialect
  private markerIndex
  private markerInCodeRegion
  private resolution
  private readonly rawEventTypeCounts
  private terminal
  noteRawEvent(event: unknown): void
  /** A raw SDK tool sequence advanced; only `stop: true` closes that sequence. */
  noteRawToolIntent(toolUseId: string | undefined, closed: boolean): void
  noteDialectGateActive(): void
  noteDialectMarker(index: number | null, inCodeRegion: boolean | null): void
  noteTerminalSource(source: StreamTerminalSource): void
  /** Synchronize the currently observable non-code-region dialect marker. */
  noteDialectToolIntent(present: boolean): void
  /** Records whether finalization resolved every non-code-region opening marker. */
  noteDialectToolResolution(resolution: DialectToolResolution): void
  /** A reasoning/thinking block opened (native reasoning run or inline tag). */
  noteReasoningStarted(): void
  /** The open reasoning/thinking block closed. Never downgrades `none`. */
  noteReasoningEnded(): void
  get sawToolIntent(): boolean
  get hasOpenToolIntent(): boolean
  get reasoningPhase(): ReasoningPhase
  get dialectActive(): boolean
  snapshot(): StreamObservedState
}
