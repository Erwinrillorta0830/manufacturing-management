"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { pcrApproveButtonClass, pcrRejectButtonClass } from "../utils/pcrStatusStyles";

type Props = {
    open: boolean;
    action: "approve" | "reject";
    recordLabel: string;
    loading?: boolean;
    description?: string;
    rejectReason?: string;
    hideEffectiveAt?: boolean;
    confirmLabel?: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: (effectiveAt?: string | null) => Promise<void> | void;
};

export function DecisionConfirmationDialog({
    open,
    action,
    recordLabel,
    loading,
    description,
    rejectReason,
    hideEffectiveAt = false,
    confirmLabel,
    onOpenChange,
    onConfirm,
}: Props) {
    const isReject = action === "reject";
    const [effectiveAt, setEffectiveAt] = React.useState("");

    React.useEffect(() => {
        if (!open) setEffectiveAt("");
    }, [open]);

    const handleOpenChange = React.useCallback(
        (nextOpen: boolean) => {
            if (!nextOpen && loading) return;
            onOpenChange(nextOpen);
        },
        [loading, onOpenChange],
    );

    const handleConfirm = React.useCallback(async () => {
        try {
            await onConfirm(isReject ? null : effectiveAt || null);
        } catch {
            // The action hook displays the error; keep the confirmation dialog open.
        }
    }, [effectiveAt, isReject, onConfirm]);

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{isReject ? "Confirm Rejection" : "Confirm Approval"}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description ??
                            (isReject
                                ? `Reject ${recordLabel}? This action will mark the request as rejected.`
                                : `Approve ${recordLabel}? This action will apply the proposed change.`)}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {rejectReason ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="text-xs font-medium uppercase text-muted-foreground">Reject Reason</div>
                        <div className="mt-1 whitespace-pre-wrap">{rejectReason}</div>
                    </div>
                ) : null}

                {!isReject && !hideEffectiveAt ? (
                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="price-change-effective-at">
                            Effective Date/Time
                        </label>
                        <input
                            id="price-change-effective-at"
                            type="datetime-local"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={effectiveAt}
                            onChange={(event) => setEffectiveAt(event.target.value)}
                            disabled={loading}
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave blank to apply immediately, or choose a future time to schedule the change.
                        </p>
                    </div>
                ) : null}

                {loading ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground" role="status" aria-live="polite">
                        <Loader2 className="size-4 animate-spin" />
                        {isReject ? "Waiting for rejection to finish..." : "Waiting for approval to finish..."}
                    </div>
                ) : null}

                <AlertDialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        variant={isReject ? "outline" : "default"}
                        className={isReject ? pcrRejectButtonClass : pcrApproveButtonClass}
                        onClick={() => void handleConfirm()}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {confirmLabel ?? (isReject ? "Reject" : "Approve")}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
