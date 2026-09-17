"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    CircleDollarSign,
    Coins,
    Percent,
    Layers,
    Boxes,
    Package
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BOMCostingReportData } from "../types";

interface BOMCostingSummaryCardsProps {
    data: BOMCostingReportData;
}

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    }).format(val || 0);
};

export default function BOMCostingSummaryCards({ data }: BOMCostingSummaryCardsProps) {
    const { summary, targetProduct } = data;

    const cards = [
        {
            title: "Total Material Cost",
            value: formatCurrency(summary.totalMaterialCost),
            subtext: `For batch of ${targetProduct.target_quantity.toLocaleString()} ${targetProduct.uom_name}`,
            icon: CircleDollarSign,
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20"
        },
        {
            title: "Unit Material Cost",
            value: formatCurrency(summary.costPerUnit),
            subtext: `Per 1.00 ${targetProduct.uom_name} produced`,
            icon: Coins,
            color: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20"
        },
        {
            title: "Scrap / Wastage Cost",
            value: formatCurrency(summary.totalWastageCost),
            subtext: `Effective increase: ${summary.effectiveWastageIncreasePct.toFixed(2)}% over net material cost`,
            icon: Percent,
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20"
        },
        {
            title: "Structure & Components",
            value: `${summary.totalComponentsCount} Items`,
            subtext: `Max Depth: Level ${summary.maxDepth} • ${summary.subAssembliesCost > 0 ? "Multi-level" : "Single-level"}`,
            icon: Layers,
            color: "text-purple-600 dark:text-purple-400",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20"
        }
    ];

    return (
        <div className="space-y-3">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
            >
                {cards.map((card, idx) => {
                    const Icon = card.icon;
                    return (
                        <Card key={idx} className={`shadow-xs border ${card.border} bg-card overflow-hidden`}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-muted-foreground truncate">{card.title}</span>
                                    <div className={`p-1.5 rounded-md ${card.bg} ${card.color} shrink-0`}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                </div>
                                <div className="mt-2.5">
                                    <div className="text-lg font-bold tracking-tight text-foreground truncate">{card.value}</div>
                                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{card.subtext}</div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </motion.div>

            {/* Classification breakdown strip */}
            <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg border bg-muted/30 text-xs"
            >
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Material Category Split:</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <Boxes className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Raw Materials & Ingredients:</span>
                        <strong className="text-foreground">{formatCurrency(summary.rawMaterialsCost)}</strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-blue-600" />
                        <span>Packaging Materials:</span>
                        <strong className="text-foreground">{formatCurrency(summary.packagingCost)}</strong>
                    </div>
                    {summary.subAssembliesCost > 0 && (
                        <div className="flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-purple-600" />
                            <span>Sub-Assemblies:</span>
                            <strong className="text-foreground">{formatCurrency(summary.subAssembliesCost)}</strong>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
