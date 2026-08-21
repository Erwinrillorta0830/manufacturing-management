import type { PurchaseOrderPaymentMode } from "../procurement/types";

export const PURCHASE_ORDER_DELIVERY_TERMS = [
    { value: "Delivery", label: "Local Delivery" },
    { value: "FOB (Free on Board)", label: "FOB (Free on Board)" },
    { value: "EXW (Ex Works)", label: "EXW (Ex Works)" },
    { value: "CIF (Cost, Insurance & Freight)", label: "CIF (Cost, Insurance & Freight)" },
    { value: "DDP (Delivered Duty Paid)", label: "DDP (Delivered Duty Paid)" },
    { value: "FOB / Delivery", label: "FOB / Delivery" }
] as const;

type PaymentTerm = {
    id: number;
    payment_name: string;
    payment_days?: number | null;
};

function normalizeTerm(value: string | null | undefined): string {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function resolveSupplierPaymentTermId(
    profileValue: string | null | undefined,
    paymentTerms: PaymentTerm[]
): number | null {
    const normalizedProfile = normalizeTerm(profileValue);
    if (!normalizedProfile) return null;

    const exactMatch = paymentTerms.find(term => normalizeTerm(term.payment_name) === normalizedProfile);
    if (exactMatch) return exactMatch.id;

    const profileDays = normalizedProfile.match(/\b(\d+)\b/);
    if (profileDays) {
        const days = Number(profileDays[1]);
        const dayMatch = paymentTerms.find(term => Number(term.payment_days) === days);
        if (dayMatch) return dayMatch.id;
    }

    if (normalizedProfile.includes("cash on delivery") || normalizedProfile === "cod") {
        const cashMatch = paymentTerms.find(term => {
            const name = normalizeTerm(term.payment_name);
            return name.includes("cash") || Number(term.payment_days) === 0;
        });
        if (cashMatch) return cashMatch.id;
    }

    return null;
}

export function defaultPurchaseOrderPaymentModeId(paymentModes: PurchaseOrderPaymentMode[]): number | null {
    const activeModes = paymentModes
        .filter(mode => mode.is_active === undefined || mode.is_active === true || Number(mode.is_active) === 1)
        .slice()
        .sort((left, right) => {
            const orderDifference = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
            return orderDifference || left.mode_name.localeCompare(right.mode_name);
        });
    return activeModes[0]?.id ?? null;
}
