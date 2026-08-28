"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, ShieldCheck, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { InvoiceConsolidation, Branch } from "../../invoice-consolidation/types";
import { fetchConsolidations, fetchBranches } from "../../invoice-consolidation/services/invoice-consolidation-api";
import {
    ConsolidationEmptyState,
    ConsolidationHeader,
    ConsolidationSection,
    ConsolidationShell,
    ConsolidationStatusBadge,
    FilterField,
} from "../shared/consolidation-ui";

export default function AuditQueueModule() {
    const router = useRouter();
    const [batches, setBatches] = useState<InvoiceConsolidation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<number | undefined>(undefined);
    const [debouncedSearch, setDebouncedSearch] = useState("");

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
            const res = await fetchConsolidations({
                branchId: selectedBranchId,
                page: 0,
                size: 50,
                status: "Picked",
                search: debouncedSearch,
            });
            setBatches(res.content || []);
        } catch {
            console.error("Failed to load audit batches");
        } finally {
            setLoading(false);
        }
    }, [selectedBranchId, debouncedSearch]);

    useEffect(() => {
        loadBatches();
    }, [loadBatches]);

    const handleBatchClick = (batch: InvoiceConsolidation) => {
        router.push(`/mm/consolidation/auditing/${encodeURIComponent(batch.consolidatorNo)}`);
    };

    const progressPct = (batch: InvoiceConsolidation) => {
        const ordered = batch.details?.reduce((s, d) => s + d.orderedQuantity, 0) || 0;
        const picked = batch.details?.reduce((s, d) => s + d.pickedQuantity, 0) || 0;
        return ordered > 0 ? (picked / ordered) * 100 : 0;
    };

    const pickedTotal = (batch: InvoiceConsolidation) => batch.details?.reduce((s, d) => s + d.pickedQuantity, 0) || 0;
    const orderedTotal = (batch: InvoiceConsolidation) => batch.details?.reduce((s, d) => s + d.orderedQuantity, 0) || 0;
    const productCount = (batch: InvoiceConsolidation) => batch.details?.length || 0;

    return (
        <ConsolidationShell>
            <ConsolidationHeader
                icon={ShieldCheck}
                eyebrow="Consolidation Operations"
                title="Audit"
                accent="Queue"
                description="Review and audit batches that have completed picking."
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
                                <Input placeholder="Search picked batches..." className="h-10 rounded-xl bg-background pl-10 font-bold" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                            </div>
                        </FilterField>
                    </div>
                }
            />

            <ConsolidationSection eyebrow="Quality Review" title="Batches Pending Audit">
                {!selectedBranchId ? (
                    <ConsolidationEmptyState icon={Building2} title="Select Branch" description="Choose a branch to view its audit queue." />
                ) : loading ? (
                    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Loading audit batches">
                        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-48 rounded-xl" />)}
                    </div>
                ) : batches.length === 0 ? (
                    <ConsolidationEmptyState icon={ShieldCheck} title="No Batches Pending Audit" description="Batches in Picked status will appear here." />
                ) : (
                    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {batches.map((batch) => {
                                const pct = progressPct(batch);
                                const picked = pickedTotal(batch);
                                const ordered = orderedTotal(batch);
                                return (
                                    <button
                                        type="button"
                                        key={batch.id}
                                        onClick={() => handleBatchClick(batch)}
                                        className="group rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30"
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
                                            <ConsolidationStatusBadge status="Picked" />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Picked Items</span>
                                                <span className="text-xs font-black tabular-nums">{picked}/{ordered}</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-violet-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>

                                        <div className="mt-4 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-muted-foreground">
                                                {batch.invoices?.length || 0} invoice(s) &middot; {productCount(batch)} product(s)
                                            </span>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-violet-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                                Audit &rarr;
                                            </span>
                                        </div>
                                    </button>
                                );
                        })}
                    </div>
                )}
            </ConsolidationSection>
        </ConsolidationShell>
    );
}
