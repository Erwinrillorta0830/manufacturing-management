"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Ban,
    Check,
    CheckCircle2,
    Clock3,
    FileCheck2,
    History,
    Loader2,
    Printer,
    Search,
    ShieldCheck,
    X
} from "lucide-react";
import { toast } from "sonner";
import { usePurchaseOrderApproval, type PurchaseOrderApprovalMode } from "../purchase-order-approval/hooks/usePurchaseOrderApproval";
import type { PurchaseOrderApprovalDetail, PurchaseOrderDecisionStage } from "../purchase-order/types";
import type { IncomingShipment, Supplier } from "../procurement/types";
import RevisionSnapshotComparison from "./components/RevisionSnapshotComparison";
import { downloadPurchaseOrderPrintable } from "../purchase-order/services/purchase-order-print-api";
import { calculatePercentageDiscount } from "../procurement/discount-calculation";

type QueueTab = "For Approval" | "Approved" | "Rejected";

const queueTabs: Array<{ value: QueueTab; label: string; icon: typeof Clock3; activeClass: string }> = [
    { value: "For Approval", label: "For Approval", icon: Clock3, activeClass: "border-amber-300 bg-amber-50 text-amber-700 shadow-sm" },
    { value: "Approved", label: "Approved", icon: CheckCircle2, activeClass: "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm" },
    { value: "Rejected", label: "Rejected", icon: X, activeClass: "border-red-300 bg-red-50 text-red-700 shadow-sm" }
];

function money(value: unknown, currency = "PHP") {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function dateTime(value?: string | null) {
    return value ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "-";
}

function statusBadge(status: string) {
    const styles: Record<string, string> = {
        "For Approval": "border-amber-300 bg-amber-50 text-amber-700",
        Requested: "border-amber-300 bg-amber-50 text-amber-700",
        "Pending Payment": "border-amber-300 bg-amber-50 text-amber-700",
        Approved: "border-emerald-300 bg-emerald-50 text-emerald-700",
        "Awaiting Payment": "border-orange-300 bg-orange-50 text-orange-700",
        "Receiving (QA)": "border-blue-300 bg-blue-50 text-blue-700",
        Cancelled: "border-zinc-300 bg-zinc-50 text-zinc-700",
        Rejected: "border-red-300 bg-red-50 text-red-700"
    };
    return <span className={`inline-flex max-w-full rounded border px-2 py-1 text-[10px] font-bold uppercase ${styles[status] || "border-border bg-muted text-muted-foreground"}`}>{status}</span>;
}

function statusForApprovalStage(status: string) {
    return status === "Requested" ? "For Approval" : status;
}

function supplierLabel(
    shipment: IncomingShipment,
    detail: PurchaseOrderApprovalDetail,
    suppliers: Supplier[]
) {
    const value = detail.order.supplier_name ?? shipment.supplier_id;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const label = record.supplier_name;
        if (typeof label === "string" && label.trim()) return label.trim();
        const id = Number(record.id ?? record.supplier_id);
        const mapped = suppliers.find(supplier => supplier.id === id);
        if (mapped) return mapped.supplier_name;
    }
    const id = Number(value);
    const mapped = suppliers.find(supplier => supplier.id === id);
    if (mapped) return mapped.supplier_name;
    const reference = detail.referenceLabels.suppliers.find(option => option.id === id);
    return reference?.label || (typeof value === "string" && value.trim() ? value.trim() : "Unknown supplier");
}

interface FinanceDecisionControlsProps {
    stage: PurchaseOrderDecisionStage;
    shipment: IncomingShipment;
    detail: PurchaseOrderApprovalDetail;
    approve: (id: number) => Promise<void>;
    reject: (id: number, remarks: string) => Promise<void>;
    cancel: (id: number, remarks: string) => Promise<void>;
    onReload: () => Promise<void>;
}

function FinanceDecisionControls({
    stage,
    shipment,
    detail,
    approve,
    reject,
    cancel,
    onReload
}: FinanceDecisionControlsProps) {
    const [remarks, setRemarks] = useState("");
    const [submitting, setSubmitting] = useState<"approve" | "reject" | "cancel" | null>(null);
    const actionable = detail.stage === stage;

    if (!actionable) return null;

    const handleActionError = async (error: unknown) => {
        const message = (error as Error).message || "Finance approval action failed.";
        toast.error(message);
        if (/changed|reload|pending approval/i.test(message)) await onReload();
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

    const handleReject = async () => {
        if (!remarks.trim()) {
            toast.error("Enter a rejection reason.");
            return;
        }
        try {
            setSubmitting("reject");
            await reject(shipment.shipment_id, remarks.trim());
            toast.success("Purchase order rejected by Finance.");
        } catch (error) {
            await handleActionError(error);
        } finally {
            setSubmitting(null);
        }
    };

    const handleCancel = async () => {
        if (!remarks.trim()) {
            toast.error("Enter a cancellation reason.");
            return;
        }
        if (!window.confirm("Cancel this purchase order from Finance approval? This action cannot be undone.")) return;
        try {
            setSubmitting("cancel");
            await cancel(shipment.shipment_id, remarks.trim());
            toast.success("Purchase order cancelled by Finance.");
        } catch (error) {
            await handleActionError(error);
        } finally {
            setSubmitting(null);
        }
    };

    return (
        <div className="space-y-3 border-y py-4">
            <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Decision remarks</span>
                <textarea
                    value={remarks}
                    onChange={event => setRemarks(event.target.value)}
                    maxLength={1000}
                    placeholder="Required when rejecting or cancelling"
                    className="min-h-20 w-full resize-y rounded-md border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
            </label>
            <div className="flex flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
                <button type="button" onClick={handleCancel} disabled={submitting !== null} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-zinc-700 px-3 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Cancel PO
                </button>
                <button type="button" onClick={handleReject} disabled={submitting !== null} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject PO
                </button>
                <button type="button" onClick={handleApprove} disabled={submitting !== null} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve PO
                </button>
            </div>
        </div>
    );
}

interface ApprovalModuleProps {
    stage: PurchaseOrderDecisionStage;
    mode?: PurchaseOrderApprovalMode;
    purchaseOrderId?: number;
}

export default function ApprovalModule({ stage, mode = "queue", purchaseOrderId }: ApprovalModuleProps) {
    const router = useRouter();
    const {
        loading,
        queueError,
        pagination,
        detailLoading,
        detailError,
        retryDetail,
        suppliers,
        shipments,
        selectedShipment,
        selectedShipmentLines,
        approvalDetail,
        approve,
        reject,
        cancel,
        load
    } = usePurchaseOrderApproval(stage, { mode, purchaseOrderId });
    const [tab, setTab] = useState<QueueTab>("For Approval");
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);
    const [printLoading, setPrintLoading] = useState(false);
    const isDetailMode = mode === "detail";

    useEffect(() => {
        if (isDetailMode) return;
        const timeout = window.setTimeout(() => {
            void load({ page: 1, status: tab, search, limit: pageSize });
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [isDetailMode, load, pageSize, search, tab]);

    const supplierName = useMemo(
        () => selectedShipment && approvalDetail
            ? supplierLabel(selectedShipment, approvalDetail, suppliers)
            : "Unknown supplier",
        [approvalDetail, selectedShipment, suppliers]
    );

    const financeFeedback = useMemo(
        () => approvalDetail?.history
            .filter(entry =>
                entry.approval_stage === "Finance"
                && (entry.action === "Rejected" || entry.action === "Cancelled")
                && Boolean(entry.remarks?.trim())
            )
            .slice()
            .reverse() || [],
        [approvalDetail]
    );

    const handlePrintFinanceDecision = async () => {
        if (!selectedShipment || !approvalDetail) return;
        const decision = approvalDetail.history
            .slice()
            .reverse()
            .find(entry => entry.approval_stage === "Finance" && ["FinanceApproved", "Rejected", "Cancelled"].includes(entry.action));
        if (!decision) {
            toast.error("No Finance decision is available to print.");
            return;
        }
        try {
            setPrintLoading(true);
            await downloadPurchaseOrderPrintable({
                purchaseOrderId: selectedShipment.shipment_id,
                documentType: "FINANCE_DECISION",
                historyId: decision.history_id
            });
            toast.success("Finance decision printable downloaded.");
        } catch (error) {
            toast.error((error as Error).message || "Unable to generate the Finance decision printable.");
        } finally {
            setPrintLoading(false);
        }
    };

    if (isDetailMode) {
        return (
            <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <button
                            type="button"
                            onClick={() => router.push("/mm/finance-approval")}
                            className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                        >
                            <span aria-hidden="true">←</span>
                            Back to Finance Approval Queue
                        </button>
                        <h1 className="truncate text-sm font-extrabold text-foreground">
                            {selectedShipment ? `Purchase Order Finance Approval: ${selectedShipment.purchase_order_no || selectedShipment.reference_number}` : `Purchase Order ${purchaseOrderId ?? ""}`}
                        </h1>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            Review one purchase order at a time without keeping the approval queue open beside the detail.
                        </p>
                    </div>
                    {selectedShipment && (
                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                            <span className="rounded-full border bg-background px-3 py-1.5 text-[10px] font-extrabold text-muted-foreground">PO ID: {selectedShipment.shipment_id}</span>
                            {approvalDetail && statusBadge(statusForApprovalStage(selectedShipment.status))}
                        </div>
                    )}
                </div>

                {detailLoading && (
                    <div className="rounded-xl border bg-card p-10 text-center text-xs text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
                        Loading Finance approval details...
                    </div>
                )}

                {!detailLoading && detailError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
                        <p className="text-sm font-bold text-red-700">Unable to open this Finance approval record</p>
                        <p className="mt-1 text-xs text-muted-foreground">{detailError}</p>
                        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                            <button type="button" onClick={() => void retryDetail()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90">
                                Retry
                            </button>
                            <button type="button" onClick={() => router.push("/mm/finance-approval")} className="inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-xs font-bold text-foreground hover:bg-muted">
                                Return to Queue
                            </button>
                        </div>
                    </div>
                )}

                {!detailLoading && !detailError && (!selectedShipment || !approvalDetail) && (
                    <div className="rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground">
                        <p className="font-semibold">Finance approval details are unavailable.</p>
                        <button type="button" onClick={() => void retryDetail()} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-primary bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90">
                            Retry
                        </button>
                    </div>
                )}

                {!detailLoading && !detailError && selectedShipment && approvalDetail && (
                    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
                        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-sm font-bold">{approvalDetail.order.purchase_order_no || selectedShipment.purchase_order_no || selectedShipment.reference_number}</h2>
                                    {statusBadge(statusForApprovalStage(selectedShipment.status))}
                                </div>
                                <p className="mt-1 break-words text-xs text-muted-foreground">{supplierName}</p>
                                <p className="mt-1 break-words text-[11px] text-muted-foreground">Reference: {approvalDetail.order.reference || selectedShipment.reference_number || "-"}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                                <div className="text-[10px] font-semibold uppercase text-muted-foreground">Finance approval stage</div>
                                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"><ShieldCheck className="h-4 w-4" /> {approvalDetail.stage}</div>
                                <button
                                    type="button"
                                    onClick={handlePrintFinanceDecision}
                                    disabled={printLoading}
                                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {printLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                    {printLoading ? "Preparing..." : "Print decision"}
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div><div className="text-[10px] uppercase text-muted-foreground">PHP total</div><div className="mt-1 text-sm font-bold">{money(approvalDetail.order.total_amount)}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Foreign total</div><div className="mt-1 text-sm font-bold">{money(approvalDetail.order.total_foreign_currency, approvalDetail.order.currency_code || "PHP")}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Exchange rate</div><div className="mt-1 text-sm font-bold">{approvalDetail.order.currency_code === "PHP" ? "1.0000" : Number(approvalDetail.order.exchange_rate) > 0 ? Number(approvalDetail.order.exchange_rate).toFixed(4) : "Unavailable"}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Revision Count</div><div className="mt-1 text-sm font-bold">{approvalDetail.revisionCount}</div></div>
                        </div>

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
                                                    <span className="shrink-0">{dateTime(entry.created_at)}</span>
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
                            key={`${selectedShipment.shipment_id}-${approvalDetail.order.workflow_revision || 0}-${approvalDetail.stage}`}
                            stage={stage}
                            shipment={selectedShipment}
                            detail={approvalDetail}
                            approve={approve}
                            reject={reject}
                            cancel={cancel}
                            onReload={retryDetail}
                        />

                        <div>
                            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold"><FileCheck2 className="h-4 w-4 text-primary" /> Purchase-order lines</h3>
                            <div className="overflow-x-auto rounded-md border">
                                <table className="w-full min-w-[680px] text-xs">
                                    <thead className="border-b bg-muted/50 text-left text-[10px] uppercase text-muted-foreground">
                                        <tr><th className="p-2.5">Product Name</th><th className="p-2.5 text-right">Qty</th><th className="p-2.5 text-right">{approvalDetail.order.currency_code === "PHP" ? "Unit Price (PHP)" : `Invoice Unit Price (${approvalDetail.order.currency_code || "foreign currency"})`}</th><th className="p-2.5">Discount Type</th><th className="p-2.5 text-right">Net ({approvalDetail.order.currency_code || "PHP"})</th></tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {selectedShipmentLines.map((line, index) => {
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

                        {stage === "Finance" && <RevisionSnapshotComparison detail={approvalDetail} selectedShipment={selectedShipment} currentLines={selectedShipmentLines} />}

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
                                            <div className="shrink-0 text-left text-[10px] text-muted-foreground sm:text-right"><div>{dateTime(entry.created_at)}</div><div className="mt-1">Revision {entry.revision_before} to {entry.revision_after}</div></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const retryQueue = () => void load({ page: pagination.page, status: tab, search, limit: pageSize });
    const goToQueuePage = (page: number) => {
        void load({ page, status: tab, search, limit: pageSize });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-1 rounded-xl border bg-muted/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-base font-bold">Purchase Order Finance Approval</h1>
                    <p className="text-xs text-muted-foreground">Select a purchase order to open its dedicated Finance approval workspace.</p>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{pagination.total} record{pagination.total === 1 ? "" : "s"}</span>
            </div>

            <section className="w-full overflow-hidden rounded-xl border bg-card">
                <div className="space-y-3 border-b p-3 sm:p-4">
                    <div className="flex gap-1 overflow-x-auto rounded-md border bg-muted/30 p-1" aria-label="Filter purchase orders by status">
                        {queueTabs.map(item => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => setTab(item.value)}
                                    aria-pressed={tab === item.value}
                                    className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded border px-3 text-xs font-semibold ${tab === item.value ? item.activeClass : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="Search PO, reference, or supplier"
                            aria-label="Search purchase orders"
                            className="min-h-10 w-full rounded-md border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : queueError ? (
                    <div className="p-10 text-center">
                        <p className="text-sm font-bold text-red-700">Unable to load the Finance approval queue</p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">{queueError}</p>
                        <button type="button" onClick={retryQueue} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-primary bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90">Retry</button>
                    </div>
                ) : shipments.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">No purchase orders found for this Finance approval filter.</div>
                ) : (
                    <>
                        <div className="hidden grid-cols-[1.1fr_1.4fr_1fr_1fr_1fr_auto] gap-3 border-b bg-muted/30 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                            <span>PO No. / Reference</span><span>Supplier</span><span>Approval Status</span><span>PO Lifecycle</span><span>Total Amount</span><span>Action</span>
                        </div>
                        <div className="divide-y">
                            {shipments.map(order => {
                                const supplier = typeof order.supplier_id === "object"
                                    ? order.supplier_id?.supplier_name
                                    : suppliers.find(item => item.id === Number(order.supplier_id))?.supplier_name;
                                const lifecycleStatus = statusForApprovalStage(order.status);
                                const workflowStage = !order.finance_id && (order.status === "For Approval" || order.status === "Requested")
                                    ? "Finance"
                                    : lifecycleStatus;
                                const orderLabel = order.purchase_order_no || order.reference_number || `PO ${order.shipment_id}`;
                                return (
                                    <button
                                        key={order.shipment_id}
                                        type="button"
                                        onClick={() => router.push(`/mm/finance-approval/${encodeURIComponent(String(order.shipment_id))}`)}
                                        className="grid w-full gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[1.1fr_1.4fr_1fr_1fr_1fr_auto] md:items-center"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-bold" title={orderLabel}>{orderLabel}</span>
                                            <span className="mt-1 block truncate text-[11px] text-muted-foreground" title={order.reference_number || "No reference"}>{order.reference_number || "No reference"}</span>
                                        </span>
                                        <span className="min-w-0 truncate text-[11px] text-muted-foreground" title={supplier || "Unknown supplier"}>{supplier || "Unknown supplier"}</span>
                                        <span>{statusBadge(tab)}</span>
                                        <span className="text-[11px] font-semibold text-muted-foreground">{workflowStage}</span>
                                        <span className="font-mono text-xs font-bold text-foreground">{money(order.total_php_value)}</span>
                                        <span className="text-xs font-bold text-primary md:text-right">Review PO <span aria-hidden="true">→</span></span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-col gap-3 border-t bg-muted/10 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-muted-foreground">
                                Page <span className="font-semibold text-foreground">{pagination.page}</span> of <span className="font-semibold text-foreground">{pagination.totalPages}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span>Rows per page</span>
                                    <select
                                        aria-label="Rows per page"
                                        value={pageSize}
                                        onChange={event => setPageSize(Number(event.target.value))}
                                        className="h-9 rounded-md border bg-background px-2 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => goToQueuePage(pagination.page - 1)}
                                    disabled={loading || pagination.page <= 1}
                                    className="inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => goToQueuePage(pagination.page + 1)}
                                    disabled={loading || pagination.page >= pagination.totalPages}
                                    className="inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
