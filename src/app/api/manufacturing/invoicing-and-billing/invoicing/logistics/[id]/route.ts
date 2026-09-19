import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

function directusHeaders() {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (DIRECTUS_TOKEN) h.Authorization = `Bearer ${DIRECTUS_TOKEN}`;
    return h;
}

/**
 * Robustly extracts an integer ID from a potentially nested Directus field
 */
function normalizeId(val: unknown): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
        const parsed = parseInt(val);
        return isNaN(parsed) ? null : parsed;
    }
    if (typeof val === "object") {
        const obj = val as Record<string, unknown>;
        const id = (obj.id || obj.dispatch_id || obj.dispatch_plan_id) as number | string | undefined;
        return typeof id === "number" ? id : (typeof id === "string" ? parseInt(id) : null);
    }
    return null;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: orderId } = await params;
        if (!orderId) {
            return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
        }

        console.log(`[Logistics API] Fetching for Order: ${orderId}`);

        // 1. Get ALL Dispatch Plan IDs from Details
        const detailsRes = await fetch(`${DIRECTUS_BASE}/items/dispatch_plan_details?filter[sales_order_id][_eq]=${orderId}&fields=dispatch_id`, {
            headers: directusHeaders()
        });
        if (!detailsRes.ok) {
            const errBody = await detailsRes.text();
            throw new Error(`Details fetch failed (${detailsRes.status}): ${errBody}`);
        }
        const detailsData = await detailsRes.json();
        
        // Normalize IDs and remove duplicates
        const dispatchIds = Array.from(new Set(
            (detailsData.data || [])
                .map((d: { dispatch_id: unknown }) => normalizeId(d.dispatch_id))
                .filter(Boolean)
        )) as number[];

        console.log(`[Logistics API] Found Dispatch IDs:`, dispatchIds);

        if (dispatchIds.length === 0) {
            // 1. Check if linked via consolidator_invoices (canonical link for consolidated orders)
            let consolNo: string | null = null;
            try {
                const ciRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_invoices?filter[invoice_id][_eq]=${orderId}&fields=id,consolidator_id.id,consolidator_id.consolidator_no&sort=-id&limit=1`, {
                    headers: directusHeaders()
                });
                if (ciRes.ok) {
                    const ciData = await ciRes.json();
                    const rawC = ciData.data?.[0]?.consolidator_id;
                    if (typeof rawC === "object" && rawC !== null) {
                        consolNo = (rawC as { consolidator_no?: string }).consolidator_no || null;
                    } else if (rawC) {
                        const cRes = await fetch(`${DIRECTUS_BASE}/items/consolidator/${rawC}?fields=id,consolidator_no`, { headers: directusHeaders() });
                        if (cRes.ok) {
                            const cData = await cRes.json();
                            consolNo = cData.data?.consolidator_no || null;
                        }
                    }
                }
            } catch (e) {
                console.error("[Logistics API] Error checking consolidator_invoices:", e);
            }

            // 2. Check if linked via consolidator_details by order item details
            if (!consolNo) {
                try {
                    const soDetailsRes = await fetch(`${DIRECTUS_BASE}/items/sales_order_details?filter[order_id][_eq]=${orderId}&fields=detail_id`, {
                        headers: directusHeaders()
                    });
                    if (soDetailsRes.ok) {
                        const soDetailsData = await soDetailsRes.json();
                        const soDetailIds = (soDetailsData.data || []).map((it: { detail_id?: unknown }) => normalizeId(it.detail_id)).filter(Boolean);
                        if (soDetailIds.length > 0) {
                            const cdCheckRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_details?filter[sales_order_detail_id][_in]=${soDetailIds.join(",")}&fields=consolidator_id.id,consolidator_id.consolidator_no&sort=-id&limit=1`, {
                                headers: directusHeaders()
                            });
                            if (cdCheckRes.ok) {
                                const cdCheckData = await cdCheckRes.json();
                                const rawC = cdCheckData.data?.[0]?.consolidator_id;
                                if (typeof rawC === "object" && rawC !== null) {
                                    consolNo = (rawC as { consolidator_no?: string }).consolidator_no || null;
                                } else if (rawC) {
                                    const cRes = await fetch(`${DIRECTUS_BASE}/items/consolidator/${rawC}?fields=id,consolidator_no`, { headers: directusHeaders() });
                                    if (cRes.ok) {
                                        const cData = await cRes.json();
                                        consolNo = cData.data?.consolidator_no || null;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("[Logistics API] Error checking consolidator_details:", e);
                }
            }

            if (consolNo) {
                return NextResponse.json([{
                    pdp_no: null,
                    consolidation_no: consolNo,
                    dispatch_no: null,
                    dispatch_date: null,
                    is_direct: false
                }]);
            }

            // 3. Only if no consolidation record exists, check if order is genuinely a direct order
            const soRes = await fetch(`${DIRECTUS_BASE}/items/sales_order/${orderId}?fields=order_no`, {
                headers: directusHeaders()
            }).catch(() => null);
            const orderNo = soRes && soRes.ok ? (await soRes.json()).data?.order_no : null;
            const isDirect = Boolean(orderNo && orderNo.startsWith("SO-DIR-"));

            if (isDirect) {
                return NextResponse.json([{
                    pdp_no: null,
                    consolidation_no: null,
                    dispatch_no: null,
                    dispatch_date: null,
                    is_direct: true
                }]);
            }

            // Strictly no silent fallback to "N/A"
            return NextResponse.json([{
                pdp_no: null,
                consolidation_no: null,
                dispatch_no: null,
                dispatch_date: null,
                is_direct: false,
                error: "Consolidation batch record not found for this sales order"
            }]);
        }

        // 2. Fetch full details for each dispatch ID
        const logisticsResults = await Promise.all(dispatchIds.map(async (dispatchId: number) => {
            try {
                // Get Dispatch Info
                const dispatchPlanRes = await fetch(`${DIRECTUS_BASE}/items/dispatch_plan/${dispatchId}?fields=dispatch_no,dispatch_date`, {
                    headers: directusHeaders()
                });
                if (!dispatchPlanRes.ok) throw new Error(`Dispatch fetch failed (${dispatchPlanRes.status})`);
                
                const dispatchPlanData = await dispatchPlanRes.json();
                const dp = dispatchPlanData.data || {};
                const dispatchNo = dp.dispatch_no || null;
                const dispatchDate = dp.dispatch_date || null;

                // Get PDP No
                const linkedPdpRes = await fetch(`${DIRECTUS_BASE}/items/post_dispatch_dispatch_plans?filter[dispatch_plan_id][_eq]=${dispatchId}&fields=post_dispatch_plan_id.doc_no`, {
                    headers: directusHeaders()
                });
                if (!linkedPdpRes.ok) throw new Error(`PDP fetch failed (${linkedPdpRes.status})`);
                
                const linkedPdpData = await linkedPdpRes.json();
                const pdpNo = linkedPdpData.data?.[0]?.post_dispatch_plan_id?.doc_no || null;

                // Get Consolidation No
                let consolidationNo: string | null = null;
                if (dispatchNo) {
                    const linkedConsolidatorRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_dispatches?filter[dispatch_no][_eq]=${dispatchNo}&fields=consolidator_id.id,consolidator_id.consolidator_no&sort=-id&limit=1`, {
                        headers: directusHeaders()
                    });
                    if (linkedConsolidatorRes.ok) {
                        const linkedConsolidatorData = await linkedConsolidatorRes.json();
                        const rawC = linkedConsolidatorData.data?.[0]?.consolidator_id;
                        if (typeof rawC === "object" && rawC !== null) {
                            consolidationNo = (rawC as { consolidator_no?: string }).consolidator_no || null;
                        } else if (rawC) {
                            const cRes = await fetch(`${DIRECTUS_BASE}/items/consolidator/${rawC}?fields=id,consolidator_no`, { headers: directusHeaders() });
                            if (cRes.ok) {
                                const cData = await cRes.json();
                                consolidationNo = cData.data?.consolidator_no || null;
                            }
                        }
                    }
                }

                // If not found via consolidator_dispatches, check consolidator_invoices for this order
                if (!consolidationNo) {
                    const ciRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_invoices?filter[invoice_id][_eq]=${orderId}&fields=consolidator_id.id,consolidator_id.consolidator_no&sort=-id&limit=1`, {
                        headers: directusHeaders()
                    });
                    if (ciRes.ok) {
                        const ciData = await ciRes.json();
                        const rawC = ciData.data?.[0]?.consolidator_id;
                        if (typeof rawC === "object" && rawC !== null) {
                            consolidationNo = (rawC as { consolidator_no?: string }).consolidator_no || null;
                        } else if (rawC) {
                            const cRes = await fetch(`${DIRECTUS_BASE}/items/consolidator/${rawC}?fields=id,consolidator_no`, { headers: directusHeaders() });
                            if (cRes.ok) {
                                const cData = await cRes.json();
                                consolidationNo = cData.data?.consolidator_no || null;
                            }
                        }
                    }
                }

                return {
                    id: dispatchId,
                    pdp_no: pdpNo,
                    consolidation_no: consolidationNo,
                    dispatch_no: dispatchNo,
                    dispatch_date: dispatchDate
                };
            } catch (innerErr: unknown) {
                console.error(`[Logistics API] Error fetching details for Dispatch ${dispatchId}:`, innerErr instanceof Error ? innerErr.message : String(innerErr));
                return {
                    id: dispatchId,
                    pdp_no: null,
                    consolidation_no: null,
                    dispatch_no: null,
                    dispatch_date: null,
                    error: innerErr instanceof Error ? innerErr.message : String(innerErr)
                };
            }
        }));

        // 3. Sort by dispatch_date (chronological)
        logisticsResults.sort((a, b) => {
            if (!a.dispatch_date) return -1;
            if (!b.dispatch_date) return 1;
            return new Date(a.dispatch_date).getTime() - new Date(b.dispatch_date).getTime();
        });

        return NextResponse.json(logisticsResults);

    } catch (err: unknown) {
        console.error("[Logistics API] Critical Failure:", err instanceof Error ? err.message : String(err));
        return NextResponse.json({ error: "Internal Server Error", details: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
