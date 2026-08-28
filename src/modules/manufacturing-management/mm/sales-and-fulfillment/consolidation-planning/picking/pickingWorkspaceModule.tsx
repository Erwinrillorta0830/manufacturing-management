"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { InvoiceConsolidation, PickingSavePayload } from "../types";
import { fetchConsolidationByNo, savePickedQuantities, completePicking } from "../services/invoice-consolidation-api";
import { usePickingModal } from "./hooks/usePickingModal";
import {
    Package, Minus, Plus, Save, SquarePen, AlertTriangle, Loader2, Keyboard, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    ConsolidationShell,
    ConsolidationStatusBadge,
} from "../../consolidation/shared/consolidation-ui";

interface PickingWorkspaceModuleProps {
    batchNo: string;
}

export default function PickingWorkspaceModule({ batchNo }: PickingWorkspaceModuleProps) {
    const router = useRouter();
    const [consolidation, setConsolidation] = useState<InvoiceConsolidation | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!batchNo) return;
        setLoading(true);
        fetchConsolidationByNo(batchNo)
            .then(setConsolidation)
            .catch(() => {
                toast.error("Failed to load consolidation");
                router.push("/mm/consolidation/picking");
            })
            .finally(() => setLoading(false));
    }, [batchNo, router]);

    const handleSaveQuantities = useCallback(async (payload: PickingSavePayload): Promise<boolean> => {
        setSubmitting(true);
        try {
            const result = await savePickedQuantities(payload);
            toast.success(result.message || "Quantities saved");
            const fresh = await fetchConsolidationByNo(batchNo);
            setConsolidation(fresh);
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to save quantities");
            return false;
        } finally {
            setSubmitting(false);
        }
    }, [batchNo]);

    const handleCompletePicking = useCallback(async (batchId: number): Promise<boolean> => {
        setSubmitting(true);
        try {
            const result = await completePicking(batchId);
            toast.success(result.message || "Picking completed");
            router.push("/mm/consolidation/picking");
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to complete picking");
            return false;
        } finally {
            setSubmitting(false);
        }
    }, [router]);

    const handleClose = useCallback(() => {
        router.push("/mm/consolidation/picking");
    }, [router]);

    const {
        localItems, hasChanges, editingDetailId, editValue,
        showCloseConfirm, saving,
        totals, validationErrors,
        stockReady, stockChecking, stockError, completionBlocked,
        setEditValue, setShowCloseConfirm,
        increment, decrement, startEdit, commitEdit, cancelEdit,
        handleSave, handleComplete,
    } = usePickingModal(consolidation, submitting, handleSaveQuantities, handleCompletePicking, handleClose);

    const focusNextRow = useCallback((currentDetailId: number) => {
        const allRows = document.querySelectorAll<HTMLElement>('[data-detail-id]');
        const idx = Array.from(allRows).findIndex(
            (el) => Number(el.dataset.detailId) === currentDetailId
        );
        if (idx === -1) return;
        if (idx < allRows.length - 1) {
            allRows[idx + 1]?.focus();
        } else {
            document.getElementById('picking-save-btn')?.focus();
        }
    }, []);

    const focusPrevRow = useCallback((currentDetailId: number) => {
        const allRows = document.querySelectorAll<HTMLElement>('[data-detail-id]');
        const idx = Array.from(allRows).findIndex(
            (el) => Number(el.dataset.detailId) === currentDetailId
        );
        if (idx > 0) {
            allRows[idx - 1]?.focus();
        }
    }, []);

    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [hasChanges]);

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
                Consolidation not found.
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
                        onClick={handleClose}
                        className="h-9 w-9 shrink-0 rounded-xl"
                        disabled={saving || submitting}
                        suppressHydrationWarning
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wide text-blue-600">Picking Workspace</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-sm font-black uppercase tracking-wide">
                                {consolidation.consolidatorNo}
                            </h1>
                            <ConsolidationStatusBadge status="Picking" />
                        </div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                            {consolidation.branchName || `Branch #${consolidation.branchId}`}
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="rounded-xl bg-muted/45 px-4 py-3 text-right">
                        <div className="text-2xl font-black leading-none text-blue-600 tabular-nums">
                            {totals.picked} <span className="text-sm text-muted-foreground/50">/ {totals.ordered}</span>
                        </div>
                        <p className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wide mt-0.5">Items Picked</p>
                    </div>
                    <div className="rounded-xl bg-muted/45 px-4 py-3 text-right">
                        <div className="text-2xl font-black leading-none tabular-nums">
                            {totals.short}
                        </div>
                        <p className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wide mt-0.5">Remaining</p>
                    </div>
                    <div className="rounded-xl bg-muted/45 px-4 py-3 text-right">
                        <div className="text-2xl font-black leading-none tabular-nums">{totals.pct.toFixed(0)}%</div>
                        <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Progress</p>
                    </div>
                </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted shadow-inner">
                    <motion.div className="h-full rounded-full bg-blue-500" initial={{ width: 0 }} animate={{ width: `${totals.pct}%` }} transition={{ ease: "circOut", duration: 0.5 }} />
                </div>
            </header>

            {/* Keyboard legend */}
            <div className="hidden flex-wrap items-center gap-3 rounded-xl border bg-card/70 px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-muted-foreground md:flex">
                <kbd className="rounded border border-border/40 bg-background px-1.5 py-0.5 font-mono text-[9px] font-black text-foreground">Tab</kbd>
                <span>Next product</span>
                <span className="text-muted-foreground/30">|</span>
                <kbd className="rounded border border-border/40 bg-background px-1.5 py-0.5 font-mono text-[9px] font-black text-foreground">Shift+Tab</kbd>
                <span>Previous product</span>
                <span className="text-muted-foreground/30">|</span>
                <kbd className="rounded border border-border/40 bg-background px-1.5 py-0.5 font-mono text-[9px] font-black text-foreground">Backspace</kbd>
                <span>Clear input</span>
                <span className="text-muted-foreground/30">|</span>
                <kbd className="rounded border border-border/40 bg-background px-1.5 py-0.5 font-mono text-[9px] font-black text-foreground">Esc</kbd>
                <span>Cancel edit</span>
                {validationErrors.size > 0 && (
                    <>
                        <span className="text-muted-foreground/30">|</span>
                        <span className="text-red-500 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                            Resolve stock discrepancies to complete
                        </span>
                    </>
                )}
                {!stockReady && !stockError && (
                    <>
                        <span className="text-muted-foreground/30">|</span>
                        <span className="flex items-center gap-1 text-blue-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Checking stock
                        </span>
                    </>
                )}
                {stockError && (
                    <>
                        <span className="text-muted-foreground/30">|</span>
                        <span className="flex items-center gap-1 text-red-500">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                            Stock check unavailable
                        </span>
                    </>
                )}
            </div>

            {/* Product list */}
            <section className="rounded-xl border bg-card shadow-sm">
                <div className="mx-auto space-y-3 p-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                            Products ({localItems.length})
                        </h2>
                        <span className={`text-[10px] font-bold ${hasChanges ? "text-amber-500" : "text-muted-foreground"}`}>
                            {hasChanges ? "Unsaved changes" : "All saved"}
                        </span>
                    </div>

                    {localItems.map((item) => {
                        const short = item.orderedQuantity - item.pickedQuantity;
                        const isComplete = item.pickedQuantity >= item.orderedQuantity;
                        const isEditing = editingDetailId === item.detailId;
                        const inputId = `pick-qty-${item.detailId}`;
                        const hasStockError = validationErrors.has(item.detailId);
                        return (
                            <div
                                key={item.detailId}
                                data-detail-id={item.detailId}
                                tabIndex={0}
                                role="button"
                                onFocus={() => startEdit(item)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !isEditing) {
                                        e.preventDefault();
                                        startEdit(item);
                                        setTimeout(() => document.getElementById(inputId)?.focus(), 0);
                                    }
                                }}
                                className={`rounded-xl border p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                                    isEditing ? "ring-2 ring-primary/30" : ""
                                } ${
                                    hasStockError
                                        ? "bg-red-500/5 border-red-500/40"
                                        : isComplete
                                        ? "bg-emerald-500/5 border-emerald-500/20"
                                        : "bg-card border-border hover:border-primary/30"
                                }`}
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-sm font-bold leading-tight truncate ${isComplete ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                            {item.productName || `Product #${item.productId}`}
                                        </h3>
                                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                            {item.productCode || `ID: ${item.productId}`}
                                        </p>
                                        {hasStockError && (
                                            <p className="text-[9px] font-bold text-red-500 mt-1 flex items-center gap-1">
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                                Stock discrepancy
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-[auto_1fr_auto_auto] items-end gap-3 sm:flex sm:shrink-0 sm:items-center">
                                        <div className="text-right">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Ordered</p>
                                            <p className="text-sm font-black text-foreground">{item.orderedQuantity}</p>
                                        </div>

                                        <div className="text-center">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Picked</p>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    tabIndex={-1}
                                                    onClick={() => decrement(item.detailId)}
                                                    disabled={item.pickedQuantity <= 0 || saving || submitting}
                                                    className="h-7 w-7 rounded-md border border-input flex items-center justify-center hover:bg-muted transition-colors cursor-pointer disabled:opacity-30"
                                                    suppressHydrationWarning
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>

                                                {isEditing ? (
                                                    <input
                                                        id={inputId}
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onFocus={(e) => e.target.select()}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Backspace") {
                                                                setEditValue("");
                                                            } else if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                commitEdit();
                                                                focusNextRow(item.detailId);
                                                            } else if (e.key === "Tab" && e.shiftKey) {
                                                                e.preventDefault();
                                                                cancelEdit();
                                                                focusPrevRow(item.detailId);
                                                            } else if (e.key === "Tab") {
                                                                e.preventDefault();
                                                                cancelEdit();
                                                                focusNextRow(item.detailId);
                                                            } else if (e.key === "Escape") {
                                                                cancelEdit();
                                                                (e.currentTarget.closest('[data-detail-id]') as HTMLElement)?.focus();
                                                            }
                                                        }}
                                                        className="w-14 text-center border border-input rounded-md px-1 py-1 text-xs font-bold"
                                                        autoFocus
                                                        suppressHydrationWarning
                                                    />
                                                ) : (
                                                    <span
                                                        className="w-14 inline-block text-center text-sm font-black text-foreground py-1 select-none"
                                                    >
                                                        {item.pickedQuantity}
                                                    </span>
                                                )}

                                                <button
                                                    tabIndex={-1}
                                                    onClick={() => increment(item.detailId)}
                                                    disabled={item.pickedQuantity >= item.orderedQuantity || saving || submitting}
                                                    className="h-7 w-7 rounded-md border border-input flex items-center justify-center hover:bg-muted transition-colors cursor-pointer disabled:opacity-30"
                                                    suppressHydrationWarning
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Short</p>
                                            <p className={`text-sm font-black ${short > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                                                {short}
                                            </p>
                                        </div>

                                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                            hasStockError
                                                ? "bg-red-500/10"
                                                : isComplete
                                                ? "bg-emerald-500/10"
                                                : "bg-muted/30"
                                        }`}>
                                            {hasStockError ? (
                                                <span className="text-[8px] font-black text-red-500 leading-none text-center px-0.5">!</span>
                                            ) : isComplete ? (
                                                <Package className="h-4 w-4 text-emerald-500" />
                                            ) : (
                                                <Keyboard className="h-4 w-4 text-muted-foreground/50" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Footer */}
            <footer className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-[1544px] flex-col gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between md:inset-x-8">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                        Progress: <strong className="text-foreground">{totals.pct.toFixed(0)}%</strong>
                    </span>
                    <span>
                        Short: <strong className={totals.short > 0 ? "text-amber-500" : "text-foreground"}>{totals.short}</strong>
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <Button
                        id="picking-save-btn"
                        variant="outline"
                        onClick={handleSave}
                        disabled={!hasChanges || saving || submitting || editingDetailId != null}
                        className="flex items-center gap-1.5 text-xs font-bold"
                        suppressHydrationWarning
                    >
                        {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Save
                    </Button>
                    <Button
                        onClick={handleComplete}
                        disabled={saving || submitting || completionBlocked || totals.short > 0}
                        className="flex items-center gap-1.5 bg-violet-600 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40"
                        suppressHydrationWarning
                    >
                        {saving || stockChecking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <SquarePen className="h-3.5 w-3.5" />
                        )}
                        Complete Picking
                    </Button>
                </div>
            </footer>

            {/* Close confirmation */}
            <AnimatePresence>
                {showCloseConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground">Unsaved Changes</h3>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        You have unsaved quantity changes. Save before closing?
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowCloseConfirm(false)}
                                    className="text-xs font-bold"
                                    suppressHydrationWarning
                                >
                                    Continue Editing
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleClose}
                                    className="text-xs font-bold"
                                    suppressHydrationWarning
                                >
                                    Discard & Close
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </ConsolidationShell>
    );
}
