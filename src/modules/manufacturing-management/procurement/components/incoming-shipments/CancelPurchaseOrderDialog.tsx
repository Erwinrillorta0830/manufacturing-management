"use client";

import React, { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const DEFAULT_PURCHASE_ORDER_CANCELLATION_REMARKS = "Purchase order cancelled from Revision.";

export interface CancelPurchaseOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    purchaseOrderNo: string;
    supplierName: string;
    branchName?: string | null;
    totalLabel?: string | null;
    stageLabel?: string | null;
    reasonMode?: "input" | "summary";
    reasonText?: string | null;
    loading?: boolean;
    onConfirm: (remarks: string) => Promise<boolean>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 text-xs">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate font-semibold text-foreground" title={value}>{value}</span>
        </div>
    );
}

function CancelPurchaseOrderDialogBody({
    purchaseOrderNo,
    supplierName,
    branchName = null,
    totalLabel = null,
    stageLabel = "Finance",
    reasonMode = "input",
    reasonText = null,
    loading = false,
    onConfirm,
    onOpenChange
}: Omit<CancelPurchaseOrderDialogProps, "open">) {
    const [reason, setReason] = useState("");
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleConfirm = async (event: React.FormEvent) => {
        event.preventDefault();
        if (loading) return;
        setSubmitError(null);
        const suppliedReason = reasonMode === "summary" ? (reasonText || "") : reason;
        const remarks = suppliedReason.trim() || DEFAULT_PURCHASE_ORDER_CANCELLATION_REMARKS;
        const succeeded = await onConfirm(remarks);
        if (succeeded) {
            onOpenChange(false);
            return;
        }
        setSubmitError("The purchase order could not be cancelled. It may have changed — reload it and try again.");
    };

    return (
        <form onSubmit={handleConfirm}>
            <DialogHeader>
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                    <DialogTitle className="text-base font-black tracking-tight text-destructive">
                        Cancel Purchase Order {purchaseOrderNo}?
                    </DialogTitle>
                </div>
                <DialogDescription className="text-xs">
                    This marks the purchase order as Cancelled. This action cannot be undone.
                </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-2.5 rounded-xl border bg-muted/20 p-3">
                <SummaryRow label="Supplier" value={supplierName} />
                {branchName && <SummaryRow label="Branch" value={branchName} />}
                {totalLabel && <SummaryRow label="Total (PHP)" value={totalLabel} />}
                {stageLabel && <SummaryRow label="Decision stage" value={stageLabel} />}
            </div>

            {reasonMode === "input" ? (
                <div className="mt-4 space-y-2">
                    <Label htmlFor="purchase-order-cancellation-reason" className="text-xs font-semibold">
                        Cancellation reason (optional)
                    </Label>
                    <Textarea
                        id="purchase-order-cancellation-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={DEFAULT_PURCHASE_ORDER_CANCELLATION_REMARKS}
                        maxLength={2000}
                        className="min-h-20 resize-y bg-background text-xs"
                        disabled={loading}
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Leave blank to use the default cancellation note.
                    </p>
                </div>
            ) : (
                <div className="mt-4 space-y-1.5">
                    <Label className="text-xs font-semibold">Cancellation reason</Label>
                    <div className="min-h-16 whitespace-pre-wrap break-words rounded-md border bg-background p-3 text-xs text-foreground">
                        {reasonText?.trim() || DEFAULT_PURCHASE_ORDER_CANCELLATION_REMARKS}
                    </div>
                </div>
            )}

            {submitError && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] font-semibold text-destructive" role="alert">
                    {submitError}
                </p>
            )}

            <DialogFooter className="mt-5 gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                    Keep Purchase Order
                </Button>
                <Button type="submit" variant="destructive" disabled={loading}>
                    {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    {loading ? "Cancelling..." : "Cancel Purchase Order"}
                </Button>
            </DialogFooter>
        </form>
    );
}

export function CancelPurchaseOrderDialog({ open, onOpenChange, loading = false, ...bodyProps }: CancelPurchaseOrderDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!loading) onOpenChange(nextOpen); }}>
            <DialogContent className="sm:max-w-[480px]">
                <CancelPurchaseOrderDialogBody {...bodyProps} loading={loading} onOpenChange={onOpenChange} />
            </DialogContent>
        </Dialog>
    );
}
