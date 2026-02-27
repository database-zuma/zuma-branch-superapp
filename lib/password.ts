import { pbkdf2Sync } from 'crypto';

/**
 * Decode passlib's "adapted base64" (ab64) encoding.
 * - Uses '.' instead of '+'
 * - No trailing '=' padding
 */
function ab64Decode(encoded: string): Buffer {
  let b64 = encoded.replace(/\./g, '+');
  const pad = (4 - (b64.length % 4)) % 4;
  b64 += '='.repeat(pad);
  return Buffer.from(b64, 'base64');
}

/**
 * Verify a password against a passlib pbkdf2-sha256 hash.
 * Hash format: $pbkdf2-sha256$iterations$salt_ab64$checksum_ab64
 */
export function verifyPassword(password: string, hash: string): boolean {
  const parts = hash.split('$');
  // parts: ['', 'pbkdf2-sha256', iterations, salt, checksum]
  if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha256') {
    return false;
  }

  const iterations = parseInt(parts[2], 10);
  const salt = ab64Decode(parts[3]);
  const expectedHash = ab64Decode(parts[4]);

  const derivedKey = pbkdf2Sync(password, salt, iterations, expectedHash.length, 'sha256');
  return derivedKey.equals(expectedHash);
}
