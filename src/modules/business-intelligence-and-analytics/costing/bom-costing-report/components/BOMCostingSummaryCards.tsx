"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Boxes,
    Users,
    Factory,
    TrendingUp
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BOMCostingReportData } from "../types";
import { formatStandardCurrency } from "./BOMCostingTreeTable";

interface BOMCostingSummaryCardsProps {
    data: BOMCostingReportData;
}

export default function BOMCostingSummaryCards({ data }: BOMCostingSummaryCardsProps) {
    const { summary, targetProduct } = data;

    const totalBatchCost = summary.totalBatchCost > 0 ? summary.totalBatchCost : summary.totalMaterialCost;
    const directMaterials = summary.totalMaterialCost;
    const directLabor = summary.directLaborCost;
    const mfgOverhead = summary.mfgOverheadCost;
    const scrapAllowance = summary.totalWastageCost;

    const materialsShare = totalBatchCost > 0 ? (directMaterials / totalBatchCost) * 100 : 0;
    const laborShare = totalBatchCost > 0 ? (directLabor / totalBatchCost) * 100 : 0;
    const overheadShare = totalBatchCost > 0 ? (mfgOverhead / totalBatchCost) * 100 : 0;
    const scrapImpact = totalBatchCost > 0 ? (scrapAllowance / totalBatchCost) * 100 : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
        >
            {/* 1. TOTAL BATCH COST */}
            <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                        Total Batch Cost
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-5 font-medium">
                        Ext. Total
                    </Badge>
                </div>
                <div className="mt-3">
                    <div className="text-xl font-bold tracking-tight font-mono text-foreground">
                        {formatStandardCurrency(totalBatchCost, 4)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                        Per Piece Unit Cost: <span className="font-semibold text-foreground">{formatStandardCurrency(summary.costPerUnit, 4)}</span>
                    </div>
                </div>
            </div>

            {/* 2. DIRECT MATERIALS */}
            <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                        Direct Materials
                    </span>
                    <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Boxes className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-3 space-y-2">
                    <div className="text-xl font-bold tracking-tight font-mono text-foreground">
                        {formatStandardCurrency(directMaterials, 4)}
                    </div>
                    <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground">
                            {materialsShare.toFixed(4)}% share
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(materialsShare, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. PROCESS DIRECT LABOR */}
            <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                        Process Direct Labor
                    </span>
                    <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Users className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-3 space-y-2">
                    <div className="text-xl font-bold tracking-tight font-mono text-foreground">
                        {formatStandardCurrency(directLabor, 4)}
                    </div>
                    <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground">
                            {laborShare.toFixed(4)}% share
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(laborShare, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. MFG OVERHEAD */}
            <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                        Mfg Overhead
                    </span>
                    <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Factory className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-3 space-y-2">
                    <div className="text-xl font-bold tracking-tight font-mono text-foreground">
                        {formatStandardCurrency(mfgOverhead, 4)}
                    </div>
                    <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground">
                            {overheadShare.toFixed(4)}% share
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(overheadShare, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. SCRAP ALLOWANCE */}
            <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                        Scrap Allowance
                    </span>
                    <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        <TrendingUp className="h-4 w-4" />
                    </div>
                </div>
                <div className="mt-3 space-y-2">
                    <div className="text-xl font-bold tracking-tight font-mono text-foreground">
                        {formatStandardCurrency(scrapAllowance, 4)}
                    </div>
                    <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground">
                            {scrapImpact.toFixed(4)}% scrap impact
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-rose-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(scrapImpact, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
