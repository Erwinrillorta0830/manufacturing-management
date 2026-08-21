"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function RejectDialog(props: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onConfirm: (reason: string) => void;
    loading?: boolean;
    title?: string;
    contentClassName?: string;
    children?: React.ReactNode;
}) {
    const { loading, onOpenChange } = props;
    const [reason, setReason] = React.useState("");

    React.useEffect(() => {
        if (!props.open) setReason("");
    }, [props.open]);

    const handleOpenChange = React.useCallback(
        (nextOpen: boolean) => {
            if (!nextOpen && loading) return;
            onOpenChange(nextOpen);
        },
        [loading, onOpenChange],
    );

    return (
        <Dialog open={props.open} onOpenChange={handleOpenChange}>
            <DialogContent className={props.contentClassName ?? "sm:max-w-lg"}>
                <DialogHeader>
                    <DialogTitle>{props.title || "Reject Request"}</DialogTitle>
                </DialogHeader>

                {props.children}

                <div className="space-y-2">
                    <Label>Reject Reason</Label>
                    <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Enter reason..."
                        rows={4}
                    />
                </div>

                {props.loading ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground" role="status" aria-live="polite">
                        <Loader2 className="size-4 animate-spin" />
                        Waiting for rejection to finish...
                    </div>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => props.onConfirm(reason.trim())}
                        disabled={props.loading || !reason.trim()}
                    >
                        Reject
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
