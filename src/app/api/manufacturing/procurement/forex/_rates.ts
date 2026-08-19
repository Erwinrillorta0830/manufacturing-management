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
    changed_by_user_name?: string;
    change_reason: string;
    created_at: string;
}

// In-memory fallback cache so rate updates persist during session if the DB collection is initializing.
export const fallbackActiveRates: ForexConfig[] = [];

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
        changed_by_user_name: item.changed_by_user_name ? String(item.changed_by_user_name) : undefined,
        change_reason: String(item.change_reason || "Exchange rate update"),
        created_at: String(item.created_at || new Date().toISOString())
    };
}

export async function getActiveForexRates(): Promise<ForexConfig[]> {
    let activeRates: ForexConfig[] = [...fallbackActiveRates];

    try {
        const configRes = await procurementDirectusFetch("/items/forex_configurations?filter[is_active][_eq]=1&sort=currency_code");
        if (configRes.ok) {
            const configJson = await configRes.json();
            if (Array.isArray(configJson.data) && configJson.data.length > 0) {
                activeRates = configJson.data.map((item: Record<string, unknown>) => mapForexConfig(item));
            }
        }
    } catch (e) {
        console.warn("[Procurement Forex API] Directus forex_configurations fetch skipped, using active cache", e);
    }

    return activeRates;
}

export async function getForexRateHistory(): Promise<ForexRateHistory[]> {
    let rateHistory: ForexRateHistory[] = [...fallbackRateHistory];

    try {
        const historyRes = await procurementDirectusFetch("/items/forex_rate_history?sort=-created_at&limit=100");
        if (historyRes.ok) {
            const historyJson = await historyRes.json();
            if (Array.isArray(historyJson.data)) {
                rateHistory = historyJson.data.map((item: Record<string, unknown>) => mapForexRateHistory(item));
                
                // Fetch user names dynamically
                const userIds = Array.from(new Set(rateHistory.map(r => r.changed_by_user_id).filter(id => id !== null))) as number[];
                if (userIds.length > 0) {
                    try {
                        // Fetch from the custom user table using the limit=-1 pattern found in the codebase
                        const userRes = await procurementDirectusFetch(`/items/user?limit=-1&fields=user_id,user_fname,user_lname`);
                        const usersJson = await (userRes.ok ? userRes.json() : Promise.resolve({ data: [] }));

                        const userMap = new Map<number, string>();
                        if (Array.isArray(usersJson.data)) {
                            for (const u of usersJson.data) {
                                const id = Number(u.user_id);
                                const first = u.user_fname || "";
                                const last = u.user_lname || "";
                                const name = [first, last].filter(Boolean).join(" ") || `User #${id}`;
                                if (name) userMap.set(id, name);
                            }
                        }
                        
                        for (const r of rateHistory) {
                            if (r.changed_by_user_id && userMap.has(r.changed_by_user_id)) {
                                r.changed_by_user_name = userMap.get(r.changed_by_user_id);
                            }
                        }
                    } catch (e) {
                        console.warn("[Procurement Forex API] Failed to fetch user details for history logs", e);
                    }
                }
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
