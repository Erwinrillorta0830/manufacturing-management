import React from "react";
import { CheckCircle2, ShieldCheck, Landmark, Anchor, AlertCircle, RefreshCw, X, PackageCheck } from "lucide-react";
import {
    CURRENCY_DECIMAL_SCALE,
    formatDecimal
} from "@/modules/manufacturing-management/decimal";
import {
    inventoryStatusToPurchaseOrderStatus,
    inventoryStatusToShipmentStatus,
    isInventoryStatusId
} from "@/app/api/manufacturing/procurement/_domain";

export function formatMoney(value: number | string | null | undefined, currency = "PHP", decimalPlaces = CURRENCY_DECIMAL_SCALE) {
    const symbol = currency === "USD" ? "$" : currency === "PHP" ? "₱" : `${currency} `;
    try {
        return `${symbol}${formatDecimal(value ?? 0, decimalPlaces)}`;
    } catch {
        return `${symbol}${formatDecimal(0, decimalPlaces)}`;
    }
}

export function formatAmount(value: number | string | null | undefined) {
    try {
        return formatDecimal(value ?? 0);
    } catch {
        return "0.00";
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
