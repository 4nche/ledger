/**
 * One envelope for every response, so clients have a single shape to branch on.
 * Modelled as a discriminated union rather than a bag of optional fields —
 * checking `success` narrows `data` and `error` automatically.
 */

export interface PaginationMeta {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

/** A field-level problem, shaped so a form can attach it to the right input. */
export interface ApiIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface ApiSuccess<TData> {
  readonly success: true;
  readonly data: TData;
  readonly meta?: PaginationMeta;
}

export interface ApiFailure {
  readonly success: false;
  readonly error: string;
  readonly issues?: readonly ApiIssue[];
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export function apiSuccess<TData>(data: TData, meta?: PaginationMeta): ApiSuccess<TData> {
  return meta === undefined ? { success: true, data } : { success: true, data, meta };
}

export function apiFailure(error: string, issues?: readonly ApiIssue[]): ApiFailure {
  return issues === undefined ? { success: false, error } : { success: false, error, issues };
}

export function paginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return { total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
