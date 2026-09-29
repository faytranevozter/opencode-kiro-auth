import { CodeWhispererStreamingClient } from '@aws/codewhisperer-streaming-client';
import { KIRO_CONSTANTS } from '../constants.js';
import { buildEffortRequestFields } from './effort.js';
const clientCache = new Map();
const KIRO_CLI_MAX_ATTEMPTS = 3;
const SDK_MAX_SOCKETS = 50;
const UTF8_DECODER = new TextDecoder();
const UTF8_ENCODER = new TextEncoder();
export function injectEffortIntoSerializedBody(body, effort) {
    let bodyText;
    let encodeAsBytes = false;
    if (typeof body === 'string') {
        bodyText = body;
    }
    else if (body instanceof Uint8Array) {
        bodyText = UTF8_DECODER.decode(body);
        encodeAsBytes = true;
    }
    else {
        return body;
    }
    try {
        const parsedBody = JSON.parse(bodyText);
        const wireModel = parsedBody?.conversationState?.currentMessage?.userInputMessage?.modelId;
        parsedBody.additionalModelRequestFields = buildEffortRequestFields(wireModel, effort);
        const serializedBody = JSON.stringify(parsedBody);
        return encodeAsBytes ? UTF8_ENCODER.encode(serializedBody) : serializedBody;
    }
    catch {
        return body;
    }
}
export function createSdkClient(auth, region, effort, transport = {}) {
    const keepAlive = transport.keepAlive ?? false;
    const cacheKey = `${region}:${auth.email || 'default'}:${effort || 'none'}:${keepAlive ? 'keep' : 'fresh'}`;
    const cached = clientCache.get(cacheKey);
    if (cached &&
        cached.token === auth.access &&
        cached.effort === effort &&
        cached.keepAlive === keepAlive) {
        return cached.client;
    }
    const token = auth.access;
    const client = new CodeWhispererStreamingClient({
        region,
        endpoint: `https://q.${region}.amazonaws.com`,
        token: () => Promise.resolve({ token }),
        maxAttempts: KIRO_CLI_MAX_ATTEMPTS,
        retryMode: 'standard',
        requestHandler: {
            httpsAgent: {
                keepAlive,
                maxSockets: SDK_MAX_SOCKETS
            }
        },
        customUserAgent: [[KIRO_CONSTANTS.USER_AGENT]]
    });
    // Add Kiro-specific headers
    client.middlewareStack.add((next) => async (args) => {
        args.request.headers['x-amzn-kiro-agent-mode'] = 'vibe';
        return next(args);
    }, { step: 'build', name: 'addKiroHeaders' });
    // Effort wire shape differs per family (GPT: reasoning.effort, Claude:
    // output_config.effort; each 400s the other), so derive it from the body's modelId.
    if (effort) {
        client.middlewareStack.add((next) => async (args) => {
            if (args.request?.body) {
                args.request.body = injectEffortIntoSerializedBody(args.request.body, effort);
            }
            return next(args);
        }, { step: 'build', name: 'addEffortConfig', priority: 'high' });
    }
    clientCache.set(cacheKey, { client, token, effort, keepAlive });
    return client;
}
export function clearSdkClientCache() {
    for (const entry of clientCache.values()) {
        entry.client.destroy();
    }
    clientCache.clear();
}
