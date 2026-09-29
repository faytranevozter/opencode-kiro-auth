export declare const KIRO_REQUEST_KIND_HEADER = 'x-opencode-kiro-request-kind'
export declare const KIRO_DIAGNOSTIC_TRACE_HEADER = 'x-opencode-kiro-diagnostic-trace'
export declare const KIRO_DIAGNOSTIC_SESSION_HEADER = 'x-opencode-kiro-session-hash'
export declare const KIRO_DIAGNOSTIC_AGENT_HEADER = 'x-opencode-kiro-agent-hash'
export declare const KIRO_DIAGNOSTIC_MESSAGE_HEADER = 'x-opencode-kiro-message-hash'
export type KiroRequestKind = 'normal' | 'compaction' | 'unknown'
export interface KiroRequestDiagnostics {
  readonly diagnosticTraceId?: string
  readonly sessionHash?: string
  readonly agentHash?: string
  readonly messageHash?: string
}
/** Stable one-way identity used only for cross-log correlation. */
export declare function hashDiagnosticIdentity(value: unknown): string | undefined
export declare function consumeKiroRequestMetadata(
  input: unknown,
  init: RequestInit | undefined
): {
  readonly requestKind: KiroRequestKind
  readonly diagnostics: KiroRequestDiagnostics
  readonly init: RequestInit | undefined
}
/** Backward-compatible narrow view for callers that only need request kind. */
export declare function consumeKiroRequestKind(
  input: unknown,
  init: RequestInit | undefined
): {
  readonly requestKind: KiroRequestKind
  readonly init: RequestInit | undefined
}
