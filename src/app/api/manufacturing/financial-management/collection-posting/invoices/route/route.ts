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
        
        const salesmanId = searchParams.get("salesmanId");
        
        // Build strict Directus JSON filter
        const filters: string[] = [];
        if (salesmanId) {
            filters.push(`filter[salesman_id][_eq]=${encodeURIComponent(salesmanId)}`);
        }
        filters.push(`filter[payment_status][_neq]=Paid`);
        
        const queryString = filters.length > 0 ? `?${filters.join("&")}&limit=-1` : "";

        // Fetch invoices associated with a particular route/salesman
        const url = `${DIRECTUS_URL}/items/sales_invoice${queryString}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const rawInvoices = data.data || [];
        const invoiceIds = rawInvoices.map((i: { invoice_id?: number | string }) => Number(i.invoice_id)).filter(Boolean);

        // Fetch past posted allocations for history audit trail
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const historyMap = new Map<number, any[]>();
        if (invoiceIds.length > 0) {
            try {
                const pastRes = await fetch(`${DIRECTUS_URL}/items/collection_invoices?filter[invoice_id][_in]=${invoiceIds.join(",")}&limit=-1&fields=invoice_id,amount,type,source_temp_id,collection_id`, { headers, cache: "no-store" });
                if (pastRes.ok) {
                    const pastData = (await pastRes.json()).data || [];
                    const pastCollectionIds = [...new Set(pastData.map((p: { collection_id?: number | Record<string, unknown> }) => {
                        if (typeof p.collection_id === "object" && p.collection_id !== null) {
                            return (p.collection_id as { id?: number }).id;
                        }
                        return p.collection_id;
                    }).filter(Boolean))];

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const collectionInfoMap = new Map<number, any>();
                    if (pastCollectionIds.length > 0) {
                        const colRes = await fetch(`${DIRECTUS_URL}/items/collection?filter[id][_in]=${pastCollectionIds.join(",")}&limit=-1&fields=id,docNo,doc_no,collection_receipt_no,collection_date,isPosted`, { headers, cache: "no-store" });
                        if (colRes.ok) {
                            const colData = (await colRes.json()).data || [];
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            colData.forEach((c: any) => {
                                collectionInfoMap.set(c.id, c);
                            });
                        }
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    pastData.forEach((p: any) => {
                        const invId = Number(p.invoice_id);
                        const cId = typeof p.collection_id === "object" && p.collection_id !== null ? p.collection_id.id : p.collection_id;
                        const col = collectionInfoMap.get(cId) || (typeof p.collection_id === "object" ? p.collection_id : null);
                        const isPosted = col?.isPosted === true || col?.isPosted === 1 || col?.isPosted === "1";
                        if (invId && isPosted) {
                            const item = {
                                date: String(col?.collection_date || "").split("T")[0] || "Past Date",
                                type: String(p.type || "CASH").toUpperCase(),
                                reference: String(col?.docNo || col?.doc_no || col?.collection_receipt_no || p.source_temp_id || "Posted Pouch"),
                                amount: Math.abs(Number(p.amount) || 0)
                            };
                            if (!historyMap.has(invId)) historyMap.set(invId, []);
                            historyMap.get(invId)!.push(item);
                        }
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch invoice audit trail history:", err);
            }
        }

        const mappedInvoices = rawInvoices.map((inv: {
            invoice_id: number | string;
            invoice_no: string;
            customer_code: string;
            customer_name?: string;
            net_amount: number | string;
            remaining_balance?: number | string;
            invoice_date: string;
            due_date: string;
            payment_status: string;
        }) => {
            const safeInvId = Number(inv.invoice_id);
            return {
                id: inv.invoice_id,
                invoiceId: inv.invoice_id,
                invoiceNo: inv.invoice_no,
                customerCode: inv.customer_code,
                customerName: inv.customer_name || "Deleted Customer",
                originalAmount: Number(inv.net_amount) || 0,
                remainingBalance: inv.remaining_balance !== undefined ? Number(inv.remaining_balance) : (Number(inv.net_amount) || 0),
                transactionDate: inv.invoice_date,
                dueDate: inv.due_date,
                paymentStatus: inv.payment_status,
                history: historyMap.get(safeInvId) || [],
            };
        });

        return NextResponse.json(mappedInvoices);
    } catch (e) {
        console.error("API Error fetching route invoices:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
