import { CodeWhispererStreamingClient } from '@aws/codewhisperer-streaming-client'
import type { Effort, KiroAuthDetails } from './types.js'
export interface SdkTransportOptions {
  /**
   * Controls reuse only after a request completes. It does not cap concurrent
   * active streams; maxSockets remains at the Smithy default of 50.
   */
  keepAlive?: boolean
}
export declare function injectEffortIntoSerializedBody(body: unknown, effort: Effort): unknown
export declare function createSdkClient(
  auth: KiroAuthDetails,
  region: string,
  effort?: Effort,
  transport?: SdkTransportOptions
): CodeWhispererStreamingClient
export declare function clearSdkClientCache(): void
