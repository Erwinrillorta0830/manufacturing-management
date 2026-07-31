import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/salesman?filter[isActive][_eq]=true&limit=-1&sort=salesman_name`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        const data = await res.json();
        return NextResponse.json(data.data || []);
    } catch (e) {
        console.error("API Error fetching salesmen:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch salesmen" }, { status: 500 });
    }
}
