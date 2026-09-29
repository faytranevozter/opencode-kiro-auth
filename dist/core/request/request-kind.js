import { createHash } from 'node:crypto';
export const KIRO_REQUEST_KIND_HEADER = 'x-opencode-kiro-request-kind';
export const KIRO_DIAGNOSTIC_TRACE_HEADER = 'x-opencode-kiro-diagnostic-trace';
export const KIRO_DIAGNOSTIC_SESSION_HEADER = 'x-opencode-kiro-session-hash';
export const KIRO_DIAGNOSTIC_AGENT_HEADER = 'x-opencode-kiro-agent-hash';
export const KIRO_DIAGNOSTIC_MESSAGE_HEADER = 'x-opencode-kiro-message-hash';
const PRIVATE_HEADERS = [
    KIRO_REQUEST_KIND_HEADER,
    KIRO_DIAGNOSTIC_TRACE_HEADER,
    KIRO_DIAGNOSTIC_SESSION_HEADER,
    KIRO_DIAGNOSTIC_AGENT_HEADER,
    KIRO_DIAGNOSTIC_MESSAGE_HEADER
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{16}$/;
function headerValue(headers, name) {
    if (!headers)
        return null;
    try {
        return new Headers(headers).get(name);
    }
    catch {
        return null;
    }
}
function preferredHeaderValue(initHeaders, inputHeaders, name) {
    return headerValue(initHeaders, name) ?? headerValue(inputHeaders, name);
}
/** Stable one-way identity used only for cross-log correlation. */
export function hashDiagnosticIdentity(value) {
    if (typeof value !== 'string' || value.length === 0)
        return undefined;
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
export function consumeKiroRequestMetadata(input, init) {
    const inputHeaders = typeof input === 'object' && input !== null && 'headers' in input
        ? (input.headers ?? undefined)
        : undefined;
    const raw = preferredHeaderValue(init?.headers, inputHeaders, KIRO_REQUEST_KIND_HEADER);
    const requestKind = raw === null ? 'normal' : raw === 'compaction' ? 'compaction' : 'unknown';
    const trace = preferredHeaderValue(init?.headers, inputHeaders, KIRO_DIAGNOSTIC_TRACE_HEADER);
    const sessionHash = preferredHeaderValue(init?.headers, inputHeaders, KIRO_DIAGNOSTIC_SESSION_HEADER);
    const agentHash = preferredHeaderValue(init?.headers, inputHeaders, KIRO_DIAGNOSTIC_AGENT_HEADER);
    const messageHash = preferredHeaderValue(init?.headers, inputHeaders, KIRO_DIAGNOSTIC_MESSAGE_HEADER);
    const diagnostics = {
        ...(trace !== null && UUID_PATTERN.test(trace)
            ? { diagnosticTraceId: trace.toLowerCase() }
            : {}),
        ...(sessionHash !== null && HASH_PATTERN.test(sessionHash) ? { sessionHash } : {}),
        ...(agentHash !== null && HASH_PATTERN.test(agentHash) ? { agentHash } : {}),
        ...(messageHash !== null && HASH_PATTERN.test(messageHash) ? { messageHash } : {})
    };
    if (!init?.headers)
        return { requestKind, diagnostics, init };
    const headers = new Headers(init.headers);
    for (const name of PRIVATE_HEADERS)
        headers.delete(name);
    return {
        requestKind,
        diagnostics,
        init: {
            ...init,
            headers
        }
    };
}
/** Backward-compatible narrow view for callers that only need request kind. */
export function consumeKiroRequestKind(input, init) {
    const consumed = consumeKiroRequestMetadata(input, init);
    return { requestKind: consumed.requestKind, init: consumed.init };
}
