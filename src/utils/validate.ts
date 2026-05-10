/**
 * Validation utilities for Relay CLI.
 *
 * Centralises input validation so every command uses the same rules.
 */

// ─── Email validation ──────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns `true` when `value` looks like a valid email address.
 * Surface-level RFC 5322 check — no DNS verification.
 */
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Throws when `value` is not a valid email address.
 * Use this at the gate of every command that accepts an account name.
 */
export function assertEmail(value: string, field = "Account name"): void {
  if (!isValidEmail(value)) {
    throw new Error(
      `${field} must be an email address (e.g. user@example.com). Got: "${value}"`,
    );
  }
}
