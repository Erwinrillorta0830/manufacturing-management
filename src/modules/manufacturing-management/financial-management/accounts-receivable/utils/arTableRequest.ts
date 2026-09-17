import { arFiltersEqual } from './arFilters';
import type { ARTableFilters, ARTableResponse, ARTableSort } from '../types';

export interface TableRequestContext {
  id: number;
  page: number;
  sort: ARTableSort;
  filters: ARTableFilters;
}

export function arTableSortEqual(a: ARTableSort, b: ARTableSort): boolean {
  return a.sortKey === b.sortKey && a.sortOrder === b.sortOrder;
}

export function isCurrentTableRequest(
  ctx: TableRequestContext,
  currentId: number,
  currentPage: number,
  currentSort: ARTableSort,
  currentFilters: ARTableFilters,
): boolean {
  return (
    ctx.id === currentId &&
    ctx.page === currentPage &&
    arTableSortEqual(ctx.sort, currentSort) &&
    arFiltersEqual(ctx.filters, currentFilters)
  );
}

export function matchesTableResponse(
  ctx: TableRequestContext,
  data: ARTableResponse,
): boolean {
  const isServerClampedPage = data.page === data.totalPages && data.page < ctx.page;
  if (data.page !== ctx.page && !isServerClampedPage) return false;
  if (data.sortKey !== undefined && data.sortKey !== ctx.sort.sortKey) return false;
  if (data.sortOrder !== undefined && data.sortOrder !== ctx.sort.sortOrder) return false;
  return true;
}

export function shouldApplyTableResponse(
  ctx: TableRequestContext,
  currentId: number,
  currentPage: number,
  currentSort: ARTableSort,
  currentFilters: ARTableFilters,
  data: ARTableResponse,
): boolean {
  return (
    isCurrentTableRequest(ctx, currentId, currentPage, currentSort, currentFilters) &&
    matchesTableResponse(ctx, data)
  );
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
