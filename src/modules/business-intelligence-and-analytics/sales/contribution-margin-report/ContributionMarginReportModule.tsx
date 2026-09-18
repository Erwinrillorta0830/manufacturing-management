"use client";

import React from "react";
import { useContributionMarginReport } from "./hooks/useContributionMarginReport";
import { ContributionMarginSummaryCards } from "./components/ContributionMarginSummaryCards";
import { ContributionMarginFilterToolbar } from "./components/ContributionMarginFilterToolbar";
import { ContributionMarginCharts } from "./components/ContributionMarginCharts";
import { ContributionMarginTableView } from "./components/ContributionMarginTableView";
import { TrendingUp, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ContributionMarginReportModule() {
    const {
        rows,
        categorySummaries,
        brandSummaries,
        summary,
        availableCategories,
        availableBrands,
        isLoading,
        error,
        filters,
        setFilters,
        activeTab,
        setActiveTab,
        refresh,
        exportToCsv
    } = useContributionMarginReport();

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleResetFilters = () => {
        setFilters({
            searchQuery: "",
            startDate: "",
            endDate: "",
            categoryId: "ALL",
            brandId: "ALL",
            marginStatus: "ALL"
        });
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <span>Contribution Margin Report</span>
                        {isLoading && (
                            <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground ml-2 animate-pulse">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                <span>Updating...</span>
                            </span>
                        )}
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Measures net sales revenue minus total manufacturing cost (TMC) per unit and line for paid sales invoices.
                    </p>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={refresh} className="h-7 text-xs gap-1">
                        <RefreshCw className="h-3 w-3" />
                        <span>Retry</span>
                    </Button>
                </div>
            )}

            {/* Filter Toolbar */}
            <ContributionMarginFilterToolbar
                filters={filters}
                availableCategories={availableCategories}
                availableBrands={availableBrands}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                onRefresh={refresh}
                onExport={exportToCsv}
                isLoading={isLoading}
            />

            {/* SKELETON LOADER STATE */}
            {isLoading && !summary ? (
                <div className="space-y-4 animate-pulse">
                    {/* 4 KPI Cards Skeleton */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div className="h-3.5 w-24 bg-muted rounded" />
                                    <div className="h-7 w-7 bg-muted rounded-md" />
                                </div>
                                <div className="h-6 w-32 bg-muted rounded" />
                                <div className="h-3 w-full bg-muted/60 rounded pt-2" />
                            </div>
                        ))}
                    </div>

                    {/* 2 Charts Skeleton */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="h-[310px] rounded-xl border bg-card p-4 space-y-4">
                            <div className="h-4 w-40 bg-muted rounded" />
                            <div className="h-[220px] bg-muted/40 rounded-lg flex items-end justify-around p-4">
                                {[40, 75, 55, 90, 60].map((h, idx) => (
                                    <div key={idx} className="w-10 bg-muted/80 rounded-t" style={{ height: `${h}%` }} />
                                ))}
                            </div>
                        </div>
                        <div className="h-[310px] rounded-xl border bg-card p-4 space-y-4">
                            <div className="h-4 w-40 bg-muted rounded" />
                            <div className="h-[220px] bg-muted/40 rounded-lg flex items-end justify-around p-4">
                                {[50, 65, 80, 45, 70].map((h, idx) => (
                                    <div key={idx} className="w-10 bg-muted/80 rounded-t" style={{ height: `${h}%` }} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Table Skeleton */}
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                        <div className="flex gap-2 pb-2 border-b">
                            <div className="h-7 w-36 bg-muted rounded" />
                            <div className="h-7 w-36 bg-muted rounded" />
                            <div className="h-7 w-36 bg-muted rounded" />
                        </div>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex justify-between items-center py-2.5 border-b border-border/40">
                                <div className="h-4 w-44 bg-muted rounded" />
                                <div className="h-4 w-24 bg-muted rounded" />
                                <div className="h-4 w-20 bg-muted rounded" />
                                <div className="h-4 w-20 bg-muted rounded" />
                                <div className="h-4 w-24 bg-muted rounded" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* Summary KPI Cards */}
                    <ContributionMarginSummaryCards
                        summary={summary}
                        filters={filters}
                        onStatusFilterClick={(status) => handleFilterChange("marginStatus", status)}
                    />

                    {/* Analytics Visuals */}
                    <ContributionMarginCharts
                        categorySummaries={categorySummaries}
                        brandSummaries={brandSummaries}
                        activeLineType={activeTab === "brand" ? "brand" : "category"}
                    />

                    {/* Main Table View */}
                    <ContributionMarginTableView
                        rows={rows}
                        categorySummaries={categorySummaries}
                        brandSummaries={brandSummaries}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        isLoading={isLoading}
                    />
                </>
            )}
        </div>
    );
}
