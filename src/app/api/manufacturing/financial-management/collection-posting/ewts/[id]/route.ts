import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const payload = await request.json();
        
        const url = `${DIRECTUS_URL}/items/collection_details/${params.id}`;
        const res = await fetch(url, { 
            method: "PATCH", 
            headers, 
            body: JSON.stringify(payload) 
        });
        
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        return NextResponse.json(data.data);
    } catch (e) {
        console.error(`API Error updating ewt ${params.id}:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const url = `${DIRECTUS_URL}/items/collection_details/${params.id}`;
        const res = await fetch(url, { method: "DELETE", headers });
        
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(`API Error deleting ewt ${params.id}:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
