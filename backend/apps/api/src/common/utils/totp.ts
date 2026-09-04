import * as crypto from 'crypto'

/**
 * RFC 4648 Base32 decoder — handles padding, spaces and lowercase.
 */
function decodeBase32(s: string): Buffer {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = s.replace(/[\s=]/g, '').toUpperCase()
  let buf = 0n, bits = 0
  const bytes: number[] = []
  for (const c of clean) {
    const idx = alpha.indexOf(c)
    if (idx < 0) throw new Error(`Invalid Base32 character: ${c}`)
    buf = (buf << 5n) | BigInt(idx)
    bits += 5
    if (bits >= 8) {
      bytes.push(Number((buf >> BigInt(bits - 8)) & 0xffn))
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * RFC 4226 HOTP computation.
 */
function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.allocUnsafe(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const mac = crypto.createHmac('sha1', key).update(buf).digest()
  const off = mac[19] & 0xf
  const num =
    ((mac[off] & 0x7f) << 24) |
    ((mac[off + 1] & 0xff) << 16) |
    ((mac[off + 2] & 0xff) << 8) |
    (mac[off + 3] & 0xff)
  return (num % 1_000_000).toString().padStart(6, '0')
}

/**
 * Generates a random 16-character Base32 secret (80-bit key).
 * 16 chars produces a compact QR code that is easy to scan.
 */
export function generateBase32Secret(length = 16): string {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let s = ''
  for (let i = 0; i < length; i++) s += alpha[crypto.randomInt(0, alpha.length)]
  return s
}

/**
 * Builds a valid otpauth:// URI for QR code scanning.
 *
 * IMPORTANT: Returns the RAW (un-encoded) URI. The caller (frontend)
 * is responsible for encodeURIComponent when embedding in a URL.
 * Never encode here — double-encoding breaks authenticator apps.
 *
 * Spec: https://github.com/google/google-authenticator/wiki/Key-Uri-Format
 */
export function buildOtpauthUrl(account: string, secret: string, issuer = 'LP'): string {
  // Label = "issuer:account" — no encoding here, plain text
  const label = `${issuer}:${account}`
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`
}

/**
 * Verifies a TOTP code against a Base32 secret (RFC 6238).
 * Accepts ±2 time steps (±60 seconds) to handle clock skew.
 */
export function verifyTotp(token: string, secret: string, window = 2): boolean {
  try {
    if (!token || !secret) return false
    const cleanToken = String(token).trim().replace(/\s+/g, '')
    const cleanSecret = String(secret).trim().toUpperCase()

    const key = decodeBase32(cleanSecret)
    const t = Math.floor(Date.now() / 1000 / 30)

    for (let i = -window; i <= window; i++) {
      if (hotp(key, t + i) === cleanToken) return true
    }
    return false
  } catch {
    return false
  }
}
