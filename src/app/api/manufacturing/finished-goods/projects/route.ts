import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/projects?limit=-1&sort=-created_at`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return NextResponse.json([]);
        const data = await res.json();
        return NextResponse.json(data.data || []);
    } catch (e) {
        console.error("API Error fetching projects:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch projects" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { project_name, customer_code } = body;
        
        if (!project_name || !customer_code) {
            return NextResponse.json({ error: "Missing project_name or customer_code" }, { status: 400 });
        }

        const userId = await getUserIdFromToken().catch(() => null);
        const serverTime = await getISOStringInConfiguredTimezone();

        const payload = {
            project_name: project_name.trim().toUpperCase(),
            customer_code: customer_code.trim(),
            created_by: userId,
            created_at: serverTime.substring(0, 19).replace('T', ' ')
        };

        const res = await fetch(`${DIRECTUS_URL}/items/projects`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to create project: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        return NextResponse.json(data.data);
    } catch (e) {
        console.error("API Error creating project:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create project" }, { status: 500 });
    }
}
