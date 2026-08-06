import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/discount_type?limit=-1&sort=discount_type`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch discount types: ${res.status}`);
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("[Discount Types API] Error:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch discount types" }, { status: 500 });
    }
}
