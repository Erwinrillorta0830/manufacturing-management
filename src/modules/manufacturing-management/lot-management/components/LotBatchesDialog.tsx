"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableCell,
    TableHead
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Batch, Lot } from "../types";
import { groupAndSumLotBatches } from "../utils/fefoEngine";
import {
    Boxes,
    Search,
    History,
    Gauge,
    Building2,
    Layers,
    AlertTriangle
} from "lucide-react";

interface LotBatchesDialogProps {
    isOpen: boolean;
    onClose: () => void;
    lot: Lot | null;
    batches: Batch[];
    onViewBatchMovements?: (batch: Batch) => void;
}

export default function LotBatchesDialog({
    isOpen,
    onClose,
    lot,
    batches,
    onViewBatchMovements
}: LotBatchesDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");

    // Batches stored in this lot
    const lotBatches = useMemo(() => {
        if (!lot) return [];
        const raw = batches.filter((b) => Number(b.lotId) === Number(lot.lotId) && Number(b.quantity || 0) !== 0);
        return groupAndSumLotBatches(raw);
    }, [lot, batches]);

    // Filtered by local search query
    const filteredBatches = useMemo(() => {
        if (!searchQuery.trim()) return lotBatches;
        const q = searchQuery.toLowerCase().trim();
        return lotBatches.filter(
            (b) =>
                b.batchNumber.toLowerCase().includes(q) ||
                (b.productName && b.productName.toLowerCase().includes(q)) ||
                (b.itemCode && b.itemCode.toLowerCase().includes(q))
        );
    }, [lotBatches, searchQuery]);

    if (!lot) return null;

    const unitLabel = lot.uomShortcut || lot.uomName || "";
    const positiveQuantity = lotBatches.reduce((sum, b) => {
        const q = Number(b.quantity || 0);
        return q > 0 ? sum + q : sum;
    }, 0);

    const negativeQuantity = lotBatches.reduce((sum, b) => {
        const q = Number(b.quantity || 0);
        return q < 0 ? sum + Math.abs(q) : sum;
    }, 0);

    const totalQuantity = positiveQuantity;
    const maxCapacity = Number(lot.maxBatchCapacity || 0);
    const isNegative = negativeQuantity > 0;
    const occupancyPct = maxCapacity > 0
        ? Math.max(0, Math.min(100, Math.round((positiveQuantity / maxCapacity) * 100)))
        : 0;
    const isOverCapacity = maxCapacity > 0 && positiveQuantity > maxCapacity;
    const isNearCapacity = maxCapacity > 0 && positiveQuantity >= maxCapacity * 0.8 && !isOverCapacity && !isNegative;

    const greenPercent = maxCapacity > 0 ? Math.max(0, Math.min(100, Math.round((positiveQuantity / maxCapacity) * 100))) : 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="sm:max-w-4xl lg:max-w-5xl w-full max-h-[85vh] flex flex-col p-0 overflow-hidden bg-card border-border shadow-2xl rounded-2xl animate-in fade-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <DialogHeader className="p-6 pr-14 border-b border-border/80 bg-muted/20 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Boxes className="h-5 w-5 text-primary" />
                                <DialogTitle className="text-lg font-bold text-foreground">
                                    Storage Rack Batches
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-xs text-muted-foreground mt-1">
                                Storage location: <strong className="text-foreground">{lot.lotName}</strong>
                            </DialogDescription>
                        </div>

                        {/* Top Badges */}
                        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                            {lot.branchName && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-muted text-foreground border border-border">
                                    <Building2 className="h-3 w-3 text-primary shrink-0" />
                                    <span>{lot.branchName}</span>
                                    {lot.branchCode && (
                                        <span className="text-[10px] font-mono text-muted-foreground font-bold">
                                            ({lot.branchCode})
                                        </span>
                                    )}
                                </span>
                            )}

                            {unitLabel && (
                                <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-muted text-muted-foreground border border-border">
                                    UOM: {unitLabel}
                                </span>
                            )}

                            {isNegative ? (
                                <span className="px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Shortfall (-{negativeQuantity.toLocaleString()} {unitLabel})
                                </span>
                            ) : (
                                <span
                                    className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1 ${
                                        isOverCapacity
                                            ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
                                            : isNearCapacity
                                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                    }`}
                                >
                                    <Gauge className="h-3.5 w-3.5" />
                                    {occupancyPct}% Occupancy
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Progress bar with label */}
                    {maxCapacity > 0 && (
                        <div className="mt-3.5 pt-3 border-t border-border/40 flex items-center gap-3">
                            <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
                                Capacity:
                            </span>
                            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden border border-border/30 flex relative">
                                {positiveQuantity > 0 && (
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 shrink-0 ${
                                            isOverCapacity
                                                ? "bg-rose-600"
                                                : isNearCapacity
                                                  ? "bg-amber-500"
                                                  : "bg-primary"
                                        }`}
                                        style={{ width: `${greenPercent}%` }}
                                        title={`Current Positive Stock: ${positiveQuantity.toLocaleString()} / ${maxCapacity.toLocaleString()} ${unitLabel} (${greenPercent}%)`}
                                    />
                                )}
                            </div>
                            <span className="text-[11px] font-medium shrink-0 text-muted-foreground">
                                {positiveQuantity.toLocaleString()} / {maxCapacity.toLocaleString()} {unitLabel}
                                {negativeQuantity > 0 ? (
                                    <span className="ml-1 text-rose-600 dark:text-rose-400 font-bold">
                                        (-{negativeQuantity.toLocaleString()} Shortfall)
                                    </span>
                                ) : (
                                    ` (${occupancyPct}%)`
                                )}
                            </span>
                        </div>
                    )}
                </DialogHeader>

                {/* Sub-toolbar */}
                <div className="px-6 py-3 border-b border-border/60 bg-muted/10 flex items-center justify-between gap-3 shrink-0">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search batch #, item, or SKU..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-8.5 text-xs bg-background"
                        />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 font-medium">
                        {filteredBatches.length} {filteredBatches.length === 1 ? "Batch" : "Batches"} in Lot
                    </span>
                </div>

                {/* Table Body - Natural height up to max-h */}
                <div className="overflow-y-auto max-h-[50vh] p-0">
                    {filteredBatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground">
                            <Layers className="h-10 w-10 text-muted-foreground/30 mb-2" />
                            <span className="text-sm font-semibold">No batches stored in this lot</span>
                            <p className="text-xs max-w-xs mt-1">
                                {searchQuery ? "No batches match your search filter." : "This storage rack currently has no registered batches."}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/40 sticky top-0 z-10 border-b border-border">
                                <TableRow>
                                    <TableHead className="w-[60px] text-xs pl-6">No.</TableHead>
                                    <TableHead className="w-[170px] text-xs font-bold">Batch Number</TableHead>
                                    <TableHead className="min-w-[220px] text-xs font-bold">Item / SKU</TableHead>
                                    <TableHead className="w-[110px] text-xs font-bold text-right">Quantity</TableHead>
                                    <TableHead className="w-[105px] text-xs font-bold">Mfg Date</TableHead>
                                    <TableHead className="w-[105px] text-xs font-bold">Exp Date</TableHead>
                                    <TableHead className="w-[95px] text-xs font-bold">QA Status</TableHead>
                                    <TableHead className="w-[75px] text-xs font-bold text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredBatches.map((batch, idx) => {
                                    const bUnit = batch.uomShortcut || batch.uomName || unitLabel;
                                    const isGood = batch.qaStatus === "GOOD";
                                    const isExpired = batch.expirationDate
                                        ? new Date(batch.expirationDate).getTime() <= new Date().setHours(23, 59, 59, 999)
                                        : (batch.qaStatus === "EXPIRED" || batch.status === "EXPIRED");

                                    return (
                                        <motion.tr
                                            key={batch.batchId}
                                            initial={{ opacity: 0, x: -15 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.2, delay: idx * 0.04, ease: "easeOut" as const }}
                                            onClick={() => onViewBatchMovements?.(batch)}
                                            className={`cursor-pointer transition-colors border-b border-border ${
                                                isExpired
                                                    ? "bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-950/25 border-l-4 border-l-rose-500"
                                                    : "hover:bg-muted/50"
                                            }`}
                                        >
                                            <TableCell className="text-xs text-muted-foreground font-mono pl-6 py-3">
                                                {idx + 1}
                                            </TableCell>
                                            <TableCell className="font-bold text-xs text-foreground py-3" title={batch.batchNumber}>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="px-2 py-0.5 rounded bg-primary/5 text-primary border border-primary/20 font-mono">
                                                        {batch.batchNumber}
                                                    </span>
                                                    {isExpired && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 shrink-0 shadow-2xs">
                                                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                                            EXPIRED
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-3">
                                                <div className="flex flex-col min-w-[200px] max-w-[360px]">
                                                    <span
                                                        className="font-semibold text-xs text-foreground truncate"
                                                        title={batch.productName || `Product #${batch.productId}`}
                                                    >
                                                        {batch.productName || `Product #${batch.productId}`}
                                                    </span>
                                                    <span
                                                        className="font-mono text-[10px] text-muted-foreground truncate"
                                                        title={batch.itemCode || `PROD-${batch.productId}`}
                                                    >
                                                        {batch.itemCode || `PROD-${batch.productId}`}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-xs py-3">
                                                <span className={batch.quantity < 0 ? "text-rose-600 dark:text-rose-400 font-mono" : ""}>
                                                    {batch.quantity.toLocaleString()}
                                                </span>
                                                {bUnit && (
                                                    <span className="text-[10px] text-muted-foreground font-normal ml-1">
                                                        {bUnit}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground py-3">
                                                {batch.manufacturingDate ? batch.manufacturingDate.slice(0, 10) : "-"}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground py-3">
                                                <span className={isExpired ? "font-bold text-rose-600 dark:text-rose-400" : ""}>
                                                    {batch.expirationDate ? batch.expirationDate.slice(0, 10) : "-"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                                                        isGood
                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                                    }`}
                                                >
                                                    {batch.qaStatus || "GOOD"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 py-3">
                                                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                                                    {onViewBatchMovements && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => onViewBatchMovements(batch)}
                                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                            title="View Movement History"
                                                        >
                                                            <History className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                         </motion.tr>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 border-t border-border/80 bg-muted/20 flex items-center justify-between shrink-0">
                    <span className="text-xs text-muted-foreground">
                        Clicking a batch row opens its movement audit history.
                    </span>
                    <Button variant="outline" size="sm" onClick={onClose} className="h-8 px-4 text-xs">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
