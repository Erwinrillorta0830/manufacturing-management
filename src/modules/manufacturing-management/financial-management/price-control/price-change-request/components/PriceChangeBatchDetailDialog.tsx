"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { PriceChangeBatchDetail, PriceChangeBatchLine } from "../types";
import { DecisionConfirmationDialog } from "./DecisionConfirmationDialog";
import { BatchDecisionSummaryFields } from "./BatchDecisionSummaryFields";
import { getPriceChangeBatch } from "../providers/pcrApi";
import { getProductTypeBadgeProps } from "../utils/productTypeLabels";
import { decisionUserLabel } from "../utils/labels";
import { displayPcrStatus, pcrApproveButtonClass, pcrRejectButtonClass, pcrStatusBadgeClass } from "../utils/pcrStatusStyles";

type Props = {
    batchId: number | null;
    open: boolean;
    acting: boolean;
    readOnly?: boolean;
    onOpenChange: (open: boolean) => void;
    onApprove?: (headerId: number, effectiveAt?: string | null) => Promise<void> | void;
    onReject?: (headerId: number, reason: string) => Promise<void> | void;
    onApplyScheduledNow?: (headerId: number) => Promise<void> | void;
    onRejectScheduled?: (headerId: number, reason: string) => Promise<void> | void;
    onRetryApplication?: (headerId: number) => Promise<void> | void;
};

function money(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(Number(value));
}

function percent(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    return `${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function safeDate(value: string | null | undefined) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function diffClass(line: PriceChangeBatchLine) {
    const delta = Number(line.delta ?? 0);
    if (delta > 0) return "text-destructive";
    if (delta < 0) return "text-emerald-600";
    return "text-muted-foreground";
}

function buildLineSummary(lines: PriceChangeBatchLine[]) {
    const productIds = new Set<number>();
    const priceTypeIds = new Set<number>();
    let increaseCount = 0;
    let decreaseCount = 0;

    for (const line of lines) {
        if (Number.isFinite(line.product_id)) {
            productIds.add(Number(line.product_id));
        }
        if (Number.isFinite(line.price_type_id)) {
            priceTypeIds.add(Number(line.price_type_id));
        }
        const delta = Number(line.delta ?? 0);
        if (Number.isFinite(delta)) {
            if (delta > 0) increaseCount += 1;
            if (delta < 0) decreaseCount += 1;
        }
    }

    return {
        lineCount: lines.length,
        productCount: productIds.size,
        priceTypeCount: priceTypeIds.size,
        increaseCount,
        decreaseCount,
    };
}

export function PriceChangeBatchDetailDialog({
    batchId,
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
    const [detail, setDetail] = React.useState<PriceChangeBatchDetail | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [rejecting, setRejecting] = React.useState(false);
    const [rejectReason, setRejectReason] = React.useState("");
    const [confirmingAction, setConfirmingAction] = React.useState<"approve" | "reject" | "apply_now" | "reject_schedule" | null>(null);

    React.useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!open || !batchId) {
                setDetail(null);
                return;
            }

            setLoading(true);
            try {
                const result = await getPriceChangeBatch(batchId);
                if (!cancelled) setDetail(result.data);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Failed to load batch detail";
                if (!cancelled) toast.error(message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();

        return () => {
            cancelled = true;
        };
    }, [batchId, open]);

    const lines = React.useMemo(() => detail?.details ?? [], [detail?.details]);
    const isPending = detail?.status === "PENDING";
    const headerId = detail?.header_id ?? batchId ?? 0;
    const canAct = !readOnly && isPending && headerId != null && onApprove != null && onReject != null;
    const effectiveTime = new Date(detail?.effective_at ?? "").getTime();
    const isScheduledBeforeEffective =
        detail?.status === "APPROVED" &&
        detail?.application_status === "SCHEDULED" &&
        Number.isFinite(effectiveTime) &&
        effectiveTime > Date.now();
    const canOverrideScheduled =
        !readOnly &&
        isScheduledBeforeEffective &&
        headerId > 0 &&
        onApplyScheduledNow != null &&
        onRejectScheduled != null;
    const canRetryApplication =
        !readOnly && detail?.application_status === "FAILED" && headerId > 0 && onRetryApplication != null;
    const displayStatus = detail ? displayPcrStatus(detail.status, detail.application_status, detail.effective_at) : "";
    const lineSummary = React.useMemo(() => buildLineSummary(lines), [lines]);

    const handleOpenChange = React.useCallback(
        (nextOpen: boolean) => {
            if (!nextOpen) {
                setRejecting(false);
                setRejectReason("");
                setConfirmingAction(null);
            }
            onOpenChange(nextOpen);
        },
        [onOpenChange],
    );

    const handleApprove = React.useCallback(async (effectiveAt?: string | null) => {
        if (!headerId) return;
        if (!headerId || !onApprove) return;
        await onApprove(headerId, effectiveAt);
        setConfirmingAction(null);
        handleOpenChange(false);
    }, [handleOpenChange, headerId, onApprove]);

    const handleReject = React.useCallback(async () => {
        const reason = rejectReason.trim();
        if (!headerId || !reason) return;
        if (!headerId || !onReject) return;
        await onReject(headerId, reason);
        setConfirmingAction(null);
        handleOpenChange(false);
    }, [handleOpenChange, headerId, onReject, rejectReason]);

    const handleApplyScheduledNow = React.useCallback(async () => {
        if (!headerId || !onApplyScheduledNow) return;
        await onApplyScheduledNow(headerId);
        setConfirmingAction(null);
        handleOpenChange(false);
    }, [handleOpenChange, headerId, onApplyScheduledNow]);

    const handleRejectScheduled = React.useCallback(async () => {
        const reason = rejectReason.trim();
        if (!headerId || !reason || !onRejectScheduled) return;
        await onRejectScheduled(headerId, reason);
        setConfirmingAction(null);
        handleOpenChange(false);
    }, [handleOpenChange, headerId, onRejectScheduled, rejectReason]);

    const handleRetryApplication = React.useCallback(async () => {
        if (!headerId || !onRetryApplication) return;
        await onRetryApplication(headerId);
        handleOpenChange(false);
    }, [handleOpenChange, headerId, onRetryApplication]);

    return (
        <>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-6xl">
                <DialogHeader>
                    <DialogTitle>Price Change Batch {headerId ? `PCB-${headerId}` : ""}</DialogTitle>
                    <DialogDescription>
                        Review the current and proposed prices before approving the full batch.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                        Loading batch detail
                    </div>
                ) : detail ? (
                    <div className="flex flex-col gap-4">
                        <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Supplier</div>
                                <div className="mt-1 break-words font-medium">{detail.supplier_name || "-"}</div>
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
                                <div className="text-xs font-medium uppercase text-muted-foreground">Requested At</div>
                                <div className="mt-1 font-medium">{safeDate(detail.requested_at)}</div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Requested By</div>
                                <div className="mt-1 font-medium">
                                    {decisionUserLabel(detail.requested_by, detail.requested_by_name)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Lines</div>
                                <div className="mt-1 font-medium">{lines.length.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">Product Type</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {detail.product_types && detail.product_types.length > 0 ? (
                                        detail.product_types.map((type) => {
                                            const badgeProps = getProductTypeBadgeProps(type.name);
                                            return (
                                                <Badge
                                                    key={type.id}
                                                    variant="outline"
                                                    className={badgeProps.className}
                                                >
                                                    {badgeProps.label}
                                                </Badge>
                                            );
                                        })
                                    ) : (
                                        <span className="font-medium">-</span>
                                    )}
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <div className="text-xs font-medium uppercase text-muted-foreground">Reference No.</div>
                                <div className="mt-1 font-medium">{detail.reference_no || "-"}</div>
                            </div>
                            <div className="sm:col-span-2">
                                <div className="text-xs font-medium uppercase text-muted-foreground">Remarks</div>
                                <div className="mt-1 font-medium">{detail.remarks || "-"}</div>
                            </div>
                            <BatchDecisionSummaryFields detail={detail} />
                        </div>

                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="w-[130px]">Supplier</TableHead>
                                        <TableHead className="w-[72px]">Unit</TableHead>
                                        <TableHead className="w-[110px]">Price Type</TableHead>
                                        <TableHead className="w-[140px] text-right">Current</TableHead>
                                        <TableHead className="w-[140px] text-right">Proposed</TableHead>
                                        <TableHead className="w-[130px] text-right">Change</TableHead>
                                        <TableHead className="w-[120px] text-right">% Change</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map((line) => (
                                        <TableRow key={`${line.request_id ?? line.product_id}-${line.price_type_id}`}>
                                            <TableCell className="min-w-[280px] max-w-[420px] align-top">
                                                <div className="whitespace-normal break-words leading-snug font-medium">{line.product_name || `Product #${line.product_id}`}</div>
                                                {line.product_code ? (
                                                    <div className="whitespace-normal break-words text-xs text-muted-foreground">{line.product_code}</div>
                                                ) : null}
                                            </TableCell>
                                            <TableCell className="min-w-[180px] max-w-[280px] whitespace-normal break-words align-top">
                                                {detail.supplier_name || "-"}
                                            </TableCell>
                                            <TableCell>
                                                {line.unit_name ?? "-"}
                                            </TableCell>
                                            <TableCell>{line.price_type_name || `#${line.price_type_id}`}</TableCell>
                                            <TableCell className="text-right">{money(line.current_price)}</TableCell>
                                            <TableCell className="text-right font-medium">{money(line.proposed_price)}</TableCell>
                                            <TableCell className={cn("text-right font-medium", diffClass(line))}>
                                                {money(line.delta)}
                                            </TableCell>
                                            <TableCell className={cn("text-right", diffClass(line))}>
                                                {percent(line.percent_change)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {lines.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                                                No detail lines found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={2} className="font-medium">
                                                Summary
                                            </TableCell>
                                            <TableCell colSpan={6} className="text-sm text-muted-foreground">
                                                {lineSummary.lineCount} line(s) · {lineSummary.productCount} product(s) ·{" "}
                                                {lineSummary.priceTypeCount} price type(s)
                                                {lineSummary.increaseCount > 0 || lineSummary.decreaseCount > 0
                                                    ? ` · ${lineSummary.increaseCount} increase(s), ${lineSummary.decreaseCount} decrease(s)`
                                                    : null}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                                Amounts are not totaled across products and price types.
                            </p>
                        </div>

                        {(canAct || canOverrideScheduled) && rejecting ? (
                            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                                <Label htmlFor="batch-reject-reason">Reject Reason</Label>
                                <Textarea
                                    id="batch-reject-reason"
                                    value={rejectReason}
                                    onChange={(event) => setRejectReason(event.target.value)}
                                    placeholder="Enter reason..."
                                    rows={4}
                                />
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="py-10 text-center text-muted-foreground">No batch selected.</div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={acting}>
                        Close
                    </Button>
                    {canAct ? (
                        <>
                            {rejecting ? (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setRejecting(false);
                                            setRejectReason("");
                                        }}
                                        disabled={acting}
                                    >
                                        Cancel Reject
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className={pcrRejectButtonClass}
                                        onClick={() => setConfirmingAction("reject")}
                                        disabled={acting || !rejectReason.trim()}
                                    >
                                        Confirm Reject Batch
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="outline"
                                    className={pcrRejectButtonClass}
                                    onClick={() => {
                                        setConfirmingAction(null);
                                        setRejecting(true);
                                    }}
                                    disabled={acting}
                                >
                                    Reject Batch
                                </Button>
                            )}
                            <Button
                                className={pcrApproveButtonClass}
                                onClick={() => setConfirmingAction("approve")}
                                disabled={acting || rejecting}
                            >
                                Approve Batch
                            </Button>
                        </>
                    ) : null}
                    {!canAct && canOverrideScheduled ? (
                        <>
                            {rejecting ? (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setRejecting(false);
                                            setRejectReason("");
                                        }}
                                        disabled={acting}
                                    >
                                        Cancel Reject
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className={pcrRejectButtonClass}
                                        onClick={() => setConfirmingAction("reject_schedule")}
                                        disabled={acting || !rejectReason.trim()}
                                    >
                                        Reject Scheduled Change
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="outline"
                                    className={pcrRejectButtonClass}
                                    onClick={() => {
                                        setConfirmingAction(null);
                                        setRejecting(true);
                                    }}
                                    disabled={acting}
                                >
                                    Reject Scheduled Change
                                </Button>
                            )}
                            <Button
                                className={pcrApproveButtonClass}
                                onClick={() => setConfirmingAction("apply_now")}
                                disabled={acting || rejecting}
                            >
                                Apply Now
                            </Button>
                        </>
                    ) : null}
                    {!canAct && canRetryApplication ? (
                        <Button className={pcrApproveButtonClass} onClick={handleRetryApplication} disabled={acting}>
                            Retry Application
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>

            <DecisionConfirmationDialog
                open={confirmingAction != null}
                action={confirmingAction === "reject" || confirmingAction === "reject_schedule" ? "reject" : "approve"}
                recordLabel={headerId ? `PCB-${headerId}` : "Price Change Batch"}
                loading={acting}
                description={
                    confirmingAction === "apply_now"
                        ? `Apply ${headerId ? `PCB-${headerId}` : "this price change batch"} now? This will immediately apply the scheduled price changes.`
                        : confirmingAction === "reject_schedule"
                            ? `Reject ${headerId ? `PCB-${headerId}` : "this price change batch"}? This will cancel the scheduled price changes before they take effect.`
                            : confirmingAction === "reject"
                        ? `Reject ${headerId ? `PCB-${headerId}` : "this price change batch"}? This will reject the entire price change batch.`
                        : `Approve ${headerId ? `PCB-${headerId}` : "this price change batch"}? This will approve and apply the entire price change batch.`
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
