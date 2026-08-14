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
    Scale
} from "lucide-react";
import { toast } from "sonner";
import { PhysicalInventoryLineItem, OffsetPairing } from "../types";
import { formatCurrency } from "../utils";

interface OffsettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    lineItems: PhysicalInventoryLineItem[];
    initialPairings?: OffsetPairing[];
    onApplyOffsetting: (pairings: OffsetPairing[]) => void;
    isReadOnly?: boolean;
}

const REASON_CODES = [
    "Wrong Item Picked",
    "Barcoding/Tagging Error",
    "UOM Miscount",
    "Packaging Variation"
] as const;

export default function OffsettingModal({
    isOpen,
    onClose,
    lineItems,
    initialPairings = [],
    onApplyOffsetting,
    isReadOnly = false
}: OffsettingModalProps) {
    const [activePairings, setActivePairings] = useState<OffsetPairing[]>(initialPairings);
    const [selectedShortageId, setSelectedShortageId] = useState<string | null>(null);
    const [selectedSurplusId, setSelectedSurplusId] = useState<string | null>(null);
    const [linkQty, setLinkQty] = useState<string>("");
    const [linkReason, setLinkReason] = useState<string>(REASON_CODES[0]);

    // Calculate allocated offset quantity per line item from active pairings
    const allocatedOffsetMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const pair of activePairings) {
            const shortAcc = map.get(pair.shortage_item_id) || 0;
            map.set(pair.shortage_item_id, shortAcc + pair.offset_qty);

            const surpAcc = map.get(pair.surplus_item_id) || 0;
            map.set(pair.surplus_item_id, surpAcc + pair.offset_qty);
        }
        return map;
    }, [activePairings]);

    // Separate Shortage items (variance < 0) with remaining unmatched quantities
    const shortageItems = useMemo(() => {
        return lineItems
            .map(item => {
                const sys = item.system_count || 0;
                const phys = item.physical_count !== null ? item.physical_count : sys;
                const rawVar = item.variance !== undefined ? item.variance : (phys - sys);
                const factor = item.uom_factor || 1;
                const baseVar = item.variance_base !== undefined ? item.variance_base : (rawVar * factor);

                if (baseVar >= -0.0001) return null;

                const totalShortage = Math.abs(baseVar);
                const allocated = allocatedOffsetMap.get(item.id) || 0;
                const remaining = Math.max(0, totalShortage - allocated);

                const prodName = typeof item.product_id === "object"
                    ? (item.product_id?.product_name || item.product_name || item.sku_name || "Product")
                    : (item.product_name || item.sku_name || "Product");

                const prodCode = typeof item.product_id === "object"
                    ? (item.product_id?.product_code || item.product_code || item.sku_code || "")
                    : (item.product_code || item.sku_code || "");

                const catName = typeof item.product_id === "object" && typeof item.product_id?.category === "object"
                    ? (item.product_id?.category?.category_name || item.category_name || "General")
                    : (item.category_name || "General");

                const unitPrice = item.unit_price || 0;

                return {
                    ...item,
                    resolvedName: prodName,
                    resolvedCode: prodCode,
                    resolvedCategory: catName,
                    totalShortage,
                    remainingShortage: remaining,
                    unitPrice,
                    shortageAmount: remaining * unitPrice
                };
            })
            .filter((i): i is NonNullable<typeof i> => i !== null && i.remainingShortage > 0.0001);
    }, [lineItems, allocatedOffsetMap]);

    // Separate Surplus items (variance > 0) with remaining unmatched quantities
    const surplusItems = useMemo(() => {
        return lineItems
            .map(item => {
                const sys = item.system_count || 0;
                const phys = item.physical_count !== null ? item.physical_count : sys;
                const rawVar = item.variance !== undefined ? item.variance : (phys - sys);
                const factor = item.uom_factor || 1;
                const baseVar = item.variance_base !== undefined ? item.variance_base : (rawVar * factor);

                if (baseVar <= 0.0001) return null;

                const totalSurplus = baseVar;
                const allocated = allocatedOffsetMap.get(item.id) || 0;
                const remaining = Math.max(0, totalSurplus - allocated);

                const prodName = typeof item.product_id === "object"
                    ? (item.product_id?.product_name || item.product_name || item.sku_name || "Product")
                    : (item.product_name || item.sku_name || "Product");

                const prodCode = typeof item.product_id === "object"
                    ? (item.product_id?.product_code || item.product_code || item.sku_code || "")
                    : (item.product_code || item.sku_code || "");

                const catName = typeof item.product_id === "object" && typeof item.product_id?.category === "object"
                    ? (item.product_id?.category?.category_name || item.category_name || "General")
                    : (item.category_name || "General");

                const unitPrice = item.unit_price || 0;

                return {
                    ...item,
                    resolvedName: prodName,
                    resolvedCode: prodCode,
                    resolvedCategory: catName,
                    totalSurplus,
                    remainingSurplus: remaining,
                    unitPrice,
                    surplusAmount: remaining * unitPrice
                };
            })
            .filter((i): i is NonNullable<typeof i> => i !== null && i.remainingSurplus > 0.0001);
    }, [lineItems, allocatedOffsetMap]);

    // Selected objects
    const currentShortage = useMemo(() => shortageItems.find(i => i.id === selectedShortageId), [shortageItems, selectedShortageId]);
    const currentSurplus = useMemo(() => surplusItems.find(i => i.id === selectedSurplusId), [surplusItems, selectedSurplusId]);

    // Maximum linkable quantity
    const maxLinkableQty = useMemo(() => {
        if (!currentShortage || !currentSurplus) return 0;
        return Math.min(currentShortage.remainingShortage, currentSurplus.remainingSurplus);
    }, [currentShortage, currentSurplus]);

    // Select helper
    const handleSelectShortage = (id: string) => {
        setSelectedShortageId(prev => prev === id ? null : id);
        if (currentSurplus) {
            const short = shortageItems.find(i => i.id === id);
            if (short) {
                setLinkQty(String(Math.min(short.remainingShortage, currentSurplus.remainingSurplus)));
            }
        }
    };

    const handleSelectSurplus = (id: string) => {
        setSelectedSurplusId(prev => prev === id ? null : id);
        if (currentShortage) {
            const surp = surplusItems.find(i => i.id === id);
            if (surp) {
                setLinkQty(String(Math.min(currentShortage.remainingShortage, surp.remainingSurplus)));
            }
        }
    };

    // Manual Link selected pair
    const handleLinkPair = () => {
        if (!currentShortage || !currentSurplus) {
            toast.error("Please select 1 shortage SKU and 1 surplus SKU to link.");
            return;
        }

        const qtyNum = parseFloat(linkQty);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            toast.error("Please enter a valid positive offset quantity.");
            return;
        }

        if (qtyNum > maxLinkableQty + 0.0001) {
            toast.error(`Offset quantity cannot exceed available variance (${maxLinkableQty.toLocaleString()}).`);
            return;
        }

        const priceVar = currentSurplus.unitPrice - currentShortage.unitPrice;
        const netImpact = priceVar * qtyNum;

        const newPair: OffsetPairing = {
            id: `OFF-${String(activePairings.length + 1).padStart(3, "0")}`,
            shortage_item_id: currentShortage.id,
            shortage_product_name: currentShortage.resolvedName,
            shortage_product_code: currentShortage.resolvedCode,
            shortage_category: currentShortage.resolvedCategory,
            surplus_item_id: currentSurplus.id,
            surplus_product_name: currentSurplus.resolvedName,
            surplus_product_code: currentSurplus.resolvedCode,
            surplus_category: currentSurplus.resolvedCategory,
            offset_qty: qtyNum,
            shortage_unit_price: currentShortage.unitPrice,
            surplus_unit_price: currentSurplus.unitPrice,
            unit_price_variance: priceVar,
            net_financial_impact: netImpact,
            reason_code: linkReason,
        };

        setActivePairings(prev => [...prev, newPair]);
        setSelectedShortageId(null);
        setSelectedSurplusId(null);
        setLinkQty("");
        toast.success(`Offsetting pair ${newPair.id} linked successfully.`);
    };

    // Remove Pair
    const handleRemovePair = (pairId: string) => {
        setActivePairings(prev => prev.filter(p => p.id !== pairId));
        toast.info(`Offsetting pair ${pairId} removed.`);
    };

    // Multi-tier Auto-Suggest Algorithm
    const handleAutoSuggest = useCallback(() => {
        const currentPairings = [...activePairings];
        const remainingShortages = shortageItems.map(s => ({ ...s }));
        const remainingSurpluses = surplusItems.map(s => ({ ...s }));

        let suggestedCount = 0;

        // TIER 1: Same Category + Exact absolute base variance match
        for (let i = 0; i < remainingShortages.length; i++) {
            const short = remainingShortages[i];
            if (short.remainingShortage <= 0.0001) continue;

            for (let j = 0; j < remainingSurpluses.length; j++) {
                const surp = remainingSurpluses[j];
                if (surp.remainingSurplus <= 0.0001) continue;

                if (short.resolvedCategory === surp.resolvedCategory && Math.abs(short.remainingShortage - surp.remainingSurplus) < 0.0001) {
                    const matchQty = short.remainingShortage;
                    const priceVar = surp.unitPrice - short.unitPrice;
                    const newPair: OffsetPairing = {
                        id: `OFF-${String(currentPairings.length + 1).padStart(3, "0")}`,
                        shortage_item_id: short.id,
                        shortage_product_name: short.resolvedName,
                        shortage_product_code: short.resolvedCode,
                        shortage_category: short.resolvedCategory,
                        surplus_item_id: surp.id,
                        surplus_product_name: surp.resolvedName,
                        surplus_product_code: surp.resolvedCode,
                        surplus_category: surp.resolvedCategory,
                        offset_qty: matchQty,
                        shortage_unit_price: short.unitPrice,
                        surplus_unit_price: surp.unitPrice,
                        unit_price_variance: priceVar,
                        net_financial_impact: priceVar * matchQty,
                        reason_code: "Barcoding/Tagging Error",
                        notes: "Auto-matched: Tier 1 (Exact Qty & Category Match)"
                    };

                    currentPairings.push(newPair);
                    short.remainingShortage = 0;
                    surp.remainingSurplus = 0;
                    suggestedCount++;
                    break;
                }
            }
        }

        // TIER 2: Same Category + Partial quantity overlap
        for (let i = 0; i < remainingShortages.length; i++) {
            const short = remainingShortages[i];
            if (short.remainingShortage <= 0.0001) continue;

            for (let j = 0; j < remainingSurpluses.length; j++) {
                const surp = remainingSurpluses[j];
                if (surp.remainingSurplus <= 0.0001) continue;

                if (short.resolvedCategory === surp.resolvedCategory) {
                    const matchQty = Math.min(short.remainingShortage, surp.remainingSurplus);
                    if (matchQty > 0.0001) {
                        const priceVar = surp.unitPrice - short.unitPrice;
                        const newPair: OffsetPairing = {
                            id: `OFF-${String(currentPairings.length + 1).padStart(3, "0")}`,
                            shortage_item_id: short.id,
                            shortage_product_name: short.resolvedName,
                            shortage_product_code: short.resolvedCode,
                            shortage_category: short.resolvedCategory,
                            surplus_item_id: surp.id,
                            surplus_product_name: surp.resolvedName,
                            surplus_product_code: surp.resolvedCode,
                            surplus_category: surp.resolvedCategory,
                            offset_qty: matchQty,
                            shortage_unit_price: short.unitPrice,
                            surplus_unit_price: surp.unitPrice,
                            unit_price_variance: priceVar,
                            net_financial_impact: priceVar * matchQty,
                            reason_code: "Wrong Item Picked",
                            notes: "Auto-matched: Tier 2 (Same Category Swap)"
                        };

                        currentPairings.push(newPair);
                        short.remainingShortage -= matchQty;
                        surp.remainingSurplus -= matchQty;
                        suggestedCount++;
                    }
                }
            }
        }

        // TIER 3: Exact Financial Value Swap (Different Category)
        for (let i = 0; i < remainingShortages.length; i++) {
            const short = remainingShortages[i];
            if (short.remainingShortage <= 0.0001) continue;

            for (let j = 0; j < remainingSurpluses.length; j++) {
                const surp = remainingSurpluses[j];
                if (surp.remainingSurplus <= 0.0001) continue;

                const shortVal = short.remainingShortage * short.unitPrice;
                const surpVal = surp.remainingSurplus * surp.unitPrice;

                if (Math.abs(shortVal - surpVal) < 1.0 && short.unitPrice > 0 && surp.unitPrice > 0) {
                    const matchQty = Math.min(short.remainingShortage, surp.remainingSurplus);
                    if (matchQty > 0.0001) {
                        const priceVar = surp.unitPrice - short.unitPrice;
                        const newPair: OffsetPairing = {
                            id: `OFF-${String(currentPairings.length + 1).padStart(3, "0")}`,
                            shortage_item_id: short.id,
                            shortage_product_name: short.resolvedName,
                            shortage_product_code: short.resolvedCode,
                            shortage_category: short.resolvedCategory,
                            surplus_item_id: surp.id,
                            surplus_product_name: surp.resolvedName,
                            surplus_product_code: surp.resolvedCode,
                            surplus_category: surp.resolvedCategory,
                            offset_qty: matchQty,
                            shortage_unit_price: short.unitPrice,
                            surplus_unit_price: surp.unitPrice,
                            unit_price_variance: priceVar,
                            net_financial_impact: priceVar * matchQty,
                            reason_code: "Packaging Variation",
                            notes: "Auto-matched: Tier 3 (Financial Value Match)"
                        };

                        currentPairings.push(newPair);
                        short.remainingShortage -= matchQty;
                        surp.remainingSurplus -= matchQty;
                        suggestedCount++;
                    }
                }
            }
        }

        setActivePairings(currentPairings);
        if (suggestedCount > 0) {
            toast.success(`Auto-suggested ${suggestedCount} offsetting pair(s).`);
        } else {
            toast.info("No automatic matches found for remaining unmatched variances.");
        }
    }, [activePairings, shortageItems, surplusItems]);

    // Apply & Save
    const handleApply = () => {
        onApplyOffsetting(activePairings);
        onClose();
        toast.success(`Offsetting configuration applied (${activePairings.length} active pairings).`);
    };

    if (!isOpen) return null;

    const totalOffsetQty = activePairings.reduce((sum, p) => sum + p.offset_qty, 0);
    const totalNetDelta = activePairings.reduce((sum, p) => sum + p.net_financial_impact, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-background/85 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[92vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40">
                    <div className="flex items-center gap-3">
                        <div className="bg-purple-500/10 p-2.5 rounded-xl text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            <Scale className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-foreground">Inventory Offsetting Utility</h3>
                            <p className="text-xs text-muted-foreground">
                                Reconcile reciprocal shortage & surplus variances within the same facility before ledger commitment (PI 2.0)
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!isReadOnly && (
                            <button
                                onClick={handleAutoSuggest}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs rounded-xl transition-all border border-border"
                            >
                                <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                                Auto-Suggest Matches
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Workspace Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Zone 1: Side-by-Side Dual Grids (Section 5.3) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left Grid: Shortage Items */}
                        <div className="border border-rose-500/20 rounded-2xl bg-rose-500/5 p-4 flex flex-col h-72">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                                    <TrendingDown className="h-4 w-4" />
                                    Shortage Items ({shortageItems.length} SKUs Available)
                                </span>
                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Select 1 to Link</span>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                                {shortageItems.length > 0 ? (
                                    shortageItems.map(item => {
                                        const isSelected = selectedShortageId === item.id;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => !isReadOnly && handleSelectShortage(item.id)}
                                                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                                                    isSelected
                                                        ? "bg-rose-500/20 border-rose-500 text-foreground shadow-xs ring-1 ring-rose-500"
                                                        : "bg-card border-border hover:border-rose-500/40 text-foreground"
                                                }`}
                                            >
                                                <div>
                                                    <div className="font-bold flex items-center gap-2">
                                                        <span>{item.resolvedName}</span>
                                                        <span className="px-1.5 py-0.2 rounded bg-muted text-[10px] font-mono text-muted-foreground">{item.resolvedCode}</span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                                        {item.resolvedCategory} • {formatCurrency(item.unitPrice)}/unit
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-mono font-bold text-rose-500">
                                                        -{item.remainingShortage.toLocaleString()} {item.uom || "PCS"}
                                                    </div>
                                                    <div className="text-[10px] font-mono text-muted-foreground">
                                                        -{formatCurrency(item.shortageAmount)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                        No unallocated shortage items in this count sheet.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Grid: Surplus Items */}
                        <div className="border border-emerald-500/20 rounded-2xl bg-emerald-500/5 p-4 flex flex-col h-72">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                                    <TrendingUp className="h-4 w-4" />
                                    Surplus Items ({surplusItems.length} SKUs Available)
                                </span>
                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Select 1 to Link</span>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                                {surplusItems.length > 0 ? (
                                    surplusItems.map(item => {
                                        const isSelected = selectedSurplusId === item.id;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => !isReadOnly && handleSelectSurplus(item.id)}
                                                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                                                    isSelected
                                                        ? "bg-emerald-500/20 border-emerald-500 text-foreground shadow-xs ring-1 ring-emerald-500"
                                                        : "bg-card border-border hover:border-emerald-500/40 text-foreground"
                                                }`}
                                            >
                                                <div>
                                                    <div className="font-bold flex items-center gap-2">
                                                        <span>{item.resolvedName}</span>
                                                        <span className="px-1.5 py-0.2 rounded bg-muted text-[10px] font-mono text-muted-foreground">{item.resolvedCode}</span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                                        {item.resolvedCategory} • {formatCurrency(item.unitPrice)}/unit
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-mono font-bold text-emerald-500">
                                                        +{item.remainingSurplus.toLocaleString()} {item.uom || "PCS"}
                                                    </div>
                                                    <div className="text-[10px] font-mono text-muted-foreground">
                                                        +{formatCurrency(item.surplusAmount)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                        No unallocated surplus items in this count sheet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Zone 2: Linking Controls (Active when both Shortage & Surplus are selected) */}
                    {!isReadOnly && (
                        <div className="bg-muted/40 border border-border p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <div className="text-xs">
                                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Selected Shortage</span>
                                    <span className="font-bold text-rose-500">
                                        {currentShortage ? currentShortage.resolvedName : "None"}
                                    </span>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="text-xs">
                                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Selected Surplus</span>
                                    <span className="font-bold text-emerald-500">
                                        {currentSurplus ? currentSurplus.resolvedName : "None"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase block">Offset Qty</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        placeholder={`Max ${maxLinkableQty}`}
                                        value={linkQty}
                                        onChange={(e) => setLinkQty(e.target.value)}
                                        className="w-28 px-2.5 py-1.5 text-xs bg-background border border-border rounded-xl font-mono font-bold focus:ring-2 focus:ring-primary outline-hidden"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase block">Reason Code</label>
                                    <select
                                        value={linkReason}
                                        onChange={(e) => setLinkReason(e.target.value)}
                                        className="px-2.5 py-1.5 text-xs bg-background border border-border rounded-xl font-medium focus:ring-2 focus:ring-primary outline-hidden"
                                    >
                                        {REASON_CODES.map(rc => (
                                            <option key={rc} value={rc}>{rc}</option>
                                        ))}
                                    </select>
                                </div>

                                <button
                                    onClick={handleLinkPair}
                                    disabled={!currentShortage || !currentSurplus || !linkQty}
                                    className="self-end px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <Link2 className="h-4 w-4" />
                                    Link Selected Pair
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Zone 3: Active Offset Pairings Table (Section 5.3) */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground flex items-center gap-2">
                                <GitCompare className="h-4 w-4 text-primary" />
                                Active Offset Pairings ({activePairings.length})
                            </span>
                            <div className="text-xs flex items-center gap-4 font-mono font-bold">
                                <span>Total Offset: {totalOffsetQty.toLocaleString()} units</span>
                                <span className={totalNetDelta >= 0 ? "text-emerald-500" : "text-rose-500"}>
                                    Net Impact: {formatCurrency(totalNetDelta)}
                                </span>
                            </div>
                        </div>

                        <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                                        <tr>
                                            <th className="p-3">Pair Ref</th>
                                            <th className="p-3">Shortage Target SKU</th>
                                            <th className="p-3">Surplus Source SKU</th>
                                            <th className="p-3 text-right">Offset Base Qty</th>
                                            <th className="p-3 text-right">Price Variance</th>
                                            <th className="p-3 text-right">Net Financial Delta</th>
                                            <th className="p-3">Reason Code</th>
                                            {!isReadOnly && <th className="p-3 text-center">Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60 font-medium">
                                        {activePairings.length > 0 ? (
                                            activePairings.map(pair => (
                                                <tr key={pair.id} className="hover:bg-muted/30 transition-colors">
                                                    <td className="p-3 font-mono font-bold text-primary">{pair.id}</td>
                                                    <td className="p-3">
                                                        <div className="font-bold text-rose-500">{pair.shortage_product_name}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">{pair.shortage_product_code}</div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-bold text-emerald-500">{pair.surplus_product_name}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">{pair.surplus_product_code}</div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono font-bold text-foreground">
                                                        {pair.offset_qty.toLocaleString()}
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-muted-foreground">
                                                        {formatCurrency(pair.unit_price_variance)}
                                                    </td>
                                                    <td className={`p-3 text-right font-mono font-bold ${pair.net_financial_impact >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                                        {formatCurrency(pair.net_financial_impact)}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="px-2 py-0.5 rounded-md bg-secondary text-foreground text-[10px] font-semibold border border-border">
                                                            {pair.reason_code}
                                                        </span>
                                                    </td>
                                                    {!isReadOnly && (
                                                        <td className="p-3 text-center">
                                                            <button
                                                                onClick={() => handleRemovePair(pair.id)}
                                                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                                                                title="Remove Pair"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={8} className="p-8 text-center text-muted-foreground text-xs">
                                                    No active offset pairings. Select items above or click &quot;Auto-Suggest Matches&quot;.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        Offsetting preserves audit logs and generates linked journal transactions upon ledger commitment.
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground font-semibold text-xs rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition-all hover:scale-[1.01]"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            Apply Offsetting Configuration
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
