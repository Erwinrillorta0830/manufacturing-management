"use client";

import React, { useMemo } from "react";
import {
    Ban,
    Check,
    FileCheck2,
    History,
    Loader2,
    Printer,
    RotateCcw,
    ShieldCheck,
    X,
} from "lucide-react";
import { toast } from "sonner";
import type { PurchaseOrderApprovalDetail, PurchaseOrderDecisionStage } from "../../purchase-order/types";
import type { IncomingShipment, ShipmentLineItem, Supplier } from "../../procurement/types";
import RevisionSnapshotComparison from "./RevisionSnapshotComparison";
import { downloadPurchaseOrderPrintable } from "../../purchase-order/services/purchase-order-print-api";
import { calculatePercentageDiscount } from "../../procurement/discount-calculation";
import { EXCHANGE_RATE_DECIMAL_SCALE, PROCUREMENT_MONEY_DECIMAL_SCALE } from "../../decimal";
import { CancelPurchaseOrderDialog } from "../../procurement/components/incoming-shipments/CancelPurchaseOrderDialog";
import { formatPhtDateTime } from "../pht-date-time";

function money(value: unknown, currency = "PHP") {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency,
        minimumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE,
        maximumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE
    }).format(Number(value || 0));
}

function statusBadge(status: string) {
    const styles: Record<string, string> = {
        "For Approval": "border-amber-300 bg-amber-50 text-amber-700",
        Requested: "border-amber-300 bg-amber-50 text-amber-700",
        "Pending Payment": "border-amber-300 bg-amber-50 text-amber-700",
        Approved: "border-emerald-300 bg-emerald-50 text-emerald-700",
        "Awaiting Payment": "border-orange-300 bg-orange-50 text-orange-700",
        "QA Receiving": "border-blue-300 bg-blue-50 text-blue-700",
        "Receiving (QA)": "border-blue-300 bg-blue-50 text-blue-700",
        Cancelled: "border-zinc-300 bg-zinc-50 text-zinc-700",
        Rejected: "border-red-300 bg-red-50 text-red-700",
        Revision: "border-orange-300 bg-orange-50 text-orange-700"
    };
    return (
        <span className={`inline-flex max-w-full rounded border px-2 py-1 text-[10px] font-bold uppercase ${styles[status] || "border-border bg-muted text-muted-foreground"}`}>
            {status}
        </span>
    );
}

function statusForApprovalStage(status: string) {
    return status === "Requested" ? "For Approval" : status;
}

interface FinanceDecisionControlsProps {
    stage: PurchaseOrderDecisionStage;
    shipment: IncomingShipment;
    supplierName: string;
    branchName?: string | null;
    detail: PurchaseOrderApprovalDetail;
    approve: (id: number) => Promise<void>;
    requestRevision: (id: number, remarks: string) => Promise<void>;
    cancel: (id: number, remarks: string) => Promise<void>;
    onReload: () => Promise<void>;
}

function FinanceDecisionControls({
    stage,
    shipment,
    supplierName,
    branchName = null,
    detail,
    approve,
    requestRevision,
    cancel,
    onReload
}: FinanceDecisionControlsProps) {
    const [remarks, setRemarks] = React.useState("");
    const [submitting, setSubmitting] = React.useState<"approve" | "revision" | "cancel" | null>(null);
    const [remarksError, setRemarksError] = React.useState<string | null>(null);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = React.useState(false);
    const remarksRef = React.useRef<HTMLTextAreaElement | null>(null);
    const actionable = detail.stage === stage;

    if (!actionable) return null;

    const handleActionError = async (error: unknown) => {
        const message = (error as Error).message || "Finance approval action failed.";
        toast.error(message);
        if (/changed|reload|pending approval/i.test(message)) await onReload();
    };

    const flagRemarksError = (message: string) => {
        setRemarksError(message);
        toast.error(message);
        window.requestAnimationFrame(() => {
            remarksRef.current?.focus();
            remarksRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    };

    const handleApprove = async () => {
        try {
            setSubmitting("approve");
            await approve(shipment.shipment_id);
            toast.success("Finance approval completed. The purchase order is now available in Warehouse Receiving.");
        } catch (error) {
            await handleActionError(error);
        } finally {
            setSubmitting(null);
        }
    };

    const handleRevision = async () => {
        if (!remarks.trim()) {
            flagRemarksError("Enter a reason for revision.");
            return;
        }
        try {
            setSubmitting("revision");
            await requestRevision(shipment.shipment_id, remarks.trim());
            toast.success("Purchase order sent for revision.");
        } catch (error) {
            const message = (error as Error).message || "";
            if (/remark|reason/i.test(message)) flagRemarksError(message);
            else await handleActionError(error);
        } finally {
            setSubmitting(null);
        }
    };

    const openCancelDialog = () => {
        if (!remarks.trim()) {
            flagRemarksError("Enter a cancellation reason.");
            return;
        }
        setIsCancelDialogOpen(true);
    };

    const handleCancelConfirm = async (reason: string) => {
        try {
            setSubmitting("cancel");
            await cancel(shipment.shipment_id, reason);
            toast.success("Purchase order cancelled by Finance.");
            return true;
        } catch (error) {
            await handleActionError(error);
            return false;
        } finally {
            setSubmitting(null);
        }
    };

    return (
        <div className="space-y-3 border-y py-4">
            <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Decision remarks</span>
                <textarea
                    ref={remarksRef}
                    value={remarks}
                    onChange={event => {
                        setRemarks(event.target.value);
                        if (remarksError) setRemarksError(null);
                    }}
                    maxLength={1000}
                    placeholder="Required when sending for revision or cancelling"
                    aria-invalid={Boolean(remarksError)}
                    className={`min-h-20 w-full resize-y rounded-md border bg-background p-3 text-xs outline-none focus:ring-2 ${remarksError ? "border-destructive focus:ring-destructive" : "focus:ring-ring"}`}
                />
                {remarksError && (
                    <p className="mt-1.5 text-[11px] font-semibold text-destructive" role="alert">{remarksError}</p>
                )}
            </label>
            <div className="flex flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
                <button type="button" onClick={openCancelDialog} disabled={submitting !== null} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-zinc-700 px-3 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Cancel PO
                </button>
                <button type="button" onClick={handleRevision} disabled={submitting !== null} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting === "revision" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Revision
                </button>
                <button type="button" onClick={handleApprove} disabled={submitting !== null} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve PO
                </button>
            </div>

            <CancelPurchaseOrderDialog
                open={isCancelDialogOpen}
                onOpenChange={(open) => {
                    if (submitting === null) setIsCancelDialogOpen(open);
                }}
                purchaseOrderNo={shipment.purchase_order_no || shipment.reference_number || `#${shipment.shipment_id}`}
                supplierName={supplierName}
                branchName={branchName}
                totalLabel={money(detail.order.total_amount)}
                stageLabel={stage}
                reasonMode="summary"
                reasonText={remarks.trim()}
                loading={submitting === "cancel"}
                onConfirm={handleCancelConfirm}
            />
        </div>
    );
}

export interface FinanceApprovalDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    stage: PurchaseOrderDecisionStage;
    shipment: IncomingShipment | null;
    shipmentLines: ShipmentLineItem[];
    approvalDetail: PurchaseOrderApprovalDetail | null;
    supplierName: string;
    loading: boolean;
    error: string | null;
    onRetry: () => void | Promise<void>;
    approve: (id: number) => Promise<void>;
    requestRevision: (id: number, remarks: string) => Promise<void>;
    cancel: (id: number, remarks: string) => Promise<void>;
}

export default function FinanceApprovalDetailModal({
    isOpen,
    onClose,
    stage,
    shipment,
    shipmentLines,
    approvalDetail,
    supplierName,
    loading,
    error,
    onRetry,
    approve,
    requestRevision,
    cancel
}: FinanceApprovalDetailModalProps) {
    const [printLoading, setPrintLoading] = React.useState(false);

    const financeFeedback = useMemo(
        () => approvalDetail?.history
            .filter(entry =>
                entry.approval_stage === "Finance"
                && (entry.action === "Revision" || entry.action === "Rejected" || entry.action === "Cancelled")
                && Boolean(entry.remarks?.trim())
            )
            .slice()
            .reverse() || [],
        [approvalDetail]
    );

    if (!isOpen) return null;

    const handlePrintFinanceDecision = async () => {
        if (!shipment || !approvalDetail) return;
        const decision = approvalDetail.history
            .slice()
            .reverse()
            .find(entry => entry.approval_stage === "Finance" && ["FinanceApproved", "Revision", "Rejected", "Cancelled"].includes(entry.action));
        if (!decision) {
            toast.error("No Finance decision is available to print.");
            return;
        }
        try {
            setPrintLoading(true);
            await downloadPurchaseOrderPrintable({
                purchaseOrderId: shipment.shipment_id,
                documentType: "FINANCE_DECISION",
                historyId: decision.history_id
            });
            toast.success("Finance decision printable downloaded.");
        } catch (err) {
            toast.error((err as Error).message || "Unable to generate the Finance decision printable.");
        } finally {
            setPrintLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-black tracking-tight text-foreground">
                            Finance Review · {shipment ? (shipment.purchase_order_no || shipment.reference_number || `PO #${shipment.shipment_id}`) : "Loading..."}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Evaluate line pricing, discounts, currency rates, and execute approval decisions.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close finance review modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground">
                            <Loader2 className="mb-2 h-6 w-6 animate-spin text-primary" />
                            Loading Finance approval details...
                        </div>
                    )}

                    {!loading && error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
                            <p className="text-sm font-bold text-red-700">Unable to open this Finance approval record</p>
                            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => void onRetry()}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                                >
                                    Retry
                                </button>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-xs font-bold text-foreground hover:bg-muted"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}

                    {!loading && !error && (!shipment || !approvalDetail) && (
                        <div className="rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground">
                            <p className="font-semibold">Finance approval details are unavailable.</p>
                            <button
                                type="button"
                                onClick={() => void onRetry()}
                                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-primary bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !error && shipment && approvalDetail && (
                        <div className="space-y-5">
                            <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-bold">{approvalDetail.order.purchase_order_no || shipment.purchase_order_no || shipment.reference_number}</h3>
                                        {statusBadge(statusForApprovalStage(shipment.status))}
                                    </div>
                                    <p className="mt-1 break-words text-xs text-muted-foreground">{supplierName}</p>
                                    <p className="mt-1 break-words text-[11px] text-muted-foreground">Reference: {approvalDetail.order.reference || shipment.reference_number || "-"}</p>
                                </div>
                                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Finance approval stage</div>
                                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"><ShieldCheck className="h-4 w-4" /> {approvalDetail.stage}</div>
                                    <button
                                        type="button"
                                        onClick={handlePrintFinanceDecision}
                                        disabled={printLoading}
                                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {printLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                        {printLoading ? "Preparing..." : "Print decision"}
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                                <div><div className="text-[10px] uppercase text-muted-foreground">PHP total</div><div className="mt-1 text-sm font-bold">{money(approvalDetail.order.total_amount)}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Foreign total</div><div className="mt-1 text-sm font-bold">{money(approvalDetail.order.total_foreign_currency, approvalDetail.order.currency_code || "PHP")}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Exchange rate</div><div className="mt-1 text-sm font-bold">{approvalDetail.order.currency_code === "PHP" ? "1.000000" : Number(approvalDetail.order.exchange_rate) > 0 ? Number(approvalDetail.order.exchange_rate).toFixed(EXCHANGE_RATE_DECIMAL_SCALE) : "Unavailable"}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Revision Count</div><div className="mt-1 text-sm font-bold">{approvalDetail.revisionCount}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Created at (PHT)</div><div className="mt-1 text-sm font-bold">{formatPhtDateTime(approvalDetail.order.date_encoded)}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Approved at (PHT)</div><div className="mt-1 text-sm font-bold">{formatPhtDateTime(approvalDetail.order.date_approved)}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Sent for revision</div><div className="mt-1 text-sm font-bold">{formatPhtDateTime(approvalDetail.order.for_revision_at)}</div></div>
                            </div>

                            {statusForApprovalStage(shipment.status) === "Cancelled" && (shipment.cancelled_at || shipment.cancelled_by) && (
                                <div className="rounded-md border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                                    <div className="text-[10px] font-semibold uppercase text-zinc-600 dark:text-zinc-300">Cancellation audit</div>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                        <span>
                                            Cancelled by:{" "}
                                            <strong className="font-bold text-foreground">
                                                {shipment.cancelled_by_name
                                                    || (shipment.cancelled_by ? `User #${shipment.cancelled_by}` : "Not recorded")}
                                            </strong>
                                        </span>
                                        <span>
                                            Cancelled at:{" "}
                                            <strong className="font-bold text-foreground">{formatPhtDateTime(shipment.cancelled_at)}</strong>
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-3 lg:grid-cols-2">
                                <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3">
                                    <div className="text-[10px] font-semibold uppercase text-blue-700">PO Remarks</div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">
                                        {approvalDetail.order.remark || "No purchase notes or special terms entered."}
                                    </p>
                                </div>
                                {financeFeedback.length > 0 && (
                                    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
                                        <div className="text-[10px] font-semibold uppercase text-amber-700">Finance Feedback</div>
                                        <div className="mt-2 space-y-2">
                                            {financeFeedback.map(entry => (
                                                <div key={entry.history_id} className="border-t border-amber-200/70 pt-2 first:border-t-0 first:pt-0">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-amber-800">
                                                        <span className="break-words">{entry.action} · {entry.actor_name}</span>
                                                        <span className="shrink-0">{formatPhtDateTime(entry.created_at)}</span>
                                                    </div>
                                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">{entry.remarks}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {stage === "Finance" && (
                                <div className="rounded-md border bg-muted/20 p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <div className="text-[10px] font-semibold uppercase text-muted-foreground">Matched rule</div>
                                            <div className="mt-1 break-words text-xs font-bold">{approvalDetail.matchedRule.ruleName}</div>
                                        </div>
                                        <span className="w-fit rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">Finance approval</span>
                                    </div>
                                    <div className="mt-2 break-words text-[11px] text-muted-foreground">
                                        Categories: {approvalDetail.categoryIds.length ? approvalDetail.categoryIds.join(", ") : "Uncategorized"} | Self-approval: Permitted
                                    </div>
                                </div>
                            )}

                            <FinanceDecisionControls
                                key={`${shipment.shipment_id}-${approvalDetail.order.workflow_revision || 0}-${approvalDetail.stage}`}
                                stage={stage}
                                shipment={shipment}
                                supplierName={supplierName}
                                detail={approvalDetail}
                                approve={approve}
                                requestRevision={requestRevision}
                                cancel={cancel}
                                onReload={onRetry}
                            />

                            <div>
                                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold"><FileCheck2 className="h-4 w-4 text-primary" /> Purchase-order lines</h3>
                                <div className="overflow-x-auto rounded-md border">
                                    <table className="w-full min-w-[680px] text-xs">
                                        <thead className="border-b bg-muted/50 text-left text-[10px] uppercase text-muted-foreground">
                                            <tr><th className="p-2.5">Product Name</th><th className="p-2.5 text-right">Qty</th><th className="p-2.5 text-right">{approvalDetail.order.currency_code === "PHP" ? "Unit Price (PHP)" : `Invoice Unit Price (${approvalDetail.order.currency_code || "foreign currency"})`}</th><th className="p-2.5">Discount Type</th><th className="p-2.5 text-right">Net ({approvalDetail.order.currency_code || "PHP"})</th></tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {shipmentLines.map((line, index) => {
                                                const currency = approvalDetail.order.currency_code || "PHP";
                                                const product = typeof line.product_id === "object" ? line.product_id : null;
                                                const productName = product?.product_name || `Product ${line.product_id}`;
                                                const productCode = product?.product_code ? ` [${product.product_code}]` : "";
                                                const quantity = Number(line.quantity_ordered || 0);
                                                const unitPrice = Number(currency === "PHP" ? line.base_unit_cost_php : line.unit_price_foreign);
                                                const hasUnitPrice = Number.isFinite(unitPrice) && unitPrice >= 0;
                                                const gross = hasUnitPrice ? quantity * unitPrice : 0;
                                                const discountMode = line.discount_mode || "Percentage";
                                                let discountPercent = Number(line.discount_percent || 0);
                                                let discountLabel = "No Discount";
                                                if (line.discount_type && typeof line.discount_type === "object") {
                                                    const discountType = line.discount_type as { discount_type: string; total_percent: number };
                                                    discountPercent = Number(discountType.total_percent || discountPercent);
                                                    discountLabel = `${discountType.discount_type} (${discountPercent.toFixed(1)}%)`;
                                                } else if (discountPercent > 0) {
                                                    discountLabel = `${discountPercent.toFixed(1)}%`;
                                                }
                                                const discountAmount = discountMode === "Fixed Amount"
                                                    ? Number(line.discount_amount_foreign || 0)
                                                    : Number(calculatePercentageDiscount(quantity, hasUnitPrice ? unitPrice : 0, discountPercent).discountAmount);
                                                if (discountMode === "Fixed Amount") discountLabel = `Fixed Amount (${money(discountAmount, currency)})`;
                                                const net = gross - discountAmount;
                                                return (
                                                    <tr key={line.line_id || index} className="hover:bg-muted/20">
                                                        <td className="break-words p-2.5 font-semibold text-foreground">{productName}{productCode}</td>
                                                        <td className="p-2.5 text-right font-mono font-medium">{quantity.toLocaleString()}</td>
                                                        <td className="p-2.5 text-right font-mono font-medium">{hasUnitPrice ? money(unitPrice, currency) : "Unavailable"}</td>
                                                        <td className="p-2.5 text-xs"><span className="inline-flex max-w-full whitespace-normal rounded border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{discountLabel}</span></td>
                                                        <td className="p-2.5 text-right font-mono font-black text-primary">{money(net, currency)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {stage === "Finance" && <RevisionSnapshotComparison detail={approvalDetail} selectedShipment={shipment} currentLines={shipmentLines} />}

                            <div>
                                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold"><History className="h-4 w-4 text-primary" /> Approval history</h3>
                                {approvalDetail.history.length === 0 ? <p className="text-xs text-muted-foreground">No workflow actions recorded.</p> : (
                                    <div className="divide-y rounded-md border">
                                        {approvalDetail.history.map(entry => (
                                            <div key={entry.history_id} className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                                                        <span>{entry.action}</span>
                                                        <span className="text-muted-foreground">({entry.approval_stage})</span>
                                                        {entry.action === "Resubmitted" && (
                                                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${entry.revision_snapshot ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                                                                {entry.revision_snapshot ? "Snapshot available" : "Legacy revision"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{entry.actor_name}{entry.remarks ? ` | ${entry.remarks}` : ""}</div>
                                                </div>
                                                <div className="shrink-0 text-left text-[10px] text-muted-foreground sm:text-right"><div>{formatPhtDateTime(entry.created_at)}</div><div className="mt-1">Revision {entry.revision_before} to {entry.revision_after}</div></div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
