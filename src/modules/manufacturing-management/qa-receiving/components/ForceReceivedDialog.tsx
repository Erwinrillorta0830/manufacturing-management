import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Shipment, ShipmentLineItem } from "../types";
import { FORCE_RECEIVED_REASON_MAX_LENGTH } from "@/app/api/manufacturing/qa-receiving/_force-received";

interface ForceReceivedDialogProps {
    open: boolean;
    shipment: Shipment;
    lineItems: ShipmentLineItem[];
    submitting: boolean;
    onConfirm: (reason: string) => Promise<void>;
    onCancel: () => void;
}

export default function ForceReceivedDialog({
    open,
    shipment,
    lineItems,
    submitting,
    onConfirm,
    onCancel
}: ForceReceivedDialogProps) {
    const [reason, setReason] = useState("");
    const trimmedReason = reason.trim();
    const remainingLines = useMemo(() => lineItems.map(line => ({
        lineId: line.line_id,
        name: line.product_id?.product_name || `Line ${line.line_id}`,
        remainingAccepted: Math.max(0, Number(line.remaining_accepted_quantity ?? 0))
    })), [lineItems]);

    const close = () => {
        setReason("");
        if (!submitting) onCancel();
    };

    return (
        <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) close(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Force Received</DialogTitle>
                    <DialogDescription>
                        Close remaining quantities on {shipment.reference_number}. QA intake will stop and the order will move to Received.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-warning">
                        Remaining accepted quantity will be administratively closed without creating receiving rows or inventory movements.
                    </div>
                    <div className="max-h-40 overflow-auto rounded-lg border">
                        {remainingLines.map(line => (
                            <div key={line.lineId} className="flex items-center justify-between border-b px-3 py-1.5 text-[11px] last:border-b-0">
                                <span className="truncate pr-3 font-semibold">{line.name}</span>
                                <span className="whitespace-nowrap text-muted-foreground">
                                    Remaining accepted: {line.remainingAccepted.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Force Close Reason <span className="text-destructive">*</span>
                        </span>
                        <Textarea
                            aria-label="Force Close Reason"
                            value={reason}
                            onChange={event => setReason(event.target.value)}
                            maxLength={FORCE_RECEIVED_REASON_MAX_LENGTH}
                            rows={4}
                            disabled={submitting}
                            className="min-h-20 text-xs"
                            placeholder="Enter the reason this short shipment is being closed."
                        />
                        <span className="block text-right text-[10px] text-muted-foreground">
                            {trimmedReason.length}/{FORCE_RECEIVED_REASON_MAX_LENGTH}
                        </span>
                    </label>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={submitting || trimmedReason.length === 0}
                        onClick={() => {
                            const nextReason = trimmedReason;
                            setReason("");
                            void onConfirm(nextReason);
                        }}
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Confirm Force Received
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
