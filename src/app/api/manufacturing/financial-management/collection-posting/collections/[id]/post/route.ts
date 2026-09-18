import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const url = `${DIRECTUS_URL}/items/collection/${params.id}`;
        const phDate = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).replace("T", " ");
        
        // 1. Mark collection pouch as posted
        const res = await fetch(url, { 
            method: "PATCH", 
            headers, 
            body: JSON.stringify({
                isPosted: true,
                is_posted: true,
                date_posted: phDate
            })
        });
        
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        const data = await res.json();

        // 2. Fetch linked invoice allocations for this collection pouch (Step 5: Dynamic Invoice Balance & Status Update)
        try {
            const detailsRes = await fetch(
                `${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_eq]=${params.id}&fields=invoice_id,amount`,
                { headers, cache: "no-store" }
            );

            if (detailsRes.ok) {
                const detailsData = await detailsRes.json();
                const allocations: { invoice_id?: number | string; amount?: number }[] = detailsData.data || [];
                const invoiceIds = Array.from(
                    new Set(allocations.map((a) => a.invoice_id).filter((id): id is number | string => id != null))
                );

                if (invoiceIds.length > 0) {
                    await Promise.all(
                        invoiceIds.map(async (invId) => {
                            try {
                                // Fetch all posted allocations for this invoice
                                const postedAllocRes = await fetch(
                                    `${DIRECTUS_URL}/items/collection_invoices?filter[invoice_id][_eq]=${invId}&filter[collection_id][isPosted][_eq]=true&fields=amount`,
                                    { headers, cache: "no-store" }
                                );
                                let postedAllocTotal = 0;
                                if (postedAllocRes.ok) {
                                    const postedAllocData = await postedAllocRes.json();
                                    postedAllocTotal = (postedAllocData.data || []).reduce(
                                        (sum: number, item: { amount?: number }) => sum + Number(item.amount || 0),
                                        0
                                    );
                                }

                                // Fetch target invoice to get net_amount & transaction_status
                                const invRes = await fetch(
                                    `${DIRECTUS_URL}/items/sales_invoice/${invId}?fields=invoice_id,net_amount,total_amount,gross_amount,payment_status,transaction_status`,
                                    { headers, cache: "no-store" }
                                );

                                if (invRes.ok) {
                                    const invData = (await invRes.json()).data || {};
                                    if (invData.transaction_status === "Cancelled") return;

                                    const netAmount = Number(invData.net_amount ?? invData.total_amount ?? invData.gross_amount ?? 0);
                                    let historyPaid = 0;
                                    if (invData.payment_status) {
                                        try {
                                            const parsed = JSON.parse(invData.payment_status);
                                            if (Array.isArray(parsed)) {
                                                historyPaid = parsed.reduce((sum: number, p: { amount?: number }) => sum + Number(p.amount || 0), 0);
                                            }
                                        } catch {
                                            // Non-JSON status string (e.g., "Unpaid", "Paid")
                                        }
                                    }

                                    const totalPaid = postedAllocTotal + historyPaid;
                                    const newStatus = (netAmount > 0 && totalPaid >= netAmount)
                                        ? "Paid"
                                        : totalPaid > 0
                                            ? "Partially Paid"
                                            : "Unpaid";

                                    // Update payment_status on sales_invoice
                                    await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invId}`, {
                                        method: "PATCH",
                                        headers,
                                        body: JSON.stringify({ payment_status: newStatus })
                                    });
                                }
                            } catch (invErr) {
                                console.error(`Failed to update payment_status for invoice ${invId}:`, invErr);
                            }
                        })
                    );
                }
            }
        } catch (syncErr) {
            console.error(`Failed to sync sales invoice statuses for collection ${params.id}:`, syncErr);
        }

        return NextResponse.json(data.data);
    } catch (e) {
        console.error(`API Error posting collection ${params.id}:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
