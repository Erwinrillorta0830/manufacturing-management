"use client";

import React from "react";
import { useJobOrderProfitability } from "./hooks/useJobOrderProfitability";
import { ProfitabilityHeader } from "./components/ProfitabilityHeader";
import { ProfitabilitySummaryCards } from "./components/ProfitabilitySummaryCards";
import { ProfitabilityFilterToolbar } from "./components/ProfitabilityFilterToolbar";
import { ProfitabilityTableView } from "./components/ProfitabilityTableView";
import { ProfitabilityDetailModal } from "./components/ProfitabilityDetailModal";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function JobOrderProfitabilityReportModule() {
    const {
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
        refresh,
        exportCsv,
        exportPdf
    } = useJobOrderProfitability();

    return (
        <div className="space-y-4 pb-8">
            {/* Header */}
            <ProfitabilityHeader
                totalJobs={summaryKPIs.total_jobs}
                onRefresh={refresh}
                onExportCsv={exportCsv}
                onExportPdf={exportPdf}
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

            {/* Executive KPI Metric Summary Cards */}
            <ProfitabilitySummaryCards
                summary={summaryKPIs}
                filters={filters}
                onMarginFilterClick={(marginStatus) => setFilter("marginStatus", marginStatus)}
            />

            {/* Filter Toolbar */}
            <ProfitabilityFilterToolbar
                filters={filters}
                masterData={masterData}
                onFilterChange={setFilter}
                onResetFilters={resetFilters}
            />

            {/* Interactive Job Order Margin Table */}
            <ProfitabilityTableView
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

            {/* Itemized Cost Breakdown Drilldown Modal */}
            {selectedJobId !== null && (
                <ProfitabilityDetailModal
                    data={breakdownData}
                    isLoading={isBreakdownLoading}
                    onClose={closeBreakdown}
                />
            )}
        </div>
    );
}
