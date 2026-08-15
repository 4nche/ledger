import { randomUUID } from 'node:crypto';
import { reconstructPosition, type ExecutionInput, type PositionSide } from '@journal/domain';
import { createDatabase, readConnectionString } from './client';
import { toPositionRow, toTradeRows } from './mappers';
import { accounts, positions, trades, users } from './schema/index';

/**
 * Development seed. Derived values are produced by the domain package rather
 * than hand-written, so the seeded rows are consistent with what the API would
 * have stored — and the database constraints get exercised on every run.
 *
 * Separate from migrations by design: migrations describe schema, seeds
 * describe sample data, and the two must never be coupled.
 */

interface SeedExecution {
  readonly type: 'ENTRY' | 'EXIT';
  readonly price: string;
  readonly quantity: string;
  readonly fee?: string;
  readonly executedAt: string;
}

interface SeedPosition {
  readonly accountName: string;
  readonly symbol: string;
  readonly side: PositionSide;
  readonly initialStopPrice: string | null;
  readonly notes: string | null;
  readonly executions: readonly SeedExecution[];
}

const SEED_USERS = [
  { id: randomUUID(), name: 'Anche', email: 'anche@example.com' },
  { id: randomUUID(), name: 'Sam', email: 'sam@example.com' },
] as const;

const SEED_ACCOUNTS = [
  {
    id: randomUUID(),
    userId: SEED_USERS[0].id,
    name: 'FTMO Challenge #1',
    provider: 'FTMO',
    accountType: 'PROP_CHALLENGE',
    currency: 'USD',
    startingBalance: '100000',
  },
  {
    id: randomUUID(),
    userId: SEED_USERS[0].id,
    name: 'Personal Bybit',
    provider: 'BYBIT',
    accountType: 'PERSONAL',
    currency: 'USD',
    startingBalance: '25000',
  },
  {
    id: randomUUID(),
    userId: SEED_USERS[1].id,
    name: 'Personal Hyperliquid',
    provider: 'HYPERLIQUID',
    accountType: 'PERSONAL',
    currency: 'USD',
    startingBalance: '50000',
  },
] as const;

const SEED_POSITIONS: readonly SeedPosition[] = [
  {
    // The worked example from the build spec.
    accountName: 'FTMO Challenge #1',
    symbol: 'BTCUSDT',
    side: 'LONG',
    initialStopPrice: '115000',
    notes: 'Range breakout, took the retest.',
    executions: [
      { type: 'ENTRY', price: '117500', quantity: '0.1', executedAt: '2026-08-15T10:31:00Z' },
      {
        type: 'EXIT',
        price: '120000',
        quantity: '0.1',
        fee: '8.24',
        executedAt: '2026-08-15T15:42:00Z',
      },
    ],
  },
  {
    // Scaled in and out — four executions, one position.
    accountName: 'FTMO Challenge #1',
    symbol: 'ETHUSDT',
    side: 'LONG',
    initialStopPrice: '3900',
    notes: 'Scaled in on the pullback.',
    executions: [
      {
        type: 'ENTRY',
        price: '4000',
        quantity: '0.5',
        fee: '1.2',
        executedAt: '2026-08-14T09:15:00Z',
      },
      {
        type: 'ENTRY',
        price: '4040',
        quantity: '0.25',
        fee: '0.6',
        executedAt: '2026-08-14T11:02:00Z',
      },
      {
        type: 'EXIT',
        price: '4120',
        quantity: '0.25',
        fee: '0.7',
        executedAt: '2026-08-14T14:30:00Z',
      },
      {
        type: 'EXIT',
        price: '4210',
        quantity: '0.5',
        fee: '1.4',
        executedAt: '2026-08-14T16:45:00Z',
      },
    ],
  },
  {
    // A loss, and a short.
    accountName: 'Personal Bybit',
    symbol: 'SOLUSDT',
    side: 'SHORT',
    initialStopPrice: '205',
    notes: 'Faded the spike; stopped out.',
    executions: [
      { type: 'ENTRY', price: '200', quantity: '20', fee: '2', executedAt: '2026-08-13T12:00:00Z' },
      {
        type: 'EXIT',
        price: '205',
        quantity: '20',
        fee: '2.05',
        executedAt: '2026-08-13T13:20:00Z',
      },
    ],
  },
  {
    // Straddles the local midnight boundary: 22:40Z on the 15th is the 16th
    // in Europe/Amsterdam, so this must bucket into 16 August.
    accountName: 'Personal Hyperliquid',
    symbol: 'BTCUSDT',
    side: 'SHORT',
    initialStopPrice: '121000',
    notes: 'Late session fade — lands on the next local day.',
    executions: [
      {
        type: 'ENTRY',
        price: '120500',
        quantity: '0.05',
        fee: '3',
        executedAt: '2026-08-15T20:10:00Z',
      },
      {
        type: 'EXIT',
        price: '119800',
        quantity: '0.05',
        fee: '3',
        executedAt: '2026-08-15T22:40:00Z',
      },
    ],
  },
  {
    // Partially closed: realizes PnL now, stays OPEN, and the remaining size
    // never appears in a realized-PnL table.
    accountName: 'Personal Bybit',
    symbol: 'ETHUSDT',
    side: 'LONG',
    initialStopPrice: '4100',
    notes: 'Took half off, letting the rest run.',
    executions: [
      { type: 'ENTRY', price: '4150', quantity: '1', fee: '2', executedAt: '2026-08-12T08:00:00Z' },
      {
        type: 'EXIT',
        price: '4300',
        quantity: '0.4',
        fee: '1',
        executedAt: '2026-08-12T15:30:00Z',
      },
    ],
  },
  {
    // Fully open, no exits at all.
    accountName: 'Personal Hyperliquid',
    symbol: 'ARBUSDT',
    side: 'LONG',
    initialStopPrice: '0.72',
    notes: 'Swing entry, still on.',
    executions: [
      {
        type: 'ENTRY',
        price: '0.81',
        quantity: '5000',
        fee: '4',
        executedAt: '2026-08-11T10:00:00Z',
      },
    ],
  },
  {
    // No stop recorded, so R is null rather than zero.
    accountName: 'FTMO Challenge #1',
    symbol: 'XAUUSD',
    side: 'LONG',
    initialStopPrice: null,
    notes: 'Discretionary scalp — no stop logged.',
    executions: [
      {
        type: 'ENTRY',
        price: '3410.5',
        quantity: '2',
        fee: '1',
        executedAt: '2026-08-10T07:45:00Z',
      },
      {
        type: 'EXIT',
        price: '3418.2',
        quantity: '2',
        fee: '1',
        executedAt: '2026-08-10T09:05:00Z',
      },
    ],
  },
];

function toExecutionInputs(executions: readonly SeedExecution[]): ExecutionInput[] {
  return executions.map((execution, index) => ({
    id: randomUUID(),
    type: execution.type,
    price: execution.price,
    quantity: execution.quantity,
    fee: execution.fee ?? '0',
    executedAt: new Date(execution.executedAt),
    createdAt: new Date(Date.parse(execution.executedAt) + index),
  }));
}

async function seed(): Promise<void> {
  const db = createDatabase({ connectionString: readConnectionString(), maxConnections: 1 });

  try {
    await db.transaction(async (tx) => {
      // Idempotent: a re-run replaces the sample data rather than duplicating it.
      await tx.delete(trades);
      await tx.delete(positions);
      await tx.delete(accounts);
      await tx.delete(users);

      await tx.insert(users).values([...SEED_USERS]);
      await tx.insert(accounts).values([...SEED_ACCOUNTS]);

      for (const seedPosition of SEED_POSITIONS) {
        const account = SEED_ACCOUNTS.find((row) => row.name === seedPosition.accountName);
        if (account === undefined) {
          throw new Error(`Seed refers to an unknown account: ${seedPosition.accountName}`);
        }

        const executions = toExecutionInputs(seedPosition.executions);
        const result = reconstructPosition({
          side: seedPosition.side,
          initialStopPrice: seedPosition.initialStopPrice,
          accountStartingBalance: account.startingBalance,
          executions,
        });

        if (!result.ok) {
          throw new Error(
            `Seed position ${seedPosition.symbol} is invalid: ${result.issues
              .map((issue) => `${issue.code} ${issue.message}`)
              .join('; ')}`,
          );
        }

        const positionId = randomUUID();
        await tx.insert(positions).values({
          id: positionId,
          ...toPositionRow(
            {
              accountId: account.id,
              symbol: seedPosition.symbol,
              marketType: 'PERPETUAL',
              side: seedPosition.side,
              initialStopPrice: seedPosition.initialStopPrice,
              notes: seedPosition.notes,
            },
            result.position,
          ),
        });
        await tx.insert(trades).values(toTradeRows(positionId, executions, result.position));
      }
    });

    console.info(
      `Seeded ${SEED_USERS.length} traders, ${SEED_ACCOUNTS.length} accounts, ${SEED_POSITIONS.length} positions.`,
    );
  } finally {
    await db.closeConnection();
  }
}

try {
  await seed();
} catch (error) {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
