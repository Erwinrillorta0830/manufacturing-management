"use client";

import React from "react";
import { Calendar, AlertCircle, Clock, MapPin, Tag, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InventoryReportProduct } from "../types";

interface BatchBreakdownRowProps {
    product: InventoryReportProduct;
}

export function BatchBreakdownRow({ product }: BatchBreakdownRowProps) {
    const isPackaging = product.productTypeId === 390;
    const batches = product.batches || [];

    const getDaysRemaining = (expDateStr: string | null) => {
        if (!expDateStr) return null;
        const exp = new Date(expDateStr);
        const today = new Date();
        const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diff;
    };

    return (
        <div className="p-3.5 bg-muted/20 border-t border-b border-border/60 animate-in fade-in duration-150">
            {/* Branch-Level Deficit Breakdown (Option A: Per-Branch Allocation) */}
            {product.branchStock && product.branchStock.length > 1 && (
                <div className="mb-3 p-2.5 rounded-lg border bg-background/70 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                        <span className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-primary" />
                            Active Branch Stock & Deficit Allocation
                        </span>
                        <span className="font-mono text-[10px] normal-case text-muted-foreground">
                            Target: {product.maintainingQuantity.toLocaleString()} {product.uomShortcut} / active branch
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {product.branchStock.map((b) => {
                            const isOOS = b.isOutOfStock;
                            const isLow = b.isBelowMaintaining;
                            return (
                                <div
                                    key={b.branchId}
                                    className={`p-2 rounded-md border text-xs flex flex-col gap-1 transition-colors ${
                                        isOOS
                                            ? "bg-rose-500/5 border-rose-500/30"
                                            : isLow
                                            ? "bg-amber-500/5 border-amber-500/30"
                                            : "bg-muted/20 border-border/60"
                                    }`}
                                >
                                    <div className="flex items-center justify-between font-semibold">
                                        <span className="truncate" title={b.branchName}>{b.branchName}</span>
                                        {isOOS ? (
                                            <Badge className="text-[9px] px-1 py-0 bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30">
                                                Out of Stock
                                            </Badge>
                                        ) : isLow ? (
                                            <Badge className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                                Deficit: -{b.deficitQuantity.toLocaleString()}
                                            </Badge>
                                        ) : (
                                            <Badge className="text-[9px] px-1 py-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                                Healthy
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                                        <span>On-Hand: <strong className="text-foreground">{b.onhandQuantity.toLocaleString()}</strong></span>
                                        {b.deficitQuantity > 0 && (
                                            <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                                Need: {b.deficitQuantity.toLocaleString()} {product.uomShortcut}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-primary" />
                        Active Batch Stock Breakdown
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono px-2 py-0 border-primary/30 text-primary">
                        {isPackaging ? "Rule: FIFO (Packaging)" : "Rule: FEFO (First Expired, First Out)"}
                    </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                    {batches.length} {batches.length === 1 ? "Batch" : "Batches"} registered
                </span>
            </div>

            {batches.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground bg-background/50 rounded-lg border border-dashed">
                    No active movement batches recorded for this item.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border bg-card/60 shadow-2xs">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground text-[11px]">
                                <th className="text-left font-medium py-2 px-3">Batch No</th>
                                <th className="text-left font-medium py-2 px-3">Storage Location / Lot</th>
                                <th className="text-left font-medium py-2 px-3">Condition</th>
                                <th className="text-left font-medium py-2 px-3">Mfg Date</th>
                                <th className="text-left font-medium py-2 px-3">Expiration Date</th>
                                <th className="text-right font-medium py-2 px-3">Batch Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono">
                            {batches.map((batch, idx) => {
                                const daysRemaining = getDaysRemaining(batch.expirationDate);
                                const isExpired = daysRemaining !== null && daysRemaining <= 0;
                                const isNearExpiry = daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 60;

                                return (
                                    <tr
                                        key={`${batch.batchNo}-${batch.lotId ?? 'nolot'}-${batch.branchId}-${idx}`}
                                        className={`hover:bg-muted/30 transition-colors ${
                                            batch.isNegativeDiscrepancy ? "bg-rose-500/5 text-rose-700 dark:text-rose-400" : ""
                                        }`}
                                    >
                                        {/* Batch Number */}
                                        <td className="py-2 px-3 font-semibold font-mono text-foreground flex items-center gap-1.5">
                                            {batch.batchNo}
                                            {idx === 0 && !batch.isNegativeDiscrepancy && (
                                                <Badge className="text-[9px] px-1 py-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                                    {isPackaging ? "Next In" : "Next FEFO"}
                                                </Badge>
                                            )}
                                        </td>

                                        {/* Storage Location & Branch */}
                                        <td className="py-2 px-3 text-muted-foreground font-sans">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="flex items-center gap-1 font-medium text-foreground">
                                                    <MapPin className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                                                    {batch.lotName}
                                                </span>
                                                {batch.branchName && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Building2 className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                                                        {batch.branchName}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Condition */}
                                        <td className="py-2 px-3 font-sans">
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] uppercase font-semibold ${
                                                    batch.inventoryCondition.toLowerCase().includes("good") ||
                                                    batch.inventoryCondition.toLowerCase().includes("pass")
                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                                }`}
                                            >
                                                {batch.inventoryCondition}
                                            </Badge>
                                        </td>

                                        {/* Mfg Date */}
                                        <td className="py-2 px-3 text-muted-foreground">
                                            {batch.manufacturingDate ? (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3 text-muted-foreground/60" />
                                                    {batch.manufacturingDate}
                                                </span>
                                            ) : (
                                                "—"
                                            )}
                                        </td>

                                        {/* Expiration Date */}
                                        <td className="py-2 px-3">
                                            {batch.expirationDate ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3 h-3 text-muted-foreground/60" />
                                                    <span>{batch.expirationDate}</span>
                                                    {isExpired ? (
                                                        <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                                            Expired
                                                        </Badge>
                                                    ) : isNearExpiry ? (
                                                        <Badge className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                                            {daysRemaining}d left
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground font-sans">
                                                            ({daysRemaining}d)
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                "—"
                                            )}
                                        </td>

                                        {/* Quantity */}
                                        <td className="py-2 px-3 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`font-semibold ${batch.isNegativeDiscrepancy ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                                                    {batch.onhandQuantity.toLocaleString()} {product.uomShortcut}
                                                </span>
                                                {batch.isNegativeDiscrepancy && (
                                                    <span className="text-[9px] text-rose-500 font-sans flex items-center gap-0.5">
                                                        <AlertCircle className="w-2.5 h-2.5" />
                                                        Discrepancy: Excluded
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
