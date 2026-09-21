"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
    AlertTriangle, PackageX, CheckCircle2, 
    HelpCircle, Package, Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { BatchBreakdownRow } from "./BatchBreakdownRow";
import { InventoryReportProduct, StockStatus } from "../types";

interface InventoryReportsTableProps {
    products: InventoryReportProduct[];
    loading: boolean;
    expandedProductIds: Set<number>;
    onToggleExpand: (productId: number) => void;
}

export function InventoryReportsTable({
    products,
    loading,
    expandedProductIds,
    onToggleExpand,
}: InventoryReportsTableProps) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [prevTotal, setPrevTotal] = useState(products.length);

    // Reset to page 1 during render whenever product count changes
    if (products.length !== prevTotal) {
        setPrevTotal(products.length);
        setPage(1);
    }

    const totalItems = products.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const paginatedProducts = products.slice(startIndex, endIndex);

    const getPageNumbers = () => {
        const pages: (number | "ellipsis")[] = [];
        const maxVisible = 5;

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            pages.push(1);

            if (currentPage > 3) {
                pages.push("ellipsis");
            }

            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (currentPage < totalPages - 2) {
                pages.push("ellipsis");
            }

            pages.push(totalPages);
        }

        return pages;
    };
    const getStatusBadge = (status: StockStatus, deficit: number) => {
        switch (status) {
            case "out_of_stock":
                return (
                    <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1">
                        <PackageX className="w-3 h-3" />
                        Out of Stock
                    </Badge>
                );
            case "low_stock":
                return (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Low Stock ({deficit > 0 ? `-${deficit.toLocaleString()}` : "At Limit"})
                    </Badge>
                );
            case "healthy":
                return (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Healthy Stock
                    </Badge>
                );
            case "zero_threshold":
            default:
                return (
                    <Badge variant="outline" className="text-muted-foreground border-border text-[11px] font-normal flex items-center gap-1">
                        <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
                        No Limit Set
                    </Badge>
                );
        }
    };

    const renderStockBar = (onHand: number, maintaining: number) => {
        if (maintaining <= 0) {
            return (
                <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-[10px] text-muted-foreground font-mono">No threshold</span>
                </div>
            );
        }

        const ratio = (onHand / maintaining) * 100;
        const clamped = Math.min(100, Math.max(0, ratio));

        let barColor = "bg-emerald-500";
        if (ratio <= 0) barColor = "bg-rose-500";
        else if (ratio <= 50) barColor = "bg-rose-500";
        else if (ratio <= 100) barColor = "bg-amber-500";

        return (
            <div className="flex items-center gap-2 justify-end">
                <div className="bg-muted rounded-full h-1.5 w-16 overflow-hidden relative border border-border/60">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${clamped}%` }}
                    />
                </div>
                <span className="text-[10px] font-semibold font-mono text-muted-foreground w-10 text-right">
                    {ratio.toFixed(0)}%
                </span>
            </div>
        );
    };

    if (loading && products.length === 0) {
        return (
            <div className="rounded-xl border bg-card/60 shadow-xs overflow-hidden">
                <div className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4 py-2 border-b border-border/40 last:border-0">
                            <div className="h-4 w-4 bg-muted/60 animate-pulse rounded-md" />
                            <div className="space-y-1.5 flex-1">
                                <div className="h-4 w-48 bg-muted/60 animate-pulse rounded-md" />
                                <div className="h-3 w-28 bg-muted/40 animate-pulse rounded-md" />
                            </div>
                            <div className="h-4 w-16 bg-muted/50 animate-pulse rounded-md" />
                            <div className="h-4 w-20 bg-muted/50 animate-pulse rounded-md" />
                            <div className="h-6 w-24 bg-muted/50 animate-pulse rounded-md" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="rounded-xl border border-dashed p-12 text-center bg-card/40 flex flex-col items-center justify-center gap-2">
                <div className="p-3 rounded-full bg-muted/60 text-muted-foreground">
                    <Package className="w-8 h-8 stroke-1" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">No Products Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                    No items match the selected filter criteria. Try adjusting the search query or status filter.
                </p>
            </div>
        );
    }

    return (
        <div className={`relative rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs overflow-hidden transition-opacity duration-200 ${loading ? "opacity-60 pointer-events-none" : ""}`}>
            {loading && (
                <div className="absolute top-2.5 right-4 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/90 border border-border shadow-xs text-[11px] font-medium text-muted-foreground backdrop-blur-xs">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    <span>Updating...</span>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b bg-muted/30 text-muted-foreground text-[11px] tracking-wider uppercase font-semibold">
                            <th className="w-8 py-3 px-3"></th>
                            <th className="text-left py-3 px-3">Product / Details</th>
                            <th className="text-left py-3 px-3">Product Type</th>
                            <th className="text-right py-3 px-3">Live On-Hand</th>
                            <th className="text-right py-3 px-3">Maintaining Qty</th>
                            <th className="text-right py-3 px-3">Deficit</th>
                            <th className="text-right py-3 px-3">Stock Level</th>
                            <th className="text-center py-3 px-3">Stock Status</th>
                            <th className="text-right py-3 px-3">Est. Replenishment</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {paginatedProducts.map((product) => {
                            const isExpanded = expandedProductIds.has(product.productId);
                            const isCritical = product.stockStatus === "out_of_stock";
                            const isLow = product.stockStatus === "low_stock";

                            const formattedCost = new Intl.NumberFormat("en-PH", {
                                style: "currency",
                                currency: "PHP",
                                minimumFractionDigits: 2,
                            }).format(product.estimatedReplenishmentCost || 0);

                            return (
                                <React.Fragment key={product.productId}>
                                    <tr
                                        id={`product-row-${product.productId}`}
                                        className={`group hover:bg-muted/30 transition-colors scroll-mt-24 ${
                                            isCritical ? "bg-rose-500/[0.03]" : isLow ? "bg-amber-500/[0.02]" : ""
                                        }`}
                                    >
                                        {/* Expand Toggle */}
                                        <td className="py-2.5 px-3 text-center">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => onToggleExpand(product.productId)}
                                                className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
                                                title={isExpanded ? "Collapse batches" : "View batch details"}
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="w-4 h-4 text-primary" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4" />
                                                )}
                                            </Button>
                                        </td>

                                        {/* Product / Details */}
                                        <td className="py-2.5 px-3">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-semibold text-foreground text-xs leading-tight">
                                                    {product.productName}
                                                </span>
                                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] mt-0.5">
                                                    <span className="font-mono text-muted-foreground">
                                                        {product.productCode}
                                                    </span>
                                                    <span className="text-muted-foreground/40">•</span>
                                                    <span className="text-muted-foreground font-medium" title={product.categoryName}>
                                                        {product.categoryName}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">
                                                        {product.uomShortcut}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Product Type */}
                                        <td className="py-2.5 px-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                                product.productTypeId === 388
                                                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                                                    : product.productTypeId === 389
                                                    ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
                                                    : product.productTypeId === 390
                                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                                    : "bg-muted/40 text-muted-foreground border-border"
                                            }`}>
                                                {product.productTypeName || "Unspecified"}
                                            </span>
                                        </td>

                                        {/* Live On-Hand */}
                                        <td className="py-2.5 px-3 text-right font-mono">
                                            <div className="flex flex-col items-end">
                                                <span className={`font-semibold ${
                                                    product.onHandQuantity === 0
                                                        ? "text-rose-600 dark:text-rose-400 font-bold"
                                                        : product.isBelowMaintaining
                                                        ? "text-amber-600 dark:text-amber-400 font-semibold"
                                                        : "text-foreground"
                                                }`}>
                                                    {product.onHandQuantity.toLocaleString()}
                                                </span>
                                                {Boolean(product.expiredQuantity && product.expiredQuantity > 0) && (
                                                    <span 
                                                        className="text-[10px] text-rose-600 dark:text-rose-400 font-sans cursor-help"
                                                        title={`${product.expiredQuantity?.toLocaleString()} expired units in warehouse excluded from usable on-hand`}
                                                    >
                                                        +{product.expiredQuantity?.toLocaleString()} expired
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Maintaining Quantity */}
                                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                                            {product.maintainingQuantity > 0 ? (
                                                <span>{product.maintainingQuantity.toLocaleString()}</span>
                                            ) : (
                                                <span className="text-muted-foreground/60">—</span>
                                            )}
                                        </td>

                                        {/* Deficit Quantity */}
                                        <td className="py-2.5 px-3 text-right font-mono">
                                            {product.deficitQuantity > 0 ? (
                                                <span className="font-bold text-rose-600 dark:text-rose-400">
                                                    -{product.deficitQuantity.toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/60">0</span>
                                            )}
                                        </td>

                                        {/* Stock Level Bar */}
                                        <td className="py-2.5 px-3 text-right">
                                            {renderStockBar(product.onHandQuantity, product.maintainingQuantity)}
                                        </td>

                                        {/* Stock Status Badge */}
                                        <td className="py-2.5 px-3 text-center">
                                            {getStatusBadge(product.stockStatus, product.deficitQuantity)}
                                        </td>

                                        {/* Estimated Replenishment Cost */}
                                        <td className="py-2.5 px-3 text-right font-mono">
                                            {product.deficitQuantity > 0 && product.unitCost > 0 ? (
                                                <span className="text-foreground font-medium">
                                                    {formattedCost}
                                                </span>
                                            ) : product.deficitQuantity > 0 ? (
                                                <span 
                                                    className="inline-flex items-center text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20"
                                                    title="No unit cost or purchase price configured in Product Master data"
                                                >
                                                    No Cost Set
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/60">—</span>
                                            )}
                                        </td>
                                    </tr>

                                    {/* Expanded Batch Breakdown Subtable */}
                                    <AnimatePresence initial={false}>
                                        {isExpanded && (
                                            <tr key={`expanded-${product.productId}`} className="border-b border-border/60">
                                                <td colSpan={9} className="p-0 border-0">
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                                        className="overflow-hidden"
                                                    >
                                                        <BatchBreakdownRow product={product} />
                                                    </motion.div>
                                                </td>
                                            </tr>
                                        )}
                                    </AnimatePresence>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalItems > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span>
                            Showing <strong className="font-semibold text-foreground">{totalItems === 0 ? 0 : startIndex + 1}</strong> to{" "}
                            <strong className="font-semibold text-foreground">{endIndex}</strong> of{" "}
                            <strong className="font-semibold text-foreground">{totalItems.toLocaleString()}</strong> items
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Page Size Selector */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px]">Rows per page:</span>
                            <Select
                                value={String(pageSize)}
                                onValueChange={(val) => {
                                    setPageSize(Number(val));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-7 w-[68px] text-xs font-mono">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10" className="text-xs font-mono">10</SelectItem>
                                    <SelectItem value="25" className="text-xs font-mono">25</SelectItem>
                                    <SelectItem value="50" className="text-xs font-mono">50</SelectItem>
                                    <SelectItem value="100" className="text-xs font-mono">100</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Page Navigation Buttons */}
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={() => setPage(1)}
                                disabled={currentPage === 1}
                                title="First Page"
                            >
                                <ChevronsLeft className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                title="Previous Page"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </Button>

                            <div className="flex items-center gap-1 px-1">
                                {getPageNumbers().map((p, idx) =>
                                    p === "ellipsis" ? (
                                        <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground select-none">
                                            …
                                        </span>
                                    ) : (
                                        <Button
                                            key={`page-${p}`}
                                            variant={p === currentPage ? "default" : "outline"}
                                            size="icon"
                                            className={`h-7 w-7 text-xs font-mono ${
                                                p === currentPage ? "pointer-events-none font-bold shadow-xs" : ""
                                            }`}
                                            onClick={() => setPage(p)}
                                        >
                                            {p}
                                        </Button>
                                    )
                                )}
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                title="Next Page"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={() => setPage(totalPages)}
                                disabled={currentPage === totalPages}
                                title="Last Page"
                            >
                                <ChevronsRight className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
