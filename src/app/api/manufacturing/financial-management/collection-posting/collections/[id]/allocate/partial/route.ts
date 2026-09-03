import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

async function deleteByCollectionId(collectionName: string, id: string) {
    // 1. Fetch existing IDs matching the collection_id
    const getRes = await fetch(`${DIRECTUS_URL}/items/${collectionName}?filter[collection_id][_eq]=${id}&fields=id`, {
        headers
    });
    if (!getRes.ok) return;
    
    const data = await getRes.json();
    const ids = data.data?.map((item: Record<string, unknown>) => item.id) || [];
    
    // 2. Delete if IDs exist
    if (ids.length > 0) {
        await fetch(`${DIRECTUS_URL}/items/${collectionName}`, {
            method: "DELETE",
            headers,
            body: JSON.stringify(ids)
        });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const payload = await request.json();
        
        console.log(`Processing allocation for collection ${id}`);

        // 1. Delete Existing Allocations for this Pouch
        await Promise.all([
            deleteByCollectionId("collection_invoices", id),
            deleteByCollectionId("collection_memos", id),
            deleteByCollectionId("sales_invoice_sales_return", id)
        ]);

        // 2. Map and Insert New Allocations
        const allocations = payload.allocations || [];
        
        const invoicesPayload: Record<string, unknown>[] = [];
        const memosPayload: Record<string, unknown>[] = [];
        const returnsPayload: Record<string, unknown>[] = [];
        
        // Fallback linked_by to 1 if not provided by payload/session
        const linkedBy = payload.collectedBy || 1;

        const newAdjustments = payload.newAdjustments || [];
        const newEwts = payload.newEwts || [];

        // 1.5 Handle virtual items mapping to collection_details
        const tempIdToDbIdMap: Record<string, string> = {};

        // Fetch EWT COA ID
        let ewtCoaId: number | null = null;
        if (newEwts.length > 0) {
            const coaRes = await fetch(`${DIRECTUS_URL}/items/chart_of_accounts?filter[_or][0][gl_name][_icontains]=ewt&filter[_or][1][gl_name][_icontains]=withholding`, { headers });
            if (coaRes.ok) {
                const coaData = await coaRes.json();
                if (coaData.data && coaData.data.length > 0) {
                    ewtCoaId = coaData.data[0].coa_id;
                }
            }
        }

        // Insert Adjustments
        for (const adj of newAdjustments) {
            const detailData = {
                collection_id: id,
                finding: adj.findingId,
                balance_type_id: adj.balanceTypeId,
                amount: adj.amount,
                remarks: adj.remarks
            };
            const res = await fetch(`${DIRECTUS_URL}/items/collection_details`, { method: "POST", headers, body: JSON.stringify(detailData) });
            if (res.ok) {
                const data = await res.json();
                tempIdToDbIdMap[adj.tempId] = `detail-${data.data.id}`;
            }
        }

        // Insert EWTs
        for (const ewt of newEwts) {
            const detailData = {
                collection_id: id,
                type: ewtCoaId,
                amount: ewt.amount,
                check_no: ewt.referenceNo,
                remarks: ewt.referenceNo
            };
            const res = await fetch(`${DIRECTUS_URL}/items/collection_details`, { method: "POST", headers, body: JSON.stringify(detailData) });
            if (res.ok) {
                const data = await res.json();
                tempIdToDbIdMap[ewt.tempId] = `detail-${data.data.id}`;
            }
        }

        for (const alloc of allocations) {
            if (alloc.amountApplied <= 0) continue; // Skip zero allocations

            const type = alloc.allocationType;

            if (["CASH", "CHECK", "ADJUSTMENT", "EWT"].includes(type)) {
                invoicesPayload.push({
                    collection_id: id,
                    invoice_id: alloc.invoiceId,
                    amount: alloc.amountApplied,
                    type: type,
                    source_temp_id: tempIdToDbIdMap[alloc.sourceTempId] || alloc.sourceTempId
                });
            } else if (type === "MEMO") {
                const memoId = parseInt(alloc.sourceTempId.replace(/\D/g, ""), 10);
                if (!isNaN(memoId)) {
                    memosPayload.push({
                        collection_id: id,
                        memo_id: memoId,
                        amount: alloc.amountApplied
                    });
                }
            } else if (type === "RETURN") {
                const returnNo = parseInt(alloc.sourceTempId.replace(/\D/g, ""), 10);
                if (!isNaN(returnNo)) {
                    returnsPayload.push({
                        collection_id: id,
                        return_no: returnNo,
                        invoice_no: alloc.invoiceId,
                        linked_by: linkedBy,
                        amount: alloc.amountApplied
                    });
                }
            }
        }

        // 3. Batch Insert to Directus
        if (invoicesPayload.length > 0) {
            const res = await fetch(`${DIRECTUS_URL}/items/collection_invoices`, {
                method: "POST",
                headers,
                body: JSON.stringify(invoicesPayload)
            });
            if (!res.ok) throw new Error(`Failed to insert collection_invoices: ${await res.text()}`);
        }

        if (memosPayload.length > 0) {
            const res = await fetch(`${DIRECTUS_URL}/items/collection_memos`, {
                method: "POST",
                headers,
                body: JSON.stringify(memosPayload)
            });
            if (!res.ok) throw new Error(`Failed to insert collection_memos: ${await res.text()}`);
        }

        if (returnsPayload.length > 0) {
            const res = await fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return`, {
                method: "POST",
                headers,
                body: JSON.stringify(returnsPayload)
            });
            if (!res.ok) throw new Error(`Failed to insert sales_invoice_sales_return: ${await res.text()}`);
        }
        
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(`API Error allocating collection:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
