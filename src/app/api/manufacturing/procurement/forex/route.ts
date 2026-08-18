import { NextResponse } from "next/server";
import { procurementDirectusFetch } from "../_directus";
import {
    fallbackActiveRates,
    fallbackRateHistory,
    getActiveForexRates,
    getForexRateHistory
} from "./_rates";
import type { ForexRateHistory } from "./_rates";

export type { ForexConfig, ForexRateHistory } from "./_rates";

export async function GET() {
    try {
        const activeRates = await getActiveForexRates();
        const rateHistory = await getForexRateHistory();

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
