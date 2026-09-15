import { DecimalValue, PROCUREMENT_MONEY_DECIMAL_SCALE, type DecimalInput } from "../decimal";

export interface PercentageDiscountCalculation {
    grossAmount: string;
    discountPerUnit: string;
    discountAmount: string;
    netAmount: string;
}

/**
 * Calculates a percentage discount in the transaction currency.
 *
 * The per-unit discount follows Unit Price x Percentage, while the persisted
 * discount amount is the line total so it can be applied to the PO totals.
 */
export function calculatePercentageDiscount(
    quantity: DecimalInput,
    unitPrice: DecimalInput,
    discountPercent: DecimalInput
): PercentageDiscountCalculation {
    const grossAmount = DecimalValue.from(quantity).multiply(unitPrice).toFixed(PROCUREMENT_MONEY_DECIMAL_SCALE);
    const discountPerUnit = DecimalValue.from(unitPrice)
        .multiply(discountPercent)
        .divideRounded(100, PROCUREMENT_MONEY_DECIMAL_SCALE)
        .toFixed(PROCUREMENT_MONEY_DECIMAL_SCALE);
    const discountAmount = DecimalValue.from(grossAmount)
        .multiply(discountPercent)
        .divideRounded(100, PROCUREMENT_MONEY_DECIMAL_SCALE)
        .toFixed(PROCUREMENT_MONEY_DECIMAL_SCALE);
    const netAmount = DecimalValue.from(grossAmount)
        .subtract(discountAmount)
        .toFixed(PROCUREMENT_MONEY_DECIMAL_SCALE);

    return { grossAmount, discountPerUnit, discountAmount, netAmount };
}
