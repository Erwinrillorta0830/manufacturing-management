"use client";

import React from "react";
import { 
    Activity, 
    RefreshCw, 
    Download, 
    LayoutGrid, 
    Table as TableIcon,
    Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WipHeaderProps {
    totalActiveJobs: number;
    viewMode: "table" | "board";
    onViewModeChange: (mode: "table" | "board") => void;
    onRefresh: () => void;
    onExportCsv: () => void;
    isRefreshing: boolean;
    lastUpdated: string | null;
}

export function WipHeader({
    totalActiveJobs,
    viewMode,
    onViewModeChange,
    onRefresh,
    onExportCsv,
    isRefreshing,
    lastUpdated
}: WipHeaderProps) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                    <Activity className="h-5 w-5" />
                </div>
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                            Work-in-Progress (WIP) Tracking Report
                        </h1>
                        <Badge 
                            variant="secondary" 
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold px-2 py-0.5 text-xs"
                        >
                            {totalActiveJobs} Active Orders
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Live shop floor visibility: active job statuses, operation stages, work center queues, and floor inventory.
                    </p>
                </div>
            </div>

            {/* Action Controls */}
            <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                {/* View Switcher */}
                <div className="flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 shadow-xs">
                    <Button
                        variant={viewMode === "table" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => onViewModeChange("table")}
                        className={`h-8 gap-1.5 px-3 text-xs font-semibold ${
                            viewMode === "table" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                        }`}
                    >
                        <TableIcon className="h-3.5 w-3.5" />
                        <span>Table View</span>
                    </Button>
                    <Button
                        variant={viewMode === "board" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => onViewModeChange("board")}
                        className={`h-8 gap-1.5 px-3 text-xs font-semibold ${
                            viewMode === "board" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                        }`}
                    >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span>Line / Center Board</span>
                    </Button>
                </div>

                {/* Export CSV */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExportCsv}
                    className="h-8 gap-1.5 text-xs font-medium border-border/80 hover:bg-muted/60"
                >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Export CSV</span>
                </Button>

                {/* Refresh */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="h-8 gap-1.5 text-xs font-medium border-border/80 hover:bg-muted/60"
                >
                    <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                    <span>Refresh</span>
                </Button>

                {lastUpdated && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 pl-1 hidden lg:flex font-mono">
                        <Clock className="h-3 w-3" />
                        {lastUpdated}
                    </span>
                )}
            </div>
        </div>
    );
}
