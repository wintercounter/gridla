#!/usr/bin/env bun
/**
 * Publishes packages/gridla to npm with provenance. Uses npm (not bun) so
 * trusted publishing through GitHub Actions OIDC works without a token.
 */
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const tag = process.env.NPM_DIST_TAG ?? 'latest'

const build = Bun.spawnSync(['bun', 'run', 'build'], {
  cwd: root,
  stdio: ['inherit', 'inherit', 'inherit'],
})
if (build.exitCode !== 0) process.exit(build.exitCode)

const publish = Bun.spawnSync(
  ['npm', 'publish', '--access', 'public', '--provenance', '--tag', tag],
  { cwd: resolve(root, 'packages/gridla'), stdio: ['inherit', 'inherit', 'inherit'] },
)
process.exit(publish.exitCode)
