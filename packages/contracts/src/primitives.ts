import {
  MONEY_SCALE,
  PRICE_SCALE,
  QUANTITY_SCALE,
  isDecimalString,
  parseDecimal,
} from '@journal/domain';
import { z } from 'zod';

/**
 * Decimal values cross the API boundary as strings so no precision is lost to
 * IEEE-754 on the way. See docs/accounting-rules.md §1.
 */

type Sign = 'positive' | 'non-negative' | 'any';

function scaleOf(value: string): number {
  const point = value.indexOf('.');
  return point === -1 ? 0 : value.length - point - 1;
}

function decimalSchema(label: string, maxScale: number, sign: Sign) {
  return z.string().superRefine((value, ctx) => {
    if (!isDecimalString(value)) {
      ctx.addIssue({
        code: 'custom',
        message: `${label} must be a plain decimal string such as "117523.40" — no exponents, no thousands separators.`,
      });
      return;
    }

    if (scaleOf(value) > maxScale) {
      ctx.addIssue({
        code: 'custom',
        message: `${label} supports at most ${maxScale} decimal places.`,
      });
      return;
    }

    const parsed = parseDecimal(value);
    if (sign === 'positive' && !parsed.greaterThan(0)) {
      ctx.addIssue({ code: 'custom', message: `${label} must be greater than zero.` });
    }
    if (sign === 'non-negative' && parsed.lessThan(0)) {
      ctx.addIssue({ code: 'custom', message: `${label} cannot be negative.` });
    }
  });
}

export const priceString = decimalSchema('Price', PRICE_SCALE, 'positive');
export const quantityString = decimalSchema('Quantity', QUANTITY_SCALE, 'positive');
export const feeString = decimalSchema('Fee', MONEY_SCALE, 'non-negative');
export const balanceString = decimalSchema('Balance', MONEY_SCALE, 'positive');

export const uuidString = z.uuid({ error: 'Must be a UUID.' });

/** An instant on the wire: ISO 8601, offset permitted, parsed to a Date. */
export const instant = z.iso
  .datetime({ offset: true, error: 'Must be an ISO 8601 timestamp.' })
  .transform((value) => new Date(value));

/** A calendar date filter such as `2026-08-01`. */
export const calendarDate = z.iso.date({ error: 'Must be a date in YYYY-MM-DD form.' });

function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reporting timezone. Always explicit — the server's own zone is never a
 * fallback, because it would silently change which day a trade lands in.
 */
export const timeZoneString = z
  .string()
  .refine(isKnownTimeZone, { error: 'Unknown IANA time zone.' });

/** Trimmed, non-empty free text with an upper bound. */
export function text(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(max, { error: `${label} must be ${max} characters or fewer.` });
}

/**
 * Nullable free text that normalises blank input to null rather than "".
 * Carries no default, so it is safe to build a patch schema from.
 */
export function nullableText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();
}

/** As `nullableText`, but absent means null. For create schemas only. */
export function optionalText(max: number) {
  return nullableText(max).default(null);
}
