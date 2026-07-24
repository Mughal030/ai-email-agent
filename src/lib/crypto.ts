/**
 * Crypto utilities — AES-256-GCM encryption for OAuth tokens at rest.
 *
 * Why: we store Google OAuth tokens (access + refresh) in the DB.
 * They MUST be encrypted so a DB dump alone can't grant Gmail access.
 *
 * Key source: process.env.TOKEN_ENCRYPTION_KEY (32-byte hex string).
 * If absent, we generate an ephemeral one (dev-only — tokens won't
 * survive a restart, which is fine for the demo).
 */

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // GCM standard

function getKey(): Buffer {
  const env = process.env.TOKEN_ENCRYPTION_KEY
  if (env) {
    // Accept either hex or utf-8 of length 32
    if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, 'hex')
    if (env.length === 32) return Buffer.from(env, 'utf-8')
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (utf-8) or 64 hex chars')
  }
  // Ephemeral key for dev. Logged once per process.
  if (!globalThis.__EPHEMERAL_ENC_KEY) {
    globalThis.__EPHEMERAL_ENC_KEY = crypto.randomBytes(32)
    console.warn(
      '[crypto] TOKEN_ENCRYPTION_KEY not set — using ephemeral key. Tokens will not survive restart.'
    )
  }
  return globalThis.__EPHEMERAL_ENC_KEY as Buffer
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: base64(iv) + '.' + base64(tag) + '.' + base64(ciphertext)
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid ciphertext format')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return dec.toString('utf-8')
}
