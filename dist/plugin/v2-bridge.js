import { createServer } from 'node:http';
import { KIRO_CONSTANTS } from '../constants.js';
/**
 * V2's HTTP hooks cannot replace an outbound response before the native fetch.
 * A loopback endpoint lets the OpenAI-compatible driver retain its normal SSE
 * parsing while RequestHandler continues to own the AWS SDK exchange.
 */
export async function startKiroBridge(handler, showToast) {
    const upstream = KIRO_CONSTANTS.BASE_URL.replace('/generateAssistantResponse', '').replace('{{region}}', KIRO_CONSTANTS.DEFAULT_REGION);
    const secretPath = `/${crypto.randomUUID()}`;
    const active = new Set();
    const server = createServer(async (incoming, outgoing) => {
        const controller = new AbortController();
        active.add(controller);
        // 'close' on IncomingMessage also fires after the request body was read;
        // use the response's close event to detect downstream cancellation instead.
        outgoing.once('close', () => {
            if (!outgoing.writableFinished)
                controller.abort();
        });
        try {
            const url = new URL(incoming.url || '/', upstream);
            if (url.pathname !== `${secretPath}/chat/completions`) {
                outgoing.writeHead(404).end();
                return;
            }
            const chunks = [];
            for await (const chunk of incoming)
                chunks.push(Buffer.from(chunk));
            if (controller.signal.aborted)
                return;
            const body = Buffer.concat(chunks);
            const headers = new Headers();
            for (const [key, value] of Object.entries(incoming.headers)) {
                if (typeof value === 'string')
                    headers.set(key, value);
            }
            const response = await handler.handle(`${upstream}${url.pathname.slice(secretPath.length)}${url.search}`, {
                method: incoming.method,
                headers,
                body: body.toString('utf8'),
                signal: controller.signal
            }, showToast);
            if (outgoing.destroyed)
                return;
            const responseHeaders = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            outgoing.writeHead(response.status, responseHeaders);
            if (!response.body) {
                outgoing.end();
                return;
            }
            const reader = response.body.getReader();
            try {
                while (!outgoing.destroyed) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    if (!outgoing.write(value)) {
                        await new Promise((resolve) => {
                            outgoing.once('drain', resolve);
                            outgoing.once('close', resolve);
                        });
                    }
                }
            }
            finally {
                if (outgoing.destroyed)
                    await reader.cancel().catch(() => { });
                else
                    reader.releaseLock();
            }
            if (!outgoing.destroyed)
                outgoing.end();
        }
        catch (error) {
            if (!outgoing.destroyed) {
                if (outgoing.headersSent) {
                    // A partial SSE response must fail, not turn into a clean EOF or a
                    // JSON error appended to an otherwise-successful stream.
                    outgoing.destroy(error instanceof Error ? error : new Error(String(error)));
                    return;
                }
                outgoing.writeHead(502, { 'content-type': 'application/json' });
                outgoing.end(JSON.stringify({
                    error: { message: error instanceof Error ? error.message : String(error) }
                }));
            }
        }
        finally {
            active.delete(controller);
        }
    });
    // Never expose Kiro credentials or request bodies on a non-loopback interface.
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
    }
    catch (error) {
        server.close();
        throw error;
    }
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('Kiro bridge has no TCP address');
    return {
        baseURL: `http://127.0.0.1:${address.port}${secretPath}`,
        close: async () => {
            for (const controller of active)
                controller.abort();
            await new Promise((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            });
        }
    };
}
