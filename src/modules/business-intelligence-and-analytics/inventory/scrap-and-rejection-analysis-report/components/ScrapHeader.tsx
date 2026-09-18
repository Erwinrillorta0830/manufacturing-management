"use client";

import React from "react";
import { Download, RefreshCw, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScrapHeaderProps {
    totalJobs: number;
    onRefresh: () => void;
    onExportCsv: () => void;
    onExportPdf: () => void;
    isRefreshing: boolean;
}

export function ScrapHeader({
    totalJobs,
    onRefresh,
    onExportCsv,
    onExportPdf,
    isRefreshing
}: ScrapHeaderProps) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                        <Trash2 className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                            Scrap and Rejection Analysis Report
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Summarizes material loss, scrap rates, rework hours, and primary defect categories across {totalJobs} production job orders.
                        </p>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="h-8 gap-1.5 text-xs font-medium"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExportCsv}
                    className="h-8 gap-1.5 text-xs font-medium"
                >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export CSV</span>
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExportPdf}
                    className="h-8 gap-1.5 text-xs font-medium"
                >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Export PDF</span>
                </Button>
            </div>
        </div>
    );
}
