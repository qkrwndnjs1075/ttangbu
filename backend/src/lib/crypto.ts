import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Hash a password using scrypt with random salt
 * Format: salt:hash (both base64)
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('base64')}:${hash.toString('base64')}`
}

/**
 * Verify password against stored hash
 * @returns true if password matches
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [saltBase64, hashBase64] = storedHash.split(':')
    if (!saltBase64 || !hashBase64) return false

    const salt = Buffer.from(saltBase64, 'base64')
    const storedHashBuffer = Buffer.from(hashBase64, 'base64')
    const testHash = scryptSync(password, salt, 64)

    return timingSafeEqual(storedHashBuffer, testHash)
  } catch {
    return false
  }
}

/**
 * Generate cryptographically secure random token
 * @param bytes - number of random bytes (default: 32)
 * @returns base64url-encoded token
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
