import type { EmittedToolUse } from './emitted-output.js'
/**
 * Turn identity for the reasoning correlation cache.
 *
 * Two independent identities live here:
 *
 * - the **fingerprint key**, which must be reconstructible from the inbound
 *   assistant message alone (so it deliberately excludes the producing account —
 *   the next turn cannot know it, and a signature is valid across accounts);
 * - the **`loopId`**, derived from the ordered non-empty `tool_use` ids of the
 *   first assistant turn of the current contiguous tool loop. Not from the
 *   leading prompt: two concurrent agents can open with byte-identical prompts,
 *   and compaction rewrites those leading turns.
 */
/** A tool call in fingerprint form. `name` matters — same args to two tools are two turns. */
export interface FingerprintToolUse {
  toolUseId: string
  name: string
  argumentsJson: string
}
export interface FingerprintInput {
  /** The exact reasoning text of the turn, as emitted / as received back. */
  reasoningText: string
  /** The exact visible answer text of the turn. */
  visibleText: string
  toolUses: FingerprintToolUse[]
  /** The model resolved for the CURRENT request, used purely as a namespace. */
  effectiveModel: string
}
/**
 * Normalize a tool-argument payload the same way on both sides of the boundary.
 *
 * `transformSdkStream` emits `JSON.stringify(JSON.parse(input))` for tool
 * arguments, and OpenCode hands the same string back, so re-normalizing is
 * idempotent — but doing it explicitly means a re-serialized-but-equivalent
 * inbound payload still matches, while an unparseable payload is compared
 * verbatim rather than being silently rewritten.
 */
export declare function normalizeToolArguments(raw: unknown): string
/**
 * Deterministic, collision-resistant cache key.
 *
 * Every field is length-prefixed so no delimiter sequence inside a payload can
 * forge a different field layout. The model is kept in the clear as a namespace
 * prefix: a mid-conversation model switch must produce a safe MISS, never a
 * cross-model replay.
 */
export declare function computeFingerprintKey(input: FingerprintInput): string
/**
 * Loop root identity from an ordered list of `tool_use` ids.
 *
 * Refuses (returns `undefined`) when the list is empty or any id is empty:
 * an unidentifiable root must never be cached under a guessed identity.
 */
export declare function loopIdFromToolUseIds(ids: readonly string[]): string | undefined
/** Loop root identity from the tool calls a response just emitted. */
export declare function loopIdFromEmittedToolUses(
  toolUses: readonly EmittedToolUse[]
): string | undefined
/**
 * Recover the loop root from inbound history, making the id inheritable with no
 * per-request state.
 *
 * The root is the message at the start of the trailing tool loop
 * (`findActiveToolLoopStart`). If that message is not an assistant turn carrying
 * tool uses — e.g. compaction removed the root — the loop identity is refused
 * and the caller takes a safe miss rather than attaching to another loop.
 */
export declare function deriveInheritedLoopId(messages: unknown): string | undefined
export type LoopAction = 'publish' | 'teardown' | 'none'
export interface ResolvedLoop {
  loopId?: string
  action: LoopAction
}
/**
 * §6.3's decision table, verbatim.
 *
 * | tool calls emitted, no inherited id | created from the emitted ids | publish  |
 * | tool calls emitted, inherited id    | the inherited id             | publish  |
 * | final no-tool response, inherited   | the inherited id             | teardown |
 * | no inherited id and no tool calls   | undefined                    | none     |
 */
export declare function resolveLoop(
  inheritedLoopId: string | undefined,
  emittedToolUses: readonly EmittedToolUse[]
): ResolvedLoop
