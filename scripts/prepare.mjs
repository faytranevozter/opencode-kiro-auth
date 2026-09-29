import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

function runNode(relativePath, args = []) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(relativePath, import.meta.url)), ...args], {
    cwd: root,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// Git dependencies are packed from source, unlike registry releases. npm runs
// prepare with devDependencies available, but does not run prepublishOnly.
// Use Node directly: consumers need not have a standalone Bun CLI installed.
runNode('../node_modules/typescript/lib/tsc.js', ['-p', 'tsconfig.build.json'])
runNode('./fix-esm-imports.mjs')

// Hooks are a contributor concern, not a dependency-install requirement.
if (existsSync(new URL('../.git', import.meta.url)) && !process.env.CI && process.env.HUSKY !== '0') {
  const { default: husky } = await import('husky')
  const message = husky()
  if (message) console.warn(message)
}
