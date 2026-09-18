"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    ScrapReportRow,
    ScrapSummaryKPIs,
    ScrapFilters,
    ScrapMasterData,
    DefectCategorySummary,
    ScrapDetailBreakdown
} from "../types/scrap-rejection.types";
import { computeScrapSummaryKPIs } from "../services/scrap-rejection.helpers";
import { exportScrapCSV } from "../utils/exportScrapCSV";
import { exportScrapPDF } from "../utils/exportScrapPDF";

const initialFilters: ScrapFilters = {
    search: "",
    branchId: "all",
    productId: "all",
    defectCategory: "all",
    status: "all",
    dateFrom: "",
    dateTo: ""
};

const initialKPIs: ScrapSummaryKPIs = {
    total_jobs: 0,
    total_produced_units: 0,
    total_scrapped_units: 0,
    overall_scrap_rate: 0,
    total_material_loss_php: 0,
    total_rework_hours: 0,
    total_rework_labor_cost_php: 0,
    top_defect_category: "None",
    top_rejection_reason: "None"
};

const initialMasterData: ScrapMasterData = {
    branches: [],
    products: [],
    defectCategories: [],
    rejectionReasons: [],
    statuses: []
};

export function useScrapAndRejectionReport() {
    const [allRows, setAllRows] = useState<ScrapReportRow[]>([]);
    const [summaryKPIs, setSummaryKPIs] = useState<ScrapSummaryKPIs>(initialKPIs);
    const [defectCategories, setDefectCategories] = useState<DefectCategorySummary[]>([]);
    const [masterData, setMasterData] = useState<ScrapMasterData>(initialMasterData);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Filters & Pagination
    const [filters, setFilters] = useState<ScrapFilters>(initialFilters);
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(15);

    // Sorting
    const [sortField, setSortField] = useState<keyof ScrapReportRow>("material_loss_php");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

    // Drilldown modal state
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [breakdownData, setBreakdownData] = useState<ScrapDetailBreakdown | null>(null);
    const [isBreakdownLoading, setIsBreakdownLoading] = useState<boolean>(false);

    const loadData = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const res = await fetch("/api/bia/inventory/scrap-and-rejection-analysis-report", {
                cache: "no-store"
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(errData.error || `HTTP error ${res.status}`);
            }

            const data = await res.json();
            setAllRows(data.rows || []);
            setSummaryKPIs(data.summary || initialKPIs);
            setDefectCategories(data.defectCategories || []);
            setMasterData(data.masterData || initialMasterData);
        } catch (err: unknown) {
            setError((err as Error).message || "Failed to load Scrap & Rejection Analysis data.");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const setFilter = useCallback(<K extends keyof ScrapFilters>(key: K, value: ScrapFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
        setPage(1);
    }, []);

    // Filter rows
    const filteredRows = useMemo(() => {
        return allRows.filter(row => {
            // Search
            if (filters.search) {
                const q = filters.search.toLowerCase().trim();
                const matchJO = row.job_order_no.toLowerCase().includes(q);
                const matchProd = row.product_name.toLowerCase().includes(q) || row.product_code.toLowerCase().includes(q);
                const matchBranch = row.branch_name.toLowerCase().includes(q);
                const matchDefect = (row.top_rejection_reason || "").toLowerCase().includes(q) || (row.top_defect_category || "").toLowerCase().includes(q);
                if (!matchJO && !matchProd && !matchBranch && !matchDefect) return false;
            }

            // Branch
            if (filters.branchId !== "all") {
                if (String(row.branch_id) !== String(filters.branchId)) return false;
            }

            // Product
            if (filters.productId !== "all") {
                if (String(row.product_id) !== String(filters.productId)) return false;
            }

            // Defect Category
            if (filters.defectCategory !== "all") {
                if ((row.top_defect_category || "").toLowerCase() !== filters.defectCategory.toLowerCase()) return false;
            }

            // Status
            if (filters.status !== "all") {
                if (row.status.toLowerCase() !== filters.status.toLowerCase()) return false;
            }

            // Date Range
            if (filters.dateFrom) {
                if (!row.date || row.date < filters.dateFrom) return false;
            }
            if (filters.dateTo) {
                if (!row.date || row.date > filters.dateTo) return false;
            }

            return true;
        });
    }, [allRows, filters]);

    // Recalculate summary KPIs based on filtered rows
    const dynamicallyCalculatedSummary = useMemo(() => {
        return computeScrapSummaryKPIs(filteredRows, defectCategories);
    }, [filteredRows, defectCategories]);

    // Sorted rows
    const sortedRows = useMemo(() => {
        const copy = [...filteredRows];
        copy.sort((a, b) => {
            const valA = a[sortField];
            const valB = b[sortField];

            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            if (typeof valA === "number" && typeof valB === "number") {
                return sortDirection === "asc" ? valA - valB : valB - valA;
            }
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
        });
        return copy;
    }, [filteredRows, sortField, sortDirection]);

    // Paginated rows
    const paginatedRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, page, pageSize]);

    const handleSort = useCallback((field: keyof ScrapReportRow) => {
        setSortField(prev => {
            if (prev === field) {
                setSortDirection(d => (d === "asc" ? "desc" : "asc"));
                return field;
            }
            setSortDirection("desc");
            return field;
        });
    }, []);

    // Drilldown modal open
    const openBreakdown = useCallback(async (jobOrderId: number) => {
        setSelectedJobId(jobOrderId);
        setIsBreakdownLoading(true);
        setBreakdownData(null);
        try {
            const res = await fetch(`/api/bia/inventory/scrap-and-rejection-analysis-report?jobOrderId=${jobOrderId}`);
            if (res.ok) {
                const json = await res.json();
                setBreakdownData(json.data || null);
            }
        } catch (err) {
            console.error("Failed to load scrap drilldown:", err);
        } finally {
            setIsBreakdownLoading(false);
        }
    }, []);

    const closeBreakdown = useCallback(() => {
        setSelectedJobId(null);
        setBreakdownData(null);
    }, []);

    const handleExportCsv = useCallback(() => {
        exportScrapCSV(filteredRows, dynamicallyCalculatedSummary, defectCategories);
    }, [filteredRows, dynamicallyCalculatedSummary, defectCategories]);

    const handleExportPdf = useCallback(() => {
        let desc = "";
        if (filters.branchId !== "all") desc += `Branch: ${filters.branchId}; `;
        if (filters.defectCategory !== "all") desc += `Category: ${filters.defectCategory}; `;
        if (filters.search) desc += `Search: "${filters.search}"; `;
        exportScrapPDF(sortedRows, dynamicallyCalculatedSummary, defectCategories, desc.trim() || undefined);
    }, [sortedRows, dynamicallyCalculatedSummary, defectCategories, filters]);

    return {
        allRows,
        filteredRows,
        paginatedRows,
        summaryKPIs: dynamicallyCalculatedSummary,
        defectCategories,
        masterData,
        isLoading,
        isRefreshing,
        error,
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
        refresh: () => loadData(true),
        exportCsv: handleExportCsv,
        exportPdf: handleExportPdf
    };
}
