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
        
        const url = `${DIRECTUS_URL}/items/sales_return?${searchParams.toString()}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const ret = data.data?.[0];

        if (!ret) {
            return NextResponse.json(null);
        }

        const mappedReturn = {
            id: ret.return_id,
            returnNumber: ret.return_number,
            customerCode: ret.customer_code,
            customerName: ret.customer_name || "",
            totalAmount: Number(ret.total_amount) || 0,
            availableAmount: Number(ret.total_amount) || 0,
            isApplied: ret.isApplied === 1 || ret.isApplied === true || ret.status === 'Applied',
            status: ret.status
        };

        return NextResponse.json(mappedReturn);
    } catch (e) {
        console.error("API Error searching returns:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
