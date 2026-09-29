import type { ReasoningAccumulator } from './reasoning-accumulator.js'
import type { StreamObserver } from './stream-observer.js'
/**
 * `reasoningAccumulator` and `observer` are optional write-only collaborators:
 * the transformer feeds them and never reads them back, so neither can change
 * an emitted chunk. They stay separate trailing parameters rather than one
 * options bag because every existing call site passes positionally.
 *
 * `suppressIncompleteDialect` is the one input that DOES change emission, and
 * only in a single shape: a text-dialect span that never closed. Set it when a
 * stream recovery mode is active, so a turn the response-handler is about to
 * declare semantically truncated delivers nothing from that span. Leave it
 * `false` (the default, and what `stream_recovery_mode: 'off'` must pass) to get
 * byte-identical output to the historical path.
 */
export declare function transformSdkStream(
  sdkResponse: any,
  model: string,
  conversationId: string,
  reasoningAccumulator?: ReasoningAccumulator,
  observer?: StreamObserver,
  suppressIncompleteDialect?: boolean
): AsyncGenerator<any>
