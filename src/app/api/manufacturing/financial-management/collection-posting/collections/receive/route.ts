import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        
        // 1. Create main collection record
        const collectionData = {
            salesman_id: payload.salesmanId,
            collected_by: payload.collectedBy,
            collection_receipt_no: payload.crNo,
            collection_date: payload.collectionDate,
            remarks: payload.remarks,
            isPosted: false,
            isCancelled: false,
            totalAmount: payload.cashBuckets?.reduce((sum: number, b: Record<string, unknown>) => sum + ((b.amount as number) || 0), 0) || 0
        };

        const colRes = await fetch(`${DIRECTUS_URL}/items/collection`, { 
            method: "POST", headers, body: JSON.stringify(collectionData) 
        });
        
        if (!colRes.ok) throw new Error(`Failed to create collection: ${await colRes.text()}`);
        const collectionRecord = (await colRes.json()).data;
        const collectionId = collectionRecord.id;

        // 🚀 Auto-generate docNo based on the new ID and update the record
        const docNo = `CP-${String(collectionId).padStart(6, '0')}`;
        await fetch(`${DIRECTUS_URL}/items/collection/${collectionId}`, {
            method: "PATCH", headers, body: JSON.stringify({ docNo })
        });
        collectionRecord.docNo = docNo;

        // 2. Create details & denominations
        if (payload.cashBuckets && payload.cashBuckets.length > 0) {
            const detailsPromises = payload.cashBuckets.map(async (bucket: Record<string, unknown>) => {
                const detailData = {
                    collection_id: collectionId,
                    type: bucket.coaId,
                    payment_method: bucket.paymentMethodId,
                    encoder_id: payload.encoderId,
                    bank: bucket.bankId,
                    customer_code: bucket.customerCode,
                    check_no: bucket.referenceNo,
                    chequeDate: bucket.chequeDate,
                    amount: bucket.amount,
                    invoice_id: bucket.invoiceId,
                    is_cleared: false
                };

                const detRes = await fetch(`${DIRECTUS_URL}/items/collection_details`, {
                    method: "POST", headers, body: JSON.stringify(detailData)
                });
                if (!detRes.ok) throw new Error(`Failed to create detail: ${await detRes.text()}`);
                const detailRecord = (await detRes.json()).data;

                // 3. Create denomination links for cash buckets
                if (bucket.denominationId && bucket.quantity) {
                    const denomData = {
                        collection_detail_id: detailRecord.id,
                        denomination_id: bucket.denominationId,
                        quantity: bucket.quantity
                    };
                    const denRes = await fetch(`${DIRECTUS_URL}/items/collection_details_denomination`, {
                        method: "POST", headers, body: JSON.stringify(denomData)
                    });
                    if (!denRes.ok) console.error("Failed to insert denomination:", await denRes.text());
                }
            });
            await Promise.all(detailsPromises);
        }
        
        return NextResponse.json(collectionRecord);
    } catch (e) {
        console.error("API Error receiving collection:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
