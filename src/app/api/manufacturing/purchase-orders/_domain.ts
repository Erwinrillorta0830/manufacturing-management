export const PURCHASE_INTENTS = ["MRP_Demand", "Buffer_Stock"] as const;
export type PurchaseIntent = typeof PURCHASE_INTENTS[number];

export const APPROVAL_STAGES = ["Finance"] as const;
export type ApprovalStage = typeof APPROVAL_STAGES[number];

export const APPROVAL_ACTIONS = ["Submitted", "FinanceApproved", "Rejected", "Resubmitted", "Cancelled"] as const;
export type ApprovalAction = typeof APPROVAL_ACTIONS[number];

export const QA_PARAMETER_TYPES = ["Numeric", "Boolean", "Text"] as const;
export type QaParameterType = typeof QA_PARAMETER_TYPES[number];

import { compareDecimals, DecimalValue, UNIT_PRICE_DECIMAL_SCALE, type DecimalInput } from "@/modules/manufacturing-management/decimal";
import { calculatePercentageDiscount } from "@/modules/manufacturing-management/procurement/discount-calculation";

export type CurrencyCode = string;
export type QaDisposition = "Passed" | "Partially Accepted" | "Rejected";
export type DiscountMode = "Percentage" | "Fixed Amount";
export type DiscountKind = DiscountMode;

export interface MoneySummary {
    currencyCode: CurrencyCode;
    exchangeRate: string;
    grossAmount: string;
    discountAmount: string;
    vatAmount: string;
    withholdingAmount: string;
    netAmount: string;
}

export function roundCurrency(value: DecimalInput): string {
    return DecimalValue.from(value).toFixed(2);
}

export interface PurchaseOrderMoneyLine {
    quantity: DecimalInput;
    unitPrice: DecimalInput;
    discountMode?: DiscountMode;
    discountPercent?: DecimalInput;
    discountAmount?: DecimalInput;
    vatPercent: DecimalInput;
    withholdingPercent: DecimalInput;
}

export class PurchaseOrderDiscountError extends Error {
    constructor(
        message: string,
        public readonly code: "DISCOUNT_MODE_INVALID" | "DISCOUNT_PERCENT_INVALID" | "DISCOUNT_AMOUNT_INVALID" | "DISCOUNT_EXCEEDS_GROSS",
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
    }
}

export function calculatePurchaseOrderLine(line: PurchaseOrderMoneyLine, exchangeRate: DecimalInput) {
    const discountMode = line.discountMode || "Percentage";
    if (discountMode !== "Percentage") {
        throw new PurchaseOrderDiscountError("New purchase orders must use percentage discounts.", "DISCOUNT_MODE_INVALID", {
            discountMode
        });
    }

    const percentageDiscount = calculatePercentageDiscount(line.quantity, line.unitPrice, line.discountPercent ?? 0);
    const grossForeign = percentageDiscount.grossAmount;
    const discountPercent = DecimalValue.from(line.discountPercent ?? 0);
    if (discountPercent.compare(0) < 0 || discountPercent.compare(100) > 0) {
        throw new PurchaseOrderDiscountError("Percentage discounts must be between 0 and 100.", "DISCOUNT_PERCENT_INVALID", {
            discountPercent: discountPercent.toFixed(2),
            grossForeign
        });
    }

    const discountForeign = percentageDiscount.discountAmount;
    if (DecimalValue.from(discountForeign).compare(grossForeign) > 0) {
        throw new PurchaseOrderDiscountError("Discount Amount cannot exceed Gross Amount.", "DISCOUNT_EXCEEDS_GROSS", {
            discountMode,
            discountAmount: discountForeign,
            grossForeign
        });
    }
    const discountedSubtotalForeign = DecimalValue.from(grossForeign).subtract(discountForeign).toFixed(2);
    const vatForeign = DecimalValue.from(discountedSubtotalForeign)
        .multiply(line.vatPercent)
        .divideRounded(100, 2)
        .toFixed(2);
    const withholdingForeign = DecimalValue.from(discountedSubtotalForeign)
        .multiply(line.withholdingPercent)
        .divideRounded(100, 2)
        .toFixed(2);
    const netForeign = DecimalValue.from(discountedSubtotalForeign)
        .add(vatForeign)
        .subtract(withholdingForeign)
        .toFixed(2);
    return {
        discountMode,
        grossForeign,
        discountForeign,
        vatForeign,
        withholdingForeign,
        netForeign,
        grossPhp: DecimalValue.from(grossForeign).multiply(exchangeRate).toFixed(2),
        discountPhp: DecimalValue.from(discountForeign).multiply(exchangeRate).toFixed(2),
        vatPhp: DecimalValue.from(vatForeign).multiply(exchangeRate).toFixed(2),
        withholdingPhp: DecimalValue.from(withholdingForeign).multiply(exchangeRate).toFixed(2),
        netPhp: DecimalValue.from(netForeign).multiply(exchangeRate).toFixed(2)
    };
}

export function calculatePurchaseOrderTotals(lines: readonly PurchaseOrderMoneyLine[], exchangeRate: DecimalInput) {
    const calculatedLines = lines.map((line, lineIndex) => {
        try {
            return calculatePurchaseOrderLine(line, exchangeRate);
        } catch (error) {
            if (error instanceof PurchaseOrderDiscountError) {
                throw new PurchaseOrderDiscountError(error.message, error.code, {
                    ...(error.details || {}),
                    lineIndex
                });
            }
            throw error;
        }
    });
    const sum = (field: keyof typeof calculatedLines[number]) => calculatedLines.reduce(
        (total, line) => total.add(line[field]),
        DecimalValue.from(0)
    ).toFixed(2);
    return {
        lines: calculatedLines,
        grossPhp: sum("grossPhp"),
        discountPhp: sum("discountPhp"),
        vatPhp: sum("vatPhp"),
        withholdingPhp: sum("withholdingPhp"),
        netPhp: sum("netPhp"),
        netForeign: sum("netForeign")
    };
}

export interface PurchaseOrderProductPayloadInput extends PurchaseOrderMoneyLine {
    purchaseOrderId: number;
    productId: number;
    categoryType: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOODS";
    exchangeRate: DecimalInput;
    branchId?: number | null;
    purchaseIntent?: PurchaseIntent;
    jobOrderId?: number | null;
    discountType?: number | null;
    received?: number;
}

export function buildPurchaseOrderProductPayload(
    input: PurchaseOrderProductPayloadInput,
    amount: ReturnType<typeof calculatePurchaseOrderLine>
) {
    const quantity = Number(DecimalValue.from(input.quantity).toFixed(0));
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new Error("Purchase-order quantity must be a positive whole number.");
    }
    const unitPricePhp = DecimalValue.from(input.unitPrice).multiply(input.exchangeRate).toFixed(UNIT_PRICE_DECIMAL_SCALE);
    const discountedSubtotalPhp = DecimalValue.from(amount.grossPhp).subtract(amount.discountPhp).toFixed(2);

    return {
        purchase_order_id: input.purchaseOrderId,
        product_id: input.productId,
        category_type: input.categoryType,
        ordered_quantity: quantity,
        unit_price: unitPricePhp,
        approved_price: unitPricePhp,
        discount_type: input.discountType ?? null,
        discount_mode: "Percentage",
        gross_amount: amount.grossPhp,
        discounted_price: DecimalValue.from(discountedSubtotalPhp).divideRounded(quantity, 2).toFixed(2),
        discounted_amount: amount.discountPhp,
        vat_amount: amount.vatPhp,
        withholding_amount: amount.withholdingPhp,
        net_amount: amount.netPhp,
        total_amount: amount.netPhp,
        branch_id: input.branchId ?? null,
        received: input.received ?? 0,
        purchase_intent: input.purchaseIntent || "Buffer_Stock",
        job_order_id: input.jobOrderId ?? null,
        unit_price_foreign: DecimalValue.from(input.unitPrice).toFixed(UNIT_PRICE_DECIMAL_SCALE),
        gross_amount_foreign: amount.grossForeign,
        discount_amount_foreign: amount.discountForeign,
        net_amount_foreign: amount.netForeign,
        discount_percent: input.discountPercent ?? 0,
        vat_percent: input.vatPercent,
        withholding_percent: input.withholdingPercent
    };
}

export interface PurchaseOrderDiscount {
    kind: DiscountKind;
    value: number;
}

export interface QaQuantityDisposition {
    received: number;
    accepted: number;
    rejected: number;
    disposition: QaDisposition;
}

export const PURCHASE_RECEIVING_MOVEMENT = {
    typeName: "Purchase Receiving QA",
    direction: "IN",
    originTable: "purchase_order_receiving"
} as const;

export const PURCHASE_REJECTION_MOVEMENT = {
    typeName: "QA Reject / Bad Order Receipt",
    direction: "IN",
    originTable: "purchase_order_receiving"
} as const;

export interface PurchaseOrderApprovalRule {
    ruleId: number;
    priority: number;
    minimumTotalPhp: string;
    maximumTotalPhp: string | null;
    currencyCode: string | null;
    importScope: "Any" | "Domestic" | "Import";
    productCategoryId: number | null;
    requiresFinance: boolean;
    allowSelfApproval: boolean;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    isActive: boolean;
}

export interface PurchaseOrderApprovalContext {
    totalPhp: DecimalInput;
    currencyCode: string;
    isImport: boolean;
    productCategoryIds: readonly number[];
    businessDate: string;
}

export type PurchaseOrderWorkflowStage = "Finance" | "Complete" | "Rejected";

export interface PurchaseOrderWorkflowState {
    inventoryStatus: number;
    approverId: number | null;
    financeId: number | null;
    requiresFinance: boolean;
}

export function pendingPurchaseOrderApprovalStages(state: PurchaseOrderWorkflowState): Array<"Finance"> {
    if (state.inventoryStatus !== 1 && state.inventoryStatus !== 3) return [];
    // Orders that were already approved by Plant before the workflow change are
    // grandfathered as approved. New and unapproved orders go directly to Finance.
    if (state.inventoryStatus === 3 && state.approverId && !state.financeId) return [];
    return state.financeId ? [] : ["Finance"];
}

export function derivePurchaseOrderWorkflowStage(state: PurchaseOrderWorkflowState): PurchaseOrderWorkflowStage {
    if (state.inventoryStatus === 13) return "Rejected";
    const pendingStages = pendingPurchaseOrderApprovalStages(state);
    return pendingStages[0] || "Complete";
}

function dateOnly(value: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error("Approval dates must use YYYY-MM-DD format.");
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function matchesPurchaseOrderApprovalRule(
    rule: PurchaseOrderApprovalRule,
    context: PurchaseOrderApprovalContext
): boolean {
    try {
        if (!rule.isActive || compareDecimals(context.totalPhp, 0) < 0) return false;
        if (compareDecimals(context.totalPhp, rule.minimumTotalPhp) < 0) return false;
        if (rule.maximumTotalPhp !== null && compareDecimals(context.totalPhp, rule.maximumTotalPhp) > 0) return false;
    } catch {
        return false;
    }

    const ruleCurrency = rule.currencyCode?.trim().toUpperCase();
    if (ruleCurrency && ruleCurrency !== context.currencyCode.trim().toUpperCase()) return false;
    if (rule.importScope === "Import" && !context.isImport) return false;
    if (rule.importScope === "Domestic" && context.isImport) return false;
    if (rule.productCategoryId !== null && !context.productCategoryIds.includes(rule.productCategoryId)) return false;

    const businessDate = dateOnly(context.businessDate);
    if (rule.effectiveFrom && businessDate < dateOnly(rule.effectiveFrom)) return false;
    if (rule.effectiveTo && businessDate > dateOnly(rule.effectiveTo)) return false;
    return true;
}

export function selectPurchaseOrderApprovalRule(
    rules: readonly PurchaseOrderApprovalRule[],
    context: PurchaseOrderApprovalContext
): PurchaseOrderApprovalRule | null {
    const matches = rules.filter(rule => matchesPurchaseOrderApprovalRule(rule, context));
    matches.sort((left, right) =>
        right.priority - left.priority
        || compareDecimals(right.minimumTotalPhp, left.minimumTotalPhp)
        || left.ruleId - right.ruleId
    );
    return matches[0] || null;
}
