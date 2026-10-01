"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOMCostingReportData, BOMCostNode } from "../types";
import { formatStandardCurrency } from "./BOMCostingTreeTable";

interface BOMCostingSensitivityTabProps {
    data: BOMCostingReportData;
}

export default function BOMCostingSensitivityTab({ data }: BOMCostingSensitivityTabProps) {
    const { summary, tree } = data;

    // 3 Commodity Shifter State
    const [flourShift, setFlourShift] = useState<number>(0);
    const [oilShift, setOilShift] = useState<number>(0);
    const [packagingShift, setPackagingShift] = useState<number>(0);

    const handleReset = () => {
        setFlourShift(0);
        setOilShift(0);
        setPackagingShift(0);
    };

    // Flatten all leaf components
    const leafNodes = useMemo(() => {
        const leaves: BOMCostNode[] = [];
        const extractLeaves = (nodes: BOMCostNode[]) => {
            nodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                    extractLeaves(node.children);
                } else {
                    leaves.push(node);
                }
            });
        };
        extractLeaves(tree);
        return leaves;
    }, [tree]);

    // Recalculate simulated extended batch cost in real-time
    const { simulatedBatchCost, costVariance, variancePct } = useMemo(() => {
        const baseline = summary.totalBatchCost > 0
            ? summary.totalBatchCost
            : (summary.totalMaterialCost + summary.directLaborCost + summary.mfgOverheadCost);

        let simulatedTotal = 0;

        leafNodes.forEach(node => {
            const nameLower = node.productName.toLowerCase();
            const descLower = (node.description || "").toLowerCase();
            const text = `${nameLower} ${descLower}`;

            let shiftMultiplier = 1;

            // 1. Flour & Grain / Starch Shifter
            if (
                text.includes("flour") ||
                text.includes("wheat") ||
                text.includes("grain") ||
                text.includes("starch") ||
                text.includes("tapioca") ||
                text.includes("noodle") ||
                text.includes("dough")
            ) {
                shiftMultiplier += flourShift / 100;
            }
            // 2. Frying / Palm Oil Shifter
            else if (
                text.includes("oil") ||
                text.includes("palm") ||
                text.includes("shortening") ||
                text.includes("fat") ||
                text.includes("fry") ||
                text.includes("lard")
            ) {
                shiftMultiplier += oilShift / 100;
            }
            // 3. Packaging & Plant Utilities Shifter
            else if (
                node.materialClassification === "packaging" ||
                node.materialClassification === "overhead" ||
                text.includes("film") ||
                text.includes("pouch") ||
                text.includes("pack") ||
                text.includes("box") ||
                text.includes("carton") ||
                text.includes("wrapper") ||
                text.includes("tape")
            ) {
                shiftMultiplier += packagingShift / 100;
            }

            simulatedTotal += node.totalLineCost * Math.max(0, shiftMultiplier);
        });

        // Add direct labor (kept baseline unless custom overhead adjusted)
        const hasLaborInTree = leafNodes.some(n => n.materialClassification === "labor");
        if (!hasLaborInTree) {
            simulatedTotal += summary.directLaborCost;
        }

        // Add overhead if not present in tree
        const hasOverheadInTree = leafNodes.some(n => n.materialClassification === "overhead");
        if (!hasOverheadInTree) {
            const overheadShift = 1 + (packagingShift / 100);
            simulatedTotal += summary.mfgOverheadCost * Math.max(0, overheadShift);
        }

        const variance = simulatedTotal - baseline;
        const pct = baseline > 0 ? (variance / baseline) * 100 : 0;

        return {
            baselineBatchCost: baseline,
            simulatedBatchCost: simulatedTotal,
            costVariance: variance,
            variancePct: pct
        };
    }, [leafNodes, summary, flourShift, oilShift, packagingShift]);

    const formatBadgeVal = (val: number): string => {
        if (val > 0) return `+${val.toFixed(1)}%`;
        if (val < 0) return `${val.toFixed(1)}%`;
        return `+0.0%`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex justify-center w-full py-2"
        >
            {/* Main Simulator Card */}
            <div className="w-full max-w-3xl rounded-xl border bg-card p-6 shadow-xs space-y-6">
                {/* Header */}
                <div className="space-y-1 text-center">
                    <div className="flex items-center justify-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-sky-500" />
                        <h4 className="text-sm font-bold text-foreground">
                            Raw Ingredient & Commodity Inflation Simulator
                        </h4>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-lg mx-auto">
                        Simulate live flour, oil, and energy market price shocks on batch production standards.
                    </p>
                </div>

                {/* 3 Interactive Sliders */}
                <div className="space-y-6 w-full">
                    {/* Slider 1: Flour & Grain Commodity Index Shift */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                            <span>Flour & Grain Commodity Index Shift</span>
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                {formatBadgeVal(flourShift)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={-20}
                            max={50}
                            step={1}
                            value={flourShift}
                            onChange={(e) => setFlourShift(Number(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                            <span>-20% (Market Surplus)</span>
                            <span>0% (Standard)</span>
                            <span>+50% (Global Shock)</span>
                        </div>
                    </div>

                    {/* Slider 2: Frying Oil / Palm Oil Market Rate Shift */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                            <span>Frying Oil / Palm Oil Market Rate Shift</span>
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                {formatBadgeVal(oilShift)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={-20}
                            max={60}
                            step={1}
                            value={oilShift}
                            onChange={(e) => setOilShift(Number(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                            <span>-20%</span>
                            <span>0% (Standard)</span>
                            <span>+60%</span>
                        </div>
                    </div>

                    {/* Slider 3: Packaging Film & Plant Utility Surcharge */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                            <span>Packaging Film & Plant Utility Surcharge</span>
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                                {formatBadgeVal(packagingShift)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={-15}
                            max={30}
                            step={1}
                            value={packagingShift}
                            onChange={(e) => setPackagingShift(Number(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                            <span>-15%</span>
                            <span>0% (Standard)</span>
                            <span>+30%</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Result Banner (Dark background matching mockup) */}
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
                            compared to baseline.
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                        className="border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs h-8 px-3"
                    >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5 text-slate-300" />
                        Reset Simulation
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}
