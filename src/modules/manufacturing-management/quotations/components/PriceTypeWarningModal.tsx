import React from "react";
import { AlertTriangle, AlertCircle, X } from "lucide-react";

export interface PriceTypeWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function PriceTypeWarningModal({
    isOpen,
    onClose,
    onConfirm
}: PriceTypeWarningModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                        Warning: Override Active Grid?
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-6 space-y-4">
                    <div className="flex gap-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-500">
                        <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                        <div className="text-sm font-medium">
                            Are you sure you want to change the Base Price Type Template? This will override and recalculate the Standard Price for all currently selected products in your draft.
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-border bg-muted/40 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-input bg-background hover:bg-muted text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-rose-500 hover:bg-rose-500/90 text-white shadow-md transition-all"
                    >
                        Change Template
                    </button>
                </div>
            </div>
        </div>
    );
}
