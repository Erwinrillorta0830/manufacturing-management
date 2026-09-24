import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/categories?limit=-1&sort=category_name`;
        const res = await fetch(url, {
            headers,
            cache: "no-store"
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Directus failed to fetch categories: ${res.status}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("API Error fetching categories:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch categories" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { category_name } = body;

        if (!category_name || !category_name.trim()) {
            return NextResponse.json({ error: "Missing category_name" }, { status: 400 });
        }

        const url = `${DIRECTUS_URL}/items/categories`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                category_name: category_name.trim()
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: `Directus failed to create category: ${res.status} - ${errText}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json({ success: true, category: json.data });
    } catch (e) {
        console.error("API Error creating category:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create category" }, { status: 500 });
    }
}


