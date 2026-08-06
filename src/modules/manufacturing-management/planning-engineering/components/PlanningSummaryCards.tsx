import React from "react";
import { ClipboardList, Database, Layers, AlertTriangle } from "lucide-react";

export interface PlanningSummaryCardsProps {
    demandLinesCount: number;
    shortfallItemsCount: number;
    unreleasedJobsCount: number;
    familyGroupsCount: number;
}

export function PlanningSummaryCards({
    demandLinesCount,
    shortfallItemsCount,
    unreleasedJobsCount,
    familyGroupsCount
}: PlanningSummaryCardsProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Pending Demand Lines */}
            <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Pending Demand Lines
                    </p>
                    <div className="text-2xl font-black text-foreground">
                        {demandLinesCount.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Sales order items ready for consolidation
                    </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <ClipboardList className="h-5 w-5" />
                </div>
            </div>

            {/* Card 2: Net Shortfall Items */}
            <div className={`bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between ${shortfallItemsCount > 0 ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
                <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Material Shortfalls
                    </p>
                    <div className={`text-2xl font-black ${shortfallItemsCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                        {shortfallItemsCount.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Items needing PR or replenishment
                    </p>
                </div>
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${shortfallItemsCount > 0 ? "bg-amber-500/10 border border-amber-500/20 text-amber-500" : "bg-muted border text-muted-foreground"}`}>
                    {shortfallItemsCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <Database className="h-5 w-5" />}
                </div>
            </div>

            {/* Card 3: Unreleased Job Orders */}
            <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Unreleased JO Queue
                    </p>
                    <div className="text-2xl font-black text-foreground">
                        {unreleasedJobsCount.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Draft & Planned job orders
                    </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 shrink-0">
                    <Layers className="h-5 w-5" />
                </div>
            </div>

            {/* Card 4: Family Groups */}
            <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Active Family Groups
                    </p>
                    <div className="text-2xl font-black text-foreground">
                        {familyGroupsCount.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Parent & Sub-Assembly Job Bundles
                    </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                    <Layers className="h-5 w-5 text-emerald-500" />
                </div>
            </div>
        </div>
    );
}
