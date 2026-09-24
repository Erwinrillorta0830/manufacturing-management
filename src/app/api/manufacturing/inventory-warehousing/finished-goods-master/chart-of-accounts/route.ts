import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/chart_of_accounts?limit=-1&sort=gl_code`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return NextResponse.json([]);
        const data = (await res.json()).data || [];
        return NextResponse.json(data);
    } catch (e) {
        console.error("API Error fetching chart of accounts:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch chart of accounts" }, { status: 500 });
    }
}
