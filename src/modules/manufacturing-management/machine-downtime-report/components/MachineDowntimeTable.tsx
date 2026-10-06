"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, Clock3, History, RotateCcw, Search, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { phtTimestampToEpoch } from "@/modules/manufacturing-management/shared/pht-date";
import type {
    AssetHaltedJobOrder,
    MachineAssetReport,
    RouteStepUsage
} from "../types";

interface MachineDowntimeTableProps {
    assets: MachineAssetReport[];
    totalAssets: number;
    totalAvailableAssets: number;
    searchQuery: string;
    conditionFilter: string;
    eventFilter: string;
    currentPage: number;
    totalPages: number;
    startIndex: number;
    pageSize: number;
    onSearchQueryChange: (value: string) => void;
    onConditionFilterChange: (value: "All" | "Under Maintenance" | "Good") => void;
    onEventFilterChange: (value: "All" | "Termination" | "Cancellation") => void;
    onResetFilters: () => void;
    onPageChange: (page: number) => void;
    onOpenHistory: (assetId: number) => void;
    onStartMaintenance: (assetId: number, jobOrder: AssetHaltedJobOrder, routeStep: RouteStepUsage) => void;
}

function dateLabel(value: string | null): string {
    if (!value) return "Date not recorded";
    const timestamp = phtTimestampToEpoch(value);
    if (!timestamp) return value;
    const date = new Date(timestamp);
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
    totalAssets,
    totalAvailableAssets,
    searchQuery,
    conditionFilter,
    eventFilter,
    currentPage,
    totalPages,
    startIndex,
    pageSize,
    onSearchQueryChange,
    onConditionFilterChange,
    onEventFilterChange,
    onResetFilters,
    onPageChange,
    onOpenHistory,
    onStartMaintenance
}: MachineDowntimeTableProps) {
    const [jobOrdersAsset, setJobOrdersAsset] = useState<MachineAssetReport | null>(null);
    const hasActiveFilters = searchQuery.trim() !== "" || conditionFilter !== "All" || eventFilter !== "All";

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 md:flex-row md:items-center">
                <div className="relative w-full flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        aria-label="Search machine downtime report"
                        placeholder="Search asset name/ID, JO number, reason, or work center..."
                        value={searchQuery}
                        onChange={(event) => onSearchQueryChange(event.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={conditionFilter} onValueChange={onConditionFilterChange}>
                        <SelectTrigger aria-label="Filter by asset condition" className="w-[175px]">
                            <SelectValue placeholder="All conditions" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All conditions</SelectItem>
                            <SelectItem value="Under Maintenance">Under Maintenance</SelectItem>
                            <SelectItem value="Good">Good</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={eventFilter} onValueChange={onEventFilterChange}>
                        <SelectTrigger aria-label="Filter by Job Order event" className="w-[165px]">
                            <SelectValue placeholder="All JO events" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All JO events</SelectItem>
                            <SelectItem value="Termination">Termination</SelectItem>
                            <SelectItem value="Cancellation">Cancellation</SelectItem>
                        </SelectContent>
                    </Select>
                    {hasActiveFilters && (
                        <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>
                            <RotateCcw className="mr-1.5 h-4 w-4" />
                            Reset
                        </Button>
                    )}
                </div>
            </div>

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
                        <div className="flex flex-wrap gap-2">
                            {asset.haltedJobOrders.length > 0 && (
                                <Button type="button" variant="outline" size="sm" onClick={() => setJobOrdersAsset(asset)}>
                                    <ClipboardList className="mr-1.5 h-4 w-4" />
                                    Job Orders
                                </Button>
                            )}
                            <Button type="button" variant="outline" size="sm" onClick={() => onOpenHistory(asset.assetId)}>
                                <History className="mr-1.5 h-4 w-4" />
                                Maintenance history
                            </Button>
                        </div>
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
                        ) : null}
                    </CardContent>
                </Card>
            ))}

            {totalAssets === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {totalAvailableAssets === 0
                        ? "No Production assets were found."
                        : "No machines match the current search or filters."}
                </div>
            )}

            {totalAssets > 0 && (
                <div className="flex flex-col items-center justify-between gap-3 px-1 py-2 text-sm text-muted-foreground sm:flex-row">
                    <span>
                        Showing {startIndex + 1}-{Math.min(startIndex + pageSize, totalAssets)} of {totalAssets} machines
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
                            disabled={currentPage <= 1}
                        >
                            <ChevronLeft className="mr-1 h-4 w-4" />
                            Previous
                        </Button>
                        <span aria-live="polite" className="min-w-[90px] text-center text-xs">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
                            disabled={currentPage >= totalPages}
                        >
                            Next
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <Dialog
                open={jobOrdersAsset !== null}
                onOpenChange={(open) => {
                    if (!open) setJobOrdersAsset(null);
                }}
            >
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Job Orders</DialogTitle>
                        <DialogDescription>
                            {jobOrdersAsset
                                ? jobOrdersAsset.assetName + " - Production asset #" + jobOrdersAsset.assetId
                                : "Related job orders"}
                        </DialogDescription>
                    </DialogHeader>
                    {jobOrdersAsset && (
                        <div className="max-h-[65vh] overflow-y-auto rounded-md border">
                            {jobOrdersAsset.haltedJobOrders.map((jobOrder) => (
                                <HaltedJobRows
                                    key={jobOrder.jobOrderId}
                                    jobOrder={jobOrder}
                                    assetId={jobOrdersAsset.assetId}
                                    onStartMaintenance={(assetId, selectedJobOrder, routeStep) => {
                                        setJobOrdersAsset(null);
                                        onStartMaintenance(assetId, selectedJobOrder, routeStep);
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
