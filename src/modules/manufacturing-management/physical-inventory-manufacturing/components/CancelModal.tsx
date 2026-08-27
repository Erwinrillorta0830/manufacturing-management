"use client";

import React, { useState } from "react";
import { MmPhysicalInventorySheet } from "../types";
import { XCircle, AlertTriangle, X } from "lucide-react";

interface Props {
    isOpen: boolean;
    sheet: MmPhysicalInventorySheet | null;
    onClose: () => void;
    onConfirmCancel: (reason: string) => Promise<void>;
}

export default function CancelModal({
    isOpen,
    sheet,
    onClose,
    onConfirmCancel,
}: Props) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    React.useEffect(() => {
        if (isOpen) {
            setReason("");
            setError(null);
            setSubmitting(false);
        }
    }, [isOpen, sheet?.physical_inventory_id]);

    if (!isOpen || !sheet) return null;

    const handleCancel = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanReason = reason.trim();
        if (!cleanReason) {
            setError("Cancellation reason is required.");
            return;
        }

        try {
            setSubmitting(true);
            await onConfirmCancel(cleanReason);
            setReason("");
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to cancel physical inventory";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-rose-50 dark:bg-rose-950/40">
                    <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300">
                        <XCircle className="h-5 w-5" />
                        <h3 className="text-base font-bold">Cancel Physical Inventory #{sheet.pi_no}</h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleCancel} className="p-5 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                        Please provide a required reason for cancelling sheet <span className="font-mono font-bold text-foreground">{sheet.pi_no}</span>.
                    </p>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Cancellation Reason *</label>
                        <textarea
                            rows={3}
                            placeholder="State reason for cancelling count sheet..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            required
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent border rounded-lg transition-colors"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
                        >
                            {submitting ? "Cancelling..." : "Cancel Physical Inventory"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
