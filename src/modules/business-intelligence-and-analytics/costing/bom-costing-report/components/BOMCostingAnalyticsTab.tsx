"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, BarChart3, PieChart as PieIcon } from "lucide-react";
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip as RechartsTooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid
} from "recharts";
import { BOMCostingReportData, BOMCostNode, ComponentCategoryFilter } from "../types";
import { formatStandardCurrency } from "./BOMCostingTreeTable";

interface BOMCostingAnalyticsTabProps {
    data: BOMCostingReportData;
}

const CATEGORY_COLORS = {
    raw_material: "#3b82f6", // Blue
    packaging: "#10b981",    // Emerald / Green
    labor: "#f59e0b",        // Amber / Orange
    overhead: "#8b5cf6"      // Purple
};

export default function BOMCostingAnalyticsTab({ data }: BOMCostingAnalyticsTabProps) {
    const { summary, tree } = data;

    // 1. Flatten all leaf components to calculate exact category and driver splits
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

    // 2. Compute cost by category (Raw Materials, Packaging, Labor, Overhead)
    const categoryBreakdown = useMemo(() => {
        let rawMaterialsCost = 0;
        let packagingCost = 0;
        let laborCost = summary.directLaborCost || 0;
        let overheadCost = summary.mfgOverheadCost || 0;

        leafNodes.forEach(node => {
            if (node.materialClassification === "packaging") {
                packagingCost += node.totalLineCost;
            } else if (node.materialClassification === "raw_material") {
                rawMaterialsCost += node.totalLineCost;
            } else if (node.materialClassification === "labor") {
                // Already tracked in summary.directLaborCost if not in tree
                if (laborCost === 0) laborCost += node.totalLineCost;
            } else if (node.materialClassification === "overhead") {
                if (overheadCost === 0) overheadCost += node.totalLineCost;
            }
        });

        // Fallback to summary material cost if no packaging split found
        if (packagingCost === 0 && rawMaterialsCost === 0) {
            rawMaterialsCost = summary.totalMaterialCost;
        }

        const total = rawMaterialsCost + packagingCost + laborCost + overheadCost;

        const data = [
            {
                name: "Raw Materials",
                key: "raw_material",
                value: Math.max(0, rawMaterialsCost),
                color: CATEGORY_COLORS.raw_material,
                sharePct: total > 0 ? (rawMaterialsCost / total) * 100 : 0
            },
            {
                name: "Packaging",
                key: "packaging",
                value: Math.max(0, packagingCost),
                color: CATEGORY_COLORS.packaging,
                sharePct: total > 0 ? (packagingCost / total) * 100 : 0
            },
            {
                name: "Direct Labor",
                key: "labor",
                value: Math.max(0, laborCost),
                color: CATEGORY_COLORS.labor,
                sharePct: total > 0 ? (laborCost / total) * 100 : 0
            },
            {
                name: "Mfg Overhead",
                key: "overhead",
                value: Math.max(0, overheadCost),
                color: CATEGORY_COLORS.overhead,
                sharePct: total > 0 ? (overheadCost / total) * 100 : 0
            }
        ].filter(item => item.value > 0);

        return { data, total };
    }, [leafNodes, summary]);

    const [selectedDriverCategory, setSelectedDriverCategory] = useState<ComponentCategoryFilter>("all");

    // Filter leaf components for driver chart based on selected category
    const filteredLeafNodes = useMemo(() => {
        if (selectedDriverCategory === "all") return leafNodes;
        return leafNodes.filter(node => node.materialClassification === selectedDriverCategory);
    }, [leafNodes, selectedDriverCategory]);

    // 3. Compute Top 5 Component Cost Share Drivers for the Bar Chart
    const topCostDrivers = useMemo(() => {
        const totalCost = summary.totalBatchCost > 0 ? summary.totalBatchCost : summary.totalMaterialCost;
        if (totalCost <= 0) return [];

        // Aggregate by unique component name or leaf
        const driverMap = new Map<string, { fullName: string; shortName: string; cost: number }>();

        filteredLeafNodes.forEach(node => {
            const fullName = node.productName.trim();
            // Clean short name: strip common prefixes and truncate nicely to avoid generic 'MFG' or 'DIRECT'
            let cleaned = fullName
                .replace(/^(Mfg Overhead\s*-\s*|Process Direct Labor\s*-\s*|Direct Labor\s*-\s*)/i, "")
                .trim();
            if (cleaned.length > 12) {
                cleaned = cleaned.substring(0, 11) + "…";
            }
            const shortName = cleaned || fullName;

            const existing = driverMap.get(fullName) || {
                fullName,
                shortName,
                cost: 0
            };
            existing.cost += node.totalLineCost;
            driverMap.set(fullName, existing);
        });

        // Sort descending by cost
        const sorted = Array.from(driverMap.values())
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 5)
            .map(item => ({
                name: item.shortName,
                fullName: item.fullName,
                cost: item.cost,
                sharePct: Number(((item.cost / totalCost) * 100).toFixed(4))
            }));

        return sorted;
    }, [filteredLeafNodes, summary]);

    // Dynamic bar color based on selected driver category
    const barColor = useMemo(() => {
        if (selectedDriverCategory === "raw_material") return CATEGORY_COLORS.raw_material;
        if (selectedDriverCategory === "packaging") return CATEGORY_COLORS.packaging;
        if (selectedDriverCategory === "labor") return CATEGORY_COLORS.labor;
        if (selectedDriverCategory === "overhead") return CATEGORY_COLORS.overhead;
        return "#0284c7"; // Sky blue default for All
    }, [selectedDriverCategory]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
            {/* Left Card: CATEGORY SHARE % BREAKDOWN (Donut Chart) */}
            <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Clock className="h-4 w-4 text-sky-500" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Category Share % Breakdown
                        </h4>
                    </div>

                    {categoryBreakdown.data.length > 0 ? (
                        <div className="h-64 w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryBreakdown.data}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={62}
                                        outerRadius={92}
                                        minAngle={6}
                                        paddingAngle={1.5}
                                        dataKey="value"
                                        animationDuration={600}
                                    >
                                        {categoryBreakdown.data.map((entry) => (
                                            <Cell
                                                key={`cell-${entry.key}`}
                                                fill={entry.color}
                                                stroke="hsl(var(--card))"
                                                strokeWidth={2}
                                            />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        formatter={((val: any) => [
                                            `${formatStandardCurrency(Number(val) || 0, 4)} (${categoryBreakdown.total > 0 ? (((Number(val) || 0) / categoryBreakdown.total) * 100).toFixed(4) : "0.0000"}%)`,
                                            "Extended Cost"
                                        ]) as any}
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--popover))",
                                            borderColor: "hsl(var(--border))",
                                            borderRadius: "8px",
                                            fontSize: "12px",
                                            color: "hsl(var(--popover-foreground))"
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
                            No cost allocation data available
                        </div>
                    )}
                </div>

                {/* Legend Row */}
                <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t text-xs">
                    {categoryBreakdown.data.map((item) => (
                        <div key={item.key} className="flex items-center gap-1.5 font-medium text-foreground">
                            <span
                                className="h-2.5 w-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: item.color }}
                            />
                            <span>{item.name}</span>
                            <span className="text-muted-foreground font-mono text-[11px]">
                                ({item.sharePct.toFixed(4)}%)
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Card: TOP COMPONENT COST SHARE DRIVERS (Bar Chart) */}
            <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between">
                <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-sky-500" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Top Component Cost Share Drivers
                            </h4>
                        </div>

                        {/* Category filter pills */}
                        <div className="flex items-center gap-1 text-[10px]">
                            {(["all", "raw_material", "packaging", "labor", "overhead"] as ComponentCategoryFilter[]).map(cat => {
                                const labels: Record<ComponentCategoryFilter, string> = {
                                    all: "All",
                                    raw_material: "Raw Mat",
                                    packaging: "Packaging",
                                    labor: "Labor",
                                    overhead: "Overhead"
                                };
                                const isSelected = selectedDriverCategory === cat;
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setSelectedDriverCategory(cat)}
                                        className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                                            isSelected
                                                ? "bg-primary text-primary-foreground shadow-xs"
                                                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }`}
                                    >
                                        {labels[cat]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {topCostDrivers.length > 0 ? (
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={topCostDrivers}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke="hsl(var(--border))"
                                        opacity={0.6}
                                    />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 500 }}
                                        dy={8}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                                        domain={[0, (dataMax: number) => Math.max(70, Math.ceil(dataMax / 10) * 10)]}
                                        tickFormatter={(val: number) => `${val}`}
                                    />
                                    <RechartsTooltip
                                        formatter={((val: any, _name: any, props: any) => [
                                            `${(Number(val) || 0).toFixed(4)}% (${formatStandardCurrency(props?.payload?.cost || 0, 4)})`,
                                            props?.payload?.fullName || "Share"
                                        ]) as any}
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--popover))",
                                            borderColor: "hsl(var(--border))",
                                            borderRadius: "8px",
                                            fontSize: "12px",
                                            color: "hsl(var(--popover-foreground))"
                                        }}
                                    />
                                    <Bar
                                        dataKey="sharePct"
                                        fill={barColor}
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={55}
                                        animationDuration={600}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
                            No component drivers found
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t text-[11px] text-muted-foreground flex justify-between items-center">
                    <span>Ranked by percentage contribution to total batch cost</span>
                    <span className="font-mono">Top {topCostDrivers.length} Items</span>
                </div>
            </div>
        </motion.div>
    );
}
