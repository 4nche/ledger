import { describe, expect, it } from 'vitest';
import { groupByPeriod, localDayRange, periodKey, summarize } from './buckets';
import type { RealizedEvent } from '../types';

const AMS = 'Europe/Amsterdam';
const UTC = 'UTC';

let counter = 0;

function event(
  executedAt: string,
  realizedPnl = '0',
  rMultiple: string | null = null,
): RealizedEvent {
  counter += 1;
  return {
    positionId: `p${counter}`,
    executedAt: new Date(executedAt),
    realizedPnl,
    rMultiple,
  };
}

describe('periodKey — reporting timezone decides the bucket', () => {
  it('puts a late-evening UTC execution into the next local day', () => {
    // 22:30Z on 15 Aug is 00:30 on 16 Aug in Amsterdam (CEST, UTC+2).
    const at = new Date('2026-08-15T22:30:00Z');
    expect(periodKey(at, 'DAY', AMS)).toBe('2026-08-16');
    expect(periodKey(at, 'DAY', UTC)).toBe('2026-08-15');
  });

  it('keeps an earlier execution on the same local day', () => {
    const at = new Date('2026-08-15T21:30:00Z'); // 23:30 local
    expect(periodKey(at, 'DAY', AMS)).toBe('2026-08-15');
  });

  it('rolls the month over on the local boundary, not the UTC one', () => {
    const at = new Date('2026-07-31T22:30:00Z'); // 1 Aug 00:30 local
    expect(periodKey(at, 'MONTH', AMS)).toBe('2026-08');
    expect(periodKey(at, 'MONTH', UTC)).toBe('2026-07');
  });

  it('rolls the ISO week over on the local boundary', () => {
    // Sun 16 Aug 22:30Z is Mon 17 Aug 00:30 local — a new ISO week.
    const at = new Date('2026-08-16T22:30:00Z');
    expect(periodKey(at, 'WEEK', AMS)).toBe('2026-W34');
    expect(periodKey(at, 'WEEK', UTC)).toBe('2026-W33');
  });
});

describe('periodKey — ISO week semantics', () => {
  it('numbers the week the spec calls Week 33', () => {
    // Week 33 of 2026 runs Mon 10 Aug – Sun 16 Aug.
    expect(periodKey(new Date('2026-08-10T12:00:00Z'), 'WEEK', UTC)).toBe('2026-W33');
    expect(periodKey(new Date('2026-08-16T12:00:00Z'), 'WEEK', UTC)).toBe('2026-W33');
    expect(periodKey(new Date('2026-08-17T12:00:00Z'), 'WEEK', UTC)).toBe('2026-W34');
  });

  it('uses the ISO week-year, which can differ from the calendar year', () => {
    // 1 Jan 2027 (a Friday) falls in the ISO week whose Thursday is 31 Dec 2026.
    expect(periodKey(new Date('2027-01-01T12:00:00Z'), 'WEEK', UTC)).toBe('2026-W53');
    // The calendar month and day keys still say 2027.
    expect(periodKey(new Date('2027-01-01T12:00:00Z'), 'MONTH', UTC)).toBe('2027-01');
    expect(periodKey(new Date('2027-01-01T12:00:00Z'), 'DAY', UTC)).toBe('2027-01-01');
  });

  it('zero-pads single-digit weeks and months so keys sort lexicographically', () => {
    expect(periodKey(new Date('2026-01-08T12:00:00Z'), 'WEEK', UTC)).toBe('2026-W02');
    expect(periodKey(new Date('2026-03-04T12:00:00Z'), 'MONTH', UTC)).toBe('2026-03');
    expect(periodKey(new Date('2026-03-04T12:00:00Z'), 'DAY', UTC)).toBe('2026-03-04');
  });
});

describe('groupByPeriod — boundaries', () => {
  it('reports the exact UTC instants a local day spans', () => {
    const groups = groupByPeriod([event('2026-08-16T10:00:00Z')], 'DAY', AMS);
    expect(groups[0]?.key).toBe('2026-08-16');
    expect(groups[0]?.startsAt).toEqual(new Date('2026-08-15T22:00:00Z'));
    expect(groups[0]?.endsAt).toEqual(new Date('2026-08-16T22:00:00Z'));
  });

  it('handles the 25-hour day when DST ends', () => {
    // Amsterdam leaves CEST on 25 Oct 2026, so that local day is 25 hours long.
    const groups = groupByPeriod([event('2026-10-25T12:00:00Z')], 'DAY', AMS);
    expect(groups[0]?.startsAt).toEqual(new Date('2026-10-24T22:00:00Z'));
    expect(groups[0]?.endsAt).toEqual(new Date('2026-10-25T23:00:00Z'));
  });

  it('spans a whole ISO week from local Monday to local Monday', () => {
    const groups = groupByPeriod([event('2026-08-12T10:00:00Z')], 'WEEK', AMS);
    expect(groups[0]?.key).toBe('2026-W33');
    expect(groups[0]?.startsAt).toEqual(new Date('2026-08-09T22:00:00Z')); // Mon 10 Aug 00:00 local
    expect(groups[0]?.endsAt).toEqual(new Date('2026-08-16T22:00:00Z')); // Mon 17 Aug 00:00 local
  });

  it('spans a whole calendar month in local time', () => {
    const groups = groupByPeriod([event('2026-08-12T10:00:00Z')], 'MONTH', AMS);
    expect(groups[0]?.key).toBe('2026-08');
    expect(groups[0]?.startsAt).toEqual(new Date('2026-07-31T22:00:00Z'));
    expect(groups[0]?.endsAt).toEqual(new Date('2026-08-31T22:00:00Z'));
  });
});

describe('groupByPeriod — grouping and ordering', () => {
  const events = [
    event('2026-08-14T09:00:00Z', '100'),
    event('2026-08-15T09:00:00Z', '200'),
    event('2026-08-15T17:00:00Z', '300'),
    event('2026-08-15T22:30:00Z', '400'), // 16 Aug locally
  ];

  it('splits events into one group per period, newest first', () => {
    const groups = groupByPeriod(events, 'DAY', AMS);
    expect(groups.map((g) => g.key)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14']);
  });

  it('orders items within a group newest first', () => {
    const groups = groupByPeriod(events, 'DAY', AMS);
    const august15 = groups.find((g) => g.key === '2026-08-15');
    expect(august15?.items.map((i) => i.realizedPnl)).toEqual(['300', '200']);
  });

  it('collapses everything into one group at a coarser period', () => {
    const groups = groupByPeriod(events, 'MONTH', AMS);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.summary.events).toBe(4);
    expect(groups[0]?.summary.realizedPnl).toBe('1000');
  });

  it('returns nothing for no events', () => {
    expect(groupByPeriod([], 'DAY', AMS)).toEqual([]);
  });

  it('does not mutate the caller’s array', () => {
    const input = [...events];
    const snapshot = [...events];
    groupByPeriod(input, 'DAY', AMS);
    expect(input).toEqual(snapshot);
  });
});

describe('summarize', () => {
  it('counts wins, losses and win rate', () => {
    const summary = summarize([
      event('2026-08-15T09:00:00Z', '250', '2'),
      event('2026-08-15T10:00:00Z', '-100', '-1'),
      event('2026-08-15T11:00:00Z', '170', '1.2'),
    ]);
    expect(summary.events).toBe(3);
    expect(summary.positions).toBe(3);
    expect(summary.winners).toBe(2);
    expect(summary.losers).toBe(1);
    expect(summary.scratches).toBe(0);
    expect(summary.realizedPnl).toBe('320');
    expect(summary.totalR).toBe('2.2');
    expect(summary.winRate).toMatch(/^0\.6{4}/);
    expect(summary.averageR).toMatch(/^0\.73{4}/);
  });

  it('counts distinct positions separately from events', () => {
    const shared = 'position-1';
    const summary = summarize([
      {
        positionId: shared,
        executedAt: new Date('2026-08-15T09:00:00Z'),
        realizedPnl: '10',
        rMultiple: null,
      },
      {
        positionId: shared,
        executedAt: new Date('2026-08-15T10:00:00Z'),
        realizedPnl: '20',
        rMultiple: null,
      },
    ]);
    expect(summary.events).toBe(2);
    expect(summary.positions).toBe(1);
  });

  it('treats an exactly flat result as a scratch, not a win or a loss', () => {
    const summary = summarize([event('2026-08-15T09:00:00Z', '0')]);
    expect(summary.winners).toBe(0);
    expect(summary.losers).toBe(0);
    expect(summary.scratches).toBe(1);
    expect(summary.winRate).toBeNull();
  });

  it('excludes null-R events from R aggregates instead of counting them as 0R', () => {
    const summary = summarize([
      event('2026-08-15T09:00:00Z', '100', null),
      event('2026-08-15T10:00:00Z', '100', '1'),
    ]);
    expect(summary.totalR).toBe('1');
    expect(summary.averageR).toBe('1'); // averaged over 1 event, not 2
  });

  it('reports null R aggregates when nothing has an R', () => {
    const summary = summarize([event('2026-08-15T09:00:00Z', '100', null)]);
    expect(summary.totalR).toBeNull();
    expect(summary.averageR).toBeNull();
  });

  it('is empty-safe', () => {
    const summary = summarize([]);
    expect(summary.events).toBe(0);
    expect(summary.realizedPnl).toBe('0');
    expect(summary.winRate).toBeNull();
    expect(summary.totalR).toBeNull();
    expect(summary.averageR).toBeNull();
  });
});

describe('localDayRange — turning date filters into instants', () => {
  it('spans from the start of `from` to the start of the day after `to`', () => {
    const range = localDayRange('2026-08-10', '2026-08-15', AMS);
    expect(range.gte).toEqual(new Date('2026-08-09T22:00:00Z')); // 10 Aug 00:00 local
    expect(range.lt).toEqual(new Date('2026-08-15T22:00:00Z')); // 16 Aug 00:00 local
  });

  it('includes the whole of the `to` day, not just its first instant', () => {
    const range = localDayRange('2026-08-15', '2026-08-15', AMS);
    const lateOnThe15th = new Date('2026-08-15T21:59:00Z'); // 23:59 local
    expect(range.gte!.getTime()).toBeLessThanOrEqual(lateOnThe15th.getTime());
    expect(range.lt!.getTime()).toBeGreaterThan(lateOnThe15th.getTime());
  });

  it('shifts with the reporting timezone', () => {
    expect(localDayRange('2026-08-10', null, 'UTC').gte).toEqual(new Date('2026-08-10T00:00:00Z'));
    expect(localDayRange('2026-08-10', null, AMS).gte).toEqual(new Date('2026-08-09T22:00:00Z'));
  });

  it('leaves an open end unbounded', () => {
    expect(localDayRange(null, null, AMS)).toEqual({ gte: null, lt: null });
    expect(localDayRange('2026-08-10', null, AMS).lt).toBeNull();
    expect(localDayRange(null, '2026-08-10', AMS).gte).toBeNull();
  });

  it('rejects a malformed date rather than producing an Invalid Date', () => {
    expect(() => localDayRange('15-08-2026', null, AMS)).toThrow(/YYYY-MM-DD/);
  });
});
