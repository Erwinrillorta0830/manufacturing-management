import React from "react";
import { CheckCircle2, ShieldCheck, Landmark, Anchor, Truck, AlertCircle, RefreshCw, X } from "lucide-react";
import {
    CURRENCY_DECIMAL_SCALE,
    formatDecimal
} from "@/modules/manufacturing-management/decimal";

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

export function displayShipmentStatus(s: { status?: string; inventory_status?: number | null; payment_status?: number | null }): string {
    const inv = s.inventory_status;
    const pay = s.payment_status;
    if (inv === 3) return "Rejected";
    if (inv === 2) return "Received";
    if (inv === 4) return "Partially Received";
    if (inv === 1 && pay === 1) return "Awaiting Payment";
    if (inv === 1 && (pay === 2 || pay === 3)) return "Approved";
    if (inv === 0) return "Ordered";
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
        case "Awaiting Payment":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/10 text-purple-600 border border-purple-500/20 uppercase tracking-wider">
                    <Landmark className="h-3 w-3" /> Awaiting Payment
                </span>
            );
        case "En Route":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/10 text-sky-600 border border-sky-500/20 uppercase tracking-wider">
                    <Truck className="h-3 w-3" /> En Route
                </span>
            );
        case "For Pickup":
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase tracking-wider">
                    <Anchor className="h-3 w-3" /> For Pickup
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
        default:
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wider">
                    <RefreshCw className="h-3 w-3" /> Ordered
                </span>
            );
    }
}
