export type AccountFailureClass = 'quota_or_rate_limit' | 'other'
export declare function classifyAccountFailure(
  error: unknown,
  responseStatus?: number
): AccountFailureClass
