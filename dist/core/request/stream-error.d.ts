export interface UpstreamUnexpectedPayload {
  retryable: true
  phase: 'stream'
  emittedOutput: boolean
  code: 'UPSTREAM_UNEXPECTED'
}
export declare class SdkEventStreamIterationError extends Error {
  readonly name = 'SdkEventStreamIterationError'
  constructor(cause: unknown)
}
export declare class UpstreamUnexpectedError extends Error {
  readonly emittedOutput: boolean
  readonly name = 'UpstreamUnexpectedError'
  readonly retryable = true
  readonly phase = 'stream'
  readonly code = 'UPSTREAM_UNEXPECTED'
  constructor(cause: unknown, emittedOutput: boolean)
  toPayload(): UpstreamUnexpectedPayload
  toResponse(): Response
}
