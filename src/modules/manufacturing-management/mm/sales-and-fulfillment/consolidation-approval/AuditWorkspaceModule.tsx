"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    CheckCircle2, AlertTriangle, ArrowLeft, Loader2, ClipboardCheck,
    ShieldCheck, RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConsolidationShell, ConsolidationStatusBadge } from "../shared/consolidation-ui";
import { InvoiceConsolidation } from "../../invoice-consolidation/types";
import {
    fetchConsolidationByNo,
    auditBatch,
    repickBatch,
} from "../../invoice-consolidation/services/invoice-consolidation-api";

interface AuditWorkspaceModuleProps {
    batchNo: string;
}

export default function AuditWorkspaceModule({ batchNo }: AuditWorkspaceModuleProps) {
    const router = useRouter();
    const [consolidation, setConsolidation] = useState<InvoiceConsolidation | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [auditStatus, setAuditStatus] = useState<Record<number, boolean>>({});
    const [showConfirm, setShowConfirm] = useState(false);
    const [showRepickConfirm, setShowRepickConfirm] = useState(false);

    useEffect(() => {
        if (!batchNo) return;
        setLoading(true);
        fetchConsolidationByNo(batchNo)
            .then(setConsolidation)
            .catch(() => {
                toast.error("Failed to load batch");
                router.push("/mm/consolidation/auditing");
            })
            .finally(() => setLoading(false));
    }, [batchNo, router]);

    const handleToggleAudit = useCallback((detailId: number) => {
        setAuditStatus((prev) => {
            if (prev[detailId]) {
                const next = { ...prev };
                delete next[detailId];
                return next;
            }
            return { ...prev, [detailId]: true };
        });
    }, []);

    const details = consolidation?.details || [];
    const auditedCount = Object.keys(auditStatus).length;
    const totalItems = details.length;
    const progressPercent = totalItems > 0 ? (auditedCount / totalItems) * 100 : 0;
    const isComplete = auditedCount === totalItems && totalItems > 0;

    const handleFinalize = async () => {
        if (!consolidation) return;
        setSubmitting(true);
        try {
            const result = await auditBatch({ batchId: consolidation.id });
            toast.success(result.message || "Batch audited successfully");
            router.push("/mm/consolidation/auditing");
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to audit batch");
        } finally {
            setSubmitting(false);
            setShowConfirm(false);
        }
    };

    const handleRepick = async () => {
        if (!consolidation) return;
        setSubmitting(true);
        try {
            const result = await repickBatch(consolidation.id);
            toast.success(result.message || "Batch returned to picking floor");
            router.push("/mm/consolidation/picking");
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to re-pick batch");
        } finally {
            setSubmitting(false);
            setShowRepickConfirm(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!consolidation) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Batch not found.
            </div>
        );
    }

    return (
        <ConsolidationShell className="flex-1 overflow-y-auto pb-28">
            <header className="rounded-xl border bg-card shadow-sm">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => router.push("/mm/consolidation/auditing")}
                        className="h-9 w-9 shrink-0 rounded-xl"
                        disabled={submitting}
                        suppressHydrationWarning
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wide text-violet-600">Audit Workspace</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-sm font-black uppercase tracking-wide">
                                {consolidation.consolidatorNo}
                            </h1>
                            <ConsolidationStatusBadge status="Picked" />
                        </div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                            {consolidation.branchName || `Branch #${consolidation.branchId}`}
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/45 px-4 py-3 text-right">
                        <div className="text-2xl font-black leading-none text-emerald-600 tabular-nums">
                            {auditedCount} <span className="text-sm text-muted-foreground/50">/ {totalItems}</span>
                        </div>
                        <p className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wide mt-0.5">Audited SKUs</p>
                    </div>
                    <div className="rounded-xl bg-muted/45 px-4 py-3 text-right"><div className="text-2xl font-black leading-none tabular-nums">{progressPercent.toFixed(0)}%</div><p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Progress</p></div>
                </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted shadow-inner"><motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ ease: "circOut", duration: 0.5 }} /></div>
            </header>

            <section className="rounded-xl border bg-card shadow-sm">
                <div className="mx-auto space-y-3 p-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                            Products to Verify ({totalItems})
                        </h2>
                        <span className="text-[10px] font-bold text-muted-foreground">
                            {isComplete ? "All verified" : `${totalItems - auditedCount} remaining`}
                        </span>
                    </div>

                    {details.map((d) => {
                        const isAudited = !!auditStatus[d.id];
                        const short = d.orderedQuantity - d.pickedQuantity;
                        return (
                            <div
                                key={d.id}
                                onClick={() => handleToggleAudit(d.id)}
                                className={`rounded-xl border p-4 transition-all cursor-pointer ${
                                    isAudited
                                        ? "bg-emerald-500/5 border-emerald-500/30"
                                        : "bg-card border-border hover:border-blue-500/30 hover:shadow-sm"
                                }`}
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-sm font-bold leading-tight truncate ${isAudited ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                            {d.productName || `Product #${d.productId}`}
                                        </h3>
                                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                            {d.productCode || `ID: ${d.productId}`}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between gap-5 sm:shrink-0 sm:justify-start">
                                        <div className="text-right">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Ordered</p>
                                            <p className="text-sm font-black text-foreground">{d.orderedQuantity}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Picked</p>
                                            <p className="text-sm font-black text-foreground">{d.pickedQuantity}</p>
                                        </div>
                                        {short > 0 && (
                                            <div className="text-right">
                                                <p className="text-[9px] font-bold text-muted-foreground uppercase">Short</p>
                                                <p className="text-sm font-black text-amber-500">{short}</p>
                                            </div>
                                        )}
                                        <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
                                            isAudited ? "bg-emerald-500/10" : "bg-muted/30"
                                        }`}>
                                            {isAudited ? (
                                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                            ) : (
                                                <ClipboardCheck className="h-5 w-5 text-muted-foreground/50" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <footer className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-[1544px] flex-col gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between md:inset-x-8">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                        Verified: <strong className={isComplete ? "text-emerald-500" : "text-foreground"}>{auditedCount}/{totalItems}</strong>
                    </span>
                    {!isComplete && totalItems > 0 && (
                        <span className="text-muted-foreground/60">
                            Click items to mark as verified
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <Button
                        variant="outline"
                        onClick={() => setShowRepickConfirm(true)}
                        disabled={submitting}
                        className="col-span-2 flex items-center gap-1.5 border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/5 sm:col-span-1"
                        suppressHydrationWarning
                    >
                        {submitting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCcw className="h-3.5 w-3.5" />
                        )}
                        Return to Picker
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => router.push("/mm/consolidation/auditing")}
                        disabled={submitting}
                        className="text-xs font-bold"
                        suppressHydrationWarning
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => setShowConfirm(true)}
                        disabled={!isComplete || submitting}
                        className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                        suppressHydrationWarning
                    >
                        {submitting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        Finalize Audit
                    </Button>
                </div>
            </footer>

            {showRepickConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                <RefreshCcw className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Re-pick this batch?</h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {consolidation.consolidatorNo} will be returned to Picking status. Inventory will be restored and picked quantities cleared.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-medium text-amber-600">
                                All current picking data will be cleared. The batch must be picked again from scratch.
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowRepickConfirm(false)}
                                className="text-xs font-bold"
                                suppressHydrationWarning
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleRepick}
                                disabled={submitting}
                                className="bg-amber-600 text-xs font-bold text-white hover:bg-amber-700"
                                suppressHydrationWarning
                            >
                                {submitting ? "Processing..." : "Confirm Re-pick"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {showConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Finalize Audit?</h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {consolidation.consolidatorNo} will be marked as Audited and all linked invoices will be dispatched.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowConfirm(false)}
                                className="text-xs font-bold"
                                suppressHydrationWarning
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleFinalize}
                                disabled={submitting}
                                className="bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                                suppressHydrationWarning
                            >
                                {submitting ? "Processing..." : "Confirm Audit"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </ConsolidationShell>
    );
}
