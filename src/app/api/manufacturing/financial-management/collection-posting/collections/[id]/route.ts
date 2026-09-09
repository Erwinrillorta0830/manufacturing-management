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
        
        // Parallelize primary queries: collection header, collection details, collection invoices, collection memos, and sales returns
        const [res, detailsRes, invRes, memoRes, returnRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/collection/${id}?fields=*.*`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/collection_details?filter[collection_id][_eq]=${id}`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/collection_invoices?filter[collection_id][_eq]=${id}`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/collection_memos?filter[collection_id][_eq]=${id}`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[collection_id][_eq]=${id}`, { headers, cache: "no-store" })
        ]);

        if (!res.ok) throw new Error(`Directus returned status ${res.status}`);
        const data = await res.json();
        
        let details: Record<string, unknown>[] = [];
        if (detailsRes.ok) {
            details = (await detailsRes.json()).data || [];
        }

        let collInvoices: Record<string, unknown>[] = [];
        if (invRes.ok) {
            collInvoices = (await invRes.json()).data || [];
        }

        let collMemos: Record<string, unknown>[] = [];
        if (memoRes.ok) {
            collMemos = (await memoRes.json()).data || [];
        }

        let collReturns: Record<string, unknown>[] = [];
        if (returnRes && returnRes.ok) {
            collReturns = (await returnRes.json()).data || [];
        }

        // Secondary parallel fetches for denominations, sales invoices, customer details, and sales returns
        const detailIds = details.map((d) => d.id).filter(Boolean);
        const invoiceIdsFromColl = collInvoices.map((ci) => ci.invoice_id).filter(Boolean);
        const invoiceIdsFromRet = collReturns.map((cr) => cr.invoice_no).filter(Boolean);
        const invoiceIds = [...new Set([...invoiceIdsFromColl, ...invoiceIdsFromRet])];
        const memoIds = [...new Set(collMemos.map((cm) => cm.memo_id).filter(Boolean))];
        const returnNos = [...new Set(collReturns.map((cr) => cr.return_no).filter(Boolean))];

        const [denomRes, siRes, custMemoRes, salesReturnRes] = await Promise.all([
            detailIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/collection_details_denomination?filter[collection_detail_id][_in]=${detailIds.join(",")}`, { headers, cache: "no-store" })
                : Promise.resolve(null),
            invoiceIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}`, { headers, cache: "no-store" })
                : Promise.resolve(null),
            memoIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/customers_memo?filter[id][_in]=${memoIds.join(",")}`, { headers, cache: "no-store" })
                : Promise.resolve(null),
            returnNos.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_return?filter[return_id][_in]=${returnNos.join(",")}`, { headers, cache: "no-store" })
                : Promise.resolve(null)
        ]);

        let denominations: Record<string, unknown>[] = [];
        if (denomRes && denomRes.ok) {
            denominations = (await denomRes.json()).data || [];
        }

        let salesInvoices: Record<string, unknown>[] = [];
        if (siRes && siRes.ok) {
            salesInvoices = (await siRes.json()).data || [];
        }

        let customersMemos: Record<string, unknown>[] = [];
        if (custMemoRes && custMemoRes.ok) {
            customersMemos = (await custMemoRes.json()).data || [];
        }

        let salesReturns: Record<string, unknown>[] = [];
        if (salesReturnRes && salesReturnRes.ok) {
            salesReturns = (await salesReturnRes.json()).data || [];
        }

        // Extract customer codes from sales_invoices, collection_details, and customers_memo
        const customerCodesFromSI = salesInvoices.map((si) => si.customer_code).filter((c): c is string => typeof c === "string" && c.trim().length > 0);
        const customerCodesFromCD = details.map((d) => d.customer_code).filter((c): c is string => typeof c === "string" && c.trim().length > 0);
        const customerCodesFromCM = customersMemos.map((cm) => cm.customer_reference).filter((c): c is string => typeof c === "string" && c.trim().length > 0);
        const customerCodes = [...new Set([...customerCodesFromSI, ...customerCodesFromCD, ...customerCodesFromCM])];

        const customerNameMap = new Map<string, string>();
        if (customerCodes.length > 0) {
            try {
                const escCodes = customerCodes.map(c => encodeURIComponent(c)).join(",");
                const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${escCodes}&limit=-1&fields=customer_code,customer_name`, { headers, cache: "no-store" });
                if (custRes.ok) {
                    const custData = (await custRes.json()).data || [];
                    custData.forEach((c: { customer_code?: string; customer_name?: string }) => {
                        if (c.customer_code && c.customer_name) {
                            customerNameMap.set(c.customer_code, c.customer_name);
                        }
                    });
                }
            } catch (err) {
                console.error("Error fetching customer names for collection allocation details:", err);
            }
        }

        const cashBuckets = details.map((d) => {
            const denom = denominations.find((x) => x.collection_detail_id === d.id);
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

        const invoiceAllocations = collInvoices.map((ci) => {
            const inv = salesInvoices.find((si) => si.invoice_id === ci.invoice_id) || {};
            const code = (inv.customer_code as string) || "";
            const resolvedCustomerCode = code || "Unassigned Customer";
            
            // Numerical field calculations based on DDL schema
            const grossVal = typeof inv.gross_amount === "number" ? inv.gross_amount : (typeof inv.total_amount === "number" ? inv.total_amount : (typeof inv.net_amount === "number" ? inv.net_amount : null));
            const netVal = typeof inv.net_amount === "number" ? inv.net_amount : (typeof inv.total_amount === "number" ? inv.total_amount : (typeof inv.gross_amount === "number" ? inv.gross_amount : null));

            return {
                amountApplied: ci.amount,
                allocationType: ci.type,
                sourceTempId: ci.source_temp_id,
                customerName: resolvedCustomerCode,
                customerCode: code,
                invoiceNo: inv.invoice_no,
                invoiceId: inv.invoice_id || ci.invoice_id,
                grossAmount: grossVal,
                originalAmount: netVal,
                remainingBalance: inv.remaining_balance ?? netVal,
                referenceNo: ci.source_temp_id,
            };
        });

        const memoAllocations = collMemos.map((cm) => {
            const cmData = customersMemos.find((m) => m.id === cm.memo_id) || {};
            const refCode = (cmData.customer_reference as string) || "";
            const resolvedCustomerName = customerNameMap.get(refCode) || refCode || "Unassigned Customer";

            return {
                amountApplied: cm.amount,
                allocationType: "MEMO",
                sourceTempId: `memo-${cm.memo_id}`,
                customerName: resolvedCustomerName,
                customerCode: refCode,
                invoiceNo: "",
                invoiceId: 0,
                referenceNo: (cmData.memo_number as string) || `Memo #${cm.memo_id}`,
            };
        });

        const returnAllocations = collReturns.map((cr) => {
            const srData = salesReturns.find((r) => r.return_id === cr.return_no) || {};
            const invData = salesInvoices.find((si) => si.invoice_id === cr.invoice_no) || {};
            const refCode = (srData.customer_code as string) || (invData.customer_code as string) || "";
            const resolvedCustomerName = customerNameMap.get(refCode) || refCode || "Unassigned Customer";

            return {
                amountApplied: cr.amount,
                allocationType: "RETURN",
                sourceTempId: `return-${cr.return_no}`,
                customerName: resolvedCustomerName,
                customerCode: refCode,
                invoiceNo: invData.invoice_no || "",
                invoiceId: cr.invoice_no || 0,
                referenceNo: (srData.return_number as string) || `Return #${cr.return_no}`,
            };
        });

        const allocations = [...invoiceAllocations, ...memoAllocations, ...returnAllocations];

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
