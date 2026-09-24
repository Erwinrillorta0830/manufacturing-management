"use client";

import React from "react";
import { ProfitabilitySummaryKPIs, ProfitabilityFilters } from "../types";
import { DollarSign, Layers, TrendingUp, AlertTriangle } from "lucide-react";

interface ProfitabilitySummaryCardsProps {
    summary: ProfitabilitySummaryKPIs;
    filters: ProfitabilityFilters;
    onMarginFilterClick: (status: string) => void;
}

export function ProfitabilitySummaryCards({
    summary,
    filters,
    onMarginFilterClick
}: ProfitabilitySummaryCardsProps) {
    const fmt = (val: number): string => {
        return "₱" + (val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const materialsPercent = summary.total_cogs > 0 ? (summary.total_materials_cost / summary.total_cogs) * 100 : 0;
    const laborPercent = summary.total_cogs > 0 ? (summary.total_labor_cost / summary.total_cogs) * 100 : 0;
    const overheadPercent = summary.total_cogs > 0 ? (summary.total_overhead_cost / summary.total_cogs) * 100 : 0;

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Total Revenue */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Total Revenue (Gross Sales)</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <DollarSign className="h-4 w-4" />
                    </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">
                    {fmt(summary.total_revenue)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Active JOs Tracked</span>
                    <span className="font-semibold text-foreground">{summary.total_jobs} runs</span>
                </div>
            </div>

            {/* Card 2: Total Manufacturing COGS with Distribution */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Total COGS (Mfg Cost)</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Layers className="h-4 w-4" />
                    </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">
                    {fmt(summary.total_cogs)}
                </div>

                {/* Micro Distribution Bar */}
                <div className="mt-2 space-y-1 border-t pt-1.5">
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="bg-indigo-500"
                            style={{ width: `${materialsPercent}%` }}
                            title={`Materials: ${fmt(summary.total_materials_cost)} (${materialsPercent.toFixed(0)}%)`}
                        />
                        <div
                            className="bg-amber-500"
                            style={{ width: `${laborPercent}%` }}
                            title={`Labor: ${fmt(summary.total_labor_cost)} (${laborPercent.toFixed(0)}%)`}
                        />
                        <div
                            className="bg-teal-500"
                            style={{ width: `${overheadPercent}%` }}
                            title={`Overhead: ${fmt(summary.total_overhead_cost)} (${overheadPercent.toFixed(0)}%)`}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">Mat: {materialsPercent.toFixed(0)}%</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Lab: {laborPercent.toFixed(0)}%</span>
                        <span className="text-teal-600 dark:text-teal-400 font-medium">Ovh: {overheadPercent.toFixed(0)}%</span>
                    </div>
                </div>
            </div>

            {/* Card 3: Total Gross Profit */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Total Gross Profit</span>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${summary.total_gross_profit >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                        <TrendingUp className="h-4 w-4" />
                    </div>
                </div>
                <div className={`text-xl font-bold tracking-tight ${summary.total_gross_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {fmt(summary.total_gross_profit)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Profitable Runs</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {summary.profitable_jobs_count} JOs
                    </span>
                </div>
            </div>

            {/* Card 4: Average Gross Margin % */}
            <div
                className={`relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs cursor-pointer ${filters.marginStatus === "negative" ? "ring-2 ring-destructive" : ""}`}
                onClick={() => onMarginFilterClick(filters.marginStatus === "negative" ? "all" : "negative")}
                title="Click to toggle negative margin filter"
            >
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Avg Gross Margin (%)</span>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${summary.average_gross_margin_percent >= 20 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : summary.average_gross_margin_percent >= 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-destructive/10 text-destructive"}`}>
                        {summary.loss_jobs_count > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : (
                            <TrendingUp className="h-4 w-4" />
                        )}
                    </div>
                </div>
                <div className={`text-xl font-bold tracking-tight ${summary.average_gross_margin_percent >= 20 ? "text-emerald-600 dark:text-emerald-400" : summary.average_gross_margin_percent >= 0 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                    {summary.average_gross_margin_percent.toFixed(1)}%
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Negative Margin Runs</span>
                    <span className={`font-semibold ${summary.loss_jobs_count > 0 ? "text-destructive font-bold" : "text-foreground"}`}>
                        {summary.loss_jobs_count} JOs
                    </span>
                </div>
            </div>
        </div>
    );
}
