import type { KiroReasoningContent } from '../types.js'
import { type FingerprintInput } from './turn-identity.js'
/**
 * In-process correlation cache for signed reasoning envelopes.
 *
 * Bounded best-effort only: a miss is indistinguishable from the behavior before
 * this cache existed, so the worst case is zero regression. A FALSE HIT is much
 * worse than a miss — the server silently accepts (HTTP 200) a signature paired
 * with the wrong turn — so every ambiguity resolves to "do not replay".
 *
 * Never persisted, never shared across processes.
 */
export declare const DEFAULT_MAX_ENTRIES = 64
export declare const DEFAULT_MAX_ENTRIES_PER_LOOP = 16
export declare const DEFAULT_TTL_MS: number
export interface ReasoningEnvelopeMetadata {
  /** Recorded for diagnostics and eviction ONLY. Never part of the lookup key. */
  accountId: string
  attemptId: string
  loopId: string
  capturedAt: number
}
export interface CachedEnvelope {
  envelope: KiroReasoningContent
  metadata: ReasoningEnvelopeMetadata
}
export interface PublishInput extends FingerprintInput {
  envelope: KiroReasoningContent
  loopId: string
  accountId: string
  attemptId: string
}
export type LookupRefusal = 'miss' | 'ambiguous'
export interface LookupResult {
  envelope?: KiroReasoningContent
  metadata?: ReasoningEnvelopeMetadata
  refusal?: LookupRefusal
}
export interface ReasoningCorrelationCacheOptions {
  maxEntries?: number
  maxEntriesPerLoop?: number
  ttlMs?: number
  now?: () => number
}
export declare class ReasoningCorrelationCache {
  private entries
  private readonly maxEntries
  private readonly maxEntriesPerLoop
  private readonly ttlMs
  private readonly now
  constructor(options?: ReasoningCorrelationCacheOptions)
  get size(): number
  sizeForLoop(loopId: string): number
  publish(input: PublishInput): void
  /** Non-consuming: one envelope may legitimately match many replayed turns. */
  lookup(input: FingerprintInput): LookupResult
  /** Teardown for exactly one loop. Never a global sweep. */
  clearLoop(loopId: string): void
  clearAllForTests(): void
  private purgeExpired
  private enforceLoopBound
  private enforceGlobalBound
  private evictOldest
}
export declare const reasoningCorrelationCache: ReasoningCorrelationCache
