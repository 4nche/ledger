# Accounting rules

This document is the authoritative definition of every derived financial value in the
journal. `packages/domain` implements exactly these rules and its unit tests encode the
worked examples below. If a rule here and the code disagree, that is a bug in one of them —
never a judgement call at the call site.

Nothing in this document may be re-decided inside a Fastify route, a React component, or a
SQL query.

---

## 1. Numeric representation

- PostgreSQL stores decimals as `numeric`. Never `float8`, never `real`.
- The API transports decimals as **JSON strings** (`"117523.40"`), never JSON numbers.
- Backend arithmetic uses `decimal.js` configured at **40 significant digits**.
- No intermediate rounding. Values are rounded only at the display layer.
- Division (weighted averages, percentages, R) is the only operation where precision is
  observable; 40 digits is far beyond the 12 decimal places we persist.

Persisted scales:

| Value                             | Type              |
| --------------------------------- | ----------------- |
| prices, quantities                | `NUMERIC(30, 12)` |
| money (PnL, fees, risk, balances) | `NUMERIC(24, 8)`  |
| ratios (percentages, R)           | `NUMERIC(16, 8)`  |

---

## 2. Ownership model

**An account is owned by exactly one trader.**

```
users 1---N accounts 1---N positions 1---N trades
```

`positions` has **no** `trader_id`. The trader of a position is
`position -> account -> user`. This makes it impossible for the two to drift apart.

The "Trader" filter on the overview resolves through that join. If shared accounts are ever
needed, that is an additive migration (a join table), not a correction of drifted data.

---

## 3. Quantity vocabulary

The words "open" and "closed" are ambiguous for quantities, so we do not use them:

| Field            | Meaning                                              |
| ---------------- | ---------------------------------------------------- |
| `entry_quantity` | total quantity ever entered (sum of ENTRY trades)    |
| `exit_quantity`  | total quantity ever exited (sum of EXIT trades)      |
| `open_quantity`  | `entry_quantity - exit_quantity`, i.e. still on risk |

Invariants: `entry_quantity >= 0`, `exit_quantity >= 0`, `exit_quantity <= entry_quantity`.

---

## 4. Execution ordering

Several rules depend on "the entries that existed at the time of an exit". Ordering must be
total and deterministic, so executions are ordered by:

```
executed_at ASC, then ENTRY before EXIT, then created_at ASC, then id ASC
```

The `ENTRY before EXIT` tie-break means an entry and an exit stamped at the same instant
behave as enter-then-exit, which is the only reading that can produce a valid position.

---

## 5. Cost basis: weighted average

At any execution time `T`, considering only ENTRY trades at or before `T`:

```
avgEntry(T)         = Σ(price × quantity) / Σ(quantity)
entryFeePerUnit(T)  = Σ(fee)              / Σ(quantity)
```

`avgEntry` over all entries is persisted as `positions.average_entry_price`.
`positions.average_exit_price` is the same weighted average over all EXIT trades.

We use weighted-average cost basis, not FIFO and not LIFO. This is a deliberate choice: it
is order-independent for the common case, it needs no lot tracking, and it matches how
traders read their own scaled positions. It is **not** a tax accounting method and this tool
does not produce tax output.

---

## 6. Realized PnL

### 6.1 Per exit execution (the primitive)

Realized PnL is computed **per EXIT trade**, against the cost basis as it stood at that
exit's timestamp. For an exit `x` at time `T` with quantity `q`:

```
LONG   gross = (x.price - avgEntry(T)) × q
SHORT  gross = (avgEntry(T) - x.price) × q

allocatedEntryFee = entryFeePerUnit(T) × q
realizedPnl(x)    = gross - x.fee - allocatedEntryFee
```

Entry fees are allocated pro-rata per unit closed. A position that is only half closed has
only half its entry fees recognised — the rest stays with the open portion, which is the
correct treatment.

These per-exit values are persisted on the `trades` row (`realized_pnl`, `realized_pnl_pct`,
`r_multiple`) because the overview buckets by realized event (see §10).

### 6.2 Position rollup

```
positions.realized_pnl = Σ realizedPnl(x) for all EXIT trades x
positions.fees         = Σ fee for all trades (entries and exits)
```

Note that `positions.fees` is the total fee paid, while the fee subtracted inside
`realized_pnl` is only the portion allocated to closed quantity. For a fully closed position
these are equal.

### 6.3 Worked example (matches the spec)

```
Account starting balance : 100,000
ENTRY  0.1 @ 117,500   fee 0
EXIT   0.1 @ 120,000   fee 8.24
initial stop 115,000
```

```
avgEntry           = 117,500
gross              = (120,000 - 117,500) × 0.1 = 250
allocatedEntryFee  = 0
realized_pnl       = 250 - 8.24 - 0 = 241.76
```

---

## 7. Initial risk and R multiple

The stop that existed when the position was opened is stored as `initial_stop_price` and is
**never overwritten** when a trader moves their stop.

```
initialRisk = |firstEntryPrice - initialStopPrice| × entry_quantity
```

The price anchor is the **first** entry, not the moving average. Adding to a position
therefore does not retroactively rewrite the risk-per-unit of the original decision.

```
r_multiple(position) = realized_pnl / initialRisk
r_multiple(exit x)   = realizedPnl(x) / initialRisk        (same denominator)
```

Because the denominator is shared, per-exit R values sum to the position R.

If `initial_stop_price` is null, `initial_risk_amount` and every `r_multiple` are null — not
zero. Null R rows are excluded from R aggregates rather than counted as 0R.

Validation: for LONG the stop must be **below** the first entry; for SHORT, **above**. A
stop on the wrong side is rejected, not silently absolute-valued.

Worked example: `|117,500 - 115,000| × 0.1 = 250`, so `R = 241.76 / 250 = +0.96704`,
displayed as `+0.97R`.

---

## 8. Percentages

**All percentages are expressed against `account.starting_balance`.**

```
realized_pnl_pct = realized_pnl / account.starting_balance
risk_pct         = initialRisk  / account.starting_balance
```

Worked example: `241.76 / 100,000 = 0.0024176` → displayed `+0.24%`, and
`250 / 100,000 = 0.0025` → `0.25%`. These match the spec mockups.

Two consequences we accept knowingly:

1. This is a **static** denominator. It does not compound as the account grows. When
   `account_balance_snapshots` land (spec §9.3) the denominator becomes balance-at-trade-time
   and this rule is revisited — that is the only reason to change it.
2. A period return percentage is **undefined across multiple accounts** (there is no single
   denominator). The UI therefore hides the return-% figure whenever the active filter spans
   more than one account. It shows absolute PnL and R, which are always well defined.

---

## 9. Position status

Derived, never set by a client:

```
exit_quantity == 0                          -> OPEN
0 < exit_quantity < entry_quantity          -> OPEN   (partially closed)
exit_quantity == entry_quantity             -> CLOSED
```

`opened_at` = `executed_at` of the first ENTRY.
`closed_at` = `executed_at` of the final EXIT, and is **null** unless status is CLOSED.

---

## 10. Time and reporting buckets

- Every timestamp is persisted as `TIMESTAMPTZ` and reasoned about in UTC.
- Every bucketing function takes an **explicit** IANA reporting timezone parameter. There is
  no default inside the domain package and the server's local timezone is never consulted.
- Weeks are **ISO-8601** weeks (Monday start, week 01 contains the first Thursday).

**Realized PnL is bucketed by the `executed_at` of the EXIT execution that realized it**,
not by the position's `closed_at`.

This is why §6.1 makes the per-exit value the primitive. A position entered in August and
scaled out across August and October contributes its August slice to August and its October
slice to October. Bucketing by `closed_at` would have credited the whole result to October
and shown August as flat, which is false.

Consequences for the overview:

- a row in a period table is one **realized event**, not one position;
- a position fully closed in a single exit renders exactly as the spec mockups show;
- a group's "Trades" count counts realized events, and distinct positions are shown
  alongside it so the number cannot be misread;
- open positions (and the unrealized portion of partially closed ones) never appear in
  realized-PnL tables; they live in a separate Open Positions section.

Boundary example: `2026-08-15T22:30:00Z` is `2026-08-16 00:30` in Europe/Amsterdam (CEST,
UTC+2), so with a Europe/Amsterdam reporting timezone it belongs to **16 August**.

---

## 11. Instrument assumptions (v1)

v1 supports **linear contracts only**:

- `quantity` is denominated in the base asset (0.1 BTC), not in contracts;
- there is no contract multiplier;
- PnL is denominated in the account's currency, and quote currency is assumed to equal
  account currency.

Inverse / coin-margined contracts invert the PnL formula and are **not** supported. The
domain layer rejects them rather than computing a wrong number. Adding them means adding an
explicit contract-spec concept, not patching the formulas.

---

## 12. Mutations and auditability

- Every derived field is written by one application service, `recalculatePosition(id)`,
  inside a single transaction. No other code path writes derived columns.
- `recalculatePosition` is idempotent: running it twice yields identical rows.
- Positions and trades are **soft deleted** (`deleted_at`). Raw executions are never
  destroyed; the journal's value is its history.
- A client-supplied derived value is ignored, never trusted.

---

## 13. Client-side calculation

The browser may import `@journal/domain` to render the live PnL/R preview in the New
Position form. This is display-only.

The rule is: **the browser never persists a value it calculated.** On save it sends raw
executions, and the API recalculates everything from scratch. Sharing the pure domain
package is precisely what keeps the preview and the stored result in agreement.
