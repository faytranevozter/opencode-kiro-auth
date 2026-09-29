import { z } from 'zod'
export declare const AccountSelectionStrategySchema: z.ZodEnum<
  ['sticky', 'round-robin', 'lowest-usage']
>
export type AccountSelectionStrategy = z.infer<typeof AccountSelectionStrategySchema>
/**
 * Kiro effort levels control thinking/reasoning depth.
 * - low: minimal reasoning
 * - medium: balanced (default when thinking enabled)
 * - high: deeper reasoning
 * - xhigh: extended reasoning (opus-4.7, opus-4.8 only)
 * - max: maximum reasoning depth (128k thinking tokens on opus-4.7/4.8)
 */
export declare const EffortSchema: z.ZodEnum<['low', 'medium', 'high', 'xhigh', 'max']>
export type Effort = z.infer<typeof EffortSchema>
/**
 * Recovery strategy applied when an upstream event stream fails after output.
 * - off: no recovery; behavior is byte-for-byte identical to pre-recovery builds
 * - reasoning_restart: restart the turn from accumulated reasoning instead of
 *   replaying already-emitted content
 * - exact_replay: includes reasoning_restart, then uses exact three-channel shadow
 *   replay when visible text or tools have already been delivered
 * The literal strings must stay identical to `StreamRecoveryMode` in
 * src/core/request/stream-recovery.ts (the coordinator consumes this value).
 */
export declare const StreamRecoveryModeSchema: z.ZodEnum<
  ['off', 'reasoning_restart', 'exact_replay']
>
export type StreamRecoveryMode = z.infer<typeof StreamRecoveryModeSchema>
/** Privacy-safe structural diagnostics for request assembly and stream termination. */
export declare const DiagnosticLogLevelSchema: z.ZodEnum<['off', 'basic', 'verbose']>
export type DiagnosticLogLevel = z.infer<typeof DiagnosticLogLevelSchema>
export declare const RegionSchema: z.ZodEnum<
  [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'af-south-1',
    'ap-east-1',
    'ap-south-2',
    'ap-southeast-3',
    'ap-southeast-5',
    'ap-southeast-4',
    'ap-south-1',
    'ap-southeast-6',
    'ap-northeast-3',
    'ap-northeast-2',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-east-2',
    'ap-southeast-7',
    'ap-northeast-1',
    'ca-central-1',
    'ca-west-1',
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-south-1',
    'eu-west-3',
    'eu-south-2',
    'eu-north-1',
    'eu-central-2',
    'il-central-1',
    'mx-central-1',
    'me-south-1',
    'me-central-1',
    'sa-east-1'
  ]
>
export type Region = z.infer<typeof RegionSchema>
export declare const KiroConfigSchema: z.ZodObject<
  {
    $schema: z.ZodOptional<z.ZodString>
    idc_start_url: z.ZodOptional<z.ZodString>
    idc_region: z.ZodOptional<
      z.ZodEnum<
        [
          'us-east-1',
          'us-east-2',
          'us-west-1',
          'us-west-2',
          'af-south-1',
          'ap-east-1',
          'ap-south-2',
          'ap-southeast-3',
          'ap-southeast-5',
          'ap-southeast-4',
          'ap-south-1',
          'ap-southeast-6',
          'ap-northeast-3',
          'ap-northeast-2',
          'ap-southeast-1',
          'ap-southeast-2',
          'ap-east-2',
          'ap-southeast-7',
          'ap-northeast-1',
          'ca-central-1',
          'ca-west-1',
          'eu-central-1',
          'eu-west-1',
          'eu-west-2',
          'eu-south-1',
          'eu-west-3',
          'eu-south-2',
          'eu-north-1',
          'eu-central-2',
          'il-central-1',
          'mx-central-1',
          'me-south-1',
          'me-central-1',
          'sa-east-1'
        ]
      >
    >
    idc_profile_arn: z.ZodOptional<z.ZodString>
    account_selection_strategy: z.ZodDefault<z.ZodEnum<['sticky', 'round-robin', 'lowest-usage']>>
    /**
     * Give each process a distinct start index so simultaneous starts spread
     * across accounts.
     */
    distribute_across_processes: z.ZodDefault<z.ZodBoolean>
    /**
     * Re-pick the lowest-usage account for every request instead of pinning one.
     * Overrides sticky selection.
     */
    per_request_spread: z.ZodDefault<z.ZodBoolean>
    /**
     * Softly avoid accounts whose usage ratio is at/above
     * `quota_reserve_threshold` when other accounts still have room. When ALL
     * healthy accounts are near-full they are drained anyway (the real 402 in
     * error-handler is the authoritative hard-switch). Only affects
     * multi-account selection; single-account behavior is unchanged.
     */
    quota_avoidance_enabled: z.ZodDefault<z.ZodBoolean>
    /**
     * Usage ratio (used/limit) at/above which an account is considered
     * near-full and softly avoided. Default 0.95 (95%).
     */
    quota_reserve_threshold: z.ZodDefault<z.ZodNumber>
    /**
     * Exclude accounts that have entered AWS paid overage from selection.
     */
    stop_on_overage: z.ZodDefault<z.ZodBoolean>
    /**
     * Paid-overage invocations tolerated before stopping an account. 0 means
     * stop on any overage.
     */
    overage_threshold: z.ZodDefault<z.ZodNumber>
    default_region: z.ZodDefault<
      z.ZodEnum<
        [
          'us-east-1',
          'us-east-2',
          'us-west-1',
          'us-west-2',
          'af-south-1',
          'ap-east-1',
          'ap-south-2',
          'ap-southeast-3',
          'ap-southeast-5',
          'ap-southeast-4',
          'ap-south-1',
          'ap-southeast-6',
          'ap-northeast-3',
          'ap-northeast-2',
          'ap-southeast-1',
          'ap-southeast-2',
          'ap-east-2',
          'ap-southeast-7',
          'ap-northeast-1',
          'ca-central-1',
          'ca-west-1',
          'eu-central-1',
          'eu-west-1',
          'eu-west-2',
          'eu-south-1',
          'eu-west-3',
          'eu-south-2',
          'eu-north-1',
          'eu-central-2',
          'il-central-1',
          'mx-central-1',
          'me-south-1',
          'me-central-1',
          'sa-east-1'
        ]
      >
    >
    rate_limit_retry_delay_ms: z.ZodDefault<z.ZodNumber>
    rate_limit_max_retries: z.ZodDefault<z.ZodNumber>
    max_request_iterations: z.ZodDefault<z.ZodNumber>
    /**
     * Opt into a fixed deadline covering client.send() and the first stream event.
     * Disabled by default because a pending request is ambiguous: Kiro may
     * still be performing a valid long-running generation.
     */
    sdk_response_timeout_enabled: z.ZodDefault<z.ZodBoolean>
    /**
     * Maximum wait for the initial SDK response and first stream event.
     * Only used when sdk_response_timeout_enabled is true.
     */
    sdk_response_timeout_ms: z.ZodDefault<z.ZodNumber>
    /**
     * Reuse completed SDK HTTP connections across requests. Disabled by default
     * because Bun can surface stale pooled sockets as mid-stream ECONNRESET.
     * Active requests remain fully concurrent when this is false.
     */
    sdk_http_keep_alive: z.ZodDefault<z.ZodBoolean>
    /**
     * Opt into a fixed inactivity deadline between upstream stream events.
     * Disabled by default because a silent event gap is ambiguous: Kiro may
     * still be performing a valid long-running generation.
     */
    stream_event_timeout_enabled: z.ZodDefault<z.ZodBoolean>
    /**
     * Maximum inactivity between upstream stream events.
     * Only used when stream_event_timeout_enabled is true.
     */
    request_timeout_ms: z.ZodDefault<z.ZodNumber>
    /**
     * Consume the complete Kiro event stream before exposing any semantic output
     * downstream. This trades live token display for safe retries after a
     * mid-stream transport failure without duplicating content or tool calls.
     */
    stream_buffer_until_complete: z.ZodDefault<z.ZodBoolean>
    /**
     * Atomically buffer OpenCode compaction summaries while leaving ordinary
     * chat requests live. The request is identified by the plugin's private
     * chat.headers marker.
     */
    compaction_buffer_until_complete: z.ZodDefault<z.ZodBoolean>
    /**
     * Maximum number of complete event-stream attempts. Buffered mode can safely
     * use every attempt even when the failed upstream stream produced output.
     */
    stream_max_attempts: z.ZodDefault<z.ZodNumber>
    /**
     * Recovery strategy for an upstream event stream that fails after output.
     * Defaults to 'off' during Phase 1 rollout; the default flips to
     * 'reasoning_restart' only after Phase 1 acceptance.
     */
    stream_recovery_mode: z.ZodDefault<z.ZodEnum<['off', 'reasoning_restart', 'exact_replay']>>
    /**
     * Experimental: preserve one Kiro conversationId when a recovery attempt
     * moves to another account. Disabled until a real API A/B confirms that Kiro
     * accepts the identity with a different profileArn.
     */
    stream_recovery_reuse_conversation_id_across_accounts: z.ZodDefault<z.ZodBoolean>
    token_expiry_buffer_ms: z.ZodDefault<z.ZodNumber>
    /**
     * Opt-in leader-elected keep-alive that proactively rotates idle-account
     * tokens near expiry. Disabled by default until proven in real sessions.
     */
    token_keepalive_enabled: z.ZodDefault<z.ZodBoolean>
    /**
     * Interval for the leader-elected keep-alive scan that keeps idle-account
     * refresh tokens rotating. Default 10 minutes; bounded to 1 minute-1 hour.
     */
    token_keepalive_interval_ms: z.ZodDefault<z.ZodNumber>
    /** Minimum interval between automatic full account refresh passes. */
    refresh_all_cooldown_ms: z.ZodDefault<z.ZodNumber>
    /** Maximum latency an automatic pre-switch refresh may add to a request. */
    refresh_all_deadline_ms: z.ZodDefault<z.ZodNumber>
    /** Refresh all account tokens and usage before choosing a failover account. */
    refresh_before_switch_enabled: z.ZodDefault<z.ZodBoolean>
    usage_sync_max_retries: z.ZodDefault<z.ZodNumber>
    auth_server_port_start: z.ZodDefault<z.ZodNumber>
    auth_server_port_range: z.ZodDefault<z.ZodNumber>
    usage_tracking_enabled: z.ZodDefault<z.ZodBoolean>
    auto_sync_kiro_cli: z.ZodDefault<z.ZodBoolean>
    enable_log_api_request: z.ZodDefault<z.ZodBoolean>
    /**
     * Emit privacy-safe request correlation and shape diagnostics. No level logs
     * prompt text, reasoning text, tool arguments, signatures, or account data.
     */
    diagnostic_log_level: z.ZodDefault<z.ZodEnum<['off', 'basic', 'verbose']>>
    /**
     * Delete archived and detailed logs after this many days.
     */
    log_retention_days: z.ZodDefault<z.ZodNumber>
    /**
     * Maximum combined size of managed log files. Oldest archived logs are
     * removed first; active files are rotated separately.
     */
    log_max_total_size_mb: z.ZodDefault<z.ZodNumber>
    /**
     * Compress inactive API log segments after this many days.
     */
    log_compress_after_days: z.ZodDefault<z.ZodNumber>
    /**
     * Rotate plugin.log and detailed API NDJSON files at this size.
     */
    log_segment_size_mb: z.ZodDefault<z.ZodNumber>
    /**
     * Enable config-gated debug logging that records the inbound
     * OpenAI-compatible request body shape (top-level keys, reasoning-related
     * fields only — no message content) and the resolved Kiro effort for each
     * request. Independent from `enable_log_api_request`; off by default.
     */
    enable_log_effort_debug: z.ZodDefault<z.ZodBoolean>
    /**
     * Default effort level for thinking models. Controls reasoning depth.
     * When set, this overrides the automatic budget-based mapping.
     * Values: 'low', 'medium', 'high', 'xhigh' (opus-4.7/4.8 only), 'max'
     */
    effort: z.ZodOptional<z.ZodEnum<['low', 'medium', 'high', 'xhigh', 'max']>>
    /**
     * Enable automatic effort mapping from OpenCode's thinking budget.
     * When true (default), maps budget ranges to effort levels.
     * When false, only uses explicit effort config or falls back to 'medium'.
     */
    auto_effort_mapping: z.ZodDefault<z.ZodBoolean>
  },
  'strip',
  z.ZodTypeAny,
  {
    account_selection_strategy: 'sticky' | 'round-robin' | 'lowest-usage'
    distribute_across_processes: boolean
    per_request_spread: boolean
    quota_avoidance_enabled: boolean
    quota_reserve_threshold: number
    stop_on_overage: boolean
    overage_threshold: number
    default_region:
      | 'us-east-1'
      | 'us-east-2'
      | 'us-west-1'
      | 'us-west-2'
      | 'af-south-1'
      | 'ap-east-1'
      | 'ap-south-2'
      | 'ap-southeast-3'
      | 'ap-southeast-5'
      | 'ap-southeast-4'
      | 'ap-south-1'
      | 'ap-southeast-6'
      | 'ap-northeast-3'
      | 'ap-northeast-2'
      | 'ap-southeast-1'
      | 'ap-southeast-2'
      | 'ap-east-2'
      | 'ap-southeast-7'
      | 'ap-northeast-1'
      | 'ca-central-1'
      | 'ca-west-1'
      | 'eu-central-1'
      | 'eu-west-1'
      | 'eu-west-2'
      | 'eu-south-1'
      | 'eu-west-3'
      | 'eu-south-2'
      | 'eu-north-1'
      | 'eu-central-2'
      | 'il-central-1'
      | 'mx-central-1'
      | 'me-south-1'
      | 'me-central-1'
      | 'sa-east-1'
    rate_limit_retry_delay_ms: number
    rate_limit_max_retries: number
    max_request_iterations: number
    sdk_response_timeout_enabled: boolean
    sdk_response_timeout_ms: number
    sdk_http_keep_alive: boolean
    stream_event_timeout_enabled: boolean
    request_timeout_ms: number
    stream_buffer_until_complete: boolean
    compaction_buffer_until_complete: boolean
    stream_max_attempts: number
    stream_recovery_mode: 'off' | 'reasoning_restart' | 'exact_replay'
    stream_recovery_reuse_conversation_id_across_accounts: boolean
    token_expiry_buffer_ms: number
    token_keepalive_enabled: boolean
    token_keepalive_interval_ms: number
    refresh_all_cooldown_ms: number
    refresh_all_deadline_ms: number
    refresh_before_switch_enabled: boolean
    usage_sync_max_retries: number
    auth_server_port_start: number
    auth_server_port_range: number
    usage_tracking_enabled: boolean
    auto_sync_kiro_cli: boolean
    enable_log_api_request: boolean
    diagnostic_log_level: 'off' | 'basic' | 'verbose'
    log_retention_days: number
    log_max_total_size_mb: number
    log_compress_after_days: number
    log_segment_size_mb: number
    enable_log_effort_debug: boolean
    auto_effort_mapping: boolean
    $schema?: string | undefined
    idc_start_url?: string | undefined
    idc_region?:
      | 'us-east-1'
      | 'us-east-2'
      | 'us-west-1'
      | 'us-west-2'
      | 'af-south-1'
      | 'ap-east-1'
      | 'ap-south-2'
      | 'ap-southeast-3'
      | 'ap-southeast-5'
      | 'ap-southeast-4'
      | 'ap-south-1'
      | 'ap-southeast-6'
      | 'ap-northeast-3'
      | 'ap-northeast-2'
      | 'ap-southeast-1'
      | 'ap-southeast-2'
      | 'ap-east-2'
      | 'ap-southeast-7'
      | 'ap-northeast-1'
      | 'ca-central-1'
      | 'ca-west-1'
      | 'eu-central-1'
      | 'eu-west-1'
      | 'eu-west-2'
      | 'eu-south-1'
      | 'eu-west-3'
      | 'eu-south-2'
      | 'eu-north-1'
      | 'eu-central-2'
      | 'il-central-1'
      | 'mx-central-1'
      | 'me-south-1'
      | 'me-central-1'
      | 'sa-east-1'
      | undefined
    idc_profile_arn?: string | undefined
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined
  },
  {
    $schema?: string | undefined
    idc_start_url?: string | undefined
    idc_region?:
      | 'us-east-1'
      | 'us-east-2'
      | 'us-west-1'
      | 'us-west-2'
      | 'af-south-1'
      | 'ap-east-1'
      | 'ap-south-2'
      | 'ap-southeast-3'
      | 'ap-southeast-5'
      | 'ap-southeast-4'
      | 'ap-south-1'
      | 'ap-southeast-6'
      | 'ap-northeast-3'
      | 'ap-northeast-2'
      | 'ap-southeast-1'
      | 'ap-southeast-2'
      | 'ap-east-2'
      | 'ap-southeast-7'
      | 'ap-northeast-1'
      | 'ca-central-1'
      | 'ca-west-1'
      | 'eu-central-1'
      | 'eu-west-1'
      | 'eu-west-2'
      | 'eu-south-1'
      | 'eu-west-3'
      | 'eu-south-2'
      | 'eu-north-1'
      | 'eu-central-2'
      | 'il-central-1'
      | 'mx-central-1'
      | 'me-south-1'
      | 'me-central-1'
      | 'sa-east-1'
      | undefined
    idc_profile_arn?: string | undefined
    account_selection_strategy?: 'sticky' | 'round-robin' | 'lowest-usage' | undefined
    distribute_across_processes?: boolean | undefined
    per_request_spread?: boolean | undefined
    quota_avoidance_enabled?: boolean | undefined
    quota_reserve_threshold?: number | undefined
    stop_on_overage?: boolean | undefined
    overage_threshold?: number | undefined
    default_region?:
      | 'us-east-1'
      | 'us-east-2'
      | 'us-west-1'
      | 'us-west-2'
      | 'af-south-1'
      | 'ap-east-1'
      | 'ap-south-2'
      | 'ap-southeast-3'
      | 'ap-southeast-5'
      | 'ap-southeast-4'
      | 'ap-south-1'
      | 'ap-southeast-6'
      | 'ap-northeast-3'
      | 'ap-northeast-2'
      | 'ap-southeast-1'
      | 'ap-southeast-2'
      | 'ap-east-2'
      | 'ap-southeast-7'
      | 'ap-northeast-1'
      | 'ca-central-1'
      | 'ca-west-1'
      | 'eu-central-1'
      | 'eu-west-1'
      | 'eu-west-2'
      | 'eu-south-1'
      | 'eu-west-3'
      | 'eu-south-2'
      | 'eu-north-1'
      | 'eu-central-2'
      | 'il-central-1'
      | 'mx-central-1'
      | 'me-south-1'
      | 'me-central-1'
      | 'sa-east-1'
      | undefined
    rate_limit_retry_delay_ms?: number | undefined
    rate_limit_max_retries?: number | undefined
    max_request_iterations?: number | undefined
    sdk_response_timeout_enabled?: boolean | undefined
    sdk_response_timeout_ms?: number | undefined
    sdk_http_keep_alive?: boolean | undefined
    stream_event_timeout_enabled?: boolean | undefined
    request_timeout_ms?: number | undefined
    stream_buffer_until_complete?: boolean | undefined
    compaction_buffer_until_complete?: boolean | undefined
    stream_max_attempts?: number | undefined
    stream_recovery_mode?: 'off' | 'reasoning_restart' | 'exact_replay' | undefined
    stream_recovery_reuse_conversation_id_across_accounts?: boolean | undefined
    token_expiry_buffer_ms?: number | undefined
    token_keepalive_enabled?: boolean | undefined
    token_keepalive_interval_ms?: number | undefined
    refresh_all_cooldown_ms?: number | undefined
    refresh_all_deadline_ms?: number | undefined
    refresh_before_switch_enabled?: boolean | undefined
    usage_sync_max_retries?: number | undefined
    auth_server_port_start?: number | undefined
    auth_server_port_range?: number | undefined
    usage_tracking_enabled?: boolean | undefined
    auto_sync_kiro_cli?: boolean | undefined
    enable_log_api_request?: boolean | undefined
    diagnostic_log_level?: 'off' | 'basic' | 'verbose' | undefined
    log_retention_days?: number | undefined
    log_max_total_size_mb?: number | undefined
    log_compress_after_days?: number | undefined
    log_segment_size_mb?: number | undefined
    enable_log_effort_debug?: boolean | undefined
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined
    auto_effort_mapping?: boolean | undefined
  }
>
export type KiroConfig = z.infer<typeof KiroConfigSchema>
export declare const DEFAULT_CONFIG: KiroConfig
