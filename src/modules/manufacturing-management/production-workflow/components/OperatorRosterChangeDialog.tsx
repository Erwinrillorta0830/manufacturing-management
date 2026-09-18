"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "../../planning-engineering/components/SearchableSelect";

export type OperatorRosterChangeKind = "remove" | "swap" | "edit";

export interface OperatorRosterChange {
    kind: OperatorRosterChangeKind;
    taskId: number;
    operatorId: number;
    jobOrderNo: string;
    routeLabel: string;
    operatorName: string;
    currentHours: number;
    replacementOptions: { value: string; label: string }[];
}

export interface OperatorRosterChangePayload {
    replacementUserId?: number;
    actualHours?: string;
    changeReason: string;
    requestId: string;
}

interface OperatorRosterChangeDialogProps {
    change: OperatorRosterChange | null;
    open: boolean;
    saving?: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (payload: OperatorRosterChangePayload) => Promise<boolean>;
}

function createRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function OperatorRosterChangeDialog({
    change,
    open,
    saving = false,
    onOpenChange,
    onConfirm
}: OperatorRosterChangeDialogProps) {
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [replacementUserId, setReplacementUserId] = useState("");
    const [actualHours, setActualHours] = useState("");
    const [requestId, setRequestId] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!change || !open) return;
        setReason("");
        setNote("");
        setReplacementUserId("");
        setActualHours(change.currentHours.toString());
        setRequestId(createRequestId());
        setFormError(null);
    }, [change, open]);

    if (!change) return null;

    const isBusy = saving || submitting;
    const title = change.kind === "remove"
        ? "Confirm Operator Removal"
        : change.kind === "swap"
            ? "Confirm Roster Change"
            : "Confirm Roster Change";
    const description = change.kind === "remove"
        ? `Are you sure you want to remove ${change.operatorName} from Job Order ${change.jobOrderNo}? This action will be recorded in the shift log.`
        : change.kind === "swap"
            ? `Are you sure you want to replace ${change.operatorName} on Job Order ${change.jobOrderNo}? This action will be recorded in the shift log.`
            : `Are you sure you want to update ${change.operatorName}'s logged hours on Job Order ${change.jobOrderNo}? This action will be recorded in the shift log.`;

    const handleSubmit = async () => {
        setFormError(null);
        const parsedReplacementId = Number(replacementUserId);
        const parsedHours = Number(actualHours);

        if (change.kind === "swap" && (!Number.isSafeInteger(parsedReplacementId) || parsedReplacementId <= 0)) {
            setFormError("Select a replacement operator before confirming the roster change.");
            return;
        }
        if (change.kind === "edit" && (!Number.isFinite(parsedHours) || parsedHours < 0)) {
            setFormError("Enter a valid non-negative number of hours.");
            return;
        }

        const changeReason = [reason, note.trim() ? `Note: ${note.trim()}` : ""]
            .filter(Boolean)
            .join(" — ");

        setSubmitting(true);
        try {
            const succeeded = await onConfirm({
                replacementUserId: change.kind === "swap" ? parsedReplacementId : undefined,
                actualHours: change.kind === "edit" ? actualHours : undefined,
                changeReason,
                requestId
            });
            if (succeeded) onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !isBusy && onOpenChange(nextOpen)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {change.kind === "remove" ? (
                            <Trash2 className="h-5 w-5 text-destructive" />
                        ) : change.kind === "swap" ? (
                            <ArrowLeftRight className="h-5 w-5 text-amber-600" />
                        ) : (
                            <Pencil className="h-5 w-5 text-primary" />
                        )}
                        {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                        <div className="font-semibold text-foreground">{change.routeLabel}</div>
                        <div className="mt-1 text-muted-foreground">
                            Current operator: <span className="font-semibold text-foreground">{change.operatorName}</span>
                        </div>
                    </div>

                    {change.kind === "swap" && (
                        <div className="space-y-2">
                            <Label htmlFor="replacement-operator">Replacement operator</Label>
                            <SearchableSelect
                                id="replacement-operator"
                                ariaLabel="Replacement operator"
                                options={change.replacementOptions}
                                value={replacementUserId}
                                onValueChange={setReplacementUserId}
                                placeholder="Select replacement operator..."
                                disabled={isBusy}
                            />
                        </div>
                    )}

                    {change.kind === "edit" && (
                        <div className="space-y-2">
                            <Label htmlFor="operator-hours">Logged hours</Label>
                            <Input
                                id="operator-hours"
                                type="number"
                                min="0"
                                step="0.1"
                                value={actualHours}
                                onChange={(event) => setActualHours(event.target.value)}
                                disabled={isBusy}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="operator-change-reason">Reason (optional)</Label>
                        <select
                            id="operator-change-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            disabled={isBusy}
                            className="border-input bg-background ring-offset-background focus:ring-ring h-9 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">Select a reason...</option>
                            <option value="Absence">Absence</option>
                            <option value="Reassigned">Reassigned</option>
                            <option value="Medical Leave">Medical Leave</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="operator-change-note">Note (optional)</Label>
                        <Input
                            id="operator-change-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Add context for the shift log..."
                            maxLength={450}
                            disabled={isBusy}
                        />
                    </div>

                    {formError && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive" role="alert">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{formError}</span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" disabled={isBusy} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={isBusy || (change.kind === "swap" && change.replacementOptions.length === 0)}
                        onClick={handleSubmit}
                    >
                        {isBusy ? "Saving..." : change.kind === "remove" ? "Confirm Removal" : "Confirm Change"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
