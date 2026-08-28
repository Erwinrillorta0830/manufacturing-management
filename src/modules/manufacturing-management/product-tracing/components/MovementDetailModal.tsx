"use client";

import * as React from "react";
import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MMInventoryMovement } from "../types";
import {
    FileText,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Package,
    Layers,
    DollarSign,
    User,
    CheckCircle2,
    AlertCircle,
    Copy,
    Building,
    Check,
    Code,
    Clock,
    Hash,
    Maximize2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
    movement: MMInventoryMovement | null;
    isOpen: boolean;
    onClose: () => void;
    branchName?: string;
}

export function MovementDetailModal({ movement, isOpen, onClose, branchName }: Props) {
    const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
    const [showRawJson, setShowRawJson] = React.useState(false);

    if (!movement) return null;

    const isOut = movement.movementDirection === "OUT" || Number(movement.quantityOut) > 0;
    const isGood = movement.inventoryCondition?.toUpperCase() === "GOOD";
    const isExpired = movement.inventoryCondition?.toUpperCase() === "EXPIRED";
    const isDamaged = movement.inventoryCondition?.toUpperCase() === "DAMAGED";
    const isQuarantined = movement.inventoryCondition?.toUpperCase() === "QUARANTINED";

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(label);
        toast.success(`Copied ${label} to clipboard!`);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const formatDate = (d?: string | null) => {
        if (!d) return "N/A";
        try {
            return format(new Date(d), "MMM dd, yyyy HH:mm:ss");
        } catch {
            return d;
        }
    };

    const formatShortDate = (d?: string | null) => {
        if (!d) return "N/A";
        try {
            return format(new Date(d), "MMM dd, yyyy");
        } catch {
            return d;
        }
    };

    const totalValuation = (Number(movement.quantityIn || movement.quantityOut || 0)) * Number(movement.unitCost || 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl w-[94vw] max-h-[92vh] rounded-[2rem] border shadow-2xl p-0 overflow-hidden bg-background flex flex-col">
                {/* Modal Header */}
                <DialogHeader className={cn(
                    "p-6 sm:p-7 border-b shrink-0 transition-colors",
                    isOut ? "bg-rose-500/[0.04]" : "bg-emerald-500/[0.04]"
                )}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3.5 rounded-2xl flex items-center justify-center shrink-0 shadow-md",
                                isOut ? "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20" : "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20"
                            )}>
                                {isOut ? <ArrowDownRight className="h-7 w-7" /> : <ArrowUpRight className="h-7 w-7" />}
                            </div>
                            <div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <DialogTitle className="text-2xl font-black tracking-tight text-foreground">
                                        {movement.transactionType?.replace(/_/g, " ") || "Inventory Movement"}
                                    </DialogTitle>
                                    <Badge className={cn(
                                        "text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full border shadow-xs",
                                        isOut ? "bg-rose-500/10 text-rose-600 border-rose-500/30" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                    )}>
                                        {movement.movementDirection || (isOut ? "OUT" : "IN")}BOUND
                                    </Badge>
                                    <Badge variant="outline" className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 border-primary/30 text-primary bg-primary/5">
                                        {movement.sourceStatus || "POSTED"}
                                    </Badge>
                                </div>
                                <DialogDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                                    <span>Source Module: <strong className="text-foreground font-mono font-semibold">{movement.sourceModule || "MM_INVENTORY"}</strong></span>
                                    <span>•</span>
                                    <span>Ref ID: <strong className="text-foreground font-mono">#{movement.referenceId}</strong> (Detail #{movement.referenceDetailId})</span>
                                </DialogDescription>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-center">
                            <Badge variant="secondary" className="font-mono text-xs font-black px-3.5 py-1.5 rounded-xl border bg-muted/60">
                                {movement.movementKey}
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-xl px-2.5 text-xs font-bold gap-1 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowRawJson(!showRawJson)}
                            >
                                <Code className="h-3.5 w-3.5" />
                                {showRawJson ? "Visual View" : "Raw JSON"}
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                {/* Modal Body */}
                <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
                    {showRawJson ? (
                        <div className="space-y-2 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                                    Raw Spring Boot Payload
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs font-bold gap-1 text-primary"
                                    onClick={() => copyToClipboard(JSON.stringify(movement, null, 2), "Raw JSON")}
                                >
                                    {copiedKey === "Raw JSON" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    Copy JSON
                                </Button>
                            </div>
                            <pre className="p-4 rounded-2xl bg-muted/70 font-mono text-xs text-foreground overflow-x-auto border max-h-[50vh] leading-relaxed">
                                {JSON.stringify(movement, null, 2)}
                            </pre>
                        </div>
                    ) : (
                        <>
                            {/* Key Financial & Quantity Highlights */}
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-5 rounded-2xl bg-muted/30 border">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                        Transacted Quantity
                                    </span>
                                    <span className={cn("text-2xl font-black tabular-nums tracking-tight", isOut ? "text-rose-600" : "text-emerald-600")}>
                                        {isOut ? `-${Number(movement.quantityOut).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `+${Number(movement.quantityIn).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground block">
                                        Unit ID: {movement.unitId || 1}
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                        Unit Cost
                                    </span>
                                    <span className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                                        ₱{Number(movement.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground block">
                                        per base unit
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                        Total Valuation
                                    </span>
                                    <span className="text-2xl font-black tabular-nums tracking-tight text-primary">
                                        ₱{totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground block">
                                        Qty × Unit Cost
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                                        Difference Cost
                                    </span>
                                    <span className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                                        ₱{Number(movement.differenceCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground block">
                                        Inventory variance cost
                                    </span>
                                </div>
                            </div>

                            {/* Product & Batch Provenance Cards */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Product Card */}
                                <div className="p-5 rounded-2xl border bg-card space-y-3">
                                    <div className="flex items-center justify-between border-b pb-2.5">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                            <Package className="h-4 w-4 text-primary" />
                                            Product Specification
                                        </h4>
                                        <Badge variant="outline" className="text-[10px] font-bold">
                                            {movement.productTypeName || "Finished Goods"}
                                        </Badge>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-base font-black text-foreground">
                                            {movement.productName || "Unknown Product"}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                            <div className="p-2.5 rounded-xl bg-muted/40 border">
                                                <span className="text-[10px] text-muted-foreground block font-bold">Product Code / SKU</span>
                                                <span className="font-mono font-bold text-foreground mt-0.5 block">{movement.productCode || "N/A"}</span>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-muted/40 border">
                                                <span className="text-[10px] text-muted-foreground block font-bold">Product ID</span>
                                                <span className="font-mono font-bold text-foreground mt-0.5 block">#{movement.productId}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Batch & Lot Card */}
                                <div className="p-5 rounded-2xl border bg-card space-y-3">
                                    <div className="flex items-center justify-between border-b pb-2.5">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-primary" />
                                            Batch & Quality Condition
                                        </h4>
                                        <Badge className={cn(
                                            "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-2xs",
                                            isGood ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
                                            isExpired ? "bg-destructive/10 text-destructive border-destructive/30" :
                                            isDamaged ? "bg-amber-500/10 text-amber-600 border-amber-500/30" :
                                            "bg-yellow-500/10 text-yellow-700 border-yellow-500/30"
                                        )}>
                                            {movement.inventoryCondition || "GOOD"}
                                        </Badge>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground font-bold">Batch Number:</span>
                                            <span className="font-mono font-black text-sm text-foreground bg-muted/60 px-2.5 py-0.5 rounded-md">
                                                {movement.batchNo || "N/A"}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                            <div className="p-2.5 rounded-xl bg-muted/40 border">
                                                <span className="text-[10px] text-muted-foreground block font-bold">Lot ID</span>
                                                <span className="font-mono font-bold text-foreground mt-0.5 block">#{movement.lotId || "N/A"}</span>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-muted/40 border">
                                                <span className="text-[10px] text-muted-foreground block font-bold">Inventory Lot ID</span>
                                                <span className="font-mono font-bold text-foreground mt-0.5 block">#{movement.inventoryLotId || "N/A"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Lifecycle Timeline & Dates */}
                            <div className="p-5 rounded-2xl border bg-card space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 border-b pb-2.5">
                                    <Calendar className="h-4 w-4 text-primary" />
                                    Lifecycle Dates & Audit Trail
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                    <div className="p-3 rounded-xl border bg-muted/20 space-y-0.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Transaction Date</span>
                                        <span className="font-semibold text-foreground block">{formatDate(movement.transactionDate)}</span>
                                    </div>
                                    <div className="p-3 rounded-xl border bg-muted/20 space-y-0.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Posted Date</span>
                                        <span className="font-semibold text-foreground block">{formatDate(movement.postedAt)}</span>
                                        <span className="text-[10px] text-muted-foreground block">By User #{movement.postedBy || "N/A"}</span>
                                    </div>
                                    <div className="p-3 rounded-xl border bg-muted/20 space-y-0.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Manufacturing Date</span>
                                        <span className="font-semibold text-foreground block">{formatShortDate(movement.manufacturingDate)}</span>
                                    </div>
                                    <div className="p-3 rounded-xl border bg-muted/20 space-y-0.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Expiration Date</span>
                                        <span className={cn("font-semibold block", isExpired ? "text-destructive font-black" : "text-foreground")}>
                                            {formatShortDate(movement.expirationDate)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Reference Documents & Remarks */}
                            <div className="p-5 rounded-2xl border bg-card space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                            Document Reference Number
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-[10px] font-bold gap-1 text-primary hover:bg-primary/10"
                                            onClick={() => copyToClipboard(movement.referenceNo || "", "Reference No")}
                                        >
                                            {copiedKey === "Reference No" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                            Copy Ref No
                                        </Button>
                                    </div>
                                    <p className="font-mono text-sm font-black text-foreground bg-muted/50 p-3 rounded-xl border break-all">
                                        {movement.referenceNo || "N/A"}
                                    </p>
                                </div>

                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">
                                        Audit Remarks & Notes
                                    </span>
                                    <p className="text-xs text-foreground bg-muted/30 p-3 rounded-xl border italic">
                                        {movement.remarks || "No remarks provided for this inventory transaction."}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-5 bg-muted/40 border-t flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Building className="h-4 w-4 text-primary opacity-60" />
                        <span>Branch: <strong className="text-foreground">{branchName || `Branch #${movement.branchId}`}</strong> (ID: {movement.branchId})</span>
                    </div>
                    <Button
                        onClick={onClose}
                        variant="default"
                        className="rounded-xl font-bold uppercase tracking-wider text-xs px-6 h-9"
                    >
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
