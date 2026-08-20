import { cn } from "@/lib/utils";

import type { ApprovalKind, ApprovalTypeFilter, PCRDisplayStatus } from "../types";

const STATUS_VALUES: PCRDisplayStatus[] = ["PENDING", "APPROVED", "SCHEDULED", "APPLYING", "FAILED", "REJECTED", "CANCELLED"];

export const pcrApproveButtonClass =
    "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/20 dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:focus-visible:ring-emerald-500/40";

export const pcrRejectButtonClass =
    "border-red-600 text-red-600 hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:ring-red-500/20 dark:border-red-500 dark:text-red-500 dark:hover:border-red-500 dark:hover:bg-red-600 dark:hover:text-white dark:focus-visible:ring-red-500/40";

export function normalizePcrStatus(status: string): PCRDisplayStatus | null {
    const normalized = status.trim().toUpperCase();
    return STATUS_VALUES.includes(normalized as PCRDisplayStatus) ? (normalized as PCRDisplayStatus) : null;
}

export function displayPcrStatus(
    status: string,
    applicationStatus?: string | null,
    _effectiveAt?: string | null,
): PCRDisplayStatus | string {
    void _effectiveAt;
    const normalized = status.trim().toUpperCase();
    const normalizedApplicationStatus = String(applicationStatus ?? "").trim().toUpperCase();
    if (normalized === "APPROVED" && normalizedApplicationStatus === "SCHEDULED") {
        return normalizedApplicationStatus;
    }
    if (normalized === "APPROVED" && ["APPLYING", "FAILED"].includes(normalizedApplicationStatus)) {
        return normalizedApplicationStatus;
    }
    return normalizePcrStatus(normalized) ?? normalized;
}

export function pcrStatusBadgeClass(status: string): string {
    const normalized = normalizePcrStatus(status);

    switch (normalized) {
        case "PENDING":
            return "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
        case "APPROVED":
            return "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
        case "SCHEDULED":
            return "border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
        case "APPLYING":
            return "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
        case "FAILED":
            return "border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200";
        case "REJECTED":
            return "border-red-200 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
        case "CANCELLED":
            return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
        default:
            return "";
    }
}

export function pcrStatusTabTriggerClass(status: Exclude<PCRDisplayStatus, "CANCELLED">): string {
    switch (status) {
        case "PENDING":
            return cn(
                "text-amber-800 dark:text-amber-300",
                "data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
        case "APPROVED":
            return cn(
                "text-emerald-800 dark:text-emerald-300",
                "data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
        case "SCHEDULED":
            return cn(
                "text-sky-800 dark:text-sky-300",
                "data-[state=active]:bg-sky-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
        case "APPLYING":
            return cn(
                "text-blue-800 dark:text-blue-300",
                "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
        case "FAILED":
            return cn(
                "text-orange-800 dark:text-orange-300",
                "data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
        case "REJECTED":
            return cn(
                "text-red-800 dark:text-red-300",
                "data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
    }
}

export function approvalTypeLabel(kind: ApprovalKind): string {
    if (kind === "mixed_batch") return "Price Type + List Cost";
    return kind === "price_batch" || kind === "price_type" ? "Price Type" : "List Cost";
}

export function approvalTypeBadgeClass(kind: ApprovalKind): string {
    switch (kind) {
        case "price_batch":
        case "price_type":
            return "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
        case "cost_batch":
        case "list_price":
            return "border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200";
        case "mixed_batch":
            return "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
    }
}

export function approvalTypeTabTriggerClass(type: ApprovalTypeFilter): string {
    switch (type) {
        case "price":
            return cn(
                "text-blue-700 dark:text-blue-300",
                "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
        case "cost":
            return cn(
                "text-violet-700 dark:text-violet-300",
                "data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-sm",
            );
        default:
            return "";
    }
}
