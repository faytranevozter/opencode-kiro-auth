import type { ToolCall } from '../../plugin/types.js'
export declare function parseBracketToolCalls(text: string): ToolCall[]
export declare function deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[]
export declare function cleanToolCallsFromText(text: string, toolCalls: ToolCall[]): string
export declare const DSML_MARKER = '<\uFF5CDSML\uFF5Cfunction_calls'
export declare const TEXT_TOOL_CALL_OPENING_MARKERS: readonly [
  '<function_calls',
  '<invoke name=',
  '<｜DSML｜function_calls'
]
export type DialectToolResolution = 'none' | 'complete' | 'incomplete'
export interface TextToolCallMarkerObservation {
  /** Earliest opening marker of any kind, including examples inside code. */
  index: number | null
  /** Null only when no opening marker exists. */
  inCodeRegion: boolean | null
  /** Earliest marker that is eligible for dialect parsing and execution. */
  executableIndex: number
}
/**
 * Locate the earliest raw and executable opening markers in one code-range pass.
 * The raw position is diagnostic only; parsing continues to use executableIndex.
 */
export declare function observeTextToolCallOpeningMarker(
  text: string
): TextToolCallMarkerObservation
/** Opening-marker offsets outside every fenced or inline code region. */
export declare function textToolCallOpeningMarkerStarts(text: string): number[]
export declare function firstTextToolCallOpeningMarkerIndex(text: string): number
/**
 * Recognize Anthropic XML, deepseek DSML, and legacy bracket tool-call dialects
 * in `text`. Returns the parsed tool calls plus `cleanedText` with EXACTLY the
 * matched dialect spans removed (all other text preserved verbatim).
 *
 * Phantom-execution guards:
 *  - only COMPLETE closed tags match (an unclosed `<invoke name="x">` is text);
 *  - candidates inside fenced/inline code are skipped;
 *  - a dialect that yields no parseable call is stripped, never fabricated.
 */
export declare function parseTextToolCalls(text: string): {
  toolCalls: ToolCall[]
  cleanedText: string
  resolution: DialectToolResolution
}
