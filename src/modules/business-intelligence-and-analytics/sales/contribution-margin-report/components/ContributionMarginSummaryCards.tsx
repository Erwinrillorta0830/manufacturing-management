"use client";

import React from "react";
import { ContributionMarginSummaryKPIs, ContributionMarginFilters } from "../types/contribution-margin.types";
import { DollarSign, Layers, TrendingUp, AlertTriangle, PieChart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ContributionMarginSummaryCardsProps {
    summary: ContributionMarginSummaryKPIs | null;
    filters: ContributionMarginFilters;
    onStatusFilterClick: (status: string) => void;
}

export function ContributionMarginSummaryCards({
    summary,
    filters,
    onStatusFilterClick
}: ContributionMarginSummaryCardsProps) {
    if (!summary) return null;

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Total Net Sales Revenue (Paid) */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Net Sales Revenue (Paid)</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <DollarSign className="h-4 w-4" />
                    </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.total_net_sales)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Units Sold (Paid)</span>
                    <span className="font-semibold text-foreground">{summary.total_units_sold.toLocaleString()} units</span>
                </div>
            </div>

            {/* Card 2: Total Manufacturing Cost (TMC) */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Total Manufacturing Cost (TMC)</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Layers className="h-4 w-4" />
                    </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.total_manufacturing_cost)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Avg Unit TMC</span>
                    <span className="font-semibold text-foreground">
                        {summary.total_units_sold > 0
                            ? formatCurrency(summary.total_manufacturing_cost / summary.total_units_sold)
                            : "₱0.00"}
                    </span>
                </div>
            </div>

            {/* Card 3: Total Contribution Margin ($) */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Total Contribution Margin</span>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${summary.total_contribution_margin >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                        <TrendingUp className="h-4 w-4" />
                    </div>
                </div>
                <div className={`text-xl font-bold tracking-tight ${summary.total_contribution_margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {formatCurrency(summary.total_contribution_margin)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Profitable SKUs</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {summary.profitable_skus_count} / {summary.total_skus}
                    </span>
                </div>
            </div>

            {/* Card 4: Contribution Margin Ratio (%) */}
            <div
                className={`relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs cursor-pointer ${filters.marginStatus === "negative" ? "ring-2 ring-destructive" : ""}`}
                onClick={() => onStatusFilterClick(filters.marginStatus === "negative" ? "ALL" : "negative")}
                title="Click to toggle negative margin items filter"
            >
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Contribution Margin (%)</span>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${summary.overall_contribution_margin_ratio >= 30 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : summary.overall_contribution_margin_ratio >= 15 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-destructive/10 text-destructive"}`}>
                        {summary.loss_skus_count > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : (
                            <PieChart className="h-4 w-4" />
                        )}
                    </div>
                </div>
                <div className={`text-xl font-bold tracking-tight ${summary.overall_contribution_margin_ratio >= 30 ? "text-emerald-600 dark:text-emerald-400" : summary.overall_contribution_margin_ratio >= 15 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                    {summary.overall_contribution_margin_ratio.toFixed(1)}%
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Loss-Making SKUs</span>
                    <span className={`font-semibold ${summary.loss_skus_count > 0 ? "text-destructive font-bold" : "text-foreground"}`}>
                        {summary.loss_skus_count} SKUs
                    </span>
                </div>
            </div>
        </div>
    );
}
