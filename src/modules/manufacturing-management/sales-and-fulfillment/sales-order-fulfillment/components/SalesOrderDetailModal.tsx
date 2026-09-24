import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    CheckCircle2,
    Layers,
    Warehouse,
    ArrowRight,
    Building2,
    Calendar,
    Package,
    Info,
    RefreshCw,
    XCircle,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
} from "lucide-react";
import { SalesOrderDetailData } from "../types";

interface SalesOrderDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    detail: SalesOrderDetailData | null;
    isLoading: boolean;
    error: string | null;
    onRefresh: () => void;
    isProceeding: boolean;
    onProceed: () => Promise<void>;
}

export const SalesOrderDetailModal: React.FC<SalesOrderDetailModalProps> = ({
    isOpen,
    onClose,
    detail,
    isLoading,
    error,
    onRefresh,
    isProceeding,
    onProceed,
}) => {
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

    const toggleRow = (detailId: number) => {
        setExpandedRows((prev) => ({
            ...prev,
            [detailId]: !prev[detailId],
        }));
    };

    const header = detail?.header;
    const lines = detail?.lines || [];
    const readiness = detail?.readiness;
    const canProceed = readiness?.can_proceed_to_consolidation || false;

    const handleConfirmProceed = async () => {
        setIsConfirmOpen(false);
        await onProceed();
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent
                    className="w-[95vw] !max-w-[95vw] sm:!max-w-4xl lg:!max-w-5xl xl:!max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0 border-border/80 shadow-2xl bg-background overflow-hidden rounded-2xl"
                >
                    {/* Header */}
                    <DialogHeader className="p-5 pb-4 border-b bg-gradient-to-r from-muted/50 via-muted/20 to-background shrink-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                                        <span>{isLoading ? "Loading Sales Order..." : header ? header.order_no : "Order Details"}</span>
                                    </DialogTitle>
                                    {header && (
                                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold py-0.5 px-2.5 rounded-full shadow-2xs">
                                            {header.order_status}
                                        </Badge>
                                    )}
                                </div>
                                <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                    {header && (
                                        <span>Ordered on <strong className="text-foreground/80 font-medium">{header.order_date}</strong></span>
                                    )}
                                </DialogDescription>
                            </div>

                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onRefresh}
                                    disabled={isLoading || isProceeding}
                                    className="h-8 gap-1.5 text-xs self-start sm:self-auto shadow-2xs border-input hover:bg-muted/70"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
                                    <span>Revalidate</span>
                                </Button>
                            </motion.div>
                        </div>
                    </DialogHeader>

                    {/* Content Body */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* 1. Loading Skeleton */}
                        {isLoading && (
                            <div className="space-y-4 py-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <Skeleton key={i} className="h-16 rounded-xl" />
                                    ))}
                                </div>
                                <Skeleton className="h-20 rounded-xl" />
                                <Skeleton className="h-44 rounded-xl" />
                            </div>
                        )}

                        {/* 2. Error State */}
                        {!isLoading && error && (
                            <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive flex items-start gap-3 shadow-xs">
                                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                                <div className="space-y-1 text-xs flex-1">
                                    <p className="font-semibold text-sm">Failed to load order details</p>
                                    <p className="opacity-90">{error}</p>
                                    <Button variant="outline" size="sm" onClick={onRefresh} className="mt-2 text-xs">
                                        Retry
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* 3. Loaded Order Content (Motion Entry with Stagger) */}
                        {!isLoading && !error && header && (
                            <motion.div
                                initial="hidden"
                                animate="visible"
                                variants={{
                                    hidden: { opacity: 0 },
                                    visible: {
                                        opacity: 1,
                                        transition: {
                                            staggerChildren: 0.07,
                                            delayChildren: 0.03,
                                        },
                                    },
                                }}
                                className="space-y-5"
                            >
                                {/* Info Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <motion.div
                                        variants={{
                                            hidden: { opacity: 0, y: 12 },
                                            visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
                                        }}
                                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                                        className="p-3.5 rounded-xl border border-l-[3px] border-l-blue-500 bg-gradient-to-br from-blue-500/[0.05] via-blue-500/[0.01] to-card shadow-2xs cursor-default transition-all hover:shadow-xs"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-6 w-6 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                                <Building2 className="h-3.5 w-3.5" />
                                            </div>
                                            <span className="uppercase tracking-wider text-[10px] font-bold text-muted-foreground">
                                                Customer
                                            </span>
                                        </div>
                                        <p className="font-semibold truncate text-foreground text-sm leading-tight">{header.customer_name}</p>
                                        <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">{header.customer_code}</p>
                                    </motion.div>

                                    <motion.div
                                        variants={{
                                            hidden: { opacity: 0, y: 12 },
                                            visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
                                        }}
                                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                                        className="p-3.5 rounded-xl border border-l-[3px] border-l-purple-500 bg-gradient-to-br from-purple-500/[0.05] via-purple-500/[0.01] to-card shadow-2xs cursor-default transition-all hover:shadow-xs"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-6 w-6 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                                                <Warehouse className="h-3.5 w-3.5" />
                                            </div>
                                            <span className="uppercase tracking-wider text-[10px] font-bold text-muted-foreground">
                                                Branch
                                            </span>
                                        </div>
                                        <p className="font-semibold truncate text-foreground text-sm leading-tight">{header.branch_name}</p>
                                        <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">{header.branch_code || `Branch #${header.branch_id}`}</p>
                                    </motion.div>

                                    <motion.div
                                        variants={{
                                            hidden: { opacity: 0, y: 12 },
                                            visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
                                        }}
                                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                                        className="p-3.5 rounded-xl border border-l-[3px] border-l-amber-500 bg-gradient-to-br from-amber-500/[0.05] via-amber-500/[0.01] to-card shadow-2xs cursor-default transition-all hover:shadow-xs"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-6 w-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                                <Calendar className="h-3.5 w-3.5" />
                                            </div>
                                            <span className="uppercase tracking-wider text-[10px] font-bold text-muted-foreground">
                                                Schedule
                                            </span>
                                        </div>
                                        <p className="font-semibold text-foreground text-sm leading-tight">
                                            {header.delivery_date
                                                ? new Date(header.delivery_date).toLocaleDateString()
                                                : "Not scheduled"}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">Target Fulfillment</p>
                                    </motion.div>

                                    <motion.div
                                        variants={{
                                            hidden: { opacity: 0, y: 12 },
                                            visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
                                        }}
                                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                                        className="p-3.5 rounded-xl border border-l-[3px] border-l-emerald-500 bg-gradient-to-br from-emerald-500/[0.05] via-emerald-500/[0.01] to-card shadow-2xs cursor-default transition-all hover:shadow-xs"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-6 w-6 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                <Package className="h-3.5 w-3.5" />
                                            </div>
                                            <span className="uppercase tracking-wider text-[10px] font-bold text-muted-foreground">
                                                Order Scope
                                            </span>
                                        </div>
                                        <p className="font-semibold text-foreground text-sm leading-tight">
                                            {lines.length} Line Item{lines.length === 1 ? "" : "s"}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            {lines.reduce((s, l) => s + l.ordered_quantity, 0).toLocaleString()} Total Units
                                        </p>
                                    </motion.div>
                                </div>



                                {/* Line Items List */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-start">
                                        <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                                            <Package className="h-4 w-4 text-primary" />
                                            <span>Product Line Items &amp; Production Linkages</span>
                                        </h3>
 
                                    </div>

                                    <div className="space-y-3">
                                        {lines.map((line, idx) => {
                                            const isExpanded = expandedRows[line.detail_id] ?? true;

                                            return (
                                                <motion.div
                                                    key={line.detail_id}
                                                    initial={{ opacity: 0, y: 15 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.28, delay: idx * 0.05 }}
                                                    whileHover={{ y: -1.5, transition: { duration: 0.15 } }}
                                                    className={`rounded-xl border transition-all ${
                                                        line.is_ready
                                                            ? "border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/[0.02] border-l-4 border-l-emerald-500"
                                                            : "border-destructive/40 dark:border-destructive/30 bg-destructive/[0.02] border-l-4 border-l-destructive shadow-2xs"
                                                    }`}
                                                >
                                                    {/* Line Item Header / Summary */}
                                                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 flex-wrap flex-1">
                                                            <span className="font-bold text-sm text-foreground">
                                                                {line.description || line.product_name}
                                                            </span>
                                                            {line.product_code && (
                                                                <Badge variant="outline" className="font-mono text-[10px]">
                                                                    {line.product_code}
                                                                </Badge>
                                                            )}
                                                            {line.bom_version_name && (
                                                                <Badge
                                                                    variant="secondary"
                                                                    className="text-[10px] bg-primary/10 text-primary"
                                                                >
                                                                    {line.bom_version_name.startsWith("BOM")
                                                                        ? line.bom_version_name
                                                                        : `BOM ${line.bom_version_name}`}
                                                                </Badge>
                                                            )}
                                                            <span className="text-xs text-muted-foreground ml-1">
                                                                Ordered: <strong className="text-foreground">{line.ordered_quantity.toLocaleString()}</strong> {line.unit_name}
                                                            </span>
                                                        </div>

                                                        {/* Right Actions: Readiness Badge & Expand Toggle */}
                                                        <div className="flex items-center gap-2.5">
                                                            {/* Readiness Badge */}
                                                            <div className="text-right">
                                                                {line.is_ready ? (
                                                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-1 px-2.5 gap-1">
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        <span>
                                                                            {line.meets_by_production
                                                                                ? "Produced"
                                                                                : "In Stock"}
                                                                        </span>
                                                                    </Badge>
                                                                ) : line.has_deficit || line.live_onhand_quantity < 0 ? (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="border-destructive/60 bg-destructive/10 text-destructive text-xs font-semibold py-1 px-2.5 gap-1"
                                                                    >
                                                                        <AlertTriangle className="h-3 w-3 text-destructive" />
                                                                        <span>Deficit ({line.live_onhand_quantity.toLocaleString()})</span>
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="border-destructive/60 bg-destructive/10 text-destructive text-xs font-semibold py-1 px-2.5 gap-1"
                                                                    >
                                                                        <XCircle className="h-3 w-3 text-destructive" />
                                                                        <span>Shortage ({line.shortage_quantity})</span>
                                                                    </Badge>
                                                                )}
                                                            </div>

                                                            {/* Expand/Collapse Toggle */}
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => toggleRow(line.detail_id)}
                                                                className="h-8 w-8 p-0"
                                                            >
                                                                {isExpanded ? (
                                                                    <ChevronUp className="h-4 w-4" />
                                                                ) : (
                                                                    <ChevronDown className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Connected Job Orders Sub-Section */}
                                                    <AnimatePresence>
                                                        {isExpanded && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: "auto" }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="border-t bg-muted/20 px-4 py-3 rounded-b-xl"
                                                            >
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                                                                        <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                                                                            <Layers className="h-3.5 w-3.5 text-primary" />
                                                                            Connected Job Orders ({line.job_orders.length})
                                                                        </span>
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            {(line.has_deficit || line.live_onhand_quantity < 0) && (
                                                                                <span className="text-destructive font-semibold text-[11px] flex items-center gap-1 bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20">
                                                                                    <AlertTriangle className="h-3 w-3" />
                                                                                    Stock Deficit: {line.live_onhand_quantity.toLocaleString()} {line.unit_name}
                                                                                </span>
                                                                            )}
                                                                            {line.onhand_error && (
                                                                                <span className="text-amber-600 text-[11px] flex items-center gap-1">
                                                                                    <Info className="h-3 w-3" />
                                                                                    {line.onhand_error}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {line.job_orders.length === 0 ? (
                                                                        <div className={`py-2.5 px-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                                                                            !line.is_ready
                                                                                ? "border-destructive/30 bg-destructive/[0.03]"
                                                                                : "bg-background border-border"
                                                                        }`}>
                                                                            <span className="text-muted-foreground italic">
                                                                                No Job Orders allocated to this item. Fulfillment relies directly on live branch on-hand stock.
                                                                            </span>
                                                                            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 font-medium">
                                                                                <span className="text-muted-foreground text-[11px] uppercase">On-Hand Qty:</span>
                                                                                <span className={`font-semibold px-2 py-0.5 rounded border text-xs ${
                                                                                    line.has_deficit || line.live_onhand_quantity < 0
                                                                                        ? "border-destructive/40 bg-destructive/10 text-destructive font-mono"
                                                                                        : !line.is_ready
                                                                                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                                                                                        : "text-foreground bg-muted/60"
                                                                                }`}>
                                                                                    {line.live_onhand_quantity.toLocaleString()} {line.unit_name}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="rounded-lg border bg-background overflow-hidden">
                                                                            <table className="w-full text-xs text-left">
                                                                                <thead className="bg-muted/40 text-muted-foreground border-b text-[11px]">
                                                                                    <tr>
                                                                                        <th className="p-2 font-medium">Job Order #</th>
                                                                                        <th className="p-2 font-medium text-center">Status</th>
                                                                                        <th className="p-2 font-medium text-right">Target</th>
                                                                                        <th className="p-2 font-medium text-right">Allocated</th>
                                                                                        <th className="p-2 font-medium text-right">Produced</th>
                                                                                        <th className="p-2 font-medium text-right">On-Hand Qty</th>
                                                                                        <th className="p-2 font-medium text-right">Start Date</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y">
                                                                                    {line.job_orders.map((jo) => (
                                                                                        <tr key={jo.allocation_id} className="hover:bg-muted/30">
                                                                                            <td className="p-2 font-medium font-mono">
                                                                                                {jo.job_order_no}
                                                                                            </td>
                                                                                            <td className="p-2 text-center">
                                                                                                <Badge
                                                                                                    variant="outline"
                                                                                                    className="text-[10px] px-1.5 py-0 font-normal"
                                                                                                >
                                                                                                    {jo.status}
                                                                                                </Badge>
                                                                                            </td>
                                                                                            <td className="p-2 text-right">
                                                                                                {jo.target_quantity.toLocaleString()}
                                                                                            </td>
                                                                                            <td className="p-2 text-right">
                                                                                                {jo.allocated_quantity.toLocaleString()}
                                                                                            </td>
                                                                                            <td className="p-2 text-right font-semibold text-primary">
                                                                                                {jo.effective_produced_for_order.toLocaleString()}
                                                                                            </td>
                                                                                            <td className={`p-2 text-right font-medium ${
                                                                                                line.has_deficit || line.live_onhand_quantity < 0
                                                                                                    ? "text-destructive font-semibold font-mono"
                                                                                                    : "text-foreground"
                                                                                            }`}>
                                                                                                {line.live_onhand_quantity.toLocaleString()}
                                                                                            </td>
                                                                                            <td className="p-2 text-right text-muted-foreground text-[11px]">
                                                                                                {jo.start_date || "—"}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Modal Footer */}
                    <div className="p-4 border-t bg-muted/20 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap max-w-full sm:max-w-[65%]">
                            {readiness && (
                                <>
                                    <span className="font-medium whitespace-nowrap">
                                        {readiness.ready_items_count} of {readiness.total_items_count} line items satisfied
                                    </span>
                                    {readiness.blockers && readiness.blockers.length > 0 && (
                                        <span className="text-destructive font-medium flex items-center gap-1 text-[11px]">
                                            <AlertTriangle className="h-3 w-3 shrink-0" />
                                            <span>{readiness.blockers[0]}</span>
                                        </span>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0">
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button variant="outline" size="sm" onClick={onClose} disabled={isProceeding}>
                                    Close
                                </Button>
                            </motion.div>

                            <motion.div
                                whileHover={canProceed && !isProceeding && !isLoading ? { scale: 1.02 } : {}}
                                whileTap={canProceed && !isProceeding && !isLoading ? { scale: 0.98 } : {}}
                            >
                                <Button
                                    size="sm"
                                    onClick={() => setIsConfirmOpen(true)}
                                    disabled={!canProceed || isProceeding || isLoading}
                                    className={`gap-1.5 font-semibold text-xs transition-all shadow-sm ${
                                        canProceed
                                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-95"
                                            : "opacity-60 cursor-not-allowed"
                                    }`}
                                >
                                    {isProceeding ? (
                                        <>
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                            <span>Proceeding...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Proceed To Consolidation</span>
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </>
                                    )}
                                </Button>
                            </motion.div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Confirmation Dialog */}
            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Proceed to Consolidation</AlertDialogTitle>
                        <AlertDialogDescription className="text-sm space-y-2">
                            <span>
                                Are you sure you want to advance Sales Order{" "}
                                <strong className="text-foreground">{header?.order_no}</strong> to{" "}
                                <strong className="text-foreground">For Consolidation</strong>?
                            </span>
                            <span className="block text-xs text-muted-foreground mt-2">
                                All {lines.length} line items have been validated against live branch on-hand stock and completed Job Order production. This order will immediately become eligible for invoice consolidation planning.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isProceeding}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmProceed}
                            disabled={isProceeding}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            {isProceeding ? "Processing..." : "Confirm & Proceed"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
