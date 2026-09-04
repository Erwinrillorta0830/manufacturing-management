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
        }) => ({
            id: inv.invoice_id,
            invoiceId: inv.invoice_id,
            invoiceNo: inv.invoice_no,
            customerCode: inv.customer_code,
            customerName: inv.customer_name || inv.customer_code,
            originalAmount: Number(inv.net_amount) || 0,
            remainingBalance: inv.remaining_balance !== undefined ? Number(inv.remaining_balance) : (Number(inv.net_amount) || 0),
            transactionDate: inv.invoice_date,
            dueDate: inv.due_date,
            paymentStatus: inv.payment_status,
        }));

        return NextResponse.json(mappedInvoices);
    } catch (e) {
        console.error("API Error fetching route invoices:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
