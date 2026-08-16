import { describe, expect, it } from 'vitest';
import { assertUsableAllowlist, isAllowed, parseAllowlist } from './allowlist';

describe('parseAllowlist', () => {
  it('splits, trims and lowercases', () => {
    const list = parseAllowlist(' Anche@Example.com , sam@example.com ');
    expect([...list]).toEqual(['anche@example.com', 'sam@example.com']);
  });

  it('ignores blank entries from trailing or doubled commas', () => {
    expect([...parseAllowlist('a@b.com,,')]).toEqual(['a@b.com']);
    expect([...parseAllowlist('   ')]).toEqual([]);
  });

  it('treats an unset variable as an empty list', () => {
    expect(parseAllowlist(undefined).size).toBe(0);
  });
});

describe('isAllowed', () => {
  const list = parseAllowlist('anche@example.com');

  it('matches regardless of case or surrounding space', () => {
    expect(isAllowed('ANCHE@example.com', list)).toBe(true);
    expect(isAllowed('  anche@example.com  ', list)).toBe(true);
  });

  it('rejects anyone not named exactly', () => {
    expect(isAllowed('someone@example.com', list)).toBe(false);
  });

  it('does not match on domain or prefix', () => {
    // A wildcard is indistinguishable from a typo, and failing open here would
    // publish the journal.
    expect(isAllowed('mallory@example.com', list)).toBe(false);
    expect(isAllowed('anche@example.com.attacker.test', list)).toBe(false);
    expect(isAllowed('anche@example.co', list)).toBe(false);
    expect(isAllowed('xanche@example.com', list)).toBe(false);
  });

  it('rejects everyone when the list is empty', () => {
    const empty = parseAllowlist(undefined);
    expect(isAllowed('anyone@example.com', empty)).toBe(false);
  });
});

describe('assertUsableAllowlist', () => {
  it('refuses to start with an empty allowlist', () => {
    // Failing closed: a missing variable must not quietly admit the world.
    expect(() => assertUsableAllowlist(parseAllowlist(undefined))).toThrow(/ALLOWED_EMAILS/);
  });

  it('accepts a populated one', () => {
    expect(() => assertUsableAllowlist(parseAllowlist('a@b.com'))).not.toThrow();
  });
});
