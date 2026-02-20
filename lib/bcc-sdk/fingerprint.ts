/**
 * BCC fingerprint generation.
 *
 * Algorithm:
 * 1. Take error_message
 * 2. Take first meaningful line of stack trace (skip "Error:" prefix, skip node_modules frames)
 * 3. Concatenate: `${error_message}::${first_meaningful_stack_frame}`
 * 4. SHA-256 hash → hex string (first 16 chars)
 *
 * Uses Web Crypto API — works in both browser and Edge Runtime.
 * Must be deterministic: same input always produces same fingerprint.
 */

/** Extract the first meaningful stack frame (not node_modules, not the Error line). */
function extractFirstMeaningfulFrame(stack: string): string {
  const lines = stack.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Skip the error message line (e.g. "Error: something went wrong")
    if (!trimmed.startsWith('at ')) continue
    // Skip node_modules frames
    if (trimmed.includes('node_modules')) continue
    // Skip Next.js internal frames
    if (trimmed.includes('next/dist')) continue
    if (trimmed.includes('<anonymous>')) continue
    // Strip column numbers to normalize across builds — keep file path + function name
    // e.g. "at Component (src/components/Foo.tsx:42:18)" → "at Component (src/components/Foo.tsx)"
    return trimmed.replace(/:\d+:\d+\)$/, ')')
  }
  // Fall back to first "at" line if all are node_modules
  return lines.find((l) => l.trim().startsWith('at '))?.trim() ?? ''
}

/** Convert ArrayBuffer to hex string. */
function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a deterministic 16-char hex fingerprint for an error.
 * Works in browser and Edge Runtime (uses Web Crypto).
 */
export async function generateFingerprint(
  errorMessage: string,
  stackTrace?: string
): Promise<string> {
  const normalizedMessage = errorMessage.trim().slice(0, 500)
  const frame = stackTrace ? extractFirstMeaningfulFrame(stackTrace) : ''
  const raw = frame ? `${normalizedMessage}::${frame}` : normalizedMessage

  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return bufToHex(hashBuffer).slice(0, 16)
}

/**
 * Synchronous fallback fingerprint using a simple string hash.
 * Use only when Web Crypto is unavailable (rare).
 */
export function generateFingerprintSync(errorMessage: string, stackTrace?: string): string {
  const normalizedMessage = errorMessage.trim().slice(0, 500)
  const frame = stackTrace ? extractFirstMeaningfulFrame(stackTrace) : ''
  const raw = frame ? `${normalizedMessage}::${frame}` : normalizedMessage

  // Two independent 32-bit hashes produce 16 unique hex chars (no repeated block)
  let h1 = 0x811c9dc5 // FNV-1a seed
  let h2 = 0x9747b28c // djb2 seed
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    // FNV-1a
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193)
    // djb2
    h2 = Math.imul(h2, 33) ^ c
  }
  h1 = h1 >>> 0
  h2 = h2 >>> 0
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}
