"use client";

import React from "react";
import { DollarSign, Trash2, Clock, AlertTriangle } from "lucide-react";
import { ScrapSummaryKPIs } from "../types/scrap-rejection.types";
import { formatPHP } from "../services/scrap-rejection.helpers";

interface ScrapSummaryCardsProps {
    summary: ScrapSummaryKPIs;
}

export function ScrapSummaryCards({ summary }: ScrapSummaryCardsProps) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Material Loss (PHP) */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs transition-all hover:border-border/80">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Total Material Loss</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                        <DollarSign className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
                        {formatPHP(summary.total_material_loss_php)}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Cumulative component wastage value
                    </p>
                </div>
            </div>

            {/* Overall Scrap Rate (%) */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs transition-all hover:border-border/80">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Overall Scrap Rate</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Trash2 className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div className="text-2xl font-bold tracking-tight text-foreground">
                        {summary.overall_scrap_rate.toFixed(1)}%
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {summary.total_scrapped_units.toLocaleString()} scrapped of {(summary.total_produced_units + summary.total_scrapped_units).toLocaleString()} base units
                    </p>
                </div>
            </div>

            {/* Total Rework Hours & Cost */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs transition-all hover:border-border/80">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Rework Hours & Cost</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Clock className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div className="text-2xl font-bold tracking-tight text-foreground">
                        {summary.total_rework_hours.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">hrs</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatPHP(summary.total_rework_labor_cost_php)} rework labor incurred
                    </p>
                </div>
            </div>

            {/* Primary Defect Category */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs transition-all hover:border-border/80">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Primary Defect Category</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <AlertTriangle className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div className="truncate text-xl font-bold tracking-tight text-foreground">
                        {summary.top_defect_category || "None"}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Top defect reason: <span className="font-medium text-foreground">{summary.top_rejection_reason || "None"}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
