import {
  GenerateAssistantResponseCommand,
  type GenerateAssistantResponseCommandOutput
} from '@aws/codewhisperer-streaming-client'
import type { KiroConfig } from '../../plugin/config/index.js'
import { EmittedOutputAccumulator } from '../../plugin/reasoning/emitted-output.js'
import { StreamObserver } from '../../plugin/streaming/stream-observer.js'
import type { KiroAuthDetails, ManagedAccount, SdkPreparedRequest } from '../../plugin/types.js'
import { type RecoverySemanticSnapshot } from './recovery-request-identity.js'
import { type DiagnosticContext } from './request-shape-diagnostics.js'
import type {
  ResponseHandler,
  SdkCompletionPayload,
  SdkStreamingAttempt
} from './response-handler.js'
type RecoveryConfig = Pick<
  KiroConfig,
  | 'enable_log_api_request'
  | 'request_timeout_ms'
  | 'sdk_http_keep_alive'
  | 'sdk_response_timeout_enabled'
  | 'sdk_response_timeout_ms'
  | 'stream_event_timeout_enabled'
  | 'stream_max_attempts'
  | 'stream_recovery_mode'
>
export type RecoveryAttemptSeed = {
  readonly account: ManagedAccount
  readonly auth: KiroAuthDetails
  readonly prepared: SdkPreparedRequest
  readonly snapshot: RecoverySemanticSnapshot
  readonly observer: StreamObserver
  readonly emitted: EmittedOutputAccumulator
  readonly eventCount: number
  readonly startedAt: number
  readonly apiTimestamp: string | null
}
export type RecoveryRequestContext = {
  readonly body: unknown
  readonly model: string
  readonly think: boolean
  readonly budget: number
  readonly disableReasoningReplay: boolean
  readonly inheritedLoopId: string | undefined
  readonly signal: AbortSignal
  readonly priorStreamFailures: number
  readonly diagnosticContext: DiagnosticContext
}
export type RecoveryAttemptServices = {
  readonly consumeRequestIteration: () => void
  readonly toAuthDetails: (account: ManagedAccount) => KiroAuthDetails
  readonly refreshAccount: (
    account: ManagedAccount,
    auth: KiroAuthDetails
  ) => Promise<{
    readonly account: ManagedAccount
    readonly shouldContinue: boolean
  }>
  readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>
  readonly prepareRequest: (
    account: ManagedAccount,
    auth: KiroAuthDetails
  ) => {
    readonly prepared: SdkPreparedRequest
    readonly snapshot: RecoverySemanticSnapshot
  }
  readonly makeSdkClient: (
    auth: KiroAuthDetails,
    prepared: SdkPreparedRequest
  ) => {
    readonly send: (
      command: GenerateAssistantResponseCommand,
      options: {
        readonly abortSignal: AbortSignal
      }
    ) => Promise<GenerateAssistantResponseCommandOutput>
  }
  readonly responseHandler: ResponseHandler
  readonly beginUpstreamWait: (
    phase: 'SDK response' | 'stream event',
    timeoutMs: number,
    details: Record<string, unknown>
  ) => void
  readonly endUpstreamWait: () => void
  readonly nextAccountAttemptEpoch: (accountId: string) => number
  readonly isAccountAttemptCurrent: (accountId: string, epoch: number) => boolean
  readonly setCurrentAttemptId: (attemptId: string) => void
  readonly getCurrentAttemptId: () => string
  readonly markSuccessful: (account: ManagedAccount) => void
  readonly syncUsage: (
    account: ManagedAccount,
    auth: KiroAuthDetails,
    isCurrent: () => boolean
  ) => Promise<void>
  readonly commitReasoning: (
    completed: SdkCompletionPayload | undefined,
    accountId: string,
    owningAttemptId: string,
    latestAttemptId: string
  ) => void
  readonly logSdkRequest: (
    prepared: SdkPreparedRequest,
    account: ManagedAccount,
    timestamp: string
  ) => void
  readonly logSdkResponse: (prepared: SdkPreparedRequest, timestamp: string) => void
  readonly markSendResolved: () => void
  readonly describeError: (error: unknown) => unknown
}
export type RecoveryAttemptResult = {
  readonly account: ManagedAccount
  readonly handle: SdkStreamingAttempt
  readonly logDetails: (details?: Record<string, unknown>) => Record<string, unknown>
}
export type RecoveryAttemptFactoryOptions = {
  readonly config: RecoveryConfig
  readonly request: RecoveryRequestContext
  readonly initial: RecoveryAttemptSeed
  readonly services: RecoveryAttemptServices
}
export declare class RecoveryAttemptFactory {
  private readonly config
  private readonly request
  private readonly initial
  private readonly services
  constructor(options: RecoveryAttemptFactoryOptions)
  open(attemptIndex: number, selectedAccount: ManagedAccount): Promise<RecoveryAttemptResult>
  private resolveAttemptState
  private beginSdkResponseWait
}
export {}
