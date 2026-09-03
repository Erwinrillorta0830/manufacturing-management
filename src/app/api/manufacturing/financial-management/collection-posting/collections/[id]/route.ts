import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = `${DIRECTUS_URL}/items/collection/${id}?fields=*.*`;
        const res = await fetch(url, { headers, cache: "no-store" });
        
        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        const data = await res.json();
        
        const detailsUrl = `${DIRECTUS_URL}/items/collection_details?filter[collection_id][_eq]=${id}`;
        const detailsRes = await fetch(detailsUrl, { headers, cache: "no-store" });
        let details = [];
        if (detailsRes.ok) {
            details = (await detailsRes.json()).data || [];
        }

        let denominations = [];
        if (details.length > 0) {
            const detailIds = details.map((d: Record<string, unknown>) => d.id).join(",");
            const denomUrl = `${DIRECTUS_URL}/items/collection_details_denomination?filter[collection_detail_id][_in]=${detailIds}`;
            const denomRes = await fetch(denomUrl, { headers, cache: "no-store" });
            if (denomRes.ok) denominations = (await denomRes.json()).data || [];
        }

        const cashBuckets = details.map((d: Record<string, unknown>) => {
            const denom = denominations.find((x: Record<string, unknown>) => x.collection_detail_id === d.id);
            return {
                tempId: denom ? `cash-${denom.denomination_id}` : `detail-${d.id}`,
                detailId: d.id,
                coaId: d.type,
                paymentMethodId: d.payment_method,
                bankId: d.bank,
                customerCode: d.customer_code,
                checkNo: d.check_no,
                referenceNo: d.check_no || d.remarks, // Fallback to remarks for EWT/Adjustments
                chequeDate: d.chequeDate,
                amount: d.amount,
                remarks: d.remarks,
                invoiceId: d.invoice_id,
                denominationId: denom?.denomination_id,
                quantity: denom?.quantity,
                findingId: d.finding,
                balanceTypeId: d.balance_type_id
            };
        });

        const invUrl = `${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_eq]=${id}`;
        const invRes = await fetch(invUrl, { headers, cache: "no-store" });
        let collInvoices = [];
        if (invRes.ok) {
            collInvoices = (await invRes.json()).data || [];
        }

        // Fetch related sales_invoices manually because Directus relation is not configured
        const invoiceIds = [...new Set(collInvoices.map((ci: Record<string, unknown>) => ci.invoice_id).filter(Boolean))];
        let salesInvoices: Record<string, unknown>[] = [];
        if (invoiceIds.length > 0) {
            const siUrl = `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}`;
            const siRes = await fetch(siUrl, { headers, cache: "no-store" });
            if (siRes.ok) {
                salesInvoices = (await siRes.json()).data || [];
            }
        }

        const allocations = collInvoices.map((ci: Record<string, unknown>) => {
            const inv = salesInvoices.find((si: Record<string, unknown>) => si.invoice_id === ci.invoice_id) || {};
            
            return {
                amountApplied: ci.amount,
                allocationType: ci.type,
                sourceTempId: ci.source_temp_id,
                customerName: inv.customer_code || "Unknown",
                invoiceNo: inv.invoice_no,
                invoiceId: inv.invoice_id || ci.invoice_id,
                grossAmount: inv.gross_amount,
                originalAmount: inv.net_amount,
                remainingBalance: inv.remaining_balance ?? null,
                referenceNo: ci.source_temp_id,
            };
        });

        return NextResponse.json({
            ...data.data,
            salesmanId: data.data.salesman_id,
            collectedBy: data.data.collected_by,
            crNo: data.data.collection_receipt_no,
            collectionDate: data.data.collection_date,
            cashBuckets: cashBuckets,
            allocations: allocations
        });
    } catch (e) {
        console.error(`API Error fetching collection:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const payload = await request.json();
        
        const collectionData = {
            salesman_id: payload.salesmanId,
            collected_by: payload.collectedBy,
            collection_receipt_no: payload.crNo,
            collection_date: payload.collectionDate,
            remarks: payload.remarks,
            totalAmount: payload.cashBuckets?.reduce((sum: number, b: Record<string, unknown>) => sum + ((b.amount as number) || 0), 0) || 0
        };

        const colRes = await fetch(`${DIRECTUS_URL}/items/collection/${id}`, { 
            method: "PATCH", headers, body: JSON.stringify(collectionData)
        });
        if (!colRes.ok) throw new Error(`Failed to update collection: ${await colRes.text()}`);
        const collectionRecord = (await colRes.json()).data;

        // Fetch existing details to delete them
        const existingDetailsRes = await fetch(`${DIRECTUS_URL}/items/collection_details?filter[collection_id][_eq]=${id}`, { headers });
        if (existingDetailsRes.ok) {
            const existingDetails = (await existingDetailsRes.json()).data || [];
            if (existingDetails.length > 0) {
                const deleteKeys = existingDetails.map((d: Record<string, unknown>) => d.id);
                await fetch(`${DIRECTUS_URL}/items/collection_details`, {
                    method: "DELETE", headers, body: JSON.stringify(deleteKeys)
                });
            }
        }

        // Fetch existing invoices to delete them
        const existingInvoicesRes = await fetch(`${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_eq]=${id}`, { headers });
        if (existingInvoicesRes.ok) {
            const existingInvoices = (await existingInvoicesRes.json()).data || [];
            if (existingInvoices.length > 0) {
                const deleteInvKeys = existingInvoices.map((i: Record<string, unknown>) => i.id);
                await fetch(`${DIRECTUS_URL}/items/collection_invoices`, {
                    method: "DELETE", headers, body: JSON.stringify(deleteInvKeys)
                });
            }
        }

        // Insert new details
        if (payload.cashBuckets && payload.cashBuckets.length > 0) {
            const detailsPromises = payload.cashBuckets.map(async (bucket: Record<string, unknown>) => {
                const detailData = {
                    collection_id: id,
                    type: bucket.coaId,
                    payment_method: bucket.paymentMethodId,
                    bank: bucket.bankId,
                    customer_code: bucket.customerCode,
                    check_no: bucket.referenceNo || bucket.checkNo,
                    chequeDate: bucket.chequeDate,
                    amount: bucket.amount,
                    remarks: bucket.remarks,
                    invoice_id: bucket.invoiceId,
                    is_cleared: false
                };

                const detRes = await fetch(`${DIRECTUS_URL}/items/collection_details`, {
                    method: "POST", headers, body: JSON.stringify(detailData)
                });
                if (!detRes.ok) throw new Error(`Failed to create detail: ${await detRes.text()}`);
                const detailRecord = (await detRes.json()).data;

                if (bucket.denominationId && bucket.quantity) {
                    const denomData = {
                        collection_detail_id: detailRecord.id,
                        denomination_id: bucket.denominationId,
                        quantity: bucket.quantity
                    };
                    await fetch(`${DIRECTUS_URL}/items/collection_details_denomination`, {
                        method: "POST", headers, body: JSON.stringify(denomData)
                    });
                }

                if (bucket.invoiceId) {
                    const invoiceData = {
                        collection_id: id,
                        invoice_id: parseInt(bucket.invoiceId as string),
                        amount: bucket.amount || 0,
                        type: (bucket.paymentMethodId === 2 || String(bucket.tempId || "").startsWith("chk")) ? "CHECK" : "CASH",
                        source_temp_id: bucket.tempId || "CASH_SUMMARY"
                    };
                    const invRes = await fetch(`${DIRECTUS_URL}/items/collection_invoices`, {
                        method: "POST", headers, body: JSON.stringify(invoiceData)
                    });
                    if (!invRes.ok) console.error(`Failed to create collection_invoice link:`, await invRes.text());
                }
            });
            await Promise.all(detailsPromises);
        }
        
        return NextResponse.json(collectionRecord);
    } catch (e) {
        console.error(`API Error updating collection:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
