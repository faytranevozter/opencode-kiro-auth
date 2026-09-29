import { EmittedOutputAccumulator } from '../../plugin/reasoning/emitted-output.js';
import { normalizeToolArguments } from '../../plugin/reasoning/turn-identity.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function parseChunk(chunk) {
    if (!isRecord(chunk))
        return undefined;
    const choices = chunk['choices'];
    if (!Array.isArray(choices))
        return undefined;
    const first = choices[0];
    if (!isRecord(first))
        return undefined;
    const delta = first['delta'];
    if (!isRecord(delta))
        return undefined;
    const content = delta['content'];
    const reasoning = delta['reasoning_content'];
    const toolCalls = delta['tool_calls'];
    const finishReason = first['finish_reason'];
    return {
        record: chunk,
        choices,
        first,
        delta,
        content: typeof content === 'string' ? content : undefined,
        reasoning: typeof reasoning === 'string' ? reasoning : undefined,
        toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
        terminal: finishReason !== null && finishReason !== undefined
    };
}
function matchString(expected, offset, value) {
    if (value === undefined || value.length === 0)
        return { kind: 'matched', offset, suffix: '' };
    const remaining = expected.slice(offset);
    const prefixLength = Math.min(remaining.length, value.length);
    let matchedLength = 0;
    while (matchedLength < prefixLength && value[matchedLength] === remaining[matchedLength]) {
        matchedLength++;
    }
    if (matchedLength < prefixLength) {
        return { kind: 'diverged', offset: offset + matchedLength };
    }
    return {
        kind: 'matched',
        offset: offset + prefixLength,
        suffix: value.slice(prefixLength)
    };
}
function toolIndex(value) {
    if (!isRecord(value))
        return undefined;
    const index = value['index'];
    return typeof index === 'number' ? index : undefined;
}
function trimChunk(parsed, content, reasoning, toolCalls) {
    const hasSuffix = content.length > 0 || reasoning.length > 0 || toolCalls.length > 0;
    if (!hasSuffix && !parsed.terminal)
        return undefined;
    const delta = {};
    if (content.length > 0)
        delta['content'] = content;
    if (reasoning.length > 0)
        delta['reasoning_content'] = reasoning;
    if (toolCalls.length > 0)
        delta['tool_calls'] = toolCalls;
    return {
        ...parsed.record,
        choices: [{ ...parsed.first, delta }, ...parsed.choices.slice(1)]
    };
}
/**
 * Matches one transformed replay against an already delivered three-channel prefix.
 * Mutation is intentional: this object is a per-attempt accumulator and publication gate.
 */
export class ExactReplayMatcher {
    prefix;
    expectedTools;
    replayed = new EmittedOutputAccumulator();
    toolPositions = new Map();
    bufferedSuffix = [];
    reasoningOffset = 0;
    visibleOffset = 0;
    matchedTools = 0;
    caughtUp = false;
    divergence;
    constructor(prefix) {
        this.prefix = prefix;
        this.expectedTools = prefix.toolUses.map((tool) => ({
            toolUseId: tool.toolUseId,
            name: tool.name,
            argumentsJson: normalizeToolArguments(tool.argumentsJson)
        }));
    }
    consume(chunk) {
        if (this.divergence)
            return { kind: 'diverged', channel: this.divergence };
        if (this.caughtUp)
            return { kind: 'release', chunks: [chunk], caughtUp: false };
        const parsed = parseChunk(chunk);
        if (!parsed)
            return { kind: 'withheld' };
        const reasoning = matchString(this.prefix.reasoningText, this.reasoningOffset, parsed.reasoning);
        this.reasoningOffset = reasoning.offset;
        if (reasoning.kind === 'diverged')
            return this.diverge('reasoning');
        const visible = matchString(this.prefix.visibleText, this.visibleOffset, parsed.content);
        this.visibleOffset = visible.offset;
        if (visible.kind === 'diverged')
            return this.diverge('text');
        for (const call of parsed.toolCalls) {
            const index = toolIndex(call);
            if (index !== undefined && !this.toolPositions.has(index)) {
                this.toolPositions.set(index, this.toolPositions.size);
            }
        }
        this.replayed.observeChunk(chunk);
        const replayedTools = this.replayed.toolUses();
        const toolDiverged = this.matchTools(replayedTools, parsed.terminal);
        if (toolDiverged)
            return this.diverge('tool');
        const suffixTools = parsed.toolCalls.filter((call) => {
            const index = toolIndex(call);
            if (index === undefined)
                return false;
            const position = this.toolPositions.get(index);
            return position !== undefined && position >= this.expectedTools.length;
        });
        const suffix = trimChunk(parsed, visible.suffix, reasoning.suffix, suffixTools);
        if (!this.channelsCaughtUp()) {
            if (parsed.terminal)
                return this.diverge('early_end');
            if (suffix !== undefined)
                this.bufferedSuffix.push(suffix);
            return { kind: 'withheld' };
        }
        this.caughtUp = true;
        const chunks = [...this.bufferedSuffix];
        this.bufferedSuffix.length = 0;
        if (suffix !== undefined)
            chunks.push(suffix);
        return { kind: 'release', chunks, caughtUp: true };
    }
    progress() {
        return {
            matchedReasoningChars: this.reasoningOffset,
            matchedVisibleChars: this.visibleOffset,
            matchedToolCount: this.matchedTools
        };
    }
    matchTools(replayed, terminal) {
        let matched = 0;
        const compared = Math.min(replayed.length, this.expectedTools.length);
        for (let index = 0; index < compared; index++) {
            const actual = replayed[index];
            const expected = this.expectedTools[index];
            if (!actual || !expected)
                return true;
            if (actual.toolUseId !== expected.toolUseId || actual.name !== expected.name)
                return true;
            if (normalizeToolArguments(actual.argumentsJson) !== expected.argumentsJson)
                break;
            matched++;
        }
        this.matchedTools = matched;
        if (replayed.length > this.expectedTools.length && matched < this.expectedTools.length) {
            return true;
        }
        return terminal && matched < this.expectedTools.length;
    }
    channelsCaughtUp() {
        return (this.reasoningOffset === this.prefix.reasoningText.length &&
            this.visibleOffset === this.prefix.visibleText.length &&
            this.matchedTools === this.expectedTools.length);
    }
    diverge(channel) {
        this.divergence = channel;
        this.bufferedSuffix.length = 0;
        return { kind: 'diverged', channel };
    }
}
