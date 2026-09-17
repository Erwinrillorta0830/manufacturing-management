"use client";

import React from "react";
import { 
    Activity, 
    RefreshCw, 
    Download, 
    LayoutGrid, 
    Table as TableIcon,
    Clock,
    FileSpreadsheet,
    FileText,
    ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from "@/components/ui/dropdown-menu";

interface WipHeaderProps {
    totalActiveJobs: number;
    viewMode: "table" | "board";
    onViewModeChange: (mode: "table" | "board") => void;
    onRefresh: () => void;
    onExportCsv: () => void;
    onExportExcel?: () => void;
    isRefreshing: boolean;
    lastUpdated: string | null;
}

export function WipHeader({
    totalActiveJobs,
    viewMode,
    onViewModeChange,
    onRefresh,
    onExportCsv,
    onExportExcel,
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

                {/* Export Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs font-medium border-border/80 hover:bg-muted/60 shadow-xs"
                        >
                            <Download className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Export</span>
                            <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 text-xs">
                        <DropdownMenuItem 
                            onClick={onExportExcel || onExportCsv} 
                            className="gap-2.5 cursor-pointer py-2"
                        >
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div className="flex flex-col">
                                <span className="font-semibold text-foreground">Excel Workbook (.xlsx)</span>
                                <span className="text-[10px] text-muted-foreground">Auto-fit column widths & layout</span>
                            </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={onExportCsv} 
                            className="gap-2.5 cursor-pointer py-2"
                        >
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <div className="flex flex-col">
                                <span className="font-semibold text-foreground">CSV Spreadsheet (.csv)</span>
                                <span className="text-[10px] text-muted-foreground">Clean RFC-4180 comma-separated</span>
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

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
