"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
    ShieldCheck,
    CheckCircle2,
    Check,
    Calendar,
    Layers,
    Package,
    Search,
    Loader2,
    Building2,
    RotateCcw,
    AlertCircle,
    FileText,
} from "lucide-react";
import type { InvoiceConsolidation } from "../../shared/consolidation-types";
import {
    fetchConsolidationByNo,
    fetchAllocations,
    approveBatch,
    repickBatch,
    type LotAllocation,
} from "../../shared/consolidation-api";

interface ApprovalModalProps {
    batch: InvoiceConsolidation | null;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

function getLotOrderLabels(
    orders: Array<{ invoiceNo: string; customerName: string; quantity: number }>,
    allocations: LotAllocation[],
    allocIdx: number
): Array<{ orderNo: string; customer: string; qty: number }> {
    if (!orders || orders.length === 0) return [];

    let orderPos = 0;
    const orderIntervals = orders.map((o) => {
        const start = orderPos;
        const end = orderPos + Number(o.quantity || 0);
        orderPos = end;
        return { ...o, start, end };
    });

    let allocStart = 0;
    for (let i = 0; i < allocIdx; i++) {
        allocStart += Number(allocations[i]?.quantity || 0);
    }
    const allocQty = Number(allocations[allocIdx]?.quantity || 0);
    const allocEnd = allocStart + allocQty;

    const matched: Array<{ orderNo: string; customer: string; qty: number }> = [];
    for (const ord of orderIntervals) {
        const overlapStart = Math.max(allocStart, ord.start);
        const overlapEnd = Math.min(allocEnd, ord.end);
        if (overlapEnd > overlapStart) {
            matched.push({
                orderNo: ord.invoiceNo,
                customer: ord.customerName,
                qty: overlapEnd - overlapStart,
            });
        }
    }
    return matched;
}

export function ApprovalModal({
    batch,
    open,
    onClose,
    onSuccess,
}: ApprovalModalProps) {
    const [fullBatch, setFullBatch] = useState<InvoiceConsolidation | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [allocations, setAllocations] = useState<LotAllocation[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const [approvalStatus, setApprovalStatus] = useState<Record<number, boolean>>({});
    const [approving, setApproving] = useState(false);
    const [repicking, setRepicking] = useState(false);
    const [showRepickConfirm, setShowRepickConfirm] = useState(false);

    useEffect(() => {
        if (!open || !batch) {
            setFullBatch(null);
            setAllocations([]);
            setApprovalStatus({});
            setSearchQuery("");
            setShowRepickConfirm(false);
            return;
        }

        setLoadingDetails(true);
        fetchConsolidationByNo(batch.consolidatorNo)
            .then((res) => {
                setFullBatch(res);
                // Pre-mark all items as verified by default if all picked, or user can toggle
                const initialMap: Record<number, boolean> = {};
                for (const d of res?.details || []) {
                    initialMap[d.id] = true;
                }
                setApprovalStatus(initialMap);
            })
            .catch(() => {
                toast.error("Failed to load full batch details");
            })
            .finally(() => setLoadingDetails(false));

        fetchAllocations(batch.id)
            .then((allocs) => {
                setAllocations(allocs || []);
            })
            .catch(() => {});
    }, [batch, open]);

    const activeBatch = fullBatch || batch;

    // Group allocations by product
    const allocationsByProduct = useMemo(() => {
        const map = new Map<number, LotAllocation[]>();
        for (const a of allocations) {
            const list = map.get(a.productId) || [];
            list.push(a);
            map.set(a.productId, list);
        }
        return map;
    }, [allocations]);

    const consolidatedProducts = useMemo(() => {
        if (!activeBatch?.details) return [];

        const prodMap = new Map<number, {
            productId: number;
            productName: string;
            productCode: string;
            unit: string;
            totalOrdered: number;
            totalPicked: number;
            detailIds: number[];
            allocations: LotAllocation[];
            orders: Array<{
                invoiceNo: string;
                customerName: string;
                quantity: number;
            }>;
        }>();

        for (const d of activeBatch.details) {
            const pId = d.productId;
            if (!prodMap.has(pId)) {
                const matchingOrders: Array<{ invoiceNo: string; customerName: string; quantity: number }> = [];
                for (const inv of activeBatch.invoices || []) {
                    const matchProd = inv.products?.find((p) => p.productId === pId);
                    if (matchProd && matchProd.quantity > 0) {
                        matchingOrders.push({
                            invoiceNo: inv.invoiceNo,
                            customerName: inv.customerName || "Customer",
                            quantity: matchProd.quantity,
                        });
                    }
                }

                prodMap.set(pId, {
                    productId: pId,
                    productName: d.productName,
                    productCode: d.productCode,
                    unit: d.unit || "pcs",
                    totalOrdered: 0,
                    totalPicked: 0,
                    detailIds: [],
                    allocations: allocationsByProduct.get(pId) || [],
                    orders: matchingOrders,
                });
            }

            const item = prodMap.get(pId)!;
            item.detailIds.push(d.id);
            item.totalOrdered += Number(d.orderedQuantity || 0);
            item.totalPicked += Number(d.pickedQuantity || 0);
        }

        return Array.from(prodMap.values());
    }, [activeBatch, allocationsByProduct]);

    const isProductApproved = (prodItem: typeof consolidatedProducts[0]) => {
        return prodItem.detailIds.length > 0 && prodItem.detailIds.every((id) => approvalStatus[id]);
    };

    const totalSKUs = consolidatedProducts.length;
    const approvedCount = consolidatedProducts.filter(isProductApproved).length;
    const progressPercent = totalSKUs > 0 ? (approvedCount / totalSKUs) * 100 : 0;
    const isAllApproved = approvedCount === totalSKUs && totalSKUs > 0;

    const totalOrdered = (activeBatch?.details || []).reduce((sum, d) => sum + Number(d.orderedQuantity || 0), 0);
    const totalPicked = (activeBatch?.details || []).reduce((sum, d) => sum + Number(d.pickedQuantity || 0), 0);

    const toggleProductApproval = (prodItem: typeof consolidatedProducts[0]) => {
        const currentlyApproved = isProductApproved(prodItem);
        setApprovalStatus((prev) => {
            const next = { ...prev };
            for (const id of prodItem.detailIds) {
                next[id] = !currentlyApproved;
            }
            return next;
        });
    };

    const handleConfirmApprove = async () => {
        if (!activeBatch) return;
        setApproving(true);
        try {
            const result = await approveBatch({ batchId: activeBatch.id });
            toast.success(result.message || `Batch ${activeBatch.consolidatorNo} approved successfully!`);
            onSuccess();
            onClose();
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to approve batch");
        } finally {
            setApproving(false);
        }
    };

    const handleConfirmRepick = async () => {
        if (!activeBatch) return;
        setRepicking(true);
        try {
            const result = await repickBatch(activeBatch.id);
            toast.success(result.message || `Batch ${activeBatch.consolidatorNo} returned to picking floor`);
            onSuccess();
            onClose();
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to request re-pick");
        } finally {
            setRepicking(false);
            setShowRepickConfirm(false);
        }
    };

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return consolidatedProducts;
        const q = searchQuery.toLowerCase();
        return consolidatedProducts.filter(
            (p) =>
                p.productName?.toLowerCase().includes(q) ||
                p.productCode?.toLowerCase().includes(q)
        );
    }, [consolidatedProducts, searchQuery]);

    if (!batch || !activeBatch) return null;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                className="max-w-[95vw] sm:max-w-6xl lg:max-w-7xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl border-border"
                aria-describedby="approval-modal-description"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>Consolidation Approval - {batch.consolidatorNo}</DialogTitle>
                    <DialogDescription id="approval-modal-description">
                        Review and approve picked batch {batch.consolidatorNo} for dispatch.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 border-b border-border/80 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-foreground">
                                    {batch.consolidatorNo}
                                </h2>
                                <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-bold text-violet-600">
                                    QA & Approval
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-1">
                                    <Building2 className="h-3.5 w-3.5" />
                                    {batch.branchName || `Branch #${batch.branchId}`}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "N/A"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-b border-border/60 bg-muted/10 px-6 py-3.5 sm:grid-cols-4">
                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">SKUs</span>
                            <Package className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-foreground">{totalSKUs}</p>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">Linked Orders</span>
                            <FileText className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-foreground">{batch.invoices?.length || 1}</p>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">Total Quantity</span>
                            <Layers className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-foreground">
                            {totalPicked} <span className="text-xs font-semibold text-muted-foreground">/ {totalOrdered} pcs</span>
                        </p>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">Verification</span>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-emerald-600">
                            {approvedCount} <span className="text-xs font-semibold text-muted-foreground">/ {totalSKUs}</span>
                        </p>
                    </div>
                </div>

                <div className="relative border-b border-border/60 bg-muted/40 px-6 py-2">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="text-muted-foreground">Review Progress</span>
                        <span className="font-mono text-emerald-600 font-bold">
                            {progressPercent.toFixed(0)}% verified
                        </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80">
                        <motion.div
                            className="h-full bg-emerald-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercent}%` }}
                            transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between border-b border-border/60 px-6 py-2.5 bg-muted/20">
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-primary" />
                        Products & Quality Review ({totalSKUs})
                    </div>

                    <div className="relative w-48 sm:w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search product or code..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-8 text-xs bg-background rounded-lg"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loadingDetails ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <p className="text-sm font-semibold">Loading batch details...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredProducts.length === 0 ? (
                                <div className="py-12 text-center text-sm text-muted-foreground">
                                    No products found matching your search.
                                </div>
                            ) : (
                                filteredProducts.map((prodItem) => {
                                    const isApproved = isProductApproved(prodItem);
                                    const prodAllocs = prodItem.allocations || [];

                                    return (
                                        <motion.div
                                            key={prodItem.productId}
                                            layout
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2 }}
                                            onClick={() => toggleProductApproval(prodItem)}
                                            className={`relative cursor-pointer rounded-2xl border p-4.5 transition-all ${
                                                isApproved
                                                    ? "border-emerald-500/80 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs"
                                                    : "border-border/80 bg-card hover:border-primary/40 hover:bg-muted/30"
                                            }`}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-start gap-3">
                                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
                                                        isApproved
                                                            ? "bg-emerald-500 text-white shadow-sm"
                                                            : "bg-muted text-muted-foreground"
                                                    }`}>
                                                        {isApproved ? (
                                                            <Check className="h-5 w-5 stroke-[2.5]" />
                                                        ) : (
                                                            <Package className="h-5 w-5" />
                                                        )}
                                                    </div>

                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-sm text-foreground">
                                                                {prodItem.productName}
                                                            </span>
                                                            {prodItem.orders.length > 1 && (
                                                                <span className="text-[10px] font-semibold py-0.5 px-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                                                    Fulfills {prodItem.orders.length} orders
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <span className="font-mono">{prodItem.productCode}</span>
                                                            <span>•</span>
                                                            <span className="font-semibold text-foreground/80">
                                                                Demand: {prodItem.totalOrdered} {prodItem.unit}
                                                            </span>
                                                            <span>•</span>
                                                            <span className="font-mono text-emerald-600 font-bold">
                                                                Picked: {prodItem.totalPicked} {prodItem.unit}
                                                            </span>
                                                            {prodItem.totalPicked < prodItem.totalOrdered && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="inline-flex items-center gap-1 font-bold text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                                                                        <AlertCircle className="h-3 w-3 shrink-0" />
                                                                        Shortfall: {prodItem.totalOrdered - prodItem.totalPicked} {prodItem.unit}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                                    <div className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
                                                        isApproved
                                                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                            : "border-border bg-muted/60 text-muted-foreground"
                                                    }`}>
                                                        {isApproved ? (
                                                            <span className="flex items-center gap-1">
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                                Verified
                                                            </span>
                                                        ) : (
                                                            "Click to Verify"
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {prodAllocs.length > 0 && (() => {
                                                const pickedLotsCount = prodAllocs.filter((a) => {
                                                    const cap = Number(a.quantity || 0);
                                                    const p = a.pickedQuantity !== undefined ? Number(a.pickedQuantity) : (a.status === "Picked" ? cap : 0);
                                                    return p >= cap && cap > 0;
                                                }).length;

                                                return (
                                                    <div className="mt-3.5 pt-3 border-t border-border/40">
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                                                            <span className="flex items-center gap-1">
                                                                <Layers className="h-3 w-3" />
                                                                Allocated Storage Lots ({prodAllocs.length})
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-muted-foreground normal-case">
                                                                {pickedLotsCount} picked of {prodAllocs.length} lots
                                                            </span>
                                                        </div>
                                                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                            {prodAllocs.map((alloc, idx) => {
                                                                const orderMatches = getLotOrderLabels(prodItem.orders, prodAllocs, idx);
                                                                const lotCapacity = Number(alloc.quantity || 0);
                                                                const lotPicked = alloc.pickedQuantity !== undefined
                                                                    ? Number(alloc.pickedQuantity)
                                                                    : (alloc.status === "Picked" ? lotCapacity : 0);
                                                                const lotShortfall = Math.max(0, lotCapacity - lotPicked);
                                                                const isLotFullyPicked = lotPicked >= lotCapacity && lotCapacity > 0;
                                                                const isLotPartial = lotPicked > 0 && lotPicked < lotCapacity;

                                                                return (
                                                                    <div
                                                                        key={`${alloc.batchNo}-${idx}`}
                                                                        className={`rounded-xl border p-2.5 text-xs transition-all ${
                                                                            isLotFullyPicked
                                                                                ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/15"
                                                                                : isLotPartial
                                                                                ? "border-amber-500/50 bg-amber-500/10 dark:bg-amber-950/20"
                                                                                : "border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/10 opacity-90"
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center justify-between font-bold text-foreground">
                                                                            <span className={`truncate ${isLotFullyPicked ? "text-foreground font-bold" : "text-foreground"}`}>
                                                                                {alloc.lotName || `Lot #${alloc.lotId}`}
                                                                            </span>
                                                                            <span className={`font-mono px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                                                isLotFullyPicked
                                                                                    ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
                                                                                    : isLotPartial
                                                                                    ? "text-amber-700 dark:text-amber-300 bg-amber-500/20 border-amber-500/40"
                                                                                    : "text-amber-700 dark:text-amber-300 bg-amber-500/15 border-amber-500/30"
                                                                            }`}>
                                                                                {isLotFullyPicked
                                                                                    ? `Picked: ${lotCapacity} / ${lotCapacity} units`
                                                                                    : `Picked: ${lotPicked} / ${lotCapacity} units`}
                                                                            </span>
                                                                        </div>
                                                                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                                                                            <span>Batch: {alloc.batchNo || "N/A"}</span>
                                                                            {alloc.expiryDate && (
                                                                                <span>Exp: {alloc.expiryDate}</span>
                                                                            )}
                                                                        </div>

                                                                        {/* Dynamic Shortfall Callout */}
                                                                        {lotShortfall > 0 && (
                                                                            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded">
                                                                                <AlertCircle className="h-3 w-3 shrink-0" />
                                                                                <span>Shortfall: -{lotShortfall} units unpicked</span>
                                                                            </div>
                                                                        )}

                                                                    {orderMatches.length > 0 && (
                                                                        <div className="flex flex-wrap items-center gap-1 mt-1.5 pt-1.5 border-t border-border/40">
                                                                            {orderMatches.map((m, mIdx) => (
                                                                                <span
                                                                                    key={mIdx}
                                                                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                                                                                        isLotFullyPicked
                                                                                            ? "bg-emerald-600/10 border-emerald-600/20 text-emerald-800 dark:text-emerald-200"
                                                                                            : "bg-muted/70 border-border/80 text-foreground/70"
                                                                                    }`}
                                                                                >
                                                                                    <FileText className="h-2.5 w-2.5 text-primary shrink-0" />
                                                                                    <span>For {m.orderNo}</span>
                                                                                    <span className="font-normal opacity-80">({m.customer})</span>
                                                                                    <span className="font-mono font-bold text-primary">· {m.qty} qty</span>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* Action Footer */}
                <div className="border-t border-border/80 bg-muted/20 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                        <span>
                            Items verified: <strong className={isAllApproved ? "text-emerald-600 font-bold" : "text-foreground font-bold"}>{approvedCount} of {totalSKUs}</strong>
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5">
                        {/* Request Re-Pick Trigger */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowRepickConfirm(true)}
                            disabled={repicking || approving}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 text-xs font-bold"
                        >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Request Re-Pick
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClose}
                            disabled={approving || repicking}
                            className="text-xs font-bold rounded-xl"
                        >
                            Cancel
                        </Button>

                        <Button
                            size="sm"
                            onClick={handleConfirmApprove}
                            disabled={approving || repicking || !isAllApproved}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm px-4"
                        >
                            {approving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    Approving...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                    Confirm Approval
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Re-pick Confirmation Sub-Dialog */}
                <AnimatePresence>
                    {showRepickConfirm && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
                            >
                                <div className="flex items-center gap-3 text-amber-500 mb-3">
                                    <AlertCircle className="h-6 w-6" />
                                    <h3 className="font-bold text-base text-foreground">Return Batch to Picking?</h3>
                                </div>
                                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                                    This will return batch <strong>{batch.consolidatorNo}</strong> back to the picking floor (status: <strong>Picking</strong>). Picking operators will be able to adjust lot allocations.
                                </p>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowRepickConfirm(false)}
                                        disabled={repicking}
                                        className="text-xs font-bold"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleConfirmRepick}
                                        disabled={repicking}
                                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                                    >
                                        {repicking ? (
                                            <>
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                Returning...
                                            </>
                                        ) : (
                                            "Confirm Return to Picking"
                                        )}
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    );
}
