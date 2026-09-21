"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, ScanLine, Building2, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceConsolidation, Branch } from "../shared/consolidation-types";
import { fetchPickingQueue, fetchBranches, fetchAllocationsWithBatches, fetchConsolidationByNo } from "../shared/consolidation-api";
import { generateConsolidationPDF } from "../consolidation-planning/utils/ConsolidationSummaryPrint";
import PickingModal from "./components/PickingModal";
import {
    ConsolidationEmptyState,
    ConsolidationHeader,
    ConsolidationSection,
    ConsolidationShell,
    ConsolidationStatusBadge,
    FilterField,
} from "../shared/consolidation-ui";

export default function PickingQueueModule() {
    const [batches, setBatches] = useState<InvoiceConsolidation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<number | undefined>(undefined);
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedBatch, setSelectedBatch] = useState<InvoiceConsolidation | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [printingBatchId, setPrintingBatchId] = useState<number | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(searchQuery), 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    useEffect(() => {
        fetchBranches().then((data) => {
            setBranches(data || []);
        }).catch(() => {});
    }, []);

    const loadBatches = useCallback(async () => {
        if (!selectedBranchId) return;
        setLoading(true);
        try {
            const res = await fetchPickingQueue({
                branchId: selectedBranchId,
                page: 0,
                size: 50,
                search: debouncedSearch,
            });
            setBatches(res.content || []);
        } catch {
            console.error("Failed to load picking batches");
        } finally {
            setLoading(false);
        }
    }, [selectedBranchId, debouncedSearch]);

    useEffect(() => {
        loadBatches();
    }, [loadBatches]);

    const handleBatchClick = (batch: InvoiceConsolidation) => {
        setSelectedBatch(batch);
        setIsModalOpen(true);
    };

    const progressPct = (batch: InvoiceConsolidation) => {
        const ordered = batch.details?.reduce((s, d) => s + d.orderedQuantity, 0) || 0;
        const picked = batch.details?.reduce((s, d) => s + d.pickedQuantity, 0) || 0;
        return ordered > 0 ? (picked / ordered) * 100 : 0;
    };

    const pickedTotal = (batch: InvoiceConsolidation) => batch.details?.reduce((s, d) => s + d.pickedQuantity, 0) || 0;
    const orderedTotal = (batch: InvoiceConsolidation) => batch.details?.reduce((s, d) => s + d.orderedQuantity, 0) || 0;

    const handlePrintBatch = async (batch: InvoiceConsolidation) => {
        setPrintingBatchId(batch.id);
        try {
            toast.info(`Generating Pick List for ${batch.consolidatorNo}...`);

            const [fullBatch, allocResult] = await Promise.all([
                fetchConsolidationByNo(batch.consolidatorNo).catch(() => batch),
                fetchAllocationsWithBatches(batch.id).catch(() => ({ allocations: [], availableBatches: [] })),
            ]);

            const targetBatch = fullBatch || batch;
            const printAllocations = allocResult.allocations || [];

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

            for (const d of targetBatch.details || []) {
                const existing = detailMap.get(d.productId);
                if (existing) {
                    existing.orderedQuantity += d.orderedQuantity;
                    existing.pickedQuantity += Number(d.pickedQuantity || 0);
                } else {
                    detailMap.set(d.productId, {
                        productId: d.productId,
                        productCode: d.productCode,
                        productName: d.productName,
                        brand: d.brand || "Unbranded",
                        category: d.category || "Uncategorized",
                        unit: d.unit || "-",
                        orderedQuantity: d.orderedQuantity,
                        pickedQuantity: Number(d.pickedQuantity || 0),
                    });
                }
            }

            await generateConsolidationPDF({
                consolidatorNo: targetBatch.consolidatorNo,
                branchName: targetBatch.branchName || `Branch #${targetBatch.branchId}`,
                status: targetBatch.status,
                createdAt: targetBatch.createdAt,
                details: Array.from(detailMap.values()),
                invoices: (targetBatch.invoices || []).map((inv) => ({
                    invoiceNo: inv.invoiceNo,
                    customerName: inv.customerName,
                    products: (inv.products || []).map((p) => ({
                        productName: p.productName,
                        productCode: p.productCode,
                        quantity: p.quantity,
                    })),
                })),
                totalInvoices: targetBatch.invoices?.length || 0,
                allocations: printAllocations.map((a) => ({
                    productId: a.productId,
                    productName: a.productName,
                    lotName: a.lotName || `Lot #${a.lotId}`,
                    batchNo: a.batchNo || "N/A",
                    manufacturingDate: a.manufacturingDate || null,
                    expiryDate: a.expiryDate || null,
                    quantity: Number(a.quantity || 0),
                })),
            });

            toast.success(`Pick List generated for ${batch.consolidatorNo}`);
        } catch (err: unknown) {
            console.error("Failed to print pick list:", err);
            const message = err instanceof Error ? err.message : "Failed to print pick list";
            toast.error(message);
        } finally {
            setPrintingBatchId(null);
        }
    };

    return (
        <ConsolidationShell>
            <ConsolidationHeader
                icon={ScanLine}
                eyebrow="Consolidation Operations"
                title="Picking"
                accent="Queue"
                description="Select and continue batches currently being picked."
                controls={
                    <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-[260px_320px]">
                        <FilterField label="Branch">
                            <SearchableSelect
                                value={selectedBranchId ? String(selectedBranchId) : ""}
                                onValueChange={(value) => setSelectedBranchId(Number(value))}
                                options={branches.map((branch) => ({
                                    value: String(branch.id),
                                    label: `${branch.branchName} (${branch.branchCode})`,
                                }))}
                                placeholder="Search and select branch..."
                                className="h-10 rounded-xl bg-background text-sm font-bold normal-case tracking-normal"
                            />
                        </FilterField>
                        <FilterField label="Search">
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search batch number..."
                                    className="h-10 rounded-xl bg-background pl-10 font-bold"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    autoFocus
                                />
                            </div>
                        </FilterField>
                    </div>
                }
            />

            <ConsolidationSection eyebrow="Active Work" title="Batches In Picking">
                {!selectedBranchId ? (
                    <ConsolidationEmptyState icon={Building2} title="Select Branch" description="Choose a branch to view its picking queue." />
                ) : loading ? (
                    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Loading picking batches">
                        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-48 rounded-xl" />)}
                    </div>
                ) : batches.length === 0 ? (
                    <ConsolidationEmptyState icon={ScanLine} title="No Picking Batches" description="Batches in Picking status will appear here." />
                ) : (
                    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {batches.map((batch) => {
                                const pct = progressPct(batch);
                                const picked = pickedTotal(batch);
                                const ordered = orderedTotal(batch);
                                return (
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        key={batch.id}
                                        onClick={() => handleBatchClick(batch)}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleBatchClick(batch); }}
                                        className="group rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 cursor-pointer"
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-sm font-black uppercase tracking-tight truncate">
                                                    {batch.consolidatorNo}
                                                </h3>
                                                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                                                    {batch.branchName || `Branch #${batch.branchId}`}
                                                </p>
                                            </div>
                                            <ConsolidationStatusBadge status="Picking" />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Progress</span>
                                                <span className="text-xs font-black tabular-nums">{picked}/{ordered}</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-blue-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>

                                        <div className="mt-4 flex items-center justify-between pt-2 border-t border-border/40">
                                            <span className="text-[10px] font-bold text-muted-foreground">
                                                {batch.invoices?.length || 0} invoice(s)
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    title="Print Warehouse Pick List"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePrintBatch(batch);
                                                    }}
                                                    disabled={printingBatchId === batch.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border/70 hover:border-primary/40 bg-muted/40 hover:bg-primary/10 text-muted-foreground hover:text-primary text-[10px] font-bold transition-all cursor-pointer"
                                                >
                                                    {printingBatchId === batch.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                                    ) : (
                                                        <Printer className="h-3 w-3 text-primary" />
                                                    )}
                                                    <span>Print</span>
                                                </button>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                                    Open &rarr;
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                        })}
                    </div>
                )}
            </ConsolidationSection>

            <PickingModal
                isOpen={isModalOpen}
                batch={selectedBatch}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedBatch(null);
                }}
                onSuccess={() => {
                    loadBatches();
                }}
            />
        </ConsolidationShell>
    );
}
