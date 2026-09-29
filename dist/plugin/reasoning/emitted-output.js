function asRecord(value) {
    return typeof value === 'object' && value !== null
        ? value
        : undefined;
}
function extractDelta(chunk) {
    const record = asRecord(chunk);
    if (!record)
        return undefined;
    const choices = record.choices;
    if (!Array.isArray(choices))
        return undefined;
    const first = asRecord(choices[0]);
    if (!first)
        return undefined;
    return asRecord(first.delta);
}
export class EmittedOutputAccumulator {
    visible = '';
    reasoning = '';
    slots = new Map();
    /** Observe one emitted OpenAI chunk. Observation only — never mutates the chunk. */
    observeChunk(chunk) {
        const delta = extractDelta(chunk);
        if (!delta)
            return;
        if (typeof delta.content === 'string')
            this.visible += delta.content;
        if (typeof delta.reasoning_content === 'string')
            this.reasoning += delta.reasoning_content;
        const toolCalls = delta.tool_calls;
        if (!Array.isArray(toolCalls))
            return;
        for (const entry of toolCalls)
            this.observeToolCall(entry);
    }
    observeToolCall(entry) {
        const record = asRecord(entry);
        if (!record)
            return;
        const index = record.index;
        if (typeof index !== 'number')
            return;
        let slot = this.slots.get(index);
        if (!slot) {
            slot = { toolUseId: '', name: '', argumentsJson: '' };
            this.slots.set(index, slot);
        }
        if (typeof record.id === 'string' && record.id.length > 0)
            slot.toolUseId = record.id;
        const fn = asRecord(record.function);
        if (!fn)
            return;
        if (typeof fn.name === 'string' && fn.name.length > 0)
            slot.name = fn.name;
        if (typeof fn.arguments === 'string')
            slot.argumentsJson += fn.arguments;
    }
    get visibleText() {
        return this.visible;
    }
    get reasoningText() {
        return this.reasoning;
    }
    /** Emitted tool calls in emission order (the `tool_calls[].index` ordinal order). */
    toolUses() {
        return [...this.slots.values()].map((slot) => ({
            toolUseId: slot.toolUseId,
            name: slot.name,
            argumentsJson: slot.argumentsJson
        }));
    }
}
