import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import plugin from '../index.js'

describe('V1 and V2 entrypoints', () => {
  test('the shared default export exposes both host APIs', () => {
    expect(plugin.id).toBe('kiro-auth')
    expect(typeof plugin.setup).toBe('function')
    expect(typeof plugin.server).toBe('function')
  })

  test('the published server entrypoint forwards to the built default export', () => {
    const server = readFileSync(fileURLToPath(new URL('../../server.js', import.meta.url)), 'utf8')
    expect(server).toContain("export { default } from './dist/index.js'")
  })
})
