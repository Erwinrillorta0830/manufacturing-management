"use client";

import React, { useState } from "react";
import {
    ContributionMarginRow,
    CategoryLineSummary,
    BrandLineSummary,
    MarginStatus
} from "../types/contribution-margin.types";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ChevronLeft, ChevronRight, Package, Tag, Layers } from "lucide-react";

interface ContributionMarginTableViewProps {
    rows: ContributionMarginRow[];
    categorySummaries: CategoryLineSummary[];
    brandSummaries: BrandLineSummary[];
    activeTab: "sku" | "category" | "brand";
    onTabChange: (tab: "sku" | "category" | "brand") => void;
}

export function ContributionMarginTableView({
    rows,
    categorySummaries,
    brandSummaries,
    activeTab,
    onTabChange
}: ContributionMarginTableViewProps) {
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [sortField, setSortField] = useState<string>("net_sales_revenue");
    const [sortAsc, setSortAsc] = useState<boolean>(false);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(false);
        }
    };

    const renderStatusBadge = (status: MarginStatus, ratio: number) => {
        switch (status) {
            case "high":
                return (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {ratio.toFixed(1)}% (High)
                    </span>
                );
            case "healthy":
                return (
                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {ratio.toFixed(1)}% (Healthy)
                    </span>
                );
            case "moderate":
                return (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {ratio.toFixed(1)}% (Moderate)
                    </span>
                );
            case "low":
                return (
                    <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400">
                        {ratio.toFixed(1)}% (Low)
                    </span>
                );
            case "negative":
            default:
                return (
                    <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                        {ratio.toFixed(1)}% (Negative)
                    </span>
                );
        }
    };

    // Sort SKU Rows
    const sortedRows = [...rows].sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[sortField] ?? 0;
        const bVal = (b as unknown as Record<string, unknown>)[sortField] ?? 0;
        if (typeof aVal === "string") {
            return sortAsc ? aVal.localeCompare(String(bVal)) : String(bVal).localeCompare(aVal);
        }
        return sortAsc ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const paginatedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="rounded-xl border bg-card shadow-2xs overflow-hidden">
            {/* Table View Tab Header */}
            <div className="flex flex-wrap items-center justify-between border-b p-3.5 bg-muted/20 gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-muted rounded-lg">
                    <button
                        type="button"
                        onClick={() => { onTabChange("sku"); setPage(1); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            activeTab === "sku"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Package className="h-3.5 w-3.5" />
                        <span>By Product / SKU ({rows.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { onTabChange("category"); setPage(1); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            activeTab === "category"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Layers className="h-3.5 w-3.5" />
                        <span>By Category Line ({categorySummaries.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { onTabChange("brand"); setPage(1); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            activeTab === "brand"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Tag className="h-3.5 w-3.5" />
                        <span>By Brand Line ({brandSummaries.length})</span>
                    </button>
                </div>

                <div className="text-xs text-muted-foreground">
                    Showing {activeTab === "sku" ? `${paginatedRows.length} of ${rows.length} records` : activeTab === "category" ? `${categorySummaries.length} lines` : `${brandSummaries.length} brands`}
                </div>
            </div>

            {/* TAB 1: BY PRODUCT / SKU VIEW */}
            {activeTab === "sku" && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                <th className="p-3">
                                    <button type="button" onClick={() => handleSort("product_code")} className="flex items-center gap-1 hover:text-foreground">
                                        <span>Product / SKU</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3">Category / Brand</th>
                                <th className="p-3 text-right">
                                    <button type="button" onClick={() => handleSort("invoiced_quantity")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                                        <span>Qty Sold</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3 text-right">
                                    <button type="button" onClick={() => handleSort("average_selling_price")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                                        <span>Avg Price</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3 text-right">
                                    <button type="button" onClick={() => handleSort("net_sales_revenue")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                                        <span>Net Sales</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3 text-right">
                                    <button type="button" onClick={() => handleSort("unit_manufacturing_cost")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                                        <span>Unit TMC</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3 text-right">
                                    <button type="button" onClick={() => handleSort("total_manufacturing_cost")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                                        <span>Total TMC (PHP)</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3 text-right">
                                    <button type="button" onClick={() => handleSort("unit_contribution_margin")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                                        <span>Unit CM</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3 text-right">
                                    <button type="button" onClick={() => handleSort("contribution_margin_amount")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                                        <span>Total CM (PHP)</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                                <th className="p-3 text-center">
                                    <button type="button" onClick={() => handleSort("contribution_margin_ratio")} className="flex items-center gap-1 mx-auto hover:text-foreground">
                                        <span>CM Ratio (%)</span>
                                        <ArrowUpDown className="h-3 w-3" />
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                                        No paid sales records found matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                paginatedRows.map((row) => (
                                    <tr key={row.product_id} className="hover:bg-muted/20 transition-colors">
                                        <td className="p-3">
                                            <div className="font-semibold text-foreground">{row.product_name}</div>
                                            <div className="text-[11px] text-muted-foreground">{row.product_code}</div>
                                        </td>
                                        <td className="p-3">
                                            <div className="text-foreground">{row.category_name}</div>
                                            <div className="text-[11px] text-muted-foreground">{row.brand_name}</div>
                                        </td>
                                        <td className="p-3 text-right font-medium">
                                            {formatNumber(row.invoiced_quantity)} {row.uom_name}
                                        </td>
                                        <td className="p-3 text-right font-medium">
                                            {formatCurrency(row.average_selling_price)}
                                        </td>
                                        <td className="p-3 text-right font-bold text-foreground">
                                            {formatCurrency(row.net_sales_revenue)}
                                        </td>
                                        <td className="p-3 text-right font-medium text-amber-600 dark:text-amber-400">
                                            {formatCurrency(row.unit_manufacturing_cost)}
                                        </td>
                                        <td className="p-3 text-right font-medium text-amber-600 dark:text-amber-400">
                                            {formatCurrency(row.total_manufacturing_cost)}
                                        </td>
                                        <td className={`p-3 text-right font-semibold ${row.unit_contribution_margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                            {formatCurrency(row.unit_contribution_margin)}
                                        </td>
                                        <td className={`p-3 text-right font-bold ${row.contribution_margin_amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                            {formatCurrency(row.contribution_margin_amount)}
                                        </td>
                                        <td className="p-3 text-center">
                                            {renderStatusBadge(row.margin_status, row.contribution_margin_ratio)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 2: BY CATEGORY LINE VIEW */}
            {activeTab === "category" && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                <th className="p-3">Category Line</th>
                                <th className="p-3 text-center">SKUs Count</th>
                                <th className="p-3 text-right">Units Sold</th>
                                <th className="p-3 text-right">Net Sales Revenue</th>
                                <th className="p-3 text-right">Total Manufacturing Cost (TMC)</th>
                                <th className="p-3 text-right">Contribution Margin ($)</th>
                                <th className="p-3 text-center">CM Ratio (%)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {categorySummaries.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                        No categories found.
                                    </td>
                                </tr>
                            ) : (
                                categorySummaries.map((cat) => (
                                    <tr key={cat.category_name} className="hover:bg-muted/20 transition-colors">
                                        <td className="p-3 font-semibold text-foreground">
                                            {cat.category_name}
                                        </td>
                                        <td className="p-3 text-center font-medium">
                                            {cat.skus_count}
                                        </td>
                                        <td className="p-3 text-right">
                                            {formatNumber(cat.total_quantity_sold)}
                                        </td>
                                        <td className="p-3 text-right font-bold text-foreground">
                                            {formatCurrency(cat.net_sales_revenue)}
                                        </td>
                                        <td className="p-3 text-right font-medium text-amber-600 dark:text-amber-400">
                                            {formatCurrency(cat.total_manufacturing_cost)}
                                        </td>
                                        <td className={`p-3 text-right font-bold ${cat.contribution_margin_amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                            {formatCurrency(cat.contribution_margin_amount)}
                                        </td>
                                        <td className="p-3 text-center">
                                            {renderStatusBadge(cat.margin_status, cat.contribution_margin_ratio)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 3: BY BRAND LINE VIEW */}
            {activeTab === "brand" && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                <th className="p-3">Brand Line</th>
                                <th className="p-3 text-center">SKUs Count</th>
                                <th className="p-3 text-right">Units Sold</th>
                                <th className="p-3 text-right">Net Sales Revenue</th>
                                <th className="p-3 text-right">Total Manufacturing Cost (TMC)</th>
                                <th className="p-3 text-right">Contribution Margin ($)</th>
                                <th className="p-3 text-center">CM Ratio (%)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {brandSummaries.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                        No brands found.
                                    </td>
                                </tr>
                            ) : (
                                brandSummaries.map((b) => (
                                    <tr key={b.brand_name} className="hover:bg-muted/20 transition-colors">
                                        <td className="p-3 font-semibold text-foreground">
                                            {b.brand_name}
                                        </td>
                                        <td className="p-3 text-center font-medium">
                                            {b.skus_count}
                                        </td>
                                        <td className="p-3 text-right">
                                            {formatNumber(b.total_quantity_sold)}
                                        </td>
                                        <td className="p-3 text-right font-bold text-foreground">
                                            {formatCurrency(b.net_sales_revenue)}
                                        </td>
                                        <td className="p-3 text-right font-medium text-amber-600 dark:text-amber-400">
                                            {formatCurrency(b.total_manufacturing_cost)}
                                        </td>
                                        <td className={`p-3 text-right font-bold ${b.contribution_margin_amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                            {formatCurrency(b.contribution_margin_amount)}
                                        </td>
                                        <td className="p-3 text-center">
                                            {renderStatusBadge(b.margin_status, b.contribution_margin_ratio)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination Controls for SKU View */}
            {activeTab === "sku" && totalPages > 1 && (
                <div className="flex items-center justify-between border-t p-3 bg-muted/10 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span>Rows per page:</span>
                        <select
                            aria-label="Rows per page"
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                            className="h-7 rounded border bg-background px-2 text-xs"
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span>Page {page} of {totalPages}</span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="h-7 w-7 p-0"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="h-7 w-7 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
