import React, { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Package, Calendar, AlertCircle, CheckCircle2, ShieldAlert, Boxes, History, ChevronDown, ChevronUp, Building2, AlertTriangle } from "lucide-react";
import { Lot, Batch, BatchStatus } from "../types";
import { getFefoPriorityMap, groupAndSumLotBatches, sortBatchesByFefo, sortLotsByFefoExpiry } from "../utils/fefoEngine";
import { resolveProductClassification } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.06
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.25, ease: "easeOut" as const }
    }
};

interface WarehouseRackViewProps {
    lots: Lot[];
    batches: Batch[];
    loading: boolean;
    selectedBranchId?: number | "ALL";
    selectedProductType?: string | "ALL";
    selectedUomId?: number | "ALL";
    selectedProductId?: number | "ALL";
    selectedLotId?: number | "ALL" | number[];
    selectedBatchId?: number | "ALL" | number[];
    selectedStatusFilter?: string | "ALL";
    searchQuery?: string;
    onEditLot?: (lot: Lot) => void;
    onAddBatchToLot?: (lotId: number) => void;
    onEditBatch?: (batch: Batch) => void;
    onViewBatchMovements?: (batch: Batch) => void;
    onViewLotMovements?: (lotId: number) => void;
}

export default function WarehouseRackView({
    lots,
    batches,
    loading,
    selectedBranchId = "ALL",
    selectedProductType = "ALL",
    selectedUomId = "ALL",
    selectedProductId = "ALL",
    selectedLotId = "ALL",
    selectedBatchId = "ALL",
    selectedStatusFilter = "ALL",
    searchQuery = "",
    onEditLot,
    onViewBatchMovements,
    onViewLotMovements
}: WarehouseRackViewProps) {
    const [expandedLots, setExpandedLots] = useState<Record<number, boolean>>({});
    const [isFilteringTransition, setIsFilteringTransition] = useState(false);

    const isSingleLotSelected = React.useMemo(() => {
        if (Array.isArray(selectedLotId)) {
            return selectedLotId.length === 1;
        }
        return selectedLotId !== "ALL" && String(selectedLotId) !== "";
    }, [selectedLotId]);

    React.useEffect(() => {
        // Only trigger skeleton loading transition when exactly 1 lot is selected
        if (isSingleLotSelected) {
            setIsFilteringTransition(true);
            const timer = setTimeout(() => setIsFilteringTransition(false), 220);
            return () => clearTimeout(timer);
        } else {
            setIsFilteringTransition(false);
        }
    }, [selectedLotId, isSingleLotSelected]);

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
        const knownLotIds = new Set(lots.map((l) => Number(l.lotId)));
        const hasGhostBatches = batches.some((b) => !b.lotId || Number(b.lotId) === 0 || !knownLotIds.has(Number(b.lotId)));

        const ghostLot: Lot = {
            lotId: 0,
            lotName: "Unassigned / Pending Storage Rack (Ghost Rack)",
            branchId: 0,
            branchName: "System Virtual Rack",
            branchCode: "GHOST",
            uomId: null,
            uomName: "",
            uomShortcut: "",
            maxBatchCapacity: 999999,
            status: "ACTIVE",
            createdBy: "System Virtual",
            updatedBy: "System Virtual",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z"
        };
        let baseLots = hasGhostBatches ? [ghostLot, ...lots] : [...lots];

        if (selectedBranchId !== "ALL") {
            baseLots = baseLots.filter((lot) => Number(lot.lotId) === 0 || Number(lot.branchId) === Number(selectedBranchId));
        }
        if (selectedUomId !== "ALL") {
            baseLots = baseLots.filter((lot) => Number(lot.lotId) === 0 || Number(lot.uomId) === Number(selectedUomId));
        }
        if (selectedLotId !== "ALL") {
            if (Array.isArray(selectedLotId)) {
                if (selectedLotId.length > 0) {
                    const selectedSet = new Set(selectedLotId.map(Number));
                    baseLots = baseLots.filter((lot) => selectedSet.has(Number(lot.lotId)));
                }
            } else {
                baseLots = baseLots.filter((lot) => Number(lot.lotId) === Number(selectedLotId));
            }
        }

        const query = (searchQuery || "").toLowerCase().trim();

        const matchingLots = baseLots.filter((lot) => {
            const isGhost = Number(lot.lotId) === 0;
            const knownLotIds = new Set(lots.map((l) => Number(l.lotId)));
            const lotBatches = batches.filter((b) => {
                const isUnassigned = !b.lotId || Number(b.lotId) === 0 || !knownLotIds.has(Number(b.lotId));
                return isGhost ? isUnassigned : Number(b.lotId) === Number(lot.lotId);
            });

            if (selectedProductType !== "ALL") {
                const hasMatchingType = lotBatches.some(
                    (b) => resolveProductClassification(b.productType, b.productCategory, b.itemCode, b.productName).code === selectedProductType
                );
                if (!hasMatchingType) return false;
            }

            if (selectedProductId !== "ALL") {
                const hasProduct = lotBatches.some((b) => Number(b.productId) === Number(selectedProductId));
                if (!hasProduct) return false;
            }

            if (selectedBatchId !== "ALL") {
                if (Array.isArray(selectedBatchId)) {
                    if (selectedBatchId.length > 0) {
                        const batchSet = new Set(selectedBatchId.map(Number));
                        const hasBatch = lotBatches.some((b) => batchSet.has(Number(b.batchId)));
                        if (!hasBatch) return false;
                    }
                } else {
                    const hasBatch = lotBatches.some((b) => Number(b.batchId) === Number(selectedBatchId));
                    if (!hasBatch) return false;
                }
            }

            if (selectedStatusFilter !== "ALL") {
                const isNegFilter = selectedStatusFilter === "NEGATIVE";
                const isExpFilter = selectedStatusFilter === "EXPIRED";
                const isQuaFilter = selectedStatusFilter === "QUARANTINED";
                const isDamFilter = selectedStatusFilter === "DAMAGED";
                const isGoodFilter = selectedStatusFilter === "GOOD";

                const hasStatusMatch = lotBatches.some((b) => {
                    const q = Number(b.quantity || 0);
                    const qa = String(b.qaStatus || "").toUpperCase();
                    if (isNegFilter) return q < 0;
                    if (isExpFilter) return qa === "EXPIRED" || (b.expirationDate && new Date(b.expirationDate).getTime() < Date.now());
                    if (isQuaFilter) return qa === "QUARANTINED";
                    if (isDamFilter) return qa === "DAMAGED";
                    if (isGoodFilter) return (qa === "GOOD" || !qa) && q > 0;
                    return true;
                });
                if (!hasStatusMatch) return false;
            }

            if (query) {
                const lotNameMatches =
                    lot.lotName?.toLowerCase().includes(query) ||
                    lot.branchName?.toLowerCase().includes(query) ||
                    lot.branchCode?.toLowerCase().includes(query);
                const hasMatchingBatch = lotBatches.some(
                    (b) =>
                        b.batchNumber?.toLowerCase().includes(query) ||
                        b.productName?.toLowerCase().includes(query) ||
                        b.itemCode?.toLowerCase().includes(query) ||
                        b.remarks?.toLowerCase().includes(query)
                );
                if (!lotNameMatches && !hasMatchingBatch) return false;
            }

            return true;
        });

        return sortLotsByFefoExpiry(matchingLots, batches, selectedProductId);
    }, [lots, batches, selectedBranchId, selectedProductType, selectedUomId, selectedLotId, selectedBatchId, selectedStatusFilter, searchQuery, selectedProductId]);

    const expectedSkeletonCount = React.useMemo(() => {
        if (Array.isArray(selectedLotId)) {
            if (selectedLotId.length > 0) return selectedLotId.length;
        } else if (selectedLotId !== "ALL" && String(selectedLotId) !== "") {
            return 1;
        }
        return Math.min(lots.length || 6, 6);
    }, [selectedLotId, lots.length]);

    if (loading || isFilteringTransition) {
        return <WarehouseRackSkeleton count={expectedSkeletonCount} />;
    }

    if (lots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground bg-card rounded-xl border border-border">
                <Boxes className="h-14 w-14 text-muted-foreground/30 mb-3" />
                <span className="text-base font-bold text-foreground">No Warehouse Storage Racks Configured</span>
                <p className="text-xs max-w-sm mt-1">
                    Configure warehouse storage locations and racks in the Lot Registry module.
                </p>
            </div>
        );
    }

    const hasActiveFilter =
        selectedBranchId !== "ALL" ||
        selectedProductType !== "ALL" ||
        selectedUomId !== "ALL" ||
        selectedProductId !== "ALL" ||
        (Array.isArray(selectedLotId) ? selectedLotId.length > 0 : selectedLotId !== "ALL") ||
        (Array.isArray(selectedBatchId) ? selectedBatchId.length > 0 : selectedBatchId !== "ALL") ||
        !!searchQuery.trim();

    if (sortedLots.length === 0 && hasActiveFilter) {
        return (
            <div className="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed border-border/80 rounded-2xl bg-card/50">
                <Boxes className="h-14 w-14 text-muted-foreground/30 mb-3" />
                <span className="text-base font-bold text-foreground">No Storage Racks Matching Selected Filters</span>
                <p className="text-xs max-w-sm mt-1">
                    There are currently no registered batches or storage racks matching your filter criteria.
                </p>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
            >
                {sortedLots.map((lot) => {
                    const isGhostLot = Number(lot.lotId) === 0;
                    const knownLotIds = new Set(lots.map((l) => Number(l.lotId)));

                    const rawLotBatches = batches.filter((b) => {
                        const isUnassigned = !b.lotId || Number(b.lotId) === 0 || !knownLotIds.has(Number(b.lotId));
                        if (isGhostLot) {
                            if (!isUnassigned) return false;
                        } else {
                            if (Number(b.lotId) !== Number(lot.lotId)) return false;
                        }
                        if (Number(b.quantity || 0) === 0) return false;
                        if (selectedProductType !== "ALL") {
                            const cls = resolveProductClassification(b.productType, b.productCategory, b.itemCode, b.productName);
                            if (cls.code !== selectedProductType) return false;
                        }
                        if (selectedUomId !== "ALL" && Number(b.uomId) !== Number(selectedUomId) && Number(lot.uomId) !== Number(selectedUomId)) {
                            return false;
                        }
                        if (selectedProductId !== "ALL" && Number(b.productId) !== Number(selectedProductId)) {
                            return false;
                        }
                        if (selectedBatchId !== "ALL") {
                            if (Array.isArray(selectedBatchId)) {
                                if (selectedBatchId.length > 0 && !selectedBatchId.includes(Number(b.batchId))) return false;
                            } else if (Number(b.batchId) !== Number(selectedBatchId)) {
                                return false;
                            }
                        }
                        if (searchQuery.trim()) {
                            const q = searchQuery.toLowerCase().trim();
                            const matches =
                                lot.lotName?.toLowerCase().includes(q) ||
                                b.batchNumber?.toLowerCase().includes(q) ||
                                b.productName?.toLowerCase().includes(q) ||
                                b.itemCode?.toLowerCase().includes(q) ||
                                b.remarks?.toLowerCase().includes(q);
                            if (!matches) return false;
                        }
                        return true;
                    });
                    const groupedLotBatches = groupAndSumLotBatches(rawLotBatches);
                    const fefoSortedBatches = sortBatchesByFefo(groupedLotBatches);
                    const isExpanded = !!expandedLots[lot.lotId];
                    const visibleBatches = isExpanded ? fefoSortedBatches : fefoSortedBatches.slice(0, 5);
                    const hasMoreThan5 = fefoSortedBatches.length > 5;

                    // Physical rack occupancy and capacity reflect all inventory stored in this rack (unaffected by active product/batch filters)
                    const allLotBatches = groupAndSumLotBatches(
                        batches.filter((b) => {
                            const isUnassigned = !b.lotId || Number(b.lotId) === 0 || !knownLotIds.has(Number(b.lotId));
                            return isGhostLot ? isUnassigned : Number(b.lotId) === Number(lot.lotId);
                        })
                    );

                    const positiveStockQty = allLotBatches.reduce((sum, b) => {
                        const q = Number(b.quantity) || 0;
                        return q > 0 ? sum + q : sum;
                    }, 0);

                    const negativeStockQty = allLotBatches.reduce((sum, b) => {
                        const q = Number(b.quantity) || 0;
                        return q < 0 ? sum + Math.abs(q) : sum;
                    }, 0);

                    // Physical rack occupancy and capacity reflect positive stock stored in this rack
                    const totalRackOccupancy = positiveStockQty;
                    const isRackNegative = negativeStockQty > 0;

                    const cap = lot.maxBatchCapacity > 0 ? lot.maxBatchCapacity : 100;
                    const positivePercent = Math.max(0, Math.min(100, Math.round((positiveStockQty / cap) * 100)));
                    const capacityPercent = positivePercent;

                    // Capacity status color
                    let progressColorClass = "bg-emerald-500";
                    let progressBadgeClass = "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
                    if (isGhostLot) {
                        progressColorClass = "bg-amber-500";
                        progressBadgeClass = "text-amber-600 bg-amber-500/10 border-amber-500/20 font-bold";
                    } else if (isRackNegative) {
                        progressColorClass = "bg-emerald-500";
                        progressBadgeClass = "text-rose-600 bg-rose-500/15 border-rose-500/30 font-bold";
                    } else if (capacityPercent >= 90) {
                        progressColorClass = "bg-rose-500";
                        progressBadgeClass = "text-rose-600 bg-rose-500/10 border-rose-500/20";
                    } else if (capacityPercent >= 70) {
                        progressColorClass = "bg-amber-500";
                        progressBadgeClass = "text-amber-600 bg-amber-500/10 border-amber-500/20";
                    }

                    const uomLabel = lot.uomShortcut || lot.uomName || "";

                    // Calculate stored inventory types in this lot
                    const storedClassifications = (() => {
                        if (allLotBatches.length === 0) {
                            return [{ code: "EMPTY", label: "Empty / Vacant", className: "bg-muted text-muted-foreground border-border/80" }];
                        }
                        const map = new Map<string, { code: string; label: string; className: string }>();
                        allLotBatches.forEach((b) => {
                            const cls = resolveProductClassification(
                                b.productType,
                                b.productCategory,
                                b.itemCode,
                                b.productName
                            );
                            if (!map.has(cls.code)) {
                                let className = "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
                                if (cls.code === "RM") className = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
                                if (cls.code === "PKG") className = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
                                if (cls.code === "FG") className = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
                                map.set(cls.code, { code: cls.code, label: cls.label, className });
                            }
                        });
                        return Array.from(map.values());
                    })();

                    return (
                        <motion.div
                            key={lot.lotId}
                            variants={itemVariants}
                            className={cn(
                                "group relative flex flex-col rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden",
                                isGhostLot
                                    ? "border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10"
                                    : "border-border/80 bg-card"
                            )}
                        >
                            {/* Metallic Industrial Rack Header */}
                            <div className={cn(
                                "p-4 border-b",
                                isGhostLot
                                    ? "border-amber-500/30 bg-amber-500/10"
                                    : "border-border/60 bg-gradient-to-r from-muted/40 via-card to-muted/20"
                            )}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "h-2.5 w-2.5 rounded-full shrink-0 animate-pulse",
                                                isGhostLot ? "bg-amber-500" : "bg-primary"
                                            )} />
                                            <h4 className="font-extrabold text-foreground text-base truncate">
                                                {lot.lotName}
                                            </h4>
                                        </div>
                                        
                                        {/* Same Row: UOM, Max Capacity, Branch badge, Stored Type badges */}
                                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                            {uomLabel && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground uppercase border border-border shrink-0">
                                                    {uomLabel}
                                                </span>
                                            )}

                                            {/* Branch Location Badge */}
                                            {isGhostLot ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-2xs shrink-0">
                                                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                                                    Ghost / Pending Rack
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted/80 text-foreground border border-border/80 shadow-2xs shrink-0">
                                                    <Building2 className="h-3 w-3 text-primary shrink-0" />
                                                    <span className="truncate max-w-[120px]" title={lot.branchName || `Branch #${lot.branchId}`}>
                                                        {lot.branchName || `Branch #${lot.branchId}`}
                                                    </span>
                                                    {lot.branchCode && (
                                                        <span className="text-[9px] font-mono font-bold text-muted-foreground ml-0.5">
                                                            ({lot.branchCode})
                                                        </span>
                                                    )}
                                                </span>
                                            )}

                                            {/* Bad Stock Indicator if applicable */}
                                            {(lot.isBadStock || lot.branchIsBadStock) && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-2xs shrink-0">
                                                    <ShieldAlert className="h-3 w-3 shrink-0" /> Bad Stock
                                                </span>
                                            )}

                                            {/* Stored Type Badges */}
                                            {storedClassifications.map((sc) => (
                                                <span
                                                    key={sc.code}
                                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border shadow-2xs shrink-0 ${sc.className}`}
                                                >
                                                    <Boxes className="h-3 w-3 shrink-0 opacity-80" />
                                                    <span>{sc.label}</span>
                                                </span>
                                            ))}
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
                                        {onEditLot && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => onEditLot(lot)}
                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                title="Edit Rack Settings"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Capacity Fill Indicator */}
                                <div className="mt-3 space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="font-semibold text-muted-foreground">
                                            Occupancy: <span className="font-mono text-foreground font-bold">{totalRackOccupancy.toLocaleString()}</span> / {lot.maxBatchCapacity.toLocaleString()} {uomLabel}
                                            {negativeStockQty > 0 && (
                                                <span className="ml-1 text-rose-600 dark:text-rose-400 font-bold">
                                                    (-{negativeStockQty.toLocaleString()} Shortfall)
                                                </span>
                                            )}
                                        </span>
                                        <span className={`px-1.5 py-0.2 rounded font-bold text-[10px] border ${progressBadgeClass}`}>
                                            {isRackNegative ? "Shortfall" : `${capacityPercent}%`}
                                        </span>
                                    </div>
                                    <div
                                        className="h-2 w-full bg-muted/60 rounded-full overflow-hidden flex relative"
                                        title={`Physical Occupancy: ${totalRackOccupancy.toLocaleString()} / ${lot.maxBatchCapacity.toLocaleString()} ${uomLabel}${negativeStockQty > 0 ? ` (-${negativeStockQty.toLocaleString()} Shortfall)` : ""}`}
                                    >
                                        {positiveStockQty > 0 && (
                                            <div
                                                className={cn("h-full transition-all duration-300 rounded-full shrink-0", progressColorClass)}
                                                style={{ width: `${positivePercent}%` }}
                                                title={`Current Positive Stock: ${positiveStockQty.toLocaleString()} / ${cap.toLocaleString()} ${uomLabel} (${positivePercent}%)`}
                                            />
                                        )}
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
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className={`grid grid-cols-1 gap-2 ${isExpanded ? "max-h-[380px] overflow-y-auto pr-1" : ""}`}>
                                            {visibleBatches.map((batch, bIdx) => {
                                                const statusConfig = getStatusConfig(batch.status);
                                                const fefoInfo = fefoMap.get(batch.batchId);
                                                const isNegative = batch.quantity < 0;
                                                const isExpired = batch.expirationDate
                                                    ? new Date(batch.expirationDate).getTime() <= new Date().setHours(23, 59, 59, 999)
                                                    : (batch.qaStatus === "EXPIRED" || batch.status === "EXPIRED");

                                                return (
                                                    <motion.div
                                                        key={batch.batchId}
                                                        initial={{ opacity: 0, x: -15 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ duration: 0.2, delay: bIdx * 0.04, ease: "easeOut" as const }}
                                                        onClick={() => onViewBatchMovements?.(batch)}
                                                        title="Click to view batch movement history & audit trail"
                                                        className={`group/box relative flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                                                            isNegative
                                                                ? "bg-rose-500/10 border-rose-500/40 hover:border-rose-500 hover:bg-rose-500/15 dark:bg-rose-950/25 border-l-4 border-l-rose-500 shadow-xs"
                                                                : isExpired
                                                                    ? "bg-rose-500/10 border-rose-500/40 hover:border-rose-500 hover:bg-rose-500/15 dark:bg-rose-950/25 border-l-4 border-l-rose-500 shadow-xs"
                                                                    : fefoInfo?.isFefoNext
                                                                      ? "bg-amber-500/10 border-amber-500/40 shadow-xs hover:border-amber-500"
                                                                      : "border-border/80 bg-card hover:border-primary/50 hover:shadow-xs"
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-xs text-foreground group-hover/box:text-primary transition-colors truncate font-mono">
                                                                    {batch.batchNumber}
                                                                </span>

                                                                {isNegative && (
                                                                    <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded-full bg-rose-500 text-white flex items-center gap-0.5 shadow-2xs">
                                                                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                                                        NEGATIVE
                                                                    </span>
                                                                )}

                                                                {isExpired && !isNegative && (
                                                                    <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 shadow-2xs flex items-center gap-0.5">
                                                                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                                                        EXPIRED
                                                                    </span>
                                                                )}
                                                                
                                                                {fefoInfo?.isFefoNext ? (
                                                                    <span className="px-1.5 py-0.2 text-[9px] font-black rounded-full bg-amber-500 text-amber-950 flex items-center gap-0.5 shadow-2xs animate-pulse">
                                                                        FEFO NEXT (#1)
                                                                    </span>
                                                                ) : fefoInfo?.priority ? (
                                                                    <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-muted text-foreground border border-border">
                                                                        #{fefoInfo.priority}
                                                                    </span>
                                                                ) : null}

                                                                {!isExpired && statusConfig.label !== "ACTIVE" && (
                                                                    <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full border ${statusConfig.badgeClass}`}>
                                                                        {statusConfig.label}
                                                                    </span>
                                                                )}
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
                                                                    Qty: <strong className={isNegative ? "text-rose-600 dark:text-rose-400 font-black font-mono" : "text-foreground"}>{batch.quantity.toLocaleString()}</strong> {batch.uomShortcut || uomLabel}
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
                                                    </motion.div>
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
                        </motion.div>
                    );
                })}
            </motion.div>
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

export function WarehouseRackSkeleton({ count = 6 }: { count?: number }) {
    const itemsCount = Math.max(1, Math.min(12, count));
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: itemsCount }).map((_, i) => (
                <div
                    key={i}
                    className="flex flex-col rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden animate-pulse"
                >
                    {/* Rack Header Skeleton */}
                    <div className="p-4 border-b border-border/60 bg-muted/20 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                                <div className="h-5 w-32 bg-muted-foreground/20 rounded" />
                            </div>
                            <div className="h-7 w-7 rounded-lg bg-muted-foreground/20" />
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-12 bg-muted-foreground/20 rounded" />
                            <div className="h-4 w-28 bg-muted-foreground/20 rounded" />
                            <div className="h-4 w-20 bg-muted-foreground/20 rounded" />
                        </div>
                        {/* Occupancy bar */}
                        <div className="space-y-1 pt-1">
                            <div className="flex justify-between">
                                <div className="h-3 w-20 bg-muted-foreground/20 rounded" />
                                <div className="h-3 w-10 bg-muted-foreground/20 rounded" />
                            </div>
                            <div className="h-2 w-full bg-muted-foreground/20 rounded-full" />
                        </div>
                    </div>

                    {/* Shelf Content (3 batch items placeholder) */}
                    <div className="p-4 space-y-2.5 flex-1 bg-muted/5">
                        <div className="h-3 w-24 bg-muted-foreground/20 rounded mb-3" />
                        {[1, 2, 3].map((b) => (
                            <div key={b} className="p-2.5 rounded-lg border border-border/40 bg-card/60 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="h-4 w-28 bg-muted-foreground/20 rounded" />
                                    <div className="h-4 w-16 bg-muted-foreground/20 rounded-full" />
                                </div>
                                <div className="h-3.5 w-3/4 bg-muted-foreground/15 rounded" />
                                <div className="flex justify-between pt-1">
                                    <div className="h-3 w-20 bg-muted-foreground/15 rounded" />
                                    <div className="h-3.5 w-16 bg-muted-foreground/20 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-border/50 bg-card flex justify-end">
                        <div className="h-3 w-20 bg-muted-foreground/20 rounded" />
                    </div>
                </div>
            ))}
        </div>
    );
}

