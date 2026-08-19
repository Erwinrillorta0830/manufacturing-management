"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { UnifiedApprovalRow } from "../types";
import { DecisionConfirmationDialog } from "./DecisionConfirmationDialog";
import { decisionUserLabel } from "../utils/labels";
import { displayPcrStatus, pcrApproveButtonClass, pcrRejectButtonClass, pcrStatusBadgeClass } from "../utils/pcrStatusStyles";

type Props = {
    row: UnifiedApprovalRow | null;
    open: boolean;
    acting: boolean;
    readOnly?: boolean;
    onOpenChange: (open: boolean) => void;
    onApprove?: (requestId: number, effectiveAt?: string | null) => Promise<void>;
    onReject?: (requestId: number, reason: string) => Promise<void>;
    onApplyScheduledNow?: (requestId: number) => Promise<void>;
    onRejectScheduled?: (requestId: number, reason: string) => Promise<void>;
    onRetryApplication?: (requestId: number) => Promise<void>;
};

function money(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(Number(value));
}

function safeDate(value: string | null | undefined) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function deltaClass(current: number | null | undefined, proposed: number | null | undefined) {
    const currentValue = Number(current);
    const proposedValue = Number(proposed);
    if (!Number.isFinite(currentValue) || !Number.isFinite(proposedValue)) return "text-muted-foreground";
    const delta = proposedValue - currentValue;
    if (delta > 0) return "text-destructive";
    if (delta < 0) return "text-emerald-600";
    return "text-muted-foreground";
}

export function ListPriceRequestDetailDialog({
    row,
    open,
    acting,
    readOnly = false,
    onOpenChange,
    onApprove,
    onReject,
    onApplyScheduledNow,
    onRejectScheduled,
    onRetryApplication,
}: Props) {
    const [rejecting, setRejecting] = React.useState(false);
    const [rejectReason, setRejectReason] = React.useState("");
    const [confirmingAction, setConfirmingAction] = React.useState<"approve" | "reject" | "apply_now" | "reject_schedule" | null>(null);
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setRejecting(false);
            setRejectReason("");
            setConfirmingAction(null);
            setSubmitting(false);
        }
    }, [open]);

    const requestId = row?.kind === "list_price" && row.request_id ? Number(row.request_id) : null;
    const isPending = row?.status === "PENDING";
    const canAct = !readOnly && isPending && requestId != null && onApprove != null && onReject != null;
    const currentCost = row?.kind === "list_price" ? row.current_cost : null;
    const proposedCost = row?.kind === "list_price" ? row.proposed_cost : null;
    const rejectReasonValue = row?.kind === "list_price" ? row.reject_reason : null;
    const approvedBy = row?.kind === "list_price" ? row.approved_by : null;
    const approvedByName = row?.kind === "list_price" ? row.approved_by_name : null;
    const rejectedBy = row?.kind === "list_price" ? row.rejected_by : null;
    const rejectedByName = row?.kind === "list_price" ? row.rejected_by_name : null;
    const currentNumeric = Number(currentCost);
    const proposedNumeric = Number(proposedCost);
    const delta =
        Number.isFinite(currentNumeric) && Number.isFinite(proposedNumeric)
            ? proposedNumeric - currentNumeric
            : null;
    const percentChange =
        delta !== null && Number.isFinite(currentNumeric) && currentNumeric !== 0
            ? (delta / currentNumeric) * 100
            : null;
    const status = String(row?.status ?? "").toUpperCase();
    const displayStatus = row ? displayPcrStatus(row.status, row.application_status, row.effective_at) : "";
    const effectiveTime = new Date(row?.effective_at ?? "").getTime();
    const isScheduledBeforeEffective =
        status === "APPROVED" &&
        row?.application_status === "SCHEDULED" &&
        Number.isFinite(effectiveTime) &&
        effectiveTime > Date.now();
    const busy = acting || submitting;
    const canOverrideScheduled =
        !readOnly &&
        isScheduledBeforeEffective &&
        requestId != null &&
        onApplyScheduledNow != null &&
        onRejectScheduled != null;
    const canRetryApplication =
        !readOnly && row?.application_status === "FAILED" && requestId != null && onRetryApplication != null;

    const handleApprove = async (effectiveAt?: string | null) => {
        if (!requestId || !onApprove) return;
        setSubmitting(true);
        try {
            await onApprove(requestId, effectiveAt);
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!requestId || !rejectReason.trim() || !onReject) return;
        setSubmitting(true);
        try {
            await onReject(requestId, rejectReason.trim());
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleApplyScheduledNow = async () => {
        if (!requestId || !onApplyScheduledNow) return;
        setSubmitting(true);
        try {
            await onApplyScheduledNow(requestId);
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectScheduled = async () => {
        if (!requestId || !rejectReason.trim() || !onRejectScheduled) return;
        setSubmitting(true);
        try {
            await onRejectScheduled(requestId, rejectReason.trim());
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRetryApplication = async () => {
        if (!requestId || !onRetryApplication) return;
        setSubmitting(true);
        try {
            await onRetryApplication(requestId);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{row?.record_label ?? "List Cost Request"}</DialogTitle>
                    <DialogDescription>Review the current and proposed list cost before approving.</DialogDescription>
                </DialogHeader>

                {!row ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No request selected.</div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <div className="text-xs font-medium uppercase text-muted-foreground">Product</div>
                                <div className="mt-1 font-medium">{row.title}</div>
                                {row.subtitle ? (
                                    <div className="text-xs text-muted-foreground">{row.subtitle}</div>
                                ) : null}
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Status</div>
                                <div className="mt-1">
                                    <Badge variant="outline" className={pcrStatusBadgeClass(String(displayStatus))}>
                                        {displayStatus}
                                    </Badge>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Requested By</div>
                                <div className="mt-1 font-medium">
                                    {decisionUserLabel(row.requested_by, row.requested_by_name)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Requested At</div>
                                <div className="mt-1 font-medium">{safeDate(row.requested_at)}</div>
                            </div>
                            {status === "APPROVED" ? (
                                <>
                                    <div>
                                        <div className="text-xs font-medium uppercase text-muted-foreground">Approved By</div>
                                        <div className="mt-1 font-medium">
                                            {decisionUserLabel(approvedBy, approvedByName)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium uppercase text-muted-foreground">Effective At</div>
                                        <div className="mt-1 font-medium">{safeDate(row.effective_at)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium uppercase text-muted-foreground">Application Status</div>
                                        <div className="mt-1 font-medium">{row.application_status || "-"}</div>
                                    </div>
                                    {row.application_status === "APPLIED" ? (
                                        <div>
                                            <div className="text-xs font-medium uppercase text-muted-foreground">Applied At</div>
                                            <div className="mt-1 font-medium">{safeDate(row.applied_at)}</div>
                                        </div>
                                    ) : null}
                                </>
                            ) : null}
                            {status === "REJECTED" ? (
                                <div>
                                    <div className="text-xs font-medium uppercase text-muted-foreground">Rejected By</div>
                                    <div className="mt-1 font-medium">
                                        {decisionUserLabel(rejectedBy, rejectedByName)}
                                    </div>
                                </div>
                            ) : null}
                            {rejectReasonValue ? (
                                <div className="sm:col-span-2">
                                    <div className="text-xs font-medium uppercase text-muted-foreground">Reject Reason</div>
                                    <div className="mt-1 whitespace-pre-wrap text-sm">{rejectReasonValue}</div>
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-md border">
                            <div className="grid grid-cols-3 gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                                <div>Current</div>
                                <div>Proposed</div>
                                <div className="text-right">Change</div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 px-3 py-3 text-sm">
                                <div className="font-medium">{money(currentCost)}</div>
                                <div className="font-medium">{money(proposedCost)}</div>
                                <div className={cn("text-right font-medium", deltaClass(currentCost, proposedCost))}>
                                    {delta === null ? "—" : money(delta)}
                                    {percentChange !== null ? (
                                        <div className="text-xs font-normal">
                                            {percentChange.toLocaleString("en-PH", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                            %
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        {rejecting ? (
                            <div className="space-y-2">
                                <Label>Reject Reason</Label>
                                <Textarea
                                    value={rejectReason}
                                    onChange={(event) => setRejectReason(event.target.value)}
                                    placeholder="Enter reason..."
                                    rows={4}
                                />
                            </div>
                        ) : null}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Close
                    </Button>
                    {canAct ? (
                        rejecting ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setRejecting(false);
                                        setRejectReason("");
                                    }}
                                    disabled={busy}
                                >
                                    Cancel Reject
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => setConfirmingAction("reject")}
                                    disabled={busy || !rejectReason.trim()}
                                >
                                    Confirm Reject
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    className={pcrRejectButtonClass}
                                    onClick={() => setRejecting(true)}
                                    disabled={busy}
                                >
                                    Reject
                                </Button>
                                <Button
                                    className={pcrApproveButtonClass}
                                    onClick={() => setConfirmingAction("approve")}
                                    disabled={busy}
                                >
                                    Approve
                                </Button>
                            </>
                        )
                    ) : null}
                    {!canAct && canOverrideScheduled ? (
                        rejecting ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setRejecting(false);
                                        setRejectReason("");
                                    }}
                                    disabled={busy}
                                >
                                    Cancel Reject
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => setConfirmingAction("reject_schedule")}
                                    disabled={busy || !rejectReason.trim()}
                                >
                                    Reject Scheduled Change
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    className={pcrRejectButtonClass}
                                    onClick={() => setRejecting(true)}
                                    disabled={busy}
                                >
                                    Reject Scheduled Change
                                </Button>
                                <Button
                                    className={pcrApproveButtonClass}
                                    onClick={() => setConfirmingAction("apply_now")}
                                    disabled={busy}
                                >
                                    Apply Now
                                </Button>
                            </>
                        )
                    ) : null}
                    {!canAct && canRetryApplication ? (
                        <Button className={pcrApproveButtonClass} onClick={handleRetryApplication} disabled={busy}>
                            Retry Application
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>

            <DecisionConfirmationDialog
                open={confirmingAction != null}
                action={confirmingAction === "reject" || confirmingAction === "reject_schedule" ? "reject" : "approve"}
                recordLabel={row?.record_label ?? "List Cost Request"}
                loading={busy}
                description={
                    confirmingAction === "apply_now"
                        ? `Apply ${row?.record_label ?? "this list cost request"} now? This will immediately apply the scheduled list cost change.`
                        : confirmingAction === "reject_schedule"
                            ? `Reject ${row?.record_label ?? "this list cost request"}? This will cancel the scheduled list cost change before it takes effect.`
                            : undefined
                }
                rejectReason={confirmingAction === "reject" || confirmingAction === "reject_schedule" ? rejectReason.trim() : undefined}
                hideEffectiveAt={confirmingAction === "apply_now"}
                confirmLabel={confirmingAction === "apply_now" ? "Apply Now" : confirmingAction === "reject_schedule" ? "Reject Scheduled Change" : undefined}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) setConfirmingAction(null);
                }}
                onConfirm={
                    confirmingAction === "reject"
                        ? handleReject
                        : confirmingAction === "reject_schedule"
                            ? handleRejectScheduled
                            : confirmingAction === "apply_now"
                                ? handleApplyScheduledNow
                                : handleApprove
                }
            />
        </>
    );
}
