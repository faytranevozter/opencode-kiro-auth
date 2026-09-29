export interface LogMaintenanceOptions {
  log_retention_days: number
  log_max_total_size_mb: number
  log_compress_after_days: number
}
export declare function configureLogMaintenance(next: LogMaintenanceOptions): void
export declare function scheduleLogMaintenance(): void
export declare function runLogMaintenance(): Promise<void>
export declare function markLogReady(path: string): void
export declare function ensureLogsDir(): string
export declare function shouldRotateLog(
  path: string,
  maxBytes: number,
  additionalBytes?: number
): boolean
export declare function resetLogMaintenanceForTests(): void
