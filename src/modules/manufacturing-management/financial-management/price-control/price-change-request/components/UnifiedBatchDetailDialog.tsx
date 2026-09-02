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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { UnifiedBatchDetail, UnifiedBatchLine } from "../types";
import { getUnifiedBatch } from "../providers/pcrApi";
import { BatchDecisionSummaryFields } from "./BatchDecisionSummaryFields";
import { DecisionConfirmationDialog } from "./DecisionConfirmationDialog";
import { RejectDialog } from "./RejectDialog";
import { getProductTypeBadgeProps } from "../utils/productTypeLabels";
import { decisionUserLabel } from "../utils/labels";
import { displayPcrStatus, pcrApproveButtonClass, pcrStatusBadgeClass } from "../utils/pcrStatusStyles";

type Props = {
    batchId: number | null;
    open: boolean;
    acting: boolean;
    readOnly?: boolean;
    onOpenChange: (open: boolean) => void;
    onApprove?: (headerId: number, effectiveAt?: string | null) => Promise<void> | void;
    onReject?: (headerId: number, reason: string) => Promise<void> | void;
    onApplyScheduledNow?: (headerId: number) => Promise<void> | void;
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

function safeDate(value: string | null | undefined) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function lineProposed(line: UnifiedBatchLine) {
    return line.kind === "price_type" ? line.proposed_price : line.proposed_cost;
}

function lineCurrent(line: UnifiedBatchLine) {
    return line.kind === "price_type" ? line.current_price : line.current_cost;
}

function diffClass(line: UnifiedBatchLine) {
    const delta = Number(line.delta ?? 0);
    if (delta > 0) return "text-destructive";
    if (delta < 0) return "text-emerald-600";
    return "text-muted-foreground";
}

function buildLineSummary(lines: UnifiedBatchLine[]) {
    const productIds = new Set<number>();
    const typeLabels = new Set<string>();
    let increaseCount = 0;
    let decreaseCount = 0;
    let isFGBatch = true;

    for (const line of lines) {
        if (Number.isFinite(line.product_id)) productIds.add(Number(line.product_id));
        typeLabels.add(line.kind === "price_type" ? line.price_type_name || "Price Type" : "List Cost");
        const delta = Number(line.delta ?? 0);
        if (delta > 0) increaseCount += 1;
        if (delta < 0) decreaseCount += 1;
        if (line.product_type_name !== "FG") isFGBatch = false;
    }

    return {
        lineCount: lines.length,
        productCount: productIds.size,
        typeCount: typeLabels.size,
        increaseCount,
        decreaseCount,
        isFGBatch,
    };
}

type LineSummary = ReturnType<typeof buildLineSummary>;

function LineTable({
    lines,
    summary,
}: {
    lines: UnifiedBatchLine[];
    summary: LineSummary & { isFGBatch?: boolean };
}) {
    return (
        <div className="rounded-md border overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Product</TableHead>
                        {summary.isFGBatch ? null : <TableHead className="w-[130px]">Supplier</TableHead>}
                        <TableHead className="w-[72px]">Unit</TableHead>
                        <TableHead className="w-[110px]">Type</TableHead>
                        <TableHead className="w-[140px] text-right">Current</TableHead>
                        <TableHead className="w-[140px] text-right">Proposed</TableHead>
                        <TableHead className="w-[130px] text-right">Change</TableHead>
                        <TableHead className="w-[120px] text-right">% Change</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {lines.map((line) => (
                        <TableRow key={`${line.kind}-${line.request_id}`}>
                            <TableCell className="min-w-[280px] max-w-[420px] align-top">
                                <div className="whitespace-normal break-words leading-snug font-medium">
                                    {line.product_name || `Product #${line.product_id}`}

                                </div>
                                {line.product_code ? (
                                    <div className="whitespace-normal break-words text-xs text-muted-foreground">
                                        {line.product_code}
                                    </div>
                                ) : null}
                            </TableCell>
                            {summary.isFGBatch ? null : (
                                <TableCell className="min-w-[180px] max-w-[280px] whitespace-normal break-words align-top">
                                    {line.supplier_name || "-"}
                                </TableCell>
                            )}
                            <TableCell>{line.unit_name || "-"}</TableCell>
                            <TableCell>
                                <Badge variant="outline">
                                    {line.kind === "price_type" ? line.price_type_name || "Price Type" : "List Cost"}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">{money(lineCurrent(line))}</TableCell>
                            <TableCell className="text-right font-medium">{money(lineProposed(line))}</TableCell>
                            <TableCell className={cn("text-right font-medium", diffClass(line))}>
                                {money(line.delta)}
                            </TableCell>
                            <TableCell className={cn("text-right", diffClass(line))}>
                                {line.percent_change == null
                                    ? "-"
                                    : `${Number(line.percent_change).toLocaleString("en-PH", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}%`}
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
                            <TableCell colSpan={2} className="font-medium">Summary</TableCell>
                            <TableCell colSpan={6} className="text-sm text-muted-foreground">
                                {summary.lineCount} line(s) / {summary.productCount} product(s) / {summary.typeCount} type(s)
                                {summary.increaseCount > 0 || summary.decreaseCount > 0
                                    ? ` / ${summary.increaseCount} increase(s), ${summary.decreaseCount} decrease(s)`
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
    );
}

export function UnifiedBatchDetailDialog({
    batchId,
    open,
    acting,
    readOnly = false,
    onOpenChange,
    onApprove,
    onReject,
    onApplyScheduledNow,
    onRetryApplication,
}: Props) {
    const [detail, setDetail] = React.useState<UnifiedBatchDetail | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [confirmingApprove, setConfirmingApprove] = React.useState(false);
    const [rejecting, setRejecting] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        if (!open || !batchId) {
            setDetail(null);
            return;
        }

        setLoading(true);
        void getUnifiedBatch(batchId)
            .then((result) => {
                if (!cancelled) setDetail(result.data);
            })
            .catch((error: unknown) => {
                if (!cancelled) toast.error(error instanceof Error ? error.message : "Failed to load mixed batch detail");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [batchId, open]);

    const isPending = detail?.status === "PENDING";
    const canAct = !readOnly && isPending && Boolean(onApprove && onReject) && !loading;
    const isScheduled = detail?.status === "APPROVED" && detail.application_status === "SCHEDULED";
    const canApplyScheduledNow = !readOnly && isScheduled && Boolean(onApplyScheduledNow) && !loading && !acting;
    const canRetry = !readOnly && detail?.application_status === "FAILED" && Boolean(detail.retryable) && Boolean(onRetryApplication) && !loading && !acting;
    const displayStatus = detail ? displayPcrStatus(detail.status, detail.application_status, detail.effective_at) : "";
    const lines = React.useMemo(
        () => [...(detail?.price_details ?? []), ...(detail?.cost_details ?? [])],
        [detail?.cost_details, detail?.price_details],
    );
    const lineSummary = React.useMemo(() => {
        const summary = buildLineSummary(lines);
        summary.isFGBatch = detail?.product_types?.every((t) => t.name === "FG") ?? false;
        return summary;
    }, [lines, detail]);

    const handleRetryApplication = async () => {
        if (!batchId || !onRetryApplication) return;
        await onRetryApplication(batchId);
        const result = await getUnifiedBatch(batchId);
        setDetail(result.data);
    };

    const handleApplyScheduledNow = async () => {
        if (!batchId || !onApplyScheduledNow) return;
        await onApplyScheduledNow(batchId);
        const result = await getUnifiedBatch(batchId);
        setDetail(result.data);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-6xl">
                    <DialogHeader>
                        <DialogTitle>Unified Price Change Batch {batchId ? `PCB-${batchId}` : ""}</DialogTitle>
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

                            {detail.application_error ? (
                                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                                    <div className="font-medium">Application issue</div>
                                    <div className="mt-1">{detail.application_error}</div>
                                    {detail.application_attempts != null ? (
                                        <div className="mt-1 text-xs">Attempts: {detail.application_attempts}</div>
                                    ) : null}
                                </div>
                            ) : null}

                            <LineTable lines={lines} summary={lineSummary} />
                        </div>
                    ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground">No batch details found.</div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={acting}>Close</Button>
                        {canAct ? (
                            <>
                                <Button variant="outline" className="border-red-600 text-red-600" onClick={() => setRejecting(true)} disabled={acting}>Reject Batch</Button>
                                <Button className={pcrApproveButtonClass} onClick={() => setConfirmingApprove(true)} disabled={acting || rejecting}>Approve Batch</Button>
                            </>
                        ) : null}
                        {canApplyScheduledNow ? (
                            <Button className={pcrApproveButtonClass} onClick={() => void handleApplyScheduledNow()} disabled={acting}>
                                {acting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                Apply Now
                            </Button>
                        ) : null}
                        {canRetry ? (
                            <Button className={pcrApproveButtonClass} onClick={() => void handleRetryApplication()} disabled={acting}>
                                {acting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                Retry Application
                            </Button>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DecisionConfirmationDialog
                open={confirmingApprove}
                action="approve"
                recordLabel={`PCB-${batchId ?? ""}`}
                loading={acting}
                description="Approve the complete batch, including all Price Type and List Cost lines?"
                onOpenChange={setConfirmingApprove}
                onConfirm={async (effectiveAt) => {
                    if (!batchId || !onApprove) return;
                    await onApprove(batchId, effectiveAt);
                    setConfirmingApprove(false);
                    onOpenChange(false);
                }}
            />

            <RejectDialog
                open={rejecting}
                loading={acting}
                title="Reject Unified Price Change Batch"
                onOpenChange={setRejecting}
                onConfirm={async (reason) => {
                    if (!batchId || !onReject || !reason) return;
                    await onReject(batchId, reason);
                    setRejecting(false);
                    onOpenChange(false);
                }}
            />
        </>
    );
}
