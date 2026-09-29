import type { Effort } from './types.js'
export declare function resolveKiroModel(model: string): string
export interface ResolvedModelVariant {
  wireId: string
  effort?: Effort
}
/**
 * Resolve a (possibly effort-variant) model id into its Kiro wire id plus an
 * optional parsed effort level.
 *
 * Parse rule (unambiguous, single source of truth):
 * An id is an effort variant ONLY IF it ends with `-<suffix>` for some suffix
 * in EFFORT_SUFFIXES AND the id with that `-<suffix>` removed is in
 * VARIANT_BASE_ALLOWLIST. In that case the wire id is derived SOLELY from the
 * base via MODEL_MAPPING and the effort SOLELY from the parsed suffix.
 *
 * This guarantees ids like `claude-opus-4-8-thinking`, `claude-sonnet-4-5-1m`,
 * and the plain bases (`claude-opus-4-8`) are NEVER parsed as effort variants.
 * Non-variant ids fall through to `resolveKiroModel` (existing behavior/throw)
 * with `effort` left undefined.
 */
export declare function resolveModelVariant(model: string): ResolvedModelVariant
export declare function stripModelSuffix(model: string): string
export declare function getContextWindowSize(model: string): number
