"use client";

import React from "react";
import { X } from "lucide-react";
import { PurchaseAmountAuditView } from "./PostedPOLedgerTable";

interface PurchaseAmountAuditModalProps {
    isOpen: boolean;
    purchaseOrderId: number | null;
    onClose: () => void;
}

export default function PurchaseAmountAuditModal({
    isOpen,
    purchaseOrderId,
    onClose
}: PurchaseAmountAuditModalProps) {
    if (!isOpen || !purchaseOrderId) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-black tracking-tight text-foreground">
                            Posted Landed Cost Audit Ledger
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Audited general ledger mappings, valuation adjustments, and printables.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close audit modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <PurchaseAmountAuditView purchaseOrderId={purchaseOrderId} onBack={onClose} />
                </div>
            </div>
        </div>
    );
}
