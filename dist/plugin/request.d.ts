import type {
  CodeWhispererRequest,
  Effort,
  KiroAuthDetails,
  PreparedRequest,
  SdkPreparedRequest
} from './types.js'
interface SdkRequestOptions {
  effort?: Effort
  autoEffortMapping?: boolean
  disableReasoningReplay?: boolean
}
type ToastFunction = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void
export declare function transformToCodeWhisperer(
  _url: string,
  body: any,
  model: string,
  auth: KiroAuthDetails,
  think?: boolean,
  budget?: number
): PreparedRequest
export declare function stripReasoningContent(
  conversationState: CodeWhispererRequest['conversationState']
): void
export declare function transformToSdkRequest(
  body: any,
  model: string,
  auth: KiroAuthDetails,
  think?: boolean,
  budget?: number,
  showToast?: ToastFunction,
  options?: SdkRequestOptions
): SdkPreparedRequest
export {}
