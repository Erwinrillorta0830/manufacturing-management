import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        
        let query = "";
        if (startDate && endDate) {
            query = `?filter[_and][0][collection_date][_gte]=${startDate}&filter[_and][1][collection_date][_lte]=${endDate}`;
        }
        
        const url = `${DIRECTUS_URL}/items/collection${query}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        
        // Mocking the report structure based on what the UI expects
        return NextResponse.json({
            dateRange: `${startDate} to ${endDate}`,
            collections: data.data || []
        });
    } catch (e) {
        console.error("API Error generating collection report:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
