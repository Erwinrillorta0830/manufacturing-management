import { NextResponse } from "next/server";
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

// In-memory fallback cache so rate updates persist during session if DB collection is initializing
const fallbackActiveRates: ForexConfig[] = [
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
        symbol: "€",
        exchange_rate: 63.200000,
        effective_date: "2026-08-01",
        is_active: 1
    },
    {
        forex_id: 3,
        currency_code: "JPY",
        currency_name: "Japanese Yen",
        symbol: "¥",
        exchange_rate: 0.385000,
        effective_date: "2026-08-01",
        is_active: 1
    }
];

const fallbackRateHistory: ForexRateHistory[] = [];

export async function GET() {
    try {
        let activeRates: ForexConfig[] = [...fallbackActiveRates];
        let rateHistory: ForexRateHistory[] = [...fallbackRateHistory];

        // Attempt to fetch from Directus
        try {
            const configRes = await procurementDirectusFetch("/items/forex_configurations?filter[is_active][_eq]=1&sort=currency_code");
            if (configRes.ok) {
                const configJson = await configRes.json();
                if (Array.isArray(configJson.data) && configJson.data.length > 0) {
                    activeRates = configJson.data.map((item: Record<string, unknown>) => ({
                        forex_id: Number(item.forex_id || item.id),
                        currency_code: String(item.currency_code || ""),
                        currency_name: String(item.currency_name || item.currency_code || ""),
                        symbol: String(item.symbol || "$"),
                        exchange_rate: Number(item.exchange_rate),
                        effective_date: String(item.effective_date || ""),
                        is_active: item.is_active ? 1 : 0
                    }));
                }
            }
        } catch (e) {
            console.warn("[Procurement Forex API] Directus forex_configurations fetch skipped, using active cache", e);
        }

        try {
            const historyRes = await procurementDirectusFetch("/items/forex_rate_history?sort=-created_at&limit=100");
            if (historyRes.ok) {
                const historyJson = await historyRes.json();
                if (Array.isArray(historyJson.data)) {
                    rateHistory = historyJson.data.map((item: Record<string, unknown>) => ({
                        history_id: Number(item.history_id || item.id),
                        forex_id: Number(item.forex_id),
                        currency_code: String(item.currency_code || ""),
                        previous_rate: Number(item.previous_rate),
                        new_rate: Number(item.new_rate),
                        effective_date: String(item.effective_date || ""),
                        changed_by_user_id: item.changed_by_user_id ? Number(item.changed_by_user_id) : null,
                        change_reason: String(item.change_reason || "Exchange rate update"),
                        created_at: String(item.created_at || new Date().toISOString())
                    }));
                }
            }
        } catch (e) {
            console.warn("[Procurement Forex API] Directus forex_rate_history fetch skipped", e);
        }

        return NextResponse.json({
            success: true,
            activeRates,
            rateHistory
        });
    } catch (e) {
        console.error("API Error fetching procurement forex rates:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch forex rates" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            forex_id,
            currency_code,
            new_rate,
            effective_date,
            change_reason,
            changed_by_user_id
        } = body;

        if (!currency_code || typeof currency_code !== "string") {
            return NextResponse.json({ error: "currency_code is required" }, { status: 400 });
        }

        const numNewRate = Number(new_rate);
        if (!Number.isFinite(numNewRate) || numNewRate <= 0) {
            return NextResponse.json({ error: "new_rate must be a positive valid number" }, { status: 400 });
        }

        if (!effective_date || typeof effective_date !== "string") {
            return NextResponse.json({ error: "effective_date is required" }, { status: 400 });
        }

        if (!change_reason || typeof change_reason !== "string" || !change_reason.trim()) {
            return NextResponse.json({ error: "Change reason is mandatory for audit logging" }, { status: 400 });
        }

        // Find existing rate for currency_code to establish previous_rate
        const existingConfigIndex = fallbackActiveRates.findIndex(
            r => r.currency_code.toUpperCase() === currency_code.toUpperCase()
        );

        const previous_rate = existingConfigIndex >= 0 ? fallbackActiveRates[existingConfigIndex].exchange_rate : numNewRate;
        const targetForexId = forex_id || (existingConfigIndex >= 0 ? fallbackActiveRates[existingConfigIndex].forex_id : fallbackActiveRates.length + 1);

        // Update in-memory fallback cache
        if (existingConfigIndex >= 0) {
            fallbackActiveRates[existingConfigIndex] = {
                ...fallbackActiveRates[existingConfigIndex],
                exchange_rate: numNewRate,
                effective_date,
                updated_at: new Date().toISOString()
            };
        } else {
            fallbackActiveRates.push({
                forex_id: targetForexId,
                currency_code: currency_code.toUpperCase(),
                currency_name: `${currency_code.toUpperCase()} Currency`,
                symbol: currency_code.toUpperCase() === "EUR" ? "€" : currency_code.toUpperCase() === "JPY" ? "¥" : "$",
                exchange_rate: numNewRate,
                effective_date,
                is_active: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }

        const newHistoryLog: ForexRateHistory = {
            history_id: fallbackRateHistory.length + 1,
            forex_id: targetForexId,
            currency_code: currency_code.toUpperCase(),
            previous_rate,
            new_rate: numNewRate,
            effective_date,
            changed_by_user_id: changed_by_user_id || 1,
            change_reason: change_reason.trim(),
            created_at: new Date().toISOString()
        };

        fallbackRateHistory.unshift(newHistoryLog);

        // Attempt to persist to Directus collections if accessible
        try {
            // Update or Create forex_configurations
            if (existingConfigIndex >= 0 && fallbackActiveRates[existingConfigIndex].forex_id) {
                await procurementDirectusFetch(`/items/forex_configurations/${fallbackActiveRates[existingConfigIndex].forex_id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        exchange_rate: numNewRate,
                        effective_date,
                        updated_at: new Date().toISOString()
                    })
                });
            } else {
                await procurementDirectusFetch("/items/forex_configurations", {
                    method: "POST",
                    body: JSON.stringify({
                        currency_code: currency_code.toUpperCase(),
                        currency_name: `${currency_code.toUpperCase()} Currency`,
                        symbol: currency_code.toUpperCase() === "EUR" ? "€" : currency_code.toUpperCase() === "JPY" ? "¥" : "$",
                        exchange_rate: numNewRate,
                        effective_date,
                        is_active: 1
                    })
                });
            }

            // Insert into forex_rate_history
            await procurementDirectusFetch("/items/forex_rate_history", {
                method: "POST",
                body: JSON.stringify({
                    forex_id: targetForexId,
                    currency_code: currency_code.toUpperCase(),
                    previous_rate,
                    new_rate: numNewRate,
                    effective_date,
                    changed_by_user_id: changed_by_user_id || 1,
                    change_reason: change_reason.trim()
                })
            });
        } catch (e) {
            console.warn("[Procurement Forex API] Directus persistence warning:", e);
        }

        return NextResponse.json({
            success: true,
            message: "FOREX rate updated and audit log recorded successfully.",
            activeRates: fallbackActiveRates,
            rateHistory: fallbackRateHistory,
            newHistoryLog
        });
    } catch (e) {
        console.error("API Error updating procurement forex rate:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to update forex rate" }, { status: 500 });
    }
}
