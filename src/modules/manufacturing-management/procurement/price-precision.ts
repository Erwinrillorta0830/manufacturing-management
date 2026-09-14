import {
    DecimalValue,
    type DecimalInput,
    UNIT_PRICE_DECIMAL_SCALE
} from "../decimal";

export type PurchaseOrderCurrency = "PHP" | "USD";

export function normalizePurchaseOrderUnitPrice(value: DecimalInput): string {
    return DecimalValue.from(value).toFixed(UNIT_PRICE_DECIMAL_SCALE);
}

export function tryNormalizePurchaseOrderUnitPrice(value: unknown): string | null {
    if (value === null || value === undefined || String(value).trim() === "") return null;

    try {
        return normalizePurchaseOrderUnitPrice(String(value));
    } catch {
        return null;
    }
}

export function convertPhpUnitPriceToTransactionCurrency(
    value: DecimalInput,
    currency: PurchaseOrderCurrency,
    exchangeRate: DecimalInput
): string | null {
    try {
        const basePrice = DecimalValue.from(value);
        if (currency === "USD") {
            const rate = DecimalValue.from(exchangeRate);
            if (rate.compare(0) <= 0) return null;
            return basePrice.divideRounded(rate, UNIT_PRICE_DECIMAL_SCALE).toFixed(UNIT_PRICE_DECIMAL_SCALE);
        }

        return basePrice.toFixed(UNIT_PRICE_DECIMAL_SCALE);
    } catch {
        return null;
    }
}
