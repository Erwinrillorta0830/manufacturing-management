"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJobOrderProfitabilityReport, fetchProfitabilityBatchDetails, fetchProfitabilityFilterOptions } from "../services/report-api";
import type {
    JobOrderProfitabilityFilters,
    JobOrderProfitabilityPayload,
    ProfitabilityBatchDetailsState,
    ProfitabilityOption
} from "../types";

const INITIAL_FILTERS: JobOrderProfitabilityFilters = {
    search: "",
    branchId: "all",
    productId: "all",
    status: "all",
    dateFrom: "",
    dateTo: ""
};

const EMPTY_PAYLOAD: JobOrderProfitabilityPayload = {
    rows: [],
    branches: [],
    products: [],
    statuses: [],
    page: 1,
    pageSize: 20,
    totalRows: 0,
    pageCount: 1,
    summary: {
        batchCount: 0,
        completeBatchCount: 0,
        incompleteBatchCount: 0,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMarginPercent: null,
        unallocatedOutput: 0
    }
};

const EMPTY_BATCH_DETAILS: Record<number, ProfitabilityBatchDetailsState> = {};
const EMPTY_EXPANDED_ROWS = new Set<string>();

export function useJobOrderProfitabilityReport() {
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [payload, setPayload] = useState(EMPTY_PAYLOAD);
    const [filterOptions, setFilterOptions] = useState<{
        branches: ProfitabilityOption[];
        products: ProfitabilityOption[];
        statuses: string[];
    }>({ branches: [], products: [], statuses: [] });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(20);
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [expandedState, setExpandedState] = useState<{ requestKey: string; rows: Set<string> }>({ requestKey: "", rows: EMPTY_EXPANDED_ROWS });
    const [batchDetailsState, setBatchDetailsState] = useState<{
        requestKey: string;
        byLedger: Record<number, ProfitabilityBatchDetailsState>;
    }>({ requestKey: "", byLedger: EMPTY_BATCH_DETAILS });
    const detailControllers = useRef(new Map<number, AbortController>());
    const filtersForRequest = useMemo(() => ({
        branchId: filters.branchId,
        productId: filters.productId,
        status: filters.status,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: debouncedSearch
    }), [filters.branchId, filters.productId, filters.status, filters.dateFrom, filters.dateTo, debouncedSearch]);
    const requestKey = JSON.stringify({ filtersForRequest, page, pageSize, refreshKey });
    const detailRequestKey = JSON.stringify({ filtersForRequest, refreshKey });
    const expandedRows = expandedState.requestKey === requestKey ? expandedState.rows : EMPTY_EXPANDED_ROWS;
    const batchDetails = batchDetailsState.requestKey === detailRequestKey ? batchDetailsState.byLedger : EMPTY_BATCH_DETAILS;

    useEffect(() => {
        detailControllers.current.forEach((controller) => controller.abort());
        detailControllers.current.clear();
    }, [detailRequestKey]);

    useEffect(() => () => {
        detailControllers.current.forEach((controller) => controller.abort());
        detailControllers.current.clear();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void fetchProfitabilityFilterOptions(controller.signal)
            .then((options) => {
                if (!controller.signal.aborted) {
                    setFilterOptions((current) => ({ ...current, ...options }));
                }
            })
            .catch((cause) => {
                if (!controller.signal.aborted) setOptionsError(cause instanceof Error ? cause.message : "Unable to load filter options.");
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(filters.search.trim());
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [filters.search]);

    useEffect(() => {
        const controller = new AbortController();
        void fetchJobOrderProfitabilityReport(filtersForRequest, { page, pageSize }, controller.signal)
            .then((nextPayload) => {
                if (controller.signal.aborted) return;
                setPayload(nextPayload);
                if (nextPayload.page !== page) setPage(nextPayload.page);
            })
            .catch((cause) => {
                if (!controller.signal.aborted) {
                    setRequestError({
                        key: requestKey,
                        message: cause instanceof Error ? cause.message : "Unable to load the profitability report."
                    });
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadedRequestKey(requestKey);
            });
        return () => controller.abort();
    }, [filtersForRequest, page, pageSize, refreshKey, requestKey]);

    const updateFilter = useCallback(<K extends keyof JobOrderProfitabilityFilters>(key: K, value: JobOrderProfitabilityFilters[K]) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(INITIAL_FILTERS);
        setPage(1);
    }, []);

    const setPageSize = useCallback((value: number) => {
        setPageSizeState(value);
        setPage(1);
    }, []);

    const loadBatchDetails = useCallback((ledgerId: number, retry = false) => {
        if (!Number.isSafeInteger(ledgerId) || ledgerId <= 0) return;
        const existing = batchDetailsState.requestKey === detailRequestKey ? batchDetailsState.byLedger[ledgerId] : undefined;
        if (!retry && (existing?.status === "loaded" || existing?.status === "loading")) return;
        detailControllers.current.get(ledgerId)?.abort();
        const controller = new AbortController();
        detailControllers.current.set(ledgerId, controller);
        setBatchDetailsState((current) => ({
            requestKey: detailRequestKey,
            byLedger: { ...(current.requestKey === detailRequestKey ? current.byLedger : {}), [ledgerId]: { status: "loading" } }
        }));
        void fetchProfitabilityBatchDetails(ledgerId, controller.signal)
            .then((detail) => {
                if (!controller.signal.aborted) setBatchDetailsState((current) => ({
                    requestKey: detailRequestKey,
                    byLedger: { ...(current.requestKey === detailRequestKey ? current.byLedger : {}), [ledgerId]: { status: "loaded", detail } }
                }));
            })
            .catch((cause) => {
                if (!controller.signal.aborted) {
                    setBatchDetailsState((current) => ({
                        requestKey: detailRequestKey,
                        byLedger: {
                            ...(current.requestKey === detailRequestKey ? current.byLedger : {}),
                            [ledgerId]: { status: "error", error: cause instanceof Error ? cause.message : "Unable to load batch cost details." }
                        }
                    }));
                }
            })
            .finally(() => {
                if (detailControllers.current.get(ledgerId) === controller) detailControllers.current.delete(ledgerId);
            });
    }, [batchDetailsState, detailRequestKey]);

    const toggleExpanded = useCallback((key: string, ledgerId: number) => {
        const willExpand = !expandedRows.has(key);
        setExpandedState((current) => {
            const next = new Set<string>(current.requestKey === requestKey ? current.rows : []);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return { requestKey, rows: next };
        });
        if (willExpand) loadBatchDetails(ledgerId);
    }, [expandedRows, loadBatchDetails, requestKey]);

    const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

    return {
        filters,
        rows: payload.rows,
        branches: filterOptions.branches,
        products: filterOptions.products,
        statuses: filterOptions.statuses,
        summary: payload.summary,
        totalRows: payload.totalRows,
        page,
        pageSize,
        pageCount: payload.pageCount,
        loading: loadedRequestKey !== requestKey,
        refreshing: loadedRequestKey !== null && loadedRequestKey !== requestKey,
        error: requestError?.key === requestKey ? requestError.message : optionsError,
        expandedRows,
        batchDetails,
        updateFilter,
        resetFilters,
        setPage,
        setPageSize,
        toggleExpanded,
        loadBatchDetails,
        refresh
    };
}
