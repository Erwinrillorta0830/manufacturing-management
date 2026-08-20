import { procurementDirectusFetch } from "../_directus";

export interface ForexConfig {
    forex_id: number;
    currency_code: string;
    currency_name: string;
    symbol: string;
    exchange_rate: number;
    effective_date: string;
    is_active: number;
    created_at?: string;
    updated_at?: string;
}

export interface ForexRateHistory {
    history_id: number;
    forex_id: number;
    currency_code: string;
    previous_rate: number;
    new_rate: number;
    effective_date: string;
    changed_by_user_id: number | null;
    change_reason: string;
    created_at: string;
}

// In-memory fallback cache so rate updates persist during session if the DB collection is initializing.
export const fallbackActiveRates: ForexConfig[] = [
    {
        forex_id: 1,
        currency_code: "USD",
        currency_name: "US Dollar",
        symbol: "$",
        exchange_rate: 58.500000,
        effective_date: "2026-08-01",
        is_active: 1
    },
    {
        forex_id: 2,
        currency_code: "EUR",
        currency_name: "Euro",
        symbol: "\u20ac",
        exchange_rate: 63.200000,
        effective_date: "2026-08-01",
        is_active: 1
    },
    {
        forex_id: 3,
        currency_code: "JPY",
        currency_name: "Japanese Yen",
        symbol: "\u00a5",
        exchange_rate: 0.385000,
        effective_date: "2026-08-01",
        is_active: 1
    }
];

export const fallbackRateHistory: ForexRateHistory[] = [];

function mapForexConfig(item: Record<string, unknown>): ForexConfig {
    return {
        forex_id: Number(item.forex_id || item.id),
        currency_code: String(item.currency_code || ""),
        currency_name: String(item.currency_name || item.currency_code || ""),
        symbol: String(item.symbol || "$"),
        exchange_rate: Number(item.exchange_rate),
        effective_date: String(item.effective_date || ""),
        is_active: item.is_active ? 1 : 0
    };
}

function mapForexRateHistory(item: Record<string, unknown>): ForexRateHistory {
    return {
        history_id: Number(item.history_id || item.id),
        forex_id: Number(item.forex_id),
        currency_code: String(item.currency_code || ""),
        previous_rate: Number(item.previous_rate),
        new_rate: Number(item.new_rate),
        effective_date: String(item.effective_date || ""),
        changed_by_user_id: item.changed_by_user_id ? Number(item.changed_by_user_id) : null,
        change_reason: String(item.change_reason || "Exchange rate update"),
        created_at: String(item.created_at || new Date().toISOString())
    };
}

export async function getActiveForexRates(): Promise<ForexConfig[]> {
    let activeRates: ForexConfig[] = [...fallbackActiveRates];

    try {
        const configuredRates = await getConfiguredActiveForexRates();
        if (configuredRates.length > 0) {
            activeRates = configuredRates;
        }
    } catch (e) {
        console.warn("[Procurement Forex API] Directus forex_configurations fetch skipped, using active cache", e);
    }

    return activeRates;
}

/**
 * Returns only active currencies configured in Directus.
 * Supplier registration uses this strict variant so a Directus failure never
 * turns a stale fallback currency into a selectable supplier currency.
 */
export async function getConfiguredActiveForexRates(): Promise<ForexConfig[]> {
    const configRes = await procurementDirectusFetch("/items/forex_configurations?filter[is_active][_eq]=1&sort=currency_code");
    if (!configRes.ok) {
        throw new Error(`Failed to load active forex configurations: ${configRes.status}`);
    }

    const configJson = await configRes.json();
    if (!Array.isArray(configJson.data)) return [];

    return configJson.data
        .map((item: Record<string, unknown>) => mapForexConfig(item))
        .filter((item: ForexConfig) => item.currency_code.trim().length > 0 && item.is_active === 1);
}

export async function getForexRateHistory(): Promise<ForexRateHistory[]> {
    let rateHistory: ForexRateHistory[] = [...fallbackRateHistory];

    try {
        const historyRes = await procurementDirectusFetch("/items/forex_rate_history?sort=-created_at&limit=100");
        if (historyRes.ok) {
            const historyJson = await historyRes.json();
            if (Array.isArray(historyJson.data)) {
                rateHistory = historyJson.data.map((item: Record<string, unknown>) => mapForexRateHistory(item));
            }
        }
    } catch (e) {
        console.warn("[Procurement Forex API] Directus forex_rate_history fetch skipped", e);
    }

    return rateHistory;
}

export async function findActiveForexRate(currencyCode: string): Promise<ForexConfig | null> {
    const normalizedCurrencyCode = currencyCode.toUpperCase();
    const activeRates = await getActiveForexRates();
    const rate = activeRates.find(item =>
        item.is_active === 1
        && item.currency_code.toUpperCase() === normalizedCurrencyCode
        && Number.isFinite(item.exchange_rate)
        && item.exchange_rate > 0
    );

    return rate || null;
}
