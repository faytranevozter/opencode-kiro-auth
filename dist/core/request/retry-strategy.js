export class RetryStrategy {
    config;
    constructor(config) {
        this.config = config;
    }
    shouldContinue(context) {
        context.iterations++;
        if (context.iterations > this.config.max_request_iterations) {
            return {
                canContinue: false,
                error: `Exceeded max iterations (${this.config.max_request_iterations})`
            };
        }
        return { canContinue: true };
    }
    createContext() {
        return {
            iterations: 0
        };
    }
}
