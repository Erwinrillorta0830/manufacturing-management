"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
    ShieldCheck,
    CheckCircle2,
    Calendar,
    Layers,
    Package,
    Search,
    Loader2,
    Building2,
    RotateCcw,
    AlertCircle,
    FileText,
} from "lucide-react";
import type { InvoiceConsolidation } from "../../shared/consolidation-types";
import {
    fetchConsolidationByNo,
    fetchAllocations,
    approveBatch,
    repickBatch,
    type LotAllocation,
} from "../../shared/consolidation-api";

interface ApprovalModalProps {
    batch: InvoiceConsolidation | null;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function ApprovalModal({
    batch,
    open,
    onClose,
    onSuccess,
}: ApprovalModalProps) {
    const [fullBatch, setFullBatch] = useState<InvoiceConsolidation | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [allocations, setAllocations] = useState<LotAllocation[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<"products" | "orders">("products");

    const [approvalStatus, setApprovalStatus] = useState<Record<number, boolean>>({});
    const [approving, setApproving] = useState(false);
    const [repicking, setRepicking] = useState(false);
    const [showRepickConfirm, setShowRepickConfirm] = useState(false);

    useEffect(() => {
        if (!open || !batch) {
            setFullBatch(null);
            setAllocations([]);
            setApprovalStatus({});
            setSearchQuery("");
            setShowRepickConfirm(false);
            return;
        }

        setLoadingDetails(true);
        fetchConsolidationByNo(batch.consolidatorNo)
            .then((res) => {
                setFullBatch(res);
                // Pre-mark all items as verified by default if all picked, or user can toggle
                const initialMap: Record<number, boolean> = {};
                for (const d of res?.details || []) {
                    initialMap[d.id] = true;
                }
                setApprovalStatus(initialMap);
            })
            .catch(() => {
                toast.error("Failed to load full batch details");
            })
            .finally(() => setLoadingDetails(false));

        fetchAllocations(batch.id)
            .then((allocs) => {
                setAllocations(allocs || []);
            })
            .catch(() => {});
    }, [batch, open]);

    const activeBatch = fullBatch || batch;

    // Group allocations by product
    const allocationsByProduct = useMemo(() => {
        const map = new Map<number, LotAllocation[]>();
        for (const a of allocations) {
            const list = map.get(a.productId) || [];
            list.push(a);
            map.set(a.productId, list);
        }
        return map;
    }, [allocations]);

    // Summary calculations
    const details = useMemo(() => activeBatch?.details || [], [activeBatch?.details]);
    const totalItems = details.length;
    const approvedCount = Object.keys(approvalStatus).filter((k) => approvalStatus[Number(k)]).length;
    const progressPercent = totalItems > 0 ? (approvedCount / totalItems) * 100 : 0;
    const isAllApproved = approvedCount === totalItems && totalItems > 0;

    const totalOrdered = details.reduce((sum, d) => sum + Number(d.orderedQuantity || 0), 0);
    const totalPicked = details.reduce((sum, d) => sum + Number(d.pickedQuantity || 0), 0);

    const toggleItemApproval = (detailId: number) => {
        setApprovalStatus((prev) => ({
            ...prev,
            [detailId]: !prev[detailId],
        }));
    };

    // Confirm Batch Approval
    const handleConfirmApprove = async () => {
        if (!activeBatch) return;
        setApproving(true);
        try {
            const result = await approveBatch({ batchId: activeBatch.id });
            toast.success(result.message || `Batch ${activeBatch.consolidatorNo} approved successfully!`);
            onSuccess();
            onClose();
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to approve batch");
        } finally {
            setApproving(false);
        }
    };

    // Request Re-Pick
    const handleConfirmRepick = async () => {
        if (!activeBatch) return;
        setRepicking(true);
        try {
            const result = await repickBatch(activeBatch.id);
            toast.success(result.message || `Batch ${activeBatch.consolidatorNo} returned to picking floor`);
            onSuccess();
            onClose();
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to request re-pick");
        } finally {
            setRepicking(false);
            setShowRepickConfirm(false);
        }
    };

    const filteredDetails = useMemo(() => {
        if (!searchQuery.trim()) return details;
        const q = searchQuery.toLowerCase();
        return details.filter(
            (d) =>
                d.productName?.toLowerCase().includes(q) ||
                d.productCode?.toLowerCase().includes(q)
        );
    }, [details, searchQuery]);

    if (!batch || !activeBatch) return null;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                className="max-w-[95vw] sm:max-w-6xl lg:max-w-7xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl border-border"
                aria-describedby="approval-modal-description"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>Consolidation Approval - {batch.consolidatorNo}</DialogTitle>
                    <DialogDescription id="approval-modal-description">
                        Review and approve picked batch {batch.consolidatorNo} for dispatch.
                    </DialogDescription>
                </DialogHeader>

                {/* Top Header */}
                <div className="flex flex-col gap-4 border-b border-border/80 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <span className="font-mono text-base font-black tracking-tight text-foreground">
                                    {batch.consolidatorNo}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-600 ring-1 ring-inset ring-violet-500/30 uppercase tracking-wide">
                                    Awaiting Approval
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-1">
                                    <Building2 className="h-3.5 w-3.5" />
                                    {batch.branchName || `Branch #${batch.branchId}`}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "N/A"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Metrics Cards */}
                <div className="grid grid-cols-2 gap-3 border-b border-border/60 bg-muted/10 px-6 py-3.5 sm:grid-cols-4">
                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">SKUs</span>
                            <Package className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-foreground">{totalItems}</p>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">Linked Orders</span>
                            <FileText className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-foreground">{batch.invoices?.length || 1}</p>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">Total Quantity</span>
                            <Layers className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-foreground">
                            {totalPicked} <span className="text-xs font-semibold text-muted-foreground">/ {totalOrdered} pcs</span>
                        </p>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">Verification</span>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                        <p className="text-xl font-black tabular-nums text-emerald-600">
                            {approvedCount} <span className="text-xs font-semibold text-muted-foreground">/ {totalItems}</span>
                        </p>
                    </div>
                </div>

                {/* Spring Progress Bar */}
                <div className="relative border-b border-border/60 bg-muted/40 px-6 py-2">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="text-muted-foreground">Review Progress</span>
                        <span className="font-mono text-emerald-600 font-bold">
                            {progressPercent.toFixed(0)}% verified
                        </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80">
                        <motion.div
                            className="h-full bg-emerald-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercent}%` }}
                            transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        />
                    </div>
                </div>

                {/* Tabs & Search Header */}
                <div className="flex flex-col gap-3 border-b border-border/60 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab("products")}
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                                activeTab === "products"
                                    ? "bg-foreground text-background shadow-sm"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                            Products & Quality Review ({details.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("orders")}
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                                activeTab === "orders"
                                    ? "bg-foreground text-background shadow-sm"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                            Linked Sales Orders ({(activeBatch?.invoices || []).length || 1})
                        </button>
                    </div>

                    {activeTab === "products" && (
                        <div className="flex items-center gap-2">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Search product or code..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-8 pl-8 text-xs bg-muted/20 rounded-lg"
                                />
                            </div>
                            {/* <Button
                                variant="outline"
                                size="sm"
                                onClick={handleApproveAll}
                                className="h-8 text-xs font-bold shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30"
                            >
                                
                                Verify All
                            </Button> */}
                        </div>
                    )}
                </div>

                {/* Main Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loadingDetails ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <p className="text-sm font-semibold">Loading batch details...</p>
                        </div>
                    ) : activeTab === "products" ? (
                        <div className="space-y-4">
                            {filteredDetails.length === 0 ? (
                                <div className="py-12 text-center text-sm text-muted-foreground">
                                    No products found matching your search.
                                </div>
                            ) : (
                                filteredDetails.map((detail) => {
                                    const isApproved = !!approvalStatus[detail.id];
                                    const prodAllocs = allocationsByProduct.get(detail.productId) || [];

                                    return (
                                        <motion.div
                                            key={detail.id}
                                            layout
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2 }}
                                            onClick={() => toggleItemApproval(detail.id)}
                                            className={`rounded-xl border p-4.5 transition-all cursor-pointer ${
                                                isApproved
                                                    ? "bg-emerald-500/5 border-emerald-500/40 shadow-sm"
                                                    : "bg-card border-border hover:border-violet-500/40 hover:shadow-sm"
                                            }`}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                {/* Left: Product Info */}
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <div
                                                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                                            isApproved
                                                                ? "bg-emerald-500/15 text-emerald-600"
                                                                : "bg-muted text-muted-foreground"
                                                        }`}
                                                    >
                                                        {isApproved ? (
                                                            <CheckCircle2 className="h-5 w-5" />
                                                        ) : (
                                                            <Package className="h-5 w-5" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="font-bold text-sm leading-tight text-foreground truncate">
                                                            {detail.productName || `Product #${detail.productId}`}
                                                        </h3>
                                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                            <span className="font-mono text-[11px] font-semibold text-muted-foreground/80">
                                                                {detail.productCode || `ID: ${detail.productId}`}
                                                            </span>
                                                            <span>•</span>
                                                            <span>Ordered: <strong>{detail.orderedQuantity} units</strong></span>
                                                            <span>•</span>
                                                            <span>Picked: <strong className="text-emerald-600">{detail.pickedQuantity} units</strong></span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right: Verification Status Button */}
                                                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                                                    <div
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                                                            isApproved
                                                                ? "bg-emerald-500 text-white shadow-sm"
                                                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                                                        }`}
                                                    >
                                                        {isApproved ? (
                                                            <>
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                                Verified
                                                            </>
                                                        ) : (
                                                            "Click to Verify"
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Allocated Lots Details */}
                                            {prodAllocs.length > 0 && (
                                                <div className="mt-3.5 pt-3 border-t border-border/40">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                                                        <Layers className="h-3 w-3" />
                                                        Allocated Storage Lots ({prodAllocs.length})
                                                    </p>
                                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                        {prodAllocs.map((alloc, idx) => (
                                                            <div
                                                                key={`${alloc.batchNo}-${idx}`}
                                                                className="rounded-lg border border-border/60 bg-background/60 p-2.5 text-xs"
                                                            >
                                                                <div className="flex items-center justify-between font-bold text-foreground">
                                                                    <span className="truncate">{alloc.lotName || `Lot #${alloc.lotId}`}</span>
                                                                    <span className="font-mono text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]">
                                                                        {alloc.quantity} units
                                                                    </span>
                                                                </div>
                                                                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                                                                    <span>Batch: {alloc.batchNo || "N/A"}</span>
                                                                    {alloc.expiryDate && (
                                                                        <span>Exp: {alloc.expiryDate}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        /* Linked Sales Orders Tab */
                        <div className="space-y-3">
                            <div className="rounded-xl border border-border/60 bg-card p-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                                    Consolidated Sales Orders ({(activeBatch?.invoices || []).length || 1})
                                </h4>
                                <div className="space-y-2">
                                    {(activeBatch?.invoices || []).length > 0 ? (
                                        (activeBatch?.invoices || []).map((inv, idx) => (
                                            <div
                                                key={inv.id || idx}
                                                className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40 text-xs"
                                            >
                                                <div>
                                                    <p className="font-bold text-foreground">{inv.invoiceNo || `SO #${inv.invoiceId || inv.id}`}</p>
                                                    <p className="text-[11px] text-muted-foreground">{inv.customerName || "Customer order"}</p>
                                                </div>
                                                <span className="font-mono font-bold text-foreground">
                                                    {(inv as { netAmount?: number }).netAmount != null
                                                        ? `₱${Number((inv as { netAmount?: number }).netAmount).toLocaleString()}`
                                                        : "Sales Order"}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40 text-xs">
                                            <div>
                                                <p className="font-bold text-foreground">{activeBatch?.consolidatorNo}</p>
                                                <p className="text-[11px] text-muted-foreground">Consolidated sales order fulfillment batch</p>
                                            </div>
                                            <span className="font-mono text-muted-foreground">
                                                {totalPicked} pcs total
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Footer */}
                <div className="border-t border-border/80 bg-muted/20 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                        <span>
                            Items verified: <strong className={isAllApproved ? "text-emerald-600 font-bold" : "text-foreground font-bold"}>{approvedCount} of {totalItems}</strong>
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5">
                        {/* Request Re-Pick Trigger */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowRepickConfirm(true)}
                            disabled={repicking || approving}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 text-xs font-bold"
                        >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Request Re-Pick
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClose}
                            disabled={approving || repicking}
                            className="text-xs font-bold rounded-xl"
                        >
                            Cancel
                        </Button>

                        <Button
                            size="sm"
                            onClick={handleConfirmApprove}
                            disabled={approving || repicking || !isAllApproved}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm px-4"
                        >
                            {approving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    Approving...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                    Confirm Approval
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Re-pick Confirmation Sub-Dialog */}
                <AnimatePresence>
                    {showRepickConfirm && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
                            >
                                <div className="flex items-center gap-3 text-amber-500 mb-3">
                                    <AlertCircle className="h-6 w-6" />
                                    <h3 className="font-bold text-base text-foreground">Return Batch to Picking?</h3>
                                </div>
                                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                                    This will return batch <strong>{batch.consolidatorNo}</strong> back to the picking floor (status: <strong>Picking</strong>). Picking operators will be able to adjust lot allocations.
                                </p>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowRepickConfirm(false)}
                                        disabled={repicking}
                                        className="text-xs font-bold"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleConfirmRepick}
                                        disabled={repicking}
                                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                                    >
                                        {repicking ? (
                                            <>
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                Returning...
                                            </>
                                        ) : (
                                            "Confirm Return to Picking"
                                        )}
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    );
}
