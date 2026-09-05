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
    const noCacheHeaders = {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    };

    try {
        const { searchParams } = new URL(request.url);
        
        const documentNo = searchParams.get("documentNo");
        const customerCodeParam = searchParams.get("customerCode");

        if (!documentNo) {
            return NextResponse.json(null, { headers: noCacheHeaders });
        }

        const filter = {
            _and: [
                { memo_number: { _eq: documentNo } },
                { status: { _in: ["APPROVED", "PARTIALLY APPLIED"] } }
            ]
        };

        const url = `${DIRECTUS_URL}/items/customers_memo?filter=${encodeURIComponent(JSON.stringify(filter))}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const item = data.data?.[0];

        if (!item) {
            return NextResponse.json(null, { headers: noCacheHeaders });
        }

        const customerIdVal = typeof item.customer_id === "object" && item.customer_id !== null ? item.customer_id.id : item.customer_id;
        
        let mappedCustomerCode = item.customer_reference || customerCodeParam || "";
        let mappedCustomerName = undefined;

        if (customerIdVal) {
            const custRes = await fetch(`${DIRECTUS_URL}/items/customer/${customerIdVal}?fields=customer_code,customer_name`, { headers, cache: "no-store" });
            if (custRes.ok) {
                const custData = await custRes.json();
                if (custData.data) {
                    mappedCustomerCode = custData.data.customer_code || mappedCustomerCode;
                    mappedCustomerName = custData.data.customer_name;
                }
            }
        }

        const mappedItem = {
            id: item.id,
            memoNumber: item.memo_number,
            memo_number: item.memo_number,
            customerCode: mappedCustomerCode,
            customerName: mappedCustomerName,
            amount: Number(item.amount) || 0,
            appliedAmount: Number(item.applied_amount) || 0,
            status: item.status
        };

        return NextResponse.json(mappedItem, { headers: noCacheHeaders });
    } catch (e) {
        console.error("API Error searching memos:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: {
            "Cache-Control": "no-store"
        } });
    }
}
