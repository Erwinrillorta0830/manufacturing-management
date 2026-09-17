import type { ARTableFilters } from '../types';

export function hasActiveARFilters(f: ARTableFilters): boolean {
  return !!(
    f.dateFrom ||
    f.dateTo ||
    f.customer ||
    f.cluster ||
    f.salesman ||
    f.division ||
    f.operation ||
    f.agingRange ||
    f.search?.trim()
  );
}

export function arFiltersEqual(a: ARTableFilters, b: ARTableFilters): boolean {
  return (
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    a.customer === b.customer &&
    a.cluster === b.cluster &&
    a.salesman === b.salesman &&
    a.division === b.division &&
    a.operation === b.operation &&
    a.agingRange === b.agingRange &&
    (a.search?.trim() ?? '') === (b.search?.trim() ?? '')
  );
}

export function shouldApplyResponse(
  epoch: number,
  currentEpoch: number,
  cancelled: boolean,
): boolean {
  return !cancelled && epoch === currentEpoch;
}
