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
import { ProcurementStatusBadge } from "../../../shared/components/ProcurementStatusBadge";

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
        ? { label: "Raw Material", shortLabel: "RM", className: "bg-info/10 text-info border-info/20" }
        : normalizedTypeId === 390
            ? { label: "Packaging Item", shortLabel: "PKG", className: "bg-warning/10 text-warning border-warning/20" }
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
            return <ProcurementStatusBadge status="Received" icon={CheckCircle2} />;
        case "Partially Received":
            return <ProcurementStatusBadge status="Partially Received" icon={RefreshCw} />;
        case "Receiving (QA)":
            return <ProcurementStatusBadge status="Receiving (QA)" icon={ShieldCheck} />;
        case "Approved":
            return <ProcurementStatusBadge status="Approved" icon={CheckCircle2} />;
        case "Warehouse Receiving":
            return <ProcurementStatusBadge status="Warehouse Receiving" icon={PackageCheck} />;
        case "Awaiting Payment":
            return <ProcurementStatusBadge status="Awaiting Payment" icon={Landmark} />;
        case "For Pickup":
            return <ProcurementStatusBadge status="Receiving (QA)" icon={Anchor} />;
        case "Rejected":
            return <ProcurementStatusBadge status="Rejected" icon={AlertCircle} />;
        case "Cancelled":
            return <ProcurementStatusBadge status="Cancelled" icon={X} />;
        case "For Approval":
            return <ProcurementStatusBadge status="For Approval" icon={RefreshCw} />;
        default:
            return <ProcurementStatusBadge status="Ordered" icon={RefreshCw} />;
    }
}
