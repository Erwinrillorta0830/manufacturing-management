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
        const currentPouchId = searchParams.get("currentPouchId");
        
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
                    validCustomerCodes = (custData.data || []).map((c: { customer_code: string }) => c.customer_code).filter(Boolean);
                }
            } catch (e) {
                console.warn("Failed to fetch customers:", e);
            }
            
            // Merge resolved codes with the original search terms in case one of them is already a valid code
            validCustomerCodes = Array.from(new Set([...validCustomerCodes, ...searchTerms]));
        }

        // Build strict Directus JSON filter
        const returnFilter: { _and: Record<string, unknown>[] } = {
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

        type ReturnRecord = {
            return_id: number;
            return_number: string;
            customer_code: string;
            customer_name?: string;
            salesman_id: string | number;
            total_amount: string | number;
            isApplied: number | boolean;
            status: string;
        };

        const normalizedValidCodes = validCustomerCodes.map(c => c.trim().toUpperCase());
        const normalizedSearchTerms = searchTerms.map(s => s.trim().toUpperCase());

        const returnIds = rawReturns.map((r: ReturnRecord) => r.return_id).filter(Boolean);
        const appliedReturnsMap = new Map<number, number>();

        if (returnIds.length > 0) {
            try {
                const appliedRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[return_no][_in]=${returnIds.join(",")}&limit=-1&fields=return_no,collection_id,amount`, { headers, cache: "no-store" });
                if (appliedRes.ok) {
                    const appliedData = (await appliedRes.json()).data || [];
                    appliedData.forEach((item: { return_no: number; collection_id?: number | string; amount?: number }) => {
                        const colIdStr = item.collection_id != null ? String(item.collection_id) : "";
                        if (currentPouchId && colIdStr === String(currentPouchId)) {
                            // Skip current pouch's allocations in DB since current pouch allocations are tracked dynamically in UI
                            return;
                        }
                        const amt = Number(item.amount) || 0;
                        appliedReturnsMap.set(item.return_no, (appliedReturnsMap.get(item.return_no) || 0) + amt);
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch sales_invoice_sales_return applications:", err);
            }
        }

        const mappedReturns = rawReturns
            .filter((ret: ReturnRecord) => {
                if (salesmanId && String(ret.salesman_id) !== String(salesmanId)) return false;
                
                const codeUpper = (ret.customer_code || "").trim().toUpperCase();
                const nameUpper = (ret.customer_name || "").trim().toUpperCase();

                if (normalizedValidCodes.length > 0 || normalizedSearchTerms.length > 0) {
                    const matchCode = codeUpper && (normalizedValidCodes.includes(codeUpper) || normalizedSearchTerms.includes(codeUpper));
                    const matchName = nameUpper && normalizedSearchTerms.includes(nameUpper);
                    return matchCode || matchName;
                }
                
                return false;
            })
            .map((ret: ReturnRecord) => {
                const totalAmt = Number(ret.total_amount) || 0;
                const priorExternalApplied = appliedReturnsMap.get(ret.return_id) || 0;
                const availableAmt = Math.max(0, totalAmt - priorExternalApplied);
                const isFullyApplied = ret.isApplied === 1 || ret.isApplied === true || ret.status === 'Applied' || availableAmt <= 0.009;

                return {
                    id: ret.return_id,
                    returnNumber: ret.return_number,
                    customerCode: ret.customer_code,
                    customerName: ret.customer_name || "",
                    totalAmount: totalAmt,
                    availableAmount: availableAmt,
                    isApplied: isFullyApplied,
                    status: isFullyApplied ? 'Applied' : ret.status
                };
            })
            .filter((ret: { availableAmount: number }) => ret.availableAmount > 0.009);

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
