import Decimal from 'decimal.js';

/**
 * Significant digits carried through intermediate arithmetic. Far beyond the
 * 12 decimal places we ever persist, so division is the only place it shows.
 * See docs/accounting-rules.md §1.
 */
export const DECIMAL_PRECISION = 40;

/** Persisted scales. Domain output is quantised to these so stored values round-trip. */
export const PRICE_SCALE = 12;
export const QUANTITY_SCALE = 12;
export const MONEY_SCALE = 8;
export const RATIO_SCALE = 8;

/**
 * A private Decimal constructor so the global one is never reconfigured out
 * from under another package.
 */
const Dec = Decimal.clone({
  precision: DECIMAL_PRECISION,
  rounding: Decimal.ROUND_HALF_UP,
  // Never switch to exponential notation, at any magnitude.
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

export type DecimalValue = InstanceType<typeof Dec>;

/** Canonical decimal string: optional sign, digits, optional fractional part. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value);
}

/** Parses a canonical decimal string, throwing rather than yielding NaN. */
export function parseDecimal(value: string): DecimalValue {
  if (!isDecimalString(value)) {
    throw new TypeError(`Not a canonical decimal string: ${JSON.stringify(value)}`);
  }
  return new Dec(value);
}

/** Renders a Decimal as a canonical string — never exponential, never "-0". */
export function formatDecimal(value: DecimalValue): string {
  if (value.isZero()) {
    return '0';
  }
  return value.toFixed();
}

/** Rounds to a persisted scale and renders. Half-up, as for money everywhere. */
export function quantise(value: DecimalValue, scale: number): string {
  return formatDecimal(value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP));
}

export const ZERO: DecimalValue = new Dec(0);
