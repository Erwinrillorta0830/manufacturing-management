"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    MMInventoryMovement,
    ProductLookup,
    LotLookup
} from "../types";
import {
    Layers,
    Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhtDate, formatPhtTime } from "../../shared/pht-date";

export interface BatchGroupData {
    key: string;
    items: MMInventoryMovement[];
    main: MMInventoryMovement;
    totalIn: number;
    totalOut: number;
    balance: number;
    lastDate?: string;
}

interface Props {
    batchGroup: BatchGroupData | null;
    isOpen: boolean;
    onClose: () => void;
    onSelectMovement: (movement: MMInventoryMovement) => void;
    products?: ProductLookup[];
    lots?: LotLookup[];
}

export function BatchMovementsModal({
    batchGroup,
    isOpen,
    onClose,
    onSelectMovement,
    products = [],
    lots = []
}: Props) {
    if (!batchGroup) return null;

    const main = batchGroup.main;
    const isGood = main.inventoryCondition?.toUpperCase() === "GOOD";
    const isExpired = main.inventoryCondition?.toUpperCase() === "EXPIRED";
    const isDamaged = main.inventoryCondition?.toUpperCase() === "DAMAGED";
    const isQuarantined = main.inventoryCondition?.toUpperCase() === "QUARANTINED";

    const resolvedProduct = products.find(p => p.productId === Number(main.productId));
    const resolvedProductName = resolvedProduct?.description || resolvedProduct?.productName || main.productName || "Finished Product";
    const resolvedProductCode = main.productCode || resolvedProduct?.productCode || "SKU-N/A";
    const resolvedUnitName = resolvedProduct?.unitName || (main.unitId === 1 ? "Pieces (PCS)" : "Units");

    const resolvedLot = lots.find(l => l.lotId === Number(main.lotId));
    const resolvedLotName = resolvedLot ? resolvedLot.lotName : (main.lotId ? `Lot #${main.lotId}` : "Standard Lot");

    const totalBatchValuation = batchGroup.items.reduce((sum, item) => {
        const qty = Number(item.quantityIn || item.quantityOut || 0);
        return sum + (qty * Number(item.unitCost || 0));
    }, 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-4xl md:max-w-5xl w-[92vw] max-h-[90vh] rounded-[2rem] border shadow-2xl p-0 overflow-hidden bg-background flex flex-col">
                {/* Header */}
                <DialogHeader className="p-6 border-b shrink-0 bg-primary/[0.03]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="p-3 bg-primary/10 rounded-2xl text-primary shadow-xs">
                                <Layers className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <DialogTitle className="text-xl font-black tracking-tight text-foreground">
                                        Batch: {main.batchNo || "NO-BATCH"}
                                    </DialogTitle>
                                    <Badge className={cn(
                                        "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border",
                                        isGood ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                        isExpired ? "bg-destructive/10 text-destructive border-destructive/20" :
                                        isDamaged ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                                        isQuarantined ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" :
                                        "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
                                    )}>
                                        {main.inventoryCondition || "GOOD"}
                                    </Badge>
                                </div>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-foreground">{resolvedProductName}</span>
                                    <span>•</span>
                                    <span>Code: <strong className="font-mono text-foreground">{resolvedProductCode}</strong></span>
                                    <span>•</span>
                                    <span>Lot: <strong className="text-foreground">{resolvedLotName}</strong></span>
                                </DialogDescription>
                            </div>
                        </div>

                        <Badge variant="outline" className="font-bold text-xs px-3 py-1 bg-muted/60 self-start sm:self-center">
                            {batchGroup.items.length} Movement{batchGroup.items.length > 1 ? "s" : ""}
                        </Badge>
                    </div>
                </DialogHeader>

                {/* Body Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {/* Batch Summary Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-muted/30 border">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                Total Inbound
                            </span>
                            <span className="text-xl font-black text-emerald-600 tabular-nums">
                                +{batchGroup.totalIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">{resolvedUnitName}</span>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                Total Outbound
                            </span>
                            <span className="text-xl font-black text-rose-600 tabular-nums">
                                -{batchGroup.totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">{resolvedUnitName}</span>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                Net Current Balance
                            </span>
                            <span className="text-xl font-black text-foreground tabular-nums">
                                {batchGroup.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">{resolvedUnitName} remaining</span>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                Valuation Scope
                            </span>
                            <span className="text-xl font-black text-primary tabular-nums">
                                ₱{totalBatchValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">Total transacted</span>
                        </div>
                    </div>

                    {/* Chronological Movements Table */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                            Batch Transaction History ({batchGroup.items.length})
                        </h4>

                        <div className="rounded-2xl border bg-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-muted/50 border-b text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                        <tr>
                                            <th className="py-3 pl-4">Timestamp</th>
                                            <th className="py-3">Reference No</th>
                                            <th className="py-3">Transaction Type</th>
                                            <th className="py-3 text-center">Direction</th>
                                            <th className="py-3 text-right">Quantity</th>
                                            <th className="py-3 text-right">Unit Cost</th>
                                            <th className="py-3 text-right">Difference Cost</th>
                                            <th className="py-3 text-center pr-4">Inspect</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-muted/40 font-medium">
                                        {batchGroup.items.map((row, idx) => {
                                            const isOut = row.movementDirection === "OUT" || Number(row.quantityOut) > 0;
                                            const qty = isOut ? Number(row.quantityOut) : Number(row.quantityIn);

                                            return (
                                                <tr
                                                    key={idx}
                                                    className="hover:bg-muted/30 cursor-pointer transition-colors group"
                                                    onClick={() => onSelectMovement(row)}
                                                >
                                                    <td className="py-3 pl-4">
                                                        <span className="font-bold text-foreground">
                                                            {formatPhtDate(row.transactionDate)}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground block">
                                                            {formatPhtTime(row.transactionDate)}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 font-mono font-bold text-foreground">
                                                        {row.referenceNo || "—"}
                                                    </td>
                                                    <td className="py-3">
                                                        <Badge variant="outline" className="text-[9px] font-bold uppercase">
                                                            {row.transactionType?.replace(/_/g, " ") || "MOVEMENT"}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <Badge className={cn(
                                                            "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                                                            isOut ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                        )}>
                                                            {isOut ? "OUT" : "IN"}
                                                        </Badge>
                                                    </td>
                                                    <td className={cn("py-3 text-right font-black tabular-nums", isOut ? "text-rose-600" : "text-emerald-600")}>
                                                        {isOut ? `-${qty.toLocaleString()}` : `+${qty.toLocaleString()}`}
                                                    </td>
                                                    <td className="py-3 text-right font-mono text-muted-foreground">
                                                        ₱{Number(row.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3 text-right font-bold text-foreground">
                                                        ₱{Number(row.differenceCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3 text-center pr-4">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 rounded-lg text-muted-foreground group-hover:text-primary"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onSelectMovement(row);
                                                            }}
                                                        >
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-muted/40 border-t flex justify-end">
                    <Button
                        onClick={onClose}
                        variant="outline"
                        className="rounded-xl font-bold uppercase tracking-wider text-xs px-6 h-9"
                    >
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
