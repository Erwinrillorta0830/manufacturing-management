"use client";

import { AlertTriangle, Clock3, History, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
    AssetHaltedJobOrder,
    MachineAssetReport,
    RouteStepUsage
} from "../types";

interface MachineDowntimeTableProps {
    assets: MachineAssetReport[];
    onOpenHistory: (assetId: number) => void;
    onStartMaintenance: (assetId: number, jobOrder: AssetHaltedJobOrder, routeStep: RouteStepUsage) => void;
}

function dateLabel(value: string | null): string {
    if (!value) return "Date not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function conditionBadgeClass(condition: string): string {
    if (condition === "Under Maintenance") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    if (condition === "Good") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (condition === "Bad") return "border-destructive/40 bg-destructive/10 text-destructive";
    return "border-border bg-muted text-muted-foreground";
}

function HaltedJobRows({
    jobOrder,
    assetId,
    onStartMaintenance
}: {
    jobOrder: AssetHaltedJobOrder;
    assetId: number;
    onStartMaintenance: MachineDowntimeTableProps["onStartMaintenance"];
}) {
    return (
        <div className="border-t px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{jobOrder.jobOrderNo}</span>
                        <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                            {jobOrder.eventType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{dateLabel(jobOrder.eventAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {jobOrder.reason || "No termination or cancellation reason was recorded."}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    {jobOrder.routeSteps.map((routeStep) => (
                        <Button
                            key={routeStep.routeId}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onStartMaintenance(assetId, jobOrder, routeStep)}
                        >
                            <Wrench className="mr-1.5 h-3.5 w-3.5" />
                            Mark maintenance
                            {routeStep.sequenceOrder ? " · Route " + routeStep.sequenceOrder : ""}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {jobOrder.routeSteps.map((routeStep) => (
                    <span key={routeStep.routeId}>
                        {routeStep.sequenceOrder ? "Route " + routeStep.sequenceOrder : "Route step"}: {routeStep.workCenterName} · {routeStep.status}
                    </span>
                ))}
            </div>
        </div>
    );
}

export function MachineDowntimeTable({
    assets,
    onOpenHistory,
    onStartMaintenance
}: MachineDowntimeTableProps) {
    return (
        <div className="space-y-4">
            {assets.map((asset) => (
                <Card key={asset.assetId} className="overflow-hidden">
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 bg-muted/30 py-4">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-base font-semibold">{asset.assetName}</h3>
                                <Badge variant="outline" className={conditionBadgeClass(asset.condition)}>
                                    {asset.condition}
                                </Badge>
                                {asset.historyMismatch && (
                                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                                        History mismatch
                                    </Badge>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Production asset #{asset.assetId} · {asset.trackedEpisodeCount} tracked episode{asset.trackedEpisodeCount === 1 ? "" : "s"} · Pre-rollout history unavailable
                            </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenHistory(asset.assetId)}>
                            <History className="mr-1.5 h-4 w-4" />
                            Maintenance history
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        {asset.historyMismatch && (
                            <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>The asset condition and maintenance episode history disagree. Review the history before changing the condition.</span>
                            </div>
                        )}
                        {asset.haltedJobOrders.length === 0 ? (
                            <div className="flex items-center gap-2 border-t px-4 py-4 text-sm text-muted-foreground">
                                <Clock3 className="h-4 w-4" />
                                No recorded terminations or cancellations are linked to a used route on this machine.
                            </div>
                        ) : (
                            <div>
                                {asset.haltedJobOrders.map((jobOrder) => (
                                    <HaltedJobRows
                                        key={jobOrder.jobOrderId}
                                        jobOrder={jobOrder}
                                        assetId={asset.assetId}
                                        onStartMaintenance={onStartMaintenance}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            {assets.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No Production assets were found.
                </div>
            )}
        </div>
    );
}
