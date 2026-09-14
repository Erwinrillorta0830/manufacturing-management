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
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const url = `${DIRECTUS_URL}/items/collection/${params.id}`;
        const phDate = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).replace("T", " ");
        
        const res = await fetch(url, { 
            method: "PATCH", 
            headers, 
            body: JSON.stringify({
                isPosted: true,
                is_posted: true,
                isPosted: 1,
                is_posted: 1,
                date_posted: phDate
            })
        });
        
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        const data = await res.json();
        return NextResponse.json(data.data);
    } catch (e) {
        console.error(`API Error posting collection ${params.id}:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
