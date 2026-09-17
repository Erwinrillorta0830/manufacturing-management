"use client";

import React from "react";
import { FPYSummaryKPIs, FPYFilters } from "../types/fpy.types";
import { Award, CheckCircle2, RotateCcw, AlertTriangle } from "lucide-react";

interface FPYSummaryCardsProps {
    summary: FPYSummaryKPIs;
    filters: FPYFilters;
    onQualityTierFilterClick: (tier: "all" | "excellent" | "acceptable" | "needs_attention") => void;
}

export function FPYSummaryCards({
    summary,
    filters,
    onQualityTierFilterClick
}: FPYSummaryCardsProps) {
    const fmtNum = (val: number): string => {
        return (val || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    };

    const formatRate = (rate: number, unitCount: number): string => {
        if (unitCount > 0 && rate > 0 && rate < 0.1) {
            return `${rate.toFixed(2)}%`;
        }
        if (unitCount > 0 && rate > 0 && rate < 1) {
            return `${rate.toFixed(2)}%`;
        }
        return `${(rate || 0).toFixed(1)}%`;
    };

    const excellentPercent = summary.total_jobs > 0 ? (summary.excellent_jobs_count / summary.total_jobs) * 100 : 0;
    const acceptablePercent = summary.total_jobs > 0 ? (summary.acceptable_jobs_count / summary.total_jobs) * 100 : 0;
    const needsAttentionPercent = summary.total_jobs > 0 ? (summary.needs_attention_jobs_count / summary.total_jobs) * 100 : 0;

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Overall First-Pass Yield % */}
            <div
                className={`relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs cursor-pointer ${filters.qualityTier === "needs_attention" ? "ring-2 ring-destructive" : ""}`}
                onClick={() => onQualityTierFilterClick(filters.qualityTier === "needs_attention" ? "all" : "needs_attention")}
                title="Click to toggle low-yield jobs filter (<85%)"
            >
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Overall First-Pass Yield</span>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${summary.overall_fpy_percentage >= 95 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : summary.overall_fpy_percentage >= 85 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-destructive/10 text-destructive"}`}>
                        <Award className="h-4 w-4" />
                    </div>
                </div>
                <div className={`text-xl font-bold tracking-tight ${summary.overall_fpy_percentage >= 95 ? "text-emerald-600 dark:text-emerald-400" : summary.overall_fpy_percentage >= 85 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                    {summary.overall_fpy_percentage.toFixed(1)}%
                </div>

                {/* Quality Tier Distribution Micro-Bar */}
                <div className="mt-2 space-y-1 border-t pt-1.5">
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="bg-emerald-500"
                            style={{ width: `${excellentPercent}%` }}
                            title={`Excellent (≥95%): ${summary.excellent_jobs_count} JOs (${excellentPercent.toFixed(0)}%)`}
                        />
                        <div
                            className="bg-amber-500"
                            style={{ width: `${acceptablePercent}%` }}
                            title={`Acceptable (85-94%): ${summary.acceptable_jobs_count} JOs (${acceptablePercent.toFixed(0)}%)`}
                        />
                        <div
                            className="bg-destructive"
                            style={{ width: `${needsAttentionPercent}%` }}
                            title={`Needs Attention (<85%): ${summary.needs_attention_jobs_count} JOs (${needsAttentionPercent.toFixed(0)}%)`}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">≥95%: {summary.excellent_jobs_count}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">85-94%: {summary.acceptable_jobs_count}</span>
                        <span className="text-destructive font-medium">&lt;85%: {summary.needs_attention_jobs_count}</span>
                    </div>
                </div>
            </div>

            {/* Card 2: Inspected vs 1st-Pass Good Units */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">1st-Pass Passed Units</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <CheckCircle2 className="h-4 w-4" />
                    </div>
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">
                    {fmtNum(summary.total_passed_first_time)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Total Inspected</span>
                    <span className="font-semibold text-foreground">{fmtNum(summary.total_inspected_units)} units</span>
                </div>
            </div>

            {/* Card 3: Rework Rate & Spawned Rework Units */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Rework Rate (%)</span>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${summary.overall_rework_rate > 5 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                        <RotateCcw className="h-4 w-4" />
                    </div>
                </div>
                <div className={`text-xl font-bold tracking-tight ${summary.overall_rework_rate > 5 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                    {formatRate(summary.overall_rework_rate, summary.total_reworked_units)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Reworked / Repaired</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {fmtNum(summary.total_reworked_units)} units
                    </span>
                </div>
            </div>

            {/* Card 4: Scrap Rate & Dominant Defect */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-2xs transition-all hover:shadow-xs">
                <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Scrap Rate (%)</span>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${summary.overall_scrap_rate > 3 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        <AlertTriangle className="h-4 w-4" />
                    </div>
                </div>
                <div className={`text-xl font-bold tracking-tight ${summary.overall_scrap_rate > 3 ? "text-destructive" : "text-foreground"}`}>
                    {formatRate(summary.overall_scrap_rate, summary.total_scrapped_units)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                    <span>Top Defect</span>
                    <span className="font-semibold text-foreground truncate max-w-[150px]" title={summary.top_defect_reason}>
                        {summary.top_defect_reason}
                    </span>
                </div>
            </div>
        </div>
    );
}
