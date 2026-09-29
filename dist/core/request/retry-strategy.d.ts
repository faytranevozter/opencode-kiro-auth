interface RetryConfig {
  max_request_iterations: number
}
interface RetryContext {
  iterations: number
}
export declare class RetryStrategy {
  private config
  constructor(config: RetryConfig)
  shouldContinue(context: RetryContext): {
    canContinue: boolean
    error?: string
  }
  createContext(): RetryContext
}
export {}
