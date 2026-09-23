"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStandardVsActualCostReport, fetchStandardVsActualCostReportFilters } from "../services/report-api";
import type {
    StandardVsActualCostFilters,
    StandardVsActualCostReportPayload,
    StandardVsActualCostReportRequest
} from "../types";

const INITIAL_FILTERS: StandardVsActualCostFilters = {
    branchId: "all",
    productId: "all",
    status: "all",
    dateFrom: "",
    dateTo: "",
    jobOrder: ""
};

const EMPTY_SUMMARY = {
    comparableCount: 0,
    incompleteCount: 0,
    standard: 0,
    actual: 0,
    variance: 0
};

const EMPTY_PAYLOAD: StandardVsActualCostReportPayload = {
    rows: [],
    branches: [],
    products: [],
    page: 1,
    pageSize: 20,
    totalRows: 0,
    pageCount: 1,
    summary: EMPTY_SUMMARY
};

export function useStandardVsActualCostReport() {
    const [payload, setPayload] = useState(EMPTY_PAYLOAD);
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(20);
    const [debouncedJobOrder, setDebouncedJobOrder] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const shouldLoadOptionsRef = useRef(true);
    const { branchId, productId, status, dateFrom, dateTo } = filters;
    const requestKey = JSON.stringify({ branchId, productId, status, dateFrom, dateTo, jobOrder: debouncedJobOrder, page, pageSize, refreshKey });

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedJobOrder(filters.jobOrder), 300);
        return () => window.clearTimeout(timer);
    }, [filters.jobOrder]);

    useEffect(() => {
        const controller = new AbortController();
        const request: StandardVsActualCostReportRequest = {
            filters: { branchId, productId, status, dateFrom, dateTo, jobOrder: debouncedJobOrder },
            page,
            pageSize,
            includeOptions: false
        };
        const shouldLoadOptions = shouldLoadOptionsRef.current;

        void Promise.all([
            fetchStandardVsActualCostReport(request, controller.signal),
            shouldLoadOptions ? fetchStandardVsActualCostReportFilters(controller.signal) : Promise.resolve(null)
        ])
            .then(([nextPayload, nextOptions]) => {
                shouldLoadOptionsRef.current = false;
                setRequestError(null);
                setPayload((current) => ({
                    ...nextPayload,
                    branches: nextOptions?.branches.length ? nextOptions.branches : current.branches,
                    products: nextOptions?.products.length ? nextOptions.products : current.products
                }));
                if (nextPayload.page !== page) setPage(nextPayload.page);
            })
            .catch((cause) => {
                if (controller.signal.aborted) return;
                setRequestError({
                    key: requestKey,
                    message: cause instanceof Error ? cause.message : "Unable to load the cost report."
                });
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadedRequestKey(requestKey);
            });

        return () => controller.abort();
    }, [branchId, productId, status, dateFrom, dateTo, debouncedJobOrder, page, pageSize, refreshKey, requestKey]);

    const updateFilter = useCallback(<K extends keyof StandardVsActualCostFilters>(key: K, value: StandardVsActualCostFilters[K]) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    }, []);

    const updatePageSize = useCallback((nextPageSize: number) => {
        setPageSizeState(nextPageSize);
        setPage(1);
    }, []);

    const loadData = useCallback(() => {
        shouldLoadOptionsRef.current = true;
        setPage(1);
        setRefreshKey((current) => current + 1);
    }, []);

    const toggleExpanded = useCallback((jobOrderId: number) => {
        setExpandedRows((current) => {
            const next = new Set(current);
            if (next.has(jobOrderId)) next.delete(jobOrderId);
            else next.add(jobOrderId);
            return next;
        });
    }, []);

    const clearFilters = useCallback(() => {
        setFilters(INITIAL_FILTERS);
        setPage(1);
    }, []);

    return {
        filters,
        rows: payload.rows,
        paginatedRows: payload.rows,
        branches: payload.branches,
        products: payload.products,
        loading: loadedRequestKey !== requestKey,
        error: requestError?.key === requestKey ? requestError.message : null,
        totals: payload.summary,
        totalRows: payload.totalRows,
        page,
        pageSize,
        pageCount: payload.pageCount,
        setPage,
        setPageSize: updatePageSize,
        expandedRows,
        loadData,
        updateFilter,
        toggleExpanded,
        clearFilters
    };
}
