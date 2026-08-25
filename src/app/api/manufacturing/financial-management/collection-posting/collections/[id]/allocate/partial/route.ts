import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const payload = await request.json();
        
        console.log(`Processing partial allocation for collection ${params.id}`, payload);
        
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(`API Error partial allocating collection ${params.id}:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
