export interface RedactedSignature {
  present: true
  length: number
  sha256Prefix: string
}
export interface RedactedBytes {
  present: true
  byteLength: number
  sha256Prefix: string
}
export interface RedactedReasoningText {
  textLength: number
  textSha256Prefix: string
  signature:
    | RedactedSignature
    | {
        present: false
      }
}
export interface RedactedReasoningEnvelope {
  redacted: true
  kind: 'reasoningText' | 'redactedContent' | 'unknown'
  reasoningText?: RedactedReasoningText
  redactedContent?: RedactedBytes
}
/** Short digest prefix — enough to correlate two log lines, useless for replay. */
export declare function sha256Prefix(input: string | Uint8Array): string
export declare function describeSignatureForLog(signature: string): RedactedSignature
export declare function describeRedactedBytesForLog(bytes: Uint8Array): RedactedBytes
/**
 * Collapses a reasoning envelope — the nested wire form
 * `{reasoningText:{text,signature}}` / `{redactedContent}` or the internal
 * `{kind,text,signature}` / `{kind,bytes}` form — into lengths and digest prefixes.
 */
export declare function describeReasoningContentForLog(value: unknown): RedactedReasoningEnvelope
/**
 * Deep-copies `value`, replacing every reasoning signature and every redacted byte
 * payload with a `{present, length|byteLength, sha256Prefix}` descriptor. Everything
 * else — including image bytes, which the API log intentionally base64-encodes — is
 * passed through untouched. Throws on a circular structure, exactly as
 * `JSON.stringify` would.
 */
export declare function redactReasoningForLog(value: unknown): unknown
