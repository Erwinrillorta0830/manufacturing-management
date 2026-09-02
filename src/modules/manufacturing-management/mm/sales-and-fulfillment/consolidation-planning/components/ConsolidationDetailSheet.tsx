"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    Box,
    Building2,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Clock,
    FileText,
    Layers,
    Package,
    PackageCheck,
    Play,
    Printer,
    Search,
    ShieldCheck,
    Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import type { InvoiceConsolidation } from "../types";
import { generateConsolidationPDF } from "../utils/ConsolidationSummaryPrint";
import { fetchAllocations, type LotAllocation } from "../services/invoice-consolidation-api";
import { ConsolidationStatusBadge } from "../../shared/consolidation-ui";

type DetailAction = "revert" | "audit" | "start-picking";

interface Props {
    consolidation: InvoiceConsolidation | null;
    submitting: boolean;
    onClose: () => void;
    onRequestAction: (type: DetailAction, batchId: number) => void;
}

async function handlePrint(c: InvoiceConsolidation) {
    const allocations = await fetchAllocations(c.id);
    if (allocations.length === 0) {
        throw new Error("This batch has no lot allocations to print");
    }
    const detailMap = new Map<number, {
        productId: number;
        productCode: string;
        productName: string;
        brand: string;
        category: string;
        unit: string;
        orderedQuantity: number;
        pickedQuantity: number;
    }>();

    for (const d of c.details) {
        const existing = detailMap.get(d.productId);
        if (existing) {
            existing.orderedQuantity += d.orderedQuantity;
            existing.pickedQuantity += (d.pickedQuantity || 0);
        } else {
            detailMap.set(d.productId, {
                productId: d.productId,
                productCode: d.productCode,
                productName: d.productName,
                brand: d.brand || "Unbranded",
                category: d.category || "Uncategorized",
                unit: d.unit || "-",
                orderedQuantity: d.orderedQuantity,
                pickedQuantity: d.pickedQuantity || 0,
            });
        }
    }

    await generateConsolidationPDF({
        consolidatorNo: c.consolidatorNo,
        branchName: c.branchName,
        status: c.status,
        createdAt: c.createdAt,
        details: Array.from(detailMap.values()),
        invoices: c.invoices.map((inv) => ({
            invoiceNo: inv.invoiceNo,
            customerName: inv.customerName,
            products: (inv.products || []).map((p) => ({
                productName: p.productName,
                productCode: p.productCode,
                quantity: p.quantity,
            })),
        })),
        totalInvoices: c.invoices.length,
        allocations,
    });
}

export default function ConsolidationDetailSheet({
    consolidation,
    submitting,
    onClose,
    onRequestAction,
}: Props) {
    const [search, setSearch] = useState("");
    const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
    const [allocationState, setAllocationState] = useState<{
        batchId: number;
        allocations: LotAllocation[];
        error: string | null;
    } | null>(null);

    useEffect(() => {
        if (!consolidation) return;
        const batchId = consolidation.id;
        let active = true;
        fetchAllocations(batchId)
            .then((allocations) => {
                if (active) setAllocationState({ batchId, allocations, error: null });
            })
            .catch((error: Error) => {
                if (active) setAllocationState({ batchId, allocations: [], error: error.message });
            });
        return () => {
            active = false;
        };
    }, [consolidation]);

    const allocations = useMemo(
        () => (allocationState && allocationState.batchId === consolidation?.id ? allocationState.allocations : []),
        [allocationState, consolidation?.id]
    );

    // Group allocations by productId
    const allocationsByProduct = useMemo(() => {
        const map = new Map<number, LotAllocation[]>();
        for (const alloc of allocations) {
            const list = map.get(alloc.productId) || [];
            list.push(alloc);
            map.set(alloc.productId, list);
        }
        return map;
    }, [allocations]);

    // Consolidate details by unique product ID
    const consolidatedProducts = useMemo(() => {
        const map = new Map<
            number,
            {
                productId: number;
                productName: string;
                productCode: string;
                brand?: string;
                category?: string;
                unit?: string;
                orderedQuantity: number;
                pickedQuantity: number;
                appliedQuantity: number;
            }
        >();

        for (const d of consolidation?.details || []) {
            const existing = map.get(d.productId);
            if (existing) {
                existing.orderedQuantity += d.orderedQuantity;
                existing.pickedQuantity += d.pickedQuantity || 0;
                existing.appliedQuantity += d.appliedQuantity || 0;
            } else {
                map.set(d.productId, {
                    productId: d.productId,
                    productName: d.productName,
                    productCode: d.productCode,
                    brand: d.brand,
                    category: d.category,
                    unit: d.unit,
                    orderedQuantity: d.orderedQuantity,
                    pickedQuantity: d.pickedQuantity || 0,
                    appliedQuantity: d.appliedQuantity || 0,
                });
            }
        }
        return Array.from(map.values());
    }, [consolidation?.details]);

    const filteredDetails = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return consolidatedProducts;
        return consolidatedProducts.filter((detail) => {
            const prodMatch =
                detail.productName.toLowerCase().includes(query) ||
                detail.productCode.toLowerCase().includes(query) ||
                String(detail.productId).includes(query);
            const lotMatch = (allocationsByProduct.get(detail.productId) || []).some(
                (alloc) =>
                    alloc.lotName.toLowerCase().includes(query) ||
                    alloc.batchNo.toLowerCase().includes(query)
            );
            return prodMatch || lotMatch;
        });
    }, [consolidatedProducts, search, allocationsByProduct]);

    if (!consolidation) return null;

    const totalOrdered = consolidation.details.reduce((sum, detail) => sum + detail.orderedQuantity, 0);
    const totalPicked = consolidation.details.reduce((sum, detail) => sum + (detail.pickedQuantity || 0), 0);
    const totalAllocated = allocations.reduce((sum, a) => sum + (a.quantity || 0), 0);

    const isPickingOrDone = ["In Picking", "Picked", "Audited"].includes(consolidation.status);
    const totalShort = isPickingOrDone
        ? Math.max(0, totalOrdered - totalPicked)
        : Math.max(0, totalOrdered - totalAllocated);

    const progress =
        totalOrdered > 0
            ? ((isPickingOrDone ? totalPicked : totalAllocated) / totalOrdered) * 100
            : 0;

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex flex-col w-[96vw] sm:w-[96vw] max-w-[1380px] sm:max-w-[1380px] h-[92vh] max-h-[960px] p-0 overflow-hidden bg-background rounded-3xl border border-border/80 shadow-2xl">
                {/* ── Top Header ── */}
                <div className="shrink-0 border-b border-border/60 bg-card px-6 py-4 lg:px-8">
                    <DialogHeader className="space-y-1 text-left">
                        <div className="flex flex-wrap items-center justify-between gap-4 pr-8">
                            <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge className="border-none bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                                        Batch Details
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest">
                                        <Building2 className="mr-1.5 h-3 w-3" />
                                        {consolidation.branchName}
                                    </Badge>
                                    <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5" />
                                        {new Date(consolidation.createdAt).toLocaleString([], {
                                            month: "short",
                                            day: "2-digit",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                                <DialogTitle className="truncate font-mono text-2xl lg:text-3xl font-black uppercase italic leading-none tracking-tighter text-foreground">
                                    {consolidation.consolidatorNo}
                                </DialogTitle>
                            </div>
                            <div className="flex items-center gap-3">
                                <ConsolidationStatusBadge status={consolidation.status} />
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                {/* ── 2-Column Body Layout ── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0 flex-1 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-border/60">
                    {/* ── Left Column: Summary & Orders (5 cols) ── */}
                    <div className="lg:col-span-5 flex flex-col min-h-0 bg-muted/[0.08] overflow-hidden">
                        {/* Quick KPI Overview */}
                        <div className="shrink-0 p-5 border-b border-border/40 space-y-4 bg-card/40">
                            <div className="grid grid-cols-2 gap-2.5">
                                <MiniMetricCard
                                    label="Products"
                                    value={consolidatedProducts.length}
                                    icon={<Box className="h-4 w-4 text-blue-500" />}
                                />
                                <MiniMetricCard
                                    label="Linked Orders"
                                    value={consolidation.invoices.length}
                                    icon={<FileText className="h-4 w-4 text-purple-500" />}
                                />
                                <MiniMetricCard
                                    label={isPickingOrDone ? "Unpicked" : "Shortage"}
                                    value={`${totalShort} pcs`}
                                    icon={<Layers className="h-4 w-4 text-amber-500" />}
                                />
                                <MiniMetricCard
                                    label={isPickingOrDone ? "Picking Progress" : "Allocated"}
                                    value={`${progress.toFixed(0)}%`}
                                    icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
                                />
                            </div>

                            {/* Overall Progress Bar */}
                            <div className="space-y-1.5 rounded-2xl border border-border/40 bg-card p-3.5 shadow-xs">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                    <span>{isPickingOrDone ? "Picking Progress" : "Allocation Progress"}</span>
                                    <span className={progress >= 100 ? "text-emerald-500 font-bold" : "text-foreground font-bold"}>
                                        {isPickingOrDone ? totalPicked : totalAllocated} / {totalOrdered} pcs ({progress.toFixed(0)}%)
                                    </span>
                                </div>
                                <div className="h-2.5 w-full rounded-full bg-muted/60 overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${progress >= 100 ? "bg-emerald-500" : "bg-primary"
                                            }`}
                                        style={{ width: `${Math.min(100, progress)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Linked Orders Section */}
                        <div className="flex-1 flex flex-col min-h-0 p-5 overflow-hidden">
                            <div className="shrink-0 flex items-center justify-between pb-3 border-b border-border/30">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-md bg-purple-500/10 p-1">
                                        <Layers className="h-4 w-4 text-purple-500" />
                                    </div>
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/90">
                                        Linked Orders ({consolidation.invoices.length})
                                    </h3>
                                </div>
                                <Badge variant="outline" className="text-[10px] font-mono font-bold">
                                    {consolidation.invoices.length} Order{consolidation.invoices.length === 1 ? "" : "s"}
                                </Badge>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pt-3 space-y-2.5">
                                {consolidation.invoices.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center text-xs font-medium text-muted-foreground">
                                        No linked orders found for this batch.
                                    </div>
                                ) : (
                                    consolidation.invoices.map((inv, invIdx) => {
                                        const isExpanded = expandedOrderId === inv.id;
                                        return (
                                            <motion.div
                                                key={inv.id ? `inv-${inv.id}` : `inv-no-${inv.invoiceNo || invIdx}`}
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.2, delay: Math.min(invIdx * 0.03, 0.3) }}
                                                className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xs transition-all"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedOrderId(isExpanded ? null : inv.id)}
                                                    className="flex w-full items-center justify-between gap-3 p-3.5 text-left hover:bg-muted/30 transition-colors"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-black text-foreground">
                                                                {inv.invoiceNo}
                                                            </span>
                                                            <Badge
                                                                variant="outline"
                                                                className="text-[9px] font-black uppercase tracking-wider py-0"
                                                            >
                                                                {inv.products?.length ?? 0} items
                                                            </Badge>
                                                        </div>
                                                        <p className="truncate text-[11px] font-semibold text-muted-foreground mt-0.5">
                                                            {inv.customerName || "Standard Fulfillment"}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                                                        {isExpanded ? (
                                                            <ChevronDown className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4" />
                                                        )}
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className="border-t border-border/40 bg-muted/15 p-3 space-y-1.5">
                                                        {(inv.products || []).length === 0 ? (
                                                            <p className="text-[10px] italic text-muted-foreground">
                                                                No order lines available.
                                                            </p>
                                                        ) : (
                                                            inv.products?.map((prod, pIdx) => (
                                                                <div
                                                                    key={`order-prod-${prod.productId}-${pIdx}`}
                                                                    className="flex items-center justify-between gap-2.5 rounded-xl bg-background/90 px-3 py-2 border border-border/30 text-[11px]"
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="truncate font-bold text-foreground/90">
                                                                            {prod.productName}
                                                                        </p>
                                                                        <span className="font-mono text-[9px] text-muted-foreground">
                                                                            {prod.productCode || `ID: ${prod.productId}`}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <span className="font-mono font-black text-foreground">
                                                                            {prod.quantity} pcs
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </motion.div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Right Column: Products & Grouped Lots (7 cols) ── */}
                    <div className="lg:col-span-7 flex flex-col min-h-0 bg-background overflow-hidden">
                        {/* Search & Filter Header */}
                        <div className="shrink-0 p-4 lg:p-5 border-b border-border/60 bg-card/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <div className="rounded-md bg-primary/10 p-1.5">
                                    <PackageCheck className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/90">
                                        Consolidated Demand & Allocated Lots
                                    </h3>
                                    <p className="text-[10px] text-muted-foreground font-bold">
                                        Showing {filteredDetails.length} unique product{filteredDetails.length === 1 ? "" : "s"}
                                    </p>
                                </div>
                            </div>

                            <div className="relative w-full sm:max-w-[260px]">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Filter products / batch no..."
                                    className="h-9 rounded-xl pl-9 text-xs bg-background"
                                />
                            </div>
                        </div>

                        {/* Product Cards with Grouped Lots */}
                        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 custom-scrollbar">
                            {filteredDetails.length === 0 ? (
                                <div className="rounded-3xl border border-dashed border-border/60 bg-card/30 p-10 text-center space-y-2">
                                    <Package className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                                    <p className="text-xs font-bold text-muted-foreground">
                                        No matching consolidated products found.
                                    </p>
                                </div>
                            ) : (
                                filteredDetails.map((detail, pIdx) => {
                                    const productLots = allocationsByProduct.get(detail.productId) || [];
                                    const totalAllocatedForProduct = productLots.reduce((sum, a) => sum + (a.quantity || 0), 0);
                                    const allocProgress =
                                        detail.orderedQuantity > 0
                                            ? (totalAllocatedForProduct / detail.orderedQuantity) * 100
                                            : 0;
                                    const itemProgress =
                                        detail.orderedQuantity > 0
                                            ? (detail.pickedQuantity / detail.orderedQuantity) * 100
                                            : 0;
                                    const isPickedOrAudited = consolidation.status === "Picked" || consolidation.status === "Audited";
                                    const currentProgress = isPickedOrAudited ? itemProgress : allocProgress;
                                    const shortage =
                                        totalAllocatedForProduct < detail.orderedQuantity &&
                                        consolidation.status !== "Pending";

                                    return (
                                        <motion.div
                                            key={`consolidated-prod-${detail.productId}`}
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: Math.min(pIdx * 0.03, 0.3) }}
                                            className={`rounded-2xl border bg-card p-4 space-y-3.5 shadow-sm transition-all ${shortage
                                                    ? "border-amber-500/40 bg-amber-500/[0.02]"
                                                    : "border-border/70 hover:border-primary/40"
                                                }`}
                                        >
                                            {/* Product Summary Header */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <h4 className="text-xs font-black uppercase tracking-tight text-foreground">
                                                        {detail.productName}
                                                    </h4>
                                                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted-foreground">
                                                        <span className="rounded bg-muted/60 px-2 py-0.5 font-mono text-[9px]">
                                                            ID: {detail.productId}
                                                        </span>
                                                        {detail.productCode && (
                                                            <span className="font-mono text-muted-foreground/80">
                                                                {detail.productCode}
                                                            </span>
                                                        )}
                                                        {detail.brand && detail.brand !== "Unbranded" && (
                                                            <Badge variant="outline" className="text-[9px] py-0">
                                                                <Tag className="h-2.5 w-2.5 mr-1" />
                                                                {detail.brand}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Quantity Pill */}
                                                <div className="shrink-0 flex sm:flex-col items-end justify-between sm:justify-center">
                                                    <div className="font-mono text-right flex items-baseline justify-end gap-1">
                                                        <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">
                                                            {isPickedOrAudited ? "Picked:" : "Allocated:"}
                                                        </span>
                                                        <span
                                                            className={`text-sm font-black ${totalAllocatedForProduct >= detail.orderedQuantity
                                                                    ? "text-emerald-500"
                                                                    : "text-amber-500"
                                                                }`}
                                                        >
                                                            {isPickedOrAudited
                                                                ? detail.pickedQuantity
                                                                : totalAllocatedForProduct}
                                                        </span>
                                                        <span className="text-xs font-bold text-muted-foreground">
                                                            / {detail.orderedQuantity} {detail.unit || "pcs"}
                                                        </span>
                                                    </div>
                                                    {shortage && (
                                                        <span className="text-[9px] font-bold text-amber-500 flex items-center gap-1 mt-0.5">
                                                            Shortage: {detail.orderedQuantity - totalAllocatedForProduct} pcs
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Product Demand Progress Bar */}
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
                                                    <span>{isPickedOrAudited ? "Pick Progress" : "Allocation Progress"}</span>
                                                    <span>{currentProgress.toFixed(0)}%</span>
                                                </div>
                                                <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-300 ${currentProgress >= 100 ? "bg-emerald-500" : "bg-primary"
                                                            }`}
                                                        style={{ width: `${Math.min(100, currentProgress)}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* ── Grouped Allocated Lots Subsection ── */}
                                            <div className="space-y-2 pt-1 border-t border-border/40">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                                                        Allocated Batches & Lots ({productLots.length})
                                                    </span>
                                                </div>

                                                {productLots.length === 0 ? (
                                                    <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-center text-[10px] italic text-muted-foreground">
                                                        No batch allocations recorded for this SKU.
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {productLots.map((alloc, aIdx) => {
                                                            return (
                                                                <div
                                                                    key={`alloc-lot-${alloc.productId}-${alloc.lotId}-${alloc.batchNo}-${aIdx}`}
                                                                    className="flex items-center justify-between gap-2.5 rounded-xl border border-border/50 bg-background/80 p-2.5 text-xs shadow-2xs hover:border-primary/30 transition-colors"
                                                                >
                                                                    <div className="min-w-0 flex-1 space-y-0.5">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Badge
                                                                                variant="secondary"
                                                                                className="font-mono text-[9px] font-bold px-1.5 py-0"
                                                                            >
                                                                                {alloc.lotName}
                                                                            </Badge>
                                                                            <span className="font-mono text-[10px] font-semibold text-foreground/80 truncate">
                                                                                {alloc.batchNo}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[9px] text-muted-foreground flex items-center gap-1 font-medium">
                                                                            <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                                                                            {alloc.expiryDate
                                                                                ? `Expiry: ${new Date(
                                                                                    alloc.expiryDate
                                                                                ).toLocaleDateString()}`
                                                                                : "No expiration"}
                                                                        </p>
                                                                    </div>
                                                                    <div className="shrink-0 text-right font-mono bg-primary/5 rounded-lg px-2.5 py-1 border border-primary/10">
                                                                        <span className="text-sm font-black text-primary">
                                                                            {alloc.quantity}
                                                                        </span>
                                                                        <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/70">
                                                                            Allocated
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Sticky Bottom Action Footer ── */}
                <div className="shrink-0 border-t border-border/60 bg-card px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <Button
                        variant="outline"
                        onClick={() =>
                            handlePrint(consolidation).catch((error: Error) => toast.error(error.message))
                        }
                        className="h-11 rounded-xl text-[10px] font-black uppercase tracking-widest w-full sm:w-auto"
                    >
                        <Printer className="mr-2 h-4 w-4" />
                        Print Picking Sheet
                    </Button>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="h-11 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        >
                            Close
                        </Button>

                        {consolidation.status === "Pending" && (
                            <Button
                                disabled={submitting}
                                onClick={() => onRequestAction("start-picking", consolidation.id)}
                                className="h-11 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary px-6"
                            >
                                <Play className="mr-2 h-4 w-4" />
                                Initialize Picking
                            </Button>
                        )}

                        {consolidation.status === "Picking" && (
                            <Button
                                asChild
                                className="h-11 rounded-xl bg-blue-600 text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 px-6"
                            >
                                <Link
                                    href={`/mm/sales-and-fulfillment/consolidation-picking/${encodeURIComponent(
                                        consolidation.consolidatorNo
                                    )}`}
                                >
                                    <Play className="mr-2 h-4 w-4" />
                                    Open Picking Workspace
                                </Link>
                            </Button>
                        )}

                        {consolidation.status === "Picked" && (
                            <Button
                                disabled={submitting}
                                onClick={() => onRequestAction("audit", consolidation.id)}
                                className="h-11 rounded-xl bg-violet-600 text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 px-6"
                            >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Verify Batch
                            </Button>
                        )}

                        {consolidation.status === "Audited" && (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                                <CheckCircle className="mr-1.5 h-4 w-4" />
                                Audited & Dispatched
                            </Badge>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function MiniMetricCard({
    label,
    value,
    icon,
}: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-xs">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40 border border-border/40">
                {icon}
            </span>
            <div className="min-w-0">
                <strong className="block font-mono text-sm font-black leading-tight text-foreground truncate">
                    {value}
                </strong>
                <span className="block text-[9px] font-black uppercase tracking-wider text-muted-foreground truncate">
                    {label}
                </span>
            </div>
        </div>
    );
}


