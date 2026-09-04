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
        
        const customerCodesParam = searchParams.get("customerCodes");
        const customerNamesParam = searchParams.get("customerNames");

        if (!customerCodesParam && !customerNamesParam) {
            return NextResponse.json([]);
        }

        const codes = customerCodesParam ? customerCodesParam.split("|") : [];
        const names = customerNamesParam ? customerNamesParam.split("|") : [];

        let customerIds: number[] = [];
        const customerMap = new Map<number, { id?: number; customer_code?: string; customer_name?: string }>();
        const customerFilters: string[] = [];

        if (codes.length > 0) {
            customerFilters.push(`{"customer_code":{"_in":${JSON.stringify(codes)}}}`);
        }
        if (names.length > 0) {
            customerFilters.push(`{"customer_name":{"_in":${JSON.stringify(names)}}}`);
        }

        if (customerFilters.length > 0) {
            const customerFilterString = `{"_or":[${customerFilters.join(",")}]}`;
            const customerUrl = `${DIRECTUS_URL}/items/customer?filter=${encodeURIComponent(customerFilterString)}&fields=id,customer_code,customer_name`;
            const custRes = await fetch(customerUrl, { headers, cache: "no-store" });
            if (custRes.ok) {
                const custData = await custRes.json();
                const customers = custData.data || [];
                customerIds = customers.map((c: { id: number }) => c.id);
                customers.forEach((c: { id: number; customer_code?: string; customer_name?: string }) => customerMap.set(c.id, c));
            } else {
                console.warn(`Failed to fetch customers: ${custRes.status}`);
            }
        }

        if (customerIds.length === 0) {
            return NextResponse.json([]);
        }

        const memoFilter = {
            _and: [
                { customer_id: { _in: customerIds } },
                { status: { _eq: "APPROVED" } }
            ]
        };

        const memoUrl = `${DIRECTUS_URL}/items/customers_memo?filter=${encodeURIComponent(JSON.stringify(memoFilter))}&limit=-1`;
        const res = await fetch(memoUrl, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const memos = data.data || [];

        const mappedMemos = memos
            .map((m: { id: number; memo_number?: string; customer_id?: number; customer_reference?: string; amount?: number; applied_amount?: number; status?: string }) => {
                const customer = (m.customer_id !== undefined ? customerMap.get(m.customer_id) : undefined) || {};
                return {
                    id: m.id,
                    memoNumber: m.memo_number,
                    memo_number: m.memo_number,
                    customerCode: customer.customer_code || m.customer_reference,
                    customerName: customer.customer_name,
                    amount: m.amount || 0,
                    appliedAmount: m.applied_amount || 0,
                    status: m.status
                };
            })
            .filter((m: { amount: number; appliedAmount: number }) => (m.amount - m.appliedAmount) > 0.009);

        return NextResponse.json(mappedMemos);
    } catch (e) {
        console.error("API Error fetching available memos:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
