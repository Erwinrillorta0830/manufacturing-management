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
    MapPin,
    PackageCheck,
    Play,
    Printer,
    Search,
    ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    await generateConsolidationPDF({
        consolidatorNo: c.consolidatorNo,
        branchName: c.branchName,
        status: c.status,
        createdAt: c.createdAt,
        details: c.details.map((d) => ({
            productId: d.productId,
            productCode: d.productCode,
            productName: d.productName,
            brand: d.brand || "Unbranded",
            category: d.category || "Uncategorized",
            unit: d.unit || "-",
            orderedQuantity: d.orderedQuantity,
            pickedQuantity: d.pickedQuantity,
        })),
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

export default function ConsolidationDetailSheet({ consolidation, submitting, onClose, onRequestAction }: Props) {
    const [search, setSearch] = useState("");
    const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
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

    const filteredDetails = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return consolidation?.details ?? [];
        return (consolidation?.details ?? []).filter((detail) =>
            detail.productName.toLowerCase().includes(query) ||
            detail.productCode.toLowerCase().includes(query) ||
            String(detail.productId).includes(query)
        );
    }, [consolidation?.details, search]);

    if (!consolidation) return null;

    const totalOrdered = consolidation.details.reduce((sum, detail) => sum + detail.orderedQuantity, 0);
    const totalPicked = consolidation.details.reduce((sum, detail) => sum + detail.pickedQuantity, 0);
    const totalShort = Math.max(0, totalOrdered - totalPicked);
    const progress = totalOrdered > 0 ? (totalPicked / totalOrdered) * 100 : 0;
    const allocations = allocationState?.batchId === consolidation.id ? allocationState.allocations : [];
    const allocationsLoading = allocationState?.batchId !== consolidation.id;
    const allocationError = allocationState?.batchId === consolidation.id ? allocationState.error : null;

    return (
        <Sheet open onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="flex w-full flex-col overflow-hidden bg-background p-0 sm:max-w-2xl sm:rounded-l-3xl">
                <div className="shrink-0 border-b border-border/60 bg-card p-5 lg:p-7">
                    <SheetHeader className="space-y-3 text-left">
                        <div className="flex items-start justify-between gap-3 pr-6">
                            <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge className="border-none bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">Batch Details</Badge>
                                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest">
                                        <Building2 className="mr-1 h-2.5 w-2.5" />
                                        {consolidation.branchName}
                                    </Badge>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {new Date(consolidation.createdAt).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                                <SheetTitle className="truncate font-mono text-2xl font-black uppercase italic leading-none tracking-tighter text-foreground sm:text-3xl">
                                    {consolidation.consolidatorNo}
                                </SheetTitle>
                            </div>
                            <ConsolidationStatusBadge status={consolidation.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <MiniStat label="Products" value={consolidation.details.length} icon={<Box className="text-blue-500" />} />
                            <MiniStat label="Invoices" value={consolidation.invoices.length} icon={<FileText className="text-purple-500" />} />
                            <MiniStat label="Short" value={totalShort} icon={<Layers className="text-amber-500" />} />
                            <MiniStat label="Done" value={`${progress.toFixed(0)}%`} icon={<CheckCircle className="text-emerald-500" />} />
                        </div>
                    </SheetHeader>
                </div>

                <Tabs defaultValue="products" className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 bg-card px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <TabsList className="h-9 rounded-xl border border-border/20 bg-muted/30 p-1">
                            <TabsTrigger value="products" className="px-4 text-[10px] font-black uppercase tracking-widest">Picking List</TabsTrigger>
                            <TabsTrigger value="invoices" className="px-4 text-[10px] font-black uppercase tracking-widest">Invoices</TabsTrigger>
                        </TabsList>
                        <div className="relative w-full sm:max-w-[220px] sm:flex-1">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter products..." className="h-9 rounded-xl pl-8 text-xs" />
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                        <TabsContent value="products" className="m-0 space-y-2 p-5">
                            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/20 bg-background/95 py-2 backdrop-blur-sm">
                                <div className="rounded-md bg-primary/10 p-1"><PackageCheck className="h-3.5 w-3.5 text-primary" /></div>
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/80">Consolidated Products</h3>
                            </div>
                            {filteredDetails.map((detail) => {
                                const itemProgress = detail.orderedQuantity > 0 ? (detail.pickedQuantity / detail.orderedQuantity) * 100 : 0;
                                const shortage = detail.pickedQuantity < detail.orderedQuantity && consolidation.status !== "Pending";
                                return (
                                    <div key={detail.id} className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${shortage ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-card"}`}>
                                        {shortage && <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" />}
                                        <div className="min-w-0 flex-1">
                                            <h4 className="truncate text-[11px] font-black uppercase tracking-tight text-foreground/90">{detail.productName}</h4>
                                            <div className="mt-1 flex gap-3 font-mono text-[9px] font-bold uppercase text-muted-foreground/60">
                                                <span className="rounded bg-muted/50 px-1.5 py-0.5">ID: {detail.productId}</span>
                                                {detail.productCode && <span>{detail.productCode}</span>}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right font-mono">
                                            <span className={itemProgress >= 100 ? "text-sm font-black text-emerald-500" : "text-sm font-black text-amber-500"}>{detail.pickedQuantity}</span>
                                            <span className="text-[10px] font-bold text-muted-foreground"> / {detail.orderedQuantity}</span>
                                            <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">Pieces</p>
                                        </div>
                                        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-muted/40"><div className={itemProgress >= 100 ? "h-full bg-emerald-500" : "h-full bg-amber-500"} style={{ width: `${Math.min(100, itemProgress)}%` }} /></div>
                                    </div>
                                );
                            })}

                            <div className="sticky top-0 z-10 mt-5 flex items-center justify-between gap-2 border-b border-border/20 bg-background/95 py-2 backdrop-blur-sm">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-md bg-primary/10 p-1"><MapPin className="h-3.5 w-3.5 text-primary" /></div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/80">Allocated Lots</h3>
                                </div>
                                {!allocationsLoading && !allocationError && (
                                    <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest">
                                        {allocations.length} lot{allocations.length === 1 ? "" : "s"}
                                    </Badge>
                                )}
                            </div>

                            {allocationsLoading ? (
                                <div className="flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-card/40 py-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5 animate-pulse" /> Loading allocations
                                </div>
                            ) : allocationError ? (
                                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
                                    {allocationError}
                                </div>
                            ) : allocations.length === 0 ? (
                                <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-4 text-center text-xs text-muted-foreground">
                                    No lot allocations are available for this batch.
                                </div>
                            ) : (
                                allocations.map((allocation) => (
                                    <div key={`${allocation.productId}-${allocation.lotId}-${allocation.batchNo}`} className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <p className="truncate text-[11px] font-black uppercase tracking-tight text-foreground/90">{allocation.productName}</p>
                                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] font-bold text-muted-foreground">
                                                    <span className="rounded bg-primary/5 px-1.5 py-0.5 text-primary">{allocation.lotName}</span>
                                                    <span className="font-mono">{allocation.batchNo}</span>
                                                    <span>{allocation.expiryDate ? `Exp ${new Date(allocation.expiryDate).toLocaleDateString()}` : "No expiry"}</span>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="font-mono text-sm font-black text-primary">{allocation.quantity}</p>
                                                <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">Allocated</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </TabsContent>

                        <TabsContent value="invoices" className="m-0 space-y-2 p-5">
                            {consolidation.invoices.map((invoice) => {
                                const expanded = expandedInvoiceId === invoice.id;
                                return (
                                    <div key={invoice.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                                        <button type="button" onClick={() => setExpandedInvoiceId(expanded ? null : invoice.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                                            <div className="min-w-0"><p className="truncate font-mono text-xs font-black">{invoice.invoiceNo}</p><p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Invoice ID #{invoice.invoiceId}</p></div>
                                            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px]">{invoice.products?.length ?? 0} Products</Badge>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
                                        </button>
                                        {expanded && <div className="space-y-2 border-t border-border/30 bg-muted/10 p-3">{invoice.products?.map((product) => <div key={product.productId} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-[10px]"><div className="min-w-0"><p className="truncate font-bold">{product.productName}</p><p className="font-mono text-muted-foreground">{product.productCode || `ID ${product.productId}`}</p></div><div className="text-right"><p className="font-black">{product.quantity} pcs</p><p className="text-[9px] text-muted-foreground">{product.versionName || "Not assigned"}</p></div></div>)}</div>}
                                    </div>
                                );
                            })}
                        </TabsContent>
                    </div>
                </Tabs>

                <div className="z-30 grid shrink-0 grid-cols-1 gap-3 border-t border-border/60 bg-card p-4 sm:grid-cols-2 sm:p-6">
                    <Button variant="outline" onClick={() => handlePrint(consolidation).catch((error: Error) => toast.error(error.message))} className="h-12 flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest" title="Print Summary"><Printer className="mr-2 h-4 w-4" />Print</Button>
                    {consolidation.status === "Pending" && <Button disabled={submitting} onClick={() => onRequestAction("start-picking", consolidation.id)} className="h-12 flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest"><Play className="mr-2 h-4 w-4" />Initialize Picking</Button>}
                    {consolidation.status === "Picking" && <Button asChild className="h-12 flex-1 rounded-xl bg-blue-600 text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"><Link href={`/mm/consolidation/picking/${encodeURIComponent(consolidation.consolidatorNo)}`}><Play className="mr-2 h-4 w-4" />Picking Active</Link></Button>}
                    {consolidation.status === "Picked" && <Button disabled={submitting} onClick={() => onRequestAction("audit", consolidation.id)} className="h-12 flex-1 rounded-xl bg-violet-600 text-[10px] font-black uppercase tracking-widest hover:bg-violet-700"><ShieldCheck className="mr-2 h-4 w-4" />Verify Batch</Button>}
                </div>
            </SheetContent>
        </Sheet>
    );
}
function MiniStat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
    return <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-background/50 px-2.5 py-1.5 shadow-sm"><span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span><strong className="text-xs">{value}</strong><span className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground">{label}</span></div>;
}
