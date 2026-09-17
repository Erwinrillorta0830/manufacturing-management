"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
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

    // CSV Export
    const exportCsv = useCallback(() => {
        if (!jobs || jobs.length === 0) {
            toast.error("No data available to export.");
            return;
        }

        try {
            const headers = [
                "Job Order #",
                "Product Name",
                "Product Code",
                "Status",
                "Priority",
                "Branch",
                "Primary Line",
                "Target Qty",
                "Produced Qty",
                "Stage Progress %",
                "Current Stage",
                "Total Planned Hours",
                "Total Actual Hours",
                "Is Delayed",
                "Remaining WIP Materials Qty",
                "Start Date",
                "End Date"
            ];

            const rows = jobs.map((j) => [
                `"${j.job_order_no}"`,
                `"${j.product_name.replace(/"/g, '""')}"`,
                `"${j.product_code || ""}"`,
                `"${j.status}"`,
                j.priority,
                `"${j.branch_name}"`,
                `"${j.primary_work_center_name || ""}"`,
                j.target_quantity,
                j.actual_quantity_produced,
                `${j.stage_progress_percent}%`,
                `"${j.current_stage?.operation_name || ""}"`,
                j.total_planned_hours,
                j.total_actual_hours,
                j.is_delayed ? "YES" : "NO",
                j.total_wip_remaining_quantity,
                `"${j.start_date || ""}"`,
                `"${j.end_date || ""}"`
            ]);

            const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `wip_tracking_report_${new Date().toISOString().split("T")[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success("WIP Tracking CSV report exported successfully.");
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
        exportCsv
    };
}
