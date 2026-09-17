"use client";

import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, PackageX, DollarSign, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { InventoryReportMetrics } from "../types";

interface ReportSummaryCardsProps {
    metrics: InventoryReportMetrics;
    loading: boolean;
}

export function ReportSummaryCards({ metrics, loading }: ReportSummaryCardsProps) {
    const formattedCost = new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
    }).format(metrics.totalReplenishmentCost || 0);

    const cards = [
        {
            title: "Below Maintaining Qty",
            value: metrics.belowMaintainingCount,
            subtitle: "Products needing replenishment",
            icon: AlertTriangle,
            color: "text-amber-500",
            bgColor: "bg-amber-500/10",
            borderColor: "border-amber-500/20",
        },
        {
            title: "Out of Stock Items",
            value: metrics.outOfStockCount,
            subtitle: "Zero on-hand with set threshold",
            icon: PackageX,
            color: "text-rose-500",
            bgColor: "bg-rose-500/10",
            borderColor: "border-rose-500/20",
        },
        {
            title: "Total Deficit Units",
            value: metrics.totalDeficitQuantity.toLocaleString(),
            subtitle: "Total units to reach maintaining qty",
            icon: Layers,
            color: "text-indigo-500",
            bgColor: "bg-indigo-500/10",
            borderColor: "border-indigo-500/20",
        },
        {
            title: "Est. Replenishment Cost",
            value: formattedCost,
            subtitle: "Based on standard unit cost",
            icon: DollarSign,
            color: "text-emerald-500",
            bgColor: "bg-emerald-500/10",
            borderColor: "border-emerald-500/20",
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.05 }}
                    >
                        <Card className={`relative overflow-hidden border ${card.borderColor} shadow-xs bg-card/60 backdrop-blur-xs transition-all hover:shadow-md`}>
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        {card.title}
                                    </p>
                                    <div className="text-2xl font-bold tracking-tight">
                                        {loading ? (
                                            <div className="h-7 w-20 bg-muted/60 animate-pulse rounded-md" />
                                        ) : (
                                            card.value
                                        )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground/80">
                                        {card.subtitle}
                                    </p>
                                </div>
                                <div className={`p-3 rounded-xl ${card.bgColor} ${card.color} shrink-0`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                );
            })}
        </div>
    );
}
