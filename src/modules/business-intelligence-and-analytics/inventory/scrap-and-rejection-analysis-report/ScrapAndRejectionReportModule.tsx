"use client";

import React from "react";
import { useScrapAndRejectionReport } from "./hooks/useScrapAndRejectionReport";
import { ScrapHeader } from "./components/ScrapHeader";
import { ScrapSummaryCards } from "./components/ScrapSummaryCards";
import { ScrapDefectParetoChart } from "./components/ScrapDefectParetoChart";
import { ScrapFilterToolbar } from "./components/ScrapFilterToolbar";
import { ScrapTableView } from "./components/ScrapTableView";
import { ScrapDetailModal } from "./components/ScrapDetailModal";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ScrapAndRejectionReportModule() {
    const {
        filteredRows,
        paginatedRows,
        summaryKPIs,
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
        refresh,
        exportCsv,
        exportPdf
    } = useScrapAndRejectionReport();

    return (
        <div className="space-y-4 pb-8">
            {/* Header */}
            <ScrapHeader
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
            <ScrapSummaryCards summary={summaryKPIs} />

            {/* Defect Pareto Chart & Category Distribution */}
            <ScrapDefectParetoChart
                defectCategories={defectCategories}
                selectedCategory={filters.defectCategory}
                onSelectCategory={(cat) => setFilter("defectCategory", cat)}
            />

            {/* Filter Toolbar */}
            <ScrapFilterToolbar
                filters={filters}
                masterData={masterData}
                onFilterChange={setFilter}
                onResetFilters={resetFilters}
            />

            {/* Interactive Scrap Data Table */}
            <ScrapTableView
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

            {/* Drilldown Modal */}
            {selectedJobId !== null && (
                <ScrapDetailModal
                    data={breakdownData}
                    isLoading={isBreakdownLoading}
                    onClose={closeBreakdown}
                />
            )}
        </div>
    );
}
