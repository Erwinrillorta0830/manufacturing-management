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
        headers,
        cache: "no-store"
    });
    if (!getRes.ok) return;
    
    const data = await getRes.json();
    const ids = (data.data || []).map((item: Record<string, unknown>) => item.id).filter(Boolean);
    
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

        // Fetch sales_invoice customer_code map for any target invoices
        const targetInvoiceIds = [...new Set([
            ...allocations.map((a: { invoiceId?: number }) => a.invoiceId).filter(Boolean),
            ...newAdjustments.map((a: { invoiceId?: number }) => a.invoiceId).filter(Boolean)
        ])];

        const invoiceCustomerMap = new Map<number, string>();
        if (targetInvoiceIds.length > 0) {
            try {
                const siRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${targetInvoiceIds.join(",")}&fields=invoice_id,customer_code&limit=-1`, { headers, cache: "no-store" });
                if (siRes.ok) {
                    const siData = (await siRes.json()).data || [];
                    siData.forEach((s: { invoice_id?: number; customer_code?: string }) => {
                        if (s.invoice_id && s.customer_code) {
                            invoiceCustomerMap.set(Number(s.invoice_id), s.customer_code);
                        }
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch sales_invoice customer_codes for allocation:", err);
            }
        }

        // 1.5 Handle virtual items mapping to collection_details
        const tempIdToDbIdMap: Record<string, string> = {};

        // Fetch EWT COA ID
        let ewtCoaId: number = 438;
        let ewtBalanceTypeId: number = 1;
        if (newEwts.length > 0) {
            const coaRes = await fetch(`${DIRECTUS_URL}/items/chart_of_accounts?filter[_or][0][coa_id][_eq]=438&filter[_or][1][gl_name][_icontains]=ewt&filter[_or][2][gl_name][_icontains]=withholding`, { headers });
            if (coaRes.ok) {
                const coaData = await coaRes.json();
                if (coaData.data && coaData.data.length > 0) {
                    const coaObj = coaData.data[0];
                    ewtCoaId = Number(coaObj.coa_id) || 438;
                    ewtBalanceTypeId = Number(coaObj.balance_type) || 1;
                }
            }
        }

        // Insert Adjustments
        for (const adj of newAdjustments) {
            const invId = adj.invoiceId ? Number(adj.invoiceId) : null;
            const custCode = adj.customerCode || (invId ? invoiceCustomerMap.get(invId) : null);
            const detailData: Record<string, unknown> = {
                collection_id: id,
                finding: adj.findingId,
                type: adj.coaId || null,
                balance_type_id: adj.balanceTypeId,
                amount: adj.amount,
                remarks: adj.remarks,
                invoice_id: invId || null,
                customer_code: custCode || null,
                encoder_id: linkedBy
            };
            const res = await fetch(`${DIRECTUS_URL}/items/collection_details`, { method: "POST", headers, body: JSON.stringify(detailData) });
            if (res.ok) {
                const data = await res.json();
                tempIdToDbIdMap[adj.tempId] = `detail-${data.data.id}`;
            }
        }

        // Insert EWTs
        for (const ewt of newEwts) {
            const invId = ewt.invoiceId ? Number(ewt.invoiceId) : null;
            const custCode = ewt.customerCode || (invId ? invoiceCustomerMap.get(invId) : null);
            const detailData: Record<string, unknown> = {
                collection_id: id,
                type: ewtCoaId,
                balance_type_id: ewtBalanceTypeId,
                amount: ewt.amount,
                check_no: ewt.referenceNo,
                remarks: ewt.referenceNo,
                invoice_id: invId || null,
                customer_code: custCode || null,
                encoder_id: linkedBy
            };
            const res = await fetch(`${DIRECTUS_URL}/items/collection_details`, { method: "POST", headers, body: JSON.stringify(detailData) });
            if (res.ok) {
                const data = await res.json();
                tempIdToDbIdMap[ewt.tempId] = `detail-${data.data.id}`;
            }
        }

        // Collect and aggregate RETURN allocations by (return_no, invoice_no) to satisfy UNIQUE constraint
        const returnAmountMap = new Map<string, { returnNo: number; invoiceNo: number; amount: number }>();
        const memoAmountMap = new Map<number, number>();

        const activeDetailAllocatedDbIds = new Set<string>();

        for (const alloc of allocations) {
            if (alloc.amountApplied <= 0) continue; // Skip zero allocations

            const type = alloc.allocationType;

            if (["CASH", "CHECK", "ADJUSTMENT", "EWT", "MEMO"].includes(type)) {
                const mappedSourceId = tempIdToDbIdMap[alloc.sourceTempId] || alloc.sourceTempId;
                invoicesPayload.push({
                    collection_id: id,
                    invoice_id: alloc.invoiceId,
                    amount: alloc.amountApplied,
                    type: type,
                    source_temp_id: mappedSourceId
                });

                if (alloc.invoiceId && typeof mappedSourceId === "string") {
                    const detailDbIdMatch = mappedSourceId.match(/detail-(\d+)/);
                    if (detailDbIdMatch) {
                        const detailId = detailDbIdMatch[1];
                        activeDetailAllocatedDbIds.add(detailId);
                        const targetCustCode = invoiceCustomerMap.get(Number(alloc.invoiceId));
                        void fetch(`${DIRECTUS_URL}/items/collection_details/${detailId}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                invoice_id: alloc.invoiceId,
                                customer_code: targetCustCode || null
                            })
                        }).catch((err: unknown) => console.warn(`Failed to update collection_detail #${detailId} with invoice linkage:`, err));
                    }
                }
            }
            
            if (type === "MEMO") {
                const memoId = parseInt(alloc.sourceTempId.replace(/\D/g, ""), 10);
                if (!isNaN(memoId)) {
                    memoAmountMap.set(memoId, (memoAmountMap.get(memoId) || 0) + alloc.amountApplied);
                }
            } else if (type === "RETURN") {
                const returnNo = parseInt(alloc.sourceTempId.replace(/\D/g, ""), 10);
                if (!isNaN(returnNo) && alloc.invoiceId) {
                    const key = `${returnNo}-${alloc.invoiceId}`;
                    const existing = returnAmountMap.get(key);
                    if (existing) {
                        existing.amount += alloc.amountApplied;
                    } else {
                        returnAmountMap.set(key, { returnNo, invoiceNo: alloc.invoiceId, amount: alloc.amountApplied });
                    }
                }
            }
        }

        // Unlink collection_details that are no longer allocated to an invoice in this pouch
        try {
            const existingDetailsRes = await fetch(`${DIRECTUS_URL}/items/collection_details?filter[collection_id][_eq]=${id}&fields=id,invoice_id`, { headers, cache: "no-store" });
            if (existingDetailsRes.ok) {
                const existingDetails = (await existingDetailsRes.json()).data || [];
                for (const d of existingDetails) {
                    if (d.id && !activeDetailAllocatedDbIds.has(String(d.id))) {
                        await fetch(`${DIRECTUS_URL}/items/collection_details/${d.id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                invoice_id: null,
                                customer_code: null
                            })
                        }).catch((err: unknown) => console.warn(`Failed to clear invoice linkage for detail #${d.id}:`, err));
                    }
                }
            }
        } catch (unlinkedErr) {
            console.warn("Failed to check unlinked collection_details:", unlinkedErr);
        }

        for (const item of returnAmountMap.values()) {
            returnsPayload.push({
                collection_id: id,
                return_no: item.returnNo,
                invoice_no: item.invoiceNo,
                linked_by: linkedBy,
                amount: item.amount
            });
        }

        const phDate = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).replace("T", " ");

        for (const [memoId, amount] of memoAmountMap.entries()) {
            memosPayload.push({
                collection_id: id,
                memo_id: memoId,
                amount: amount,
                date_linked: phDate
            });
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

            // Update customers_memo applied_amount and status
            for (const memoItem of memosPayload) {
                const memoId = memoItem.memo_id as number;
                try {
                    const memoRes = await fetch(`${DIRECTUS_URL}/items/customers_memo/${memoId}?fields=id,amount,applied_amount,status`, { headers });
                    if (memoRes.ok) {
                        const memoData = await memoRes.json();
                        const memo = memoData.data;
                        if (memo) {
                            const colMemosRes = await fetch(`${DIRECTUS_URL}/items/collection_memos?filter[memo_id][_eq]=${memoId}&fields=amount`, { headers });
                            let totalApplied = 0;
                            if (colMemosRes.ok) {
                                const colMemosData = await colMemosRes.json();
                                totalApplied = (colMemosData.data || []).reduce((sum: number, item: { amount?: number }) => sum + (Number(item.amount) || 0), 0);
                            } else {
                                totalApplied = (Number(memo.applied_amount) || 0) + Number(memoItem.amount);
                            }

                            const origAmount = Number(memo.amount) || 0;
                            const newStatus = totalApplied >= (origAmount - 0.009) ? "APPLIED" : (totalApplied > 0 ? "PARTIALLY APPLIED" : memo.status);

                            const phDate = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).replace("T", " ");
                            await fetch(`${DIRECTUS_URL}/items/customers_memo/${memoId}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({
                                    applied_amount: totalApplied,
                                    status: newStatus,
                                    updated_at: phDate
                                })
                            });
                        }
                    }
                } catch (memoErr) {
                    console.warn(`Failed to update customers_memo ${memoId}:`, memoErr);
                }
            }
        }

        if (returnsPayload.length > 0) {
            const res = await fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return`, {
                method: "POST",
                headers,
                body: JSON.stringify(returnsPayload)
            });
            if (!res.ok) throw new Error(`Failed to insert sales_invoice_sales_return: ${await res.text()}`);

            // Also insert into collection_returns for historical compatibility
            const collectionReturnsPayload = returnsPayload.map((r) => ({
                collection_id: id,
                return_id: r.return_no,
                date_linked: phDate
            }));

            try {
                await fetch(`${DIRECTUS_URL}/items/collection_returns`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(collectionReturnsPayload)
                });
            } catch (collRetErr) {
                console.warn("Failed to insert into collection_returns:", collRetErr);
            }
        }
        
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(`API Error allocating collection:`, e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
