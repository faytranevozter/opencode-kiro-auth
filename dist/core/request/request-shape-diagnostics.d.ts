import type { DiagnosticLogLevel } from '../../plugin/config/schema.js'
import type { RequestTerminalSource } from '../../plugin/streaming/stream-observer.js'
import type { SdkPreparedRequest } from '../../plugin/types.js'
import type { KiroRequestDiagnostics } from './request-kind.js'
export declare const REQUEST_SHAPE_DIAGNOSTICS_LOG = 'Kiro request shape diagnostics'
export interface DiagnosticContext extends KiroRequestDiagnostics {
  readonly level: DiagnosticLogLevel
}
export declare function createDiagnosticContext(
  level: DiagnosticLogLevel,
  diagnostics: KiroRequestDiagnostics
): DiagnosticContext
export declare function diagnosticContextLogFields(
  context: DiagnosticContext
): Record<string, unknown>
export declare function buildRequestShapeDiagnostics(
  body: unknown,
  prepared: SdkPreparedRequest,
  level: DiagnosticLogLevel
): Record<string, unknown>
export declare function buildStreamTerminalDiagnostics(
  level: DiagnosticLogLevel,
  source: RequestTerminalSource | null,
  emittedToolCount: number
): Record<string, unknown>
