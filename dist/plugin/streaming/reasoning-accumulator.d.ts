import type { KiroReasoningContent } from '../types.js'
export interface ReasoningContentEventLike {
  text?: string | undefined
  signature?: string | undefined
  redactedContent?: Uint8Array | undefined
}
export type ReasoningEnvelopeRejection = 'conflicting-signature' | 'mixed-text-and-redacted'
export interface ReasoningAccumulatorSnapshot {
  textLength: number
  textEventCount: number
  signaturePresent: boolean
  signatureLength: number
  signatureEventCount: number
  redactedByteLength: number
  redactedEventCount: number
  rejection?: ReasoningEnvelopeRejection
}
export declare class ReasoningAccumulator {
  private text
  private signature
  private redacted
  private textEventCount
  private signatureEventCount
  private redactedEventCount
  private rejection
  observe(event: ReasoningContentEventLike | null | undefined): void
  reset(): void
  snapshot(): ReasoningAccumulatorSnapshot
  finalize(): KiroReasoningContent | undefined
  private resolveRejection
  private sanitizedShape
}
