import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/department?limit=-1`, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus failed to fetch departments: ${res.status}`);
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("API Error fetching departments:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch departments" }, { status: 500 });
    }
}
