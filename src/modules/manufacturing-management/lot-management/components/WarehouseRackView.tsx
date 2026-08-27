import React, { useState } from "react";
import { Plus, Pencil, Package, Calendar, AlertCircle, CheckCircle2, ShieldAlert, Boxes, Loader2, History, ChevronDown, ChevronUp } from "lucide-react";
import { Lot, Batch, BatchStatus } from "../types";
import { getFefoPriorityMap, sortBatchesByFefo, sortLotsByFefoExpiry } from "../utils/fefoEngine";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WarehouseRackViewProps {
    lots: Lot[];
    batches: Batch[];
    loading: boolean;
    selectedProductId?: number | "ALL";
    onEditLot: (lot: Lot) => void;
    onAddBatchToLot: (lotId: number) => void;
    onEditBatch: (batch: Batch) => void;
    onViewBatchMovements?: (batch: Batch) => void;
    onViewLotMovements?: (lotId: number) => void;
}

export default function WarehouseRackView({
    lots,
    batches,
    loading,
    selectedProductId = "ALL",
    onEditLot,
    onAddBatchToLot,
    onEditBatch,
    onViewBatchMovements,
    onViewLotMovements
}: WarehouseRackViewProps) {
    const [expandedLots, setExpandedLots] = useState<Record<number, boolean>>({});

    const toggleExpandLot = (lotId: number) => {
        setExpandedLots((prev) => ({
            ...prev,
            [lotId]: !prev[lotId]
        }));
    };

    const fefoMap = React.useMemo(() => {
        return getFefoPriorityMap(batches, selectedProductId);
    }, [batches, selectedProductId]);

    const sortedLots = React.useMemo(() => {
        return sortLotsByFefoExpiry(lots, batches, selectedProductId);
    }, [lots, batches, selectedProductId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground bg-card rounded-xl border border-border">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="text-sm font-semibold">Loading Warehouse Storage Racks...</span>
            </div>
        );
    }

    if (lots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground bg-card rounded-xl border border-border">
                <Boxes className="h-14 w-14 text-muted-foreground/30 mb-3" />
                <span className="text-base font-bold text-foreground">No Warehouse Storage Racks Configured</span>
                <p className="text-xs max-w-sm mt-1">
                    Click &quot;Add New Lot&quot; above to create your first warehouse rack bay.
                </p>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sortedLots.map((lot) => {
                    const rawLotBatches = batches.filter((b) => b.lotId === lot.lotId);
                    const fefoSortedBatches = sortBatchesByFefo(rawLotBatches);
                    const isExpanded = !!expandedLots[lot.lotId];
                    const visibleBatches = isExpanded ? fefoSortedBatches : fefoSortedBatches.slice(0, 5);
                    const hasMoreThan5 = fefoSortedBatches.length > 5;
                    const totalQty = rawLotBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);
                    const capacityPercent = Math.min(
                        100,
                        lot.maxBatchCapacity > 0 ? Math.round((totalQty / lot.maxBatchCapacity) * 100) : 0
                    );

                    // Capacity status color
                    let progressColorClass = "bg-emerald-500";
                    let progressBadgeClass = "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
                    if (capacityPercent >= 90) {
                        progressColorClass = "bg-rose-500";
                        progressBadgeClass = "text-rose-600 bg-rose-500/10 border-rose-500/20";
                    } else if (capacityPercent >= 70) {
                        progressColorClass = "bg-amber-500";
                        progressBadgeClass = "text-amber-600 bg-amber-500/10 border-amber-500/20";
                    }

                    const uomLabel = lot.uomShortcut || lot.uomName || "";

                    return (
                        <div
                            key={lot.lotId}
                            className="group relative flex flex-col rounded-xl border border-border/80 bg-card shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                        >
                            {/* Metallic Industrial Rack Header */}
                            <div className="p-4 border-b border-border/60 bg-gradient-to-r from-muted/40 via-card to-muted/20">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 animate-pulse" />
                                            <h4 className="font-extrabold text-foreground text-base truncate">
                                                {lot.lotName}
                                            </h4>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {uomLabel && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground uppercase border border-border">
                                                    {uomLabel}
                                                </span>
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                                Max Cap: <strong className="text-foreground">{lot.maxBatchCapacity.toLocaleString()}</strong>
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1 shrink-0">
                                        {onViewLotMovements && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => onViewLotMovements(lot.lotId)}
                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                title="View Rack Movements History"
                                            >
                                                <History className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onEditLot(lot)}
                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                            title="Edit Rack Settings"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => onAddBatchToLot(lot.lotId)}
                                            className="h-7 px-2.5 gap-1 text-xs shadow-xs"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Batch
                                        </Button>
                                    </div>
                                </div>

                                {/* Capacity Fill Indicator */}
                                <div className="mt-3.5 space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="font-semibold text-muted-foreground">
                                            Occupancy: {totalQty.toLocaleString()} / {lot.maxBatchCapacity.toLocaleString()} {uomLabel}
                                        </span>
                                        <span className={`px-1.5 py-0.2 rounded font-bold text-[10px] border ${progressBadgeClass}`}>
                                            {capacityPercent}%
                                        </span>
                                    </div>
                                    <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${progressColorClass}`}
                                            style={{ width: `${capacityPercent}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Shelving Bay Area (Visual Batch Boxes Stack) */}
                            <div className="p-3.5 flex-1 min-h-[180px] bg-muted/15 flex flex-col justify-start gap-2.5">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                                        FEFO Ordered Shelves ({fefoSortedBatches.length})
                                    </span>
                                    {hasMoreThan5 && !isExpanded && (
                                        <span className="text-[10px] text-muted-foreground font-medium">
                                            Showing top 5
                                        </span>
                                    )}
                                </div>

                                {fefoSortedBatches.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/60 rounded-lg text-center bg-card/40">
                                        <Package className="h-8 w-8 text-muted-foreground/30 mb-1.5" />
                                        <p className="text-xs text-muted-foreground font-medium">Shelf Bay Empty</p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onAddBatchToLot(lot.lotId)}
                                            className="mt-2.5 h-7 text-xs border-dashed"
                                        >
                                            <Plus className="h-3.5 w-3.5 mr-1" /> Register Batch
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className={`grid grid-cols-1 gap-2 ${isExpanded ? "max-h-[380px] overflow-y-auto pr-1" : ""}`}>
                                            {visibleBatches.map((batch) => {
                                                const statusConfig = getStatusConfig(batch.status);
                                                const fefoInfo = fefoMap.get(batch.batchId);

                                                return (
                                                    <div
                                                        key={batch.batchId}
                                                        onClick={() => onEditBatch(batch)}
                                                        className={`group/box relative flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                                                            fefoInfo?.isFefoNext
                                                                ? "bg-amber-500/10 border-amber-500/40 shadow-xs hover:border-amber-500"
                                                                : "border-border/80 bg-card hover:border-primary/50 hover:shadow-xs"
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-xs text-foreground group-hover/box:text-primary transition-colors truncate">
                                                                    {batch.batchNumber}
                                                                </span>
                                                                
                                                                {fefoInfo?.isFefoNext ? (
                                                                    <span className="px-1.5 py-0.2 text-[9px] font-black rounded-full bg-amber-500 text-amber-950 flex items-center gap-0.5 shadow-2xs animate-pulse">
                                                                        FEFO NEXT (#1)
                                                                    </span>
                                                                ) : fefoInfo?.priority ? (
                                                                    <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-muted text-foreground border border-border">
                                                                        #{fefoInfo.priority}
                                                                    </span>
                                                                ) : null}

                                                                <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full border ${statusConfig.badgeClass}`}>
                                                                    {statusConfig.label}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                                                                <span className="truncate max-w-[130px] font-semibold text-foreground">
                                                                    {batch.productName || `Product #${batch.productId}`}
                                                                </span>
                                                                {batch.itemCode && (
                                                                    <span className="truncate max-w-[110px] font-mono text-[10px]">
                                                                        ({batch.itemCode})
                                                                    </span>
                                                                )}
                                                                <span>
                                                                    Qty: <strong className="text-foreground">{batch.quantity.toLocaleString()}</strong> {batch.uomShortcut || uomLabel}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {onViewBatchMovements && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onViewBatchMovements(batch);
                                                                    }}
                                                                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                                                                    title="View Batch Movement History"
                                                                >
                                                                    <History className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                            {/* Expiration badge */}
                                                            {batch.expirationDate && (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded shrink-0 border ${
                                                                            fefoInfo?.isFefoNext ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold" : "bg-muted/50 text-muted-foreground border-border/50"
                                                                        }`}>
                                                                            <Calendar className="h-3 w-3 text-primary" />
                                                                            <span>{batch.expirationDate.slice(0, 10)}</span>
                                                                        </div>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top">
                                                                        <p className="text-xs">Expiration Date: {batch.expirationDate.slice(0, 10)}</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {hasMoreThan5 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => toggleExpandLot(lot.lotId)}
                                                className="w-full mt-1 h-7.5 text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 flex items-center justify-center gap-1.5 border-dashed border-primary/30 bg-primary/5 rounded-lg transition-all"
                                            >
                                                {isExpanded ? (
                                                    <>
                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                        Show Less (Top 5)
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                        +{fefoSortedBatches.length - 5} More Batches (Show All {fefoSortedBatches.length})
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Rack Footer */}
                            <div className="px-4 py-2 border-t border-border/50 bg-card flex items-center justify-end text-[11px] text-muted-foreground">
                                {/* <span>Shelf Ref: #{lot.lotId}</span> */}
                                <span>By: {lot.createdBy || "System"}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </TooltipProvider>
    );
}

function getStatusConfig(status: BatchStatus) {
    switch (status) {
        case "ACTIVE":
            return {
                label: "ACTIVE",
                icon: CheckCircle2,
                badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            };
        case "RELEASED":
            return {
                label: "RELEASED",
                icon: CheckCircle2,
                badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
            };
        case "QUARANTINED":
            return {
                label: "QUARANTINED",
                icon: ShieldAlert,
                badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            };
        case "HOLD":
            return {
                label: "HOLD",
                icon: AlertCircle,
                badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
            };
        case "EXPIRED":
            return {
                label: "EXPIRED",
                icon: AlertCircle,
                badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
            };
        default:
            return {
                label: status || "ACTIVE",
                icon: CheckCircle2,
                badgeClass: "bg-muted text-muted-foreground border-border"
            };
    }
}
