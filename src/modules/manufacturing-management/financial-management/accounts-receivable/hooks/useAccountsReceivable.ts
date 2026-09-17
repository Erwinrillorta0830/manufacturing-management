"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  buildARQueryParams,
  mapARRowToInvoice,
  shouldApplyTableResponse,
  isAbortError,
  type TableRequestContext,
} from '../utils';
import type {
  Invoice,
  AgingBucket,
  SalesmanARData,
  ARMetrics,
  OperationBreakdown,
  ARTableFilters,
  ARTableSort,
  ARSummaryResponse,
  ARTableResponse,
  CustomerGroup,
  ARFilterOptions,
  RawInvoiceRow,
} from '../types';

interface UseARResult {
  loading: boolean;
  tableLoading: boolean;
  error: string | null;
  invoices: Invoice[];
  agingData: AgingBucket[];
  salesmanData: SalesmanARData[];
  metrics: ARMetrics;
  operationData: OperationBreakdown[];
  filterOptions: ARFilterOptions;
  customerGroups: CustomerGroup[];
  tablePage: number;
  tableTotalPages: number;
  totalInvoices: number;
  filteredCount: number;
  totalGroups: number;
  truncated: boolean;
  tableSort: ARTableSort;
  setTablePage: (page: number | ((prev: number) => number)) => void;
  onTableSortChange: (sortKey: keyof Invoice | null, sortOrder: 'asc' | 'desc' | null) => void;
  refresh: (filters: ARTableFilters, page?: number) => void;
}

const EMPTY_FILTER_OPTIONS: ARFilterOptions = {
  customers: [],
  clusters: [],
  salesmen: [],
  divisions: [],
  operations: [],
};

const DEFAULT_TABLE_SORT: ARTableSort = { sortKey: null, sortOrder: null };

function summaryToMetrics(summary: ARSummaryResponse): ARMetrics {
  return {
    totalReceivable: summary.metrics.totalReceivable,
    totalOutstanding: summary.metrics.totalOutstanding,
    totalUnposted: summary.metrics.totalUnposted,
    realOutstanding: summary.metrics.realOutstanding,
    overdueInvoices: [],
    overdueCount: summary.metrics.overdueCount,
    avgOverdue: summary.metrics.avgOverdue,
    totalPendingCancellation: summary.metrics.totalPendingCancellation,
    unpostedAllocationsActive: summary.unpostedAllocationsActive,
    unpostedAllocationsPaid: summary.unpostedAllocationsPaid,
    unpostedUnallocated: summary.unpostedUnallocated,
  };
}

export function useAccountsReceivable(
  filters: ARTableFilters,
  deferredFilters?: ARTableFilters
): UseARResult {
  const activeFilters = deferredFilters ?? filters;
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [agingData, setAgingData] = useState<AgingBucket[]>([
    { range: '0-30 Days', amount: 0 },
    { range: '31-60 Days', amount: 0 },
    { range: '61-90 Days', amount: 0 },
    { range: '90+ Days', amount: 0 },
  ]);
  const [salesmanData, setSalesmanData] = useState<SalesmanARData[]>([]);
  const [operationData, setOperationData] = useState<OperationBreakdown[]>([]);
  const [metrics, setMetrics] = useState<ARMetrics>({
    totalReceivable: 0,
    totalOutstanding: 0,
    totalUnposted: 0,
    realOutstanding: 0,
    overdueInvoices: [],
    avgOverdue: 0,
  });
  const [filterOptions, setFilterOptions] = useState<ARFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [tableTotalPages, setTableTotalPages] = useState(1);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [tableSort, setTableSort] = useState<ARTableSort>(DEFAULT_TABLE_SORT);

  const filtersRef = useRef(activeFilters);
  const pageRef = useRef(tablePage);
  const sortRef = useRef(tableSort);
  const requestEpochRef = useRef(0);
  const tableRequestIdRef = useRef(0);
  const tableAbortRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);
  filtersRef.current = activeFilters;
  pageRef.current = tablePage;
  sortRef.current = tableSort;

  const beginTableRequest = useCallback((
    page: number,
    sort: ARTableSort,
    f: ARTableFilters,
  ): TableRequestContext => {
    tableAbortRef.current?.abort();
    tableAbortRef.current = new AbortController();
    return {
      id: ++tableRequestIdRef.current,
      page,
      sort,
      filters: f,
    };
  }, []);

  const fetchSummary = useCallback(async (f: ARTableFilters, epoch: number, signal?: AbortSignal) => {
    const qs = buildARQueryParams(f);
    const url = `/api/manufacturing/financial-management/accounts-receivable?view=summary${qs ? `&${qs}` : ''}`;
    const res = await fetch(url, { credentials: 'include', signal });
    if (!res.ok) throw new Error(`Summary request failed: ${res.status}`);
    const data: ARSummaryResponse = await res.json();
    if (epoch !== requestEpochRef.current) return null;
    setAgingData(data.agingData);
    setSalesmanData(data.salesmanData);
    setOperationData(data.operationData);
    setMetrics(summaryToMetrics(data));
    setFilterOptions(data.filterOptions);
    setTotalInvoices(data.totalInvoices);
    setFilteredCount(data.filteredCount);
    return data;
  }, []);

  const fetchTable = useCallback(async (ctx: TableRequestContext, signal?: AbortSignal) => {
    const qs = buildARQueryParams(ctx.filters, ctx.sort);
    const url = `/api/manufacturing/financial-management/accounts-receivable?view=table&page=${ctx.page}&pageSize=10${qs ? `&${qs}` : ''}`;
    const res = await fetch(url, { credentials: 'include', signal });
    if (!res.ok) throw new Error(`Table request failed: ${res.status}`);
    const data: ARTableResponse = await res.json();
    if (!shouldApplyTableResponse(
      ctx,
      tableRequestIdRef.current,
      pageRef.current,
      sortRef.current,
      filtersRef.current,
      data,
    )) {
      return null;
    }
    setCustomerGroups(data.customerGroups);
    if (data.page !== pageRef.current) {
      pageRef.current = data.page;
      setTablePage(data.page);
    }
    setTableTotalPages(data.totalPages);
    setFilteredCount(data.filteredCount);
    setTotalGroups(data.totalGroups);
    setTruncated(data.truncated ?? false);
    return data;
  }, []);

  const fetchDrilldownInvoices = useCallback(async (f: ARTableFilters, epoch: number, signal?: AbortSignal) => {
    const qs = buildARQueryParams(f);
    const url = `/api/manufacturing/financial-management/accounts-receivable?view=full${qs ? `&${qs}` : ''}`;
    const res = await fetch(url, { credentials: 'include', signal });
    if (!res.ok) return;
    const data = await res.json();
    if (epoch !== requestEpochRef.current) return;
    const rows: RawInvoiceRow[] = data.rows ?? [];
    setInvoices(rows.map(mapARRowToInvoice));
  }, []);

  const refresh = useCallback(async (f: ARTableFilters, page = 1) => {
    const epoch = ++requestEpochRef.current;
    const tableCtx = beginTableRequest(page, sortRef.current, f);
    setTableLoading(true);
    try {
      await Promise.all([
        fetchSummary(f, epoch),
        fetchTable(tableCtx, tableAbortRef.current?.signal),
        fetchDrilldownInvoices(f, epoch),
      ]);
      if (epoch !== requestEpochRef.current) return;
      setError(null);
    } catch (e: unknown) {
      if (isAbortError(e)) return;
      if (epoch !== requestEpochRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`Failed to load data: ${msg}`);
    } finally {
      if (tableCtx.id === tableRequestIdRef.current) {
        setTableLoading(false);
      }
    }
  }, [beginTableRequest, fetchSummary, fetchTable, fetchDrilldownInvoices]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const isFirstFetch = !hasFetchedRef.current;
    const debounceMs = isFirstFetch ? 0 : 300;
    let toastId: string | number | undefined;

    const handle = setTimeout(async () => {
      const epoch = ++requestEpochRef.current;
      const f = filtersRef.current;
      const page = 1;
      const tableCtx = beginTableRequest(page, sortRef.current, f);

      if (isFirstFetch) {
        setLoading(true);
        toastId = toast.loading('Loading accounts receivable…');
      } else {
        setTableLoading(true);
      }
      pageRef.current = page;
      setTablePage(page);

      try {
        await Promise.all([
          fetchSummary(f, epoch, controller.signal),
          fetchTable(tableCtx, controller.signal),
          isFirstFetch ? Promise.resolve() : fetchDrilldownInvoices(f, epoch, controller.signal),
        ]);
        if (cancelled || epoch !== requestEpochRef.current) return;

        if (isFirstFetch) {
          fetchDrilldownInvoices(f, epoch, controller.signal).catch(() => {});
        }
        setError(null);
        if (isFirstFetch && toastId !== undefined) {
          toast.success('Data loaded successfully', { id: toastId });
        }
      } catch (e: unknown) {
        if (isAbortError(e)) return;
        if (cancelled || epoch !== requestEpochRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        if (isFirstFetch && toastId !== undefined) {
          toast.error(`Failed to load data: ${msg}`, { id: toastId });
        } else {
          toast.error(`Failed to load data: ${msg}`);
        }
      } finally {
        if (!cancelled && epoch === requestEpochRef.current) {
          setLoading(false);
          if (tableCtx.id === tableRequestIdRef.current) {
            setTableLoading(false);
          }
          hasFetchedRef.current = true;
        }
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      controller.abort();
      if (toastId !== undefined) toast.dismiss(toastId);
    };
  }, [activeFilters, beginTableRequest, fetchSummary, fetchTable, fetchDrilldownInvoices]);

  const handleSetTablePage = useCallback((page: number | ((prev: number) => number)) => {
    setTablePage((prev) => {
      const next = typeof page === 'function' ? page(prev) : page;
      pageRef.current = next;
      const tableCtx = beginTableRequest(next, sortRef.current, filtersRef.current);
      setTableLoading(true);
      fetchTable(tableCtx, tableAbortRef.current?.signal)
        .catch((e: unknown) => {
          if (isAbortError(e)) return;
          if (tableCtx.id !== tableRequestIdRef.current) return;
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
        })
        .finally(() => {
          if (tableCtx.id === tableRequestIdRef.current) {
            setTableLoading(false);
          }
        });
      return next;
    });
  }, [beginTableRequest, fetchTable]);

  const onTableSortChange = useCallback((sortKey: keyof Invoice | null, sortOrder: 'asc' | 'desc' | null) => {
    const next: ARTableSort = sortKey && sortOrder
      ? { sortKey, sortOrder }
      : DEFAULT_TABLE_SORT;
    setTableSort(next);
    sortRef.current = next;
    pageRef.current = 1;
    setTablePage(1);
    const tableCtx = beginTableRequest(1, next, filtersRef.current);
    setTableLoading(true);
    fetchTable(tableCtx, tableAbortRef.current?.signal)
      .catch((e: unknown) => {
        if (isAbortError(e)) return;
        if (tableCtx.id !== tableRequestIdRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      })
      .finally(() => {
        if (tableCtx.id === tableRequestIdRef.current) {
          setTableLoading(false);
        }
      });
  }, [beginTableRequest, fetchTable]);

  return {
    loading,
    tableLoading,
    error,
    invoices,
    agingData,
    salesmanData,
    metrics,
    operationData,
    filterOptions,
    customerGroups,
    tablePage,
    tableTotalPages,
    totalInvoices,
    filteredCount,
    totalGroups,
    truncated,
    tableSort,
    setTablePage: handleSetTablePage,
    onTableSortChange,
    refresh,
  };
}
