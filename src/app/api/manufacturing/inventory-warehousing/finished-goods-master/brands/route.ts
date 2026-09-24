import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/brand?limit=-1&sort=brand_name`;
        const res = await fetch(url, {
            headers,
            cache: "no-store"
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Directus failed to fetch brands: ${res.status}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("API Error fetching brands:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { brand_name } = body;

        if (!brand_name || !brand_name.trim()) {
            return NextResponse.json({ error: "Missing brand_name" }, { status: 400 });
        }

        const url = `${DIRECTUS_URL}/items/brand`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                brand_name: brand_name.trim()
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: `Directus failed to create brand: ${res.status} - ${errText}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json({ success: true, brand: json.data });
    } catch (e) {
        console.error("API Error creating brand:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create brand" }, { status: 500 });
    }
}


