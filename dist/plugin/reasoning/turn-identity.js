import { createHash } from 'node:crypto';
import { findActiveToolLoopStart } from '../../infrastructure/transformers/message-transformer.js';
/**
 * Normalize a tool-argument payload the same way on both sides of the boundary.
 *
 * `transformSdkStream` emits `JSON.stringify(JSON.parse(input))` for tool
 * arguments, and OpenCode hands the same string back, so re-normalizing is
 * idempotent — but doing it explicitly means a re-serialized-but-equivalent
 * inbound payload still matches, while an unparseable payload is compared
 * verbatim rather than being silently rewritten.
 */
export function normalizeToolArguments(raw) {
    if (raw === undefined || raw === null)
        return '';
    if (typeof raw === 'string') {
        try {
            return JSON.stringify(JSON.parse(raw));
        }
        catch {
            return raw;
        }
    }
    try {
        return JSON.stringify(raw);
    }
    catch {
        return '';
    }
}
function lengthPrefixed(value) {
    return `${value.length}:${value}`;
}
/**
 * Deterministic, collision-resistant cache key.
 *
 * Every field is length-prefixed so no delimiter sequence inside a payload can
 * forge a different field layout. The model is kept in the clear as a namespace
 * prefix: a mid-conversation model switch must produce a safe MISS, never a
 * cross-model replay.
 */
export function computeFingerprintKey(input) {
    const parts = [
        lengthPrefixed(input.reasoningText),
        lengthPrefixed(input.visibleText),
        lengthPrefixed(String(input.toolUses.length))
    ];
    for (const tool of input.toolUses) {
        parts.push(lengthPrefixed(tool.name));
        parts.push(lengthPrefixed(tool.toolUseId));
        parts.push(lengthPrefixed(tool.argumentsJson));
    }
    const digest = createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
    return `${input.effectiveModel}\u0000${digest}`;
}
/**
 * Loop root identity from an ordered list of `tool_use` ids.
 *
 * Refuses (returns `undefined`) when the list is empty or any id is empty:
 * an unidentifiable root must never be cached under a guessed identity.
 */
export function loopIdFromToolUseIds(ids) {
    if (ids.length === 0)
        return undefined;
    for (const id of ids) {
        if (typeof id !== 'string' || id.length === 0)
            return undefined;
    }
    return `loop:${ids.join(',')}`;
}
/** Loop root identity from the tool calls a response just emitted. */
export function loopIdFromEmittedToolUses(toolUses) {
    return loopIdFromToolUseIds(toolUses.map((tool) => tool.toolUseId));
}
function assistantToolUseIds(message) {
    if (typeof message !== 'object' || message === null)
        return undefined;
    const record = message;
    if (record.role !== 'assistant')
        return undefined;
    const ids = [];
    if (Array.isArray(record.content)) {
        for (const part of record.content) {
            if (typeof part !== 'object' || part === null)
                continue;
            const partRecord = part;
            if (partRecord.type !== 'tool_use')
                continue;
            ids.push(typeof partRecord.id === 'string' ? partRecord.id : '');
        }
    }
    if (Array.isArray(record.tool_calls)) {
        for (const call of record.tool_calls) {
            if (typeof call !== 'object' || call === null)
                continue;
            const callRecord = call;
            ids.push(typeof callRecord.id === 'string' ? callRecord.id : '');
        }
    }
    return ids.length > 0 ? ids : undefined;
}
/**
 * Recover the loop root from inbound history, making the id inheritable with no
 * per-request state.
 *
 * The root is the message at the start of the trailing tool loop
 * (`findActiveToolLoopStart`). If that message is not an assistant turn carrying
 * tool uses — e.g. compaction removed the root — the loop identity is refused
 * and the caller takes a safe miss rather than attaching to another loop.
 */
export function deriveInheritedLoopId(messages) {
    if (!Array.isArray(messages) || messages.length === 0)
        return undefined;
    const loopStart = findActiveToolLoopStart(messages);
    if (loopStart >= messages.length)
        return undefined;
    const ids = assistantToolUseIds(messages[loopStart]);
    if (!ids)
        return undefined;
    return loopIdFromToolUseIds(ids);
}
/**
 * §6.3's decision table, verbatim.
 *
 * | tool calls emitted, no inherited id | created from the emitted ids | publish  |
 * | tool calls emitted, inherited id    | the inherited id             | publish  |
 * | final no-tool response, inherited   | the inherited id             | teardown |
 * | no inherited id and no tool calls   | undefined                    | none     |
 */
export function resolveLoop(inheritedLoopId, emittedToolUses) {
    if (emittedToolUses.length > 0) {
        // §6.3 hard refusal: an empty tool id cannot be matched back on the next
        // turn, so the turn is uncacheable regardless of an inherited identity.
        const emittedRootId = loopIdFromEmittedToolUses(emittedToolUses);
        if (emittedRootId === undefined)
            return { action: 'none' };
        return { loopId: inheritedLoopId ?? emittedRootId, action: 'publish' };
    }
    if (inheritedLoopId !== undefined)
        return { loopId: inheritedLoopId, action: 'teardown' };
    return { action: 'none' };
}
