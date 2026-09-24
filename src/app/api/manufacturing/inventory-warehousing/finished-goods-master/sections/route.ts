import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/sections?limit=-1&sort=section_name`;
        const res = await fetch(url, {
            headers,
            cache: "no-store"
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Directus failed to fetch sections: ${res.status}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("API Error fetching sections:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch sections" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { section_name } = body;

        if (!section_name || !section_name.trim()) {
            return NextResponse.json({ error: "Missing section_name" }, { status: 400 });
        }

        const url = `${DIRECTUS_URL}/items/sections`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                section_name: section_name.trim()
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: `Directus failed to create section: ${res.status} - ${errText}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json({ success: true, section: json.data });
    } catch (e) {
        console.error("API Error creating section:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create section" }, { status: 500 });
    }
}


