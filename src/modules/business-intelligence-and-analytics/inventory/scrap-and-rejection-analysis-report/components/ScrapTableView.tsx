"use client";

import React from "react";
import {
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    AlertCircle,
    RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrapReportRow } from "../types/scrap-rejection.types";
import { formatPHP } from "../services/scrap-rejection.helpers";

interface ScrapTableViewProps {
    rows: ScrapReportRow[];
    totalCount: number;
    isLoading: boolean;
    page: number;
    pageSize: number;
    sortField: keyof ScrapReportRow;
    sortDirection: "asc" | "desc";
    onSort: (field: keyof ScrapReportRow) => void;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onOpenBreakdown: (jobOrderId: number) => void;
}

export function ScrapTableView({
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
}: ScrapTableViewProps) {
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    const renderSortIcon = (field: keyof ScrapReportRow) => {
        if (sortField !== field) {
            return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
        }
        return sortDirection === "asc" ? (
            <ArrowUp className="ml-1 h-3 w-3 text-primary" />
        ) : (
            <ArrowDown className="ml-1 h-3 w-3 text-primary" />
        );
    };

    const getScrapBadgeClass = (rate: number) => {
        if (rate > 5) return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
        if (rate > 2) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    };

    return (
        <div className="rounded-xl border bg-card shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="py-3 px-3.5 cursor-pointer hover:text-foreground" onClick={() => onSort("job_order_no")}>
                                <div className="flex items-center">
                                    <span>Job Order</span>
                                    {renderSortIcon("job_order_no")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 cursor-pointer hover:text-foreground" onClick={() => onSort("product_name")}>
                                <div className="flex items-center">
                                    <span>Product</span>
                                    {renderSortIcon("product_name")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 cursor-pointer hover:text-foreground" onClick={() => onSort("branch_name")}>
                                <div className="flex items-center">
                                    <span>Branch</span>
                                    {renderSortIcon("branch_name")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 text-right cursor-pointer hover:text-foreground" onClick={() => onSort("actual_quantity_produced")}>
                                <div className="flex items-center justify-end">
                                    <span>Produced</span>
                                    {renderSortIcon("actual_quantity_produced")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 text-right cursor-pointer hover:text-foreground" onClick={() => onSort("scrap_quantity")}>
                                <div className="flex items-center justify-end">
                                    <span>Scrap Qty</span>
                                    {renderSortIcon("scrap_quantity")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 text-right cursor-pointer hover:text-foreground" onClick={() => onSort("scrap_rate_percentage")}>
                                <div className="flex items-center justify-end">
                                    <span>Scrap Rate</span>
                                    {renderSortIcon("scrap_rate_percentage")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 text-right cursor-pointer hover:text-foreground" onClick={() => onSort("material_loss_php")}>
                                <div className="flex items-center justify-end">
                                    <span>Material Loss</span>
                                    {renderSortIcon("material_loss_php")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 text-right cursor-pointer hover:text-foreground" onClick={() => onSort("rework_hours")}>
                                <div className="flex items-center justify-end">
                                    <span>Rework Hrs</span>
                                    {renderSortIcon("rework_hours")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 cursor-pointer hover:text-foreground" onClick={() => onSort("top_defect_category")}>
                                <div className="flex items-center">
                                    <span>Defect Category</span>
                                    {renderSortIcon("top_defect_category")}
                                </div>
                            </th>
                            <th className="py-3 px-3.5 text-center">Status</th>
                            <th className="py-3 px-3.5 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={11} className="py-3.5 px-3.5">
                                        <div className="h-4 bg-muted rounded-md w-full"></div>
                                    </td>
                                </tr>
                            ))
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="py-12 text-center text-muted-foreground">
                                    <AlertCircle className="mx-auto h-8 w-8 mb-2 opacity-40" />
                                    <p className="text-sm font-medium">No Scrap or Rejection records match your filters.</p>
                                    <p className="text-xs text-muted-foreground/80 mt-0.5">Try clearing or adjusting search filters.</p>
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.job_order_id} className="hover:bg-muted/30 transition-colors">
                                    {/* JO No */}
                                    <td className="py-3 px-3.5 font-medium text-foreground whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                            <span>{row.job_order_no}</span>
                                            {row.is_rework_order && (
                                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                    <RotateCcw className="h-2.5 w-2.5" />
                                                    Rework
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Product */}
                                    <td className="py-3 px-3.5 max-w-[200px]">
                                        <div className="truncate font-medium text-foreground" title={row.product_name}>
                                            {row.product_name}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground truncate">{row.product_code}</div>
                                    </td>

                                    {/* Branch */}
                                    <td className="py-3 px-3.5 text-muted-foreground whitespace-nowrap">
                                        {row.branch_name}
                                    </td>

                                    {/* Produced Qty */}
                                    <td className="py-3 px-3.5 text-right font-medium text-foreground whitespace-nowrap">
                                        {row.actual_quantity_produced.toLocaleString()}
                                    </td>

                                    {/* Scrap Qty */}
                                    <td className="py-3 px-3.5 text-right font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                                        {row.scrap_quantity.toLocaleString()}
                                    </td>

                                    {/* Scrap Rate */}
                                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                        <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold border ${getScrapBadgeClass(row.scrap_rate_percentage)}`}>
                                            {row.scrap_rate_percentage.toFixed(1)}%
                                        </span>
                                    </td>

                                    {/* Material Loss */}
                                    <td className="py-3 px-3.5 text-right font-bold text-foreground whitespace-nowrap">
                                        {formatPHP(row.material_loss_php)}
                                    </td>

                                    {/* Rework Hours */}
                                    <td className="py-3 px-3.5 text-right text-muted-foreground whitespace-nowrap">
                                        {row.rework_hours > 0 ? (
                                            <span className="font-medium text-blue-600 dark:text-blue-400">
                                                {row.rework_hours.toFixed(1)} hrs
                                            </span>
                                        ) : (
                                            "—"
                                        )}
                                    </td>

                                    {/* Defect Category */}
                                    <td className="py-3 px-3.5 whitespace-nowrap">
                                        {row.top_defect_category ? (
                                            <div>
                                                <span className="font-medium text-foreground">{row.top_defect_category}</span>
                                                {row.top_rejection_reason && (
                                                    <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                                        {row.top_rejection_reason}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>

                                    {/* Status */}
                                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                        <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            {row.status}
                                        </span>
                                    </td>

                                    {/* Action */}
                                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onOpenBreakdown(row.job_order_id)}
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                            title="View Scrap & Rework Breakdown"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} records</span>
                    <select
                        aria-label="Records per page"
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        className="h-7 rounded border bg-background px-2 text-xs text-foreground focus:outline-hidden"
                    >
                        <option value={10}>10 / page</option>
                        <option value={15}>15 / page</option>
                        <option value={25}>25 / page</option>
                        <option value={50}>50 / page</option>
                    </select>
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        className="h-7 px-2 text-xs"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        <span className="sr-only">Previous Page</span>
                    </Button>
                    <span className="px-2 font-medium text-foreground">
                        Page {page} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="h-7 px-2 text-xs"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span className="sr-only">Next Page</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
