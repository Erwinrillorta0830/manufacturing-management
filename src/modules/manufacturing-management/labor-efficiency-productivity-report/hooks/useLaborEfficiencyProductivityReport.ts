"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadLaborEfficiencyReport, fetchLaborEfficiencyReport, fetchLaborEfficiencyReportFilters } from "../services/report-api";
import type {
    LaborEfficiencyFilters,
    LaborEfficiencyExportFormat,
    LaborEfficiencyOption,
    LaborEfficiencyReportPayload,
    LaborEfficiencyReportRequest,
    LaborEfficiencySortKey
} from "../types";

const INITIAL_FILTERS: LaborEfficiencyFilters = {
    branchId: "all",
    productId: "all",
    status: "all",
    dateFrom: "",
    dateTo: "",
    jobOrder: ""
};

const EMPTY_SUMMARY: LaborEfficiencyReportPayload["summary"] = {
    comparableCount: 0,
    incompleteCount: 0,
    standardHours: 0,
    actualHours: 0,
    varianceHours: 0,
    efficiencyPercent: null,
    productivityByUom: []
};

const EMPTY_OPTIONS: { branches: LaborEfficiencyOption[]; products: LaborEfficiencyOption[] } = { branches: [], products: [] };

export function useLaborEfficiencyProductivityReport() {
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [options, setOptions] = useState(EMPTY_OPTIONS);
    const [rows, setRows] = useState<LaborEfficiencyReportPayload["rows"]>([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [totalRows, setTotalRows] = useState(0);
    const [pageCount, setPageCount] = useState(1);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(20);
    const [sortKey, setSortKey] = useState<LaborEfficiencySortKey>("jobOrderNo");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [debouncedJobOrder, setDebouncedJobOrder] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const hasLoaded = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        void fetchLaborEfficiencyReportFilters(controller.signal)
            .then((data) => setOptions(data))
            .catch((cause) => {
                if (!controller.signal.aborted) setOptionsError(cause instanceof Error ? cause.message : "Unable to load report filters.");
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedJobOrder(filters.jobOrder.trim());
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [filters.jobOrder]);

    const { branchId, productId, status, dateFrom, dateTo } = filters;
    const requestFilters = useMemo<LaborEfficiencyFilters>(() => ({
        branchId,
        productId,
        status,
        dateFrom,
        dateTo,
        jobOrder: debouncedJobOrder
    }), [branchId, productId, status, dateFrom, dateTo, debouncedJobOrder]);

    useEffect(() => {
        const controller = new AbortController();
        if (hasLoaded.current) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const request: LaborEfficiencyReportRequest = {
            filters: requestFilters,
            page,
            pageSize,
            sortKey,
            sortDirection
        };
        void fetchLaborEfficiencyReport(request, controller.signal)
            .then((payload) => {
                if (controller.signal.aborted) return;
                setRows(payload.rows);
                setSummary(payload.summary);
                setTotalRows(payload.totalRows);
                setPageCount(payload.pageCount);
                setPage(payload.page);
                hasLoaded.current = true;
            })
            .catch((cause) => {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the labor efficiency report.");
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setRefreshing(false);
                }
            });
        return () => controller.abort();
    }, [page, pageSize, refreshKey, requestFilters, sortDirection, sortKey]);

    const setFilter = useCallback(<K extends keyof LaborEfficiencyFilters>(key: K, value: LaborEfficiencyFilters[K]) => {
        setFilters((current) => ({ ...current, [key]: value }));
        if (key !== "jobOrder") setPage(1);
    }, []);

    const clearFilters = useCallback(() => {
        setFilters(INITIAL_FILTERS);
        setPage(1);
    }, []);

    const updatePageSize = useCallback((value: number) => {
        setPageSizeState(value);
        setPage(1);
    }, []);

    const toggleSort = useCallback((key: LaborEfficiencySortKey) => {
        if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
        else {
            setSortKey(key);
            setSortDirection("asc");
        }
    }, [sortKey]);

    const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

    const exportReport = useCallback(async (format: LaborEfficiencyExportFormat) => {
        setExporting(true);
        try {
            return await downloadLaborEfficiencyReport(
                { ...filters, jobOrder: filters.jobOrder.trim() },
                format,
                sortKey,
                sortDirection
            );
        } finally {
            setExporting(false);
        }
    }, [filters, sortDirection, sortKey]);

    return {
        filters,
        rows,
        summary,
        totalRows,
        pageCount,
        page,
        pageSize,
        sortKey,
        sortDirection,
        branches: options.branches,
        products: options.products,
        loading,
        refreshing,
        exporting,
        error: error || optionsError,
        setFilter,
        clearFilters,
        setPage,
        setPageSize: updatePageSize,
        toggleSort,
        refresh,
        exportReport
    };
}
