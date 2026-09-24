import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/items?limit=-1`, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus failed to fetch items: ${res.status}`);
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("API Error fetching items:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch items" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { item_name, item_type, item_classification } = body;

        if (!item_name) {
            return NextResponse.json({ error: "Missing required field: item_name" }, { status: 400 });
        }

        const payload = {
            item_name,
            item_type: item_type || null,
            item_classification: item_classification || null
        };

        const res = await fetch(`${DIRECTUS_URL}/items/items`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create item: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, item: json.data });
    } catch (e) {
        console.error("API Error creating item:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create item" }, { status: 500 });
    }
}
