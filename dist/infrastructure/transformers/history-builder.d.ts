import type { CodeWhispererMessage } from '../../plugin/types.js'
/**
 * Collapse agentic loop sequences in the built history.
 *
 * Each agentic iteration gets a fresh conversationId, so the model re-derives its preamble
 * (intent detection, greeting) every iteration. When replayed for the next user turn, the
 * model sees duplicate preambles and gets confused.
 *
 * Removes only byte-identical consecutive assistant preambles from
 * ASST(toolUses)→USER(toolResults) pairs. Unique text is part of the tool-call
 * semantics and must survive replay.
 *
 * Deduplicated turns carry `content: ''`, matching the official Kiro IDE shape
 * for a tool-only assistant turn. Blanket removal is unsafe: it changes unique
 * "text + tool call" examples into tool-only examples while leaving prose-only
 * stop turns intact.
 */
export declare function collapseAgenticLoops(
  history: CodeWhispererMessage[]
): CodeWhispererMessage[]
export declare function buildHistory(msgs: any[], resolved: string): CodeWhispererMessage[]
export declare function injectSystemPrompt(
  history: CodeWhispererMessage[],
  system: string | undefined,
  resolved: string
): CodeWhispererMessage[]
export declare function historyHasToolCalling(history: CodeWhispererMessage[]): boolean
export declare function extractToolNamesFromHistory(history: CodeWhispererMessage[]): Set<string>
