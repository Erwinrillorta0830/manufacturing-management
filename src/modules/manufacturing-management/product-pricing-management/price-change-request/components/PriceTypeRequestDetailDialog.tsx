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

import type { PriceTypeUnifiedApprovalRow } from "../types";
import { DecisionConfirmationDialog } from "./DecisionConfirmationDialog";
import { decisionUserLabel, priceRowHasBatchLink, priceTypeLabel } from "../utils/labels";
import { displayPcrStatus, pcrApproveButtonClass, pcrRejectButtonClass, pcrStatusBadgeClass } from "../utils/pcrStatusStyles";

type Props = {
    row: PriceTypeUnifiedApprovalRow | null;
    open: boolean;
    acting: boolean;
    readOnly?: boolean;
    onOpenChange: (open: boolean) => void;
    onApproveBatch?: (headerId: number, effectiveAt?: string | null) => Promise<void>;
    onRejectBatch?: (headerId: number, reason: string) => Promise<void>;
    onApproveRequest?: (requestId: number, effectiveAt?: string | null) => Promise<void>;
    onRejectRequest?: (requestId: number, reason: string) => Promise<void>;
    onApplyScheduledNow?: (kind: "price_request" | "price_batch", id: number) => Promise<void>;
    onRejectScheduled?: (kind: "price_request" | "price_batch", id: number, reason: string) => Promise<void>;
    onRetryApplication?: (kind: "price_request" | "price_batch", id: number) => Promise<void>;
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

export function PriceTypeRequestDetailDialog({
    row,
    open,
    acting,
    readOnly = false,
    onOpenChange,
    onApproveBatch,
    onRejectBatch,
    onApproveRequest,
    onRejectRequest,
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

    const requestId = row?.request_id ? Number(row.request_id) : null;
    const headerId = row?.batch_header_id ? Number(row.batch_header_id) : null;
    const isBatchLinked = row ? priceRowHasBatchLink(row) : false;
    const isPending = row?.status === "PENDING";
    const proposedPrice = row?.proposed_price ?? null;
    const currentPrice = row?.current_price ?? null;
    const currentNumeric = Number(currentPrice);
    const proposedNumeric = Number(proposedPrice);
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
    const scheduledKind = isBatchLinked && headerId ? "price_batch" : "price_request";
    const scheduledId = scheduledKind === "price_batch" ? headerId : requestId;
    const busy = acting || submitting;
    const canAct =
        !readOnly &&
        isPending &&
        requestId != null &&
        onApproveBatch != null &&
        onRejectBatch != null &&
        onApproveRequest != null &&
        onRejectRequest != null;
    const canOverrideScheduled =
        !readOnly &&
        isScheduledBeforeEffective &&
        scheduledId != null &&
        onApplyScheduledNow != null &&
        onRejectScheduled != null;
    const canRetryApplication =
        !readOnly && row?.application_status === "FAILED" && scheduledId != null && onRetryApplication != null;

    const handleApprove = async (effectiveAt?: string | null) => {
        if (!requestId || !onApproveBatch || !onApproveRequest) return;
        setSubmitting(true);
        try {
            if (isBatchLinked && headerId) {
                await onApproveBatch(headerId, effectiveAt);
            } else {
                await onApproveRequest(requestId, effectiveAt);
            }
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!requestId || !rejectReason.trim() || !onRejectBatch || !onRejectRequest) return;
        setSubmitting(true);
        try {
            if (isBatchLinked && headerId) {
                await onRejectBatch(headerId, rejectReason.trim());
            } else {
                await onRejectRequest(requestId, rejectReason.trim());
            }
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleApplyScheduledNow = async () => {
        if (!scheduledId || !onApplyScheduledNow) return;
        setSubmitting(true);
        try {
            await onApplyScheduledNow(scheduledKind, scheduledId);
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectScheduled = async () => {
        if (!scheduledId || !rejectReason.trim() || !onRejectScheduled) return;
        setSubmitting(true);
        try {
            await onRejectScheduled(scheduledKind, scheduledId, rejectReason.trim());
            setConfirmingAction(null);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRetryApplication = async () => {
        if (!scheduledId || !onRetryApplication) return;
        setSubmitting(true);
        try {
            await onRetryApplication(scheduledKind, scheduledId);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const recordLabel = isBatchLinked && headerId ? `PCB-${headerId}` : row?.record_label ?? "Price Type Request";
    const supplierName = String(row?.supplier_name ?? "").trim();
    const supplierNames = Array.isArray(row?.supplier_names)
        ? row.supplier_names.map((name) => String(name ?? "").trim()).filter(Boolean)
        : [];

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{row?.record_label ?? "Price Type Request"}</DialogTitle>
                    <DialogDescription>Review the proposed price type change and batch remarks.</DialogDescription>
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
                            <div className="sm:col-span-2">
                                <div className="text-xs font-medium uppercase text-muted-foreground">Supplier</div>
                                {supplierNames.length > 1 ? (
                                    <div className="mt-1 space-y-1">
                                        {supplierNames.map((name) => (
                                            <div
                                                key={name}
                                                className="whitespace-normal break-words font-medium"
                                            >
                                                {name}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-1 whitespace-normal break-words font-medium">
                                        {supplierNames[0] || supplierName || "-"}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Price Type</div>
                                <div className="mt-1 font-medium">{priceTypeLabel(row)}</div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Requested By</div>
                                <div className="mt-1 font-medium">
                                    {decisionUserLabel(row.requested_by, row.requested_by_name)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Status</div>
                                <div className="mt-1">
                                    <Badge variant="outline" className={pcrStatusBadgeClass(String(displayStatus))}>
                                        {displayStatus}
                                    </Badge>
                                </div>
                            </div>
                            {row.reference_no ? (
                                <div>
                                    <div className="text-xs font-medium uppercase text-muted-foreground">Reference</div>
                                    <div className="mt-1 font-medium">{row.reference_no}</div>
                                </div>
                            ) : null}
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Requested At</div>
                                <div className="mt-1 font-medium">{safeDate(row.requested_at)}</div>
                            </div>
                            {status === "APPROVED" ? (
                                <>
                                    <div>
                                        <div className="text-xs font-medium uppercase text-muted-foreground">Approved By</div>
                                        <div className="mt-1 font-medium">
                                            {decisionUserLabel(row.approved_by, row.approved_by_name)}
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
                                        {decisionUserLabel(row.rejected_by, row.rejected_by_name)}
                                    </div>
                                </div>
                            ) : null}
                            {row.remarks ? (
                                <div className="sm:col-span-2">
                                    <div className="text-xs font-medium uppercase text-muted-foreground">Remarks</div>
                                    <div className="mt-1 whitespace-pre-wrap text-sm">{row.remarks}</div>
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
                                <div className="font-medium">{money(currentPrice)}</div>
                                <div className="font-medium">{money(proposedPrice)}</div>
                                <div className={cn("text-right font-medium", deltaClass(currentPrice, proposedPrice))}>
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

                        {canAct ? (
                            <p className="text-xs text-muted-foreground">
                                {isBatchLinked
                                    ? `Approving or rejecting applies to the entire price change batch${
                                          headerId ? ` (PCB-${headerId})` : ""
                                      }.`
                                    : "Approving or rejecting applies to this request only."}
                            </p>
                        ) : null}

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
                    {canAct && requestId ? (
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
                                    {isBatchLinked ? "Confirm Reject Batch" : "Confirm Reject"}
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
                                    {isBatchLinked ? "Reject Batch" : "Reject"}
                                </Button>
                                <Button
                                    className={pcrApproveButtonClass}
                                    onClick={() => setConfirmingAction("approve")}
                                    disabled={busy}
                                >
                                    {isBatchLinked ? "Approve Batch" : "Approve"}
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
                recordLabel={recordLabel}
                loading={busy}
                description={
                    confirmingAction === "apply_now"
                        ? `Apply ${recordLabel} now? This will immediately apply the scheduled price change.`
                        : confirmingAction === "reject_schedule"
                            ? `Reject ${recordLabel}? This will cancel the scheduled price change before it takes effect.`
                            : isBatchLinked
                        ? confirmingAction === "reject"
                            ? `Reject ${recordLabel}? This will reject the entire price change batch.`
                            : `Approve ${recordLabel}? This will approve and apply the entire price change batch.`
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
