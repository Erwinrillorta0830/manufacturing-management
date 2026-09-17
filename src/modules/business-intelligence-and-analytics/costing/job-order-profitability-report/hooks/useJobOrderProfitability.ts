"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    JobOrderProfitabilityRow,
    ProfitabilityFilters,
    MasterLookupData,
    JobOrderCostBreakdown
} from "../types";
import { JobOrderProfitabilityService } from "../services/job-order-profitability.service";
import { exportProfitabilityPDF } from "../utils/exportProfitabilityPDF";

const initialFilters: ProfitabilityFilters = {
    search: "",
    status: "all",
    marginStatus: "all",
    startDate: "",
    endDate: "",
    branchId: "all"
};

export function useJobOrderProfitability() {
    const [allRows, setAllRows] = useState<JobOrderProfitabilityRow[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filters & Pagination
    const [filters, setFilters] = useState<ProfitabilityFilters>(initialFilters);
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(15);

    // Sorting
    const [sortField, setSortField] = useState<keyof JobOrderProfitabilityRow>("job_order_id");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

    // Modal / Drilldown
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [breakdownData, setBreakdownData] = useState<JobOrderCostBreakdown | null>(null);
    const [isBreakdownLoading, setIsBreakdownLoading] = useState<boolean>(false);

    // Master lookup data
    const [masterData, setMasterData] = useState<MasterLookupData>({
        statuses: [],
        branches: []
    });

    const loadData = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const res = await JobOrderProfitabilityService.fetchProfitabilityReport();
            setAllRows(res.rows);
            setLastUpdated(new Date());

            // Extract unique statuses
            const uniqueStatuses = Array.from(new Set(res.rows.map(r => r.status))).filter(Boolean);
            setMasterData({
                statuses: uniqueStatuses,
                branches: [{ id: 1, name: "Main Plant (Branch 1)" }]
            });
        } catch (err: unknown) {
            setError((err as Error).message || "Failed to load Job Order Profitability data.");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handle filter changes
    const setFilter = useCallback(<K extends keyof ProfitabilityFilters>(key: K, value: ProfitabilityFilters[K]) => {
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
            // Search query
            if (filters.search) {
                const q = filters.search.toLowerCase().trim();
                const matchJO = row.job_order_no.toLowerCase().includes(q);
                const matchProd = row.product_name.toLowerCase().includes(q) || row.product_code.toLowerCase().includes(q);
                const matchSO = row.sales_order_no ? row.sales_order_no.toLowerCase().includes(q) : false;
                const matchCust = row.customer_code ? row.customer_code.toLowerCase().includes(q) : false;
                if (!matchJO && !matchProd && !matchSO && !matchCust) return false;
            }

            // Status filter
            if (filters.status && filters.status !== "all") {
                if (row.status.toLowerCase() !== filters.status.toLowerCase()) return false;
            }

            // Margin Status filter
            if (filters.marginStatus && filters.marginStatus !== "all") {
                if (row.margin_status !== filters.marginStatus) return false;
            }

            // Date Range
            if (filters.startDate) {
                if (!row.start_date || row.start_date < filters.startDate) return false;
            }
            if (filters.endDate) {
                if (!row.start_date || row.start_date > filters.endDate) return false;
            }

            return true;
        });
    }, [allRows, filters]);

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

    // Recalculate summary KPIs based on filtered rows
    const summaryKPIs = useMemo(() => {
        return JobOrderProfitabilityService.computeSummary(filteredRows);
    }, [filteredRows]);

    // Sorting handler
    const handleSort = useCallback((field: keyof JobOrderProfitabilityRow) => {
        setSortField(prevField => {
            if (prevField === field) {
                setSortDirection(prevDir => (prevDir === "asc" ? "desc" : "asc"));
                return field;
            }
            setSortDirection("desc");
            return field;
        });
    }, []);

    // Open drilldown modal
    const openBreakdown = useCallback(async (jobOrderId: number) => {
        setSelectedJobId(jobOrderId);
        setIsBreakdownLoading(true);
        setBreakdownData(null);
        try {
            const data = await JobOrderProfitabilityService.fetchJobOrderCostBreakdown(jobOrderId);
            setBreakdownData(data);
        } catch (err) {
            console.error("Failed to load breakdown:", err);
        } finally {
            setIsBreakdownLoading(false);
        }
    }, []);

    const closeBreakdown = useCallback(() => {
        setSelectedJobId(null);
        setBreakdownData(null);
    }, []);

    // Export CSV
    const exportCsv = useCallback(() => {
        if (filteredRows.length === 0) return;

        const headers = [
            "Job Order No",
            "Product Code",
            "Product Name",
            "Status",
            "Target Qty",
            "Produced Qty",
            "Consumed Qty",
            "Yield Efficiency (%)",
            "Sales Order No",
            "Customer Code",
            "Selling Unit Price (PHP)",
            "Total Revenue (PHP)",
            "Direct Materials Cost (PHP)",
            "Direct Labor Cost (PHP)",
            "Workstation Overhead (PHP)",
            "Total Manufacturing COGS (PHP)",
            "Unit COGS (PHP)",
            "Gross Profit (PHP)",
            "Gross Margin (%)",
            "Margin Health"
        ];

        const rows = filteredRows.map(r => [
            `"${r.job_order_no}"`,
            `"${r.product_code}"`,
            `"${r.product_name.replace(/"/g, '""')}"`,
            `"${r.status}"`,
            r.target_quantity,
            r.actual_quantity_produced,
            r.total_quantity_consumed,
            r.yield_efficiency_percent.toFixed(1),
            `"${r.sales_order_no || "N/A"}"`,
            `"${r.customer_code || "N/A"}"`,
            r.sales_unit_price.toFixed(2),
            r.total_revenue.toFixed(2),
            r.direct_materials_cost.toFixed(2),
            r.direct_labor_cost.toFixed(2),
            r.overhead_cost.toFixed(2),
            r.total_cogs.toFixed(2),
            r.unit_cogs.toFixed(2),
            r.gross_profit.toFixed(2),
            r.gross_margin_percent.toFixed(1),
            `"${r.margin_status}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `job_order_profitability_${new Date().toISOString().split("T")[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [filteredRows]);

    // Export PDF
    const exportPdf = useCallback(() => {
        let desc = "";
        if (filters.status !== "all") desc += `Status: ${filters.status}; `;
        if (filters.marginStatus !== "all") desc += `Margin: ${filters.marginStatus}; `;
        if (filters.search) desc += `Search: "${filters.search}"; `;
        exportProfitabilityPDF(sortedRows, summaryKPIs, desc.trim() || undefined);
    }, [sortedRows, summaryKPIs, filters]);

    return {
        allRows,
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
        refresh: () => loadData(true),
        exportCsv,
        exportPdf
    };
}
