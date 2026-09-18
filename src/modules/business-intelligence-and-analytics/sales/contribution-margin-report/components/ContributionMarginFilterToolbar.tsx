"use client";

import React from "react";
import { Search, X, Calendar, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContributionMarginFilters } from "../types/contribution-margin.types";

interface ContributionMarginFilterToolbarProps {
    filters: ContributionMarginFilters;
    availableCategories: Array<{ id: number; name: string }>;
    availableBrands: Array<{ id: number; name: string }>;
    onFilterChange: (key: keyof ContributionMarginFilters, value: string) => void;
    onResetFilters: () => void;
    onRefresh: () => void;
    onExport: () => void;
    isLoading?: boolean;
}

export function ContributionMarginFilterToolbar({
    filters,
    availableCategories,
    availableBrands,
    onFilterChange,
    onResetFilters,
    onRefresh,
    onExport,
    isLoading = false
}: ContributionMarginFilterToolbarProps) {
    const isFiltered =
        filters.searchQuery !== "" ||
        filters.categoryId !== "ALL" ||
        filters.brandId !== "ALL" ||
        filters.marginStatus !== "ALL" ||
        filters.startDate !== "" ||
        filters.endDate !== "";

    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Bar */}
                <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search SKU code, Product name, Category..."
                        value={filters.searchQuery}
                        onChange={(e) => onFilterChange("searchQuery", e.target.value)}
                        className="h-9 pl-9 pr-8 text-xs"
                    />
                    {filters.searchQuery && (
                        <button
                            type="button"
                            onClick={() => onFilterChange("searchQuery", "")}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                            title="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Category Line Dropdown */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Category Line"
                        value={filters.categoryId}
                        onChange={(e) => onFilterChange("categoryId", e.target.value)}
                        className="h-9 w-full sm:w-[160px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="ALL">All Categories</option>
                        {availableCategories.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Brand Line Dropdown */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Brand Line"
                        value={filters.brandId}
                        onChange={(e) => onFilterChange("brandId", e.target.value)}
                        className="h-9 w-full sm:w-[150px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="ALL">All Brands</option>
                        {availableBrands.map((b) => (
                            <option key={b.id} value={String(b.id)}>
                                {b.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Margin Health Status Filter */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Margin Status"
                        value={filters.marginStatus}
                        onChange={(e) => onFilterChange("marginStatus", e.target.value)}
                        className="h-9 w-full sm:w-[150px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="ALL">All Margin Status</option>
                        <option value="high">High (≥50%)</option>
                        <option value="healthy">Healthy (30-49%)</option>
                        <option value="moderate">Moderate (15-29%)</option>
                        <option value="low">Low (0-14%)</option>
                        <option value="negative">Negative (&lt;0%)</option>
                    </select>
                </div>

                {/* Date Filters */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-36">
                        <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            aria-label="Start Date"
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => onFilterChange("startDate", e.target.value)}
                            className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                        />
                    </div>
                    <span className="text-xs text-muted-foreground">-</span>
                    <div className="relative flex-1 sm:w-36">
                        <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            aria-label="End Date"
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => onFilterChange("endDate", e.target.value)}
                            className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 ml-auto">
                    {isFiltered && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onResetFilters}
                            className="h-9 text-xs font-medium text-muted-foreground hover:text-foreground gap-1"
                        >
                            <X className="h-3.5 w-3.5" />
                            <span>Reset</span>
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRefresh}
                        disabled={isLoading}
                        className="h-9 text-xs gap-1.5"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>

                    <Button
                        variant="default"
                        size="sm"
                        onClick={onExport}
                        className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export CSV</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
