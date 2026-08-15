import { isDecimalString, parseDecimal, ZERO } from '../money/decimal';
import type { ExecutionInput, PositionInput, ValidationIssue } from '../types';

function issue(
  code: ValidationIssue['code'],
  message: string,
  executionId: string | null = null,
): ValidationIssue {
  return { code, message, executionId };
}

/**
 * Field-level checks that need no ordering. Everything here is reported at
 * once so a form can show every problem in one pass.
 */
export function validateFields(input: PositionInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (input.executions.length === 0) {
    return [issue('NO_EXECUTIONS', 'A position needs at least one execution.')];
  }

  if (!isDecimalString(input.accountStartingBalance)) {
    issues.push(
      issue(
        'INVALID_DECIMAL',
        `Account starting balance is not a decimal: ${input.accountStartingBalance}`,
      ),
    );
  } else if (parseDecimal(input.accountStartingBalance).lessThanOrEqualTo(ZERO)) {
    issues.push(
      issue('NON_POSITIVE_STARTING_BALANCE', 'Account starting balance must be greater than zero.'),
    );
  }

  if (input.initialStopPrice !== null) {
    if (!isDecimalString(input.initialStopPrice)) {
      issues.push(
        issue('INVALID_DECIMAL', `Initial stop is not a decimal: ${input.initialStopPrice}`),
      );
    } else if (parseDecimal(input.initialStopPrice).lessThanOrEqualTo(ZERO)) {
      issues.push(issue('NON_POSITIVE_PRICE', 'Initial stop must be greater than zero.'));
    }
  }

  for (const execution of input.executions) {
    issues.push(...validateExecutionFields(execution));
  }

  if (!input.executions.some((execution) => execution.type === 'ENTRY')) {
    issues.push(issue('NO_ENTRY', 'A position needs at least one entry.'));
  }

  return issues;
}

function validateExecutionFields(execution: ExecutionInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { id, price, quantity, fee } = execution;

  if (!isDecimalString(price)) {
    issues.push(issue('INVALID_DECIMAL', `Price is not a decimal: ${price}`, id));
  } else if (parseDecimal(price).lessThanOrEqualTo(ZERO)) {
    issues.push(issue('NON_POSITIVE_PRICE', 'Price must be greater than zero.', id));
  }

  if (!isDecimalString(quantity)) {
    issues.push(issue('INVALID_DECIMAL', `Quantity is not a decimal: ${quantity}`, id));
  } else if (parseDecimal(quantity).lessThanOrEqualTo(ZERO)) {
    issues.push(issue('NON_POSITIVE_QUANTITY', 'Quantity must be greater than zero.', id));
  }

  if (!isDecimalString(fee)) {
    issues.push(issue('INVALID_DECIMAL', `Fee is not a decimal: ${fee}`, id));
  } else if (parseDecimal(fee).lessThan(ZERO)) {
    issues.push(issue('NEGATIVE_FEE', 'Fee cannot be negative.', id));
  }

  return issues;
}

/**
 * Checks that only make sense once executions are in order: an exit cannot
 * precede the first entry, cannot sell more than has been entered *by that
 * moment*, and the stop must sit on the losing side of the first entry.
 */
export function validateSequence(
  input: PositionInput,
  ordered: readonly ExecutionInput[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const firstEntry = ordered.find((execution) => execution.type === 'ENTRY');

  let enteredSoFar = ZERO;
  let exitedSoFar = ZERO;

  for (const execution of ordered) {
    if (execution.type === 'ENTRY') {
      enteredSoFar = enteredSoFar.plus(parseDecimal(execution.quantity));
      continue;
    }

    if (firstEntry === undefined || execution.executedAt < firstEntry.executedAt) {
      issues.push(
        issue('EXIT_BEFORE_ENTRY', 'An exit cannot happen before the first entry.', execution.id),
      );
    }

    exitedSoFar = exitedSoFar.plus(parseDecimal(execution.quantity));
    if (exitedSoFar.greaterThan(enteredSoFar)) {
      issues.push(
        issue(
          'EXIT_EXCEEDS_ENTRY',
          'Exit quantity exceeds the quantity entered at that point in time.',
          execution.id,
        ),
      );
    }
  }

  if (input.initialStopPrice !== null && firstEntry !== undefined) {
    const stop = parseDecimal(input.initialStopPrice);
    const entry = parseDecimal(firstEntry.price);
    const valid = input.side === 'LONG' ? stop.lessThan(entry) : stop.greaterThan(entry);
    if (!valid) {
      issues.push(
        issue(
          'STOP_ON_WRONG_SIDE',
          input.side === 'LONG'
            ? 'A long stop must be below the first entry price.'
            : 'A short stop must be above the first entry price.',
        ),
      );
    }
  }

  return issues;
}
