import { describeReasoningContentForLog } from '../../plugin/log-redaction.js'
import type {
  CodeWhispererMessage,
  ManagedAccount,
  SdkPreparedRequest
} from '../../plugin/types.js'
export interface HistoryReasoningSummary {
  index: number
  envelope: ReturnType<typeof describeReasoningContentForLog>
}
export declare function summarizeHistoryReasoning(
  history: readonly CodeWhispererMessage[] | undefined
): HistoryReasoningSummary[]
/**
 * The API-log payload for one outbound `generateAssistantResponse` call. Carries the
 * request shape, never the replayed history itself: only `historyLength` plus a
 * per-turn sanitized reasoning summary (§6.8).
 */
export declare function buildSdkRequestLogPayload(
  prep: SdkPreparedRequest,
  account: Pick<ManagedAccount, 'id' | 'email'>
): Record<string, unknown>
