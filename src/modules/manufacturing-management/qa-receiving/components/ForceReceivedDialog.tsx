import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl border bg-card shadow-lg">
                <div className="border-b px-4 py-3">
                    <h4 className="text-sm font-bold">Force Received</h4>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        Close remaining quantities on {shipment.reference_number}. QA intake will stop and the order will move to Received.
                    </p>
                </div>
                <div className="space-y-3 px-4 py-3">
                    <div className="rounded-lg border bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800">
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
                            Force Close Reason <span className="text-red-500">*</span>
                        </span>
                        <textarea
                            aria-label="Force Close Reason"
                            value={reason}
                            onChange={event => setReason(event.target.value)}
                            maxLength={FORCE_RECEIVED_REASON_MAX_LENGTH}
                            rows={4}
                            disabled={submitting}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Enter the reason this short shipment is being closed."
                        />
                        <span className="block text-right text-[10px] text-muted-foreground">
                            {trimmedReason.length}/{FORCE_RECEIVED_REASON_MAX_LENGTH}
                        </span>
                    </label>
                </div>
                <div className="flex justify-end gap-2 border-t px-4 py-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        className="h-10 rounded-xl border px-4 text-xs font-bold text-muted-foreground hover:bg-muted"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={submitting || trimmedReason.length === 0}
                        onClick={() => void onConfirm(trimmedReason)}
                        className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Confirm Force Received
                    </button>
                </div>
            </div>
        </div>
    );
}
