// src/app/api/manufacturing/sales-return/route.ts

import { NextResponse } from "next/server";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";


const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://vtc:8074";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

interface ReturnDetail {
    product_id: string | number;
    quantity: string | number;
    return_no?: string;
    product?: {
        product_id: number;
        product_name: string;
        product_code: string;
        uom: string;
    } | null;
}

interface Product {
    product_id: number;
    product_name: string;
    product_code: string;
    unit_of_measurement?: {
        unit_shortcut?: string;
    };
}

interface Customer {
    id: number | string;
    customer_name: string;
}

interface SalesReturnHeader {
    return_id: number | string;
    return_number?: string;
    return_date?: string;
    customer_id?: number | string;
    customer_name?: string;
    remarks?: string;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const returnId = searchParams.get("returnId");

        // Fetch details of a specific return
        if (returnId) {
            const res = await fetch(`${DIRECTUS_URL}/items/sales_return_details?filter[return_no][_eq]=${encodeURIComponent(returnId)}&limit=-1`, { headers, cache: "no-store" });
            if (!res.ok) throw new Error(`Failed to fetch return details: ${res.status}`);
            const json = await res.json();
            const details = json.data || [];

            // Resolve product details
            const productIds = [...new Set(details.map((d: ReturnDetail) => Number(d.product_id)).filter(Boolean))];
            if (productIds.length > 0) {
                try {
                    const prodRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&limit=-1&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut`, { headers });
                    if (prodRes.ok) {
                        const prodData: Product[] = (await prodRes.json()).data || [];
                        const prodMap = new Map<number, Product>(prodData.map((p: Product) => [p.product_id, p]));
                        for (const det of details) {
                            const matched = prodMap.get(Number(det.product_id));
                            det.product = matched ? {
                                product_id: matched.product_id,
                                product_name: matched.product_name,
                                product_code: matched.product_code,
                                uom: matched.unit_of_measurement?.unit_shortcut || "PCS"
                            } : null;
                        }
                    }
                } catch (err) {
                    console.error("Error expanding products in sales returns details:", err);
                }
            }

            return NextResponse.json(details);
        }

        // Fetch list of returns
        const res = await fetch(`${DIRECTUS_URL}/items/sales_return?limit=250&sort=-created_at`, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch sales returns: ${res.status}`);
        const json = await res.json();
        const returns: SalesReturnHeader[] = json.data || [];

        // Join customer names
        try {
            const custRes = await fetch(`${DIRECTUS_URL}/items/customer?limit=-1&fields=id,customer_name,customer_code`, { headers });
            if (custRes.ok) {
                const custData: Customer[] = (await custRes.json()).data || [];
                const custMap = new Map<number, string>(custData.map((c: Customer) => [Number(c.id), c.customer_name]));
                for (const ret of returns) {
                    ret.customer_name = custMap.get(Number(ret.customer_id)) || `Customer #${ret.customer_id}`;
                }
            }
        } catch (err) {
            console.error("Error joining customers in sales returns list:", err);
        }

        return NextResponse.json(returns);
    } catch (e) {
        console.error("API Error in sales-return GET:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch sales returns" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const todayStr = await getTodayDateString();
        const body = await request.json();
        const {
            invoice_id,
            return_number,
            return_date,
            customer_id,
            remarks,
            branch_id,
            items // Array of { product_id, quantity, unit_price }
        } = body;

        if (!invoice_id || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "Missing required fields (invoice_id, items)" }, { status: 400 });
        }

        const resolvedReturnNo = return_number || `RET-${Math.floor(1000 + Math.random() * 9000)}`;
        const bId = branch_id ? Number(branch_id) : 1; // Default to main warehouse branch

        // 1. Create Sales Return Header
        const returnPayload = {
            return_number: resolvedReturnNo,
            return_date: return_date || todayStr,
            created_at: new Date().toISOString(),
            customer_id: customer_id ? Number(customer_id) : null,
            invoice_id: Number(invoice_id),
            remarks: remarks || ""
        };

        const createHeaderRes = await fetch(`${DIRECTUS_URL}/items/sales_return`, {
            method: "POST",
            headers,
            body: JSON.stringify(returnPayload)
        });

        if (!createHeaderRes.ok) {
            const errText = await createHeaderRes.text();
            throw new Error(`Failed to create sales return header: ${createHeaderRes.status} - ${errText}`);
        }

        const newReturn = (await createHeaderRes.json()).data;
        const newReturnId = newReturn.return_id;

        // 2. Create Sales Return Details & restore stock to product_ledger
        for (const item of items) {
            const qty = Number(item.quantity || 0);
            const pId = Number(item.product_id);
            const price = Number(item.unit_price || 0);

            if (qty > 0 && pId) {
                // A. Insert detail row
                const detailPayload = {
                    return_no: resolvedReturnNo,
                    product_id: pId,
                    quantity: qty,
                    unit_price: price,
                    net_amount: qty * price
                };

                const detailRes = await fetch(`${DIRECTUS_URL}/items/sales_return_details`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(detailPayload)
                });

                if (!detailRes.ok) {
                    console.error(`Failed to insert sales return detail: ${detailRes.status}`);
                }

                // B. Add positive product_ledger entry to put returned item back into inventory
                try {
                    await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            branchId: bId,
                            productId: pId,
                            quantity: qty, // positive quantity to add stock back
                            documentType: "Sales Return",
                            documentNo: resolvedReturnNo,
                            documentDescription: `Returned from invoice reference: #${invoice_id}`,
                            documentDate: returnPayload.return_date
                        })
                    });
                } catch (ledgerErr) {
                    console.error("Failed to sync returned items to product ledger:", ledgerErr);
                }
            }
        }

        // 3. Automate Sales Order Status update to 'Not Fulfilled'
        try {
            // Find order_id linked to the invoice
            const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, { headers });
            if (invRes.ok) {
                const invoiceData = (await invRes.json()).data;
                const soId = invoiceData.order_id;
                if (soId) {
                    console.log(`[Sales Return API] Auto-transitioning Sales Order ${soId} to Not Fulfilled`);
                    await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ order_status: "Not Fulfilled" })
                    });
                }
            }
        } catch (soErr) {
            console.error("Failed to auto-update Sales Order status during return:", soErr);
        }

        return NextResponse.json({ success: true, return_id: newReturnId, return_number: resolvedReturnNo });
    } catch (e) {
        console.error("API Error in sales-return POST:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create sales return" }, { status: 500 });
    }
}

