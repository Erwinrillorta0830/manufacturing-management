"use client";

import React from "react";
import { useWipTracking } from "./hooks/useWipTracking";
import { WipHeader } from "./components/WipHeader";
import { WipSummaryCards } from "./components/WipSummaryCards";
import { WipFilterToolbar } from "./components/WipFilterToolbar";
import { WipTableView } from "./components/WipTableView";
import { WipWorkCenterBoardView } from "./components/WipWorkCenterBoardView";
import { WipDetailModal } from "./components/WipDetailModal";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WipTrackingReportModule() {
    const {
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
        setPageSize,
        setViewMode,
        refresh,
        exportCsv,
        exportExcel
    } = useWipTracking();

    return (
        <div className="space-y-4 pb-6">
            {/* Header Section */}
            <WipHeader
                totalActiveJobs={summary?.total_active_jobs || jobs.length}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onRefresh={refresh}
                onExportCsv={exportCsv}
                onExportExcel={exportExcel}
                isRefreshing={isRefreshing}
                lastUpdated={lastUpdated}
            />

            {/* Error Banner */}
            {error && (
                <div className="flex items-center justify-between rounded-xl border border-destructive/50 bg-destructive/10 p-3.5 text-xs text-destructive">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        className="h-7 text-xs border-destructive/30 hover:bg-destructive/20"
                    >
                        Retry
                    </Button>
                </div>
            )}

            {/* Top KPI Metric Cards */}
            <WipSummaryCards
                summary={summary}
                filters={filters}
                onStatusClick={(statusVal) => setFilter("status", statusVal)}
                onDelayedToggle={() => setFilter("delayedOnly", !filters.delayedOnly)}
            />

            {/* Filter Toolbar */}
            <WipFilterToolbar
                filters={filters}
                masterData={masterData}
                onFilterChange={setFilter}
                onResetFilters={resetFilters}
            />

            {/* Main Content: Table or Board View */}
            {viewMode === "table" ? (
                <WipTableView
                    jobs={jobs}
                    isLoading={isLoading}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    onOpenDetail={openDetailModal}
                />
            ) : (
                <WipWorkCenterBoardView
                    queues={workCenterQueues}
                    isLoading={isLoading}
                    onOpenDetail={openDetailModal}
                />
            )}

            {/* Unified WIP Detail Modal with Tabs (Spacious sm:max-w-[1250px] w-[96vw] h-[88vh]) */}
            <WipDetailModal
                job={selectedJobForDetail}
                open={Boolean(selectedJobForDetail)}
                onOpenChange={(open) => {
                    if (!open) closeDetailModal();
                }}
                activeTab={activeDetailTab}
                onTabChange={setActiveDetailTab}
            />
        </div>
    );
}
