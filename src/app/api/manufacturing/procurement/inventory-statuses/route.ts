import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/transaction_status?limit=-1&sort=id&fields=id,status`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch inventory statuses: ${res.status}`);
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("[Inventory Statuses API] Error:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch inventory statuses" }, { status: 500 });
    }
}
