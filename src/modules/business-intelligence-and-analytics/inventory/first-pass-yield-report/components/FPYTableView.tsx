"use client";

import React from "react";
import { FPYReportRow } from "../types/fpy.types";
import {
    ArrowUpDown,
    Eye,
    RotateCcw,
    Award,
    AlertCircle,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FPYTableViewProps {
    rows: FPYReportRow[];
    totalCount: number;
    isLoading: boolean;
    page: number;
    pageSize: number;
    sortField: string;
    sortDirection: "asc" | "desc";
    onSort: (field: string) => void;
    onPageChange: (newPage: number) => void;
    onPageSizeChange: (newPageSize: number) => void;
    onOpenBreakdown: (jobOrderId: number) => void;
}

export function FPYTableView({
    rows,
    totalCount,
    isLoading,
    page,
    pageSize,
    sortField,
    sortDirection,
    onSort,
    onPageChange,
    onPageSizeChange,
    onOpenBreakdown
}: FPYTableViewProps) {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const renderTierBadge = (tier: "Excellent" | "Acceptable" | "Needs Attention") => {
        if (tier === "Excellent") {
            return (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[11px] font-semibold hover:bg-emerald-500/20">
                    <Award className="h-3 w-3 mr-1" />
                    Excellent (≥95%)
                </Badge>
            );
        }
        if (tier === "Acceptable") {
            return (
                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[11px] font-semibold hover:bg-amber-500/20">
                    Acceptable
                </Badge>
            );
        }
        return (
            <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[11px] font-semibold hover:bg-destructive/20">
                <AlertCircle className="h-3 w-3 mr-1" />
                Needs Attention
            </Badge>
        );
    };

    const renderSortHeader = (label: string, field: string, align: "left" | "right" | "center" = "left") => (
        <th
            onClick={() => onSort(field)}
            className={`cursor-pointer select-none py-3 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors text-${align}`}
        >
            <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"}`}>
                <span>{label}</span>
                <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-primary font-bold" : "opacity-40"}`} />
            </div>
        </th>
    );

    return (
        <div className="rounded-xl border bg-card shadow-2xs overflow-hidden">
            {/* Table Container */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b bg-muted/40 text-xs">
                            {renderSortHeader("Job Order #", "job_order_no")}
                            {renderSortHeader("Product / SKU", "product_name")}
                            {renderSortHeader("Branch", "branch_name")}
                            {renderSortHeader("Target", "target_quantity", "right")}
                            {renderSortHeader("Inspected", "inspected_quantity", "right")}
                            {renderSortHeader("1st-Pass Good", "passed_quantity", "right")}
                            {renderSortHeader("Rework Qty", "rework_quantity", "right")}
                            {renderSortHeader("Scrap Qty", "scrap_quantity", "right")}
                            {renderSortHeader("FPY %", "fpy_percentage", "center")}
                            <th className="py-3 px-3 text-xs font-semibold text-muted-foreground text-center">
                                Quality Rating
                            </th>
                            <th className="py-3 px-3 text-xs font-semibold text-muted-foreground text-left">
                                Top Defect
                            </th>
                            <th className="py-3 px-3 text-xs font-semibold text-muted-foreground text-center">
                                Action
                            </th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border/60 text-xs">
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="py-3.5 px-3"><div className="h-4 w-28 bg-muted rounded" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-36 bg-muted rounded" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-20 bg-muted rounded" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-12 bg-muted rounded ml-auto" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-12 bg-muted rounded ml-auto" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-12 bg-muted rounded ml-auto" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-12 bg-muted rounded ml-auto" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-12 bg-muted rounded ml-auto" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-16 bg-muted rounded mx-auto" /></td>
                                    <td className="py-3.5 px-3"><div className="h-5 w-24 bg-muted rounded mx-auto" /></td>
                                    <td className="py-3.5 px-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                                    <td className="py-3.5 px-3"><div className="h-7 w-12 bg-muted rounded mx-auto" /></td>
                                </tr>
                            ))
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={12} className="py-12 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Award className="h-8 w-8 opacity-20 text-muted-foreground" />
                                        <p className="text-sm font-medium">No Job Order inspection records found.</p>
                                        <p className="text-xs text-muted-foreground max-w-sm">
                                            Try adjusting your search terms, date range, or active quality filters.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => {
                                const fpyColor = row.fpy_percentage >= 95
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : row.fpy_percentage >= 85
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-destructive font-bold";

                                return (
                                    <tr
                                        key={row.job_order_id}
                                        className="hover:bg-muted/30 transition-colors group"
                                    >
                                        {/* Job Order Number */}
                                        <td className="py-3 px-3 font-semibold text-foreground whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <span>{row.job_order_no}</span>
                                                {row.is_rework_order && (
                                                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500/40 text-amber-600">
                                                        <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                                                        RWK
                                                    </Badge>
                                                )}
                                                {row.rework_count > 0 && !row.is_rework_order && (
                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 text-muted-foreground" title={`${row.rework_count} Rework order(s) spawned`}>
                                                        +{row.rework_count} rwk
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>

                                        {/* Product */}
                                        <td className="py-3 px-3">
                                            <div className="font-medium text-foreground">{row.product_name}</div>
                                            <div className="text-[11px] text-muted-foreground">{row.product_code}</div>
                                        </td>

                                        {/* Branch */}
                                        <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                                            {row.branch_name}
                                        </td>

                                        {/* Target Qty */}
                                        <td className="py-3 px-3 text-right font-medium text-muted-foreground">
                                            {row.target_quantity.toLocaleString()}
                                        </td>

                                        {/* Inspected Qty */}
                                        <td className="py-3 px-3 text-right font-semibold text-foreground">
                                            {row.inspected_quantity.toLocaleString()}
                                        </td>

                                        {/* 1st-Pass Good Qty */}
                                        <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                            {row.passed_quantity.toLocaleString()}
                                        </td>

                                        {/* Rework Qty */}
                                        <td className="py-3 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                                            {row.rework_quantity > 0 ? (
                                                <div>
                                                    <span>{row.rework_quantity.toLocaleString()}</span>
                                                    <span className="text-[10px] text-muted-foreground block">
                                                        ({row.rework_rate_percentage < 1 && row.rework_rate_percentage > 0 ? row.rework_rate_percentage.toFixed(2) : row.rework_rate_percentage.toFixed(0)}%)
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground/50">0</span>
                                            )}
                                        </td>

                                        {/* Scrap Qty */}
                                        <td className="py-3 px-3 text-right font-medium text-destructive">
                                            {row.scrap_quantity > 0 ? (
                                                <div>
                                                    <span>{row.scrap_quantity.toLocaleString()}</span>
                                                    <span className="text-[10px] text-muted-foreground block">
                                                        ({row.scrap_rate_percentage < 1 && row.scrap_rate_percentage > 0 ? row.scrap_rate_percentage.toFixed(2) : row.scrap_rate_percentage.toFixed(0)}%)
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground/50">0</span>
                                            )}
                                        </td>

                                        {/* FPY % Progress */}
                                        <td className="py-3 px-3 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`text-xs font-bold ${fpyColor}`}>
                                                    {row.fpy_percentage.toFixed(1)}%
                                                </span>
                                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${row.fpy_percentage >= 95 ? "bg-emerald-500" : row.fpy_percentage >= 85 ? "bg-amber-500" : "bg-destructive"}`}
                                                        style={{ width: `${Math.min(100, Math.max(0, row.fpy_percentage))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>

                                        {/* Quality Rating */}
                                        <td className="py-3 px-3 text-center whitespace-nowrap">
                                            {renderTierBadge(row.quality_tier)}
                                        </td>

                                        {/* Top Defect */}
                                        <td className="py-3 px-3 text-muted-foreground max-w-[140px] truncate" title={row.top_rejection_reason || "None"}>
                                            {row.top_rejection_reason || <span className="text-muted-foreground/50">—</span>}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3 px-3 text-center">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onOpenBreakdown(row.job_order_id)}
                                                className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                                                title="View Detailed Inspection History"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                <span>Details</span>
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-4 py-3 bg-muted/20 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Showing</span>
                    <span className="font-semibold text-foreground">
                        {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}
                    </span>
                    <span>to</span>
                    <span className="font-semibold text-foreground">
                        {Math.min(page * pageSize, totalCount)}
                    </span>
                    <span>of</span>
                    <span className="font-semibold text-foreground">{totalCount}</span>
                    <span>runs</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Rows per page:</span>
                        <select
                            aria-label="Rows per page"
                            value={pageSize}
                            onChange={(e) => {
                                onPageSizeChange(Number(e.target.value));
                                onPageChange(1);
                            }}
                            className="h-7 rounded border bg-background px-1.5 text-xs text-foreground focus:outline-hidden"
                        >
                            <option value={10}>10</option>
                            <option value={15}>15</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            className="h-7 w-7 p-0"
                            title="Previous Page"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="px-2 font-medium text-foreground">
                            {page} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="h-7 w-7 p-0"
                            title="Next Page"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
