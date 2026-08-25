"use client";

import React, { useState } from "react";
import { MmPhysicalInventorySheet } from "../types";
import { formatQty, formatMoney } from "./PhysicalInventoryList";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

interface Props {
    isOpen: boolean;
    sheet: MmPhysicalInventorySheet | null;
    onClose: () => void;
    onConfirmCommit: () => Promise<void>;
}

export default function CommitConfirmationModal({
    isOpen,
    sheet,
    onClose,
    onConfirmCommit,
}: Props) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen || !sheet) return null;

    const handleCommit = async () => {
        try {
            setSubmitting(true);
            setError(null);
            await onConfirmCommit();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to commit physical inventory";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-emerald-50 dark:bg-emerald-950/40">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="h-5 w-5" />
                        <h3 className="text-base font-bold">Commit Physical Inventory #{sheet.pi_no}</h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                        You are about to finalize and commit physical inventory document <span className="font-mono font-bold text-foreground">{sheet.pi_no}</span>.
                    </p>

                    <div className="bg-muted/40 p-3 rounded-lg border text-xs space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Stock Count Type:</span>
                            <span className="font-semibold">{sheet.stock_type}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Line Items:</span>
                            <span className="font-semibold">{sheet.details?.length || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total System Quantity:</span>
                            <span className="font-mono font-semibold">{formatQty(sheet.total_system_quantity)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Physical Quantity:</span>
                            <span className="font-mono font-semibold">{formatQty(sheet.total_physical_quantity)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Variance:</span>
                            <span className="font-mono font-bold text-emerald-600">{formatQty(sheet.total_variance)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                            <span className="text-muted-foreground font-semibold">Total Difference Cost:</span>
                            <span className="font-mono font-bold text-foreground">{formatMoney(sheet.total_difference_cost)}</span>
                        </div>
                    </div>

                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-300">
                        <span className="font-bold">Notice:</span> Once committed, stock movements will be automatically posted to on-hand ledgers. Committed records cannot be edited or deleted.
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent border rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleCommit}
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
                        >
                            {submitting ? "Committing..." : "Confirm & Commit"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
