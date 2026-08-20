"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

import { pcrApproveButtonClass } from "../utils/pcrStatusStyles";

export function ApproveDialog(props: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onConfirm: (effectiveAt?: string | null) => void;
    loading?: boolean;
    title?: string;
    description?: string;
    contentClassName?: string;
    children?: React.ReactNode;
}) {
    const [effectiveAt, setEffectiveAt] = React.useState("");
    const { onConfirm } = props;

    React.useEffect(() => {
        if (!props.open) setEffectiveAt("");
    }, [props.open]);

    const handleConfirm = React.useCallback(async () => {
        try {
            await onConfirm(effectiveAt || null);
        } catch {
            // The action hook displays the error; keep the approval dialog open.
        }
    }, [effectiveAt, onConfirm]);

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className={props.contentClassName ?? "sm:max-w-md"}>
                <DialogHeader>
                    <DialogTitle>{props.title || "Confirm Approval"}</DialogTitle>
                </DialogHeader>

                {props.description ? (
                    <p className="text-sm text-muted-foreground">{props.description}</p>
                ) : null}

                {props.children}

                <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="approve-effective-at">
                        Effective Date/Time
                    </label>
                    <input
                        id="approve-effective-at"
                        type="datetime-local"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={effectiveAt}
                        onChange={(event) => setEffectiveAt(event.target.value)}
                        disabled={props.loading}
                    />
                    <p className="text-xs text-muted-foreground">
                        Leave blank to apply immediately, or choose a future time to schedule the change.
                    </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
                        Cancel
                    </Button>
                    <Button
                        className={pcrApproveButtonClass}
                        onClick={() => void handleConfirm()}
                        disabled={props.loading}
                    >
                        {props.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Approve
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
