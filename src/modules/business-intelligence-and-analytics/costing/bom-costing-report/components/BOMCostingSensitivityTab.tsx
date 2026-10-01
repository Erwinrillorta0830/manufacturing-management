"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    SlidersHorizontal,
    RotateCcw,
    Wheat,
    Package,
    Layers,
    Search,
 
    AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BOMCostingReportData, BOMCostNode } from "../types";
import { formatStandardCurrency } from "./BOMCostingTreeTable";

interface BOMCostingSensitivityTabProps {
    data: BOMCostingReportData;
}

export interface SimulatedMaterialItem {
    id: string;
    productId: number;
    productName: string;
    productCode: string;
    materialClassification: "raw_material" | "packaging" | "sub_assembly";
    uomName: string;
    unitCost: number;
    totalBaseQty: number;
    totalScaledQty: number;
    totalEffectiveQty: number;
    baselineTotalCost: number;
    operations: string[];
}

export default function BOMCostingSensitivityTab({ data }: BOMCostingSensitivityTabProps) {
    const { summary, tree } = data;

    // State for individual material price shifts keyed by material id
    const [shifts, setShifts] = useState<Record<string, number>>({});
    const [categoryFilter, setCategoryFilter] = useState<"all" | "raw_material" | "packaging">("all");
    const [searchQuery, setSearchQuery] = useState("");

    // Dynamically extract all materials needed on that product from the BOM tree
    const materialItems = useMemo(() => {
        const itemsMap = new Map<string, SimulatedMaterialItem>();

        const extractMaterials = (nodes: BOMCostNode[]) => {
            nodes.forEach(node => {
                // If it's a sub-assembly with exploded children, traverse its children
                if (node.isSubAssembly && node.children && node.children.length > 0) {
                    extractMaterials(node.children);
                    return;
                }

                // Check if it's a material item (raw material, packaging, or unexploded sub-assembly)
                const isMaterial =
                    node.materialClassification === "raw_material" ||
                    node.materialClassification === "packaging" ||
                    (node.materialClassification === "sub_assembly" && (!node.children || node.children.length === 0));

                if (isMaterial) {
                    // Group by productId if valid, otherwise fallback to productCode or node.id
                    const key = node.productId > 0
                        ? `prod-${node.productId}`
                        : (node.productCode && node.productCode !== "-" ? `code-${node.productCode}` : `node-${node.id}`);

                    const existing = itemsMap.get(key);
                    const opName = node.operationName && node.operationName !== "Unknown"
                        ? node.operationName
                        : (node.routeSequence ? `Step #${node.routeSequence}` : "");

                    if (existing) {
                        existing.totalBaseQty += node.baseRequiredQty;
                        existing.totalScaledQty += node.scaledRequiredQty;
                        existing.totalEffectiveQty += node.effectiveQty;
                        existing.baselineTotalCost += node.totalLineCost;
                        if (opName && !existing.operations.includes(opName)) {
                            existing.operations.push(opName);
                        }
                    } else {
                        itemsMap.set(key, {
                            id: key,
                            productId: node.productId,
                            productName: node.productName || "Unknown Material",
                            productCode: node.productCode || "-",
                            materialClassification: (node.materialClassification as "raw_material" | "packaging" | "sub_assembly") || "raw_material",
                            uomName: node.uomName || "PCS",
                            unitCost: node.unitCost,
                            totalBaseQty: node.baseRequiredQty,
                            totalScaledQty: node.scaledRequiredQty,
                            totalEffectiveQty: node.effectiveQty,
                            baselineTotalCost: node.totalLineCost,
                            operations: opName ? [opName] : []
                        });
                    }
                }

                // Traverse any child nodes (e.g. materials grouped under an L1 parent)
                if (!node.isSubAssembly && node.children && node.children.length > 0) {
                    extractMaterials(node.children);
                }
            });
        };

        extractMaterials(tree);

        // Sort by baselineTotalCost descending so highest cost contributors appear first
        return Array.from(itemsMap.values()).sort((a, b) => b.baselineTotalCost - a.baselineTotalCost);
    }, [tree]);

    // Recalculate simulated extended batch cost in real-time
    const { baselineBatchCost, simulatedBatchCost, costVariance, variancePct } = useMemo(() => {
        const baseline = summary.totalBatchCost > 0
            ? summary.totalBatchCost
            : (summary.totalMaterialCost + summary.directLaborCost + summary.mfgOverheadCost);

        // Compute simulated materials total
        let totalSimulatedMaterialCost = 0;
        let totalBaselineMaterialCost = 0;

        materialItems.forEach(item => {
            const shift = shifts[item.id] || 0;
            const multiplier = Math.max(0, 1 + shift / 100);
            totalSimulatedMaterialCost += item.baselineTotalCost * multiplier;
            totalBaselineMaterialCost += item.baselineTotalCost;
        });

        // Non-material baseline costs (direct labor & manufacturing overhead)
        const nonMaterialBaseline = Math.max(0, baseline - totalBaselineMaterialCost);

        const simulatedTotal = totalSimulatedMaterialCost + nonMaterialBaseline;
        const variance = simulatedTotal - baseline;
        const pct = baseline > 0 ? (variance / baseline) * 100 : 0;

        return {
            baselineBatchCost: baseline,
            simulatedBatchCost: simulatedTotal,
            costVariance: variance,
            variancePct: pct
        };
    }, [summary, materialItems, shifts]);

    // Category counts for filter tabs
    const rawCount = useMemo(() => materialItems.filter(i => i.materialClassification === "raw_material").length, [materialItems]);
    const pkgCount = useMemo(() => materialItems.filter(i => i.materialClassification === "packaging").length, [materialItems]);

    // Filtered materials for UI rendering
    const visibleMaterials = useMemo(() => {
        return materialItems.filter(item => {
            if (categoryFilter !== "all" && item.materialClassification !== categoryFilter) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const nameMatch = item.productName.toLowerCase().includes(q);
                const codeMatch = item.productCode.toLowerCase().includes(q);
                const opMatch = item.operations.some(op => op.toLowerCase().includes(q));
                return nameMatch || codeMatch || opMatch;
            }
            return true;
        });
    }, [materialItems, categoryFilter, searchQuery]);

    // Active shifts count
    const activeShiftCount = useMemo(() => {
        return Object.values(shifts).filter(v => v !== 0).length;
    }, [shifts]);

    const handleShiftChange = (id: string, value: number) => {
        setShifts(prev => ({
            ...prev,
            [id]: value
        }));
    };

    const handleResetSingle = (id: string) => {
        setShifts(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const handleResetAll = () => {
        setShifts({});
    };

    // const handleApplyGlobalShift = (percentage: number) => {
    //     setShifts(prev => {
    //         const next = { ...prev };
    //         visibleMaterials.forEach(item => {
    //             next[item.id] = percentage;
    //         });
    //         return next;
    //     });
    // };

    const formatBadgeVal = (val: number): string => {
        if (val > 0) return `+${val.toFixed(1)}%`;
        if (val < 0) return `${val.toFixed(1)}%`;
        return `0.0%`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex justify-center w-full py-2"
        >
            {/* Centered Simulator Container */}
            <div className="w-full max-w-3xl rounded-xl border bg-card p-6 shadow-xs space-y-6">
                {/* Header */}
                <div className="space-y-1.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-sky-500" />
                        <h4 className="text-sm font-bold text-foreground">
                            BOM Commodity & Material Inflation Simulator
                        </h4>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-lg mx-auto">
                        Simulate live price shocks, supplier price increases, and cost variances for materials required by this product assembly.
                    </p>
                </div>

                {/* Filter Pills, Search Bar & Quick Shifters */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-border/40">
                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1.5">
                        <Button
                            type="button"
                            variant={categoryFilter === "all" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCategoryFilter("all")}
                            className="h-7 text-xs px-2.5"
                            title="Show all product materials"
                        >
                            All ({materialItems.length})
                        </Button>
                        {rawCount > 0 && (
                            <Button
                                type="button"
                                variant={categoryFilter === "raw_material" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCategoryFilter("raw_material")}
                                className="h-7 text-xs px-2.5 gap-1.5"
                                title="Filter to raw materials and ingredients"
                            >
                                <Wheat className="h-3 w-3 text-blue-500" />
                                Raw Materials ({rawCount})
                            </Button>
                        )}
                        {pkgCount > 0 && (
                            <Button
                                type="button"
                                variant={categoryFilter === "packaging" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCategoryFilter("packaging")}
                                className="h-7 text-xs px-2.5 gap-1.5"
                                title="Filter to packaging components"
                            >
                                <Package className="h-3 w-3 text-emerald-500" />
                                Packaging ({pkgCount})
                            </Button>
                        )}
                    </div>

                    {/* Quick Presets & Search */}
                    <div className="flex items-center gap-1.5 ml-auto">
                        {materialItems.length > 3 && (
                            <div className="relative w-36 sm:w-44">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="Search material..."
                                    className="h-7 text-xs pl-8 pr-2 py-0"
                                    title="Search materials by name, code or operation"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Empty State */}
                {visibleMaterials.length === 0 && (
                    <div className="py-12 text-center space-y-2 border border-dashed rounded-lg">
                        <AlertCircle className="h-7 w-7 text-muted-foreground mx-auto opacity-40" />
                        <h5 className="text-xs font-semibold text-foreground">No materials found</h5>
                        <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                            {searchQuery
                                ? `No materials matching "${searchQuery}".`
                                : "No materials match the selected classification filter."}
                        </p>
                    </div>
                )}

                {/* Dynamic Material Sliders List */}
                <div className="space-y-4 w-full">
                    <AnimatePresence initial={false}>
                        {visibleMaterials.map((item, index) => {
                            const shift = shifts[item.id] || 0;
                            const isShifted = shift !== 0;
                            const simMultiplier = Math.max(0, 1 + shift / 100);
                            const simLineCost = item.baselineTotalCost * simMultiplier;
                            const deltaCost = simLineCost - item.baselineTotalCost;
                            const simUnitCost = item.unitCost * simMultiplier;

                            const isRaw = item.materialClassification === "raw_material";
                            const isPkg = item.materialClassification === "packaging";

                            const accentClass = isRaw
                                ? "accent-blue-600"
                                : isPkg
                                ? "accent-emerald-600"
                                : "accent-amber-600";

                            const badgeColorClass = isShifted
                                ? shift > 0
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800"
                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                                : "bg-muted text-muted-foreground border-border";

                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ duration: 0.15, delay: index * 0.02 }}
                                    className="p-3.5 rounded-lg border bg-card/60 hover:bg-card hover:border-border/80 transition-colors space-y-2.5"
                                >
                                    {/* Material Info Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {isRaw ? (
                                                <Wheat className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                            ) : isPkg ? (
                                                <Package className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                            ) : (
                                                <Layers className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-xs font-semibold text-foreground truncate" title={item.productName}>
                                                        {item.productName}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-muted-foreground">
                                                        [{item.productCode}]
                                                    </span>
                                                    <span
                                                        className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${
                                                            isRaw
                                                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                                                                : isPkg
                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                                                        }`}
                                                    >
                                                        {isRaw ? "Raw Material" : isPkg ? "Packaging" : "Sub-Assembly"}
                                                    </span>
                                                    {item.operations.length > 0 && (
                                                        <span className="text-[9px] text-muted-foreground/80 font-mono">
                                                            • {item.operations.join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Shift Badge & Reset Button */}
                                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                                            <span
                                                className={`font-mono text-xs px-2 py-0.5 rounded border font-semibold ${badgeColorClass}`}
                                                title={`Live price shift: ${formatBadgeVal(shift)}`}
                                            >
                                                {formatBadgeVal(shift)}
                                            </span>
                                            {isShifted && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleResetSingle(item.id)}
                                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                    title="Reset this material shift to 0%"
                                                >
                                                    <RotateCcw className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Cost Breakdown & Slider Controls */}
                                    <div className="space-y-1.5">
                                        <input
                                            type="range"
                                            min={-50}
                                            max={100}
                                            step={1}
                                            value={shift}
                                            onChange={(e) => handleShiftChange(item.id, Number(e.target.value))}
                                            className={`w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer ${accentClass}`}
                                            title={`Adjust commodity price shift for ${item.productName}`}
                                        />

                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                                            <span>-50% (Deflation)</span>
                                            <span className="text-foreground/70">
                                                Base: {formatStandardCurrency(item.baselineTotalCost, 4)} ({formatStandardCurrency(item.unitCost, 4)}/{item.uomName})
                                            </span>
                                            <span>+100% (Shock)</span>
                                        </div>

                                        {/* Live Simulation Line Impact */}
                                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/30 font-mono">
                                            <span className="text-muted-foreground">
                                                Simulated Cost:{" "}
                                                <span className="font-semibold text-foreground">
                                                    {formatStandardCurrency(simLineCost, 4)}
                                                </span>{" "}
                                                <span className="text-[10px] text-muted-foreground">
                                                    ({formatStandardCurrency(simUnitCost, 4)}/{item.uomName})
                                                </span>
                                            </span>
                                            <span
                                                className={`font-semibold ${
                                                    deltaCost > 0.0001
                                                        ? "text-rose-600 dark:text-rose-400"
                                                        : deltaCost < -0.0001
                                                        ? "text-emerald-600 dark:text-emerald-400"
                                                        : "text-muted-foreground"
                                                }`}
                                            >
                                                {deltaCost >= 0 ? "+" : ""}
                                                {formatStandardCurrency(deltaCost, 4)}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>

                {/* Bottom Result Banner (Dark theme matching mockup) */}
                <div className="rounded-xl bg-[#090e17] text-white border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                            Simulated Extended Batch Cost
                        </div>
                        <div className="text-3xl font-extrabold font-mono text-sky-400 tracking-tight">
                            {formatStandardCurrency(simulatedBatchCost, 4)}
                        </div>
                        <div className="text-xs text-slate-300">
                            Cost Variance:{" "}
                            <span
                                className={`font-mono font-semibold ${
                                    costVariance > 0.0001
                                        ? "text-rose-400"
                                        : costVariance < -0.0001
                                        ? "text-emerald-400"
                                        : "text-slate-300"
                                }`}
                            >
                                {costVariance >= 0 ? "+" : ""}
                                {formatStandardCurrency(costVariance, 4)} ({costVariance >= 0 ? "+" : ""}
                                {variancePct.toFixed(4)}%)
                            </span>{" "}
                            compared to baseline ({formatStandardCurrency(baselineBatchCost, 4)}).
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleResetAll}
                            disabled={activeShiftCount === 0}
                            className="border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs h-8 px-3 disabled:opacity-40"
                            title="Reset all material price shifts to 0%"
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5 text-slate-300" />
                            Reset Simulation
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
