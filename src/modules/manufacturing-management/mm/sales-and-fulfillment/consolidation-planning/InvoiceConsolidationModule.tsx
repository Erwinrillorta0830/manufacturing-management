"use client";

import React, { useEffect, useCallback } from "react";
import { useInvoiceConsolidation } from "./hooks/useInvoiceConsolidation";
import CreateConsolidationModal from "./components/CreateConsolidationModal";
import ConsolidationDetailSheet from "./components/ConsolidationDetailSheet";
import {
    Package,
    ClipboardCheck,
    Plus,
    Loader2,
    Search,

    Play,
    SquarePen,
    AlertTriangle,
    Building2,
    Layers,
    ListOrdered,
    ArrowUpRight,
    RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    ConsolidationEmptyState,
    ConsolidationHeader,
    ConsolidationSection,
    ConsolidationShell,
    ConsolidationStatusBadge,
    FilterField,
} from "../consolidation/shared/consolidation-ui";
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

type ConfirmAction = "revert" | "audit" | "start-picking" | null;

export default function InvoiceConsolidationModule() {
    const {
        consolidations,
        summary,
        candidates,
        branches,
        selectedBranch,
        loading,
        submitting,
        page,
        totalPages,
        statusFilter,
        searchQuery,
        branchId,
        selectedConsolidation,
        showCreateModal,
        setPage,
        setStatusFilter,
        setSearchQuery,
        handleBranchChange,
        setSelectedConsolidation,
        setShowCreateModal,
        handleCreate,
        handleAudit,
        handleRevert,
        handleStartPicking,
        loadCandidates,
        openDetail,
    } = useInvoiceConsolidation();

    const [expandedId, setExpandedId] = React.useState<number | null>(null);
    const [confirmAction, setConfirmAction] = React.useState<{ type: ConfirmAction; batchId: number } | null>(null);

    useEffect(() => {
        if (showCreateModal && branchId) {
            loadCandidates(branchId);
        }
    }, [showCreateModal, loadCandidates, branchId]);

    const toggleExpand = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setExpandedId(expandedId === id ? null : id);
    };

    const handleRowClick = (c: typeof consolidations[number]) => {
        openDetail(c);
    };

    const handleRowKeyDown = (e: React.KeyboardEvent, c: typeof consolidations[number]) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick(c);
        }
    };

    const executeConfirmed = useCallback(async () => {
        if (!confirmAction) return;
        const { type, batchId } = confirmAction;
        setConfirmAction(null);
        if (type === "audit") {
            await handleAudit(batchId);
        } else if (type === "revert") {
            await handleRevert(batchId);
        } else if (type === "start-picking") {
            await handleStartPicking(batchId);
        }
    }, [confirmAction, handleAudit, handleRevert, handleStartPicking]);

    const summaryCards = [
        { label: "All", value: summary.All, color: "text-zinc-400", icon: <ListOrdered className="h-4 w-4" /> },
        { label: "Pending", value: summary.Pending, color: "bg-amber-500/10 border-amber-500/20 text-amber-500", icon: <Package className="h-5 w-5" /> },
        { label: "Picking", value: summary.Picking, color: "bg-blue-500/10 border-blue-500/20 text-blue-500", icon: <Play className="h-5 w-5" /> },
        { label: "Picked", value: summary.Picked, color: "text-violet-600", icon: <SquarePen className="h-5 w-5" /> },
        { label: "Audited", value: summary.Audited, color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500", icon: <ClipboardCheck className="h-5 w-5" /> },
    ];

    const dashboardHeader = (
        <ConsolidationHeader
            icon={Layers}
            eyebrow="Batch Operations"
            title="Consolidation"
            accent="Creation"
            description="Create and manage invoice consolidation batches for each branch."
            controls={
                <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-[240px_240px_auto]">
                    <FilterField label="Branch">
                        <SearchableSelect
                        value={selectedBranch ? String(selectedBranch.id) : ""}
                        onValueChange={(value) => {
                            const branch = branches.find((item) => item.id === Number(value));
                            handleBranchChange(branch ?? null);
                        }}
                        options={branches.map((branch) => ({
                            value: String(branch.id),
                            label: `${branch.branchName} (${branch.branchCode})`,
                        }))}
                        placeholder="Search and select branch..."
                            className="h-10 rounded-xl bg-background text-sm font-bold normal-case tracking-normal"
                        />
                    </FilterField>
                    <FilterField label="Search batches">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={!selectedBranch} placeholder="Batch or invoice number..." className="h-10 rounded-xl pl-9" />
                        </div>
                    </FilterField>
                    <Button
                    onClick={() => setShowCreateModal(true)}
                    disabled={!selectedBranch}
                    className="h-10 self-end rounded-xl px-5 font-black uppercase tracking-wider"
                    ><Plus />Create Batch</Button>
                </div>
            }
        />
    );

    const statusOverview = (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {summaryCards.map((card) => {
                const active = statusFilter === card.label;
                return (
                    <button
                        key={card.label}
                        type="button"
                        onClick={() => {
                            setStatusFilter(card.label);
                            setPage(0);
                        }}
                        disabled={!selectedBranch}
                        className={cn(
                            "group relative overflow-hidden rounded-xl border bg-card p-4 text-left shadow-sm transition-colors",
                            active
                                ? "ring-2 ring-primary/30"
                                : "hover:border-primary/30",
                            !selectedBranch && "pointer-events-none opacity-60"
                        )}
                    >
                        {card.label !== "All" && <div className={cn("absolute inset-x-0 bottom-0 h-1", card.label === "Pending" ? "bg-amber-500" : card.label === "Picking" ? "bg-blue-500" : card.label === "Picked" ? "bg-violet-500" : "bg-emerald-500")} />}
                        <div className="flex items-center justify-between">
                            <div className={cn("rounded-lg bg-muted/50 p-2 transition-transform group-hover:rotate-12", active && "rotate-6 bg-primary text-primary-foreground", !active && card.color)}>
                                {card.icon}
                            </div>
                            {active && <ArrowUpRight className="h-3 w-3 text-primary" />}
                        </div>
                        <p className={cn("mt-3 text-[9px] font-black uppercase tracking-[0.2em]", active ? "text-primary" : "text-muted-foreground/50")}>{card.label}</p>
                        <div className="flex items-baseline gap-1">
                            <strong className="text-2xl font-black tracking-tighter tabular-nums">{selectedBranch ? card.value : 0}</strong>
                            <span className="hidden text-[8px] font-bold uppercase text-muted-foreground/40 sm:inline">Batches</span>
                        </div>
                    </button>
                );
            })}
        </div>
    );

    const confirmLabels: Record<string, { title: string; description: string }> = {
        audit: { title: "Audit this batch?", description: "This will mark the batch as audited and dispatch all linked invoices." },
        revert: { title: "Revert this batch?", description: "This will reset the batch to Pending status and undispatch all linked invoices." },
        "start-picking": { title: "Start picking this batch?", description: "This will move the batch to Picking status so quantities can be recorded." },
    };

    if (!selectedBranch) {
        return (
            <ConsolidationShell>
                {dashboardHeader}
                <section className="rounded-xl border border-dashed bg-card/50"><ConsolidationEmptyState icon={Building2} title="Select a branch" description="Choose a branch to view and create consolidation batches." /></section>

                {selectedBranch && (
                    <CreateConsolidationModal
                        key={`create-modal-${showCreateModal}`}
                        isOpen={showCreateModal}
                        onClose={() => setShowCreateModal(false)}
                        branch={selectedBranch}
                        candidates={candidates}
                        loading={loading}
                        onSubmit={handleCreate}
                    />
                )}
            </ConsolidationShell>
        );
    }

    return (
        <ConsolidationShell>
            {dashboardHeader}
            {statusOverview}

            {/* Confirmation Dialog */}
            <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
                <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <AlertDialogTitle className="text-sm font-bold">{confirmAction ? confirmLabels[confirmAction.type as Exclude<ConfirmAction, null>]?.title : ""}</AlertDialogTitle>
                                <AlertDialogDescription className="text-[11px] mt-0.5">{confirmAction ? confirmLabels[confirmAction.type as Exclude<ConfirmAction, null>]?.description : ""}</AlertDialogDescription>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction disabled={submitting} onClick={executeConfirmed}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Main Table */}
            <ConsolidationSection eyebrow="Batch Register" title="Consolidation Batches" className="relative min-h-[420px]" >
                {loading && (
                        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-background/70 backdrop-blur-sm">
                            <div className="rounded-xl border bg-card p-5 shadow-2xl"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
                            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> Syncing Consolidations</div>
                        </div>
                )}

                {consolidations.length === 0 && !loading ? (
                    <ConsolidationEmptyState icon={Package} title="No Consolidation Batches" description={<>Click &quot;Create Batch&quot; to create an invoice consolidation batch for <strong>{selectedBranch.branchName}</strong>.</>} />
                ) : (
                    <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
                        <Table className="min-w-[760px]">
                            <TableHeader className="sticky top-0 z-10 bg-muted/80"><TableRow><TableHead className="pl-5 md:pl-7">Batch</TableHead><TableHead>Branch</TableHead><TableHead>Invoices</TableHead><TableHead className="text-right">Total Amount</TableHead><TableHead>Created</TableHead><TableHead className="pr-5 text-center md:pr-7">Status</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {consolidations.map((c) => (
                                    <React.Fragment key={c.id}>
                                        <TableRow
                                            onClick={() => handleRowClick(c)}
                                            onKeyDown={(e) => handleRowKeyDown(e, c)}
                                            tabIndex={0}
                                            className="group cursor-pointer border-border/30 transition-all hover:bg-primary/[0.02] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
                                        >
                                             <TableCell className="pl-5 font-mono font-black md:pl-7">{c.consolidatorNo}</TableCell>
                                            <TableCell className="text-muted-foreground">{c.branchName || selectedBranch.branchName}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                <button
                                                    onClick={(e) => toggleExpand(e, c.id)}
                                                    className="text-primary font-semibold hover:underline cursor-pointer"
                                                    suppressHydrationWarning
                                                >
                                                    {c.invoices?.length || 0} invoice(s)
                                                </button>
                                            </TableCell>
                                            <TableCell className="text-right font-black tabular-nums">
                                                P{Number(c.totalSalesOrderAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                                            </TableCell>
                                            <TableCell className="pr-5 text-center md:pr-7"><ConsolidationStatusBadge status={c.status} /></TableCell>
                                        </TableRow>
                                        {expandedId === c.id && (
                                            <tr className="bg-muted/5">
                                                <td colSpan={6} className="p-0">
                                                    <table className="w-full text-left border-collapse text-[10px]">
                                                        <thead>
                                                            <tr className="border-t border-b bg-muted/10">
                                                                <th className="p-2 pl-12 font-semibold text-muted-foreground uppercase">Invoice No</th>
                                                                <th className="p-2 font-semibold text-muted-foreground uppercase">Invoice ID</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {c.invoices?.map((inv) => (
                                                                <tr key={inv.id} className="border-b border-muted/5">
                                                                    <td className="p-2 pl-12 font-medium text-foreground">{inv.invoiceNo}</td>
                                                                    <td className="p-2 text-muted-foreground">#{inv.invoiceId}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* Pagination */}
                <div className="flex shrink-0 flex-col items-center justify-between gap-4 border-t bg-muted/30 px-4 py-4 sm:flex-row sm:px-8">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                            Page {page + 1} of {Math.max(1, totalPages)} <span className="mx-2 opacity-20">|</span> {summary.All} Total Entries
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm"
                                onClick={() => setPage(Math.max(0, page - 1))}
                                disabled={page === 0}
                            >
                                Previous
                            </Button>
                            <Button variant="outline" size="sm"
                                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                                disabled={page >= totalPages - 1}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
            </ConsolidationSection>

            <ConsolidationDetailSheet
                consolidation={selectedConsolidation}
                submitting={submitting}
                onClose={() => setSelectedConsolidation(null)}
                onRequestAction={(type, batchId) => setConfirmAction({ type, batchId })}
            />

            {/* Create Modal */}
            {selectedBranch && (
                <CreateConsolidationModal
                    key={`create-modal-${showCreateModal}`}
                    isOpen={showCreateModal}
                    onClose={() => setShowCreateModal(false)}
                    branch={selectedBranch}
                    candidates={candidates}
                    loading={loading}
                    onSubmit={handleCreate}
                />
            )}

        </ConsolidationShell>
    );
}
