import type { CodeWhispererMessage } from '../../plugin/types.js'
export declare function sanitizeHistory(history: CodeWhispererMessage[]): CodeWhispererMessage[]
export declare function findOriginalToolCall(msgs: any[], toolUseId: string): any | null
export declare function mergeAdjacentMessages(msgs: any[]): any[]
/** True when normalization combined two or more inbound assistant turns. */
export declare function spansMultipleAssistantSourceTurns(message: unknown): boolean
export interface ParsedAssistantMessage {
  content: string
  thinking: string
  toolUses: Array<{
    input: any
    name: string
    toolUseId: string
  }>
}
/**
 * Remove replayed pollution markers from one inbound assistant text.
 *
 * Text without any marker is returned byte-for-byte. When a marker is removed, the
 * whitespace it was surrounded by is re-emitted as the smallest separator the two
 * remaining fragments already had, so real content keeps its own shape.
 */
export declare function stripPollutionMarkers(text: string): string
/**
 * Extract the reasoning text an OpenAI-compatible assistant message carries at
 * the top level.
 *
 * `@ai-sdk/openai-compatible` serializes assistant reasoning as a top-level
 * `reasoning_content` **string** while `content` stays a plain string, so the
 * array-shaped `type: 'thinking'` parts never appear on the OpenCode path.
 * Arrays are tolerated for callers that send Anthropic-style parts.
 */
export declare function extractReasoningText(m: any): string
/**
 * Index of the first message of the in-flight tool loop, i.e. the maximal
 * trailing run of `assistant(tool calls)` → tool-result messages.
 *
 * Returns `msgs.length` when the conversation does not end inside a tool loop,
 * which bounds reasoning recovery to the loop currently being executed instead
 * of replaying every historical assistant turn.
 */
export declare function findActiveToolLoopStart(msgs: any[]): number
/**
 * Index of the single assistant turn allowed to flatten its chain-of-thought into
 * `<thinking>` text when the reasoning-signature cache misses.
 *
 * Flattening reasoning into assistant text on every replayed turn teaches the model,
 * across dozens of in-context examples, that an assistant turn is its own scratchpad —
 * which is how a session ends up narrating its next step instead of issuing a tool
 * call. Both vendors instead require reasoning to be handed back as an untouched
 * structured object, and Kiro's `AssistantResponseMessage` schema carries no reasoning
 * field at all. The bound is one turn rather than zero because signature recovery
 * deliberately misses on every Tier A stream recovery, so dropping the fallback
 * outright would strip recovered turns of all reasoning continuity.
 *
 * The chosen turn is the most recent assistant message, which inside an in-flight tool
 * loop is by construction that loop's own latest assistant turn, because
 * `findActiveToolLoopStart` returns the start of a *trailing* run. Returns -1 when the
 * conversation carries no assistant turn.
 */
export declare function findThinkingTextReplayIndex(msgs: any[]): number
/**
 * Shared assistant-message parser for both history construction
 * (`buildHistory`) and the current-turn branch in `buildCodeWhispererRequest`.
 *
 * With `recoverReasoning`, a top-level `reasoning_content` string is used when
 * the message carries no array-shaped `thinking` parts; array parts always win
 * so existing Anthropic-style callers are unaffected.
 */
export declare function parseAssistantMessage(
  m: any,
  options?: {
    recoverReasoning?: boolean
  }
): ParsedAssistantMessage
export declare function applyThinkingToContent(
  content: string,
  thinking: string,
  hasNativeReasoning?: boolean
): string
export declare function getContentText(m: any): string
