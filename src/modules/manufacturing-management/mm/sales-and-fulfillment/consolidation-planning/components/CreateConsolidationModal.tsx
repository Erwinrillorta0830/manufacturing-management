"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
    X,
    Search,
    Loader2,
    CheckSquare,
    Square,
    FileText,
    Building2,
    Package,
    ChevronRight,
    ChevronDown,
    MapPin,
    AlertTriangle,
    Sliders,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    RotateCcw,
} from "lucide-react";
import {
    CandidateInvoice,
    Branch,
    AllocationPreview,
    CreateConsolidationPayload,
    CustomAllocationItem,
    AvailableLotBatch,
} from "../types";
import { fetchAllocationPreview } from "../services/invoice-consolidation-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    branch: Branch;
    candidates: CandidateInvoice[];
    loading: boolean;
    onSubmit: (payload: CreateConsolidationPayload) => Promise<boolean>;
}

type AllocationMode = "auto" | "manual";

export default function CreateConsolidationModal({
    isOpen,
    onClose,
    branch,
    candidates,
    loading,
    onSubmit,
}: Props) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [allocationMode, setAllocationMode] = useState<AllocationMode>("auto");

    const [allocationPreview, setAllocationPreview] = useState<AllocationPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Manual allocation state: key = `${productId}:${inventoryLotId}` -> allocated quantity
    const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!isOpen || selectedIds.size === 0) return;

        const controller = new AbortController();
        const invoiceIds = [...selectedIds].sort((a, b) => a - b);
        const timer = window.setTimeout(() => {
            setPreviewLoading(true);
            setPreviewError(null);
            fetchAllocationPreview({ branchId: branch.id, invoiceIds }, controller.signal)
                .then((preview) => {
                    setAllocationPreview(preview);
                    // Pre-fill manual allocations with default FEFO allocations
                    const initialManual: Record<string, number> = {};
                    for (const a of preview.allocations || []) {
                        const key = `${a.productId}:${a.inventoryLotId}`;
                        initialManual[key] = a.quantity;
                    }
                    setManualAllocations(initialManual);
                })
                .catch((error: Error) => {
                    if (error.name !== "AbortError") {
                        setAllocationPreview(null);
                        setPreviewError(error.message);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) setPreviewLoading(false);
                });
        }, 200);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [branch.id, isOpen, selectedIds]);

    const setSelection = (next: Set<number>) => {
        setSelectedIds(next);
        setAllocationPreview(null);
        setPreviewLoading(false);
        setPreviewError(null);
        setManualAllocations({});
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return candidates;
        const q = search.toLowerCase();
        return candidates.filter(
            (c) =>
                c.invoiceNo.toLowerCase().includes(q) ||
                c.customerName.toLowerCase().includes(q) ||
                c.customerCode.toLowerCase().includes(q)
        );
    }, [candidates, search]);

    const toggleAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelection(new Set());
        } else {
            setSelection(new Set(filtered.map((c) => c.invoiceId)));
        }
    };

    const toggle = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelection(next);
    };

    const toggleExpand = (id: number) => {
        const next = new Set(expandedInvoiceIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedInvoiceIds(next);
    };

    const totalSelectedAmount = useMemo(() => {
        return candidates
            .filter((c) => selectedIds.has(c.invoiceId))
            .reduce((sum, c) => sum + (c.netAmount || 0), 0);
    }, [candidates, selectedIds]);

    const aggregatedProducts = useMemo(() => {
        const selected = candidates.filter((c) => selectedIds.has(c.invoiceId));
        const versionSets = new Map<number, Set<string>>();
        const agg = new Map<
            number,
            { quantity: number; invoiceCount: Set<number>; productName: string; productCode: string }
        >();
        for (const inv of selected) {
            for (const p of inv.products) {
                if (!agg.has(p.productId)) {
                    agg.set(p.productId, {
                        quantity: 0,
                        invoiceCount: new Set(),
                        productName: p.productName,
                        productCode: p.productCode,
                    });
                }
                if (!versionSets.has(p.productId)) versionSets.set(p.productId, new Set());
                const entry = agg.get(p.productId)!;
                entry.quantity += p.quantity;
                entry.invoiceCount.add(inv.invoiceId);
                versionSets.get(p.productId)!.add(p.versionName || "Unversioned");
            }
        }
        return Array.from(agg.entries())
            .map(([productId, e]) => ({
                productId,
                productName: e.productName,
                productCode: e.productCode,
                totalQuantity: e.quantity,
                invoiceCount: e.invoiceCount.size,
                versionLabel:
                    versionSets.get(productId)!.size > 1
                        ? "Multiple versions"
                        : versionSets.get(productId)!.values().next().value || "Not assigned",
            }))
            .sort((a, b) => a.productName.localeCompare(b.productName));
    }, [candidates, selectedIds]);

    // Lookup map for invoice allocation breakdown
    const invoiceBreakdownMap = useMemo(() => {
        const map = new Map<
            number,
            Map<
                number,
                Array<{
                    inventoryLotId: number;
                    lotId: number;
                    lotName: string;
                    batchNo: string;
                    expiryDate: string | null;
                    quantity: number;
                }>
            >
        >();
        if (!allocationPreview?.invoiceBreakdown) return map;

        for (const inv of allocationPreview.invoiceBreakdown) {
            const lineMap = new Map<
                number,
                Array<{
                    inventoryLotId: number;
                    lotId: number;
                    lotName: string;
                    batchNo: string;
                    expiryDate: string | null;
                    quantity: number;
                }>
            >();
            for (const line of inv.lines) {
                lineMap.set(line.productId, line.allocations || []);
            }
            map.set(inv.invoiceId, lineMap);
        }
        return map;
    }, [allocationPreview?.invoiceBreakdown]);

    // Available batches grouped by productId
    const batchesByProduct = useMemo(() => {
        const map = new Map<number, AvailableLotBatch[]>();
        if (!allocationPreview?.availableBatches) return map;
        for (const batch of allocationPreview.availableBatches) {
            const list = map.get(batch.productId) || [];
            list.push(batch);
            map.set(batch.productId, list);
        }
        return map;
    }, [allocationPreview?.availableBatches]);

    // Manual allocation summary per product
    const manualSummaryByProduct = useMemo(() => {
        const map = new Map<
            number,
            { required: number; allocated: number; isValid: boolean; difference: number }
        >();
        for (const p of aggregatedProducts) {
            const required = p.totalQuantity;
            let allocated = 0;
            const batches = batchesByProduct.get(p.productId) || [];
            for (const b of batches) {
                const key = `${p.productId}:${b.inventoryLotId}`;
                allocated += Number(manualAllocations[key] || 0);
            }
            const difference = allocated - required;
            map.set(p.productId, {
                required,
                allocated,
                isValid: difference === 0,
                difference,
            });
        }
        return map;
    }, [aggregatedProducts, batchesByProduct, manualAllocations]);

    const isManualValid = useMemo(() => {
        if (aggregatedProducts.length === 0) return false;
        for (const p of aggregatedProducts) {
            const summary = manualSummaryByProduct.get(p.productId);
            if (!summary || !summary.isValid) return false;
        }
        return true;
    }, [aggregatedProducts, manualSummaryByProduct]);

    const handleManualQtyChange = (productId: number, inventoryLotId: number, maxAvail: number, val: string) => {
        const parsed = Math.max(0, Math.min(maxAvail, Number(val) || 0));
        setManualAllocations((prev) => ({
            ...prev,
            [`${productId}:${inventoryLotId}`]: parsed,
        }));
    };

    const handleResetToAutoFEFO = useCallback(() => {
        if (!allocationPreview) return;
        const initialManual: Record<string, number> = {};
        for (const a of allocationPreview.allocations || []) {
            const key = `${a.productId}:${a.inventoryLotId}`;
            initialManual[key] = a.quantity;
        }
        setManualAllocations(initialManual);
    }, [allocationPreview]);

    const handleSubmit = async () => {
        if (selectedIds.size === 0 || submitting) return;

        let customAllocations: CustomAllocationItem[] | undefined = undefined;

        if (allocationMode === "manual") {
            if (!isManualValid) return;
            customAllocations = [];
            for (const [key, qty] of Object.entries(manualAllocations)) {
                if (qty > 0) {
                    const [pIdStr, invLotIdStr] = key.split(":");
                    const productId = Number(pIdStr);
                    const inventoryLotId = Number(invLotIdStr);
                    const batch = (allocationPreview?.availableBatches || []).find(
                        (b) => b.productId === productId && b.inventoryLotId === inventoryLotId
                    );
                    if (batch) {
                        customAllocations.push({
                            productId,
                            inventoryLotId,
                            lotId: batch.lotId,
                            batchNo: batch.batchNo,
                            quantity: qty,
                        });
                    }
                }
            }
        }

        setSubmitting(true);
        await onSubmit({
            branchId: branch.id,
            invoiceIds: Array.from(selectedIds),
            customAllocations,
        });
        setSubmitting(false);
    };

    const canSubmit = useMemo(() => {
        if (selectedIds.size === 0 || submitting || previewLoading || !!previewError || !allocationPreview) {
            return false;
        }
        if (allocationMode === "auto") {
            return allocationPreview.shortages.length === 0;
        }
        return isManualValid;
    }, [selectedIds, submitting, previewLoading, previewError, allocationPreview, allocationMode, isManualValid]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
            <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-background shadow-2xl sm:h-[95vh] sm:max-w-[95vw] sm:rounded-3xl sm:border sm:border-border/60 lg:max-w-[1440px]">
                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 bg-card px-4 py-5 sm:px-7">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20">
                            <FileText className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">New Batch</p>
                            <h2 className="text-xl font-black uppercase italic tracking-tighter text-foreground sm:text-3xl">
                                Consolidation <span className="text-primary">Creation</span>
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Select eligible invoices and configure FEFO / lot allocations before creating the batch.
                            </p>
                        </div>
                        <span className="hidden items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[10px] font-bold text-muted-foreground lg:flex">
                            <Building2 className="h-3 w-3" />
                            {branch.branchName}
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 rounded-xl">
                        <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>

                {/* Filter and Mode Bar */}
                <div className="flex flex-col gap-2 shrink-0 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search invoices by no, customer..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-8 pl-8 text-xs bg-card"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleAll}
                            className="h-8 text-xs font-bold"
                            disabled={filtered.length === 0}
                        >
                            {selectedIds.size === filtered.length && filtered.length > 0 ? (
                                <>
                                    <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
                                    Deselect All
                                </>
                            ) : (
                                <>
                                    <Square className="mr-1.5 h-3.5 w-3.5" />
                                    Select All
                                </>
                            )}
                        </Button>
                        <span className="text-xs text-muted-foreground font-semibold">
                            {selectedIds.size} of {filtered.length} selected
                        </span>
                    </div>
                </div>

                {/* Main Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 space-y-4">
                    {/* Invoice Candidates Table */}
                    {loading ? (
                        <div className="flex h-32 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            No eligible invoices found for consolidation in this branch.
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b bg-muted/20">
                                        <th className="p-2.5 w-8"></th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Invoice No</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Sales Order / PO</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Customer</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Status</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Date</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground text-right">Net Amount</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground text-right">Items</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filtered.map((inv) => {
                                        const isSelected = selectedIds.has(inv.invoiceId);
                                        const isExpanded = expandedInvoiceIds.has(inv.invoiceId);
                                        const invAllocations = invoiceBreakdownMap.get(inv.invoiceId);

                                        return (
                                            <React.Fragment key={inv.invoiceId}>
                                                <tr
                                                    onClick={() => toggle(inv.invoiceId)}
                                                    className={`cursor-pointer transition-colors ${
                                                        isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/10"
                                                    }`}
                                                >
                                                    <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpand(inv.invoiceId)}
                                                            className="p-1 hover:bg-muted rounded"
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                            ) : (
                                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                            )}
                                                        </button>
                                                    </td>
                                                    <td className="p-2.5 font-bold text-foreground">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => toggle(inv.invoiceId)}
                                                                className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                                                            />
                                                            <span className="font-mono font-bold">{inv.invoiceNo}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2.5">
                                                        <div className="space-y-0.5">
                                                            <p className="font-mono font-bold text-foreground">{inv.orderNo || "No SO"}</p>
                                                            {inv.poNo && (
                                                                <p className="text-[10px] text-muted-foreground">PO: {inv.poNo}</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-2.5 text-foreground">{inv.customerName}</td>
                                                    <td className="p-2.5">
                                                        <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-primary">
                                                            {inv.orderStatus || "For Consolidation"}
                                                        </span>
                                                    </td>
                                                    <td className="p-2.5 text-muted-foreground">
                                                        {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : "-"}
                                                    </td>
                                                    <td className="p-2.5 text-right font-bold text-foreground">
                                                        P{(inv.netAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-2.5 text-right text-muted-foreground">
                                                        {inv.products.length} product(s)
                                                    </td>
                                                </tr>

                                                {/* Expanded Invoice Details & Exact Allocations */}
                                                {isExpanded && (
                                                    <tr className="bg-muted/5">
                                                        <td colSpan={8} className="p-0">
                                                            <div className="p-3 bg-muted/10 border-t border-b space-y-3">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                                        <Package className="h-3 w-3 text-primary" />
                                                                        Invoice: <span className="font-mono text-foreground font-bold">{inv.invoiceNo}</span>
                                                                        {inv.orderNo && (
                                                                            <span className="text-muted-foreground"> · SO: <strong className="font-mono text-foreground">{inv.orderNo}</strong></span>
                                                                        )}
                                                                        {inv.poNo && (
                                                                            <span className="text-muted-foreground"> · PO: <strong className="text-foreground">{inv.poNo}</strong></span>
                                                                        )}
                                                                    </p>
                                                                    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-primary">
                                                                        {inv.orderStatus || "For Consolidation"}
                                                                    </span>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {inv.products.map((p) => {
                                                                        const allocatedBatches = invAllocations?.get(p.productId) || [];
                                                                        const totalAllocated = allocatedBatches.reduce(
                                                                            (sum, b) => sum + b.quantity,
                                                                            0
                                                                        );

                                                                        return (
                                                                            <div
                                                                                key={`${inv.invoiceId}-${p.productId}`}
                                                                                className="rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm space-y-2"
                                                                            >
                                                                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                                                                                    <div>
                                                                                        <p className="text-xs font-bold text-foreground">{p.productName}</p>
                                                                                        <p className="font-mono text-[10px] text-muted-foreground">{p.productCode}</p>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-3">
                                                                                        {p.versionName && (
                                                                                            <span className="text-[9px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                                                                                                {p.versionName}
                                                                                            </span>
                                                                                        )}
                                                                                        <span className="text-xs font-semibold text-muted-foreground">
                                                                                            Required: <strong className="text-foreground">{p.quantity}</strong>
                                                                                        </span>
                                                                                        <span
                                                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                                                totalAllocated >= p.quantity
                                                                                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                                                                                    : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                                                                            }`}
                                                                                        >
                                                                                            Allocated: {totalAllocated} / {p.quantity}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Allocated Batches for this line */}
                                                                                {allocatedBatches.length > 0 ? (
                                                                                    <div className="overflow-x-auto">
                                                                                        <table className="w-full text-left text-[11px]">
                                                                                            <thead>
                                                                                                <tr className="text-[10px] text-muted-foreground uppercase">
                                                                                                    <th className="py-1">Storage Lot</th>
                                                                                                    <th className="py-1">Batch No</th>
                                                                                                    <th className="py-1">Expiry Date</th>
                                                                                                    <th className="py-1 text-right font-bold">Allocated Qty</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody className="divide-y divide-border/20">
                                                                                                {allocatedBatches.map((b) => (
                                                                                                    <tr key={`${p.productId}-${b.inventoryLotId}`}>
                                                                                                        <td className="py-1 font-medium text-foreground">{b.lotName}</td>
                                                                                                        <td className="py-1 font-mono text-muted-foreground">{b.batchNo}</td>
                                                                                                        <td className="py-1 text-muted-foreground">
                                                                                                            {b.expiryDate
                                                                                                                ? new Date(b.expiryDate).toLocaleDateString()
                                                                                                                : "No expiry"}
                                                                                                        </td>
                                                                                                        <td className="py-1 text-right font-black text-primary">
                                                                                                            {b.quantity}
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                ) : (
                                                                                    <p className="text-[10px] text-muted-foreground italic">
                                                                                        {previewLoading
                                                                                            ? "Calculating batch allocations..."
                                                                                            : "No lot allocated yet or item is in shortage."}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Consolidated Products Preview */}
                    {selectedIds.size > 0 && aggregatedProducts.length > 0 && (
                        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                    Consolidated Products Overview — {aggregatedProducts.length} unique product(s)
                                </span>
                            </div>
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b bg-muted/20">
                                        <th className="p-2.5 font-semibold text-muted-foreground">Product</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Code</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground text-right">Total Demand</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground text-right">Invoices</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">BOM Version</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {aggregatedProducts.map((p) => (
                                        <tr key={p.productId} className="hover:bg-muted/10">
                                            <td className="p-2.5 font-medium text-foreground">{p.productName}</td>
                                            <td className="p-2.5 text-muted-foreground font-mono">{p.productCode}</td>
                                            <td className="p-2.5 text-right font-bold text-foreground">{p.totalQuantity}</td>
                                            <td className="p-2.5 text-right text-muted-foreground">{p.invoiceCount}</td>
                                            <td className="p-2.5 text-muted-foreground">
                                                <span
                                                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                                        p.versionLabel === "Multiple versions"
                                                            ? "bg-amber-500/10 border border-amber-500/20 text-amber-600"
                                                            : "bg-primary/5 border border-primary/10 text-primary"
                                                    }`}
                                                >
                                                    {p.versionLabel}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* FEFO Lot Allocation & Manual Allocation Section */}
                    {selectedIds.size > 0 && (
                        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                            {/* Section Header with Mode Toggle */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary" />
                                    <div>
                                        <span className="text-[11px] font-black uppercase tracking-wide text-foreground">
                                            Lot & Batch Allocation
                                        </span>
                                        <p className="text-[10px] text-muted-foreground">
                                            Choose between automatic FEFO calculation or manual batch distribution.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Mode Tabs */}
                                    <div className="flex items-center rounded-xl bg-muted p-1 border border-border/40">
                                        <button
                                            type="button"
                                            onClick={() => setAllocationMode("auto")}
                                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                                                allocationMode === "auto"
                                                    ? "bg-background text-primary shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            <Sparkles className="h-3 w-3" />
                                            Auto FEFO
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAllocationMode("manual")}
                                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                                                allocationMode === "manual"
                                                    ? "bg-background text-primary shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            <Sliders className="h-3 w-3" />
                                            Manual Allocation
                                        </button>
                                    </div>

                                    {allocationMode === "manual" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleResetToAutoFEFO}
                                            className="h-8 text-xs gap-1.5"
                                            title="Reset manual values to Auto FEFO distribution"
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                            Reset
                                        </Button>
                                    )}

                                    {previewLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                </div>
                            </div>

                            {previewError ? (
                                <div className="flex items-center gap-2 px-4 py-4 text-xs text-destructive">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {previewError}
                                </div>
                            ) : previewLoading && !allocationPreview ? (
                                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                                    Calculating FEFO lot allocations...
                                </div>
                            ) : allocationMode === "auto" ? (
                                /* Auto FEFO View */
                                <div>
                                    {allocationPreview && allocationPreview.allocations.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-[760px] w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="border-b bg-muted/20">
                                                        <th className="p-2.5 font-semibold text-muted-foreground">Product</th>
                                                        <th className="p-2.5 font-semibold text-muted-foreground">Storage Lot</th>
                                                        <th className="p-2.5 font-semibold text-muted-foreground">Batch No</th>
                                                        <th className="p-2.5 font-semibold text-muted-foreground">Expiry Date</th>
                                                        <th className="p-2.5 text-right font-semibold text-muted-foreground">Allocated Qty</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {allocationPreview.allocations.map((allocation) => (
                                                        <tr
                                                            key={`${allocation.productId}-${allocation.inventoryLotId}`}
                                                            className="hover:bg-muted/10"
                                                        >
                                                            <td className="p-2.5">
                                                                <p className="font-medium text-foreground">{allocation.productName}</p>
                                                                <p className="font-mono text-[9px] text-muted-foreground">{allocation.productCode}</p>
                                                            </td>
                                                            <td className="p-2.5 font-medium text-foreground">{allocation.lotName}</td>
                                                            <td className="p-2.5 font-mono text-[10px] text-muted-foreground">{allocation.batchNo}</td>
                                                            <td className="p-2.5 text-muted-foreground">
                                                                {allocation.expiryDate
                                                                    ? new Date(allocation.expiryDate).toLocaleDateString()
                                                                    : "No expiry"}
                                                            </td>
                                                            <td className="p-2.5 text-right font-black text-primary">
                                                                {allocation.quantity}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                                            No eligible lot allocation found.
                                        </div>
                                    )}

                                    {allocationPreview && allocationPreview.shortages.length > 0 && (
                                        <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-3">
                                            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-amber-600">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                Stock Shortage Detected
                                            </div>
                                            {allocationPreview.shortages.map((shortage) => (
                                                <p key={shortage.productId} className="text-xs text-amber-700">
                                                    {shortage.productName}: <strong>{shortage.quantity}</strong> unallocated
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Manual Allocation View */
                                <div className="p-4 space-y-4">
                                    {aggregatedProducts.map((p) => {
                                        const batches = batchesByProduct.get(p.productId) || [];
                                        const summary = manualSummaryByProduct.get(p.productId) || {
                                            required: p.totalQuantity,
                                            allocated: 0,
                                            isValid: false,
                                            difference: -p.totalQuantity,
                                        };

                                        return (
                                            <div
                                                key={p.productId}
                                                className="rounded-2xl border border-border/60 bg-muted/5 p-3.5 space-y-3"
                                            >
                                                {/* Product Header & Allocation Balance Badge */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                                                    <div>
                                                        <p className="text-sm font-black text-foreground">{p.productName}</p>
                                                        <p className="font-mono text-[10px] text-muted-foreground">{p.productCode}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">
                                                            Required Demand: <strong className="text-foreground">{summary.required}</strong>
                                                        </span>
                                                        <span
                                                            className={`flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full border ${
                                                                summary.isValid
                                                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                                    : summary.difference > 0
                                                                    ? "bg-destructive/10 text-destructive border-destructive/20"
                                                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                                            }`}
                                                        >
                                                            {summary.isValid ? (
                                                                <CheckCircle2 className="h-3 w-3" />
                                                            ) : (
                                                                <AlertCircle className="h-3 w-3" />
                                                            )}
                                                            Allocated: {summary.allocated} / {summary.required}
                                                            {summary.difference !== 0 && (
                                                                <span className="font-mono ml-0.5">
                                                                    ({summary.difference > 0 ? `+${summary.difference}` : summary.difference})
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Batches Selection Table */}
                                                {batches.length > 0 ? (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left text-xs">
                                                            <thead>
                                                                <tr className="border-b bg-muted/20 text-muted-foreground text-[10px] uppercase">
                                                                    <th className="p-2">Storage Lot</th>
                                                                    <th className="p-2">Batch No</th>
                                                                    <th className="p-2">Expiry Date</th>
                                                                    <th className="p-2">Condition</th>
                                                                    <th className="p-2 text-right">Available Stock</th>
                                                                    <th className="p-2 text-right w-36">Manual Allocation</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-border/20">
                                                                {batches.map((b) => {
                                                                    const key = `${p.productId}:${b.inventoryLotId}`;
                                                                    const currentQty = manualAllocations[key] || 0;

                                                                    return (
                                                                        <tr key={key} className="hover:bg-muted/10">
                                                                            <td className="p-2 font-medium text-foreground">{b.lotName}</td>
                                                                            <td className="p-2 font-mono text-[11px] text-muted-foreground">{b.batchNo}</td>
                                                                            <td className="p-2 text-muted-foreground">
                                                                                {b.expiryDate
                                                                                    ? new Date(b.expiryDate).toLocaleDateString()
                                                                                    : "No expiry"}
                                                                            </td>
                                                                            <td className="p-2">
                                                                                <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                                                                    {b.inventoryCondition}
                                                                                </span>
                                                                            </td>
                                                                            <td className="p-2 text-right font-bold text-foreground">
                                                                                {b.availableQuantity}
                                                                            </td>
                                                                            <td className="p-2 text-right">
                                                                                <div className="flex items-center justify-end gap-1.5">
                                                                                    <Input
                                                                                        type="number"
                                                                                        min={0}
                                                                                        max={b.availableQuantity}
                                                                                        value={currentQty === 0 ? "" : currentQty}
                                                                                        placeholder="0"
                                                                                        onChange={(e) =>
                                                                                            handleManualQtyChange(
                                                                                                p.productId,
                                                                                                b.inventoryLotId,
                                                                                                b.availableQuantity,
                                                                                                e.target.value
                                                                                            )
                                                                                        }
                                                                                        className="h-8 w-20 text-right font-bold text-xs bg-card"
                                                                                    />
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        onClick={() =>
                                                                                            handleManualQtyChange(
                                                                                                p.productId,
                                                                                                b.inventoryLotId,
                                                                                                b.availableQuantity,
                                                                                                String(
                                                                                                    Math.min(
                                                                                                        b.availableQuantity,
                                                                                                        Math.max(
                                                                                                            0,
                                                                                                            p.totalQuantity -
                                                                                                                (summary.allocated -
                                                                                                                    currentQty)
                                                                                                        )
                                                                                                    )
                                                                                                )
                                                                                            )
                                                                                        }
                                                                                        className="h-8 px-2 text-[10px] font-bold"
                                                                                    >
                                                                                        Fill
                                                                                    </Button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground italic">
                                                        No available batches found for this product in current stock.
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-border/60 bg-card px-4 py-4 sm:flex-row sm:items-center sm:px-7">
                    <div className="text-xs text-muted-foreground">
                        {selectedIds.size > 0 && (
                            <>
                                <span className="font-semibold text-foreground">{selectedIds.size}</span> invoice(s) selected
                                {" \u2014 "}Total:{" "}
                                <span className="font-black text-foreground">
                                    P{totalSelectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                {allocationMode === "manual" && (
                                    <span
                                        className={`ml-2 font-bold ${
                                            isManualValid ? "text-emerald-600" : "text-amber-600"
                                        }`}
                                    >
                                        ({isManualValid ? "All products balanced" : "Adjustment needed"})
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="rounded-xl px-5 font-black uppercase tracking-wider"
                        >
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                            Create Batch ({selectedIds.size})
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
