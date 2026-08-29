import React from "react";
import { Warehouse, PackageCheck, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LotKpiMetrics } from "../types";

interface LotKpiCardsProps {
    metrics: LotKpiMetrics;
}

export default function LotKpiCards({ metrics }: LotKpiCardsProps) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Storage Racks */}
            <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 shadow-xs hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Storage Racks / Lots
                        </p>
                        <h3 className="text-2xl font-black text-foreground mt-1">
                            {metrics.totalLots.toLocaleString()}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={metrics.selectedProductName ? `Racks holding ${metrics.selectedProductName}` : "Active storage locations"}>
                            {metrics.selectedProductName ? `Racks holding ${metrics.selectedProductName}` : "Active storage locations"}
                        </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                        <Warehouse className="h-5 w-5" />
                    </div>
                </CardContent>
            </Card>

            {/* FEFO Next Priority Batches */}
            <Card className="relative overflow-hidden border border-amber-500/30 bg-gradient-to-br from-card via-card to-amber-500/10 shadow-xs hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1">
                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                FEFO Next (#1)
                            </p>
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                        </div>
                        <h3 className="text-2xl font-black text-foreground mt-1 truncate">
                            {metrics.fefoNextCount.toLocaleString()}
                        </h3>
                        {(() => {
                            const isProductFiltered = !!metrics.selectedProductName;
                            const fefoBatchList = metrics.fefoNextBatchNumbers && metrics.fefoNextBatchNumbers.length > 0
                                ? metrics.fefoNextBatchNumbers
                                : (metrics.fefoNextBatches?.map((b) => b.batchNumber) || []);
                            const topBatchNo = fefoBatchList[0];

                            if (isProductFiltered) {
                                if (topBatchNo) {
                                    return (
                                        <p
                                            className="text-[10px] text-muted-foreground mt-0.5 truncate"
                                            title={`Priority #1 ${topBatchNo} for pick`}
                                        >
                                            Priority #1 <span className="font-mono font-bold text-foreground">{topBatchNo}</span> for pick
                                        </p>
                                    );
                                }
                                return (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                        No Priority #1 batch for pick
                                    </p>
                                );
                            }

                            return (
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                    Priority #1 batches for pick
                                </p>
                            );
                        })()}
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/30 shadow-xs">
                        <ShieldCheck className="h-5 w-5 text-amber-500" />
                    </div>
                </CardContent>
            </Card>

            {/* Active FEFO Available Quantity */}
            <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card via-card to-emerald-500/5 shadow-xs hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Active Units (FEFO)
                        </p>
                        <h3 className="text-2xl font-black text-foreground mt-1">
                            {(metrics.activeQuantity ?? metrics.totalQuantity).toLocaleString()}
                        </h3>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                            Available for allocation
                        </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                        <PackageCheck className="h-5 w-5" />
                    </div>
                </CardContent>
            </Card>

            {/* Quarantined & Expiring */}
            <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card via-card to-rose-500/5 shadow-xs hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Hold / Exempt Batches
                        </p>
                        <h3 className="text-2xl font-black text-foreground mt-1">
                            {metrics.quarantinedOrExpiring.toLocaleString()}
                        </h3>
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 font-medium mt-0.5">
                            Quarantined, expired or hold
                        </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
