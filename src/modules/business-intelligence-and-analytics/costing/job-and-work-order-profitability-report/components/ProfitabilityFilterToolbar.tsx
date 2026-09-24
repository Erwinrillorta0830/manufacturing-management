"use client";

import React from "react";
import { Search, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfitabilityFilters, MasterLookupData } from "../types";

interface ProfitabilityFilterToolbarProps {
    filters: ProfitabilityFilters;
    masterData: MasterLookupData;
    onFilterChange: <K extends keyof ProfitabilityFilters>(key: K, value: ProfitabilityFilters[K]) => void;
    onResetFilters: () => void;
}

export function ProfitabilityFilterToolbar({
    filters,
    masterData,
    onFilterChange,
    onResetFilters
}: ProfitabilityFilterToolbarProps) {
    const isFiltered =
        filters.search !== "" ||
        filters.status !== "all" ||
        filters.marginStatus !== "all" ||
        filters.startDate !== "" ||
        filters.endDate !== "";

    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Bar */}
                <div className="relative min-w-[240px] flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search JO #, Finished Good, Sales Order #, Customer..."
                        value={filters.search}
                        onChange={(e) => onFilterChange("search", e.target.value)}
                        className="h-9 pl-9 pr-8 text-xs"
                    />
                    {filters.search && (
                        <button
                            type="button"
                            onClick={() => onFilterChange("search", "")}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Status Dropdown */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Job Order Status"
                        value={filters.status}
                        onChange={(e) => onFilterChange("status", e.target.value)}
                        className="h-9 w-full sm:w-[150px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="all">All Statuses</option>
                        {masterData.statuses.map((st) => (
                            <option key={st} value={st}>
                                {st}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Margin Health Filter */}
                <div className="w-full sm:w-auto">
                    <select
                        aria-label="Filter by Margin Health"
                        value={filters.marginStatus}
                        onChange={(e) => onFilterChange("marginStatus", e.target.value)}
                        className="h-9 w-full sm:w-[160px] rounded-lg border bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    >
                        <option value="all">All Margin Health</option>
                        <option value="high">High (&ge;45%)</option>
                        <option value="healthy">Healthy (25-45%)</option>
                        <option value="moderate">Moderate (10-25%)</option>
                        <option value="low">Low (0-10%)</option>
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
