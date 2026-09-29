import type {
  CodeWhispererRequest,
  KiroAuthDetails,
  SdkPreparedRequest
} from '../../plugin/types.js'
import type { KiroRequestKind } from './request-kind.js'
export interface RecoverySemanticSnapshot {
  readonly recoveryGroupId: string
  readonly semanticFingerprint: string
  readonly initialSemanticFingerprint: string
  readonly conversationState: CodeWhispererRequest['conversationState']
  readonly conversationId: string
  readonly initialConversationId: string
  readonly streaming: boolean
  readonly effectiveModel: string
  readonly effort?: SdkPreparedRequest['effort']
  readonly requestKind: KiroRequestKind
  readonly disableReasoningReplay: boolean
}
export interface RecoverySnapshotOptions {
  readonly requestKind: KiroRequestKind
  readonly disableReasoningReplay: boolean
}
export declare function createRecoverySemanticSnapshot(
  prepared: SdkPreparedRequest,
  options: RecoverySnapshotOptions,
  previous?: RecoverySemanticSnapshot
): RecoverySemanticSnapshot
export declare function bindRecoverySemanticSnapshot(
  snapshot: RecoverySemanticSnapshot,
  auth: KiroAuthDetails
): SdkPreparedRequest
export declare function recoveryIdentityLogFields(
  snapshot: RecoverySemanticSnapshot
): Record<string, unknown>
export declare function accountLogAlias(accountId: string): string
