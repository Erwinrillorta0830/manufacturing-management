import { procurementDirectusFetch } from "../procurement/_directus";
import { EXCHANGE_RATE_DECIMAL_SCALE, DecimalValue } from "@/modules/manufacturing-management/decimal";

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

    const params = new URLSearchParams({
        "filter[is_active][_eq]": "1",
        "filter[currency_code][_eq]": "USD",
        fields: "id,currency_code,exchange_rate,effective_date",
        sort: "-effective_date,-id",
        limit: "1"
    });

    let response: Response;
    try {
        response = await procurementDirectusFetch(`/items/forex_configurations?${params.toString()}`);
    } catch {
        throw new PurchaseOrderFxRateError("The current USD exchange rate could not be loaded.");
    }
    if (!response.ok) {
        throw new PurchaseOrderFxRateError("The current USD exchange rate could not be loaded.");
    }

    const body = await response.json().catch(() => null) as { data?: Array<Record<string, unknown>> } | null;
    const row = body?.data?.[0];
    const rawRate = row?.exchange_rate;
    const numericRate = Number(rawRate);
    if (!row || String(row.currency_code || "").toUpperCase() !== "USD" || !Number.isFinite(numericRate) || numericRate <= 0) {
        throw new PurchaseOrderFxRateError("No active USD exchange rate is configured.");
    }

    return {
        currencyCode: "USD",
        exchangeRate: DecimalValue.from(String(rawRate)).toFixed(EXCHANGE_RATE_DECIMAL_SCALE),
        effectiveDate: typeof row.effective_date === "string" ? row.effective_date : null
    };
}
