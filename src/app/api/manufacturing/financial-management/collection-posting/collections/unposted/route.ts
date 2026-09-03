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
        
        const page = parseInt(searchParams.get("page") || "1");
        const size = parseInt(searchParams.get("size") || "25");
        
        searchParams.delete("page");
        searchParams.delete("size");
        
        searchParams.append("page", String(page));
        searchParams.append("limit", String(size));
        searchParams.append("meta", "filter_count");

        // Pass through query parameters but force isPosted=0
        searchParams.append("filter[isPosted][_eq]", "0");
        if (!searchParams.has("sort")) {
            searchParams.append("sort", "-collection_date");
        }
        searchParams.append("fields", "*.*");

        const url = `${DIRECTUS_URL}/items/collection?${searchParams.toString()}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const items = data.data || [];
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedItems = items.map((item: any) => {
            const isPosted = item.isPosted === true || item.isPosted === 1 || item.isPosted === "1";
            const isCancelled = item.isCancelled === true || item.isCancelled === 1 || item.isCancelled === "1";
            
            let collectedByVal = "N/A";
            if (item.collected_by) {
                if (typeof item.collected_by === 'object') {
                    const fname = item.collected_by.user_fname || item.collected_by.first_name || "";
                    const lname = item.collected_by.user_lname || item.collected_by.last_name || "";
                    const name = `${fname} ${lname}`.trim();
                    collectedByVal = name || "N/A";
                } else {
                    const strVal = String(item.collected_by).trim();
                    collectedByVal = strVal !== '' ? strVal : "N/A";
                }
            }

            return {
                ...item,
                id: item.id,
                docNo: item.docNo || item.doc_no,
                date: item.collection_date,
                encodedDate: item.date_encoded,
                collectedBy: collectedByVal,
                salesmanCode: item.salesman_id?.salesman_code || item.salesman_id,
                amount: item.totalAmount || item.total_amount || 0,
                status: isPosted ? "POSTED" : (isCancelled ? "CANCELLED" : "Draft"),
                salesmanName: item.salesman_id?.salesman_name || "UNASSIGNED",
                encoderName: item.encoder_id ? `${item.encoder_id.user_fname || item.encoder_id.first_name || ""} ${item.encoder_id.user_lname || item.encoder_id.last_name || ""}`.trim() : "ENCODER FALLBACK"
            };
        });
        
        const totalElements = data.meta?.filter_count || mappedItems.length;
        const totalPages = Math.ceil(totalElements / size);

        return NextResponse.json({
            content: mappedItems,
            totalElements,
            totalPages,
            currentPage: page
        });
    } catch (e) {
        console.error("API Error fetching unposted collections:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch unposted collections" }, { status: 500 });
    }
}
