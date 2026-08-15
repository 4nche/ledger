import type { ExecutionInput } from '../types.js';

/**
 * An entry stamped at the same instant as an exit is treated as happening
 * first — the only reading that can produce a valid position.
 * See docs/accounting-rules.md §4.
 */
const TYPE_RANK: Record<ExecutionInput['type'], number> = { ENTRY: 0, EXIT: 1 };

function compare(a: ExecutionInput, b: ExecutionInput): number {
  const byExecutedAt = a.executedAt.getTime() - b.executedAt.getTime();
  if (byExecutedAt !== 0) return byExecutedAt;

  const byType = TYPE_RANK[a.type] - TYPE_RANK[b.type];
  if (byType !== 0) return byType;

  const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreatedAt !== 0) return byCreatedAt;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Returns a new ordered array; the input is never mutated. */
export function sortExecutions(executions: readonly ExecutionInput[]): ExecutionInput[] {
  return [...executions].sort(compare);
}
