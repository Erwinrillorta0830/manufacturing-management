"use client";

import React, { useEffect, useState, useMemo } from "react";
import { X, Search, Loader2, CheckSquare, Square, FileText, Building2, Package, ChevronRight, ChevronDown, MapPin, AlertTriangle } from "lucide-react";
import { CandidateInvoice, Branch, AllocationPreview } from "../types";
import { fetchAllocationPreview } from "../services/invoice-consolidation-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    branch: Branch;
    candidates: CandidateInvoice[];
    loading: boolean;
    onSubmit: (payload: { branchId: number; invoiceIds: number[] }) => Promise<boolean>;
}

export default function CreateConsolidationModal({ isOpen, onClose, branch, candidates, loading, onSubmit }: Props) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [allocationPreview, setAllocationPreview] = useState<AllocationPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || selectedIds.size === 0) return;

        const controller = new AbortController();
        const invoiceIds = [...selectedIds].sort((a, b) => a - b);
        const timer = window.setTimeout(() => {
            setPreviewLoading(true);
            setPreviewError(null);
            fetchAllocationPreview({ branchId: branch.id, invoiceIds }, controller.signal)
                .then((preview) => setAllocationPreview(preview))
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
        // Build per-product version set to detect mixed versions
        const versionSets = new Map<number, Set<string>>();
        const agg = new Map<number, { quantity: number; invoiceCount: Set<number>; productName: string; productCode: string }>();
        for (const inv of selected) {
            for (const p of inv.products) {
                if (!agg.has(p.productId)) {
                    agg.set(p.productId, { quantity: 0, invoiceCount: new Set(), productName: p.productName, productCode: p.productCode });
                }
                if (!versionSets.has(p.productId)) versionSets.set(p.productId, new Set());
                const entry = agg.get(p.productId)!;
                entry.quantity += p.quantity;
                entry.invoiceCount.add(inv.invoiceId);
                versionSets.get(p.productId)!.add(p.versionName || "Unversioned");
            }
        }
        return Array.from(agg.entries()).map(([productId, e]) => ({
            productId,
            productName: e.productName,
            productCode: e.productCode,
            totalQuantity: e.quantity,
            invoiceCount: e.invoiceCount.size,
            versionLabel: versionSets.get(productId)!.size > 1
                ? "Multiple versions"
                : versionSets.get(productId)!.values().next().value || "Not assigned",
        })).sort((a, b) => a.productName.localeCompare(b.productName));
    }, [candidates, selectedIds]);

    const handleSubmit = async () => {
        if (selectedIds.size === 0 || submitting) return;
        setSubmitting(true);
        await onSubmit({ branchId: branch.id, invoiceIds: Array.from(selectedIds) });
        setSubmitting(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
            <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-background shadow-2xl sm:h-[95vh] sm:max-w-[95vw] sm:rounded-3xl sm:border sm:border-border/60 lg:max-w-[1440px]">
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 bg-card px-4 py-5 sm:px-7">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20"><FileText className="h-6 w-6 text-primary-foreground" /></div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">New Batch</p>
                            <h2 className="text-xl font-black uppercase italic tracking-tighter text-foreground sm:text-3xl">Consolidation <span className="text-primary">Creation</span></h2>
                            <p className="mt-1 text-xs text-muted-foreground">Select eligible invoices and review FEFO allocations before creating the batch.</p>
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

                <div className="shrink-0 border-b bg-muted/20 px-4 py-3 sm:px-6">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search invoices by no, customer..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-10 rounded-xl pl-9"
                            />
                        </div>
                        <Button variant="outline" size="sm"
                            onClick={toggleAll}
                            className="rounded-xl"
                        >
                            {selectedIds.size === filtered.length && filtered.length > 0 ? (
                                <CheckSquare className="h-4 w-4" />
                            ) : (
                                <Square className="h-4 w-4" />
                            )}
                            {selectedIds.size === filtered.length ? "Deselect All" : "Select All"}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            {selectedIds.size} of {filtered.length} selected
                        </span>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 custom-scrollbar sm:px-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                            <p className="text-xs text-muted-foreground mt-2">
                                {search ? "No invoices match your search." : "No eligible invoices found for consolidation."}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-3xl border border-border/60 bg-card shadow-sm">
                        <table className="min-w-[720px] w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-xl">
                                <tr className="border-b bg-muted/20">
                                    <th className="p-2.5 w-7"></th>
                                    <th className="p-2.5 w-7"></th>
                                    <th className="p-2.5 font-semibold text-muted-foreground uppercase">Invoice No</th>
                                    <th className="p-2.5 font-semibold text-muted-foreground uppercase">Customer</th>
                                    <th className="p-2.5 font-semibold text-muted-foreground uppercase">Date</th>
                                    <th className="p-2.5 font-semibold text-muted-foreground uppercase text-right">Net Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filtered.map((inv) => {
                                    const isSelected = selectedIds.has(inv.invoiceId);
                                    const isExpanded = expandedInvoiceIds.has(inv.invoiceId);
                                    return (
                                        <React.Fragment key={inv.invoiceId}>
                                            <tr
                                                onClick={() => toggle(inv.invoiceId)}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected ? "bg-primary/5" : "hover:bg-muted/10"
                                                }`}
                                            >
                                                <td className="p-2.5" onClick={(e) => { e.stopPropagation(); toggleExpand(inv.invoiceId); }}>
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                                                    ) : (
                                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                                                    )}
                                                </td>
                                                <td className="p-2.5">
                                                    {isSelected ? (
                                                        <CheckSquare className="h-4 w-4 text-primary" />
                                                    ) : (
                                                        <Square className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </td>
                                                <td className="p-2.5 font-bold text-foreground">{inv.invoiceNo}</td>
                                                <td className="p-2.5 text-muted-foreground">{inv.customerName}</td>
                                                <td className="p-2.5 text-muted-foreground">
                                                    {new Date(inv.invoiceDate).toLocaleDateString()}
                                                </td>
                                                <td className="p-2.5 text-right font-black text-foreground">
                                                    P{Number(inv.netAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-muted/5">
                                                    <td colSpan={6} className="p-0">
                                                        <table className="w-full text-left border-collapse text-[10px]">
                                                            <thead>
                                                                <tr className="border-t border-b bg-muted/10">
                                                                    <th className="px-5 py-1.5 font-semibold text-muted-foreground w-8"></th>
                                                                    <th className="py-1.5 font-semibold text-muted-foreground">Product</th>
                                                                    <th className="py-1.5 font-semibold text-muted-foreground">Code</th>
                                                                    <th className="py-1.5 font-semibold text-muted-foreground text-right">Qty</th>
                                                                    <th className="py-1.5 font-semibold text-muted-foreground">Version</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {inv.products.map((p) => (
                                                                    <tr key={`${inv.invoiceId}-${p.productId}`} className="border-b border-muted/5 last:border-0">
                                                                        <td className="px-5 py-1"></td>
                                                                        <td className="py-1 font-medium text-foreground">{p.productName}</td>
                                                                        <td className="py-1 text-muted-foreground">{p.productCode}</td>
                                                                        <td className="py-1 text-right font-bold text-foreground">{p.quantity}</td>
                                                                        <td className="py-1 text-muted-foreground">
                                                                            {p.versionName ? (
                                                                                <span className="text-[9px] bg-primary/5 border border-primary/10 px-1.5 py-0.5 rounded-full">
                                                                                    {p.versionName}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-muted-foreground/50 italic">Not assigned</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
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

                    {selectedIds.size > 0 && aggregatedProducts.length > 0 && (
                        <div className="mt-4 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                    Consolidated Products Preview — {aggregatedProducts.length} unique product(s)
                                </span>
                            </div>
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b bg-muted/20">
                                        <th className="p-2.5 font-semibold text-muted-foreground">Product</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Code</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground text-right">Total Qty</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground text-right">Invoices</th>
                                        <th className="p-2.5 font-semibold text-muted-foreground">Version</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {aggregatedProducts.map((p) => (
                                        <tr key={p.productId} className="hover:bg-muted/10">
                                            <td className="p-2.5 font-medium text-foreground">{p.productName}</td>
                                            <td className="p-2.5 text-muted-foreground">{p.productCode}</td>
                                            <td className="p-2.5 text-right font-bold text-foreground">{p.totalQuantity}</td>
                                            <td className="p-2.5 text-right text-muted-foreground">{p.invoiceCount}</td>
                                            <td className="p-2.5 text-muted-foreground">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                                    p.versionLabel === "Multiple versions"
                                                        ? "bg-amber-500/10 border border-amber-500/20 text-amber-500"
                                                        : "bg-primary/5 border border-primary/10"
                                                }`}>
                                                    {p.versionLabel}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {selectedIds.size > 0 && (
                        <div className="mt-4 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                            <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 text-primary" />
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                        FEFO Lot Allocation Preview
                                    </span>
                                </div>
                                {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                            </div>

                            {previewError ? (
                                <div className="flex items-center gap-2 px-4 py-4 text-xs text-destructive">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {previewError}
                                </div>
                            ) : previewLoading && !allocationPreview ? (
                                <div className="px-4 py-5 text-center text-xs text-muted-foreground">Calculating FEFO lots...</div>
                            ) : allocationPreview && allocationPreview.allocations.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-[760px] w-full border-collapse text-left text-xs">
                                        <thead>
                                            <tr className="border-b bg-muted/20">
                                                <th className="p-2.5 font-semibold text-muted-foreground">Product</th>
                                                <th className="p-2.5 font-semibold text-muted-foreground">Storage Lot</th>
                                                <th className="p-2.5 font-semibold text-muted-foreground">Batch</th>
                                                <th className="p-2.5 font-semibold text-muted-foreground">Expiry</th>
                                                <th className="p-2.5 text-right font-semibold text-muted-foreground">Allocated Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {allocationPreview.allocations.map((allocation) => (
                                                <tr key={`${allocation.productId}-${allocation.inventoryLotId}`} className="hover:bg-muted/10">
                                                    <td className="p-2.5">
                                                        <p className="font-medium text-foreground">{allocation.productName}</p>
                                                        <p className="font-mono text-[9px] text-muted-foreground">{allocation.productCode}</p>
                                                    </td>
                                                    <td className="p-2.5 font-medium text-foreground">{allocation.lotName}</td>
                                                    <td className="p-2.5 font-mono text-[10px] text-muted-foreground">{allocation.batchNo}</td>
                                                    <td className="p-2.5 text-muted-foreground">
                                                        {allocation.expiryDate ? new Date(allocation.expiryDate).toLocaleDateString() : "No expiry"}
                                                    </td>
                                                    <td className="p-2.5 text-right font-black text-primary">{allocation.quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="px-4 py-5 text-center text-xs text-muted-foreground">No eligible lot allocation found.</div>
                            )}

                            {allocationPreview && allocationPreview.shortages.length > 0 && (
                                <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-3">
                                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-amber-600">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Stock shortage
                                    </div>
                                    {allocationPreview.shortages.map((shortage) => (
                                        <p key={shortage.productId} className="text-xs text-amber-700">
                                            {shortage.productName}: {shortage.quantity} unallocated
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-border/60 bg-card px-4 py-4 sm:flex-row sm:items-center sm:px-7">
                    <div className="text-xs text-muted-foreground">
                        {selectedIds.size > 0 && (
                            <>
                                <span className="font-semibold text-foreground">{selectedIds.size}</span> invoice(s) selected
                                {" \u2014 "}Total:{" "}
                                <span className="font-black text-foreground">
                                    P{totalSelectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={selectedIds.size === 0 || submitting || previewLoading || !!previewError || !allocationPreview || allocationPreview.shortages.length > 0}
                            className="rounded-xl px-5 font-black uppercase tracking-wider"
                        >
                            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Create Batch ({selectedIds.size})
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
