import type { CodeWhispererMessage } from '../types.js'
type AssistantResponse = NonNullable<CodeWhispererMessage['assistantResponseMessage']>
export interface ReconstructedAssistantResponse {
  readonly response: AssistantResponse
  readonly fallbackContent: string
}
export interface AssistantReplayScope {
  /** Native signed replay is allowed only for one unmerged turn in the active tool loop. */
  readonly recoverReasoning: boolean
  /** The signature-miss `<thinking>` text fallback is allowed for one turn only. */
  readonly allowThinkingText: boolean
}
/**
 * Rebuild one assistant turn from its inbound OpenAI-compatible shape.
 *
 * A signature hit emits native `reasoningContent` and no thinking text. On a miss the
 * thinking-text fallback is retained byte-for-byte, but only for the turn the caller
 * marks with `allowThinkingText`; every other turn keeps its visible content and tool
 * uses and drops the thinking text. This is the single funnel for both channels the
 * fallback reaches — `response.content` and the `fallbackContent` the history builder
 * restores when it merges adjacent assistant turns.
 */
export declare function reconstructAssistantResponse(
  message: unknown,
  effectiveModel: string,
  scope: AssistantReplayScope
): ReconstructedAssistantResponse
export {}
