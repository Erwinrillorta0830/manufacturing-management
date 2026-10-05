import React from "react";
import { toast } from "sonner";
import {
    Boxes,
    Building2,
    Calendar,
    Clock,
    DollarSign,
 
    Copy,
    Tag,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
 
import { Separator } from "@/components/ui/separator";
import { BatchExpirationItem, ExpirationStatus } from "../types";

interface BatchDetailDrawerProps {
    batch: BatchExpirationItem | null;
    open: boolean;
    onClose: () => void;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return "-";
    }
}

function getStatusBadge(status: ExpirationStatus, daysRemaining: number | null) {
    switch (status) {
        case "EXPIRED":
            return (
                <Badge
                    variant="outline"
                    className="border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold"
                >
                    EXPIRED ({daysRemaining !== null ? `${Math.abs(daysRemaining)}d ago` : ""})
                </Badge>
            );
        case "EXPIRING_TODAY":
            return (
                <Badge
                    variant="outline"
                    className="border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold animate-pulse"
                >
                    EXPIRING TODAY
                </Badge>
            );
        case "CRITICAL":
            return (
                <Badge
                    variant="outline"
                    className="border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold"
                >
                    CRITICAL ({daysRemaining}d left)
                </Badge>
            );
        case "WARNING":
            return (
                <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold"
                >
                    WARNING ({daysRemaining}d left)
                </Badge>
            );
        case "UPCOMING":
            return (
                <Badge
                    variant="outline"
                    className="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                >
                    UPCOMING ({daysRemaining}d left)
                </Badge>
            );
        case "SAFE":
            return (
                <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                >
                    SAFE
                </Badge>
            );
        case "NO_EXPIRY":
        default:
            return (
                <Badge variant="outline" className="border-muted bg-muted/30 text-muted-foreground">
                    NO EXPIRY DATE
                </Badge>
            );
    }
}

export default function BatchDetailDrawer({
    batch,
    open,
    onClose,
}: BatchDetailDrawerProps) {
    if (!batch) return null;

    const copyBatchNo = () => {
        navigator.clipboard.writeText(batch.batch_no);
        toast.success(`Copied Batch No. ${batch.batch_no} to clipboard`);
    };

    // const handleCreateStockReview = () => {
    //     toast.info(
    //         `Initiated Stock Review for batch ${batch.batch_no}. Review ticket draft prepared for Quality/Inventory clearance.`
    //     );
    // };

    // const handleProductionAlert = () => {
    //     toast.success(
    //         `Production Alert dispatched for batch ${batch.batch_no}. Flagged as priority material in staging.`
    //     );
    // };

    // const handleSalesAllocation = () => {
    //     toast.success(
    //         `Priority Sales Allocation flagged for batch ${batch.batch_no}. FEFO reservation prioritized.`
    //     );
    // };

    return (
        <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-2xl md:max-w-3xl overflow-y-auto p-0 flex flex-col justify-between"
            >
                <div className="p-6 space-y-6">
                    {/* Header */}
                    <SheetHeader className="p-0 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                Batch Inspection &amp; Traceability
                            </span>
                            {getStatusBadge(batch.expiration_status, batch.days_remaining)}
                        </div>
                        <SheetTitle className="text-lg font-extrabold text-foreground leading-tight">
                            {batch.product_name}
                        </SheetTitle>
                        <SheetDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                            <span>Code: <span className="font-mono font-medium text-foreground">{batch.product_code || "-"}</span></span>
                            {batch.product_type_name && (
                                <>
                                    <span>•</span>
                                    <span>{batch.product_type_name}</span>
                                </>
                            )}
                            {batch.category_name && batch.category_name !== batch.product_type_name && (
                                <>
                                    <span>•</span>
                                    <span>{batch.category_name}</span>
                                </>
                            )}
                        </SheetDescription>
                    </SheetHeader>

                    <Separator />

                    {/* Batch & Expiration Metadata (2-Column Grid) */}
                    <div className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Batch &amp; Warehouse Location
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Tag className="h-3.5 w-3.5 text-primary" />
                                    Batch Number
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs font-bold text-foreground">
                                        {batch.batch_no || "-"}
                                    </span>
                                    <button
                                        onClick={copyBatchNo}
                                        title="Copy Batch No"
                                        className="text-muted-foreground hover:text-foreground p-0.5"
                                    >
                                        <Copy className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-primary" />
                                    Expiry Date
                                </span>
                                <span className="text-xs font-semibold text-foreground">
                                    {formatDate(batch.expiry_date)}
                                </span>
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-primary" />
                                    Days Remaining
                                </span>
                                <span
                                    className={`text-xs font-bold font-mono ${
                                        batch.days_remaining !== null && batch.days_remaining < 0
                                            ? "text-rose-500 font-extrabold"
                                            : batch.days_remaining !== null && batch.days_remaining <= (batch.critical_threshold_days || 30)
                                            ? "text-orange-500 font-extrabold"
                                            : "text-foreground"
                                    }`}
                                >
                                    {batch.days_remaining !== null
                                        ? `${batch.days_remaining > 0 ? `+${batch.days_remaining}` : batch.days_remaining} Days`
                                        : "N/A"}
                                </span>
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Building2 className="h-3.5 w-3.5 text-primary" />
                                    Branch
                                </span>
                                <span className="text-xs font-semibold text-foreground truncate max-w-[160px]" title={batch.branch_name}>
                                    {batch.branch_name || "-"}
                                </span>
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 flex items-center justify-between sm:col-span-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Boxes className="h-3.5 w-3.5 text-primary" />
                                    Storage Lot / Bin
                                </span>
                                <span className="text-xs font-semibold text-foreground">
                                    {batch.lot_name || "-"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Inventory Financial Valuation (3-Card Layout) */}
                    <div className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Inventory &amp; Valuation
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-border/60 bg-card p-3.5 flex flex-col justify-between">
                                <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                    Current On-Hand
                                </span>
                                <div className="text-lg font-black text-foreground mt-1">
                                    {batch.on_hand_quantity.toLocaleString(undefined, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 2,
                                    })}{" "}
                                    <span className="text-xs font-medium text-muted-foreground uppercase">
                                        {batch.unit_shortcut || batch.unit_name || "PCS"}
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border/60 bg-card p-3.5 flex flex-col justify-between">
                                <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                    Unit Cost
                                </span>
                                <div className="text-lg font-bold text-foreground font-mono mt-1">
                                    {formatCurrency(batch.unit_cost)}
                                </div>
                            </div>

                            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 flex flex-col justify-between">
                                <span className="text-[10px] text-primary uppercase font-bold flex items-center gap-1">
                                    <DollarSign className="h-3.5 w-3.5" />
                                    Total Value Exposure
                                </span>
                                <div className="text-lg font-black font-mono text-primary mt-1">
                                    {formatCurrency(batch.inventory_value)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Traceability Lifecycle (3-Column Layout) */}
                    <div className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Traceability Lifecycle
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase">Registry Status</span>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                    <span className="text-xs font-semibold text-foreground">{batch.status}</span>
                                </div>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase">QA Status</span>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                                    <span className="text-xs font-semibold text-foreground">{batch.qa_status}</span>
                                </div>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase">Mfg Date</span>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                                    <span className="text-xs font-semibold text-foreground">
                                        {formatDate(batch.manufacturing_date)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
