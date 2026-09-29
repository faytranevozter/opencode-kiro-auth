import { type LogMaintenanceOptions } from './log-maintenance.js'
export interface LoggingOptions extends LogMaintenanceOptions {
  log_segment_size_mb: number
}
export declare function log(message: string, ...args: unknown[]): void
export declare function error(message: string, ...args: unknown[]): void
export declare function warn(message: string, ...args: unknown[]): void
export declare function debug(message: string, ...args: unknown[]): void
export declare function logApiRequest(data: unknown, timestamp: string): void
export declare function logApiResponse(data: unknown, timestamp: string): void
export declare function logApiError(
  requestData: Record<string, unknown>,
  responseData: Record<string, unknown>,
  timestamp: string
): void
export declare function getTimestamp(): string
export declare function configureLogging(next: LoggingOptions): void
export declare function runLogMaintenanceNow(): Promise<void>
export declare function resetLoggingForTests(): void
