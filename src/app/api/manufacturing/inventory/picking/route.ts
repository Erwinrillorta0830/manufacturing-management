import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers, fetchJobOrders } from "@/app/api/manufacturing/directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";


interface PickItem {
    productId: number;
    lotNumber: string;
    quantity: number;
}

export async function GET() {
    try {
        // 1. Fetch all job orders
        const jobOrders = await fetchJobOrders();

        // Filter for Proceed (released) and Ongoing (in production) job orders
        const activeJOs = jobOrders.filter(jo => 
            jo.status === "Proceed" || jo.status === "Ongoing" || jo.status === "Finished"
        );

        if (activeJOs.length === 0) {
            return NextResponse.json([]);
        }

        // 2. Fetch all WIP ledger entries to determine if they've been picked
        const joIds = activeJOs.map(jo => jo.jo_id);
        const joIdsFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { documentType: { _in: ["WIP Issue", "WIP Transfer"] } },
                { documentNo: { _in: joIds } }
            ]
        }));

        const ledgerRes = await fetch(`${DIRECTUS_URL}/items/product_ledger?filter=${joIdsFilter}&limit=-1`, {
            headers,
            cache: "no-store"
        });

        const ledgerEntries = ledgerRes.ok ? (await ledgerRes.json()).data || [] : [];

        // 3. Map picked status and picked items to each JO
        const result = activeJOs.map(jo => {
            const joLedger = ledgerEntries.filter((e: { documentNo: string }) => e.documentNo === jo.jo_id);
            const isPicked = joLedger.length > 0;

            const pickedItems = joLedger.map((e: { productId: number; quantity: number; documentDescription: string; created_date?: string }) => {
                const lotMatch = e.documentDescription?.match(/Picked Lot:\s*(.+)$/);
                const lotNo = lotMatch ? lotMatch[1] : "LOT-N/A";
                return {
                    productId: e.productId,
                    quantity: Math.abs(e.quantity),
                    lotNumber: lotNo,
                    datePicked: e.created_date || new Date().toISOString()
                };
            });

            return {
                jo_id: jo.jo_id,
                product_id: jo.product_id,
                product_name: jo.product_name,
                quantity: jo.quantity,
                status: jo.status,
                branch_id: jo.branch_id,
                allocationResults: jo.allocation_results || jo.allocationResults || [],
                components: jo.components || [],
                isPicked,
                pickedItems
            };
        });

        return NextResponse.json(result);
    } catch (e) {
        console.error("[Picking API GET] Error:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch picking lists" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { joId, branchId, items } = body;

        if (!joId || !branchId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: "Missing required fields (joId, branchId, items)" },
                { status: 400 }
            );
        }

        const bId = Number(branchId);

        // 1. Process each pick item
        for (const item of items as PickItem[]) {
            const pId = Number(item.productId);
            const qty = Number(item.quantity);
            const lotNo = item.lotNumber;

            if (isNaN(pId) || isNaN(qty) || qty <= 0 || !lotNo) {
                return NextResponse.json(
                    { error: `Invalid item parameters for product ID ${item.productId}` },
                    { status: 400 }
                );
            }

            // A. Resolve lot_id from existing movements
            let resolvedLotId = 1; // Fallback default
            try {
                const checkMovRes = await fetch(
                    `${DIRECTUS_URL}/items/inventory_movements?filter[product_id][_eq]=${pId}&filter[branch_id][_eq]=${bId}&filter[batch_no][_eq]=${encodeURIComponent(lotNo)}&fields=lot_id&limit=1`,
                    { headers, cache: "no-store" }
                );
                if (checkMovRes.ok) {
                    const checkMovData = (await checkMovRes.json()).data || [];
                    if (checkMovData.length > 0) {
                        const m = checkMovData[0];
                        resolvedLotId = typeof m.lot_id === "object" ? Number(m.lot_id?.lot_id || 1) : Number(m.lot_id || 1);
                    }
                }
            } catch (err) {
                console.error("[Picking API] Error resolving lot_id:", err);
            }

            // B. Create negative product_ledger entry (WIP Issue)
            const ledgerRes = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    branchId: bId,
                    productId: pId,
                    quantity: -qty,
                    documentType: "WIP Issue",
                    documentNo: joId,
                    documentDescription: `Picked Lot: ${lotNo}`,
                    documentDate: await getTodayDateString()
                })
            });

            if (!ledgerRes.ok) {
                const errTxt = await ledgerRes.text();
                throw new Error(`Failed to post WIP issue ledger record: ${ledgerRes.status} - ${errTxt}`);
            }

            // C. Create negative inventory_movements entry (WIP Issue)
            const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    branch_id: bId,
                    product_id: pId,
                    lot_id: resolvedLotId,
                    transaction_type_id: 1, // Job Order Consumage / WIP Issue
                    source_document_no: joId,
                    batch_no: lotNo,
                    quantity: -qty,
                    created_by: 24,
                    remarks: `Picked Lot: ${lotNo} for Job Order ${joId}`
                })
            });

            if (!movRes.ok) {
                console.error(`[Picking API] Failed to post inventory_movements record:`, await movRes.text());
            }
        }

        // 2. Transition Job Order status to "In Progress" if it is "Released" or "Proceed"
        try {
            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joId)}&limit=1`, {
                headers,
                cache: "no-store"
            });
            if (joRes.ok) {
                const joData = (await joRes.json()).data?.[0];
                if (joData && (joData.status === "Released" || joData.status === "Proceed" || joData.status === "Planned" || joData.status === "Draft")) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joData.job_order_id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ status: "In Progress" })
                    });
                }
            }
        } catch (joErr) {
            console.error("[Picking API] Failed to update job order status to In Progress:", joErr);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Picking API POST] Error:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to process materials pick" },
            { status: 500 }
        );
    }
}

