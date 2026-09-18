"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    FPYReportRow,
    FPYSummaryKPIs,
    FPYFilters,
    FPYMasterData,
    FPYDetailBreakdown
} from "../types/fpy.types";
import { exportFpyCSV } from "../utils/exportFpyCSV";
import { exportFpyPDF } from "../utils/exportFpyPDF";

const initialFilters: FPYFilters = {
    search: "",
    branchId: "all",
    productId: "all",
    qualityTier: "all",
    dateFrom: "",
    dateTo: "",
    status: "For QA and Reconciliation"
};

const initialSummary: FPYSummaryKPIs = {
    total_jobs: 0,
    total_inspected_units: 0,
    total_passed_first_time: 0,
    total_reworked_units: 0,
    total_scrapped_units: 0,
    overall_fpy_percentage: 0,
    overall_rework_rate: 0,
    overall_scrap_rate: 0,
    excellent_jobs_count: 0,
    acceptable_jobs_count: 0,
    needs_attention_jobs_count: 0,
    top_defect_reason: "None Recorded"
};

const initialMasterData: FPYMasterData = {
    branches: [],
    products: [],
    rejectionReasons: [],
    statuses: []
};

export function useFirstPassYieldReport() {
    const [rawRows, setRawRows] = useState<FPYReportRow[]>([]);
    const [masterData, setMasterData] = useState<FPYMasterData>(initialMasterData);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filter and pagination state
    const [filters, setFilters] = useState<FPYFilters>(initialFilters);
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(15);
    const [sortField, setSortField] = useState<string>("date");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

    // Drilldown modal state
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [breakdownData, setBreakdownData] = useState<FPYDetailBreakdown | null>(null);
    const [isBreakdownLoading, setIsBreakdownLoading] = useState<boolean>(false);

    // Fetch report data
    const fetchReport = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const res = await fetch("/api/bia/inventory/first-pass-yield-report", {
                cache: "no-store"
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || `Failed to fetch data (Status ${res.status})`);
            }
            const data = await res.json();
            const fetchedRows = data.rows || [];
            setRawRows(fetchedRows);

            if (data.masterData) {
                setMasterData(data.masterData);
                // Synchronize default status filter with actual casing in master data if present
                const matchingStatus = (data.masterData.statuses || []).find(
                    (st: string) => st.toLowerCase().trim() === "for qa and reconciliation"
                );
                if (matchingStatus) {
                    setFilters(prev => {
                        if (prev.status.toLowerCase().trim() === "for qa and reconciliation") {
                            return { ...prev, status: matchingStatus };
                        }
                        return prev;
                    });
                }
            }
            setLastUpdated(new Date());
        } catch (err: unknown) {
            console.error("[useFirstPassYieldReport] Fetch error:", err);
            setError(err instanceof Error ? err.message : "An unexpected error occurred while loading FPY report data.");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    // Apply Client-Side Filters
    const filteredRows = useMemo(() => {
        return rawRows.filter(row => {
            // Search filter (JO number, product name, product code)
            if (filters.search) {
                const q = filters.search.toLowerCase().trim();
                const matchJO = row.job_order_no.toLowerCase().includes(q);
                const matchProdName = row.product_name.toLowerCase().includes(q);
                const matchProdCode = row.product_code.toLowerCase().includes(q);
                const matchBranch = row.branch_name.toLowerCase().includes(q);
                if (!matchJO && !matchProdName && !matchProdCode && !matchBranch) return false;
            }

            // Branch filter
            if (filters.branchId !== "all" && String(row.branch_id) !== String(filters.branchId)) {
                return false;
            }

            // Product filter
            if (filters.productId !== "all" && String(row.product_id) !== String(filters.productId)) {
                return false;
            }

            // Quality Tier filter
            if (filters.qualityTier !== "all") {
                if (filters.qualityTier === "excellent" && row.quality_tier !== "Excellent") return false;
                if (filters.qualityTier === "acceptable" && row.quality_tier !== "Acceptable") return false;
                if (filters.qualityTier === "needs_attention" && row.quality_tier !== "Needs Attention") return false;
            }

            // Status filter (case-insensitive & trimmed)
            if (filters.status !== "all") {
                const filterStatus = filters.status.toLowerCase().trim();
                const rowStatus = (row.status || "").toLowerCase().trim();
                if (rowStatus !== filterStatus) return false;
            }

            // Date range filter (start_date, production_completed_at, or date)
            const targetDateStr = row.date || row.start_date || row.production_completed_at;
            if (filters.dateFrom && targetDateStr) {
                if (new Date(targetDateStr) < new Date(filters.dateFrom)) return false;
            }
            if (filters.dateTo && targetDateStr) {
                const toDate = new Date(filters.dateTo);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(targetDateStr) > toDate) return false;
            }

            return true;
        });
    }, [rawRows, filters]);

    // Dynamic Summary KPIs computed from filtered data
    const summaryKPIs = useMemo<FPYSummaryKPIs>(() => {
        if (filteredRows.length === 0) return initialSummary;

        const total_jobs = filteredRows.length;
        const total_inspected_units = Math.round(filteredRows.reduce((sum, r) => sum + r.inspected_quantity, 0) * 100) / 100;
        const total_passed_first_time = Math.round(filteredRows.reduce((sum, r) => sum + r.passed_quantity, 0) * 100) / 100;
        const total_reworked_units = Math.round(filteredRows.reduce((sum, r) => sum + r.rework_quantity, 0) * 100) / 100;
        const total_scrapped_units = Math.round(filteredRows.reduce((sum, r) => sum + r.scrap_quantity, 0) * 100) / 100;

        const overall_fpy_percentage = total_inspected_units > 0
            ? Math.round((total_passed_first_time / total_inspected_units) * 1000) / 10
            : 0;

        const overall_rework_rate = total_inspected_units > 0
            ? (total_reworked_units / total_inspected_units) * 100
            : 0;

        const overall_scrap_rate = total_inspected_units > 0
            ? (total_scrapped_units / total_inspected_units) * 100
            : 0;

        const excellent_jobs_count = filteredRows.filter(r => r.quality_tier === "Excellent").length;
        const acceptable_jobs_count = filteredRows.filter(r => r.quality_tier === "Acceptable").length;
        const needs_attention_jobs_count = filteredRows.filter(r => r.quality_tier === "Needs Attention").length;

        // Top defect reason across filtered rows
        const defectCounts: Record<string, number> = {};
        filteredRows.forEach(r => {
            if (r.top_rejection_reason) {
                defectCounts[r.top_rejection_reason] = (defectCounts[r.top_rejection_reason] || 0) + (r.rework_quantity + r.scrap_quantity);
            }
        });

        let top_defect_reason = "None Recorded";
        let maxCount = 0;
        Object.entries(defectCounts).forEach(([reason, count]) => {
            if (count > maxCount) {
                maxCount = count;
                top_defect_reason = `${reason} (${Math.round(count)} units)`;
            }
        });

        return {
            total_jobs,
            total_inspected_units,
            total_passed_first_time,
            total_reworked_units,
            total_scrapped_units,
            overall_fpy_percentage,
            overall_rework_rate,
            overall_scrap_rate,
            excellent_jobs_count,
            acceptable_jobs_count,
            needs_attention_jobs_count,
            top_defect_reason
        };
    }, [filteredRows]);

    // Sorting
    const sortedRows = useMemo(() => {
        const sorted = [...filteredRows];
        sorted.sort((a, b) => {
            if (sortField === "date") {
                const dateA = a.date ? new Date(a.date).getTime() : 0;
                const dateB = b.date ? new Date(b.date).getTime() : 0;
                if (dateB !== dateA) return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
                return sortDirection === "asc" ? a.job_order_id - b.job_order_id : b.job_order_id - a.job_order_id;
            }

            const aRecord = a as unknown as Record<string, unknown>;
            const bRecord = b as unknown as Record<string, unknown>;
            const aVal = aRecord[sortField];
            const bVal = bRecord[sortField];

            if (typeof aVal === "string" || typeof bVal === "string") {
                const strA = String(aVal ?? "").toLowerCase();
                const strB = String(bVal ?? "").toLowerCase();
                return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
            }

            const numA = Number(aVal || 0);
            const numB = Number(bVal || 0);
            return sortDirection === "asc" ? numA - numB : numB - numA;
        });
        return sorted;
    }, [filteredRows, sortField, sortDirection]);

    // Pagination
    const paginatedRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, page, pageSize]);

    // Filter handlers
    const setFilter = useCallback(<K extends keyof FPYFilters>(key: K, value: FPYFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
        setPage(1);
    }, []);

    const handleSort = useCallback((field: string) => {
        if (sortField === field) {
            setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    }, [sortField]);

    // Drilldown detail modal
    const openBreakdown = useCallback(async (jobOrderId: number) => {
        setSelectedJobId(jobOrderId);
        setIsBreakdownLoading(true);
        setBreakdownData(null);

        try {
            const res = await fetch(`/api/bia/inventory/first-pass-yield-report?jobOrderId=${jobOrderId}`);
            if (!res.ok) {
                throw new Error("Failed to load detailed inspection history");
            }
            const data = await res.json();
            setBreakdownData(data.data || null);
        } catch (err) {
            console.error("[useFirstPassYieldReport] Breakdown fetch error:", err);
        } finally {
            setIsBreakdownLoading(false);
        }
    }, []);

    const closeBreakdown = useCallback(() => {
        setSelectedJobId(null);
        setBreakdownData(null);
    }, []);

    // Export helpers
    const exportCsv = useCallback(() => {
        const activeFiltersDesc = [
            filters.branchId !== "all" ? `Branch: ${filters.branchId}` : null,
            filters.productId !== "all" ? `Product: ${filters.productId}` : null,
            filters.qualityTier !== "all" ? `Quality Tier: ${filters.qualityTier}` : null,
            filters.status !== "all" ? `Status: ${filters.status}` : null,
            filters.dateFrom ? `From: ${filters.dateFrom}` : null,
            filters.dateTo ? `To: ${filters.dateTo}` : null
        ].filter(Boolean).join(" | ");

        exportFpyCSV(filteredRows, summaryKPIs, activeFiltersDesc);
    }, [filteredRows, summaryKPIs, filters]);

    const exportPdf = useCallback(() => {
        const activeFiltersDesc = [
            filters.branchId !== "all" ? `Branch: ${filters.branchId}` : null,
            filters.productId !== "all" ? `Product: ${filters.productId}` : null,
            filters.qualityTier !== "all" ? `Quality Tier: ${filters.qualityTier}` : null,
            filters.status !== "all" ? `Status: ${filters.status}` : null,
            filters.dateFrom ? `From: ${filters.dateFrom}` : null,
            filters.dateTo ? `To: ${filters.dateTo}` : null
        ].filter(Boolean).join(" | ");

        exportFpyPDF(filteredRows, summaryKPIs, activeFiltersDesc);
    }, [filteredRows, summaryKPIs, filters]);

    return {
        rawRows,
        filteredRows,
        paginatedRows,
        summaryKPIs,
        masterData,
        isLoading,
        isRefreshing,
        error,
        lastUpdated,
        filters,
        page,
        pageSize,
        sortField,
        sortDirection,
        selectedJobId,
        breakdownData,
        isBreakdownLoading,
        setFilter,
        resetFilters,
        setPage,
        setPageSize,
        handleSort,
        openBreakdown,
        closeBreakdown,
        refresh: () => fetchReport(true),
        exportCsv,
        exportPdf
    };
}
