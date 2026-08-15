import { describe, expect, it } from 'vitest';
import { formatDecimal, isDecimalString, parseDecimal } from './decimal';

describe('isDecimalString', () => {
  it.each(['0', '1', '-1', '117500', '0.125', '-0.125', '117523.40'])('accepts %s', (value) => {
    expect(isDecimalString(value)).toBe(true);
  });

  it.each([
    '', // empty
    ' 1', // whitespace
    '1 ',
    '1e5', // exponential is not a canonical decimal string
    '+1', // leading plus
    '.5', // must have an integer part
    '1.', // must have a fractional part if there is a point
    'abc',
    'NaN',
    'Infinity',
    '1.2.3',
  ])('rejects %j', (value) => {
    expect(isDecimalString(value)).toBe(false);
  });
});

describe('parseDecimal', () => {
  it('throws on a non-decimal string rather than yielding NaN', () => {
    expect(() => parseDecimal('abc')).toThrow(/abc/);
    expect(() => parseDecimal('1e5')).toThrow();
  });
});

describe('formatDecimal', () => {
  it('is exact where binary floating point is not', () => {
    // 0.1 + 0.2 === 0.30000000000000004 as a JS number.
    expect(formatDecimal(parseDecimal('0.1').plus(parseDecimal('0.2')))).toBe('0.3');
    // 117500 * 0.1 === 11750.000000000002 as a JS number.
    expect(formatDecimal(parseDecimal('117500').times(parseDecimal('0.1')))).toBe('11750');
  });

  it('never emits exponential notation', () => {
    expect(formatDecimal(parseDecimal('0.000000000001'))).toBe('0.000000000001');
    expect(formatDecimal(parseDecimal('1000000000000000000000'))).toBe('1000000000000000000000');
  });

  it('normalises redundant zeros so equal values compare equal as strings', () => {
    expect(formatDecimal(parseDecimal('1.500'))).toBe('1.5');
    expect(formatDecimal(parseDecimal('-0'))).toBe('0');
  });

  it('carries enough precision for non-terminating division', () => {
    const third = parseDecimal('1').dividedBy(parseDecimal('3'));
    // 40 significant digits, per accounting rules §1.
    expect(formatDecimal(third)).toMatch(/^0\.3{40}$/);
  });
});
