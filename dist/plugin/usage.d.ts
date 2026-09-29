import type { KiroAuthDetails, ManagedAccount } from './types.js'
interface UsageSnapshot {
  usedCount: number
  limitCount: number
  overageCount: number
  email?: string
}
interface UsageUpdateMeta extends UsageSnapshot {
  lastSync: number
}
interface AccountUsageManager {
  updateUsage(id: string, meta: UsageUpdateMeta): void
}
export declare function fetchUsageLimits(
  auth: KiroAuthDetails,
  signal?: AbortSignal
): Promise<UsageSnapshot>
export declare function updateAccountQuota(
  account: ManagedAccount,
  usage: Partial<UsageSnapshot>,
  accountManager?: AccountUsageManager
): void
export {}
