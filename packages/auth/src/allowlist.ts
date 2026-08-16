/**
 * Signing in with Google proves who someone is. It says nothing about whether
 * they are allowed in — everyone on earth has a Google account. The allowlist
 * is the part that actually keeps people out, so it is kept small, pure and
 * tested rather than inlined into a callback.
 */

/** Parses `ALLOWED_EMAILS` into a normalised set. */
export function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  if (raw === undefined) return new Set();
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * Case-insensitive membership. Deliberately exact — no domain wildcards, no
 * prefix matching. A wildcard here is indistinguishable from a typo, and the
 * failure mode is silent public access.
 */
export function isAllowed(email: string, allowlist: ReadonlySet<string>): boolean {
  return allowlist.has(email.trim().toLowerCase());
}

/**
 * An empty allowlist denies everyone rather than admitting everyone.
 *
 * The opposite default would mean a missing environment variable quietly opens
 * the journal to the public, which is the single worst outcome available here.
 */
export function assertUsableAllowlist(allowlist: ReadonlySet<string>): void {
  if (allowlist.size === 0) {
    throw new Error(
      'ALLOWED_EMAILS is empty, so nobody can sign in. Set it to a comma-separated list of Google addresses.',
    );
  }
}
