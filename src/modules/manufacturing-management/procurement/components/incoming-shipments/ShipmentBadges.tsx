import React from "react";
import { CheckCircle2, ShieldCheck, Landmark, Anchor, AlertCircle, RefreshCw, X, PackageCheck } from "lucide-react";
import {
    PROCUREMENT_MONEY_DECIMAL_SCALE,
    formatDecimal
} from "@/modules/manufacturing-management/decimal";
import {
    INVENTORY_STATUS,
    INVENTORY_STATUS_LABELS,
    LEGACY_DISPATCH_STATUS_ID,
    PAYMENT_STATUS,
    PAYMENT_STATUS_LABELS,
    inventoryStatusToPurchaseOrderStatus,
    inventoryStatusToShipmentStatus,
    isInventoryStatusId,
    paymentStatusLabel
} from "@/app/api/manufacturing/procurement/_domain";

export function formatMoney(value: number | string | null | undefined, currency = "PHP", decimalPlaces = PROCUREMENT_MONEY_DECIMAL_SCALE) {
    const symbol = currency === "USD" ? "$" : currency === "PHP" ? "₱" : `${currency} `;
    try {
        return `${symbol}${formatDecimal(value ?? 0, decimalPlaces)}`;
    } catch {
        return `${symbol}${formatDecimal(0, decimalPlaces)}`;
    }
}

export function formatAmount(value: number | string | null | undefined) {
    try {
        return formatDecimal(value ?? 0, PROCUREMENT_MONEY_DECIMAL_SCALE);
    } catch {
        return formatDecimal(0, PROCUREMENT_MONEY_DECIMAL_SCALE);
    }
}

export function MaterialTypeBadge({ typeId, short = false }: { typeId?: number | string | null; short?: boolean }) {
    const normalizedTypeId = Number(typeId);
    const type = normalizedTypeId === 389
        ? { label: "Raw Material", shortLabel: "RM", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" }
        : normalizedTypeId === 390
            ? { label: "Packaging Item", shortLabel: "PKG", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" }
            : { label: "Unclassified", shortLabel: "N/A", className: "bg-muted text-muted-foreground border-border" };

    return (
        <span
            aria-label={`Material Type: ${type.label}`}
            title={`Material Type: ${type.label}`}
            className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${type.className}`}
        >
            {short ? type.shortLabel : type.label}
        </span>
    );
}

export function displayShipmentStatus(
    s: { status?: string; inventory_status?: number | null; payment_status?: number | null },
    canonicalDrafting = false
): string {
    const inventoryStatus = Number(s.inventory_status);
    if (Number.isInteger(inventoryStatus) && isInventoryStatusId(inventoryStatus)) {
        return canonicalDrafting
            ? inventoryStatusToPurchaseOrderStatus(inventoryStatus, Number(s.payment_status))
            : inventoryStatusToShipmentStatus(inventoryStatus, Number(s.payment_status));
    }
    return s.status || "Ordered";
}

function statusPill(label: string, className: string, ariaLabel: string) {
    return (
        <span
            aria-label={ariaLabel}
            className={`inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider ${className}`}
        >
            {label}
        </span>
    );
}

export function inventoryStatusLabel(value: unknown): string {
    const status = Number(value);
    if (status === LEGACY_DISPATCH_STATUS_ID) return INVENTORY_STATUS_LABELS[INVENTORY_STATUS.FOR_PICKUP];
    return isInventoryStatusId(status) ? INVENTORY_STATUS_LABELS[status] : "Unknown";
}

export function getInventoryStatusBadge(value: unknown) {
    const status = Number(value);
    const label = inventoryStatusLabel(value);
    const className = status === INVENTORY_STATUS.RECEIVED
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
        : status === INVENTORY_STATUS.APPROVED
            ? "border-teal-500/20 bg-teal-500/10 text-teal-600"
            : status === INVENTORY_STATUS.FOR_PICKUP || status === LEGACY_DISPATCH_STATUS_ID
                ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-600"
                : status === INVENTORY_STATUS.WAREHOUSE_RECEIVING
                    ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-700"
                    : status === INVENTORY_STATUS.PARTIALLY_RECEIVED
                        ? "border-blue-500/20 bg-blue-500/10 text-blue-600"
                        : status === INVENTORY_STATUS.REJECTED
                            ? "border-red-500/20 bg-red-500/10 text-red-600"
                            : status === INVENTORY_STATUS.CANCELLED
                                ? "border-border bg-muted text-muted-foreground"
                                : status === INVENTORY_STATUS.AWAITING_PAYMENT
                                    ? "border-purple-500/20 bg-purple-500/10 text-purple-600"
                                    : status === INVENTORY_STATUS.REQUESTED
                                        ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                                        : "border-border bg-muted text-muted-foreground";
    return statusPill(label, className, `Inventory Status: ${label}`);
}

export function getPaymentStatusBadge(value: unknown) {
    const status = Number(value);
    const label = paymentStatusLabel(value);
    const className = status === PAYMENT_STATUS.PAID
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
        : status === PAYMENT_STATUS.PARTIALLY_PAID
            ? "border-blue-500/20 bg-blue-500/10 text-blue-600"
            : status === PAYMENT_STATUS.AWAITING_PAYMENT
                ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                : status === PAYMENT_STATUS.OVERDUE
                    ? "border-red-500/20 bg-red-500/10 text-red-600"
                    : status === PAYMENT_STATUS.CANCELLED
                        ? "border-border bg-muted text-muted-foreground"
                        : status === PAYMENT_STATUS.PROCESSING
                            ? "border-purple-500/20 bg-purple-500/10 text-purple-600"
                            : "border-slate-500/20 bg-slate-500/10 text-slate-600";
    return statusPill(label, className, `Payment Status: ${label}`);
}

export const INVENTORY_STATUS_FILTER_OPTIONS = [
    { value: "", label: "All Inventory Statuses" },
    ...Object.entries(INVENTORY_STATUS_LABELS).map(([value, label]) => ({ value, label }))
];

export const PAYMENT_STATUS_FILTER_OPTIONS = [
    { value: "", label: "All Payment Statuses" },
    ...Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
];

export function getStatusBadge(status: string) {
    switch (status) {
        case "Received":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                    <CheckCircle2 className="h-3 w-3" /> Received
                </span>
            );
        case "Partially Received":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wider">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Partially Received
                </span>
            );
        case "Receiving (QA)":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 uppercase tracking-wider">
                    <ShieldCheck className="h-3 w-3" /> QA Receiving
                </span>
            );
        case "Approved":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-500/10 text-teal-600 border border-teal-500/20 uppercase tracking-wider">
                    <CheckCircle2 className="h-3 w-3" /> Approved
                </span>
            );
        case "Warehouse Receiving":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/10 text-cyan-700 border border-cyan-500/20 uppercase tracking-wider">
                    <PackageCheck className="h-3 w-3" /> Warehouse Receiving
                </span>
            );
        case "Awaiting Payment":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/10 text-purple-600 border border-purple-500/20 uppercase tracking-wider">
                    <Landmark className="h-3 w-3" /> Awaiting Payment
                </span>
            );
        case "For Pickup":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase tracking-wider">
                    <Anchor className="h-3 w-3" /> QA Receiving
                </span>
            );
        case "Rejected":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/10 text-red-600 border border-red-500/20 uppercase tracking-wider">
                    <AlertCircle className="h-3 w-3" /> Rejected
                </span>
            );
        case "Cancelled":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-muted text-muted-foreground border border-border uppercase tracking-wider">
                    <X className="h-3 w-3" /> Cancelled
                </span>
            );
        case "For Approval":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase tracking-wider">
                    <RefreshCw className="h-3 w-3" /> For Approval
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wider">
                    <RefreshCw className="h-3 w-3" /> Ordered
                </span>
            );
    }
}
