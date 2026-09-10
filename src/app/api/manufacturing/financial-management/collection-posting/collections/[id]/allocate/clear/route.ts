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
        console.log(`Processing allocation clear for collection ${params.id}`);
        if (DIRECTUS_URL) {
            await fetch(`${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_eq]=${params.id}`, {
                method: "DELETE",
                headers
            }).catch((err) => console.error("Failed to delete collection_invoices on clear:", err));
        }
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(`API Error clearing allocation for collection ${params.id}:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
