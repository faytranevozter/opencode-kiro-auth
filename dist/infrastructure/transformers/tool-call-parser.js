export function parseBracketToolCalls(text) {
    const toolCalls = [];
    const pattern = /\[Called\s+(\w+)\s+with\s+args:\s*(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/gs;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const funcName = match[1];
        const argsStr = match[2];
        if (!funcName || !argsStr)
            continue;
        try {
            const args = JSON.parse(argsStr);
            toolCalls.push({
                toolUseId: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
                name: funcName,
                input: args
            });
        }
        catch {
            continue;
        }
    }
    return toolCalls;
}
export function deduplicateToolCalls(toolCalls) {
    const seen = new Set();
    const unique = [];
    for (const tc of toolCalls) {
        if (!seen.has(tc.toolUseId)) {
            seen.add(tc.toolUseId);
            unique.push(tc);
        }
    }
    return unique;
}
export function cleanToolCallsFromText(text, toolCalls) {
    let cleaned = text;
    for (const tc of toolCalls) {
        const funcName = tc.name;
        const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\[Called\\s+${escapedName}\\s+with\\s+args:\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\}\\]`, 'gs');
        cleaned = cleaned.replace(pattern, '');
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}
// ---------------------------------------------------------------------------
// Text-dialect tool-call recovery (bleed-stop)
//
// Some models emit tool calls as literal TEXT dialects instead of the
// structured toolUseEvent path:
//   (a) Anthropic XML:  <function_calls><invoke name="X"><parameter name="k">v</parameter></invoke></function_calls>
//                       (and a standalone <invoke name="X">...</invoke>)
//   (b) deepseek DSML:  <｜DSML｜function_calls...   (U+FF5C '｜', NOT ASCII '|')
//   (c) bracket:        [Called X with args:{...}]  (legacy, kept)
//
// These leak verbatim and stall the turn. `parseTextToolCalls` rescues them
// into structured ToolCalls and returns the text with EXACTLY the matched
// spans removed. It is deliberately conservative: only COMPLETE closed tags
// match, candidates inside fenced/inline code are skipped, and a dialect that
// cannot be parsed is stripped (never fabricated into a phantom call).
// ---------------------------------------------------------------------------
// deepseek DSML opening marker — the exact U+FF5C ('｜') form observed leaking.
export const DSML_MARKER = '<\uFF5CDSML\uFF5Cfunction_calls';
export const TEXT_TOOL_CALL_OPENING_MARKERS = [
    '<function_calls',
    '<invoke name=',
    DSML_MARKER
];
function genToolUseId() {
    return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
/**
 * Compute char ranges that are inside fenced code blocks (3+ backticks or
 * tildes) or inline code spans (` ... `). A fence closes only on the same
 * character with at least the opener's length; an unclosed fence extends to
 * end-of-text. Candidates overlapping any of these are skipped so a model
 * *explaining* or *showing* tool-call syntax is never executed.
 */
function computeCodeRanges(text) {
    const ranges = [];
    const fence = /(`{3,}|~{3,})/g;
    let fenceMatch;
    while ((fenceMatch = fence.exec(text)) !== null) {
        const opener = fenceMatch[0];
        const fenceCharacter = opener[0];
        if (fenceCharacter === undefined)
            continue;
        const closingFence = new RegExp(`${fenceCharacter}{${opener.length},}`, 'g');
        closingFence.lastIndex = fence.lastIndex;
        const closingMatch = closingFence.exec(text);
        const end = closingMatch === null ? text.length : closingMatch.index + closingMatch[0].length;
        ranges.push([fenceMatch.index, end]);
        if (closingMatch === null)
            break;
        fence.lastIndex = end;
    }
    const inFence = (i) => ranges.some(([s, e]) => i >= s && i < e);
    const inline = /`[^`\n]+`/g;
    let inlineMatch;
    while ((inlineMatch = inline.exec(text)) !== null) {
        if (!inFence(inlineMatch.index)) {
            ranges.push([inlineMatch.index, inlineMatch.index + inlineMatch[0].length]);
        }
    }
    return ranges;
}
function overlapsCode(start, end, codeRanges) {
    return codeRanges.some(([s, e]) => start < e && end > s);
}
function openingMarkerStarts(text, codeRanges) {
    const starts = [];
    for (const marker of TEXT_TOOL_CALL_OPENING_MARKERS) {
        let from = 0;
        for (;;) {
            const start = text.indexOf(marker, from);
            if (start === -1)
                break;
            const end = start + marker.length;
            if (!overlapsCode(start, end, codeRanges))
                starts.push(start);
            from = end;
        }
    }
    return starts;
}
/**
 * Locate the earliest raw and executable opening markers in one code-range pass.
 * The raw position is diagnostic only; parsing continues to use executableIndex.
 */
export function observeTextToolCallOpeningMarker(text) {
    const codeRanges = computeCodeRanges(text);
    let index = null;
    let inCodeRegion = null;
    for (const marker of TEXT_TOOL_CALL_OPENING_MARKERS) {
        const markerIndex = text.indexOf(marker);
        if (markerIndex === -1 || (index !== null && markerIndex >= index))
            continue;
        index = markerIndex;
        inCodeRegion = overlapsCode(markerIndex, markerIndex + marker.length, codeRanges);
    }
    const executableStarts = openingMarkerStarts(text, codeRanges);
    return {
        index,
        inCodeRegion,
        executableIndex: executableStarts.length === 0 ? -1 : Math.min(...executableStarts)
    };
}
/** Opening-marker offsets outside every fenced or inline code region. */
export function textToolCallOpeningMarkerStarts(text) {
    return openingMarkerStarts(text, computeCodeRanges(text));
}
export function firstTextToolCallOpeningMarkerIndex(text) {
    const starts = textToolCallOpeningMarkerStarts(text);
    return starts.length === 0 ? -1 : Math.min(...starts);
}
function overlapsClaimed(start, end, claimed) {
    return claimed.some(([s, e]) => start < e && end > s);
}
/** Parse `<parameter name="K">V</parameter>` pairs from an invoke body into an input object. */
function parseInvokeParameters(body) {
    const input = {};
    const paramRe = /<parameter\s+name="([^"]+)"\s*>([\s\S]*?)<\/parameter>/g;
    let pm;
    while ((pm = paramRe.exec(body)) !== null) {
        const key = pm[1];
        const rawVal = pm[2];
        if (key === undefined)
            continue;
        const val = rawVal ?? '';
        try {
            input[key] = JSON.parse(val);
        }
        catch {
            input[key] = val;
        }
    }
    return input;
}
/** Build a ToolCall from a single complete `<invoke name="...">...</invoke>` block. */
function toolCallFromInvoke(name, body) {
    return {
        toolUseId: genToolUseId(),
        name,
        input: parseInvokeParameters(body)
    };
}
/**
 * Match complete Anthropic XML dialects:
 *   - `<function_calls>...(invoke)+...</function_calls>` blocks
 *   - standalone `<invoke name="X">...</invoke>` NOT inside a function_calls block
 * Skips candidates inside code and records claimed ranges to avoid double-match.
 */
function matchAnthropicXml(text, codeRanges, claimed) {
    const matches = [];
    // (1) complete <function_calls>...</function_calls> blocks
    const blockRe = /<function_calls>[\s\S]*?<\/function_calls>/g;
    let bm;
    while ((bm = blockRe.exec(text)) !== null) {
        const start = bm.index;
        const end = start + bm[0].length;
        if (overlapsCode(start, end, codeRanges))
            continue;
        const invokeRe = /<invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/invoke>/g;
        const toolCalls = [];
        const resolvedOpeningStarts = [start];
        let im;
        while ((im = invokeRe.exec(bm[0])) !== null) {
            const name = im[1];
            if (!name)
                continue;
            toolCalls.push(toolCallFromInvoke(name, im[2] ?? ''));
            resolvedOpeningStarts.push(start + im.index);
        }
        // Only treat as a tool-call span if at least one invoke parsed; otherwise
        // it is not a real dialect payload — leave the text untouched.
        if (toolCalls.length === 0)
            continue;
        matches.push({ start, end, toolCalls, resolvedOpeningStarts });
        claimed.push([start, end]);
    }
    // (2) standalone complete <invoke ...>...</invoke> not inside a claimed block
    const invokeRe = /<invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/invoke>/g;
    let sm;
    while ((sm = invokeRe.exec(text)) !== null) {
        const start = sm.index;
        const end = start + sm[0].length;
        const name = sm[1];
        if (!name)
            continue;
        if (overlapsCode(start, end, codeRanges))
            continue;
        if (overlapsClaimed(start, end, claimed))
            continue;
        matches.push({
            start,
            end,
            toolCalls: [toolCallFromInvoke(name, sm[2] ?? '')],
            resolvedOpeningStarts: [start]
        });
        claimed.push([start, end]);
    }
    return matches;
}
/**
 * Match the deepseek DSML dialect. The strip span runs from the exact U+FF5C
 * marker to its closing counterpart if one exists, else to end-of-text (the
 * observed trailing leak). Best-effort recovery of name/args; if not cleanly
 * recoverable the span is stripped WITHOUT fabricating a call.
 */
function matchDsml(text, codeRanges, claimed) {
    const matches = [];
    let from = 0;
    for (;;) {
        const start = text.indexOf(DSML_MARKER, from);
        if (start === -1)
            break;
        // Closing counterpart: a DSML end token (U+FF5C ... end ... U+FF5C) after
        // the marker, else consume to end-of-text.
        const rest = text.slice(start + DSML_MARKER.length);
        const closeRe = /<\uFF5C[^>]*?end[^>]*?>|<\/\uFF5CDSML[^>]*?>/;
        const cm = closeRe.exec(rest);
        const end = cm !== null ? start + DSML_MARKER.length + cm.index + cm[0].length : text.length;
        from = end;
        if (overlapsCode(start, end, codeRanges))
            continue;
        if (overlapsClaimed(start, end, claimed))
            continue;
        // Best-effort recovery — only fires on a clean name + JSON args pair.
        const span = text.slice(start, end);
        const toolCalls = [];
        const nameM = /name["\uFF5C=:\s]+["']?([A-Za-z0-9_]+)/.exec(span);
        const jsonM = /(\{[\s\S]*\})/.exec(span);
        if (nameM?.[1] && jsonM?.[1]) {
            try {
                toolCalls.push({
                    toolUseId: genToolUseId(),
                    name: nameM[1],
                    input: JSON.parse(jsonM[1])
                });
            }
            catch {
                // fall through to strip-only
            }
        }
        matches.push({
            start,
            end,
            toolCalls,
            resolvedOpeningStarts: toolCalls.length > 0 ? [start] : []
        });
        claimed.push([start, end]);
    }
    return matches;
}
/**
 * Match legacy `[Called X with args:{...}]` spans (for cleanedText) and their
 * tool calls, skipping candidates inside code.
 */
function matchBracket(text, codeRanges, claimed) {
    const matches = [];
    const pattern = /\[Called\s+(\w+)\s+with\s+args:\s*(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/gs;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        const name = m[1];
        const argsStr = m[2];
        if (!name || !argsStr)
            continue;
        if (overlapsCode(start, end, codeRanges))
            continue;
        if (overlapsClaimed(start, end, claimed))
            continue;
        let input;
        try {
            input = JSON.parse(argsStr);
        }
        catch {
            continue;
        }
        matches.push({
            start,
            end,
            toolCalls: [{ toolUseId: genToolUseId(), name, input }],
            resolvedOpeningStarts: []
        });
        claimed.push([start, end]);
    }
    return matches;
}
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
export function parseTextToolCalls(text) {
    if (!text)
        return { toolCalls: [], cleanedText: text, resolution: 'none' };
    const codeRanges = computeCodeRanges(text);
    const openings = textToolCallOpeningMarkerStarts(text);
    const claimed = [];
    const matches = [
        ...matchAnthropicXml(text, codeRanges, claimed),
        ...matchDsml(text, codeRanges, claimed),
        ...matchBracket(text, codeRanges, claimed)
    ];
    if (matches.length === 0) {
        return {
            toolCalls: [],
            cleanedText: text,
            resolution: openings.length === 0 ? 'none' : 'incomplete'
        };
    }
    matches.sort((a, b) => a.start - b.start);
    const toolCalls = [];
    const resolvedOpenings = new Set(matches.flatMap((match) => match.resolvedOpeningStarts));
    let cleanedText = '';
    let cursor = 0;
    for (const mt of matches) {
        if (mt.start < cursor)
            continue; // defensive against any residual overlap
        cleanedText += text.slice(cursor, mt.start);
        cursor = mt.end;
        toolCalls.push(...mt.toolCalls);
    }
    cleanedText += text.slice(cursor);
    const resolution = openings.length === 0
        ? 'none'
        : openings.every((opening) => resolvedOpenings.has(opening))
            ? 'complete'
            : 'incomplete';
    return { toolCalls, cleanedText, resolution };
}
