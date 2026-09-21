"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Cpu,
    Coins,
    TrendingUp,
    Layers,
    AlertCircle
} from "lucide-react";
import { MachineDepreciationSummaryMetrics } from "../types";

interface SummaryCardsProps {
    summary: MachineDepreciationSummaryMetrics | null;
    isLoading: boolean;
}

export default function SummaryCards({ summary, isLoading }: SummaryCardsProps) {
    const cards = [
        {
            title: "Production Machines",
            value: summary?.total_production_assets ?? 0,
            unit: "Active Equipment",
            icon: Cpu,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20"
        },
        {
            title: "Annual Depr. Overhead",
            value: summary ? `₱${summary.total_annual_depreciation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₱0.00",
            unit: "Total Annual Burden",
            icon: Coins,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20"
        },
        {
            title: "Avg Operational Rate",
            value: summary ? `₱${summary.average_hourly_burden.toFixed(2)}` : "₱0.00",
            unit: "Per Work Center Hour",
            icon: TrendingUp,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20"
        },
        {
            title: "Assigned Work Centers",
            value: summary?.assigned_work_centers_count ?? 0,
            unit: "Linked to Master Data",
            icon: Layers,
            color: "text-purple-500",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20"
        },
        {
            title: "Unassigned Machines",
            value: summary?.unassigned_assets_count ?? 0,
            unit: "Requires Station Link",
            icon: AlertCircle,
            color: (summary?.unassigned_assets_count || 0) > 0 ? "text-amber-500" : "text-slate-400",
            bg: (summary?.unassigned_assets_count || 0) > 0 ? "bg-amber-500/10" : "bg-slate-500/10",
            border: (summary?.unassigned_assets_count || 0) > 0 ? "border-amber-500/20" : "border-slate-500/20"
        }
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.05 }}
                        className={`rounded-xl border p-4 bg-card shadow-sm ${card.border}`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
                            <div className={`p-2 rounded-lg ${card.bg}`}>
                                <Icon className={`h-4 w-4 ${card.color}`} />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            {isLoading ? (
                                <div className="h-7 w-24 bg-muted animate-pulse rounded my-1" />
                            ) : (
                                <span className="text-xl font-bold tracking-tight">{card.value}</span>
                            )}
                            <span className="text-[11px] text-muted-foreground mt-0.5">{card.unit}</span>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
