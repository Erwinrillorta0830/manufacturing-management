import { NextResponse } from "next/server";
import { getConfiguredActiveForexRates } from "../forex/_rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const activeRates = await getConfiguredActiveForexRates();

        return NextResponse.json({
            success: true,
            currencies: activeRates.map(rate => ({
                forex_id: rate.forex_id,
                currency_code: rate.currency_code.toUpperCase(),
                currency_name: rate.currency_name,
                symbol: rate.symbol,
                is_active: rate.is_active
            }))
        });
    } catch (error) {
        console.error("[Supplier Currencies API] Failed to load active currencies", error);
        return NextResponse.json(
            { success: false, error: "Active supplier currencies could not be loaded." },
            { status: 502 }
        );
    }
}
