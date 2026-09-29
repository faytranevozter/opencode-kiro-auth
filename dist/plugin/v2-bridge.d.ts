import type { RequestHandler } from '../core/request/request-handler.js'
type Toast = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void
/**
 * V2's HTTP hooks cannot replace an outbound response before the native fetch.
 * A loopback endpoint lets the OpenAI-compatible driver retain its normal SSE
 * parsing while RequestHandler continues to own the AWS SDK exchange.
 */
export declare function startKiroBridge(
  handler: Pick<RequestHandler, 'handle'>,
  showToast: Toast
): Promise<{
  baseURL: string
  close: () => Promise<void>
}>
export {}
