"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ProductionOutputVarianceFilterOptions,
    ProductionOutputVarianceFilters,
    ProductionOutputVarianceRequest,
    ProductionOutputVarianceRow,
    ProductionOutputVarianceSortKey,
    ProductionOutputVarianceSummary
} from "../types";
import {
    fetchAllProductionOutputVarianceRows,
    fetchProductionOutputVarianceFilterOptions,
    fetchProductionOutputVarianceReport
} from "../services/production-output-variance-api";

const initialFilters: ProductionOutputVarianceFilters = {
    search: "",
    branchId: "all",
    productId: "all",
    status: "all",
    dateFrom: "",
    dateTo: ""
};

const emptySummary: ProductionOutputVarianceSummary = { jobCount: 0, quantitiesByUom: [] };
const emptyOptions: ProductionOutputVarianceFilterOptions = { branches: [], products: [], statuses: [] };

export function useProductionOutputVarianceReport() {
    const [rows, setRows] = useState<ProductionOutputVarianceRow[]>([]);
    const [summary, setSummary] = useState(emptySummary);
    const [totalCount, setTotalCount] = useState(0);
    const [filters, setFilters] = useState(initialFilters);
    const [filterOptions, setFilterOptions] = useState(emptyOptions);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [sortKey, setSortKey] = useState<ProductionOutputVarianceSortKey>("plannedCompletionDate");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [refreshVersion, setRefreshVersion] = useState(0);
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const hasLoaded = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        void fetchProductionOutputVarianceFilterOptions(controller.signal)
            .then(setFilterOptions)
            .catch((cause) => {
                if (!controller.signal.aborted) {
                    setOptionsError(cause instanceof Error ? cause.message : "Unable to load report filter options.");
                }
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearch(filters.search.trim());
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [filters.search]);

    const requestFilters = useMemo<ProductionOutputVarianceFilters>(() => ({
        search: debouncedSearch,
        branchId: filters.branchId,
        productId: filters.productId,
        status: filters.status,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo
    }), [filters.branchId, filters.dateFrom, filters.dateTo, filters.productId, filters.status, debouncedSearch]);

    useEffect(() => {
        const controller = new AbortController();
        if (hasLoaded.current) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const request: ProductionOutputVarianceRequest = {
            filters: requestFilters,
            page,
            pageSize,
            sortKey,
            sortDirection
        };
        void fetchProductionOutputVarianceReport(request, controller.signal)
            .then((payload) => {
                if (controller.signal.aborted) return;
                setRows(payload.rows);
                setSummary(payload.summary);
                setTotalCount(payload.totalCount);
                setPage(payload.page);
                hasLoaded.current = true;
            })
            .catch((cause) => {
                if (!controller.signal.aborted) {
                    setError(cause instanceof Error ? cause.message : "Unable to load the production output report.");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setRefreshing(false);
                }
            });
        return () => controller.abort();
    }, [page, pageSize, refreshVersion, requestFilters, sortDirection, sortKey]);

    const setFilter = useCallback(<K extends keyof ProductionOutputVarianceFilters>(key: K, value: ProductionOutputVarianceFilters[K]) => {
        setFilters((previous) => ({ ...previous, [key]: value }));
        if (key !== "search") setPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
        setPage(1);
    }, []);

    const toggleSort = useCallback((key: ProductionOutputVarianceSortKey) => {
        if (sortKey === key) {
            setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
            return;
        }
        setSortKey(key);
        setSortDirection("asc");
    }, [sortKey]);

    const exportAllRows = useCallback(async () => {
        setExporting(true);
        try {
            const request: ProductionOutputVarianceRequest = {
                filters: { ...filters, search: filters.search.trim() },
                page,
                pageSize,
                sortKey,
                sortDirection
            };
            return await fetchAllProductionOutputVarianceRows(request);
        } finally {
            setExporting(false);
        }
    }, [filters, page, pageSize, sortDirection, sortKey]);

    const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
        rows,
        summary,
        totalCount,
        filters,
        branches: filterOptions.branches,
        products: filterOptions.products,
        statuses: filterOptions.statuses,
        loading,
        refreshing,
        exporting,
        error: error || optionsError,
        page,
        pageSize,
        pageCount,
        sortKey,
        sortDirection,
        setFilter,
        resetFilters,
        setPage,
        setPageSize,
        toggleSort,
        refresh: () => setRefreshVersion((version) => version + 1),
        exportAllRows
    };
}
