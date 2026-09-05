import React from "react";
import Link from "next/link";
import { Loader2, Globe, Building2, Calendar, Layers, Info, Anchor, Edit, Trash2, Printer, ArrowLeft, RotateCcw } from "lucide-react";
import { IncomingShipment, ShipmentLineItem, Supplier, PurchaseOrderPaymentMode } from "../../types";
import { formatMoney, getStatusBadge, displayShipmentStatus } from "./ShipmentBadges";
import { INVENTORY_STATUS, paymentStatusLabel } from "@/app/api/manufacturing/procurement/_domain";
import { isLandedCostPostingEligible } from "../../landed-cost-eligibility";
import { UNIT_PRICE_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";
import { calculatePercentageDiscount } from "../../discount-calculation";

export interface ShipmentDetailViewProps {
    loading: boolean;
    activeShipment: IncomingShipment | null;
    canonicalDrafting: boolean;
    paymentTerms?: Array<{
        id: number;
        payment_name: string;
        payment_days?: number | null;
        payment_description?: string | null;
    }>;
    paymentModes?: PurchaseOrderPaymentMode[];
    suppliers: Supplier[];
    branches: Array<{ id: number; branchName: string; branchCode: string }>;
    isSupplierForeign: (s: Supplier | null | undefined) => boolean;
    onUpdateShipmentStatus: (shipmentId: number, status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Warehouse Receiving" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected") => void;
    handleStartEdit: () => void;
    onPrintPurchaseOrder?: () => void;
    printLoading?: boolean;
    onCancelRejectedPurchaseOrder?: (shipmentId: number, workflowRevision: number, remarks?: string) => void | Promise<boolean>;
    lines: ShipmentLineItem[];
    hasShipments: boolean;
    detailError?: string | null;
    referenceError?: string | null;
    onRetryDetail?: () => void;
    backHref?: string;
}

export function ShipmentDetailView({
    loading,
    activeShipment,
    canonicalDrafting,
    paymentTerms = [],
    paymentModes = [],
    suppliers,
    branches,
    isSupplierForeign,
    onUpdateShipmentStatus,
    handleStartEdit,
    onPrintPurchaseOrder,
    printLoading = false,
    onCancelRejectedPurchaseOrder,
    lines,
    hasShipments,
    detailError = null,
    referenceError = null,
    onRetryDetail,
    backHref
}: ShipmentDetailViewProps) {
    const effectiveStatus = activeShipment ? displayShipmentStatus(activeShipment, canonicalDrafting) : "Ordered";
    const initialWorkflowStatus = canonicalDrafting ? "For Approval" : "Requested";
    const queuedForPurchaseAmountPosting = activeShipment
        ? isLandedCostPostingEligible(activeShipment)
        : false;
    const isFinanceRejected = canonicalDrafting
        && effectiveStatus === "Rejected"
        && activeShipment?.rejection_stage === "Finance";
    const lockedWorkflowMessage = effectiveStatus === "Rejected"
        ? "Revision and cancellation require a formal Finance rejection."
        : "Edit and cancellation are locked after PO creation until Finance formally rejects this PO.";
    const storedRemark = activeShipment?.remark || "";
    const legacyRemarkMatch = storedRemark.match(/^(REJECTED|CANCELLED):\s*/i);
    const poRemark = legacyRemarkMatch ? "" : storedRemark;
    const legacyFinanceFeedback = legacyRemarkMatch
        ? storedRemark.slice(legacyRemarkMatch[0].length).trim()
        : "";

    return (
        <div className="w-full min-w-0 flex-1 border rounded-xl bg-card overflow-y-auto p-4 sm:p-6 shadow-sm flex flex-col gap-6 relative min-h-[300px]">
            {loading && (
                <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] z-50 flex items-center justify-center rounded-xl">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}
            {detailError ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
                    <Anchor className="h-12 w-12 text-destructive/50" />
                    <div>
                        <h2 className="text-sm font-bold text-destructive">Unable to load purchase-order details</h2>
                        <p className="mt-1 max-w-xl text-xs text-muted-foreground">{detailError}</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        {onRetryDetail && (
                            <button
                                type="button"
                                onClick={onRetryDetail}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> Retry
                            </button>
                        )}
                        <Link
                            href={backHref || "/mm/incoming-shipments"}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" /> Back to Incoming Shipments
                        </Link>
                    </div>
                </div>
            ) : activeShipment ? (
                <>
                    {backHref !== undefined && (
                        <Link
                            href={backHref || "/mm/incoming-shipments"}
                            className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" /> Back to Incoming Shipments
                        </Link>
                    )}
                    {/* Header Details */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-5">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-extrabold text-foreground leading-tight">{canonicalDrafting ? `Purchase Order: ${activeShipment.purchase_order_no || activeShipment.reference_number}` : `Cargo Invoice / BL: ${activeShipment.reference_number}`}</h2>
                                {getStatusBadge(effectiveStatus)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Supplier Source:{" "}
                                <strong className="text-foreground font-semibold inline-flex items-center gap-1.5">
                                    {(() => {
                                        const supId = typeof activeShipment.supplier_id === "object" && activeShipment.supplier_id !== null
                                            ? (activeShipment.supplier_id as { id: number }).id
                                            : Number(activeShipment.supplier_id);
                                        const matchedSupplier = suppliers.find(sup => sup.id === supId)
                                            || (typeof activeShipment.supplier_id === "object" ? activeShipment.supplier_id : null);
                                        if (!matchedSupplier) return `ID: ${activeShipment.supplier_id}`;
                                        const foreign = isSupplierForeign(matchedSupplier);
                                        return (
                                            <>
                                                {foreign ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wider">
                                                        <Globe className="h-2.5 w-2.5" /> Foreign
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                                                        <Building2 className="h-2.5 w-2.5" /> Local
                                                    </span>
                                                )}
                                                <span>{matchedSupplier.supplier_name}</span>
                                            </>
                                        );
                                    })()}
                                </strong>
                            </p>
                            {poRemark && (
                                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                                    <strong className="block text-[10px] uppercase tracking-wide">PO Remarks</strong>
                                    <span className="mt-1 block whitespace-pre-wrap">{poRemark}</span>
                                </div>
                            )}
                            {legacyFinanceFeedback && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    <strong className="block text-[10px] uppercase tracking-wide">Legacy Finance Feedback</strong>
                                    <span className="mt-1 block whitespace-pre-wrap">{legacyFinanceFeedback}</span>
                                </div>
                            )}
                            <div className="flex max-w-full flex-wrap gap-x-4 gap-y-1.5 text-xs mt-2.5 text-muted-foreground bg-muted/40 border p-3 rounded-lg font-sans">
                                <span>
                                    Destination Branch:{" "}
                                    <strong className="text-foreground font-bold">
                                        {(() => {
                                            const branchId = (activeShipment as IncomingShipment & { branch_id?: number | null }).branch_id;
                                            const branch = branches.find(item => item.id === Number(branchId));
                                            return branch?.branchName || (branchId ? `Branch #${branchId}` : "Unassigned Branch");
                                        })()}
                                    </strong>
                                </span>
                                {!canonicalDrafting && (
                                    <>
                                        <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                        <span>
                                            Payment Type:{" "}
                                            <strong className="text-foreground font-bold">
                                                {(() => {
                                                    const payMode = (activeShipment as IncomingShipment & { payment_mode?: number | null }).payment_mode;
                                                    const mode = paymentModes.find(item => item.id === Number(payMode));
                                                    return activeShipment.payment_mode_name || mode?.mode_name || (payMode ? "Configured payment type unavailable" : "Not specified (legacy PO)");
                                                })()}
                                            </strong>
                                        </span>
                                        <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                    </>
                                )}
                                <span>
                                    Payment Status:{" "}
                                    <strong className="text-foreground font-bold">{paymentStatusLabel(activeShipment.payment_status)}</strong>
                                </span>
                                {(activeShipment.isForceReceived || activeShipment.forceReceivedAt) && (
                                    <>
                                        <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                        <span className="text-violet-700">
                                            Closure:{" "}
                                            <strong className="font-bold">Force Received</strong>
                                            {activeShipment.forceReceivedReason ? ` — ${activeShipment.forceReceivedReason}` : ""}
                                        </span>
                                    </>
                                )}
                                {queuedForPurchaseAmountPosting && (
                                    <>
                                        <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                        <span className="text-blue-700">
                                            Finance Queue:{" "}
                                            <strong className="font-bold">Purchase Amount Posting</strong>
                                        </span>
                                    </>
                                )}
                                <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                <span>
                                    Payment Arrangement:{" "}
                                    <strong className="text-foreground font-bold">
                                        {(() => {
                                            const payType = (activeShipment as IncomingShipment & { payment_type?: number | null }).payment_type;
                                            switch (Number(payType)) {
                                                case 1: return "Advance Payment";
                                                case 2: return "Partial Payment";
                                                case 3: return "Full Payment";
                                                case 4: return "Refund";
                                                case 5: return "Installment";
                                                default: return payType ? `Payment Type #${payType}` : "N/A";
                                            }
                                        })()}
                                    </strong>
                                </span>
                                <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                <span>
                                    Payment Terms:{" "}
                                    <strong className="text-foreground font-bold">
                                        {(() => {
                                            const paymentTermsId = activeShipment.payment_terms;
                                            const paymentTerm = paymentTerms.find(term => term.id === Number(paymentTermsId));
                                            return paymentTerm?.payment_name || (paymentTermsId ? `Payment Terms #${paymentTermsId}` : "N/A");
                                        })()}
                                    </strong>
                                </span>
                                <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                <span>
                                    Delivery Terms:{" "}
                                    <strong className="text-foreground font-bold">
                                        {activeShipment.delivery_terms || "N/A"}
                                    </strong>
                                </span>
                                {!canonicalDrafting && (
                                    <>
                                        <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                        <span>
                                            Price Type:{" "}
                                            <strong className="text-foreground font-bold">
                                                {(activeShipment as IncomingShipment & { price_type?: string | null }).price_type || "Standard"}
                                            </strong>
                                        </span>
                                    </>
                                )}
                            </div>
                            {referenceError && (
                                <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" role="status">
                                    Some reference labels are unavailable. Refresh the page or retry before editing this purchase order.
                                </p>
                            )}
                            {/* Status Progress Stepper (Read-Only) */}
                            <div className="mt-4 border bg-muted/20 rounded-xl p-4 space-y-3">
                                <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">{canonicalDrafting ? "Purchase Order Workflow Progress" : "Shipment Life Cycle Progress"}</div>
                                <div className="w-full overflow-x-auto">
                                    <div className="relative flex min-w-[760px] items-center overflow-visible py-3">
                                    {(effectiveStatus === "Rejected"
                                        ? [initialWorkflowStatus, "Approved", "Rejected"]
                                        : [initialWorkflowStatus, "Approved", "Warehouse Receiving", "Receiving (QA)", "Received"]
                                    ).map((st, idx, arr) => {
                                        const statuses = arr;
                                        const isInitialWorkflowStatus = effectiveStatus === initialWorkflowStatus
                                            || effectiveStatus === "Requested"
                                            || effectiveStatus === "Ordered";
                                        const currentStatus = isInitialWorkflowStatus
                                            ? initialWorkflowStatus
                                            : effectiveStatus === "For Pickup" || effectiveStatus === "Partially Received"
                                            ? "Receiving (QA)"
                                            : effectiveStatus === "Awaiting Payment"
                                            ? (Number(activeShipment.inventory_status) === INVENTORY_STATUS.APPROVED ? "Approved" : initialWorkflowStatus)
                                            : effectiveStatus === "Approved" && statuses.includes("Warehouse Receiving")
                                            ? "Warehouse Receiving"
                                            : effectiveStatus;
                                        const currentIdx = statuses.indexOf(currentStatus);
                                        const stepIdx = statuses.indexOf(st);
                                        
                                        const isCompleted = stepIdx < currentIdx;
                                        const isActive = stepIdx === currentIdx;
                                        const showCheck = isCompleted || (isActive && currentStatus === "Received");
                                        
                                        return (
                                            <React.Fragment key={st}>
                                                <div className="flex flex-col items-center flex-1 relative z-10">
                                                    <div className={`h-6 w-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold transition-all ${
                                                        isCompleted 
                                                            ? "bg-emerald-500 border-emerald-500 text-emerald-foreground" 
                                                            : isActive 
                                                                ? "bg-primary border-primary text-primary-foreground shadow-md scale-110" 
                                                                : "bg-background border-muted text-muted-foreground"
                                                    }`}>
                                                        {showCheck ? "✓" : idx + 1}
                                                    </div>
                                                    <span className={`min-w-[125px] text-center whitespace-nowrap text-[9px] font-bold mt-1.5 ${
                                                        isActive ? "text-primary animate-pulse" : "text-muted-foreground"
                                                    }`}>{st}</span>
                                                </div>
                                                {idx < arr.length - 1 && (
                                                    <div className={`flex-1 h-[2px] -mt-4 transition-all ${
                                                        stepIdx < currentIdx ? "bg-emerald-500" : "bg-muted"
                                                    }`} />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    </div>
                                </div>

                                {(effectiveStatus === "For Approval" || effectiveStatus === "Requested" || effectiveStatus === "Ordered") && (
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <button
                                            type="button"
                                            disabled={canonicalDrafting || loading}
                                            onClick={handleStartEdit}
                                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer inline-flex items-center justify-center gap-1.5"
                                        >
                                            Edit Purchase Order
                                        </button>
                                        {canonicalDrafting && (
                                            <button
                                                type="button"
                                                disabled
                                                onClick={() => {
                                                    if (window.confirm(`Cancel this ${canonicalDrafting ? "For Approval" : "Requested"} purchase order? This action cannot be undone.`)) {
                                                        onUpdateShipmentStatus(activeShipment.shipment_id, "Cancelled");
                                                    }
                                                }}
                                                className="w-full border border-border bg-muted text-muted-foreground disabled:cursor-not-allowed font-bold py-2.5 px-3 rounded-lg text-xs transition-all"
                                            >
                                                Cancel PO
                                            </button>
                                        )}
                                        {canonicalDrafting && (
                                            <p className="col-span-2 text-[10px] font-semibold text-muted-foreground">
                                                {lockedWorkflowMessage}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {effectiveStatus === "Rejected" && onCancelRejectedPurchaseOrder && (
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <button
                                            type="button"
                                            disabled={loading || !isFinanceRejected}
                                            onClick={handleStartEdit}
                                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:cursor-not-allowed text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer inline-flex items-center justify-center gap-1.5"
                                        >
                                            <Edit className="h-3.5 w-3.5" /> Revise &amp; Resubmit
                                        </button>
                                        <button
                                            type="button"
                                            disabled={loading || !isFinanceRejected}
                                            onClick={() => {
                                                if (window.confirm("Cancel this rejected purchase order? This action cannot be undone.")) {
                                                    onCancelRejectedPurchaseOrder(
                                                        activeShipment.shipment_id,
                                                        Number(activeShipment.workflow_revision || 0),
                                                        "Purchase order cancelled after rejection."
                                                    );
                                                }
                                            }}
                                            className="w-full border border-border bg-muted text-muted-foreground hover:bg-muted disabled:cursor-not-allowed font-bold py-2.5 px-3 rounded-lg text-xs transition-all inline-flex items-center justify-center gap-1.5"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" /> Cancel PO
                                        </button>
                                        {!isFinanceRejected && (
                                            <p className="col-span-2 text-[10px] font-semibold text-muted-foreground">
                                                {lockedWorkflowMessage}
                                            </p>
                                        )}
                                    </div>
                                )}

                            </div>
                        </div>
                        {canonicalDrafting && onPrintPurchaseOrder && (
                            <button
                                type="button"
                                onClick={onPrintPurchaseOrder}
                                disabled={printLoading}
                                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {printLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                                {printLoading ? "Preparing..." : "Print PO"}
                            </button>
                        )}
                    </div>

                    {/* Totals Summary */}
                    <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-5">
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">{canonicalDrafting ? "PHP Total" : "Raw FOB Cost"}</span>
                            <span className="text-xs font-extrabold text-foreground">
                                {formatMoney(activeShipment.total_php_value, "PHP")}
                            </span>
                        </div>
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">{activeShipment.currency_code === "PHP" ? "Foreign Total" : `${activeShipment.currency_code || "Foreign"} Total`}</span>
                            <span className="text-xs font-extrabold text-foreground">
                                {activeShipment.currency_code && activeShipment.currency_code !== "PHP"
                                    ? formatMoney(activeShipment.total_foreign_currency, activeShipment.currency_code)
                                    : "N/A"}
                            </span>
                        </div>
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Exchange Rate (PHP/USD)</span>
                            <span className="text-xs font-extrabold text-foreground">
                                {activeShipment.currency_code === "PHP"
                                    ? "1.0000"
                                    : Number(activeShipment.exchange_rate) > 0
                                        ? Number(activeShipment.exchange_rate).toFixed(4)
                                        : "Unavailable"}
                            </span>
                        </div>
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Revision Count</span>
                            <span className="text-xs font-extrabold text-foreground">
                                {Math.max(0, Math.trunc(Number(activeShipment.revision_count) || 0))}
                            </span>
                        </div>
                        <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                {effectiveStatus === "Received" ? "Arrival Date" : "ETA / Expected"}
                            </span>
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-primary" />
                                {effectiveStatus === "Received"
                                    ? (activeShipment.date_received && activeShipment.date_received !== "1970-01-01" 
                                        ? new Date(activeShipment.date_received).toLocaleDateString() 
                                        : "N/A")
                                    : (activeShipment.lead_time_receiving 
                                        ? new Date(activeShipment.lead_time_receiving).toLocaleDateString() 
                                        : "Pending")}
                            </span>
                        </div>
                    </div>

                    {/* Shipment Cargo Lines List */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b pb-2">
                            <Layers className="h-4 w-4 text-primary" />
                            {canonicalDrafting ? "Purchase Order Lines" : "Shipment Manifest & Contents"}
                        </h3>
                        <div className="hidden overflow-x-auto rounded-lg border min-[720px]:block">
                            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="p-3 font-semibold text-muted-foreground">Product Name</th>
                                        <th className="p-3 font-semibold text-muted-foreground">UOM</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">Qty</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">{activeShipment.currency_code === "PHP" ? "Unit Price (PHP)" : `Invoice Unit Price (${activeShipment.currency_code || "foreign currency"})`}</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">Discount</th>
                                        <th className="p-3 font-semibold text-muted-foreground text-right">ImpFreight Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {lines.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                                No items registered in this container.
                                            </td>
                                        </tr>
                                    ) : (
                                        lines.map(line => {
                                            const prod = line.product_id && typeof line.product_id === "object"
                                                ? line.product_id
                                                : { product_name: `ID: ${line.product_id}`, product_code: "N/A", unit_of_measurement: { unit_shortcut: "PCS" } };
                                            return (
                                                (() => {
                                                    const currency = activeShipment?.currency_code || "PHP";
                                                    const discountMode = line.discount_mode || "Percentage";
                                                    const transactionUnitPrice = Number(currency === "PHP" ? line.base_unit_cost_php : line.unit_price_foreign);
                                                    const hasUnitPrice = Number.isFinite(transactionUnitPrice) && transactionUnitPrice >= 0;
                                                    const quantity = Number(line.quantity_ordered || 0);
                                                    const percentageDiscount = calculatePercentageDiscount(
                                                        quantity,
                                                        hasUnitPrice ? transactionUnitPrice : 0,
                                                        Number(line.discount_percent || 0)
                                                    );
                                                    const discountAmount = discountMode === "Fixed Amount"
                                                        ? Number(line.discount_amount_foreign || 0)
                                                        : Number(percentageDiscount.discountAmount);
                                                    return (
                                                <tr key={line.line_id} className="hover:bg-muted/20">
                                                    <td className="p-3">
                                                        <div className="font-semibold text-foreground">{prod.product_name}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">Code: {prod.product_code}</div>
                                                    </td>
                                                    <td className="p-3 text-muted-foreground font-semibold">
                                                        {prod.unit_of_measurement?.unit_shortcut || "PCS"}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="font-semibold text-foreground">
                                                            {line.quantity_received !== null && line.quantity_received !== undefined ? (
                                                                `${Number(line.quantity_received).toLocaleString()} / ${Number(line.quantity_ordered || 0).toLocaleString()}`
                                                            ) : (
                                                                `${Number(line.quantity_ordered || 0).toLocaleString()} (Ordered)`
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-[11px]">
                                                        <div>{hasUnitPrice ? formatMoney(transactionUnitPrice, currency, UNIT_PRICE_DECIMAL_SCALE) : "Unavailable"}</div>
                                                        {currency !== "PHP" && (
                                                            <div className="text-[9px] text-muted-foreground">Base: {formatMoney(line.base_unit_cost_php, "PHP", UNIT_PRICE_DECIMAL_SCALE)}</div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-[11px]">
                                                        {formatMoney(discountAmount, currency)}
                                                        {discountMode === "Percentage" && (
                                                            <span className="ml-1 text-[10px] text-muted-foreground">
                                                                ({Number(line.discount_percent || 0).toFixed(2)}%)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-[11px] text-muted-foreground">
                                                        +{formatMoney(line.allocated_expense_php || 0)}
                                                    </td>
                                                </tr>
                                                    );
                                                })()
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="space-y-3 min-[720px]:hidden">
                            {lines.length === 0 ? (
                                <div className="rounded-lg border p-8 text-center text-xs text-muted-foreground">
                                    No items registered in this container.
                                </div>
                            ) : (
                                lines.map(line => {
                                    const prod = line.product_id && typeof line.product_id === "object"
                                        ? line.product_id
                                        : { product_name: `ID: ${line.product_id}`, product_code: "N/A", unit_of_measurement: { unit_shortcut: "PCS" } };
                                    const currency = activeShipment?.currency_code || "PHP";
                                    const discountMode = line.discount_mode || "Percentage";
                                    const transactionUnitPrice = Number(currency === "PHP" ? line.base_unit_cost_php : line.unit_price_foreign);
                                    const hasUnitPrice = Number.isFinite(transactionUnitPrice) && transactionUnitPrice >= 0;
                                    const quantity = Number(line.quantity_ordered || 0);
                                    const percentageDiscount = calculatePercentageDiscount(
                                        quantity,
                                        hasUnitPrice ? transactionUnitPrice : 0,
                                        Number(line.discount_percent || 0)
                                    );
                                    const discountAmount = discountMode === "Fixed Amount"
                                        ? Number(line.discount_amount_foreign || 0)
                                        : Number(percentageDiscount.discountAmount);
                                    return (
                                        <div key={line.line_id} className="rounded-lg border bg-muted/5 p-3 text-xs">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="break-words font-semibold text-foreground">{prod.product_name}</p>
                                                    <p className="break-all font-mono text-[10px] text-muted-foreground">Code: {prod.product_code}</p>
                                                </div>
                                                <span className="shrink-0 font-semibold text-muted-foreground">
                                                    {prod.unit_of_measurement?.unit_shortcut || "PCS"}
                                                </span>
                                            </div>
                                            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                                                <div><dt className="text-muted-foreground">Quantity</dt><dd className="font-semibold">{line.quantity_received !== null && line.quantity_received !== undefined ? `${Number(line.quantity_received).toLocaleString()} / ${Number(line.quantity_ordered || 0).toLocaleString()}` : `${Number(line.quantity_ordered || 0).toLocaleString()} (Ordered)`}</dd></div>
                                                <div><dt className="text-muted-foreground">Unit Price</dt><dd className="font-mono font-semibold">{hasUnitPrice ? formatMoney(transactionUnitPrice, currency, UNIT_PRICE_DECIMAL_SCALE) : "Unavailable"}</dd></div>
                                                <div><dt className="text-muted-foreground">Discount</dt><dd className="font-mono font-semibold">{formatMoney(discountAmount, currency)}{discountMode === "Percentage" ? ` (${Number(line.discount_percent || 0).toFixed(2)}%)` : ""}</dd></div>
                                                <div><dt className="text-muted-foreground">ImpFreight Cost</dt><dd className="font-mono font-semibold">+{formatMoney(line.allocated_expense_php || 0)}</dd></div>
                                            </dl>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Informative Note */}
                    {effectiveStatus !== "Received" && (
                        <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl">
                            <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <h5 className="text-xs font-bold text-blue-800 dark:text-blue-300">Pending Landed Cost Recalculation</h5>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    This cargo is currently marked as <strong className="text-foreground">{effectiveStatus}</strong>. Custom duties, ARR, brokerages, and shipping lines must be added/allocated. Marking this shipment as <strong>Received</strong> will commit the computed landed costs to the raw inventory database to update standard BOM prices.
                                </p>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground h-full">
                    <Anchor className="h-16 w-16 mb-4 text-muted-foreground/30" />
                    {hasShipments ? "Select a shipment from the list to view details." : "No incoming shipments logged."}
                </div>
            )}
        </div>
    );
}
