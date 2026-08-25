import { NextResponse } from "next/server";

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
        console.log(`Processing allocation clear for collection ${params.id}`);
        
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(`API Error clearing allocation for collection ${params.id}:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
