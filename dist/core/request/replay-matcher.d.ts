import { type EmittedToolUse } from '../../plugin/reasoning/emitted-output.js'
export type ReplayPrefix = {
  readonly reasoningText: string
  readonly visibleText: string
  readonly toolUses: readonly EmittedToolUse[]
}
export type ReplayDivergenceChannel = 'reasoning' | 'text' | 'tool' | 'early_end' | 'none'
export type ReplayMatchProgress = {
  readonly matchedReasoningChars: number
  readonly matchedVisibleChars: number
  readonly matchedToolCount: number
}
export type ReplayMatchResult =
  | {
      readonly kind: 'withheld'
    }
  | {
      readonly kind: 'release'
      readonly chunks: readonly unknown[]
      readonly caughtUp: boolean
    }
  | {
      readonly kind: 'diverged'
      readonly channel: Exclude<ReplayDivergenceChannel, 'none'>
    }
/**
 * Matches one transformed replay against an already delivered three-channel prefix.
 * Mutation is intentional: this object is a per-attempt accumulator and publication gate.
 */
export declare class ExactReplayMatcher {
  private readonly prefix
  private readonly expectedTools
  private readonly replayed
  private readonly toolPositions
  private readonly bufferedSuffix
  private reasoningOffset
  private visibleOffset
  private matchedTools
  private caughtUp
  private divergence
  constructor(prefix: ReplayPrefix)
  consume(chunk: unknown): ReplayMatchResult
  progress(): ReplayMatchProgress
  private matchTools
  private channelsCaughtUp
  private diverge
}
