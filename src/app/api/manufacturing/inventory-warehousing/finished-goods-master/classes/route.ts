import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/classes?limit=-1&sort=class_name`;
        const res = await fetch(url, {
            headers,
            cache: "no-store"
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Directus failed to fetch classes: ${res.status}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("API Error fetching classes:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch classes" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { class_name } = body;

        if (!class_name || !class_name.trim()) {
            return NextResponse.json({ error: "Missing class_name" }, { status: 400 });
        }

        const url = `${DIRECTUS_URL}/items/classes`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                class_name: class_name.trim()
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: `Directus failed to create class: ${res.status} - ${errText}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json({ success: true, class: json.data });
    } catch (e) {
        console.error("API Error creating class:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create class" }, { status: 500 });
    }
}


