import type { Effort } from './config/schema.js'
/**
 * Effort levels ordered from lowest to highest reasoning depth.
 */
export declare const EFFORT_LEVELS: readonly Effort[]
/**
 * Check if a model supports the effort parameter.
 */
export declare function supportsEffort(kiroModel: string): boolean
/**
 * Check if a model supports xhigh effort level.
 */
export declare function supportsXHighEffort(kiroModel: string): boolean
/**
 * Build the additionalModelRequestFields payload carrying the effort level.
 *
 * GPT and Claude take effort through different, mutually-exclusive wire fields
 * (each rejects the other's with HTTP 400, probe-confirmed):
 * - GPT (Mantle):  `reasoning.effort`
 * - Claude:        `output_config.effort`
 */
export declare function buildEffortRequestFields(
  kiroModel: string,
  effort: Effort
): Record<string, unknown>
/**
 * Resolve effort level for a given model.
 * - Returns undefined if model doesn't support effort
 * - Clamps xhigh to max for models that don't support it
 */
export declare function resolveEffort(kiroModel: string, requested: Effort): Effort | undefined
/**
 * Map OpenCode thinking budget to Kiro effort level.
 *
 * OpenCode sends thinkingBudget from its variant config. Standard values:
 * - low:    8192
 * - medium: 16384
 * - high:   24576
 * - max:    32768
 *
 * We map these ranges to Kiro effort levels:
 * - ≤10000  → low
 * - ≤20000  → medium
 * - ≤28000  → high
 * - ≤32768  → max (or xhigh on opus-4.7/4.8, max otherwise)
 * - >32768  → max
 */
export declare function budgetToEffort(budget: number, kiroModel: string): Effort | undefined
/**
 * Get the effective effort level based on config, budget, and model.
 *
 * Priority:
 * 1. Explicit effort config (if set) - always applied regardless of thinking state
 * 2. Budget-to-effort mapping (if auto_effort_mapping enabled and thinking)
 * 3. 'medium' default (if thinking enabled)
 * 4. undefined (if not thinking)
 */
export declare function getEffectiveEffort(
  kiroModel: string,
  thinking: boolean,
  budget: number,
  configEffort?: Effort,
  autoEffortMapping?: boolean
): Effort | undefined
