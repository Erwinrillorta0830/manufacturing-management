"use client";

import { useEffect, useMemo, useState } from "react";
import {
    CalendarDays,
    Check,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    FileCheck2,
    History,
    Loader2,
    Search,
    ShieldCheck,
    X
} from "lucide-react";
import { toast } from "sonner";
import { usePurchaseOrderApproval } from "../purchase-order-approval/hooks/usePurchaseOrderApproval";
import type { PurchaseOrderDecisionStage } from "../purchase-order/types";
import { INVENTORY_STATUS, PAYMENT_STATUS } from "@/app/api/manufacturing/procurement/_domain";

type QueueTab = "For Approval" | "Awaiting Payment" | "Approved" | "Rejected";

const queueTabs: Array<{ value: QueueTab; label: string; icon: typeof Clock3 }> = [
    { value: "For Approval", label: "For Approval", icon: Clock3 },
    { value: "Awaiting Payment", label: "Awaiting Payment", icon: CircleDollarSign },
    { value: "Approved", label: "Approved", icon: CheckCircle2 },
    { value: "Rejected", label: "Rejected", icon: X }
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
        Cancelled: "border-zinc-300 bg-zinc-50 text-zinc-700",
        Rejected: "border-red-300 bg-red-50 text-red-700"
    };
    return <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${styles[status] || "border-border bg-muted text-muted-foreground"}`}>{status}</span>;
}

function statusForApprovalStage(
    status: string,
    inventoryStatus: number | null | undefined,
    paymentStatus: number | null | undefined,
    stage: PurchaseOrderDecisionStage
) {
    if (stage === "Finance" && Number(paymentStatus) === PAYMENT_STATUS.PENDING) return "Pending Payment";
    if (stage !== "Plant") return status === "Requested" ? "For Approval" : status;
    if (Number(inventoryStatus) === INVENTORY_STATUS.APPROVED) return "Approved";
    return status === "Awaiting Payment" || status === "Requested" ? "For Approval" : status;
}

export default function ApprovalModule({ stage }: { stage: PurchaseOrderDecisionStage }) {
    const {
        loading,
        suppliers,
        shipments,
        selectedShipment,
        setSelectedShipment,
        selectedShipmentLines,
        approvalDetail,
        approve,
        awaitingPayment,
        reject,
        cancelFinance,
        load
    } = usePurchaseOrderApproval(stage);
    const [tab, setTab] = useState<QueueTab>("For Approval");
    const [search, setSearch] = useState("");
    const [eta, setEta] = useState("");
    const [remarks, setRemarks] = useState("");
    const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
    const visibleQueueTabs = useMemo(
        () => stage === "Finance"
            ? queueTabs.filter(item => item.value !== "Approved")
            : queueTabs.filter(item => item.value !== "Awaiting Payment"),
        [stage]
    );

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setSelectedShipment(null);
            void load({ status: tab, search, limit: 100 });
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [load, search, setSelectedShipment, tab]);

    useEffect(() => {
        setEta(approvalDetail?.order.lead_time_receiving?.slice(0, 10) || "");
        setRemarks("");
    }, [approvalDetail]);

    const supplierName = useMemo(() => {
        const value = selectedShipment?.supplier_id;
        if (value && typeof value === "object") return value.supplier_name;
        return suppliers.find(supplier => supplier.id === Number(value))?.supplier_name || "Unknown supplier";
    }, [selectedShipment, suppliers]);

    const handleApprove = async () => {
        if (!selectedShipment || !approvalDetail) return;
        if (approvalDetail.stage !== stage) {
            toast.error(`This purchase order is not awaiting ${stage} approval.`);
            return;
        }
        if (approvalDetail.stage === "Plant" && !eta) {
            toast.error("Set the estimated arrival date before Plant approval.");
            return;
        }
        try {
            setSubmitting("approve");
            if (approvalDetail.stage === "Finance") {
                await awaitingPayment(selectedShipment.shipment_id);
                toast.success("Finance approval completed. The purchase order is awaiting payment.");
            } else {
                await approve(selectedShipment.shipment_id, eta);
                toast.success("Plant approval completed.");
            }
        } catch (error) {
            const message = (error as Error).message || "Approval failed.";
            toast.error(message);
            if (/changed|reload|pending approval/i.test(message)) {
                setSelectedShipment(null);
                await load();
            }
        } finally {
            setSubmitting(null);
        }
    };

    const handleReject = async () => {
        if (!selectedShipment || !approvalDetail) return;
        if (approvalDetail.stage !== stage) {
            toast.error(`This purchase order is not awaiting ${stage} approval.`);
            return;
        }
        if (!remarks.trim()) {
            toast.error("Enter a rejection reason.");
            return;
        }
        try {
            setSubmitting("reject");
            if (approvalDetail.stage === "Finance") {
                await cancelFinance(selectedShipment.shipment_id, remarks.trim());
                toast.success("Purchase order cancelled by Finance.");
            } else {
                await reject(selectedShipment.shipment_id, remarks.trim());
                toast.success("Purchase order rejected.");
            }
        } catch (error) {
            const message = (error as Error).message || "Rejection failed.";
            toast.error(message);
            if (/changed|reload|pending approval/i.test(message)) {
                setSelectedShipment(null);
                await load();
            }
        } finally {
            setSubmitting(null);
        }
    };

    const actionable = approvalDetail?.stage === stage;

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-base font-bold">Purchase Order {stage} Approval</h1>
                    <p className="text-xs text-muted-foreground">Review purchase orders awaiting {stage.toLowerCase()} approval.</p>
                </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(280px,34%)_1fr]">
                <section className="flex min-h-[420px] flex-col overflow-hidden rounded-md border bg-card">
                    <div className="border-b p-3">
                        <div className="mb-3 flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1" aria-label="Filter purchase orders by status">
                            {visibleQueueTabs.map(item => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        onClick={() => setTab(item.value)}
                                        aria-pressed={tab === item.value}
                                        className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-semibold ${tab === item.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
                                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                        ) : shipments.length === 0 ? (
                            <div className="p-8 text-center text-xs text-muted-foreground">No purchase orders found.</div>
                        ) : shipments.map(order => {
                            const supplier = typeof order.supplier_id === "object"
                                ? order.supplier_id?.supplier_name
                                : suppliers.find(item => item.id === Number(order.supplier_id))?.supplier_name;
                            const selected = selectedShipment?.shipment_id === order.shipment_id;
                            const displayedStatus = statusForApprovalStage(order.status, order.inventory_status, order.payment_status, stage);
                            const pendingStageLabel = stage === "Plant"
                                ? (!order.approver_id && Number(order.inventory_status) === INVENTORY_STATUS.REQUESTED ? "Plant" : "")
                                : (order.approval_requires_finance && !order.finance_id ? "Finance" : "");
                            const workflowStage = pendingStageLabel || displayedStatus;
                            return (
                                <button
                                    key={order.shipment_id}
                                    type="button"
                                    onClick={() => setSelectedShipment(order)}
                                    className={`block w-full border-b p-3 text-left transition-colors ${selected ? "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]" : "hover:bg-muted/40"}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-xs font-bold">{order.purchase_order_no || order.reference_number}</div>
                                            <div className="mt-1 truncate text-[11px] text-muted-foreground">{supplier || "Unknown supplier"}</div>
                                        </div>
                                        {statusBadge(displayedStatus)}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                                        <span>{workflowStage}</span>
                                        <span className="font-mono font-semibold text-foreground">{money(order.total_php_value)}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section className="min-h-[420px] overflow-y-auto rounded-md border bg-card">
                    {!selectedShipment ? (
                        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                            <FileCheck2 className="h-10 w-10 opacity-30" />
                            <p className="text-xs">Select a purchase order to review its workflow.</p>
                        </div>
                    ) : !approvalDetail ? (
                        <div className="flex h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : (
                        <div className="space-y-5 p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-sm font-bold">{approvalDetail.order.purchase_order_no || selectedShipment.reference_number}</h2>
                                        {statusBadge(statusForApprovalStage(selectedShipment.status, selectedShipment.inventory_status, selectedShipment.payment_status, stage))}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">{supplierName}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Current stage</div>
                                    <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                                        <ShieldCheck className="h-4 w-4" /> {approvalDetail.stage}
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <div><div className="text-[10px] uppercase text-muted-foreground">PHP total</div><div className="mt-1 text-sm font-bold">{money(approvalDetail.order.total_amount)}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Foreign total</div><div className="mt-1 text-sm font-bold">{money(approvalDetail.order.total_foreign_currency, approvalDetail.order.currency_code || "PHP")}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Exchange rate</div><div className="mt-1 text-sm font-bold">{Number(approvalDetail.order.exchange_rate || 1).toFixed(4)}</div></div>
                                <div><div className="text-[10px] uppercase text-muted-foreground">Revision</div><div className="mt-1 text-sm font-bold">{approvalDetail.order.workflow_revision || 0}</div></div>
                            </div>

                            {stage === "Finance" && (
                            <div className="rounded-md border bg-muted/20 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Matched rule</div>
                                        <div className="mt-1 text-xs font-bold">{approvalDetail.matchedRule.ruleName}</div>
                                    </div>
                                    <span className={`rounded border px-2 py-1 text-[10px] font-bold ${approvalDetail.matchedRule.requiresFinance ? "border-blue-300 bg-blue-50 text-blue-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
                                        {approvalDetail.matchedRule.requiresFinance ? "Plant + Finance" : "Plant only"}
                                    </span>
                                </div>
                                <div className="mt-2 text-[11px] text-muted-foreground">
                                    Categories: {approvalDetail.categoryIds.length ? approvalDetail.categoryIds.join(", ") : "Uncategorized"} | Self-approval: Permitted
                                </div>
                            </div>
                            )}

                            {actionable && (
                                <div className="space-y-3 border-y py-4">
                                    {approvalDetail.stage === "Plant" && (
                                        <label className="block max-w-xs">
                                            <span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Estimated arrival *</span>
                                            <input type="date" value={eta} onChange={event => setEta(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-xs" />
                                        </label>
                                    )}
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Rejection reason</span>
                                        <textarea value={remarks} onChange={event => setRemarks(event.target.value)} maxLength={1000} placeholder="Required only when rejecting" className="min-h-20 w-full resize-y rounded-md border bg-background p-3 text-xs" />
                                    </label>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <button type="button" onClick={handleReject} disabled={submitting !== null} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                                            {submitting === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} {approvalDetail.stage === "Finance" ? "Cancel PO" : "Reject"}
                                        </button>
                                        <button type="button" onClick={handleApprove} disabled={submitting !== null} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                                            {submitting === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {approvalDetail.stage === "Finance" ? "Move to Awaiting Payment" : "Approve Plant"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold"><FileCheck2 className="h-4 w-4 text-primary" /> Purchase-order lines</h3>
                                <div className="overflow-x-auto rounded-md border">
                                    <table className="w-full min-w-[600px] text-xs">
                                        <thead className="bg-muted/50 text-left text-[10px] uppercase text-muted-foreground font-bold border-b">
                                            <tr>
                                                <th className="p-2.5">Product Name</th>
                                                <th className="p-2.5 text-right">Qty</th>
                                                <th className="p-2.5 text-right">Unit Price</th>
                                                <th className="p-2.5">Discount Type</th>
                                                <th className="p-2.5 text-right">Net ({approvalDetail?.order.currency_code || "PHP"})</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {selectedShipmentLines.map((line, idx) => {
                                                const currency = approvalDetail?.order.currency_code || "PHP";
                                                const product = typeof line.product_id === "object" ? line.product_id : null;
                                                const productName = product?.product_name || `Product ${line.product_id}`;
                                                const productCode = product?.product_code ? ` [${product.product_code}]` : "";
                                                const qty = Number(line.quantity_ordered || 0);
                                                const unitPrice = Number(line.unit_price_foreign ?? line.base_unit_cost_php ?? 0);
                                                const gross = qty * unitPrice;

                                                let discPercent = Number(line.discount_percent || 0);
                                                let dtLabel = "No Discount";

                                                if (line.discount_type && typeof line.discount_type === "object") {
                                                    const dtObj = line.discount_type as { discount_type: string; total_percent: number };
                                                    discPercent = Number(dtObj.total_percent || discPercent);
                                                    dtLabel = `${dtObj.discount_type} (${discPercent.toFixed(1)}%)`;
                                                } else if (discPercent > 0) {
                                                    dtLabel = `${discPercent.toFixed(1)}%`;
                                                }

                                                const discAmount = (gross * discPercent) / 100;
                                                const net = gross - discAmount;

                                                return (
                                                    <tr key={line.line_id || idx} className="hover:bg-muted/20">
                                                        <td className="p-2.5 font-semibold text-foreground">
                                                            {productName}{productCode}
                                                        </td>
                                                        <td className="p-2.5 text-right font-mono font-medium">
                                                            {qty.toLocaleString()}
                                                        </td>
                                                        <td className="p-2.5 text-right font-mono font-medium">
                                                            {money(unitPrice, currency)}
                                                        </td>
                                                        <td className="p-2.5 text-xs">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted border text-muted-foreground">
                                                                {dtLabel}
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 text-right font-mono font-black text-primary">
                                                            {money(net, currency)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div>
                                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold"><History className="h-4 w-4 text-primary" /> Approval history</h3>
                                {approvalDetail.history.length === 0 ? <p className="text-xs text-muted-foreground">No workflow actions recorded.</p> : (
                                    <div className="divide-y rounded-md border">{approvalDetail.history.map(entry => (
                                        <div key={entry.history_id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-xs">
                                            <div><div className="font-semibold">{entry.action} <span className="text-muted-foreground">({entry.approval_stage})</span></div><div className="mt-1 text-[11px] text-muted-foreground">{entry.actor_name}{entry.remarks ? ` | ${entry.remarks}` : ""}</div></div>
                                            <div className="text-right text-[10px] text-muted-foreground"><div>{dateTime(entry.created_at)}</div><div className="mt-1">Revision {entry.revision_before} to {entry.revision_after}</div></div>
                                        </div>
                                    ))}</div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
