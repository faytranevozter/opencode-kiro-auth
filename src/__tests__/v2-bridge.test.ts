import { describe, expect, test } from 'bun:test'
import type { RequestHandler } from '../core/request/request-handler.js'
import { startKiroBridge } from '../plugin/v2-bridge.js'

describe('V2 loopback transport', () => {
  test('forwards chat requests to the Kiro handler and streams the response', async () => {
    let received: { url: string; body: string; signal: AbortSignal } | undefined
    const handler = {
      handle: async (url: string, init: { body: string; signal: AbortSignal }) => {
        received = { url, body: init.body, signal: init.signal }
        return new Response('data: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream' }
        })
      }
    } satisfies Pick<RequestHandler, 'handle'>
    const bridge = await startKiroBridge(handler, () => {})
    try {
      const response = await fetch(`${bridge.baseURL}/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({ model: 'auto', stream: true })
      })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('data: [DONE]\n\n')
      expect(received?.url).toBe('https://q.us-east-1.amazonaws.com/chat/completions')
      expect(JSON.parse(received!.body)).toEqual({ model: 'auto', stream: true })
      expect(received?.signal.aborted).toBe(false)
    } finally {
      await bridge.close()
    }
  })

  test('rejects requests without the per-instance path', async () => {
    let called = false
    const handler = {
      handle: async () => {
        called = true
        return new Response('ok')
      }
    } satisfies Pick<RequestHandler, 'handle'>
    const bridge = await startKiroBridge(handler, () => {})
    try {
      const url = new URL(bridge.baseURL)
      const response = await fetch(`${url.origin}/chat/completions`, { method: 'POST' })
      expect(response.status).toBe(404)
      expect(called).toBe(false)
    } finally {
      await bridge.close()
    }
  })

  test('preserves structured retryable errors and headers', async () => {
    const bridge = await startKiroBridge(
      {
        handle: async () =>
          Response.json(
            { retryable: true, phase: 'stream' },
            {
              status: 503,
              headers: { 'retry-after': '2' }
            }
          )
      },
      () => {}
    )
    try {
      const response = await fetch(`${bridge.baseURL}/chat/completions`, {
        method: 'POST',
        body: '{}'
      })
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('2')
      expect(await response.json()).toEqual({ retryable: true, phase: 'stream' })
    } finally {
      await bridge.close()
    }
  })

  test('unload aborts active upstream work and closes the listener', async () => {
    let signal: AbortSignal | undefined
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const bridge = await startKiroBridge(
      {
        handle: async (_url, init: { signal: AbortSignal }) => {
          signal = init.signal
          started()
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                init.signal.addEventListener(
                  'abort',
                  () => controller.error(new Error('aborted')),
                  { once: true }
                )
              }
            })
          )
        }
      },
      () => {}
    )
    const request = fetch(`${bridge.baseURL}/chat/completions`, { method: 'POST', body: '{}' })
      .then((response) => response.text())
      .catch(() => undefined)
    await ready
    await bridge.close()
    await request
    expect(signal?.aborted).toBe(true)
    await expect(fetch(`${bridge.baseURL}/chat/completions`, { method: 'POST' })).rejects.toThrow()
  })
})
