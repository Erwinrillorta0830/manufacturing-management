"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    Loader2,
    Package,
    PackageCheck,
    Save,
    ScanLine,
    Search,
    Building2,
    Calendar,
    Minus,
    Plus,
    FileText,
    Check,
    Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { InvoiceConsolidation, PickingSavePayload } from "../../shared/consolidation-types";
import {
    fetchAllocations,
    fetchConsolidationByNo,
    savePickedQuantities,
    completePicking,
    type LotAllocation,
} from "../../shared/consolidation-api";
import { ConsolidationStatusBadge } from "../../shared/consolidation-ui";

interface Props {
    isOpen: boolean;
    batch: InvoiceConsolidation | null;
    onClose: () => void;
    onSuccess: () => void;
}

export function getLotOrderLabels(
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

export default function PickingModal({ isOpen, batch, onClose, onSuccess }: Props) {
    const [fullBatch, setFullBatch] = useState<InvoiceConsolidation | null>(batch);
    const [allocations, setAllocations] = useState<LotAllocation[]>([]);
    const [pickedQtys, setPickedQtys] = useState<Record<number, number>>({});
    const [pickedLotKeys, setPickedLotKeys] = useState<Set<string>>(new Set());
    const [loadingAllocations, setLoadingAllocations] = useState(false);
    const [saving, setSaving] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Initialize local picked quantities & lot selections from batch details
    useEffect(() => {
        if (!batch) return;
        setFullBatch(batch);
        const initialMap: Record<number, number> = {};
        for (const d of batch.details || []) {
            initialMap[d.id] = Number(d.pickedQuantity || 0);
        }
        setPickedQtys(initialMap);

        // Fetch fresh details and allocations in parallel
        setLoadingAllocations(true);
        Promise.all([
            fetchConsolidationByNo(batch.consolidatorNo).catch(() => batch),
            fetchAllocations(batch.id).catch(() => []),
        ])
            .then(([freshBatch, allocs]) => {
                const b = freshBatch || batch;
                setFullBatch(b);
                const freshMap: Record<number, number> = {};
                for (const d of b.details || []) {
                    freshMap[d.id] = Number(d.pickedQuantity || 0);
                }
                setPickedQtys(freshMap);
                setAllocations(allocs || []);

                // Pre-mark lot keys based on actual backend reservation status
                const preMarkedLots = new Set<string>();
                const prodAllocMap = new Map<number, LotAllocation[]>();
                for (const a of allocs || []) {
                    const list = prodAllocMap.get(a.productId) || [];
                    list.push(a);
                    prodAllocMap.set(a.productId, list);
                }

                prodAllocMap.forEach((prodAllocs, pId) => {
                    const hasExplicitPickedStatus = prodAllocs.some((a) => a.status === "Picked");
                    if (hasExplicitPickedStatus) {
                        for (let i = 0; i < prodAllocs.length; i++) {
                            const alloc = prodAllocs[i];
                            const key = `${pId}:${alloc.batchNo || alloc.lotName}:${alloc.quantity}:${i}`;
                            if (alloc.status === "Picked") {
                                preMarkedLots.add(key);
                            }
                        }
                    } else {
                        const totalPickedForProd = (b.details || [])
                            .filter((d) => d.productId === pId)
                            .reduce((sum, d) => sum + (freshMap[d.id] || 0), 0);
                        let budget = totalPickedForProd;
                        for (let i = 0; i < prodAllocs.length; i++) {
                            const alloc = prodAllocs[i];
                            const key = `${pId}:${alloc.batchNo || alloc.lotName}:${alloc.quantity}:${i}`;
                            const allocQty = Number(alloc.quantity || 0);
                            if (budget >= allocQty && allocQty > 0) {
                                preMarkedLots.add(key);
                                budget -= allocQty;
                            }
                        }
                    }
                });
                setPickedLotKeys(preMarkedLots);
            })
            .finally(() => setLoadingAllocations(false));
    }, [batch]);

    const activeBatch = fullBatch || batch;

    // Aggregate lot allocations per product_id
    const allocationsByProduct = useMemo(() => {
        const map = new Map<number, LotAllocation[]>();
        for (const a of allocations) {
            const list = map.get(a.productId) || [];
            list.push(a);
            map.set(a.productId, list);
        }
        return map;
    }, [allocations]);

    // Group details by product into consolidated SKU items with linked orders
    const consolidatedProducts = useMemo(() => {
        if (!activeBatch?.details) return [];

        const prodMap = new Map<number, {
            productId: number;
            productName: string;
            productCode: string;
            unit: string;
            totalOrdered: number;
            totalPicked: number;
            details: typeof activeBatch.details;
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
                // Find matching orders for this product
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
                    details: [],
                    allocations: allocationsByProduct.get(pId) || [],
                    orders: matchingOrders,
                });
            }

            const item = prodMap.get(pId)!;
            item.details.push(d);
            item.totalOrdered += Number(d.orderedQuantity || 0);
            item.totalPicked += Number(pickedQtys[d.id] ?? d.pickedQuantity ?? 0);
        }

        return Array.from(prodMap.values());
    }, [activeBatch, allocationsByProduct, pickedQtys]);

    // Compute picking summary stats
    const totalOrdered = useMemo(() => {
        return (activeBatch?.details || []).reduce((sum, d) => sum + Number(d.orderedQuantity || 0), 0);
    }, [activeBatch]);

    const totalPicked = useMemo(() => {
        return (activeBatch?.details || []).reduce((sum, d) => {
            const picked = pickedQtys[d.id] ?? Number(d.pickedQuantity || 0);
            return sum + picked;
        }, 0);
    }, [activeBatch, pickedQtys]);

    const progressPct = totalOrdered > 0 ? Math.min(100, Math.round((totalPicked / totalOrdered) * 100)) : 0;
    const isFullyPicked = totalOrdered > 0 && totalPicked >= totalOrdered;

    // Filter consolidated products
    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return consolidatedProducts;
        const q = searchQuery.toLowerCase();
        return consolidatedProducts.filter((p) =>
            p.productName.toLowerCase().includes(q) ||
            p.productCode.toLowerCase().includes(q)
        );
    }, [consolidatedProducts, searchQuery]);

    // Quantity adjustment for consolidated product (distributes across underlying details)
    const handleProductQtyChange = (productId: number, maxQty: number, nextVal: number) => {
        const item = consolidatedProducts.find((p) => p.productId === productId);
        if (!item) return;

        const clamped = Math.max(0, Math.min(maxQty, nextVal));
        let remainingToDistribute = clamped;
        const newPickedMap = { ...pickedQtys };

        for (const d of item.details) {
            const dMax = Number(d.orderedQuantity || 0);
            const assign = Math.min(remainingToDistribute, dMax);
            newPickedMap[d.id] = assign;
            remainingToDistribute -= assign;
        }
        setPickedQtys(newPickedMap);

        // Synchronize lot keys for this product
        const prodAllocs = allocationsByProduct.get(productId) || [];
        const nextKeys = new Set(pickedLotKeys);
        let budget = clamped;
        for (let i = 0; i < prodAllocs.length; i++) {
            const a = prodAllocs[i];
            const key = `${productId}:${a.batchNo || a.lotName}:${a.quantity}:${i}`;
            const allocQty = Number(a.quantity || 0);
            if (budget >= allocQty && allocQty > 0) {
                nextKeys.add(key);
                budget -= allocQty;
            } else {
                nextKeys.delete(key);
            }
        }
        setPickedLotKeys(nextKeys);
    };

    // Click on individual batch/lot card to pick / unpick for consolidated product
    const handleToggleLotPick = (productId: number, maxQty: number, alloc: LotAllocation, allocIdx: number) => {
        const key = `${productId}:${alloc.batchNo || alloc.lotName}:${alloc.quantity}:${allocIdx}`;
        const isCurrentlyPicked = pickedLotKeys.has(key);

        const nextPicked = new Set(pickedLotKeys);
        if (isCurrentlyPicked) {
            nextPicked.delete(key);
        } else {
            nextPicked.add(key);
        }

        // Recalculate total picked for this product
        const prodAllocs = allocationsByProduct.get(productId) || [];
        let totalLotPicked = 0;
        for (let i = 0; i < prodAllocs.length; i++) {
            const a = prodAllocs[i];
            const k = `${productId}:${a.batchNo || a.lotName}:${a.quantity}:${i}`;
            if (nextPicked.has(k)) {
                totalLotPicked += Number(a.quantity || 0);
            }
        }

        setPickedLotKeys(nextPicked);

        // Distribute to detail records
        const item = consolidatedProducts.find((p) => p.productId === productId);
        if (item) {
            let budget = Math.min(maxQty, totalLotPicked);
            const newPickedMap = { ...pickedQtys };
            for (const d of item.details) {
                const dMax = Number(d.orderedQuantity || 0);
                const assign = Math.min(budget, dMax);
                newPickedMap[d.id] = assign;
                budget -= assign;
            }
            setPickedQtys(newPickedMap);
        }
    };

    // Save partial progress
    const handleSave = async () => {
        if (!activeBatch) return;
        setSaving(true);
        try {
            const pickedReservationIds: number[] = [];
            const pickedLotIds: number[] = [];

            for (const d of activeBatch.details || []) {
                const prodAllocs = allocationsByProduct.get(d.productId) || [];
                for (let i = 0; i < prodAllocs.length; i++) {
                    const alloc = prodAllocs[i];
                    const key = `${d.productId}:${alloc.batchNo || alloc.lotName}:${alloc.quantity}:${i}`;
                    if (pickedLotKeys.has(key)) {
                        if (alloc.reservationIds && alloc.reservationIds.length > 0) {
                            pickedReservationIds.push(...alloc.reservationIds);
                        }
                        if (alloc.inventoryLotId) {
                            pickedLotIds.push(alloc.inventoryLotId);
                        }
                    }
                }
            }

            const payload: PickingSavePayload = {
                batchId: activeBatch.id,
                quantities: (activeBatch.details || []).map((d) => ({
                    detailId: d.id,
                    pickedQuantity: pickedQtys[d.id] ?? Number(d.pickedQuantity || 0),
                })),
                pickedReservationIds,
                pickedLotIds,
            };
            const result = await savePickedQuantities(payload);
            toast.success(result.message || "Picking progress saved");
            onSuccess();
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to save picking progress");
        } finally {
            setSaving(false);
        }
    };

    // Complete picking
    const handleComplete = async () => {
        if (!activeBatch) return;
        if (!isFullyPicked) {
            toast.error(`Please pick all items before completing (${totalPicked} / ${totalOrdered} pcs picked)`);
            return;
        }
        setCompleting(true);
        try {
            const pickedReservationIds: number[] = [];
            const pickedLotIds: number[] = [];

            for (const d of activeBatch.details || []) {
                const prodAllocs = allocationsByProduct.get(d.productId) || [];
                for (let i = 0; i < prodAllocs.length; i++) {
                    const alloc = prodAllocs[i];
                    const key = `${d.productId}:${alloc.batchNo || alloc.lotName}:${alloc.quantity}:${i}`;
                    if (pickedLotKeys.has(key)) {
                        if (alloc.reservationIds && alloc.reservationIds.length > 0) {
                            pickedReservationIds.push(...alloc.reservationIds);
                        }
                        if (alloc.inventoryLotId) {
                            pickedLotIds.push(alloc.inventoryLotId);
                        }
                    }
                }
            }

            // First save latest quantities & picked lot reservations
            await savePickedQuantities({
                batchId: activeBatch.id,
                quantities: (activeBatch.details || []).map((d) => ({
                    detailId: d.id,
                    pickedQuantity: pickedQtys[d.id] ?? Number(d.orderedQuantity || 0),
                })),
                pickedReservationIds,
                pickedLotIds,
            });

            // Complete picking
            const result = await completePicking(activeBatch.id);
            toast.success(result.message || `Batch ${activeBatch.consolidatorNo} successfully marked as Picked!`);
            onSuccess();
            onClose();
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to complete picking");
        } finally {
            setCompleting(false);
        }
    };

    if (!activeBatch) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw] sm:max-w-6xl lg:max-w-7xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border bg-background shadow-2xl">
                {/* Header */}
                <DialogHeader className="p-5 border-b bg-card shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <motion.div
                                initial={{ rotate: -15, scale: 0.8 }}
                                animate={{ rotate: 0, scale: 1 }}
                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0"
                            >
                                <ScanLine className="h-6 w-6" />
                            </motion.div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-xl font-bold font-mono tracking-tight">
                                        {activeBatch.consolidatorNo}
                                    </DialogTitle>
                                    <ConsolidationStatusBadge status={activeBatch.status} />
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                    <span className="flex items-center gap-1 font-medium">
                                        <Building2 className="h-3.5 w-3.5" />
                                        {activeBatch.branchName}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {new Date(activeBatch.createdAt).toLocaleString("en-US", {
                                            month: "short",
                                            day: "2-digit",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Top quick tip */}
                        {/* <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border">
                            <MousePointerClick className="h-3.5 w-3.5 text-primary" />
                            <span>Click any <strong>allocated lot/batch</strong> below to pick</span>
                        </div> */}
                    </div>

                    {/* Progress Bar & Summary Metric Cards */}
                    <div className="mt-4 pt-3 border-t border-border/50">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
                            <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }} className="rounded-xl border bg-muted/40 p-2.5 shadow-xs">
                                <span className="text-[11px] font-semibold text-muted-foreground block uppercase tracking-wider">SKUs</span>
                                <span className="text-lg font-bold">{consolidatedProducts.length}</span>
                            </motion.div>
                            <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }} className="rounded-xl border bg-muted/40 p-2.5 shadow-xs">
                                <span className="text-[11px] font-semibold text-muted-foreground block uppercase tracking-wider">Linked Orders</span>
                                <span className="text-lg font-bold">{activeBatch.invoices?.length || 0}</span>
                            </motion.div>
                            <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }} className="rounded-xl border bg-muted/40 p-2.5 shadow-xs">
                                <span className="text-[11px] font-semibold text-muted-foreground block uppercase tracking-wider">Total Demand</span>
                                <span className="text-lg font-bold">{totalOrdered} <span className="text-xs text-muted-foreground font-normal">units</span></span>
                            </motion.div>
                            <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }} className="rounded-xl border bg-muted/40 p-2.5 shadow-xs">
                                <span className="text-[11px] font-semibold text-muted-foreground block uppercase tracking-wider">Picked Progress</span>
                                <span className={`text-lg font-bold ${isFullyPicked ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                                    {progressPct}%
                                </span>
                            </motion.div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                            <span className="text-muted-foreground">Picking Progress</span>
                            <span className="font-mono">{totalPicked} / {totalOrdered} units ({progressPct}%)</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${isFullyPicked ? "bg-emerald-500" : "bg-primary"}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                            />
                        </div>
                    </div>
                </DialogHeader>

                {/* Search Bar & Header */}
                <div className="flex items-center justify-between px-5 py-2.5 border-b bg-muted/20 shrink-0">
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-primary" />
                        Products & Allocated Lots ({consolidatedProducts.length})
                    </div>

                    <div className="relative w-48 sm:w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search product or code..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-8 text-xs rounded-lg bg-background"
                        />
                    </div>
                </div>

                {/* Content Area with AnimatePresence */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    <AnimatePresence>
                        {filteredProducts.map((prodItem, index) => {
                            const currentPicked = prodItem.totalPicked;
                            const maxQty = prodItem.totalOrdered;
                            const isItemDone = currentPicked >= maxQty && maxQty > 0;
                            const prodAllocations = prodItem.allocations || [];

                            return (
                                <motion.div
                                    key={prodItem.productId}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.2 }}
                                    className={`rounded-xl border p-4 transition-all shadow-2xs ${
                                        isItemDone
                                            ? "border-emerald-300/80 bg-emerald-50/25 dark:border-emerald-900/50 dark:bg-emerald-950/15"
                                            : "border-border bg-card"
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        {/* Product info */}
                                        <div className="flex items-start gap-3 min-w-0">
                                            <motion.div
                                                animate={{ scale: isItemDone ? [1, 1.15, 1] : 1 }}
                                                transition={{ duration: 0.25 }}
                                                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                                    isItemDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                                                }`}
                                            >
                                                {isItemDone ? <Check className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                                            </motion.div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-foreground truncate">
                                                        {prodItem.productName}
                                                    </span>
                                                    {prodItem.orders.length > 1 && (
                                                        <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 bg-primary/5 text-primary border-primary/20">
                                                            Fulfills {prodItem.orders.length} orders
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                    <span className="font-mono">{prodItem.productCode}</span>
                                                    <span>•</span>
                                                    <span className="font-semibold text-foreground/80">
                                                        Total Demand: {prodItem.totalOrdered} {prodItem.unit}
                                                    </span>
                                                    <span>•</span>
                                                    <span className={isItemDone ? "font-bold text-emerald-600" : "font-medium text-muted-foreground"}>
                                                        Picked: {currentPicked} / {maxQty}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pick Stepper */}
                                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                                            <div className="flex items-center gap-1.5 bg-muted/50 rounded-xl p-1 border">
                                                <motion.div whileTap={{ scale: 0.88 }}>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={() => handleProductQtyChange(prodItem.productId, maxQty, currentPicked - 1)}
                                                        disabled={currentPicked <= 0}
                                                        className="h-8 w-8 rounded-lg cursor-pointer"
                                                    >
                                                        <Minus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </motion.div>

                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={maxQty}
                                                    value={currentPicked}
                                                    onChange={(e) => handleProductQtyChange(prodItem.productId, maxQty, Number(e.target.value) || 0)}
                                                    className="h-8 w-16 text-center font-bold text-sm bg-background rounded-md"
                                                />

                                                <motion.div whileTap={{ scale: 0.88 }}>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={() => handleProductQtyChange(prodItem.productId, maxQty, currentPicked + 1)}
                                                        disabled={currentPicked >= maxQty}
                                                        className="h-8 w-8 rounded-lg cursor-pointer"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </motion.div>
                                            </div>

                                            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                                                <Button
                                                    size="sm"
                                                    variant={isItemDone ? "outline" : "default"}
                                                    onClick={() => handleProductQtyChange(prodItem.productId, maxQty, maxQty)}
                                                    className={`h-9 rounded-xl text-xs font-bold cursor-pointer ${
                                                        isItemDone
                                                            ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400"
                                                            : ""
                                                    }`}
                                                >
                                                    {isItemDone ? "Picked" : "Pick All"}
                                                </Button>
                                            </motion.div>
                                        </div>
                                    </div>

                                    {/* Clickable Allocated Storage Lots */}
                                    <div className="mt-3 pt-3 border-t border-border/40">
                                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
                                            <span className="flex items-center gap-1.5">
                                                <Layers className="h-3.5 w-3.5 text-primary" />
                                                Allocated Storage Lots ({prodAllocations.length})
                                            </span>
                                            <span className="text-[10px] font-normal normal-case text-muted-foreground">
                                                Click batch card to pick
                                            </span>
                                        </div>

                                        {loadingAllocations ? (
                                            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5 py-1">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Loading lot allocations...
                                            </div>
                                        ) : prodAllocations.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {prodAllocations.map((alloc, idx) => {
                                                    const lotKey = `${prodItem.productId}:${alloc.batchNo || alloc.lotName}:${alloc.quantity}:${idx}`;
                                                    const isPicked = pickedLotKeys.has(lotKey);
                                                    const orderMatches = getLotOrderLabels(prodItem.orders, prodAllocations, idx);

                                                    return (
                                                        <motion.button
                                                            key={idx}
                                                            type="button"
                                                            whileHover={{ scale: 1.01, y: -1 }}
                                                            whileTap={{ scale: 0.98 }}
                                                            onClick={() => handleToggleLotPick(prodItem.productId, maxQty, alloc, idx)}
                                                            className={`flex items-center justify-between text-xs p-2.5 rounded-xl border transition-all cursor-pointer text-left ${
                                                                isPicked
                                                                    ? "border-emerald-500 bg-emerald-500/10 text-foreground dark:bg-emerald-500/15 dark:border-emerald-500 shadow-xs"
                                                                    : "border-border/70 bg-background/80 hover:border-primary/50 hover:bg-muted/40"
                                                            }`}
                                                        >
                                                            <div className="min-w-0 pr-2">
                                                                <span className={`font-bold block truncate text-xs ${
                                                                    isPicked ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"
                                                                }`}>
                                                                    Lot: {alloc.lotName || alloc.batchNo || "Unknown"}
                                                                </span>
                                                                {alloc.batchNo && alloc.batchNo !== alloc.lotName && (
                                                                    <span className="text-[11px] text-muted-foreground font-mono block">
                                                                        Batch: {alloc.batchNo}
                                                                    </span>
                                                                )}
                                                                {orderMatches.length > 0 && (
                                                                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                                                        {orderMatches.map((m, mIdx) => (
                                                                            <span
                                                                                key={mIdx}
                                                                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                                                                                    isPicked
                                                                                        ? "bg-emerald-600/15 border-emerald-600/30 text-emerald-800 dark:text-emerald-200"
                                                                                        : "bg-muted/70 border-border/80 text-foreground/80"
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

                                                            <Badge
                                                                variant={isPicked ? "default" : "secondary"}
                                                                className={`font-mono font-bold text-xs shrink-0 ml-2 ${
                                                                    isPicked
                                                                        ? "bg-emerald-600 hover:bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
                                                                        : "text-muted-foreground"
                                                                }`}
                                                            >
                                                                {alloc.quantity} units
                                                            </Badge>
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-muted-foreground italic py-1">
                                                No specific lot allocations recorded for this item.
                                            </div>
                                        )}
                                    </div>

 
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t bg-card flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-muted-foreground">
                        {isFullyPicked ? (
                            <motion.span
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5"
                            >
                                <CheckCircle2 className="h-4 w-4" /> All items fully picked ({totalPicked} / {totalOrdered})
                            </motion.span>
                        ) : (
                            <span>
                                Items picked: <strong>{totalPicked}</strong> of <strong>{totalOrdered}</strong>
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={saving || completing}
                            className="rounded-xl font-bold cursor-pointer"
                        >
                            Cancel
                        </Button>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                                variant="secondary"
                                onClick={handleSave}
                                disabled={saving || completing}
                                className="rounded-xl font-bold cursor-pointer"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                                Save Progress
                            </Button>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                                onClick={handleComplete}
                                disabled={saving || completing || !isFullyPicked}
                                className="rounded-xl font-black px-5 uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 cursor-pointer shadow-sm"
                            >
                                {completing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <PackageCheck className="h-4 w-4 mr-1.5" />}
                                Complete Picking
                            </Button>
                        </motion.div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
