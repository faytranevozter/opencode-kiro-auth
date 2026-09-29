import type { DialectToolResolution } from '../../infrastructure/transformers/tool-call-parser.js'
import type { ToolCall } from '../types.js'
/**
 * Streaming suppression gate for text-dialect tool calls.
 *
 * Visible assistant reply text is pushed through the gate as it streams. While
 * no dialect opening marker has appeared, the gate returns the safe prefix to
 * stream (holding back only a possible partial-marker tail). Once a marker
 * appears, everything from the marker onward is withheld. At finalization,
 * `finalize()` parses the full accumulated text into structured tool calls and
 * returns the remaining non-dialect text (dialect spans removed) that still
 * needs to be emitted.
 */
export declare class DialectGate {
  private accumulated
  private emitted
  private markerSeen
  private toolIntentPresent
  private observedMarkerIndex
  private observedMarkerInCodeRegion
  /** Append a visible-text chunk; returns the substring safe to emit now. */
  push(text: string): string
  /** True once a dialect opening marker has been observed (streaming suppressed). */
  get suppressing(): boolean
  get hasToolIntent(): boolean
  get markerIndex(): number | null
  get markerInCodeRegion(): boolean | null
  /**
   * Finalize: parse the full accumulated text into structured tool calls and
   * return the non-dialect text that was buffered but not yet emitted.
   */
  finalize(): {
    toolCalls: ToolCall[]
    remainderText: string
    resolution: DialectToolResolution
  }
}
