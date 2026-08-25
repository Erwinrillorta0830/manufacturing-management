import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        
        searchParams.append("fields", "*.*");
        const url = `${DIRECTUS_URL}/items/collection?${searchParams.toString()}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const items = data.data || [];
        
        const mappedItems = items.map((item: any) => ({
            ...item,
            id: item.id,
            docNo: item.docNo || item.doc_no,
            collectionDate: item.collection_date,
            encodedDate: item.date_encoded,
            pouchAmount: item.totalAmount || 0,
            status: item.isPosted ? "POSTED" : (item.isCancelled ? "CANCELLED" : "OPEN"),
            salesmanName: item.salesman_id?.salesman_name || "UNASSIGNED",
            collectedByName: item.collected_by ? `${item.collected_by.user_fname || item.collected_by.first_name || ""} ${item.collected_by.user_lname || item.collected_by.last_name || ""}`.trim() : "ENCODER FALLBACK",
            encoderName: item.encoder_id ? `${item.encoder_id.user_fname || item.encoder_id.first_name || ""} ${item.encoder_id.user_lname || item.encoder_id.last_name || ""}`.trim() : "ENCODER FALLBACK"
        }));
        
        return NextResponse.json({
            content: mappedItems,
            totalElements: data.meta?.filter_count || mappedItems.length,
            totalPages: 1,
            currentPage: 0,
            size: mappedItems.length || 50
        });
    } catch (e) {
        console.error("API Error fetching posting queue:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
