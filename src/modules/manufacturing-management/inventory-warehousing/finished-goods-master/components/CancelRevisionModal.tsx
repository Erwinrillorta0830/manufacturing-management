"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Undo2, X, Loader2, ShieldAlert } from "lucide-react";

export interface CancelRevisionModalProps {
    isOpen: boolean;
    onClose: () => void;
    versionName?: string;
    draftId?: number | null;
    onConfirm: (reason: string) => Promise<void>;
    isCancelling?: boolean;
}

export function CancelRevisionModal({
    isOpen,
    onClose,
    versionName,
    draftId,
    onConfirm,
    isCancelling = false
}: CancelRevisionModalProps) {
    const [reason, setReason] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onConfirm(reason.trim());
        setReason("");
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -6 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-w-md w-full"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-rose-500/10 dark:bg-rose-950/20">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground">
                                        Cancel Revision Draft
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground">
                                        {versionName ? `Target Version: ${versionName}` : "Abandon draft revision"}
                                        {draftId ? ` (Draft #${draftId})` : ""}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isCancelling}
                                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors cursor-pointer disabled:opacity-50"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Body Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
                            {/* Alert Notice */}
                            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-700 dark:text-rose-300">
                                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                                <div className="text-[11px] leading-relaxed">
                                    <p className="font-bold">Pending changes will be discarded.</p>
                                    <p className="mt-0.5 text-rose-600/90 dark:text-rose-400/90">
                                        The official production specification was never altered and will remain the active baseline. The draft revision will be marked <strong>Cancelled</strong> in the audit log.
                                    </p>
                                </div>
                            </div>

                            {/* Reason Input */}
                            <div className="space-y-1.5">
                                <label className="font-semibold text-foreground flex items-center justify-between">
                                    <span>Reason for Cancellation (Optional)</span>
                                    <span className="text-[10px] text-muted-foreground">Recorded in audit log</span>
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="e.g., Abandoned engineering formula adjustment, duplicate test draft..."
                                    rows={3}
                                    disabled={isCancelling}
                                    className="w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none transition-all"
                                />
                            </div>

                            {/* Footer CTA Buttons */}
                            <div className="flex justify-end gap-2.5 pt-2 border-t border-border/60 shrink-0">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isCancelling}
                                    className="px-3.5 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted text-foreground transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    Keep Editing
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCancelling}
                                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCancelling ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Undo2 className="h-3.5 w-3.5" />
                                    )}
                                    {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
