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
    Check,
    Layers,
    AlertCircle,
    Printer,
    X,
} from "lucide-react";
import { generateConsolidationPDF } from "../../consolidation-planning/utils/ConsolidationSummaryPrint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { InvoiceConsolidation, PickingSavePayload, AvailableLotBatchItem } from "../../shared/consolidation-types";
import {
    fetchAllocationsWithBatches,
    fetchConsolidationByNo,
    savePickedQuantities,
    completePicking,
    type LotAllocation,
} from "../../shared/consolidation-api";
import { ConsolidationStatusBadge } from "../../shared/consolidation-ui";
import { SearchableSelect, type SearchableSelectOption } from "../../shared/components/SearchableSelect";

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
    const alloc = allocations[allocIdx];
    if (alloc?.orderNo) {
        const matchedCust = alloc.customerName || (orders.find((o) => o.invoiceNo === alloc.orderNo)?.customerName || "Customer");
        return [{
            orderNo: alloc.orderNo,
            customer: matchedCust,
            qty: Number(alloc.quantity || 0),
        }];
    }

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

export function getLotKey(productId: number, alloc: LotAllocation, idx: number): string {
    return `${productId}:${alloc.batchNo || alloc.lotName}:${alloc.quantity}:${alloc.inventoryLotId || alloc.lotId || idx}:${idx}`;
}

export default function PickingModal({ isOpen, batch, onClose, onSuccess }: Props) {
    const [fullBatch, setFullBatch] = useState<InvoiceConsolidation | null>(batch);
    const [allocations, setAllocations] = useState<LotAllocation[]>([]);
    const [availableBatches, setAvailableBatches] = useState<AvailableLotBatchItem[]>([]);
    const [pickedQtys, setPickedQtys] = useState<Record<number, number>>({});
    const [lotPickedQtys, setLotPickedQtys] = useState<Record<string, number>>({});
    const [loadingAllocations, setLoadingAllocations] = useState(false);
    const [saving, setSaving] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [printing, setPrinting] = useState(false);
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
            fetchAllocationsWithBatches(batch.id, batch.branchId).catch(() => ({ allocations: [], availableBatches: [] })),
        ])
            .then(([freshBatch, allocResult]) => {
                const b = freshBatch || batch;
                setFullBatch(b);
                const allocs = (allocResult.allocations || []).filter((a) => Number(a.quantity || 0) > 0);
                const availBatches = (allocResult.availableBatches || []).filter((b) => Number(b.availableQuantity || 0) > 0);
                setAvailableBatches(availBatches);

                const prodAllocMap = new Map<number, LotAllocation[]>();
                for (const a of allocs) {
                    const list = prodAllocMap.get(a.productId) || [];
                    list.push(a);
                    prodAllocMap.set(a.productId, list);
                }

                const freshMap: Record<number, number> = {};
                for (const d of b.details || []) {
                    const prodAllocs = prodAllocMap.get(d.productId) || [];
                    const prodAllocTotal = prodAllocs.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
                    // Items with no lot allocations cannot be picked
                    if (prodAllocs.length === 0 || prodAllocTotal <= 0) {
                        freshMap[d.id] = 0;
                    } else {
                        freshMap[d.id] = Math.min(Number(d.pickedQuantity || 0), prodAllocTotal);
                    }
                }
                setPickedQtys(freshMap);
                setAllocations(allocs);

                // Initialize lot picked quantities based on reservations or details
                const initialLotMap: Record<string, number> = {};
                prodAllocMap.forEach((prodAllocs, pId) => {
                    for (let i = 0; i < prodAllocs.length; i++) {
                        const alloc = prodAllocs[i];
                        const key = getLotKey(pId, alloc, i);
                        if (alloc.pickedQuantity !== undefined) {
                            initialLotMap[key] = Number(alloc.pickedQuantity);
                        } else if (alloc.status === "Picked") {
                            initialLotMap[key] = Number(alloc.quantity || 0);
                        } else {
                            initialLotMap[key] = 0;
                        }
                    }
                });
                setLotPickedQtys(initialLotMap);
            })
            .finally(() => setLoadingAllocations(false));
    }, [batch]);

    const activeBatch = fullBatch || batch;

    // Aggregate lot allocations per product_id (ignore 0-quantity allocations)
    const allocationsByProduct = useMemo(() => {
        const map = new Map<number, LotAllocation[]>();
        for (const a of allocations) {
            if (Number(a.quantity || 0) <= 0) continue;
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

    // Helper to distribute total picked from lots across underlying details (capped at maxQty)
    const updateDetailPickedFromLots = (productId: number, maxQty: number, totalProductPicked: number) => {
        const item = consolidatedProducts.find((p) => p.productId === productId);
        if (!item) return;
        let budget = Math.min(maxQty, totalProductPicked);
        const newPickedMap = { ...pickedQtys };
        for (const d of item.details) {
            const dMax = Number(d.orderedQuantity || 0);
            const assign = Math.min(budget, dMax);
            newPickedMap[d.id] = assign;
            budget -= assign;
        }
        setPickedQtys(newPickedMap);
    };


    // Click on individual batch/lot card to pick / unpick for consolidated product
    const handleToggleLotPick = (productId: number, maxQty: number, alloc: LotAllocation, allocIdx: number) => {
        const key = getLotKey(productId, alloc, allocIdx);
        const lotCapacity = Number(alloc.quantity || 0);
        const currentLotPicked = Number(lotPickedQtys[key] || 0);

        const prodAllocs = allocationsByProduct.get(productId) || [];
        let otherLotsPicked = 0;
        for (let i = 0; i < prodAllocs.length; i++) {
            if (i === allocIdx) continue;
            const k = getLotKey(productId, prodAllocs[i], i);
            otherLotsPicked += Number(lotPickedQtys[k] || 0);
        }

        const remainingDemand = Math.max(0, maxQty - otherLotsPicked);

        let nextLotPicked = 0;
        if (currentLotPicked > 0) {
            // Unpick
            nextLotPicked = 0;
        } else {
            // Pick up to remaining demand or lot capacity
            if (remainingDemand <= 0) {
                toast.info(`Total demand for this product (${maxQty}) has already been picked.`);
                return;
            }
            nextLotPicked = Math.min(lotCapacity, remainingDemand);
        }

        const nextLotMap = {
            ...lotPickedQtys,
            [key]: nextLotPicked,
        };
        setLotPickedQtys(nextLotMap);

        const totalProductPicked = otherLotsPicked + nextLotPicked;
        updateDetailPickedFromLots(productId, maxQty, totalProductPicked);
    };

    // Direct quantity input on individual batch/lot card
    const handleLotPickedQtyChange = (
        productId: number,
        maxQty: number,
        alloc: LotAllocation,
        allocIdx: number,
        val: number
    ) => {
        const key = getLotKey(productId, alloc, allocIdx);
        const lotCapacity = Number(alloc.quantity || 0);

        const prodAllocs = allocationsByProduct.get(productId) || [];
        let otherLotsPicked = 0;
        for (let i = 0; i < prodAllocs.length; i++) {
            if (i === allocIdx) continue;
            const k = getLotKey(productId, prodAllocs[i], i);
            otherLotsPicked += Number(lotPickedQtys[k] || 0);
        }

        const remainingDemand = Math.max(0, maxQty - otherLotsPicked);
        const allowedForThisLot = Math.min(lotCapacity, remainingDemand);

        if (val > allowedForThisLot && allowedForThisLot < lotCapacity) {
            toast.info(`Capped at ${allowedForThisLot} to not exceed total demand of ${maxQty}`);
        }

        const nextQty = Math.max(0, Math.min(allowedForThisLot, isNaN(val) ? 0 : val));

        const nextLotMap = {
            ...lotPickedQtys,
            [key]: nextQty,
        };
        setLotPickedQtys(nextLotMap);

        const totalProductPicked = otherLotsPicked + nextQty;
        updateDetailPickedFromLots(productId, maxQty, totalProductPicked);
    };

    // Add alternative lot/batch from warehouse inventory
    const handleAddAlternativeLot = (productId: number, val: string) => {
        const [invLotIdStr, batchNo, lotIdStr] = val.split(":");
        const invLotId = Number(invLotIdStr);
        const lotId = Number(lotIdStr);
        const candidate = availableBatches.find(
            (b) =>
                b.productId === productId &&
                (b.inventoryLotId === invLotId || (b.lotId === lotId && b.batchNo === batchNo))
        );
        if (!candidate || Number(candidate.availableQuantity || 0) <= 0) {
            toast.error("Selected batch has no available stock.");
            return;
        }

        // Branch validation: strictly verify candidate belongs to this batch's branch
        if (candidate.branchId && activeBatch?.branchId && Number(candidate.branchId) !== Number(activeBatch.branchId)) {
            const currentBranch = activeBatch.branchName || `Branch #${activeBatch.branchId}`;
            toast.error(`Cannot add batch from another branch. Only batches for ${currentBranch} can be picked.`);
            return;
        }

        // Check if already in allocations
        const exists = allocations.some(
            (a) =>
                a.productId === productId &&
                ((invLotId && a.inventoryLotId === invLotId) ||
                    (a.lotId === lotId && a.batchNo === batchNo))
        );
        if (exists) {
            toast.info("This lot is already in the list.");
            return;
        }

        const newAlloc: LotAllocation = {
            productId,
            productName: candidate.productName,
            lotId: candidate.lotId,
            lotName: candidate.lotName,
            batchNo: candidate.batchNo,
            expiryDate: candidate.expiryDate,
            manufacturingDate: null,
            quantity: candidate.availableQuantity,
            pickedQuantity: 0,
            inventoryLotId: candidate.inventoryLotId || invLotId,
            reservationIds: [], // Empty reservationIds indicates an added floor-picked lot
            status: "Reserved",
        };

        setAllocations((prev) => [...prev, newAlloc]);
        toast.success(`Added lot ${candidate.lotName || candidate.batchNo} to available picking lots.`);
    };

    // Remove an added alternative lot (only allowed if pickedQuantity is 0)
    const handleRemoveAlternativeLot = (productId: number, alloc: LotAllocation, allocIdx: number) => {
        const key = getLotKey(productId, alloc, allocIdx);
        const currentLotPicked = Number(lotPickedQtys[key] || 0);
        if (currentLotPicked > 0) {
            toast.error("Cannot remove lot with picked quantity. Reset quantity to 0 first.");
            return;
        }
        setAllocations((prev) => prev.filter((_, i) => i !== allocIdx));
        setLotPickedQtys((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        toast.info(`Removed lot ${alloc.lotName || alloc.batchNo}`);
    };

    // Helper to get structured per-lot picked data
    const getLotPickedItems = (): import("../../shared/consolidation-types").LotPickedItem[] => {
        if (!activeBatch) return [];
        const items: import("../../shared/consolidation-types").LotPickedItem[] = [];
        const seenKeys = new Set<string>();
        for (const [pId, prodAllocs] of allocationsByProduct.entries()) {
            for (let i = 0; i < prodAllocs.length; i++) {
                const alloc = prodAllocs[i];
                const key = getLotKey(pId, alloc, i);
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                const pickedQty = Number(lotPickedQtys[key] ?? 0);
                items.push({
                    productId: pId,
                    inventoryLotId: alloc.inventoryLotId,
                    lotId: alloc.lotId,
                    batchNo: alloc.batchNo,
                    expiryDate: alloc.expiryDate,
                    pickedQuantity: pickedQty,
                    capacity: Number(alloc.quantity || 0),
                    reservationIds: alloc.reservationIds || [],
                });
            }
        }
        return items;
    };

    // Save partial progress
    const handleSave = async () => {
        if (!activeBatch) return;
        setSaving(true);
        try {
            const lotPickedItems = getLotPickedItems();
            const pickedReservationIds: number[] = [];
            const pickedLotIds: number[] = [];

            for (const item of lotPickedItems) {
                if (item.pickedQuantity > 0) {
                    if (item.reservationIds && item.reservationIds.length > 0) {
                        pickedReservationIds.push(...item.reservationIds);
                    }
                    if (item.inventoryLotId) {
                        pickedLotIds.push(item.inventoryLotId);
                    }
                }
            }

            const payload: PickingSavePayload = {
                batchId: activeBatch.id,
                quantities: (activeBatch.details || []).map((d) => {
                    const prodAllocs = allocationsByProduct.get(d.productId) || [];
                    const totalAlloc = prodAllocs.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
                    const safeCap = Math.min(Number(d.orderedQuantity || 0), totalAlloc);
                    const rawPicked = pickedQtys[d.id] ?? Number(d.pickedQuantity || 0);
                    return {
                        detailId: d.id,
                        pickedQuantity: Math.min(Math.max(0, rawPicked), safeCap),
                    };
                }),
                pickedReservationIds,
                pickedLotIds,
                lotPickedItems,
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

    // Core execution function for completing picking
    const executeCompletePicking = async () => {
        if (!activeBatch) return;
        setCompleting(true);
        try {
            const lotPickedItems = getLotPickedItems();
            const pickedReservationIds: number[] = [];
            const pickedLotIds: number[] = [];

            for (const item of lotPickedItems) {
                if (item.pickedQuantity > 0) {
                    if (item.reservationIds && item.reservationIds.length > 0) {
                        pickedReservationIds.push(...item.reservationIds);
                    }
                    if (item.inventoryLotId) {
                        pickedLotIds.push(item.inventoryLotId);
                    }
                }
            }

            // First save latest quantities & picked lot reservations
            await savePickedQuantities({
                batchId: activeBatch.id,
                quantities: (activeBatch.details || []).map((d) => {
                    const prodAllocs = allocationsByProduct.get(d.productId) || [];
                    const totalAlloc = prodAllocs.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
                    const safeCap = Math.min(Number(d.orderedQuantity || 0), totalAlloc);
                    const rawPicked = pickedQtys[d.id] ?? Number(d.pickedQuantity || 0);
                    return {
                        detailId: d.id,
                        pickedQuantity: Math.min(Math.max(0, rawPicked), safeCap),
                    };
                }),
                pickedReservationIds,
                pickedLotIds,
                lotPickedItems,
            });

            // Complete picking directly
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

    // Complete picking handler
    const handleComplete = async () => {
        if (!activeBatch) return;
        if (totalPicked === 0) {
            toast.error("Cannot complete picking with 0 units picked.");
            return;
        }

        await executeCompletePicking();
    };

    // Print Warehouse Pick List PDF
    const handlePrint = async () => {
        if (!activeBatch) return;
        setPrinting(true);
        try {
            toast.info("Generating Warehouse Pick List...");

            const detailMap = new Map<number, {
                productId: number;
                productCode: string;
                productName: string;
                brand: string;
                category: string;
                unit: string;
                orderedQuantity: number;
                pickedQuantity: number;
            }>();

            for (const d of activeBatch.details || []) {
                const existing = detailMap.get(d.productId);
                const currentPicked = Number(pickedQtys[d.id] ?? d.pickedQuantity ?? 0);
                if (existing) {
                    existing.orderedQuantity += d.orderedQuantity;
                    existing.pickedQuantity += currentPicked;
                } else {
                    detailMap.set(d.productId, {
                        productId: d.productId,
                        productCode: d.productCode,
                        productName: d.productName,
                        brand: d.brand || "Unbranded",
                        category: d.category || "Uncategorized",
                        unit: d.unit || "-",
                        orderedQuantity: d.orderedQuantity,
                        pickedQuantity: currentPicked,
                    });
                }
            }

            let printAllocations = allocations;
            if (printAllocations.length === 0) {
                const allocResult = await fetchAllocationsWithBatches(activeBatch.id, activeBatch.branchId).catch(() => ({ allocations: [], availableBatches: [] }));
                printAllocations = allocResult.allocations || [];
            }

            // Group by product to replicate the per-product idx used when building lotPickedQtys keys
            const printAllocByProduct = new Map<number, LotAllocation[]>();
            for (const a of printAllocations) {
                const list = printAllocByProduct.get(a.productId) || [];
                list.push(a);
                printAllocByProduct.set(a.productId, list);
            }

            await generateConsolidationPDF({
                consolidatorNo: activeBatch.consolidatorNo,
                branchName: activeBatch.branchName || `Branch #${activeBatch.branchId}`,
                status: activeBatch.status,
                createdAt: activeBatch.createdAt,
                details: Array.from(detailMap.values()),
                invoices: (activeBatch.invoices || []).map((inv) => ({
                    invoiceNo: inv.invoiceNo,
                    customerName: inv.customerName,
                    products: (inv.products || []).map((p) => ({
                        productName: p.productName,
                        productCode: p.productCode,
                        quantity: p.quantity,
                    })),
                })),
                totalInvoices: activeBatch.invoices?.length || 0,
                allocations: printAllocations.map((a) => {
                    const prodAllocs = printAllocByProduct.get(a.productId) || [];
                    const perProductIdx = prodAllocs.indexOf(a);
                    const lotKey = getLotKey(a.productId, a, perProductIdx);
                    const pickedQtyForLot = Number(lotPickedQtys[lotKey] ?? 0);
                    return {
                        productId: a.productId,
                        productName: a.productName,
                        lotName: a.lotName || `Lot #${a.lotId}`,
                        batchNo: a.batchNo || "N/A",
                        manufacturingDate: a.manufacturingDate || null,
                        expiryDate: a.expiryDate || null,
                        quantity: pickedQtyForLot,
                    };
                }),
            });

            toast.success("Warehouse Pick List generated successfully");
        } catch (err: unknown) {
            console.error("Failed to generate pick list PDF:", err);
            const message = err instanceof Error ? err.message : "Failed to generate pick list";
            toast.error(message);
        } finally {
            setPrinting(false);
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
                            const prodAllocations = prodItem.allocations || [];
                            const totalAllocated = prodAllocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
                            const hasNoAllocation = prodAllocations.length === 0 || totalAllocated <= 0;
                            const effectiveMaxPickable = Math.min(maxQty, totalAllocated);
                            const isItemDone = !hasNoAllocation && effectiveMaxPickable > 0 && currentPicked >= effectiveMaxPickable;

                            // Available warehouse batches for this product that haven't been added yet and have available stock (> 0)
                            // Strictly filtered to the consolidation batch's respective branch
                            const availableForProduct = availableBatches.filter(
                                (b) =>
                                    b.productId === prodItem.productId &&
                                    Number(b.availableQuantity || 0) > 0 &&
                                    (!b.branchId || !activeBatch?.branchId || Number(b.branchId) === Number(activeBatch.branchId))
                            );
                            const unallocatedBatches = availableForProduct.filter((b) => {
                                return !prodAllocations.some(
                                    (a) =>
                                        (a.inventoryLotId && a.inventoryLotId === b.inventoryLotId) ||
                                        (a.lotId && a.lotId === b.lotId && a.batchNo === b.batchNo)
                                );
                            });
                            const branchLabel = activeBatch.branchName || `Branch #${activeBatch.branchId}`;
                            const availableBatchOptions: SearchableSelectOption[] = unallocatedBatches
                                .filter((b) => Number(b.availableQuantity || 0) > 0)
                                .map((b) => ({
                                    value: `${b.inventoryLotId || 0}:${b.batchNo}:${b.lotId}`,
                                    label: `${b.lotName || `Lot #${b.lotId}`} - Batch: ${b.batchNo || "N/A"}`,
                                    subLabel: `${branchLabel} | Available: ${b.availableQuantity} | Exp: ${b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "No Expiry"}`,
                                    badge: `${b.availableQuantity} avail`,
                                }));

                            return (
                                <motion.div
                                    key={prodItem.productId}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.2 }}
                                    className={`rounded-xl border p-4 transition-all shadow-2xs ${
                                        hasNoAllocation
                                            ? "border-amber-300/60 bg-amber-50/15 dark:border-amber-900/30 dark:bg-amber-950/10"
                                            : isItemDone
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
                                                    hasNoAllocation
                                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                                                        : isItemDone
                                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                                        : "bg-muted text-muted-foreground"
                                                }`}
                                            >
                                                {hasNoAllocation ? <AlertCircle className="h-5 w-5" /> : isItemDone ? <Check className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                                            </motion.div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-foreground truncate">
                                                        {prodItem.productName}
                                                    </span>
                                                    {hasNoAllocation ? (
                                                        <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                                                            {unallocatedBatches.length > 0 ? "Initial Lots Unallocated - Add from Floor" : "No Allocated Lots - Cannot Pick"}
                                                        </Badge>
                                                    ) : prodItem.orders.length > 1 ? (
                                                        <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 bg-primary/5 text-primary border-primary/20">
                                                            Fulfills {prodItem.orders.length} orders
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                    <span className="font-mono">{prodItem.productCode}</span>
                                                    <span>•</span>
                                                    <span className="font-semibold text-foreground/80">
                                                        Total Demand: {prodItem.totalOrdered} {prodItem.unit}
                                                    </span>
                                                    <span>•</span>
                                                    <span className={hasNoAllocation ? "font-semibold text-amber-700 dark:text-amber-400" : isItemDone ? "font-bold text-emerald-600" : "font-medium text-muted-foreground"}>
                                                        Picked: {currentPicked} / {maxQty}
                                                    </span>
                                                    {!hasNoAllocation && totalAllocated < maxQty && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                                                                Max Available: {totalAllocated} {prodItem.unit}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status Badge */}
                                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                            {isItemDone ? (
                                                <Badge variant="outline" className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1.5">
                                                    <Check className="h-3.5 w-3.5" />
                                                    Picked
                                                </Badge>
                                            ) : currentPicked > 0 ? (
                                                <Badge variant="outline" className="text-xs font-bold px-3 py-1 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                                    In Progress
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Clickable Allocated Storage Lots */}
                                    <div className="mt-3 pt-3 border-t border-border/40">
                                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between flex-wrap gap-2">
                                            <span className="flex items-center gap-1.5">
                                                <Layers className="h-3.5 w-3.5 text-primary" />
                                                Allocated Storage Lots ({prodAllocations.length})
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {availableBatchOptions.length > 0 && (
                                                    <div className="w-56 sm:w-64">
                                                        <SearchableSelect
                                                            options={availableBatchOptions}
                                                            value=""
                                                            placeholder={`+ Add Lot / Batch (${activeBatch.branchName || `Branch #${activeBatch.branchId}`})...`}
                                                            searchPlaceholder={`Search available lot in ${activeBatch.branchName || `Branch #${activeBatch.branchId}`}...`}
                                                            emptyMessage={`No more lots available in ${activeBatch.branchName || `Branch #${activeBatch.branchId}`}`}
                                                            onValueChange={(val) => {
                                                                if (val) handleAddAlternativeLot(prodItem.productId, val);
                                                            }}
                                                            triggerClassName="h-7 text-xs bg-muted/30 hover:bg-muted/60 border-dashed border-primary/40 text-primary font-semibold"
                                                        />
                                                    </div>
                                                )}
                                                <span className="text-[10px] font-normal normal-case text-muted-foreground hidden sm:inline">
                                                    Click batch card to pick
                                                </span>
                                            </div>
                                        </div>

                                        {loadingAllocations ? (
                                            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5 py-1">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Loading lot allocations...
                                            </div>
                                        ) : prodAllocations.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {prodAllocations.map((alloc, idx) => {
                                                    const lotKey = getLotKey(prodItem.productId, alloc, idx);
                                                    const lotCapacity = Number(alloc.quantity || 0);
                                                    const currentLotPicked = Number(lotPickedQtys[lotKey] || 0);
                                                    const isFloorLot = !alloc.reservationIds || alloc.reservationIds.length === 0;

                                                    const isFull = currentLotPicked === lotCapacity && lotCapacity > 0;
                                                    const isPartial = currentLotPicked > 0 && currentLotPicked < lotCapacity;

                                                    return (
                                                        <motion.div
                                                            key={idx}
                                                            whileHover={{ scale: 1.005, y: -1 }}
                                                            className={`flex items-center justify-between text-xs p-2.5 rounded-xl border transition-all text-left ${
                                                                isFull
                                                                    ? "border-emerald-500 bg-emerald-500/10 text-foreground dark:bg-emerald-500/15 dark:border-emerald-500 shadow-xs"
                                                                    : isPartial
                                                                    ? "border-amber-500/60 bg-amber-500/10 text-foreground dark:bg-amber-500/15 dark:border-amber-500/50 shadow-xs"
                                                                    : "border-border/70 bg-background/80 hover:border-primary/50 hover:bg-muted/40"
                                                            }`}
                                                        >
                                                            <div
                                                                className="min-w-0 pr-2 flex-1 cursor-pointer"
                                                                onClick={() => handleToggleLotPick(prodItem.productId, maxQty, alloc, idx)}
                                                            >
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className={`font-bold truncate text-xs ${
                                                                        isFull ? "text-emerald-700 dark:text-emerald-300" : isPartial ? "text-amber-700 dark:text-amber-300" : "text-foreground"
                                                                    }`}>
                                                                        Lot: {alloc.lotName || alloc.batchNo || "Unknown"}
                                                                    </span>
                                                                    {isFloorLot && (
                                                                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-primary/40 text-primary bg-primary/10">
                                                                            Added Lot
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
                                                                    {alloc.batchNo && alloc.batchNo !== alloc.lotName && (
                                                                        <span>Batch: {alloc.batchNo}</span>
                                                                    )}
                                                                    {alloc.expiryDate && (
                                                                        <span>Exp: {alloc.expiryDate}</span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Editable Picked Quantity input & Actions */}
                                                            <div
                                                                className="flex items-center gap-1.5 shrink-0 ml-2"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                                                                    Picked:
                                                                </span>
                                                                <div className="flex items-center gap-1">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        max={isFloorLot ? undefined : lotCapacity}
                                                                        value={currentLotPicked === 0 ? "" : currentLotPicked}
                                                                        placeholder="0"
                                                                        onFocus={(e) => e.currentTarget.select()}
                                                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                                                        onBlur={(e) => {
                                                                            if (e.target.value === "" || isNaN(Number(e.target.value))) {
                                                                                handleLotPickedQtyChange(prodItem.productId, maxQty, alloc, idx, 0);
                                                                            }
                                                                        }}
                                                                        onChange={(e) => {
                                                                            const raw = e.target.value;
                                                                            const val = raw === "" ? 0 : parseInt(raw, 10);
                                                                            handleLotPickedQtyChange(prodItem.productId, maxQty, alloc, idx, val);
                                                                        }}
                                                                        className={`h-7 w-14 text-center font-mono font-bold text-xs rounded-lg px-1 transition-all ${
                                                                            isFull
                                                                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-900 dark:text-emerald-100 font-black focus-visible:ring-emerald-500"
                                                                                : isPartial
                                                                                ? "border-amber-500 bg-amber-500/20 text-amber-900 dark:text-amber-100 font-bold focus-visible:ring-amber-500"
                                                                                : "border-border bg-background/90"
                                                                        }`}
                                                                    />
                                                                    {!isFloorLot && (
                                                                        <span className="text-xs font-mono font-bold text-muted-foreground whitespace-nowrap">
                                                                            / {lotCapacity} units
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant={isFull ? "default" : "outline"}
                                                                    onClick={() => handleToggleLotPick(prodItem.productId, maxQty, alloc, idx)}
                                                                    className={`h-7 px-2 text-[10px] font-bold rounded-lg cursor-pointer ${
                                                                        isFull
                                                                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                            : "text-muted-foreground hover:text-foreground"
                                                                    }`}
                                                                >
                                                                    {isFull ? <Check className="h-3 w-3" /> : "Pick All"}
                                                                </Button>
                                                                {isFloorLot && currentLotPicked === 0 && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleRemoveAlternativeLot(prodItem.productId, alloc, idx);
                                                                        }}
                                                                        title="Remove added lot"
                                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 cursor-pointer"
                                                                    >
                                                                        <X className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-300/60 dark:border-amber-900/50 rounded-lg p-3 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                                    <span>No initial lot allocations recorded for this item.</span>
                                                </div>
                                                {availableBatchOptions.length > 0 ? (
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                                                        <span className="text-xs font-semibold text-foreground">Select warehouse lot to pick:</span>
                                                        <div className="w-64">
                                                            <SearchableSelect
                                                                options={availableBatchOptions}
                                                                value=""
                                                                placeholder={`+ Add ${activeBatch.branchName || `Branch #${activeBatch.branchId}`} Lot...`}
                                                                searchPlaceholder={`Search lot in ${activeBatch.branchName || `Branch #${activeBatch.branchId}`}...`}
                                                                emptyMessage={`No more lots available in ${activeBatch.branchName || `Branch #${activeBatch.branchId}`}`}
                                                                onValueChange={(val) => {
                                                                    if (val) handleAddAlternativeLot(prodItem.productId, val);
                                                                }}
                                                                triggerClassName="h-7 text-xs bg-background hover:bg-muted/60 border-dashed border-primary/50 text-primary font-bold"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-[11px] text-muted-foreground">No available warehouse lots found for this product in {activeBatch.branchName || `Branch #${activeBatch.branchId}`}.</p>
                                                )}
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
                            onClick={handlePrint}
                            disabled={printing || saving || completing}
                            className="rounded-xl font-bold cursor-pointer"
                        >
                            {printing ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5 text-primary" />
                            ) : (
                                <Printer className="h-4 w-4 mr-1.5 text-primary" />
                            )}
                            Print Pick List
                        </Button>
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
                                disabled={saving || completing || totalPicked === 0}
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
