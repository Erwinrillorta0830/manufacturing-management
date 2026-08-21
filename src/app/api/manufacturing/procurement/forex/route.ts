import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import { procurementDirectusFetch } from "../_directus";
import {
    getActiveForexRates,
    getForexRateHistory
} from "./_rates";

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

        // Fetch current active rates from the database to check if configuration exists
        const currentActiveRates = await getActiveForexRates();
        const existingConfigIndex = currentActiveRates.findIndex(
            r => r.currency_code.toUpperCase() === currency_code.toUpperCase()
        );
        const existingConfig = existingConfigIndex >= 0 ? currentActiveRates[existingConfigIndex] : null;

        // Resolve actual user ID securely from httpOnly cookie to override frontend's hardcoded ID
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        let resolvedUserId = changed_by_user_id || null;

        if (token && changed_by_user_id !== null) {
            const payload = decodeJwtPayload(token);
            if (payload && payload.sub) {
                resolvedUserId = Number(payload.sub);
            }
        }
        
        // Generate accurate PH Local Time string (YYYY-MM-DD HH:mm:ss)
        const phDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const pad = (n: number) => n.toString().padStart(2, "0");
        const phTimeStr = `${phDate.getFullYear()}-${pad(phDate.getMonth() + 1)}-${pad(phDate.getDate())} ${pad(phDate.getHours())}:${pad(phDate.getMinutes())}:${pad(phDate.getSeconds())}`;

        const previous_rate = existingConfig ? existingConfig.exchange_rate : numNewRate;
        const targetForexId = forex_id || (existingConfig ? existingConfig.forex_id : undefined);

        // Attempt to persist to Directus collections
        let finalForexId = targetForexId;
        try {
            let configPatchSuccess = false;

            // Update or Create forex_configurations
            if (existingConfig) {
                const patchRes = await procurementDirectusFetch(`/items/forex_configurations/${existingConfig.forex_id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        exchange_rate: numNewRate,
                        effective_date,
                        updated_at: phTimeStr
                    })
                });

                if (patchRes.ok) {
                    configPatchSuccess = true;
                } else {
                    console.warn(`[Procurement Forex API] PATCH config ${existingConfig.forex_id} failed with status ${patchRes.status}. Falling back to POST.`);
                }
            }

            if (!configPatchSuccess) {
                const postConfigRes = await procurementDirectusFetch("/items/forex_configurations", {
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
                
                if (!postConfigRes.ok) {
                    const errText = await postConfigRes.text();
                    throw new Error(`Failed to POST forex_configurations: ${postConfigRes.status} ${errText}`);
                }
                
                const postConfigJson = await postConfigRes.json();
                const newId = postConfigJson?.data?.forex_id || postConfigJson?.data?.id;
                if (newId) {
                    finalForexId = newId;
                }
            }

            // Insert into forex_rate_history
            const historyPostRes = await procurementDirectusFetch("/items/forex_rate_history", {
                method: "POST",
                body: JSON.stringify({
                    forex_id: finalForexId,
                    currency_code: currency_code.toUpperCase(),
                    previous_rate,
                    new_rate: numNewRate,
                    effective_date,
                    changed_by_user_id: resolvedUserId,
                    change_reason: change_reason.trim(),
                    created_at: phTimeStr
                })
            });

            if (!historyPostRes.ok) {
                const errText = await historyPostRes.text();
                throw new Error(`Failed to POST forex_rate_history: ${historyPostRes.status} ${errText}`);
            }
        } catch (e) {
            console.error("[Procurement Forex API] Directus persistence error:", e);
            return NextResponse.json({ error: (e as Error).message || "Failed to persist to database" }, { status: 500 });
        }

        // Fetch fresh data to return to client
        const activeRates = await getActiveForexRates();
        const rateHistory = await getForexRateHistory();

        return NextResponse.json({
            success: true,
            message: "FOREX rate updated and audit log recorded successfully.",
            activeRates,
            rateHistory
        });
    } catch (e) {
        console.error("API Error updating procurement forex rate:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to update forex rate" }, { status: 500 });
    }
}
