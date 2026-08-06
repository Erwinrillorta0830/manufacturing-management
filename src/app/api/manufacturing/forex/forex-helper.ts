import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export interface ForexConfigurationRecord {
    id?: number;
    currency_from: string;
    currency_to: string;
    exchange_rate: number;
    is_live_feed: boolean;
    effective_date: string;
    status?: string;
    notes?: string | null;
    created_by?: number | null; // Integer FK linked to user.user_id
}

const DEFAULT_FOREX_RATE = 58.00;

/**
 * Fetches the latest configured exchange rate from the database.
 * Orders by effective_date DESC and id DESC to guarantee the most recent rate.
 */
export async function getLatestForexConfig(): Promise<ForexConfigurationRecord> {
    try {
        const url = `${DIRECTUS_URL}/items/forex_configurations?sort=-effective_date,-id&limit=1`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (res.ok) {
            const json = await res.json();
            const latest = json.data?.[0];
            if (latest && Number(latest.exchange_rate) > 0) {
                return {
                    id: latest.id,
                    currency_from: latest.currency_from || "USD",
                    currency_to: latest.currency_to || "PHP",
                    exchange_rate: Number(latest.exchange_rate),
                    is_live_feed: Boolean(latest.is_live_feed),
                    effective_date: latest.effective_date || new Date().toISOString(),
                    status: latest.status || "active",
                    notes: latest.notes || null,
                    created_by: latest.created_by || null
                };
            }
        }
    } catch (e) {
        console.error("[Forex API Helper] Error fetching latest forex rate from DB, falling back to default:", e);
    }

    return {
        currency_from: "USD",
        currency_to: "PHP",
        exchange_rate: DEFAULT_FOREX_RATE,
        is_live_feed: false,
        effective_date: new Date().toISOString(),
        status: "active"
    };
}

/**
 * Fetches the recent history log of forex rate configurations.
 */
export async function fetchForexHistory(limit: number = 20): Promise<ForexConfigurationRecord[]> {
    try {
        const url = `${DIRECTUS_URL}/items/forex_configurations?sort=-effective_date,-id&limit=${limit}`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (res.ok) {
            const json = await res.json();
            const data = json.data || [];
            return data.map((item: Record<string, unknown>) => ({
                id: typeof item.id === "number" ? item.id : undefined,
                currency_from: (item.currency_from as string) || "USD",
                currency_to: (item.currency_to as string) || "PHP",
                exchange_rate: Number(item.exchange_rate || DEFAULT_FOREX_RATE),
                is_live_feed: Boolean(item.is_live_feed),
                effective_date: (item.effective_date as string) || new Date().toISOString(),
                status: (item.status as string) || "active",
                notes: (item.notes as string) || null,
                created_by: (item.created_by as number) || null
            }));
        }
    } catch (e) {
        console.error("[Forex API Helper] Error fetching forex history from DB:", e);
    }

    return [];
}

/**
 * Creates and persists a new forex rate configuration in the database.
 */
export async function createForexConfig(input: Partial<ForexConfigurationRecord>): Promise<ForexConfigurationRecord> {
    const payload = {
        currency_from: input.currency_from || "USD",
        currency_to: input.currency_to || "PHP",
        exchange_rate: Number(input.exchange_rate) || DEFAULT_FOREX_RATE,
        is_live_feed: Boolean(input.is_live_feed),
        effective_date: input.effective_date || new Date().toISOString(),
        status: input.status || "active",
        notes: input.notes || null
    };

    try {
        const res = await fetch(`${DIRECTUS_URL}/items/forex_configurations`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const json = await res.json();
            return json.data;
        }
        
        const errText = await res.text();
        console.error("[Forex API Helper] Directus returned error creating forex rate:", errText);
    } catch (e) {
        console.error("[Forex API Helper] Error creating forex rate in DB:", e);
    }

    return payload as ForexConfigurationRecord;
}
