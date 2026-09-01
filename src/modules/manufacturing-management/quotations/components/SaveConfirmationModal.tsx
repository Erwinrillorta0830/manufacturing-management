import React from "react";
import { AlertTriangle, Lock, X } from "lucide-react";

export interface SaveConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isSaving: boolean;
}

export function SaveConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    isSaving
}: SaveConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Lock className="w-5 h-5 text-amber-500" />
                        Confirm Quotation Lock
                    </h3>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-6 space-y-4">
                    <div className="flex gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500">
                        <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                        <div className="text-sm font-medium">
                            Are you sure you want to lock and save this quotation snapshot? This will freeze the costs and simulated margins permanently for this revision.
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-border bg-muted/40 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-input bg-background hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all disabled:opacity-50"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Lock className="w-4 h-4" />
                                Lock & Save
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
