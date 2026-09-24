"use client";

import React from "react";
import { JobOrderProfitabilityRow, MarginStatus } from "../types";
import { ArrowUpDown, ChevronLeft, ChevronRight, Eye, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfitabilityTableViewProps {
    rows: JobOrderProfitabilityRow[];
    totalCount: number;
    isLoading: boolean;
    page: number;
    pageSize: number;
    sortField: keyof JobOrderProfitabilityRow;
    sortDirection: "asc" | "desc";
    onSort: (field: keyof JobOrderProfitabilityRow) => void;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onOpenBreakdown: (jobOrderId: number) => void;
}

export function ProfitabilityTableView({
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
}: ProfitabilityTableViewProps) {
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    const fmt = (val: number | null | undefined): string => {
        return "₱" + (val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const renderMarginBadge = (marginPercent: number, status: MarginStatus) => {
        let badgeStyle = "bg-muted text-muted-foreground border-border";
        let barColor = "bg-muted-foreground";

        if (status === "high") {
            badgeStyle = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
            barColor = "bg-emerald-500";
        } else if (status === "healthy") {
            badgeStyle = "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
            barColor = "bg-teal-500";
        } else if (status === "moderate") {
            badgeStyle = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
            barColor = "bg-blue-500";
        } else if (status === "low") {
            badgeStyle = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
            barColor = "bg-amber-500";
        } else if (status === "negative") {
            badgeStyle = "bg-destructive/10 text-destructive border-destructive/20 font-bold";
            barColor = "bg-destructive";
        }

        const clampedBarWidth = Math.max(0, Math.min(100, Math.abs(marginPercent)));

        return (
            <div className="space-y-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badgeStyle}`}>
                    {marginPercent.toFixed(1)}%
                </span>
                <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${barColor}`} style={{ width: `${clampedBarWidth}%` }} />
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-3 rounded-xl border bg-card shadow-2xs">
            {/* Table Container */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground">
                        <tr>
                            <th className="py-3 px-3.5">
                                <button
                                    type="button"
                                    onClick={() => onSort("job_order_id")}
                                    className={`flex items-center gap-1 hover:text-foreground ${sortField === "job_order_id" ? "text-foreground font-bold" : ""}`}
                                >
                                    <span>Job Order</span>
                                    <ArrowUpDown className={`h-3 w-3 ${sortField === "job_order_id" ? (sortDirection === "asc" ? "text-primary rotate-180" : "text-primary") : "opacity-40"}`} />
                                </button>
                            </th>
                            <th className="py-3 px-3.5">Finished Good / Product</th>
                            <th className="py-3 px-3.5 text-right">Target Qty</th>
                            <th className="py-3 px-3.5 text-right">Produced Qty</th>
                            <th className="py-3 px-3.5 text-right">Selling Price</th>
                            <th className="py-3 px-3.5 text-right">
                                <button
                                    type="button"
                                    onClick={() => onSort("total_cogs")}
                                    className={`flex items-center gap-1 ml-auto hover:text-foreground ${sortField === "total_cogs" ? "text-foreground font-bold" : ""}`}
                                >
                                    <span>Total Manufacturing Cost (TMC)</span>
                                    <ArrowUpDown className={`h-3 w-3 ${sortField === "total_cogs" ? (sortDirection === "asc" ? "text-primary rotate-180" : "text-primary") : "opacity-40"}`} />
                                </button>
                            </th>
                            <th className="py-3 px-3.5 text-right">
                                <button
                                    type="button"
                                    onClick={() => onSort("gross_profit")}
                                    className={`flex items-center gap-1 ml-auto hover:text-foreground ${sortField === "gross_profit" ? "text-foreground font-bold" : ""}`}
                                >
                                    <span>Gross Profit</span>
                                    <ArrowUpDown className={`h-3 w-3 ${sortField === "gross_profit" ? (sortDirection === "asc" ? "text-primary rotate-180" : "text-primary") : "opacity-40"}`} />
                                </button>
                            </th>
                            <th className="py-3 px-3.5">
                                <button
                                    type="button"
                                    onClick={() => onSort("gross_margin_percent")}
                                    className={`flex items-center gap-1 hover:text-foreground ${sortField === "gross_margin_percent" ? "text-foreground font-bold" : ""}`}
                                >
                                    <span>Gross Margin (%)</span>
                                    <ArrowUpDown className={`h-3 w-3 ${sortField === "gross_margin_percent" ? (sortDirection === "asc" ? "text-primary rotate-180" : "text-primary") : "opacity-40"}`} />
                                </button>
                            </th>
                            <th className="py-3 px-3.5 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isLoading ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        <span className="text-xs">Calculating manufacturing margins &amp; job order costs...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-1.5">
                                        <Layers className="h-8 w-8 text-muted-foreground/40" />
                                        <span className="text-sm font-semibold text-foreground">No Closed Job Orders Found</span>
                                        <span className="text-xs">Only closed job orders with recorded production are included.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => {
                                const isNegative = row.gross_profit < 0;
                                return (
                                    <tr
                                        key={row.job_order_id}
                                        className="hover:bg-muted/30 transition-colors group"
                                    >
                                        {/* Job Order Number & Date */}
                                        <td className="py-3 px-3.5">
                                            <div className="font-semibold text-foreground">{row.job_order_no}</div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {row.start_date || "No start date"}
                                            </div>
                                        </td>

                                        {/* Product */}
                                        <td className="py-3 px-3.5 max-w-[200px]">
                                            <div className="font-medium text-foreground truncate" title={row.product_name}>
                                                {row.product_name}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {row.product_code}
                                                {row.sales_order_no && ` • SO #${row.sales_order_no}`}
                                            </div>
                                        </td>

                                        {/* Target Qty */}
                                        <td className="py-3 px-3.5 text-right font-mono font-medium text-foreground">
                                            {row.target_quantity.toLocaleString()}
                                        </td>

                                        {/* Produced Qty */}
                                        <td className="py-3 px-3.5 text-right font-mono">
                                            <div className="font-semibold text-foreground">
                                                {row.actual_quantity_produced.toLocaleString()}
                                            </div>
                                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                                {row.yield_efficiency_percent.toFixed(1)}% yield
                                            </div>
                                        </td>

                                        {/* Unit Selling Price */}
                                        <td className="py-3 px-3.5 text-right font-mono font-semibold text-foreground">
                                            {fmt(row.sales_unit_price)}
                                        </td>

                                        {/* Total Manufacturing Cost (TMC / COGS) with DM / DL / OH Breakdown */}
                                        <td className="py-3 px-3.5 text-right font-mono">
                                            <div className="flex items-center justify-end gap-1.5 font-bold text-foreground">
                                                <span>{fmt(row.total_cogs)}</span>
                                                <span className="text-[10px] text-muted-foreground font-normal">
                                                    ({fmt(row.unit_cogs)}/u)
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                <span title="Direct Materials" className="text-indigo-600 dark:text-indigo-400 font-medium">
                                                    DM: {fmt(row.direct_materials_cost)}
                                                </span>
                                                <span>•</span>
                                                <span title="Direct Labor" className="text-amber-600 dark:text-amber-400 font-medium">
                                                    DL: {fmt(row.direct_labor_cost)}
                                                </span>
                                                <span>•</span>
                                                <span title="Workstation Overhead" className="text-teal-600 dark:text-teal-400 font-medium">
                                                    OH: {fmt(row.overhead_cost)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Gross Profit */}
                                        <td className={`py-3 px-3.5 text-right font-mono font-bold ${isNegative ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                                            {fmt(row.gross_profit)}
                                        </td>

                                        {/* Gross Margin */}
                                        <td className="py-3 px-3.5">
                                            {renderMarginBadge(row.gross_margin_percent, row.margin_status)}
                                        </td>

                                        {/* Action */}
                                        <td className="py-3 px-3.5 text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onOpenBreakdown(row.job_order_id)}
                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                title="View detailed cost breakdown"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 py-3 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <select
                        aria-label="Rows per page"
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        className="h-7 rounded-md border bg-background px-2 text-xs text-foreground focus:outline-hidden"
                    >
                        <option value={10}>10</option>
                        <option value={15}>15</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                    </select>
                    <span>
                        Showing {rows.length > 0 ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, totalCount)} of {totalCount}
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        className="h-7 w-7 p-0"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-2 font-medium text-foreground">
                        Page {page} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="h-7 w-7 p-0"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
