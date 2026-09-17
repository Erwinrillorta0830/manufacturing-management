"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { 
    WipJobOrder, 
    WipSummaryMetrics, 
    WorkCenterQueueSummary, 
    WipMasterData, 
    WipFilterState 
} from "../types";
import { fetchWipTrackingData } from "../services/wip-tracking-api";

const initialFilters: WipFilterState = {
    search: "",
    status: "ALL_ACTIVE",
    workCenterId: null,
    productId: null,
    branchId: null,
    delayedOnly: false
};

export function useWipTracking() {
    const [jobs, setJobs] = useState<WipJobOrder[]>([]);
    const [summary, setSummary] = useState<WipSummaryMetrics | null>(null);
    const [workCenterQueues, setWorkCenterQueues] = useState<WorkCenterQueueSummary[]>([]);
    const [masterData, setMasterData] = useState<WipMasterData>({
        workCenters: [],
        products: [],
        branches: []
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [filters, setFilters] = useState<WipFilterState>(initialFilters);
    const [viewMode, setViewMode] = useState<"table" | "board">("table");

    // Unified Modal State
    const [selectedJobForDetail, setSelectedJobForDetail] = useState<WipJobOrder | null>(null);
    const [activeDetailTab, setActiveDetailTab] = useState<"stages" | "materials">("stages");

    const openDetailModal = useCallback((job: WipJobOrder, tab: "stages" | "materials" = "stages") => {
        setSelectedJobForDetail(job);
        setActiveDetailTab(tab);
    }, []);

    const closeDetailModal = useCallback(() => {
        setSelectedJobForDetail(null);
    }, []);

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [, startTransition] = useTransition();

    const loadData = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const resp = await fetchWipTrackingData(filters);
            if (resp.success && resp.data) {
                startTransition(() => {
                    setJobs(resp.data.jobs || []);
                    setSummary(resp.data.summary || null);
                    setWorkCenterQueues(resp.data.workCenterQueues || []);
                    if (resp.data.masterData) {
                        setMasterData(resp.data.masterData);
                    }
                    setLastUpdated(new Date().toLocaleTimeString());
                });

                if (isManualRefresh) {
                    toast.success("WIP Tracking data refreshed.");
                }
            } else {
                const msg = resp.message || "Unable to retrieve WIP report data.";
                setError(msg);
                toast.error(msg);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to connect to WIP Tracking service.";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [filters]);

    // Fetch on filters change
    useEffect(() => {
        loadData();
    }, [loadData]);

    const setFilter = useCallback(<K extends keyof WipFilterState>(key: K, value: WipFilterState[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1); // Reset page on filter change
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
        setPage(1);
        toast.info("Filters reset to default.");
    }, []);

    const handlePageSizeChange = useCallback((newSize: number) => {
        setPageSize(newSize);
        setPage(1);
    }, []);

    // Excel Spreadsheet (.xlsx) Export with Custom Auto-Fit Column Widths & Merges
    const exportExcel = useCallback(() => {
        if (!jobs || jobs.length === 0) {
            toast.error("No data available to export.");
            return;
        }

        try {
            const headers = [
                "Job Order No",
                "Product Name",
                "Product Code",
                "Status",
                "Priority",
                "Branch",
                "Primary Work Center",
                "Target Qty",
                "Produced Qty",
                "UOM",
                "Output Progress %",
                "Current Stage",
                "Stage Work Center",
                "Stage Progress %",
                "Completed Stages",
                "Total Stages",
                "Total Planned Hours",
                "Total Actual Hours",
                "Elapsed Hours",
                "Schedule Status",
                "Remaining WIP Materials Qty",
                "Floor Materials Count",
                "Start Date",
                "Due Date"
            ];

            const defaultMinWidths = [
                28, // Job Order No (e.g. JO-E2E-PW-20260826-HAPPY)
                36, // Product Name (e.g. Happy Chocolate Spread 250g Container)
                20, // Product Code (e.g. FG-HCS-250G)
                18, // Status (e.g. IN_PROGRESS)
                12, // Priority
                24, // Branch
                28, // Primary Work Center
                16, // Target Qty
                16, // Produced Qty
                12, // UOM
                20, // Output Progress %
                30, // Current Stage
                28, // Stage Work Center
                20, // Stage Progress %
                18, // Completed Stages
                16, // Total Stages
                22, // Total Planned Hours
                22, // Total Actual Hours
                16, // Elapsed Hours
                18, // Schedule Status (Delayed / On Track)
                30, // Remaining WIP Materials Qty
                24, // Floor Materials Count
                16, // Start Date
                16  // Due Date
            ];

            const tableRows = jobs.map((j) => [
                j.job_order_no || "",
                j.product_name || "",
                j.product_code || "",
                j.status || "",
                j.priority ?? 0,
                j.branch_name || "",
                j.primary_work_center_name || "",
                j.target_quantity ?? 0,
                j.actual_quantity_produced ?? 0,
                j.uom_name || "",
                `${j.quantity_progress_percent ?? 0}%`,
                j.current_stage?.operation_name || "",
                j.current_stage?.work_center_name || j.primary_work_center_name || "",
                `${j.stage_progress_percent ?? 0}%`,
                j.completed_stages_count ?? 0,
                j.total_stages ?? 0,
                j.total_planned_hours ?? 0,
                j.total_actual_hours ?? 0,
                j.elapsed_hours ?? 0,
                j.is_delayed ? "Delayed" : "On Track",
                j.total_wip_remaining_quantity ?? 0,
                j.total_wip_materials_count ?? 0,
                j.start_date || "",
                j.end_date || ""
            ]);

            // Calculate auto-fit column widths using header and data rows
            const colWidths = headers.map((header, colIdx) => {
                let maxLen = header.length;
                tableRows.forEach((row) => {
                    const cellVal = row[colIdx];
                    const str = cellVal != null ? String(cellVal) : "";
                    if (str.length > maxLen) {
                        maxLen = str.length;
                    }
                });
                const minW = defaultMinWidths[colIdx] || 16;
                return { wch: Math.max(maxLen + 5, minW) };
            });

            const metaRows = [
                [`Work-in-Progress (WIP) Tracking Report`],
                [`Generated At: ${new Date().toLocaleString()}`],
                [`Total Active Job Orders: ${jobs.length}`],
                [] // blank row before table header
            ];

            const aoa = [...metaRows, headers, ...tableRows];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(aoa);

            // Pass explicit column widths to Excel worksheet
            ws["!cols"] = colWidths;

            // Merge metadata title across columns A through F so Column A's width is not distorted
            ws["!merges"] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
                { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }
            ];

            XLSX.utils.book_append_sheet(wb, ws, "WIP Tracking");

            const dateStr = new Date().toISOString().split("T")[0];
            const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
            const blob = new Blob([wbout], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            });
            saveAs(blob, `wip_tracking_report_${dateStr}.xlsx`);

            toast.success("WIP Tracking report (.xlsx) exported successfully with auto-fit column widths.");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error("Failed to generate Excel export: " + msg);
        }
    }, [jobs]);

    // Clean RFC-4180 CSV Export (Starts directly with headers on Row 1)
    const exportCsv = useCallback(() => {
        if (!jobs || jobs.length === 0) {
            toast.error("No data available to export.");
            return;
        }

        try {
            const headers = [
                "Job Order No",
                "Product Name",
                "Product Code",
                "Status",
                "Priority",
                "Branch",
                "Primary Work Center",
                "Target Qty",
                "Produced Qty",
                "UOM",
                "Output Progress %",
                "Current Stage",
                "Stage Work Center",
                "Stage Progress %",
                "Completed Stages",
                "Total Stages",
                "Total Planned Hours",
                "Total Actual Hours",
                "Elapsed Hours",
                "Schedule Status",
                "Remaining WIP Materials Qty",
                "Floor Materials Count",
                "Start Date",
                "Due Date"
            ];

            const rows = jobs.map((j) => [
                `"${(j.job_order_no || "").replace(/"/g, '""')}"`,
                `"${(j.product_name || "").replace(/"/g, '""')}"`,
                `"${(j.product_code || "").replace(/"/g, '""')}"`,
                `"${(j.status || "").replace(/"/g, '""')}"`,
                j.priority ?? 0,
                `"${(j.branch_name || "").replace(/"/g, '""')}"`,
                `"${(j.primary_work_center_name || "").replace(/"/g, '""')}"`,
                j.target_quantity ?? 0,
                j.actual_quantity_produced ?? 0,
                `"${(j.uom_name || "").replace(/"/g, '""')}"`,
                `"${j.quantity_progress_percent ?? 0}%"`,
                `"${(j.current_stage?.operation_name || "").replace(/"/g, '""')}"`,
                `"${(j.current_stage?.work_center_name || j.primary_work_center_name || "").replace(/"/g, '""')}"`,
                `"${j.stage_progress_percent ?? 0}%"`,
                j.completed_stages_count ?? 0,
                j.total_stages ?? 0,
                j.total_planned_hours ?? 0,
                j.total_actual_hours ?? 0,
                j.elapsed_hours ?? 0,
                `"${j.is_delayed ? "Delayed" : "On Track"}"`,
                j.total_wip_remaining_quantity ?? 0,
                j.total_wip_materials_count ?? 0,
                `"${j.start_date || ""}"`,
                `"${j.end_date || ""}"`
            ]);

            const csvContent = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","), ...rows.map(r => r.join(","))].join("\r\n");
            const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
            const dateStr = new Date().toISOString().split("T")[0];
            saveAs(blob, `wip_tracking_report_${dateStr}.csv`);
            toast.success("WIP Tracking CSV (.csv) exported successfully.");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            toast.error("Failed to generate CSV export: " + msg);
        }
    }, [jobs]);

    return {
        jobs,
        summary,
        workCenterQueues,
        masterData,
        isLoading,
        isRefreshing,
        lastUpdated,
        error,
        filters,
        viewMode,
        page,
        pageSize,
        selectedJobForDetail,
        activeDetailTab,
        openDetailModal,
        closeDetailModal,
        setActiveDetailTab,
        setFilter,
        resetFilters,
        setPage,
        setPageSize: handlePageSizeChange,
        setViewMode,
        refresh: () => loadData(true),
        exportCsv,
        exportExcel
    };
}
