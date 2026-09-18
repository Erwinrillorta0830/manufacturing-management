"use client";

import React from "react";
import { useFirstPassYieldReport } from "./hooks/useFirstPassYieldReport";
import { FPYHeader } from "./components/FPYHeader";
import { FPYSummaryCards } from "./components/FPYSummaryCards";
import { FPYFilterToolbar } from "./components/FPYFilterToolbar";
import { FPYTableView } from "./components/FPYTableView";
import { FPYDetailModal } from "./components/FPYDetailModal";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FirstPassYieldReportModule() {
    const {
        filteredRows,
        paginatedRows,
        summaryKPIs,
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
        refresh,
        exportCsv,
        exportPdf
    } = useFirstPassYieldReport();

    return (
        <div className="space-y-4 pb-8">
            {/* Header */}
            <FPYHeader
                totalJobs={summaryKPIs.total_jobs}
                onRefresh={refresh}
                onExportCsv={exportCsv}
                onExportPdf={exportPdf}
                isRefreshing={isRefreshing}
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

            {/* Executive KPI Summary Cards */}
            <FPYSummaryCards
                summary={summaryKPIs}
                filters={filters}
                onQualityTierFilterClick={(tier) => setFilter("qualityTier", tier)}
            />

            {/* Filter Toolbar */}
            <FPYFilterToolbar
                filters={filters}
                masterData={masterData}
                onFilterChange={setFilter}
                onResetFilters={resetFilters}
            />

            {/* Interactive FPY Data Table */}
            <FPYTableView
                rows={paginatedRows}
                totalCount={filteredRows.length}
                isLoading={isLoading}
                page={page}
                pageSize={pageSize}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                onOpenBreakdown={openBreakdown}
            />

            {/* Detailed Inspection Drilldown Modal */}
            {selectedJobId !== null && (
                <FPYDetailModal
                    data={breakdownData}
                    isLoading={isBreakdownLoading}
                    onClose={closeBreakdown}
                />
            )}
        </div>
    );
}
