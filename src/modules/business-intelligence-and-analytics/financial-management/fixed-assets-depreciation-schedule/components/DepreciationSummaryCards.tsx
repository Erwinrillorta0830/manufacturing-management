"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Building2,
    PiggyBank,
    TrendingDown,
    Layers,
    DollarSign,
    CheckCircle2,
    Clock,
    AlertTriangle
} from "lucide-react";
import { DepreciationScheduleSummary, AssetReportingStatus } from "../types";
import { formatCurrency } from "../utils/depreciationCalculations";
import { Badge } from "@/components/ui/badge";

interface DepreciationSummaryCardsProps {
    summary: DepreciationScheduleSummary | null;
    isLoading?: boolean;
}

export default function DepreciationSummaryCards({
    summary,
    isLoading = false
}: DepreciationSummaryCardsProps) {
    const cost = summary?.total_acquisition_cost || 0;
    const salvage = summary?.total_salvage_value || 0;
    const periodExpense = summary?.total_current_period_depreciation || 0;
    const accumDepr = summary?.total_ending_accum_depreciation || 0;
    const nbv = summary?.total_net_book_value || 0;

    const cards = [
        {
            title: "Capitalized Historical Cost",
            value: formatCurrency(cost),
            subtext: `${summary?.total_assets_count || 0} registered assets`,
            icon: Building2,
            accentBg: "from-blue-500/10 via-blue-500/5 to-transparent",
            borderColor: "border-blue-500/20",
            iconColor: "text-blue-500",
            iconBg: "bg-blue-500/10"
        },
        {
            title: "Total Salvage (Residual) Value",
            value: formatCurrency(salvage),
            subtext: "Floor carrying value at end of life",
            icon: PiggyBank,
            accentBg: "from-purple-500/10 via-purple-500/5 to-transparent",
            borderColor: "border-purple-500/20",
            iconColor: "text-purple-500",
            iconBg: "bg-purple-500/10"
        },
        {
            title: "Current Period Depreciation",
            value: formatCurrency(periodExpense),
            subtext: "Expense allocated in selected window",
            icon: TrendingDown,
            accentBg: "from-amber-500/10 via-amber-500/5 to-transparent",
            borderColor: "border-amber-500/20",
            iconColor: "text-amber-500",
            iconBg: "bg-amber-500/10"
        },
        {
            title: "Accumulated Depreciation",
            value: formatCurrency(accumDepr),
            subtext: cost > 0 ? `${((accumDepr / Math.max(1, cost - salvage)) * 100).toFixed(1)}% of depreciable base` : "0%",
            icon: Layers,
            accentBg: "from-rose-500/10 via-rose-500/5 to-transparent",
            borderColor: "border-rose-500/20",
            iconColor: "text-rose-500",
            iconBg: "bg-rose-500/10"
        },
        {
            title: "Net Book Value (NBV)",
            value: formatCurrency(nbv),
            subtext: "Current carrying value on Balance Sheet",
            icon: DollarSign,
            accentBg: "from-emerald-500/10 via-emerald-500/5 to-transparent",
            borderColor: "border-emerald-500/20",
            iconColor: "text-emerald-500",
            iconBg: "bg-emerald-500/10"
        }
    ];

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className={`relative overflow-hidden rounded-xl border ${card.borderColor} bg-card p-4 shadow-sm bg-gradient-to-br ${card.accentBg}`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                                {card.title}
                            </span>
                            <div className={`rounded-lg p-1.5 ${card.iconBg}`}>
                                <Icon className={`h-4 w-4 ${card.iconColor}`} />
                            </div>
                        </div>
                        <div className="mt-2.5">
                            {isLoading ? (
                                <div className="h-7 w-28 animate-pulse rounded bg-muted" />
                            ) : (
                                <div className="text-xl font-bold tracking-tight text-foreground font-mono">
                                    {card.value}
                                </div>
                            )}
                            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                                {card.subtext}
                            </p>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
