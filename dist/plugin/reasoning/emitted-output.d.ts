/**
 * Accumulates the OpenAI-shaped chunks the plugin actually emitted for one stream
 * attempt.
 *
 * The correlation fingerprint MUST be computed over this, never over raw SDK
 * content: visible text passes through `DialectGate`, whose `finalize()` strips
 * text-dialect tool-call spans out of `delta.content` and converts them into
 * structured `delta.tool_calls`, and tool arguments are JSON-normalized on the
 * way out. A fingerprint over raw SDK bytes would therefore never match the
 * assistant message OpenCode sends back on the next turn — text-dialect tool
 * calls would miss deterministically and silently.
 */
export interface EmittedToolUse {
  toolUseId: string
  name: string
  /** The emitted `function.arguments` string, byte-identical to what was streamed. */
  argumentsJson: string
}
export declare class EmittedOutputAccumulator {
  private visible
  private reasoning
  private slots
  /** Observe one emitted OpenAI chunk. Observation only — never mutates the chunk. */
  observeChunk(chunk: unknown): void
  private observeToolCall
  get visibleText(): string
  get reasoningText(): string
  /** Emitted tool calls in emission order (the `tool_calls[].index` ordinal order). */
  toolUses(): EmittedToolUse[]
}
