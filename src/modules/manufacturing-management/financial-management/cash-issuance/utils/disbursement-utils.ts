
import type { Disbursement } from "../types";

export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
}

export function getCookie(name: string): string {
    if (typeof window === "undefined") return "";
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || "";
    return "";
}

export function decodeToken(token: string): { sub: number } | null {
    if (!token) return null;
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            window.atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to decode token", e);
        return null;
    }
}

export function getStatusColor(status: string): string {
    switch (status.toUpperCase()) {
        case "DRAFT": return "bg-muted text-muted-foreground border-border";
        case "SUBMITTED": return "bg-blue-100/50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
        case "APPROVED": return "bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
        case "RELEASED": return "bg-purple-100/50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800";
        case "POSTED": return "bg-primary text-primary-foreground border-primary";
        default: return "bg-muted text-muted-foreground border-border";
    }
}

export const VOUCHER_STEPS = ["Draft", "Submitted", "Approved", "Released", "Posted"];

export function getVoucherStepIndex(status: string): number {
    const normalizedStatus = status.trim().toUpperCase();
    if (normalizedStatus === "PARTIALLY RELEASED") return VOUCHER_STEPS.indexOf("Released");
    return Math.max(0, VOUCHER_STEPS.findIndex((step) => step.toUpperCase() === normalizedStatus));
}

export function getPaymentStateLabel(state: Disbursement["paymentState"] | undefined, paidAmount = 0): string {
    switch (state) {
        case "UNPAID": return "Unpaid";
        case "ALLOCATED": return "Allocated";
        case "PARTIALLY_RELEASED": return "Partially Paid";
        case "RELEASED": return "Paid";
        default: return paidAmount > 0 ? "Allocated" : "Unpaid";
    }
}

export function sumLineAmounts(lines: { amount?: number | string }[]): number {
    return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
}
