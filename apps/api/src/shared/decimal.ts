import { formatDecimal, parseDecimal } from '@journal/domain';

/**
 * PostgreSQL returns `numeric` padded to the column scale ("241.76000000").
 * Responses carry the canonical form instead, so the same value always looks
 * the same whether it came from the database or straight from the domain.
 */
export function decimalOut(value: string): string {
  return formatDecimal(parseDecimal(value));
}

export function decimalOrNull(value: string | null): string | null {
  return value === null ? null : decimalOut(value);
}
