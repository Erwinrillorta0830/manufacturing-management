import { EXCHANGE_RATE_DECIMAL_SCALE, DecimalValue } from "@/modules/manufacturing-management/decimal";
import { findActiveForexRate } from "../procurement/forex/_rates";

export type PurchaseOrderCurrencyCode = "PHP" | "USD";

export interface PurchaseOrderFxRate {
    currencyCode: PurchaseOrderCurrencyCode;
    exchangeRate: string;
    effectiveDate: string | null;
}

export class PurchaseOrderFxRateError extends Error {
    constructor(
        message: string,
        public readonly status = 503,
        public readonly code = "FX_RATE_UNAVAILABLE",
        public readonly details?: unknown
    ) {
        super(message);
    }
}

export async function resolvePurchaseOrderFxRate(currencyCode: string): Promise<PurchaseOrderFxRate> {
    const normalizedCurrency = currencyCode.toUpperCase();
    if (normalizedCurrency === "PHP") {
        return { currencyCode: "PHP", exchangeRate: "1", effectiveDate: null };
    }
    if (normalizedCurrency !== "USD") {
        throw new PurchaseOrderFxRateError("Purchase orders support PHP and USD currencies only.", 400, "UNSUPPORTED_CURRENCY");
    }

    try {
        const configuredRate = await findActiveForexRate("USD");
        if (!configuredRate) {
            throw new PurchaseOrderFxRateError("No active USD exchange rate is configured.");
        }

        return {
            currencyCode: "USD",
            exchangeRate: DecimalValue.from(String(configuredRate.exchange_rate)).toFixed(EXCHANGE_RATE_DECIMAL_SCALE),
            effectiveDate: configuredRate.effective_date || null
        };
    } catch (error) {
        if (error instanceof PurchaseOrderFxRateError) {
            throw error;
        }
        throw new PurchaseOrderFxRateError("The current USD exchange rate could not be loaded.");
    }
}
