import { describe, expect, it } from 'vitest';
import { reconstructPosition } from './reconstruct.js';
import type { ExecutionInput, PositionInput, PositionSnapshot } from '../types.js';

let counter = 0;

function ex(
  type: 'ENTRY' | 'EXIT',
  price: string,
  quantity: string,
  executedAt: string,
  fee = '0',
): ExecutionInput {
  counter += 1;
  return {
    id: `e${counter}`,
    type,
    price,
    quantity,
    fee,
    executedAt: new Date(executedAt),
    createdAt: new Date(`2026-01-01T00:00:0${counter % 10}Z`),
  };
}

function input(overrides: Partial<PositionInput> = {}): PositionInput {
  return {
    side: 'LONG',
    initialStopPrice: null,
    accountStartingBalance: '100000',
    executions: [],
    ...overrides,
  };
}

/** Unwraps a result the test expects to be valid, failing loudly otherwise. */
function ok(result: ReturnType<typeof reconstructPosition>): PositionSnapshot {
  if (!result.ok) {
    throw new Error(`expected a valid position, got issues: ${JSON.stringify(result.issues)}`);
  }
  return result.position;
}

function codes(result: ReturnType<typeof reconstructPosition>): string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('reconstructPosition — the worked example from the spec', () => {
  const result = reconstructPosition(
    input({
      side: 'LONG',
      initialStopPrice: '115000',
      accountStartingBalance: '100000',
      executions: [
        ex('ENTRY', '117500', '0.1', '2026-08-15T10:31:00Z'),
        ex('EXIT', '120000', '0.1', '2026-08-15T15:42:00Z', '8.24'),
      ],
    }),
  );

  it('reproduces every published figure', () => {
    const p = ok(result);
    expect(p.status).toBe('CLOSED');
    expect(p.averageEntryPrice).toBe('117500');
    expect(p.averageExitPrice).toBe('120000');
    expect(p.entryQuantity).toBe('0.1');
    expect(p.exitQuantity).toBe('0.1');
    expect(p.openQuantity).toBe('0');
    expect(p.realizedPnl).toBe('241.76');
    expect(p.fees).toBe('8.24');
    expect(p.initialRiskAmount).toBe('250');
    expect(p.openedAt).toEqual(new Date('2026-08-15T10:31:00Z'));
    expect(p.closedAt).toEqual(new Date('2026-08-15T15:42:00Z'));
  });

  it('computes R against initial risk and percentages against starting balance', () => {
    const p = ok(result);
    // 241.76 / 250, displayed as +0.97R
    expect(p.rMultiple).toBe('0.96704');
    // 241.76 / 100000, displayed as +0.24%
    expect(p.realizedPnlPct).toBe('0.0024176');
    // 250 / 100000, displayed as 0.25%
    expect(p.initialRiskPct).toBe('0.0025');
  });
});

describe('direction and sign', () => {
  it('LONG profits when price rises', () => {
    const p = ok(
      reconstructPosition(
        input({
          side: 'LONG',
          executions: [
            ex('ENTRY', '117500', '0.1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '120000', '0.1', '2026-08-15T11:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.realizedPnl).toBe('250');
  });

  it('LONG loses when price falls', () => {
    const p = ok(
      reconstructPosition(
        input({
          side: 'LONG',
          executions: [
            ex('ENTRY', '120000', '0.1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '117500', '0.1', '2026-08-15T11:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.realizedPnl).toBe('-250');
  });

  it('SHORT profits when price falls', () => {
    const p = ok(
      reconstructPosition(
        input({
          side: 'SHORT',
          initialStopPrice: '122500',
          executions: [
            ex('ENTRY', '120000', '0.1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '117500', '0.1', '2026-08-15T11:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.realizedPnl).toBe('250');
    expect(p.initialRiskAmount).toBe('250');
    expect(p.rMultiple).toBe('1');
  });

  it('SHORT loses when price rises', () => {
    const p = ok(
      reconstructPosition(
        input({
          side: 'SHORT',
          executions: [
            ex('ENTRY', '117500', '0.1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '120000', '0.1', '2026-08-15T11:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.realizedPnl).toBe('-250');
  });
});

describe('scaled entries and exits (weighted-average cost basis)', () => {
  // The spec's own example: 1 position, 4 executions.
  const result = reconstructPosition(
    input({
      side: 'LONG',
      executions: [
        ex('ENTRY', '100000', '0.50', '2026-08-15T10:31:00Z'),
        ex('ENTRY', '101000', '0.25', '2026-08-15T11:04:00Z'),
        ex('EXIT', '103000', '0.25', '2026-08-15T14:12:00Z'),
        ex('EXIT', '105000', '0.50', '2026-08-15T16:42:00Z'),
      ],
    }),
  );

  it('weights the averages by quantity', () => {
    const p = ok(result);
    // (100000*0.5 + 101000*0.25) / 0.75, quantised to the 12dp price scale.
    expect(p.averageEntryPrice).toBe('100333.333333333333');
    // (103000*0.25 + 105000*0.5) / 0.75
    expect(p.averageExitPrice).toBe('104333.333333333333');
    expect(p.entryQuantity).toBe('0.75');
    expect(p.exitQuantity).toBe('0.75');
    expect(p.status).toBe('CLOSED');
  });

  it('totals to the exact realized PnL despite non-terminating averages', () => {
    expect(ok(result).realizedPnl).toBe('3000');
  });

  it('emits one realized event per exit, summing to the position total', () => {
    const p = ok(result);
    expect(p.realizedExecutions).toHaveLength(2);
    const sum = p.realizedExecutions.reduce((acc, r) => acc + Number(r.realizedPnl), 0);
    expect(sum).toBeCloseTo(3000, 8);
    expect(p.realizedExecutions[0]?.quantity).toBe('0.25');
    expect(p.realizedExecutions[1]?.quantity).toBe('0.5');
  });

  it('prices each exit against the basis as it stood at that moment', () => {
    // An entry added *after* the first exit must not retro-price that exit.
    const p = ok(
      reconstructPosition(
        input({
          side: 'LONG',
          executions: [
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '110', '1', '2026-08-15T11:00:00Z'),
            ex('ENTRY', '200', '1', '2026-08-15T12:00:00Z'),
            ex('EXIT', '210', '1', '2026-08-15T13:00:00Z'),
          ],
        }),
      ),
    );
    // First exit sees basis 100 -> +10. Second sees (100+200)/2 = 150 -> +60.
    expect(p.realizedExecutions[0]?.averageEntryPrice).toBe('100');
    expect(p.realizedExecutions[0]?.realizedPnl).toBe('10');
    expect(p.realizedExecutions[1]?.averageEntryPrice).toBe('150');
    expect(p.realizedExecutions[1]?.realizedPnl).toBe('60');
    expect(p.realizedPnl).toBe('70');
  });
});

describe('status and lifecycle', () => {
  it('is CLOSED only when exit quantity exactly equals entry quantity', () => {
    const p = ok(
      reconstructPosition(
        input({
          executions: [
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '110', '1', '2026-08-15T11:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.status).toBe('CLOSED');
    expect(p.openQuantity).toBe('0');
    expect(p.closedAt).toEqual(new Date('2026-08-15T11:00:00Z'));
  });

  it('stays OPEN while any quantity remains, with no closedAt', () => {
    const p = ok(
      reconstructPosition(
        input({
          executions: [
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '110', '0.4', '2026-08-15T11:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.status).toBe('OPEN');
    expect(p.openQuantity).toBe('0.6');
    expect(p.closedAt).toBeNull();
    // The realized slice still exists and is reportable.
    expect(p.realizedPnl).toBe('4');
    expect(p.realizedExecutions).toHaveLength(1);
  });

  it('is OPEN with no exits at all', () => {
    const p = ok(
      reconstructPosition(input({ executions: [ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z')] })),
    );
    expect(p.status).toBe('OPEN');
    expect(p.exitQuantity).toBe('0');
    expect(p.realizedPnl).toBe('0');
    expect(p.averageExitPrice).toBeNull();
    expect(p.realizedExecutions).toEqual([]);
  });
});

describe('fees', () => {
  it('subtracts the exit fee and the entry fee allocated to the closed portion', () => {
    const p = ok(
      reconstructPosition(
        input({
          executions: [
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z', '10'),
            ex('EXIT', '110', '0.5', '2026-08-15T11:00:00Z', '2'),
          ],
        }),
      ),
    );
    // gross 5, exit fee 2, entry fee 10/unit * 0.5 = 5  ->  -2
    expect(p.realizedPnl).toBe('-2');
    // The full fee paid is still reported, even though half is unrecognised.
    expect(p.fees).toBe('12');
    expect(p.status).toBe('OPEN');
  });

  it('recognises all fees once the position is fully closed', () => {
    const p = ok(
      reconstructPosition(
        input({
          executions: [
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z', '10'),
            ex('EXIT', '110', '1', '2026-08-15T11:00:00Z', '2'),
          ],
        }),
      ),
    );
    expect(p.realizedPnl).toBe('-2'); // 10 gross - 12 fees
    expect(p.fees).toBe('12');
  });
});

describe('initial risk and R', () => {
  it('anchors risk to the FIRST entry price, not the moving average', () => {
    const p = ok(
      reconstructPosition(
        input({
          side: 'LONG',
          initialStopPrice: '90',
          executions: [
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
            ex('ENTRY', '120', '1', '2026-08-15T11:00:00Z'),
            ex('EXIT', '130', '2', '2026-08-15T12:00:00Z'),
          ],
        }),
      ),
    );
    // |100 - 90| * 2 = 20, NOT |110 - 90| * 2 = 40
    expect(p.initialRiskAmount).toBe('20');
    expect(p.realizedPnl).toBe('40'); // (130 - 110) * 2
    expect(p.rMultiple).toBe('2');
  });

  it('gives every realized slice the same R denominator, so slices sum to the position R', () => {
    const p = ok(
      reconstructPosition(
        input({
          side: 'LONG',
          initialStopPrice: '90',
          executions: [
            ex('ENTRY', '100', '2', '2026-08-15T10:00:00Z'),
            ex('EXIT', '110', '1', '2026-08-15T11:00:00Z'),
            ex('EXIT', '130', '1', '2026-08-15T12:00:00Z'),
          ],
        }),
      ),
    );
    // risk = |100 - 90| * 2 = 20
    expect(p.initialRiskAmount).toBe('20');
    expect(p.realizedExecutions[0]?.rMultiple).toBe('0.5'); // 10 / 20
    expect(p.realizedExecutions[1]?.rMultiple).toBe('1.5'); // 30 / 20
    expect(p.rMultiple).toBe('2'); // 40 / 20
  });

  it('leaves R null — not zero — when no stop was recorded', () => {
    const p = ok(
      reconstructPosition(
        input({
          initialStopPrice: null,
          executions: [
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
            ex('EXIT', '110', '1', '2026-08-15T11:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.initialRiskAmount).toBeNull();
    expect(p.initialRiskPct).toBeNull();
    expect(p.rMultiple).toBeNull();
    expect(p.realizedExecutions[0]?.rMultiple).toBeNull();
    expect(p.realizedPnl).toBe('10'); // PnL is unaffected
  });
});

describe('validation', () => {
  it('rejects a position with no executions', () => {
    expect(codes(reconstructPosition(input({ executions: [] })))).toContain('NO_EXECUTIONS');
  });

  it('rejects a position with no entry', () => {
    expect(
      codes(
        reconstructPosition(
          input({ executions: [ex('EXIT', '100', '1', '2026-08-15T10:00:00Z')] }),
        ),
      ),
    ).toContain('NO_ENTRY');
  });

  it.each([
    ['0', 'NON_POSITIVE_PRICE'],
    ['-1', 'NON_POSITIVE_PRICE'],
  ])('rejects price %s', (price, code) => {
    expect(
      codes(
        reconstructPosition(
          input({ executions: [ex('ENTRY', price, '1', '2026-08-15T10:00:00Z')] }),
        ),
      ),
    ).toContain(code);
  });

  it.each([
    ['0', 'NON_POSITIVE_QUANTITY'],
    ['-1', 'NON_POSITIVE_QUANTITY'],
  ])('rejects quantity %s', (quantity, code) => {
    expect(
      codes(
        reconstructPosition(
          input({ executions: [ex('ENTRY', '100', quantity, '2026-08-15T10:00:00Z')] }),
        ),
      ),
    ).toContain(code);
  });

  it('rejects a negative fee', () => {
    expect(
      codes(
        reconstructPosition(
          input({ executions: [ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z', '-1')] }),
        ),
      ),
    ).toContain('NEGATIVE_FEE');
  });

  it('rejects a malformed decimal instead of silently producing NaN', () => {
    expect(
      codes(
        reconstructPosition(
          input({ executions: [ex('ENTRY', '1e5', '1', '2026-08-15T10:00:00Z')] }),
        ),
      ),
    ).toContain('INVALID_DECIMAL');
  });

  it('rejects an exit that precedes the first entry', () => {
    expect(
      codes(
        reconstructPosition(
          input({
            executions: [
              ex('ENTRY', '100', '1', '2026-08-15T11:00:00Z'),
              ex('EXIT', '110', '1', '2026-08-15T10:00:00Z'),
            ],
          }),
        ),
      ),
    ).toContain('EXIT_BEFORE_ENTRY');
  });

  it('rejects total exit quantity exceeding total entry quantity', () => {
    expect(
      codes(
        reconstructPosition(
          input({
            executions: [
              ex('ENTRY', '100', '0.1', '2026-08-15T10:00:00Z'),
              ex('EXIT', '110', '0.2', '2026-08-15T11:00:00Z'),
            ],
          }),
        ),
      ),
    ).toContain('EXIT_EXCEEDS_ENTRY');
  });

  it('rejects an exit that oversells at its own point in time, even if later entries cover it', () => {
    const result = reconstructPosition(
      input({
        executions: [
          ex('ENTRY', '100', '0.1', '2026-08-15T10:00:00Z'),
          ex('EXIT', '110', '0.1', '2026-08-15T11:00:00Z'),
          ex('EXIT', '120', '0.05', '2026-08-15T12:00:00Z'),
          ex('ENTRY', '130', '0.5', '2026-08-15T13:00:00Z'),
        ],
      }),
    );
    // Totals balance (0.6 in, 0.15 out) but at 12:00 only 0.1 had ever been entered.
    expect(codes(result)).toContain('EXIT_EXCEEDS_ENTRY');
  });

  it.each([
    ['LONG', '110'],
    ['SHORT', '90'],
  ] as const)('rejects a %s stop on the wrong side of entry', (side, stop) => {
    expect(
      codes(
        reconstructPosition(
          input({
            side,
            initialStopPrice: stop,
            executions: [ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z')],
          }),
        ),
      ),
    ).toContain('STOP_ON_WRONG_SIDE');
  });

  it('rejects a stop equal to the entry, which would imply zero risk', () => {
    expect(
      codes(
        reconstructPosition(
          input({
            side: 'LONG',
            initialStopPrice: '100',
            executions: [ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z')],
          }),
        ),
      ),
    ).toContain('STOP_ON_WRONG_SIDE');
  });

  it('rejects a non-positive starting balance, which would divide by zero', () => {
    expect(
      codes(
        reconstructPosition(
          input({
            accountStartingBalance: '0',
            executions: [ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z')],
          }),
        ),
      ),
    ).toContain('NON_POSITIVE_STARTING_BALANCE');
  });

  it('reports every issue at once rather than stopping at the first', () => {
    const result = reconstructPosition(
      input({ executions: [ex('ENTRY', '-1', '-1', '2026-08-15T10:00:00Z', '-1')] }),
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining(['NON_POSITIVE_PRICE', 'NON_POSITIVE_QUANTITY', 'NEGATIVE_FEE']),
    );
  });
});

describe('execution ordering', () => {
  it('sorts by executedAt regardless of input order', () => {
    const p = ok(
      reconstructPosition(
        input({
          executions: [
            ex('EXIT', '110', '1', '2026-08-15T11:00:00Z'),
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.openedAt).toEqual(new Date('2026-08-15T10:00:00Z'));
    expect(p.realizedPnl).toBe('10');
  });

  it('treats an entry and an exit at the same instant as enter-then-exit', () => {
    const p = ok(
      reconstructPosition(
        input({
          executions: [
            ex('EXIT', '110', '1', '2026-08-15T10:00:00Z'),
            ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
          ],
        }),
      ),
    );
    expect(p.status).toBe('CLOSED');
    expect(p.realizedPnl).toBe('10');
  });

  it('breaks a same-instant, same-type tie by createdAt, then by id', () => {
    const base = {
      type: 'ENTRY' as const,
      quantity: '1',
      fee: '0',
      executedAt: new Date('2026-08-15T10:00:00Z'),
    };
    const p = ok(
      reconstructPosition(
        input({
          side: 'LONG',
          initialStopPrice: '50',
          executions: [
            // Same instant; createdAt decides, so the 300 entry is "first".
            { ...base, id: 'b', price: '100', createdAt: new Date('2026-01-01T00:00:02Z') },
            { ...base, id: 'a', price: '300', createdAt: new Date('2026-01-01T00:00:01Z') },
            // Same instant AND same createdAt as 'b'; id breaks the remaining tie.
            { ...base, id: 'c', price: '200', createdAt: new Date('2026-01-01T00:00:02Z') },
          ],
        }),
      ),
    );
    // Risk anchors to the first entry, which resolves to price 300.
    expect(p.initialRiskAmount).toBe('750'); // |300 - 50| * 3
  });

  it('does not mutate the caller’s execution array', () => {
    const executions = [
      ex('EXIT', '110', '1', '2026-08-15T11:00:00Z'),
      ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z'),
    ];
    const snapshot = [...executions];
    reconstructPosition(input({ executions }));
    expect(executions).toEqual(snapshot);
  });
});

describe('numeric correctness', () => {
  it('adds quantities exactly where binary floating point would drift', () => {
    const p = ok(
      reconstructPosition(
        input({
          executions: [
            ex('ENTRY', '100', '0.1', '2026-08-15T10:00:00Z'),
            ex('ENTRY', '100', '0.2', '2026-08-15T10:01:00Z'),
          ],
        }),
      ),
    );
    // 0.1 + 0.2 === 0.30000000000000004 as JS numbers.
    expect(p.entryQuantity).toBe('0.3');
  });

  it('is idempotent — the same input always yields the same snapshot', () => {
    const positionInput = input({
      side: 'LONG',
      initialStopPrice: '90',
      executions: [
        ex('ENTRY', '100', '1', '2026-08-15T10:00:00Z', '0.5'),
        ex('EXIT', '133.33', '1', '2026-08-15T11:00:00Z', '0.5'),
      ],
    });
    expect(reconstructPosition(positionInput)).toEqual(reconstructPosition(positionInput));
  });
});
