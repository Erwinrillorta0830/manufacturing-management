"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
    X,
    GitCompare,
    Sparkles,
    Trash2,
    Link2,
    TrendingDown,
    TrendingUp,
    CheckCircle2,
    ArrowRight,
    Scale,
    AlertCircle,
    ShieldCheck,
    Tag,
    Boxes
} from "lucide-react";
import { toast } from "sonner";
import { MmPhysicalInventoryDetail, MmOffsetPairing, Product, MmLot, MmInventoryLot } from "../types";

interface ManufacturingOffsettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    lineItems: MmPhysicalInventoryDetail[];
    initialPairings?: MmOffsetPairing[];
    onApplyOffsetting: (pairings: MmOffsetPairing[]) => void;
    isReadOnly?: boolean;
}

const REASON_CODES = [
    "Lot Number Mix-up / Mislabeling",
    "Production Batch Pick Swap",
    "Wrong SKU Tagging",
    "Barcoding Error",
    "UOM Miscount",
    "Packaging Variation"
] as const;

function formatCurrency(val: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(val || 0);
}

export default function ManufacturingOffsettingModal({
    isOpen,
    onClose,
    lineItems,
    initialPairings = [],
    onApplyOffsetting,
    isReadOnly = false
}: ManufacturingOffsettingModalProps) {
    const [activePairings, setActivePairings] = useState<MmOffsetPairing[]>(initialPairings);
    const [selectedShortageId, setSelectedShortageId] = useState<number | null>(null);
    const [selectedSurplusId, setSelectedSurplusId] = useState<number | null>(null);
    const [linkQty, setLinkQty] = useState<string>("");
    const [linkReason, setLinkReason] = useState<string>(REASON_CODES[0]);
    const [linkNotes, setLinkNotes] = useState<string>("");

    // Calculate allocated offset quantity per detail line item from active pairings
    const allocatedOffsetMap = useMemo(() => {
        const map = new Map<number, number>();
        for (const pair of activePairings) {
            const shortAcc = map.get(pair.shortage_detail_id) || 0;
            map.set(pair.shortage_detail_id, shortAcc + pair.offset_qty);

            const surpAcc = map.get(pair.surplus_detail_id) || 0;
            map.set(pair.surplus_detail_id, surpAcc + pair.offset_qty);
        }
        return map;
    }, [activePairings]);

    // Separate Shortage line items (physical < system or variance < 0)
    const shortageItems = useMemo(() => {
        return lineItems
            .map(item => {
                const sys = Number(item.system_count || 0);
                const phys = Number(item.physical_count ?? sys);
                const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);

                if (rawVar >= -0.0001) return null;

                const totalShortage = Math.abs(rawVar);
                const detailId = item.physical_inventory_detail_id || item.id || 0;
                const allocated = allocatedOffsetMap.get(detailId) || 0;
                const remaining = Math.max(0, totalShortage - allocated);

                const prodObj = typeof item.product_id === "object" ? (item.product_id as Product) : null;
                const prodName = prodObj?.product_name || `Product #${item.product_id}`;
                const prodCode = prodObj?.product_code || "";

                const lotObj = typeof item.lot_id === "object" ? (item.lot_id as MmLot) : null;
                const lotName = lotObj?.lot_name || `Lot #${item.lot_id}`;

                const invLotObj = typeof item.inventory_lot_id === "object" ? (item.inventory_lot_id as MmInventoryLot) : null;
                const batchNo = item.batch_no || invLotObj?.batch_no || "N/A";
                const unitCost = Number(item.unit_cost || prodObj?.cost_per_unit || 0);

                return {
                    ...item,
                    detailId,
                    resolvedName: prodName,
                    resolvedCode: prodCode,
                    resolvedLotName: lotName,
                    resolvedBatchNo: batchNo,
                    totalShortage,
                    remainingShortage: remaining,
                    unitCost,
                    shortageAmount: remaining * unitCost
                };
            })
            .filter((i): i is NonNullable<typeof i> => i !== null && i.remainingShortage > 0.0001);
    }, [lineItems, allocatedOffsetMap]);

    // Separate Surplus line items (physical > system or variance > 0)
    const surplusItems = useMemo(() => {
        return lineItems
            .map(item => {
                const sys = Number(item.system_count || 0);
                const phys = Number(item.physical_count ?? sys);
                const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);

                if (rawVar <= 0.0001) return null;

                const totalSurplus = rawVar;
                const detailId = item.physical_inventory_detail_id || item.id || 0;
                const allocated = allocatedOffsetMap.get(detailId) || 0;
                const remaining = Math.max(0, totalSurplus - allocated);

                const prodObj = typeof item.product_id === "object" ? (item.product_id as Product) : null;
                const prodName = prodObj?.product_name || `Product #${item.product_id}`;
                const prodCode = prodObj?.product_code || "";

                const lotObj = typeof item.lot_id === "object" ? (item.lot_id as MmLot) : null;
                const lotName = lotObj?.lot_name || `Lot #${item.lot_id}`;

                const invLotObj = typeof item.inventory_lot_id === "object" ? (item.inventory_lot_id as MmInventoryLot) : null;
                const batchNo = item.batch_no || invLotObj?.batch_no || "N/A";
                const unitCost = Number(item.unit_cost || prodObj?.cost_per_unit || 0);

                return {
                    ...item,
                    detailId,
                    resolvedName: prodName,
                    resolvedCode: prodCode,
                    resolvedLotName: lotName,
                    resolvedBatchNo: batchNo,
                    totalSurplus,
                    remainingSurplus: remaining,
                    unitCost,
                    surplusAmount: remaining * unitCost
                };
            })
            .filter((i): i is NonNullable<typeof i> => i !== null && i.remainingSurplus > 0.0001);
    }, [lineItems, allocatedOffsetMap]);

    // Selected shortage & surplus detail references
    const activeShortage = useMemo(() => {
        return shortageItems.find(i => i.detailId === selectedShortageId) || null;
    }, [shortageItems, selectedShortageId]);

    const activeSurplus = useMemo(() => {
        return surplusItems.find(i => i.detailId === selectedSurplusId) || null;
    }, [surplusItems, selectedSurplusId]);

    // Auto-prefill link quantity when selection changes
    React.useEffect(() => {
        if (activeShortage && activeSurplus) {
            const maxPossible = Math.min(activeShortage.remainingShortage, activeSurplus.remainingSurplus);
            setLinkQty(String(maxPossible));
        } else {
            setLinkQty("");
        }
    }, [activeShortage, activeSurplus]);

    // Calculate Summary Statistics
    const summary = useMemo(() => {
        let totalShortageQty = 0;
        let totalShortageCost = 0;
        let totalSurplusQty = 0;
        let totalSurplusCost = 0;

        for (const item of lineItems) {
            const sys = Number(item.system_count || 0);
            const phys = Number(item.physical_count ?? sys);
            const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);
            const unitCost = Number(item.unit_cost || 0);

            if (rawVar < 0) {
                const qty = Math.abs(rawVar);
                totalShortageQty += qty;
                totalShortageCost += qty * unitCost;
            } else if (rawVar > 0) {
                totalSurplusQty += rawVar;
                totalSurplusCost += rawVar * unitCost;
            }
        }

        let totalOffsetQty = 0;
        let netImpact = 0;

        for (const p of activePairings) {
            totalOffsetQty += p.offset_qty;
            netImpact += p.net_financial_impact;
        }

        return {
            totalShortageQty,
            totalShortageCost,
            totalSurplusQty,
            totalSurplusCost,
            totalOffsetQty,
            netImpact
        };
    }, [lineItems, activePairings]);

    // Add manual pairing
    const handleAddPairing = useCallback(() => {
        if (!activeShortage || !activeSurplus) {
            toast.error("Please select one shortage lot and one surplus lot to pair.");
            return;
        }

        const qty = parseFloat(linkQty);
        if (isNaN(qty) || qty <= 0) {
            toast.error("Please enter a valid positive quantity to offset.");
            return;
        }

        const maxPossible = Math.min(activeShortage.remainingShortage, activeSurplus.remainingSurplus);
        if (qty > maxPossible + 0.0001) {
            toast.error(`Offset quantity cannot exceed ${maxPossible} units.`);
            return;
        }

        const shortageProdId = typeof activeShortage.product_id === "object" ? Number((activeShortage.product_id as Product).product_id) : Number(activeShortage.product_id);
        const surplusProdId = typeof activeSurplus.product_id === "object" ? Number((activeSurplus.product_id as Product).product_id) : Number(activeSurplus.product_id);

        const shortageLotId = typeof activeShortage.lot_id === "object" ? Number((activeShortage.lot_id as MmLot).lot_id) : Number(activeShortage.lot_id);
        const surplusLotId = typeof activeSurplus.lot_id === "object" ? Number((activeSurplus.lot_id as MmLot).lot_id) : Number(activeSurplus.lot_id);

        const unitCostVar = activeSurplus.unitCost - activeShortage.unitCost;
        const netFinancialImpact = qty * unitCostVar;

        const newPair: MmOffsetPairing = {
            id: `OFF-${Date.now().toString().slice(-6)}`,
            shortage_detail_id: activeShortage.detailId,
            shortage_product_id: shortageProdId,
            shortage_product_name: activeShortage.resolvedName,
            shortage_product_code: activeShortage.resolvedCode,
            shortage_lot_id: shortageLotId,
            shortage_lot_name: activeShortage.resolvedLotName,
            shortage_batch_no: activeShortage.resolvedBatchNo,

            surplus_detail_id: activeSurplus.detailId,
            surplus_product_id: surplusProdId,
            surplus_product_name: activeSurplus.resolvedName,
            surplus_product_code: activeSurplus.resolvedCode,
            surplus_lot_id: surplusLotId,
            surplus_lot_name: activeSurplus.resolvedLotName,
            surplus_batch_no: activeSurplus.resolvedBatchNo,

            offset_qty: qty,
            shortage_unit_cost: activeShortage.unitCost,
            surplus_unit_cost: activeSurplus.unitCost,
            unit_cost_variance: unitCostVar,
            net_financial_impact: netFinancialImpact,
            reason_code: linkReason,
            notes: linkNotes.trim() || undefined,
            created_at: new Date().toISOString()
        };

        setActivePairings(prev => [...prev, newPair]);
        setSelectedShortageId(null);
        setSelectedSurplusId(null);
        setLinkQty("");
        setLinkNotes("");
        toast.success(`Successfully offset ${qty} units between Lot ${activeShortage.resolvedLotName} and Lot ${activeSurplus.resolvedLotName}`);
    }, [activeShortage, activeSurplus, linkQty, linkReason, linkNotes]);

    // Remove pairing
    const handleRemovePairing = useCallback((pairId: string) => {
        setActivePairings(prev => prev.filter(p => p.id !== pairId));
        toast.info("Offset pairing removed.");
    }, []);

    // Smart Heuristic: Auto-Match Same Product Across Different Lots
    const handleAutoMatchSameProduct = useCallback(() => {
        let matchCount = 0;
        const newPairs: MmOffsetPairing[] = [...activePairings];

        // Track remaining quantities during auto-matching
        const tempAllocMap = new Map<number, number>();
        for (const p of newPairs) {
            tempAllocMap.set(p.shortage_detail_id, (tempAllocMap.get(p.shortage_detail_id) || 0) + p.offset_qty);
            tempAllocMap.set(p.surplus_detail_id, (tempAllocMap.get(p.surplus_detail_id) || 0) + p.offset_qty);
        }

        // Helper to get raw product ID
        const getProdId = (pId: number | Product) => typeof pId === "object" ? Number(pId.product_id) : Number(pId);
        const getLotId = (lId: number | MmLot) => typeof lId === "object" ? Number(lId.lot_id) : Number(lId);

        for (const item of lineItems) {
            const sys = Number(item.system_count || 0);
            const phys = Number(item.physical_count ?? sys);
            const rawVar = item.variance !== undefined ? Number(item.variance) : (phys - sys);
            if (rawVar >= -0.0001) continue; // Only process shortage lines

            const sDetailId = item.physical_inventory_detail_id || item.id || 0;
            const totalShort = Math.abs(rawVar);
            let remShort = Math.max(0, totalShort - (tempAllocMap.get(sDetailId) || 0));
            if (remShort <= 0.0001) continue;

            const sProdId = getProdId(item.product_id);
            const sLotId = getLotId(item.lot_id);
            const prodObj = typeof item.product_id === "object" ? (item.product_id as Product) : null;
            const lotObj = typeof item.lot_id === "object" ? (item.lot_id as MmLot) : null;
            const invLotObj = typeof item.inventory_lot_id === "object" ? (item.inventory_lot_id as MmInventoryLot) : null;

            const sProdName = prodObj?.product_name || `Product #${sProdId}`;
            const sProdCode = prodObj?.product_code || "";
            const sLotName = lotObj?.lot_name || `Lot #${sLotId}`;
            const sBatchNo = item.batch_no || invLotObj?.batch_no || "N/A";
            const sUnitCost = Number(item.unit_cost || prodObj?.cost_per_unit || 0);

            // Find matching surplus line items for the EXACT SAME product
            for (const surpItem of lineItems) {
                if (remShort <= 0.0001) break;

                const surpSys = Number(surpItem.system_count || 0);
                const surpPhys = Number(surpItem.physical_count ?? surpSys);
                const surpRawVar = surpItem.variance !== undefined ? Number(surpItem.variance) : (surpPhys - surpSys);
                if (surpRawVar <= 0.0001) continue;

                const surpProdId = getProdId(surpItem.product_id);
                if (surpProdId !== sProdId) continue; // Must be same product!

                const surpDetailId = surpItem.physical_inventory_detail_id || surpItem.id || 0;
                const totalSurp = surpRawVar;
                const remSurp = Math.max(0, totalSurp - (tempAllocMap.get(surpDetailId) || 0));
                if (remSurp <= 0.0001) continue;

                const surpLotId = getLotId(surpItem.lot_id);
                const surpProdObj = typeof surpItem.product_id === "object" ? (surpItem.product_id as Product) : null;
                const surpLotObj = typeof surpItem.lot_id === "object" ? (surpItem.lot_id as MmLot) : null;
                const surpInvLotObj = typeof surpItem.inventory_lot_id === "object" ? (surpItem.inventory_lot_id as MmInventoryLot) : null;

                const surpLotName = surpLotObj?.lot_name || `Lot #${surpLotId}`;
                const surpBatchNo = surpItem.batch_no || surpInvLotObj?.batch_no || "N/A";
                const surpUnitCost = Number(surpItem.unit_cost || surpProdObj?.cost_per_unit || 0);

                const matchQty = Math.min(remShort, remSurp);
                const unitCostVar = surpUnitCost - sUnitCost;

                const pair: MmOffsetPairing = {
                    id: `OFF-AUTO-${Date.now().toString().slice(-5)}-${matchCount + 1}`,
                    shortage_detail_id: sDetailId,
                    shortage_product_id: sProdId,
                    shortage_product_name: sProdName,
                    shortage_product_code: sProdCode,
                    shortage_lot_id: sLotId,
                    shortage_lot_name: sLotName,
                    shortage_batch_no: sBatchNo,

                    surplus_detail_id: surpDetailId,
                    surplus_product_id: surpProdId,
                    surplus_product_name: sProdName,
                    surplus_product_code: sProdCode,
                    surplus_lot_id: surpLotId,
                    surplus_lot_name: surpLotName,
                    surplus_batch_no: surpBatchNo,

                    offset_qty: matchQty,
                    shortage_unit_cost: sUnitCost,
                    surplus_unit_cost: surpUnitCost,
                    unit_cost_variance: unitCostVar,
                    net_financial_impact: matchQty * unitCostVar,
                    reason_code: "Lot Number Mix-up / Mislabeling",
                    notes: "Auto-matched same-product discrepancy across lots",
                    created_at: new Date().toISOString()
                };

                newPairs.push(pair);
                tempAllocMap.set(sDetailId, (tempAllocMap.get(sDetailId) || 0) + matchQty);
                tempAllocMap.set(surpDetailId, (tempAllocMap.get(surpDetailId) || 0) + matchQty);
                remShort -= matchQty;
                matchCount++;
            }
        }

        if (matchCount > 0) {
            setActivePairings(newPairs);
            toast.success(`Auto-matched ${matchCount} cross-lot item pairings for identical products!`);
        } else {
            toast.info("No unallocated same-product cross-lot pairs found to auto-match.");
        }
    }, [lineItems, activePairings]);

    const handleSaveAndClose = useCallback(() => {
        onApplyOffsetting(activePairings);
        onClose();
    }, [onApplyOffsetting, activePairings, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
            <div className="relative flex flex-col w-full max-w-6xl max-h-[92vh] bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/40 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                            <GitCompare className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                Physical Inventory Offsetting Workspace
                                <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                    Lot & Batch Aware
                                </span>
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Pair shortage lots against surplus lots at the product level while preserving manufacturing lot traceability.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!isReadOnly && (
                            <button
                                type="button"
                                onClick={handleAutoMatchSameProduct}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Auto-Match Same Product
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Content Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Summary KPI Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                                <span className="text-xs font-semibold uppercase tracking-wider">Total Shortage (Deficit)</span>
                                <TrendingDown className="h-4 w-4" />
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                                <span className="text-xl font-bold text-foreground">{summary.totalShortageQty} units</span>
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{formatCurrency(summary.totalShortageCost)}</span>
                            </div>
                        </div>

                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                                <span className="text-xs font-semibold uppercase tracking-wider">Total Overage (Surplus)</span>
                                <TrendingUp className="h-4 w-4" />
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                                <span className="text-xl font-bold text-foreground">{summary.totalSurplusQty} units</span>
                                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{formatCurrency(summary.totalSurplusCost)}</span>
                            </div>
                        </div>

                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                                <span className="text-xs font-semibold uppercase tracking-wider">Offset Allocated</span>
                                <Scale className="h-4 w-4" />
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                                <span className="text-xl font-bold text-foreground">{summary.totalOffsetQty} units</span>
                                <span className="text-xs font-medium text-muted-foreground">{activePairings.length} pairs linked</span>
                            </div>
                        </div>

                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Net Cost Variance</span>
                                <ShieldCheck className="h-4 w-4" />
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                                <span className={`text-xl font-bold ${summary.netImpact > 0 ? "text-emerald-600" : summary.netImpact < 0 ? "text-amber-600" : "text-foreground"}`}>
                                    {formatCurrency(summary.netImpact)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">Price difference impact</span>
                            </div>
                        </div>
                    </div>

                    {!isReadOnly && (
                        /* Interactive Pairing Selection Section */
                        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                            <div className="flex items-center justify-between border-b pb-3">
                                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <Link2 className="h-4 w-4 text-indigo-500" />
                                    Manual Lot-to-Lot Matching Builder
                                </h4>
                                <span className="text-xs text-muted-foreground">
                                    Select one shortage lot item and one surplus lot item to pair
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Shortage Items List (Left Column) */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                        <TrendingDown className="h-3.5 w-3.5" />
                                        Shortage Lots (Deficit Items)
                                    </label>
                                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 border border-border rounded-lg p-2 bg-muted/20">
                                        {shortageItems.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-muted-foreground">
                                                No unallocated shortage lots remaining.
                                            </div>
                                        ) : (
                                            shortageItems.map(item => {
                                                const isSelected = selectedShortageId === item.detailId;
                                                return (
                                                    <div
                                                        key={item.detailId}
                                                        onClick={() => setSelectedShortageId(item.detailId)}
                                                        className={`cursor-pointer rounded-lg border p-3 text-xs transition-all ${
                                                            isSelected
                                                                ? "border-amber-500 bg-amber-500/10 shadow-xs ring-1 ring-amber-500"
                                                                : "border-border bg-background hover:border-amber-500/40"
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between font-medium">
                                                            <span className="font-bold text-foreground">{item.resolvedName}</span>
                                                            <span className="text-amber-600 dark:text-amber-400 font-semibold font-mono">
                                                                -{item.remainingShortage} {item.unit_id ? "" : "units"}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <Boxes className="h-3 w-3 text-amber-500" />
                                                                Lot: {item.resolvedLotName}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Tag className="h-3 w-3 text-muted-foreground" />
                                                                Batch: {item.resolvedBatchNo}
                                                            </span>
                                                            <span>Cost: {formatCurrency(item.unitCost)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Surplus Items List (Right Column) */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                        <TrendingUp className="h-3.5 w-3.5" />
                                        Surplus Lots (Overage Items)
                                    </label>
                                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 border border-border rounded-lg p-2 bg-muted/20">
                                        {surplusItems.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-muted-foreground">
                                                No unallocated surplus lots remaining.
                                            </div>
                                        ) : (
                                            surplusItems.map(item => {
                                                const isSelected = selectedSurplusId === item.detailId;
                                                return (
                                                    <div
                                                        key={item.detailId}
                                                        onClick={() => setSelectedSurplusId(item.detailId)}
                                                        className={`cursor-pointer rounded-lg border p-3 text-xs transition-all ${
                                                            isSelected
                                                                ? "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500"
                                                                : "border-border bg-background hover:border-emerald-500/40"
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between font-medium">
                                                            <span className="font-bold text-foreground">{item.resolvedName}</span>
                                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                                                                +{item.remainingSurplus} {item.unit_id ? "" : "units"}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <Boxes className="h-3 w-3 text-emerald-500" />
                                                                Lot: {item.resolvedLotName}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Tag className="h-3 w-3 text-muted-foreground" />
                                                                Batch: {item.resolvedBatchNo}
                                                            </span>
                                                            <span>Cost: {formatCurrency(item.unitCost)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Link Action Controls Bar */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-3 border-t bg-muted/20 p-3 rounded-lg">
                                <div className="flex-1 space-y-1">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Offset Quantity</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={linkQty}
                                        onChange={e => setLinkQty(e.target.value)}
                                        placeholder="Qty to offset"
                                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>

                                <div className="flex-1 space-y-1">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Reason Code</label>
                                    <select
                                        value={linkReason}
                                        onChange={e => setLinkReason(e.target.value)}
                                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                    >
                                        {REASON_CODES.map(code => (
                                            <option key={code} value={code}>
                                                {code}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex-1 space-y-1">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Notes (Optional)</label>
                                    <input
                                        type="text"
                                        value={linkNotes}
                                        onChange={e => setLinkNotes(e.target.value)}
                                        placeholder="Reason / audit remark"
                                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleAddPairing}
                                    disabled={!activeShortage || !activeSurplus || !linkQty}
                                    className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                                >
                                    <Link2 className="h-3.5 w-3.5" />
                                    Link Offset Pair
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Active Offset Pairings Table */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                Active Offset Pairings ({activePairings.length})
                            </h4>
                        </div>

                        {activePairings.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-8 text-center bg-muted/10">
                                <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
                                <p className="mt-2 text-xs font-medium text-muted-foreground">
                                    No offset pairings linked yet. Use the manual matcher above or click &quot;Auto-Match Same Product&quot; to pair lot discrepancies.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-border bg-card">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-muted/60 border-b text-[11px] font-bold text-muted-foreground uppercase">
                                        <tr>
                                            <th className="px-4 py-3">Shortage Item & Lot</th>
                                            <th className="px-4 py-3 text-center"><ArrowRight className="mx-auto h-3.5 w-3.5" /></th>
                                            <th className="px-4 py-3">Surplus Item & Lot</th>
                                            <th className="px-4 py-3 text-right">Offset Qty</th>
                                            <th className="px-4 py-3 text-right">Net Financial Impact</th>
                                            <th className="px-4 py-3">Reason Code</th>
                                            {!isReadOnly && <th className="px-4 py-3 text-center">Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {activePairings.map((pair) => (
                                            <tr key={pair.id} className="hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-foreground">{pair.shortage_product_name}</div>
                                                    <div className="text-[11px] text-amber-600 dark:text-amber-400">
                                                        Lot: {pair.shortage_lot_name || `Lot #${pair.shortage_lot_id}`} | Batch: {pair.shortage_batch_no || "N/A"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">
                                                        VS
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-foreground">{pair.surplus_product_name}</div>
                                                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                                        Lot: {pair.surplus_lot_name || `Lot #${pair.surplus_lot_id}`} | Batch: {pair.surplus_batch_no || "N/A"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                                                    {pair.offset_qty}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-bold">
                                                    <span className={pair.net_financial_impact > 0 ? "text-emerald-600" : pair.net_financial_impact < 0 ? "text-amber-600" : "text-muted-foreground"}>
                                                        {formatCurrency(pair.net_financial_impact)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                                                        {pair.reason_code}
                                                    </span>
                                                    {pair.notes && <div className="text-[10px] text-muted-foreground italic mt-0.5">{pair.notes}</div>}
                                                </td>
                                                {!isReadOnly && (
                                                    <td className="px-4 py-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemovePairing(pair.id)}
                                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                                                            title="Unlink pair"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t px-6 py-4 bg-muted/40 shrink-0">
                    <div className="text-xs text-muted-foreground">
                        Total {activePairings.length} offset pair(s) will be applied to balance physical count records.
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-input bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveAndClose}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            Apply & Save Offsetting
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
