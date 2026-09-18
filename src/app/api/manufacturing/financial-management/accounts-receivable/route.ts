import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  applyARFilters,
  buildCustomerGroups,
  deriveScopedUnpostedMetrics,
  getARPayload,
  type ARTableFilters,
  type ARFullPayload,
  type ARRow,
} from './_arData';
import { parseARTableSort, sortCustomerGroups } from '@/modules/manufacturing-management/financial-management/accounts-receivable/utils/arTableSort';
import { summaryTotalInvoices, tableTotalInvoices } from './_arRouteCounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'vos_access_token';
const CACHE_TTL_SEC = 60;

function parseFilters(searchParams: URLSearchParams): ARTableFilters {
  return {
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
    customer: searchParams.get('customer') || undefined,
    cluster: searchParams.get('cluster') || undefined,
    salesman: searchParams.get('salesman') || undefined,
    division: searchParams.get('division') || undefined,
    operation: searchParams.get('operation') || undefined,
    agingRange: searchParams.get('agingRange') || undefined,
    search: searchParams.get('search') || undefined,
  };
}

function hasActiveFilters(filters: ARTableFilters): boolean {
  return !!(filters.dateFrom || filters.dateTo || filters.customer || filters.cluster ||
    filters.salesman || filters.division || filters.operation || filters.agingRange || filters.search);
}

function filterOperationData(payload: ARFullPayload, filteredRows: ARRow[]) {
  const agg = new Map<number | null, { id: number | null; name: string; code: string | null; totalOutstanding: number; count: number }>();
  for (const row of filteredRows) {
    const key = row.salesType;
    if (!agg.has(key)) {
      const op = payload.operationData.find(o => o.id === key);
      agg.set(key, {
        id: key,
        name: op?.name ?? 'Unknown',
        code: op?.code ?? null,
        totalOutstanding: 0,
        count: 0,
      });
    }
    const e = agg.get(key)!;
    e.totalOutstanding += row.outstandingBalance;
    e.count += 1;
  }
  return Array.from(agg.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

function deriveFilteredSalesmanData(filteredRows: ARRow[]) {
  const map: Record<string, { value: number; unposted: number }> = {};
  for (const row of filteredRows) {
    if (!map[row.salesman]) map[row.salesman] = { value: 0, unposted: 0 };
    map[row.salesman].value += row.outstandingBalance;
    map[row.salesman].unposted += row.unpostedCollectionAmount || 0;
  }
  return Object.entries(map)
    .map(([name, { value, unposted }]) => ({ name, value, unposted }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function deriveFilteredAging(filteredRows: ARRow[]) {
  const buckets = [
    { range: '0-30 Days', amount: 0 },
    { range: '31-60 Days', amount: 0 },
    { range: '61-90 Days', amount: 0 },
    { range: '90+ Days', amount: 0 },
  ];
  for (const row of filteredRows) {
    const aging = row.daysOverdue;
    if (aging === null || aging < 0 || row.outstandingBalance <= 0) continue;
    if (aging <= 30) buckets[0].amount += row.outstandingBalance;
    else if (aging <= 60) buckets[1].amount += row.outstandingBalance;
    else if (aging <= 90) buckets[2].amount += row.outstandingBalance;
    else buckets[3].amount += row.outstandingBalance;
  }
  return buckets;
}

function deriveFilteredMetrics(filteredRows: ARRow[]) {
  const totalReceivable = filteredRows.reduce((s, r) => s + r.netReceivable, 0);
  const totalOutstanding = filteredRows.reduce((s, r) => s + r.outstandingBalance, 0);
  const overdue = filteredRows.filter(r => r.daysOverdue !== null && r.daysOverdue >= 0 && r.outstandingBalance > 0);
  const totalPendingCancellation = filteredRows
    .filter(r => r.transactionStatus === 'Cancellation Requested')
    .reduce((sum, row) => sum + row.outstandingBalance, 0);
  const scoped = deriveScopedUnpostedMetrics(filteredRows);
  return {
    totalReceivable,
    totalOutstanding,
    totalUnposted: scoped.totalUnposted,
    realOutstanding: scoped.realOutstanding,
    avgOverdue: overdue.length > 0
      ? Math.round(overdue.reduce((s, r) => s + (r.daysOverdue ?? 0), 0) / overdue.length)
      : 0,
    overdueCount: overdue.length,
    invoiceCount: filteredRows.length,
    totalPendingCancellation,
    unpostedAllocationsActive: scoped.unpostedAllocationsActive,
    unpostedAllocationsPaid: scoped.unpostedAllocationsPaid,
    unpostedUnallocated: scoped.unpostedUnallocated,
  };
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'full';
  const filters = parseFilters(searchParams);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10) || 10));

  try {
    const cacheKey = `ar:${token.slice(0, 16)}`;
    const payload = await getARPayload(cacheKey);
    const filtered = hasActiveFilters(filters) ? applyARFilters(payload.rows, filters) : payload.rows;

    const pool = {
      totalUnpostedPool: payload.totalUnpostedPool,
      unpostedAllocationsActive: payload.unpostedAllocationsActive,
      unpostedAllocationsPaid: payload.unpostedAllocationsPaid,
      unpostedUnallocated: payload.unpostedUnallocated,
    };
    const isFiltered = hasActiveFilters(filters);
    const scopedPool = isFiltered ? deriveScopedUnpostedMetrics(filtered) : null;
    const responsePool = scopedPool ?? pool;

    const cacheHeaders = {
      'Cache-Control': `private, max-age=${CACHE_TTL_SEC}`,
    };

    if (view === 'summary') {
      return NextResponse.json({
        view: 'summary',
        metrics: isFiltered ? deriveFilteredMetrics(filtered) : payload.metrics,
        agingData: isFiltered ? deriveFilteredAging(filtered) : payload.agingData,
        salesmanData: isFiltered
          ? deriveFilteredSalesmanData(filtered)
          : payload.salesmanData,
        operationData: isFiltered ? filterOperationData(payload, filtered) : payload.operationData,
        filterOptions: payload.filterOptions,
        totalInvoices: summaryTotalInvoices(payload, isFiltered),
        filteredCount: filtered.length,
        totalUnpostedPool: responsePool.totalUnpostedPool,
        unpostedAllocationsActive: responsePool.unpostedAllocationsActive,
        unpostedAllocationsPaid: responsePool.unpostedAllocationsPaid,
        unpostedUnallocated: responsePool.unpostedUnallocated,
        salesmanUnposted: payload.salesmanUnposted,
      }, { headers: cacheHeaders });
    }

    if (view === 'table') {
      const tableSort = parseARTableSort(searchParams);
      const { groups, truncated } = buildCustomerGroups(filtered);
      const sorted = sortCustomerGroups(groups, tableSort);
      const totalGroups = sorted.length;
      const totalPages = Math.ceil(totalGroups / pageSize) || 1;
      const safePage = Math.min(page, totalPages);
      const pagedGroups = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

      return NextResponse.json({
        view: 'table',
        customerGroups: pagedGroups,
        page: safePage,
        pageSize,
        totalPages,
        totalGroups,
        totalInvoices: tableTotalInvoices(payload, filtered, isFiltered),
        filteredCount: filtered.length,
        sortKey: tableSort.sortKey,
        sortOrder: tableSort.sortOrder,
        truncated,
      }, { headers: cacheHeaders });
    }

    // view=full (default — backward compatible; applies filters when provided)
    const fullRows = filtered;
    const fullOperationData = hasActiveFilters(filters) ? filterOperationData(payload, filtered) : payload.operationData;
    const fullAging = hasActiveFilters(filters) ? deriveFilteredAging(filtered) : payload.agingData;
    const fullSalesman = isFiltered
      ? deriveFilteredSalesmanData(filtered)
      : payload.salesmanData;
    const fullMetrics = isFiltered ? deriveFilteredMetrics(filtered) : payload.metrics;

    return NextResponse.json({
      rows: fullRows,
      operationData: fullOperationData,
      agingData: fullAging,
      salesmanData: fullSalesman,
      metrics: fullMetrics,
      filterOptions: payload.filterOptions,
      totalUnpostedPool: responsePool.totalUnpostedPool,
      unpostedAllocationsActive: responsePool.unpostedAllocationsActive,
      unpostedAllocationsPaid: responsePool.unpostedAllocationsPaid,
      unpostedUnallocated: responsePool.unpostedUnallocated,
      salesmanUnposted: payload.salesmanUnposted,
    }, { headers: cacheHeaders });
  } catch (err: unknown) {
    console.error('[AR API Error]:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load accounts receivable', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
