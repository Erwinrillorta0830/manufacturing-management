import { NextResponse } from "next/server";

interface DirectusInvoice {
    collection_id?: number;
    amount?: number;
    type?: string;
    [key: string]: unknown;
}

interface DirectusItem {
    id?: number;
    totalAmount?: number;
    docNo?: string;
    doc_no?: string;
    collection_date?: string;
    date_encoded?: string;
    isPosted?: boolean;
    isCancelled?: boolean;
    salesman_id?: { salesman_name?: string };
    collected_by?: { user_fname?: string; first_name?: string; user_lname?: string; last_name?: string };
    encoder_id?: { user_fname?: string; first_name?: string; user_lname?: string; last_name?: string };
    [key: string]: unknown;
}

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
        
        const page = searchParams.get("page") || "1";
        const size = searchParams.get("size") || "25";
        const sortField = searchParams.get("sortField") || "id";
        const sortDir = searchParams.get("sortDir") || "desc";
        const search = searchParams.get("search") || "";
        const salesman = searchParams.get("salesman") || "all";
        const cashier = searchParams.get("cashier") || "all";
        
        const directusParams = new URLSearchParams();
        directusParams.append("fields", "*.*");
        directusParams.append("limit", size);
        directusParams.append("page", page);
        directusParams.append("meta", "filter_count");

        // Map frontend sort fields to Directus schema
        const fieldMap: Record<string, string> = {
            docNo: "docNo", // The exact field name in Directus is docNo
            collectionDate: "collection_date",
            pouchAmount: "totalAmount",
            salesmanName: "salesman_id.salesman_name",
        };
        const mappedSort = fieldMap[sortField] || sortField;
        directusParams.append("sort", `${sortDir === "desc" ? "-" : ""}${mappedSort}`);

        // Build complex Directus filters
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const directusFilters: any = {};
        if (search) {
            directusFilters._or = [
                { docNo: { _icontains: search } },
                { collection_receipt_no: { _icontains: search } }
            ];
        }
        if (salesman !== "all") {
            directusFilters.salesman_id = { salesman_name: { _eq: salesman } };
        }
        
        let matchingEncoderIds: number[] = [];
        if (cashier !== "all") {
            const parts = cashier.split(" ");
            const firstPart = parts[0];
            
            // Fetch users manually because encoder_id is not a relation in Directus
            const userUrl = `${DIRECTUS_URL}/items/user?filter[_or][0][user_fname][_icontains]=${firstPart}&filter[_or][1][first_name][_icontains]=${firstPart}`;
            const userRes = await fetch(userUrl, { headers, cache: "no-store" });
            if (userRes.ok) {
                const userData = await userRes.json();
                matchingEncoderIds = (userData.data || []).map((u: Record<string, unknown>) => u.user_id || u.id);
            }
            
            if (matchingEncoderIds.length > 0) {
                directusFilters.encoder_id = { _in: matchingEncoderIds };
            } else {
                // Force empty result if no users match
                directusFilters.encoder_id = { _in: [-1] };
            }
        }
        
        if (Object.keys(directusFilters).length > 0) {
            directusParams.append("filter", JSON.stringify(directusFilters));
        }

        const url = `${DIRECTUS_URL}/items/collection?${directusParams.toString()}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const items = data.data || [];
        
        // Fetch invoices for the queue to calculate applied amounts and variance
        const collectionIds = items.map((i: DirectusItem) => i.id);
        let allInvoices: DirectusInvoice[] = [];
        if (collectionIds.length > 0) {
            const invUrl = `${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_in]=${collectionIds.join(",")}`;
            const invRes = await fetch(invUrl, { headers, cache: "no-store" });
            if (invRes.ok) {
                allInvoices = (await invRes.json()).data || [];
            }
        }
        
        const mappedItems = items.map((item: DirectusItem) => {
            const invoices = allInvoices.filter(inv => inv.collection_id === item.id);
            let totalAppliedAmount = 0;
            let creditAppliedAmount = 0;
            let expectedCash = 0;

            invoices.forEach(inv => {
                const amt = Math.abs(inv.amount || 0);
                totalAppliedAmount += amt;
                const typeStr = String(inv.type || "PAYMENT").toUpperCase();
                const isCreditOrReturn = typeStr.includes("MEMO") || typeStr.includes("CM") || typeStr.includes("DM") || typeStr.includes("RETURN") || typeStr.includes("RTN");
                const isTax = typeStr.includes("EWT") || typeStr.includes("TAX");

                if (isCreditOrReturn) {
                    creditAppliedAmount += amt;
                } else if (!isTax) {
                    expectedCash += amt;
                }
            });

            const physical = item.totalAmount || 0;
            const variance = expectedCash - physical;
            let adjustmentDebit = 0;
            let adjustmentCredit = 0;

            if (variance > 0.01) {
                adjustmentDebit = variance;
            } else if (variance < -0.01) {
                adjustmentCredit = Math.abs(variance);
            }

            return {
                ...item,
                id: item.id,
                docNo: item.docNo || item.doc_no,
                collectionDate: item.collection_date,
                encodedDate: item.date_encoded,
                pouchAmount: item.totalAmount || 0,
                status: item.isPosted ? "POSTED" : (item.isCancelled ? "CANCELLED" : "OPEN"),
                salesmanName: item.salesman_id?.salesman_name || "UNASSIGNED",
                collectedByName: item.collected_by ? `${item.collected_by.user_fname || item.collected_by.first_name || ""} ${item.collected_by.user_lname || item.collected_by.last_name || ""}`.trim() : "ENCODER FALLBACK",
                encoderName: item.encoder_id ? `${item.encoder_id.user_fname || item.encoder_id.first_name || ""} ${item.encoder_id.user_lname || item.encoder_id.last_name || ""}`.trim() : "ENCODER FALLBACK",
                totalAppliedAmount,
                creditAppliedAmount,
                adjustmentDebit,
                adjustmentCredit
            };
        });
        
        const totalElements = data.meta?.filter_count || mappedItems.length;
        const totalPages = Math.ceil(totalElements / parseInt(size));

        return NextResponse.json({
            content: mappedItems,
            totalElements,
            totalPages,
            currentPage: parseInt(page),
            size: parseInt(size)
        });
    } catch (e) {
        console.error("API Error fetching posting queue:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
