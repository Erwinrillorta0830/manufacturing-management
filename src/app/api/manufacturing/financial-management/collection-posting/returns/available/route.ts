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
        
        const customerCodes = searchParams.get("customerCodes");
        const customerNames = searchParams.get("customerNames");
        const salesmanId = searchParams.get("salesmanId");
        
        // Reject outright if we lack any customer context to prevent dumping all records
        if (!customerCodes && !customerNames) {
            return NextResponse.json({
                content: [],
                totalPages: 1,
                currentPage: 1,
                hasMore: false
            });
        }
        
        const codesArray = customerCodes ? customerCodes.split("|").filter(Boolean) : [];
        const namesArray = customerNames ? customerNames.split("|").filter(Boolean) : [];
        const searchTerms = Array.from(new Set([...codesArray, ...namesArray]));
        
        let validCustomerCodes: string[] = [];
        if (searchTerms.length > 0) {
            const customerFilters = [
                `{"customer_code":{"_in":${JSON.stringify(searchTerms)}}}`,
                `{"customer_name":{"_in":${JSON.stringify(searchTerms)}}}`
            ];
            const customerFilterString = `{"_or":[${customerFilters.join(",")}]}`;
            const customerUrl = `${DIRECTUS_URL}/items/customer?filter=${encodeURIComponent(customerFilterString)}&fields=customer_code`;
            
            try {
                const custRes = await fetch(customerUrl, { headers, cache: "no-store" });
                if (custRes.ok) {
                    const custData = await custRes.json();
                    validCustomerCodes = (custData.data || []).map((c: any) => c.customer_code).filter(Boolean);
                }
            } catch (e) {
                console.warn("Failed to fetch customers:", e);
            }
            
            // Merge resolved codes with the original search terms in case one of them is already a valid code
            validCustomerCodes = Array.from(new Set([...validCustomerCodes, ...searchTerms]));
        }

        // Build strict Directus JSON filter
        const returnFilter: any = {
            _and: [
                { isApplied: { _neq: 1 } }
            ]
        };
        
        if (salesmanId) {
            returnFilter._and.push({ salesman_id: { _eq: Number(salesmanId) } });
        }
        
        if (validCustomerCodes.length > 0) {
            returnFilter._and.push({ customer_code: { _in: validCustomerCodes } });
        }
        
        const queryString = `?filter=${encodeURIComponent(JSON.stringify(returnFilter))}&limit=-1`;

        // Fetch using sales_return or similar return table
        const url = `${DIRECTUS_URL}/items/sales_return${queryString}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const rawReturns = data.data || [];

        const mappedReturns = rawReturns
            .filter((ret: any) => {
                // VERY STRICT IN-MEMORY FIREWALL
                // Ensure Directus didn't dump unassigned returns due to _in array parsing flaws
                if (salesmanId && String(ret.salesman_id) !== String(salesmanId)) return false;
                
                if (validCustomerCodes.length > 0) {
                    return Boolean(ret.customer_code) && validCustomerCodes.includes(String(ret.customer_code).trim());
                }
                
                return false;
            })
            .map((ret: any) => ({
                id: ret.return_id,
                returnNumber: ret.return_number,
                customerCode: ret.customer_code,
                customerName: ret.customer_name || "",
                totalAmount: Number(ret.total_amount) || 0,
                availableAmount: Number(ret.total_amount) || 0,
                isApplied: ret.isApplied === 1 || ret.isApplied === true || ret.status === 'Applied',
                status: ret.status
            }));

        return NextResponse.json({
            content: mappedReturns,
            totalPages: 1,
            currentPage: 1,
            hasMore: false
        });
    } catch (e) {
        console.error("API Error fetching available returns:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
