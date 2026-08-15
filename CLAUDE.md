# Project rules

## Non-negotiables

1. **`docs/accounting-rules.md` is authoritative.** Every derived financial value is defined
   there. Do not re-decide cost basis, fee allocation, R denominators, or bucketing anywhere
   else. Change the doc and its tests together.
2. **No floating point for money.** `numeric` in PostgreSQL, `decimal.js` in TypeScript,
   decimal **strings** across the API boundary. A JSON number where a price or quantity
   belongs is a bug.
3. **The API owns all mutations and all authoritative calculation.** Client-supplied derived
   values are ignored. The browser may calculate for preview only, and never persists what it
   calculated.
4. **`packages/domain` stays pure.** No React, no Fastify, no database access, no clock, no
   timezone default. Bucketing functions take an explicit IANA timezone argument.
5. **Raw executions are never destroyed.** Positions and trades are soft deleted. Derived
   columns are rewritten only by `recalculatePosition(id)`, inside a transaction.

## UI

shadcn/ui is the component system. Before writing a UI primitive, check whether shadcn/ui
already has it — it almost certainly does. Custom components should be _domain compositions_
(`TradeTable`, `PositionForm`, `MetricCard`), never re-implementations of buttons, inputs,
selects, dialogs, tabs, tables, calendars, or popovers.

Visual target: restrained financial dashboard. Information density, readability, tabular
numerals for financial values, semantic profit/loss colour only where it carries meaning. No
gradients, no glassmorphism, no decorative animation, no marketing styling.

Tailwind is for layout, spacing, and sizing — not for inventing a new design system per
screen.

## Testing

Financial calculations are TDD, no exceptions: failing test first, then implementation.
`packages/domain` targets full branch coverage of the rules in `docs/accounting-rules.md`,
including timezone boundaries and ISO week edges.

## Deliberately out of scope for v1

Exchange sync, WebSockets, live prices, charts, screenshots, strategy builder, AI review,
prop-firm APIs, notifications, mobile, tax reporting, RBAC, microservices.
