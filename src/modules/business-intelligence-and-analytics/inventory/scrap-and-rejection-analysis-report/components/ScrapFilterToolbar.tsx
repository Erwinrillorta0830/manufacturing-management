"use client";

import React from "react";
import { Search, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrapFilters, ScrapMasterData } from "../types/scrap-rejection.types";

interface ScrapFilterToolbarProps {
    filters: ScrapFilters;
    masterData: ScrapMasterData;
    onFilterChange: <K extends keyof ScrapFilters>(key: K, value: ScrapFilters[K]) => void;
    onResetFilters: () => void;
}

export function ScrapFilterToolbar({
    filters,
    masterData,
    onFilterChange,
    onResetFilters
}: ScrapFilterToolbarProps) {
    const isFiltered =
        filters.search !== "" ||
        filters.branchId !== "all" ||
        filters.productId !== "all" ||
        filters.defectCategory !== "all" ||
        filters.status !== "all" ||
        filters.dateFrom !== "" ||
        filters.dateTo !== "";

    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Bar */}
                <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search JO #, Product Name, SKU, Reason, Category..."
                        value={filters.search}
                        onChange={(e) => onFilterChange("search", e.target.value)}
                        className="h-9 pl-9 pr-8 text-xs"
                    />
                    {filters.search && (
                        <button
                            type="button"
                            onClick={() => onFilterChange("search", "")}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                            title="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Branch Dropdown */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Branch"
                        value={filters.branchId}
                        onChange={(e) => onFilterChange("branchId", e.target.value)}
                        className="h-9 w-full sm:w-[150px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="all">All Branches</option>
                        {masterData.branches.map((b) => (
                            <option key={b.id} value={String(b.id)}>
                                {b.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Product Dropdown */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Product"
                        value={filters.productId}
                        onChange={(e) => onFilterChange("productId", e.target.value)}
                        className="h-9 w-full sm:w-[160px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="all">All Products</option>
                        {masterData.products.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Defect Category Dropdown */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Defect Category"
                        value={filters.defectCategory}
                        onChange={(e) => onFilterChange("defectCategory", e.target.value)}
                        className="h-9 w-full sm:w-[160px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="all">All Defect Categories</option>
                        {masterData.defectCategories.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Status Dropdown */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Status"
                        value={filters.status}
                        onChange={(e) => onFilterChange("status", e.target.value)}
                        className="h-9 w-full sm:w-[130px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="all">All Statuses</option>
                        {masterData.statuses.map((st) => (
                            <option key={st} value={st}>
                                {st}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Date Filters */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-36">
                        <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            aria-label="Start Date"
                            type="date"
                            value={filters.dateFrom}
                            onChange={(e) => onFilterChange("dateFrom", e.target.value)}
                            className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                        />
                    </div>
                    <span className="text-xs text-muted-foreground">-</span>
                    <div className="relative flex-1 sm:w-36">
                        <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            aria-label="End Date"
                            type="date"
                            value={filters.dateTo}
                            onChange={(e) => onFilterChange("dateTo", e.target.value)}
                            className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>

                {/* Reset Filters */}
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
            </div>
        </div>
    );
}
