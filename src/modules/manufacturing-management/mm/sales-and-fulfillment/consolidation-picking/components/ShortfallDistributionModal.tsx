"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
    AlertTriangle,
    CheckCircle2,
    FileText,
    Loader2,
    Package,
    User,
    Wand2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { InvoiceConsolidation, OrderDistributionItem } from "../../shared/consolidation-types";

export interface ShortfallProductOrder {
    invoiceNo: string;
    customerName: string;
    quantity: number;
    orderId?: number;
    invoiceId?: number;
    orderDate?: string;
}

export interface ShortfallProductItem {
    productId: number;
    productName: string;
    productCode: string;
    unit: string;
    totalOrdered: number;
    totalPicked: number;
    orders: ShortfallProductOrder[];
}

interface Props {
    isOpen: boolean;
    batch: InvoiceConsolidation | null;
    products: ShortfallProductItem[];
    onClose: () => void;
    onConfirm: (distributions: OrderDistributionItem[]) => Promise<void>;
    isSubmitting: boolean;
}

export default function ShortfallDistributionModal({
    isOpen,
    batch,
    products,
    onClose,
    onConfirm,
    isSubmitting,
}: Props) {
    // Map of `${productId}:${orderIdentifier}` -> allocatedQty
    // orderIdentifier is orderId or invoiceNo
    const [allocations, setAllocations] = useState<Record<string, number>>({});

    // Filter down to products that have a shortfall (totalPicked < totalOrdered)
    const shortfallProducts = useMemo(() => {
        return products.filter((p) => p.totalPicked < p.totalOrdered);
    }, [products]);

    // Initialize allocations using default First-In, First-Served (FIFS)
    const computeFifsAllocations = () => {
        const initial: Record<string, number> = {};

        for (const prod of products) {
            let budget = Math.max(0, prod.totalPicked);
            // Sort orders: oldest orderDate first, then invoiceNo
            const sortedOrders = [...prod.orders].sort((a, b) => {
                const dateA = new Date(a.orderDate || 0).getTime();
                const dateB = new Date(b.orderDate || 0).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return (a.orderId || 0) - (b.orderId || 0);
            });

            for (const ord of sortedOrders) {
                const ordKey = ord.orderId ? String(ord.orderId) : ord.invoiceNo;
                const key = `${prod.productId}:${ordKey}`;
                const needed = Number(ord.quantity || 0);
                const assigned = Math.min(budget, needed);
                initial[key] = assigned;
                budget = Math.max(0, budget - assigned);
            }
        }

        return initial;
    };

    useEffect(() => {
        if (isOpen) {
            setAllocations(computeFifsAllocations());
        }
    }, [isOpen, products]);

    const handleResetToFifs = () => {
        setAllocations(computeFifsAllocations());
    };

    const handleQtyChange = (productId: number, ordKey: string, maxDemanded: number, valStr: string) => {
        const parsed = Math.max(0, Math.min(maxDemanded, Number(valStr) || 0));
        setAllocations((prev) => ({
            ...prev,
            [`${productId}:${ordKey}`]: parsed,
        }));
    };

    // Calculate product level distribution stats
    const productStats = useMemo(() => {
        return shortfallProducts.map((prod) => {
            let allocatedSum = 0;
            for (const ord of prod.orders) {
                const ordKey = ord.orderId ? String(ord.orderId) : ord.invoiceNo;
                allocatedSum += Number(allocations[`${prod.productId}:${ordKey}`] || 0);
            }
            const remainingToAllocate = prod.totalPicked - allocatedSum;
            const isValid = allocatedSum === prod.totalPicked;
            const isOver = allocatedSum > prod.totalPicked;
            const isUnder = allocatedSum < prod.totalPicked;

            return {
                ...prod,
                allocatedSum,
                remainingToAllocate,
                isValid,
                isOver,
                isUnder,
            };
        });
    }, [shortfallProducts, allocations]);

    // Form validity: All shortfall products must have exactly sum(allocations) === totalPicked
    const isAllValid = useMemo(() => {
        if (productStats.length === 0) return true;
        return productStats.every((p) => p.isValid);
    }, [productStats]);

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAllValid || isSubmitting) return;

        // Build list of OrderDistributionItem for backend
        const distributionItems: OrderDistributionItem[] = [];

        for (const prod of products) {
            for (const ord of prod.orders) {
                const ordKey = ord.orderId ? String(ord.orderId) : ord.invoiceNo;
                const qty = Number(allocations[`${prod.productId}:${ordKey}`] || 0);
                const orderIdNum = ord.orderId || Number(ord.invoiceNo.replace(/\D/g, "")) || 0;

                distributionItems.push({
                    orderId: orderIdNum,
                    invoiceId: ord.invoiceId || orderIdNum,
                    productId: prod.productId,
                    pickedQuantity: qty,
                });
            }
        }

        await onConfirm(distributionItems);
    };

    if (!isOpen || !batch) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw] sm:max-w-4xl lg:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border bg-background shadow-2xl">
                {/* Header */}
                <DialogHeader className="p-5 border-b bg-card shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold tracking-tight">
                                    Shortfall Distribution & Allocation
                                </DialogTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Physical stock is short for batch <span className="font-mono font-bold text-foreground">{batch.consolidatorNo}</span>. Specify how picked items are distributed to linked orders.
                                </p>
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleResetToFifs}
                            className="h-8 gap-1.5 text-xs font-semibold rounded-lg shrink-0 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
                        >
                            <Wand2 className="h-3.5 w-3.5" />
                            Auto-Distribute (FIFS)
                        </Button>
                    </div>
                </DialogHeader>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {shortfallProducts.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                            <p className="text-sm font-semibold">No shortages detected</p>
                            <p className="text-xs">All items are 100% picked across the consolidation batch.</p>
                        </div>
                    ) : (
                        productStats.map((stat, idx) => (
                            <motion.div
                                key={stat.productId}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04, duration: 0.2 }}
                                className={`rounded-xl border p-4 shadow-xs transition-all ${
                                    stat.isValid
                                        ? "border-border bg-card"
                                        : "border-amber-500/50 bg-amber-500/5"
                                }`}
                            >
                                {/* SKU Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/50">
                                    <div className="flex items-center gap-2.5">
                                        <Package className="h-4 w-4 text-primary shrink-0" />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-foreground">
                                                    {stat.productName}
                                                </span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    ({stat.productCode})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                <span>Total Demanded: <strong>{stat.totalOrdered} {stat.unit}</strong></span>
                                                <span>•</span>
                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                    Picked Available: {stat.totalPicked} {stat.unit}
                                                </span>
                                                <span>•</span>
                                                <span className="font-bold text-rose-600 dark:text-rose-400">
                                                    Shortfall: {stat.totalOrdered - stat.totalPicked} {stat.unit}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Balance Indicator */}
                                    <div className="flex items-center gap-2 self-end sm:self-center">
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                                            stat.isValid
                                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                                : stat.isOver
                                                ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                        }`}>
                                            Allocated: {stat.allocatedSum} / {stat.totalPicked} {stat.unit}
                                            {stat.isOver && ` (Over by ${stat.allocatedSum - stat.totalPicked})`}
                                            {stat.isUnder && ` (${stat.totalPicked - stat.allocatedSum} unassigned)`}
                                        </span>
                                    </div>
                                </div>

                                {/* Order Breakdown Table */}
                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead>
                                            <tr className="text-muted-foreground border-b border-border/40 text-[10.5px] uppercase tracking-wider">
                                                <th className="py-2 px-2.5 font-bold">Sales Order / Customer</th>
                                                <th className="py-2 px-2.5 font-bold">Demanded</th>
                                                <th className="py-2 px-2.5 font-bold text-right w-36">Allocated Picked</th>
                                                <th className="py-2 px-2.5 font-bold text-right">Order Shortfall</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/30">
                                            {stat.orders.map((ord, ordIdx) => {
                                                const ordKey = ord.orderId ? String(ord.orderId) : ord.invoiceNo;
                                                const allocKey = `${stat.productId}:${ordKey}`;
                                                const currentAlloc = allocations[allocKey] ?? 0;
                                                const orderShortfall = Math.max(0, ord.quantity - currentAlloc);

                                                return (
                                                    <tr key={ordKey} className="hover:bg-muted/20 transition-colors">
                                                        <td className="py-2.5 px-2.5">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-1.5">
                                                                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                                                                    <span className="font-mono font-bold text-foreground">
                                                                        {ord.invoiceNo}
                                                                    </span>
                                                                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-semibold">
                                                                        Priority #{ordIdx + 1}
                                                                    </Badge>
                                                                </div>
                                                                <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                                    <User className="h-3 w-3" />
                                                                    {ord.customerName}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-2.5 font-semibold text-foreground">
                                                            {ord.quantity} {stat.unit}
                                                        </td>
                                                        <td className="py-2.5 px-2.5 text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <Input
                                                                    type="number"
                                                                    min={0}
                                                                    max={ord.quantity}
                                                                    value={currentAlloc}
                                                                    onChange={(e) =>
                                                                        handleQtyChange(stat.productId, ordKey, ord.quantity, e.target.value)
                                                                    }
                                                                    className="h-8 w-20 text-center font-bold text-xs bg-background rounded-lg font-mono"
                                                                />
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        // Max fill based on available remaining budget
                                                                        const needed = ord.quantity;
                                                                        const otherAllocated = stat.allocatedSum - currentAlloc;
                                                                        const availableForThis = Math.max(0, stat.totalPicked - otherAllocated);
                                                                        const fillAmt = Math.min(needed, availableForThis);
                                                                        handleQtyChange(stat.productId, ordKey, ord.quantity, String(fillAmt));
                                                                    }}
                                                                    className="h-7 px-1.5 text-[10px] font-bold text-primary hover:bg-primary/10 cursor-pointer"
                                                                >
                                                                    Max
                                                                </Button>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-2.5 text-right font-mono font-semibold">
                                                            {orderShortfall > 0 ? (
                                                                <span className="text-rose-600 dark:text-rose-400 font-bold">
                                                                    -{orderShortfall} {stat.unit}
                                                                </span>
                                                            ) : (
                                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                                                    Fulfilled
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <DialogFooter className="p-4 border-t bg-card flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-muted-foreground">
                        {isAllValid ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                                <CheckCircle2 className="h-4 w-4" /> All picked units accurately balanced across orders.
                            </span>
                        ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4" /> Please resolve unassigned or overallocated picked quantities before confirming.
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="rounded-xl font-bold cursor-pointer"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleFormSubmit}
                            disabled={!isAllValid || isSubmitting}
                            className="rounded-xl font-black px-5 uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 cursor-pointer shadow-sm"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                    Submitting...
                                </>
                            ) : (
                                "Confirm & Complete Picking"
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
