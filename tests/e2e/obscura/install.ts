#!/usr/bin/env bun
/**
 * Download the pinned Obscura release into `.tools/obscura/`, verify its
 * SHA-256, and extract the binaries. Idempotent: re-runs verify the existing
 * archive and skip the download. See PIN.md for the pin rationale.
 */
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const OBSCURA_VERSION = 'v0.2.1'
export const OBSCURA_ASSET = 'obscura-x86_64-linux.tar.gz'
export const OBSCURA_ASSET_SHA256 =
  '6a1a66b3f1ab118fa7d31330894a868617aea68c06d75436d851356c39df1ed3'
export const OBSCURA_URL = `https://github.com/h4ckf0r0day/obscura/releases/download/${OBSCURA_VERSION}/${OBSCURA_ASSET}`

const root = resolve(import.meta.dir, '../../..')
export const OBSCURA_DIR = resolve(root, '.tools/obscura')
export const OBSCURA_BIN = resolve(OBSCURA_DIR, 'obscura')

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export async function installObscura(): Promise<string> {
  mkdirSync(OBSCURA_DIR, { recursive: true })
  const archive = resolve(OBSCURA_DIR, OBSCURA_ASSET)
  if (!existsSync(archive) || sha256(archive) !== OBSCURA_ASSET_SHA256) {
    console.log(`downloading ${OBSCURA_URL}`)
    const response = await fetch(OBSCURA_URL)
    if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`)
    writeFileSync(archive, new Uint8Array(await response.arrayBuffer()))
  }
  const digest = sha256(archive)
  if (digest !== OBSCURA_ASSET_SHA256) {
    throw new Error(`checksum mismatch for ${OBSCURA_ASSET}: ${digest}`)
  }
  if (!existsSync(OBSCURA_BIN)) {
    const tar = Bun.spawnSync(['tar', '-xzf', archive, '-C', OBSCURA_DIR])
    if (tar.exitCode !== 0) throw new Error(`extract failed: ${tar.stderr.toString()}`)
  }
  chmodSync(OBSCURA_BIN, 0o755)
  console.log(`obscura ${OBSCURA_VERSION} ready at ${OBSCURA_BIN}`)
  return OBSCURA_BIN
}

if (import.meta.main) {
  await installObscura()
}
