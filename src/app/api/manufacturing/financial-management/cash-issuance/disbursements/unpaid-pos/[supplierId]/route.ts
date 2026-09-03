import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    activeReceivingRowsByPurchaseOrder,
    isFullyPostedPurchaseOrder,
    purchaseOrderReferenceKey,
    purchaseOrderReferenceKeyFromParts,
    postedReceivingRowsByPurchaseOrder
} from "../../_purchase-order-eligibility";

export const runtime = "nodejs";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

interface DirectusPurchaseOrder {
    purchase_order_id: number;
    purchase_order_no: string;
    date?: string | null;
    payment_type?: number;
    payment_status?: number;
    total_amount?: number;
    gross_amount?: number;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const supplierId = Number(resolvedParams.supplierId);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return NextResponse.json({ message: "Invalid supplier ID" }, { status: 400 });
    }

    try {
        const queryParams = new URLSearchParams({
            filter: JSON.stringify({
                _and: [
                    { supplier_name: { _eq: supplierId } },
                    { payment_status: { _in: [1, 2, 3] } }
                ]
            }),
            fields: [
                "purchase_order_id",
                "purchase_order_no",
                "date",
                "payment_type",
                "payment_status",
                "total_amount",
                "gross_amount"
            ].join(","),
            limit: "-1"
        });

        const directusRes = await fetch(`${DIRECTUS_URL}/items/purchase_order?${queryParams.toString()}`, {
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            },
            cache: "no-store",
        });

        if (!directusRes.ok) throw new Error(await directusRes.text());
        const poList = ((await directusRes.json()).data || []) as DirectusPurchaseOrder[];

        if (poList.length === 0) {
            return NextResponse.json([]);
        }

        // Fetch active disbursements system-wide to prevent duplicate tagging
        const disbursementQuery = new URLSearchParams({
            "filter[status][_in]": ["Draft", "Submitted", "Approved", "Released"].join(","),
            fields: "id",
            limit: "-1",
        });
        const disRes = await fetch(`${DIRECTUS_URL}/items/disbursement?${disbursementQuery.toString()}`, {
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            cache: "no-store",
        });
        if (!disRes.ok) throw new Error(`Unable to load existing TRs (${disRes.status}).`);
        const disList = (((await disRes.json()).data || []) as Array<{ id: number }>);
        const activeDisbursementIds = disList.map(d => d.id);

        const taggedPayablesList: Array<{ reference_no?: string }> = [];
        if (activeDisbursementIds.length > 0) {
            const taggedPayablesParams = new URLSearchParams();
            taggedPayablesParams.set("filter[disbursement_id][_in]", activeDisbursementIds.join(","));
            taggedPayablesParams.set("fields", "reference_no");
            taggedPayablesParams.set("limit", "-1");

            const taggedPayablesRes = await fetch(`${DIRECTUS_URL}/items/disbursement_payables?${taggedPayablesParams.toString()}`, {
                headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
                cache: "no-store",
            });
            if (!taggedPayablesRes.ok) throw new Error(`Unable to load existing TR payable references (${taggedPayablesRes.status}).`);
            const json = await taggedPayablesRes.json();
            taggedPayablesList.push(...(json.data || []));
        }

        const taggedPurchaseOrderKeys = new Set(
            taggedPayablesList
                .map((payable) => purchaseOrderReferenceKey(payable.reference_no))
                .filter((key): key is string => key !== null),
        );

        const poIds = poList.map(po => po.purchase_order_id);

        const receivingsUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?limit=-1&filter=${encodeURIComponent(
            JSON.stringify({ purchase_order_id: { _in: poIds } })
        )}&fields=purchase_order_id,receipt_no,receipt_date,total_amount,received_quantity,unit_price,isPosted,is_posted_amounts,is_reverted,product_id.product_type`;

        const receivingsRes = await fetch(receivingsUrl, {
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            cache: "no-store",
        });

        if (!receivingsRes.ok) throw new Error(await receivingsRes.text());

        const receivingsData = (await receivingsRes.json()).data || [];

        const activeReceivingsByPoId = activeReceivingRowsByPurchaseOrder(receivingsData);
        const postedReceivingsByPoId = postedReceivingRowsByPurchaseOrder(receivingsData);

        const unpaidPos: Array<{
            uniqueKey: string;
            poId: number;
            poNo: string;
            receiptNo: string;
            date: string | null;
            amountDue: number;
            type: string;
            breakdown?: { productType: number | null, amount: number }[];
        }> = [];

        for (const po of poList) {
            const poId = po.purchase_order_id;
            const poNo = po.purchase_order_no;

            if (Number(po.payment_type) === 1) {
                // CWO (Cash With Order)
                const activeReceivings = activeReceivingsByPoId.get(poId) || [];
                // If there ARE receiving rows, they must all be fully posted.
                if (activeReceivings.length > 0 && !isFullyPostedPurchaseOrder(activeReceivings)) {
                    continue;
                }
                
                const cwoRefKey = purchaseOrderReferenceKeyFromParts(poNo, "ADVANCE-CWO");
                if (taggedPurchaseOrderKeys.has(cwoRefKey)) {
                    continue;
                }

                const remainingDue = Math.max(0, Number(po.total_amount || po.gross_amount || 0));
                if (remainingDue > 0.01) {
                    unpaidPos.push({
                        uniqueKey: `${poNo}-ADVANCE-CWO`,
                        poId,
                        poNo,
                        receiptNo: "ADVANCE-CWO",
                        date: po.date ? po.date.split("T")[0] : null,
                        amountDue: Number(remainingDue.toFixed(2)),
                        type: "CWO"
                    });
                }
                
                // Do not process individual receiving rows for CWO, as liability is based on PO total.
                continue;
            }

            // Standard POs: Only receipt rows posted to inventory and to financial amounts
            // may contribute to the disbursement selection list.
            const receivings = postedReceivingsByPoId.get(poId) || [];
            const grouped: Record<string, { transDate: string | null, totalLiability: number, breakdown: Record<string, number> }> = {};

            for (const por of receivings) {
                const rNo = por.receipt_no || "NO-RECEIPT";
                if (!grouped[rNo]) {
                    grouped[rNo] = { transDate: null, totalLiability: 0, breakdown: {} };
                }
                const amt = por.total_amount !== null && por.total_amount !== undefined
                    ? Number(por.total_amount)
                    : (Number(por.received_quantity || 0) * Number(por.unit_price || 0));
                
                const actualAmt = amt || 0;
                grouped[rNo].totalLiability += actualAmt;
                
                let productType: number | null = null;
                if (por.product_id && typeof por.product_id === 'object' && 'product_type' in por.product_id) {
                    productType = Number((por.product_id as any).product_type);
                    if (Number.isNaN(productType)) productType = null;
                }

                const key = productType !== null ? String(productType) : "null";
                grouped[rNo].breakdown[key] = (grouped[rNo].breakdown[key] || 0) + actualAmt;

                const currentDateStr = por.receipt_date || null;
                if (currentDateStr) {
                    if (!grouped[rNo].transDate || new Date(currentDateStr) > new Date(grouped[rNo].transDate!)) {
                        grouped[rNo].transDate = currentDateStr.split("T")[0];
                    }
                }
            }

            for (const [receiptNo, data] of Object.entries(grouped)) {
                const refKey = purchaseOrderReferenceKeyFromParts(poNo, receiptNo);
                if (taggedPurchaseOrderKeys.has(refKey)) continue;
                const remainingDue = Math.max(0, data.totalLiability);

                if (remainingDue > 0.01) {
                    const breakdownArray = Object.entries(data.breakdown).map(([key, amount]) => ({
                        productType: key === "null" ? null : Number(key),
                        amount: Number(Math.max(0, amount).toFixed(2))
                    })).filter(b => b.amount > 0);

                    unpaidPos.push({
                        uniqueKey: `${poNo}-${receiptNo}`,
                        poId,
                        poNo,
                        receiptNo,
                        date: data.transDate || (po.date ? po.date.split("T")[0] : null),
                        amountDue: Number(remainingDue.toFixed(2)),
                        type: "RECEIPT",
                        breakdown: breakdownArray
                    });
                }
            }
        }

        return NextResponse.json(unpaidPos);

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        return NextResponse.json({ message: "BFF Error", detail: errorMessage }, { status: 502 });
    }
}
