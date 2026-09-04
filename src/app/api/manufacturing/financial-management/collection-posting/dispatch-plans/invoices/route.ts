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
        
        const planId = searchParams.get("planId");
        
        // Mock query joining dispatch plan invoices mapping to unpaid invoices
        const url = `${DIRECTUS_URL}/items/sales_invoice?filter[dispatch_id][_eq]=${planId}&filter[payment_status][_neq]=Paid`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        
        const data = await res.json();
        const rawInvoices = data.data || [];

        const mappedInvoices = rawInvoices.map((inv: any) => ({
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
        console.error("API Error fetching dispatch plan invoices:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
