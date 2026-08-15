import { TZDate } from '@date-fns/tz';
import { MONEY_SCALE, RATIO_SCALE, ZERO, parseDecimal, quantise } from '../money/decimal';
import type { Period, PeriodGroup, PeriodSummary, RealizedEvent } from '../types';

const DAY_MS = 86_400_000;

/** A calendar date in the reporting timezone — no instant, no offset. */
interface LocalDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The calendar date an instant falls on, as seen in the reporting timezone. */
function toLocalDate(instant: Date, timeZone: string): LocalDate {
  const zoned = new TZDate(instant.getTime(), timeZone);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() };
}

/** The UTC instant at which this local calendar day begins in the given zone. */
function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const zoned = new TZDate(date.year, date.month - 1, date.day, 0, 0, 0, 0, timeZone);
  return new Date(zoned.getTime());
}

// Calendar arithmetic below runs entirely in UTC so it can never pick up the
// host's timezone. It operates on calendar dates, not instants.

function toUtcMillis(date: LocalDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function fromUtcMillis(millis: number): LocalDate {
  const date = new Date(millis);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMillis(toUtcMillis(date) + days * DAY_MS);
}

/** Monday = 0 … Sunday = 6. */
function isoWeekday(date: LocalDate): number {
  return (new Date(toUtcMillis(date)).getUTCDay() + 6) % 7;
}

/**
 * ISO-8601 week and week-year: the week containing this date's Thursday, and
 * the calendar year that Thursday falls in. Rules §10.
 */
function isoWeek(date: LocalDate): { year: number; week: number } {
  const thursdayMillis = toUtcMillis(date) + (3 - isoWeekday(date)) * DAY_MS;
  const thursday = new Date(thursdayMillis);
  const year = thursday.getUTCFullYear();
  const januaryFirst = Date.UTC(year, 0, 1);
  const week = Math.floor((thursdayMillis - januaryFirst) / (7 * DAY_MS)) + 1;
  return { year, week };
}

function startOfPeriod(date: LocalDate, period: Period): LocalDate {
  switch (period) {
    case 'DAY':
      return date;
    case 'WEEK':
      return addDays(date, -isoWeekday(date));
    case 'MONTH':
      return { year: date.year, month: date.month, day: 1 };
  }
}

function endOfPeriod(date: LocalDate, period: Period): LocalDate {
  const start = startOfPeriod(date, period);
  switch (period) {
    case 'DAY':
      return addDays(start, 1);
    case 'WEEK':
      return addDays(start, 7);
    case 'MONTH':
      return start.month === 12
        ? { year: start.year + 1, month: 1, day: 1 }
        : { year: start.year, month: start.month + 1, day: 1 };
  }
}

/**
 * The bucket an instant belongs to, in the given reporting timezone.
 * Keys sort lexicographically within a period type.
 */
export function periodKey(instant: Date, period: Period, timeZone: string): string {
  const local = toLocalDate(instant, timeZone);
  switch (period) {
    case 'DAY':
      return `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
    case 'WEEK': {
      const { year, week } = isoWeek(local);
      return `${year}-W${pad2(week)}`;
    }
    case 'MONTH':
      return `${local.year}-${pad2(local.month)}`;
  }
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCalendarDate(value: string): LocalDate {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new TypeError(`Expected a date in YYYY-MM-DD form, got ${JSON.stringify(value)}.`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Converts inclusive calendar-date filters into a half-open instant range
 * `[gte, lt)` in the reporting timezone.
 *
 * The end is the start of the day *after* `to`, so the whole of the `to` day is
 * included. Comparing against `to`'s own midnight would silently drop every
 * trade after 00:00 on the last day a trader asked for.
 */
export function localDayRange(
  from: string | null,
  to: string | null,
  timeZone: string,
): { gte: Date | null; lt: Date | null } {
  return {
    gte: from === null ? null : startOfLocalDay(parseCalendarDate(from), timeZone),
    lt: to === null ? null : startOfLocalDay(addDays(parseCalendarDate(to), 1), timeZone),
  };
}

/**
 * Splits realized events into one group per period, newest group first, with
 * items inside each group newest first. The input array is not mutated.
 */
export function groupByPeriod<TItem extends RealizedEvent>(
  events: readonly TItem[],
  period: Period,
  timeZone: string,
): PeriodGroup<TItem>[] {
  const buckets = new Map<string, { local: LocalDate; items: TItem[] }>();

  for (const event of events) {
    const key = periodKey(event.executedAt, period, timeZone);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, { local: toLocalDate(event.executedAt, timeZone), items: [event] });
    } else {
      bucket.items.push(event);
    }
  }

  return [...buckets.entries()]
    .map(([key, { local, items }]) => ({
      key,
      period,
      startsAt: startOfLocalDay(startOfPeriod(local, period), timeZone),
      endsAt: startOfLocalDay(endOfPeriod(local, period), timeZone),
      summary: summarize(items),
      items: [...items].sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime()),
    }))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}

/**
 * Aggregates a set of realized events. Events without an R are excluded from
 * the R figures rather than counted as 0R, and a flat result is a scratch
 * rather than a loss. Rules §7 and §10.
 */
export function summarize(events: readonly RealizedEvent[]): PeriodSummary {
  let realizedPnl = ZERO;
  let totalR = ZERO;
  let winners = 0;
  let losers = 0;
  let scratches = 0;
  let rCount = 0;
  const positions = new Set<string>();

  for (const event of events) {
    const pnl = parseDecimal(event.realizedPnl);
    realizedPnl = realizedPnl.plus(pnl);
    positions.add(event.positionId);

    if (pnl.greaterThan(ZERO)) winners += 1;
    else if (pnl.lessThan(ZERO)) losers += 1;
    else scratches += 1;

    if (event.rMultiple !== null) {
      totalR = totalR.plus(parseDecimal(event.rMultiple));
      rCount += 1;
    }
  }

  const decided = winners + losers;

  return {
    events: events.length,
    positions: positions.size,
    winners,
    losers,
    scratches,
    winRate:
      decided === 0
        ? null
        : quantise(parseDecimal(String(winners)).dividedBy(decided), RATIO_SCALE),
    realizedPnl: quantise(realizedPnl, MONEY_SCALE),
    totalR: rCount === 0 ? null : quantise(totalR, RATIO_SCALE),
    averageR: rCount === 0 ? null : quantise(totalR.dividedBy(rCount), RATIO_SCALE),
  };
}
