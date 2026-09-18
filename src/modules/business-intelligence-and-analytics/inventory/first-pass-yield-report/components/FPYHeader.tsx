"use client";

import React from "react";
import { Download, Printer, RefreshCw, Award } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FPYHeaderProps {
    totalJobs: number;
    onRefresh: () => void;
    onExportCsv: () => void;
    onExportPdf: () => void;
    isRefreshing: boolean;
}

export function FPYHeader({
    totalJobs,
    onRefresh,
    onExportCsv,
    onExportPdf,
    isRefreshing
}: FPYHeaderProps) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
            <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Award className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-foreground">
                            First-Pass Yield (FPY) Report
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Measures the percentage of units produced correctly without needing rework or repair.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="h-8 text-xs font-medium gap-1.5 shadow-2xs"
                    title="Refresh data from Directus"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                    <span>Refresh</span>
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExportCsv}
                    disabled={totalJobs === 0}
                    className="h-8 text-xs font-medium gap-1.5 shadow-2xs"
                    title="Export table as CSV"
                >
                    <Download className="h-3.5 w-3.5" />
                    <span>CSV</span>
                </Button>

                <Button
                    variant="default"
                    size="sm"
                    onClick={onExportPdf}
                    disabled={totalJobs === 0}
                    className="h-8 text-xs font-medium gap-1.5 shadow-2xs bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    title="Generate and download PDF report"
                >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print / PDF</span>
                </Button>
            </div>
        </div>
    );
}
