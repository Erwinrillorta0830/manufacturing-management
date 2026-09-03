import React from "react";
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
import { Batch, InventoryMovement, Lot, Branch } from "../types";
import { ArrowDownLeft, ArrowUpRight, History, Layers, Package, Warehouse, Loader2 } from "lucide-react";
import { resolveProductClassification } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";

interface BatchMovementsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    batch: Batch | null;
    movements: InventoryMovement[];
    lots?: Lot[];
    branches?: Branch[];
    loading?: boolean;
}

export default function BatchMovementsDialog({
    isOpen,
    onClose,
    batch,
    movements,
    lots = [],
    branches = [],
    loading = false
}: BatchMovementsDialogProps) {
    // Filter movements specifically for this batch
    const batchMovements = React.useMemo(() => {
        if (!batch) return [];
        const bNo = batch.batchNumber.toLowerCase().trim();
        const pId = Number(batch.productId || 0);
        const lId = Number(batch.lotId || 0);

        return movements.filter((m) => {
            const matchesInvId = batch.batchId > 0 && Number(m.inventoryLotId) === batch.batchId;
            const matchesBatchNo = (m.batchNo || "").toLowerCase().trim() === bNo;
            const matchesProd = pId === 0 || Number(m.productId) === pId;
            const matchesLot = lId === 0 || Number(m.lotId) === lId;

            return matchesInvId || (matchesBatchNo && matchesProd && matchesLot);
        }).sort((a, b) => {
            const timeA = new Date(a.postedAt || a.transactionDate || 0).getTime();
            const timeB = new Date(b.postedAt || b.transactionDate || 0).getTime();
            return timeB - timeA;
        });
    }, [batch, movements]);

    const classification = React.useMemo(() => {
        if (!batch) return { code: "OTHER", label: "General", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" };
        const cls = resolveProductClassification(batch.productType, batch.productCategory, batch.itemCode, batch.productName);
        let className = "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
        if (cls.code === "RM") className = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
        if (cls.code === "PKG") className = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
        if (cls.code === "FG") className = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
        return { ...cls, className };
    }, [batch]);

    if (!batch) return null;

    const matchedLot = lots.find((l) => Number(l.lotId) === Number(batch.lotId));
    const matchedBranch = branches.find((br) => Number(br.id) === Number(batch.branchId || matchedLot?.branchId));

    const branchName = matchedLot?.branchName || matchedBranch?.branchName || (batch.branchId ? `Branch #${batch.branchId}` : "");
    const branchCode = matchedLot?.branchCode || matchedBranch?.branchCode;
    const branchDisplay = branchName ? (branchCode ? `${branchName} (${branchCode})` : branchName) : "";

    const isBadStock = Boolean(
        matchedLot?.isBadStock ||
        matchedLot?.branchIsBadStock ||
        batch.qaStatus === "DAMAGED" ||
        batch.qaStatus === "QUARANTINED" ||
        batch.qaStatus === "EXPIRED" ||
        batch.status === "DAMAGED" ||
        batch.status === "QUARANTINED" ||
        batch.status === "EXPIRED"
    );

    // Compute stats from actual movement ledger
    const totalIn = batchMovements.reduce((sum, m) => sum + Number(m.quantityIn || 0), 0);
    const totalOut = batchMovements.reduce((sum, m) => sum + Number(m.quantityOut || 0), 0);
    const netOnhand = totalIn - totalOut;
    const unitLabel = batch.uomShortcut || batch.uomName || "";
    // When movement audit records exist, live on-hand is strictly computed from totalIn - totalOut
    const liveQuantity = batchMovements.length > 0 ? netOnhand : Number(batch.quantity || 0);
    const totalValue = liveQuantity * (batch.unitCost || 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="!max-w-[1400px] !w-[95vw] sm:!max-w-[1400px] md:!max-w-[1400px] lg:!max-w-[1400px] xl:!max-w-[1400px] max-h-[88vh] flex flex-col p-0 overflow-hidden bg-card border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                style={{ maxWidth: "1400px", width: "95vw" }}
            >
                {/* Header */}
                <DialogHeader className="p-6 pr-14 border-b border-border/80 bg-muted/20">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <History className="h-5 w-5 text-primary" />
                                <DialogTitle className="text-lg font-bold text-foreground">
                                    Inventory Movement History
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-xs text-muted-foreground mt-1">
                                Audit ledger of all inbound and outbound transactions for Batch{" "}
                                <strong className="text-foreground">{batch.batchNumber}</strong>
                            </DialogDescription>
                        </div>

                        {/* Clean Badges: Branch, Product Type, Stock Quality, Batch No */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {branchDisplay && (
                                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-foreground border border-border">
                                    {branchDisplay}
                                </span>
                            )}

                            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${classification.className}`}>
                                {classification.label}
                            </span>

                            {isBadStock ? (
                                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                    Bad Stock
                                </span>
                            ) : (
                                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    Good Stock
                                </span>
                            )}

                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                                {batch.batchNumber}
                            </span>
                        </div>
                    </div>

                    {/* Metadata chips */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/40">
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Product / SKU</p>
                                <p className="text-xs font-bold text-foreground truncate">
                                    {batch.productName || `Product #${batch.productId}`}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Storage Rack</p>
                                <p className="text-xs font-bold text-foreground truncate">
                                    {batch.lotName}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Live On-Hand</p>
                                <p className={`text-xs font-black ${liveQuantity < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {liveQuantity.toLocaleString()} {unitLabel}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="truncate">
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Valuation</p>
                                <p className="text-xs font-bold text-foreground">
                                    ₱{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Summary Banner */}
                <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-muted/40 border-b border-border text-xs font-medium">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                        </span>
                        <div>
                            <span className="text-[10px] text-muted-foreground block">Total Inbound</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                +{totalIn.toLocaleString()} {unitLabel}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </span>
                        <div>
                            <span className="text-[10px] text-muted-foreground block">Total Outbound</span>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                                -{totalOut.toLocaleString()} {unitLabel}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div>
                            <span className="text-[10px] text-muted-foreground block">Movements Count</span>
                            <span className="font-bold text-foreground">
                                {batchMovements.length} Record{batchMovements.length === 1 ? "" : "s"}
                            </span>
                        </div>
                    </div>
                </div>
                {/* Movements Table */}
                <div className="flex-1 overflow-y-auto p-6 max-h-[460px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-12 gap-2 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-xs">Loading movements...</span>
                        </div>
                    ) : batchMovements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                            <History className="h-10 w-10 text-muted-foreground/30 mb-2" />
                            <span className="text-sm font-semibold">No direct movement records found</span>
                            <p className="text-xs max-w-xs mt-1">
                                This batch was registered in Directus master catalog. Inbound/outbound stock adjustments will record here.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-border bg-card overflow-x-auto">
                            <Table className="min-w-[1000px]">
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead className="w-[50px] pl-4">No.</TableHead>
                                        <TableHead className="min-w-[160px]">Ref / Key</TableHead>
                                        <TableHead className="min-w-[150px]">Type / Module</TableHead>
                                        <TableHead className="w-[110px]">Direction</TableHead>
                                        <TableHead className="text-right w-[110px]">Qty In</TableHead>
                                        <TableHead className="text-right w-[110px]">Qty Out</TableHead>
                                        <TableHead className="text-right w-[100px]">Unit Cost</TableHead>
                                        <TableHead className="w-[110px]">Condition</TableHead>
                                        <TableHead className="w-[160px]">Date & Time</TableHead>
                                        <TableHead className="min-w-[180px] pr-4">Remarks</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {batchMovements.map((m, idx) => {
                                        const isDirectionIn = (m.movementDirection || "").toUpperCase() === "IN";
                                        return (
                                            <TableRow key={m.movementKey || idx}>
                                                <TableCell className="text-xs text-muted-foreground font-medium pl-4 py-3">{idx + 1}</TableCell>
                                                <TableCell className="py-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-xs text-foreground">
                                                             {m.referenceNo || m.movementKey || "-"}
                                                        </span>
                                                        {m.movementKey && m.movementKey !== m.referenceNo && (
                                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                                {m.movementKey}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-foreground uppercase border border-border">
                                                        {m.transactionType || m.sourceModule || "MOVEMENT"}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    {isDirectionIn ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                            <ArrowDownLeft className="h-3 w-3" />
                                                            IN
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                            <ArrowUpRight className="h-3 w-3" />
                                                            OUT
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs py-3">
                                                    {Number(m.quantityIn || 0) > 0 ? `+${Number(m.quantityIn).toLocaleString()}` : "-"}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-rose-600 dark:text-rose-400 text-xs py-3">
                                                    {Number(m.quantityOut || 0) > 0 ? `-${Number(m.quantityOut).toLocaleString()}` : "-"}
                                                </TableCell>
                                                <TableCell className="text-right text-xs py-3">
                                                    ₱{Number(m.unitCost || 0).toFixed(2)}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                                        {m.inventoryCondition || "GOOD"}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3">
                                                    {m.transactionDate ? m.transactionDate.replace("T", " ").slice(0, 19) : (m.postedAt ? m.postedAt.replace("T", " ").slice(0, 19) : "-")}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate pr-4 py-3" title={m.remarks || ""}>
                                                    {m.remarks || "-"}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 border-t border-border bg-muted/10 flex justify-end">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
