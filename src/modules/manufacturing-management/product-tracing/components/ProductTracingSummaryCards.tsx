"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MovementSummaryStats } from "../types";
import {
    ArrowDownRight,
    ArrowUpRight,
    Scale,
    ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    stats: MovementSummaryStats;
    className?: string;
}

export function ProductTracingSummaryCards({ stats, className }: Props) {
    const isNetPositive = stats.netMovement >= 0;
    const isValuationPositive = stats.netValuation >= 0;

    const complianceRate = stats.totalRecords > 0
        ? ((stats.goodBatchesCount / stats.totalRecords) * 100).toFixed(1)
        : "100.0";

    return (
        <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
            {/* Card 1: Inflow */}
            <Card className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] shadow-sm relative overflow-hidden">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400">
                            Total Inbound
                        </span>
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                            <ArrowUpRight className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                            +{stats.totalIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="font-semibold text-emerald-600">
                                ₱{stats.totalInValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span>inflow valuation</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Card 2: Outflow */}
            <Card className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] shadow-sm relative overflow-hidden">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-700/80 dark:text-rose-400">
                            Total Outbound
                        </span>
                        <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600">
                            <ArrowDownRight className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                            -{stats.totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="font-semibold text-rose-600">
                                ₱{stats.totalOutValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span>outflow valuation</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Card 3: Net Movement */}
            <Card className="rounded-2xl border border-primary/20 bg-primary/[0.03] shadow-sm relative overflow-hidden">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-primary/80">
                            Net Inventory Delta
                        </span>
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <Scale className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className={cn("text-2xl font-black tabular-nums tracking-tight", isNetPositive ? "text-emerald-600" : "text-rose-600")}>
                            {isNetPositive ? "+" : ""}{stats.netMovement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className={cn("font-semibold", isValuationPositive ? "text-emerald-600" : "text-rose-600")}>
                                {isValuationPositive ? "+" : ""}₱{stats.netValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span>net valuation</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Card 4: Quality & Integrity */}
            <Card className="rounded-2xl border shadow-sm relative overflow-hidden">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            Quality & Batch Health
                        </span>
                        <div className="p-2 rounded-xl bg-muted text-muted-foreground">
                            <ShieldCheck className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                                {complianceRate}%
                            </span>
                            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                {stats.goodBatchesCount} Good
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                            {stats.expiredBatchesCount > 0 && (
                                <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold">
                                    {stats.expiredBatchesCount} Expired
                                </Badge>
                            )}
                            {stats.damagedBatchesCount > 0 && (
                                <Badge className="text-[9px] px-1.5 py-0 font-bold bg-amber-500 text-white">
                                    {stats.damagedBatchesCount} Damaged
                                </Badge>
                            )}
                            {stats.quarantinedBatchesCount > 0 && (
                                <Badge className="text-[9px] px-1.5 py-0 font-bold bg-yellow-500 text-black">
                                    {stats.quarantinedBatchesCount} Quarantined
                                </Badge>
                            )}
                            <span className="opacity-70">
                                ({stats.distinctBatchesCount} batches across {stats.distinctProductsCount} products)
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
