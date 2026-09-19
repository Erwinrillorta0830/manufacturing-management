import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";
const SPRING_API_BASE = (process.env.SPRING_API_BASE_URL || "").replace(/\/+$/, "");

function directusHeaders() {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (DIRECTUS_TOKEN) h.Authorization = `Bearer ${DIRECTUS_TOKEN}`;
    return h;
}

async function getSpringHeaders(): Promise<Record<string, string>> {
    let token: string | undefined;
    try {
        const cookieStore = await cookies();
        token =
            cookieStore.get("springboot_token")?.value ||
            cookieStore.get("vos_access_token")?.value ||
            cookieStore.get("token")?.value;
    } catch {
        // ignore
    }

    if (!token) {
        try {
            const tokenFile = path.resolve(process.cwd(), "node_modules/.cache/vos-tokens/latest_token.txt");
            if (fs.existsSync(tokenFile)) {
                token = fs.readFileSync(tokenFile, "utf8").trim();
            }
        } catch {
            // ignore
        }
    }

    const h: Record<string, string> = {
        Accept: "application/json",
    };
    if (token) {
        h["Authorization"] = `Bearer ${token}`;
        h["Cookie"] = `vos_access_token=${token}`;
    }
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
        // Common Directus expansion keys
        const id = obj.product_id || obj.id || obj.order_id || obj.dispatch_id;
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

        console.log(`[Conversion API] Processing Order ID: ${orderId}`);

        // 1. Fetch Sales Order Header
        const soHeaderRes = await fetch(`${DIRECTUS_BASE}/items/sales_order/${orderId}?fields=*,receipt_type.id,receipt_type.max_length,receipt_type.isOfficial,payment_terms.payment_name`, {
            headers: directusHeaders()
        });
        const soHeaderData = await soHeaderRes.json();
        const order = soHeaderData.data;

        if (!order) {
            console.error(`[Conversion API] Order ${orderId} not found`);
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const maxLength = order.receipt_type?.max_length || 15;
        
        let paymentName = "N/A";
        const ptValue = order.payment_terms;
        if (ptValue) {
            if (typeof ptValue === "object" && ptValue !== null) {
                paymentName = (ptValue as { payment_name?: string }).payment_name || "N/A";
            } else {
                try {
                    const ptRes = await fetch(`${DIRECTUS_BASE}/items/payment_terms/${ptValue}?fields=payment_name`, {
                        headers: directusHeaders()
                    });
                    if (ptRes.ok) {
                        const ptData = await ptRes.json();
                        paymentName = ptData.data?.payment_name || "N/A";
                    }
                } catch (e) {
                    console.error("Failed to fetch payment terms detail:", e);
                }
            }
        }
        const customerCode = order.customer_code;

        // 1.1 Fetch Customer Details
        let customerInfo = null;
        if (customerCode) {
            const custRes = await fetch(`${DIRECTUS_BASE}/items/customer?filter[customer_code][_eq]=${customerCode}&fields=customer_name,store_name,customer_tin,province,city,brgy`, {
                headers: directusHeaders()
            });
            const custData = await custRes.json();
            customerInfo = custData.data?.[0] || null;
        }

        // 2. Fetch Sales Order Details
        const soDetailsRes = await fetch(`${DIRECTUS_BASE}/items/sales_order_details?filter[order_id][_eq]=${orderId}&fields=*`, {
            headers: directusHeaders()
        });
        const soDetailsData = await soDetailsRes.json();
        const items = soDetailsData.data || [];
        
        console.log(`[Conversion API] Found ${items.length} details for order ${orderId}`);

        // 3. Collect Unique Product IDs for lookup
        const productIds = Array.from(new Set(items.map((it: { product_id: unknown }) => normalizeId(it.product_id)).filter(Boolean)));
        console.log(`[Conversion API] Unique Product IDs to lookup:`, productIds);

        const productMap: Record<string, { name: string; unit: string; barcode: string }> = {};

        if (productIds.length > 0) {
            // Fetch product_name and unit_shortcut
            const prodUrl = `${DIRECTUS_BASE}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,barcode,unit_of_measurement.unit_shortcut`;
            const prodRes = await fetch(prodUrl, { headers: directusHeaders() });
            const prodData = await prodRes.json();
            
            (prodData.data || []).forEach((p: { product_id: number; product_name: string; barcode?: string; unit_of_measurement?: { unit_shortcut: string } }) => {
                if (p.product_id) {
                    productMap[String(p.product_id)] = {
                        name: p.product_name,
                        unit: p.unit_of_measurement?.unit_shortcut || "PCS",
                        barcode: p.barcode || ""
                    };
                }
            });
            console.log(`[Conversion API] Mapped ${Object.keys(productMap).length} product names and units`);
        }

        // 4. Resolve Consolidator (Strictly no silent fallback)
        let consolidatorNo: string | null = null;
        let consolidatorId: number | null = null;
        let consolidationError: string | null = null;

        // First: Check consolidator_invoices (canonical link for consolidated orders)
        try {
            const ciRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_invoices?filter[invoice_id][_eq]=${orderId}&fields=id,consolidator_id.id,consolidator_id.consolidator_no&sort=-id&limit=1`, {
                headers: directusHeaders()
            });
            if (ciRes.ok) {
                const ciData = await ciRes.json();
                const rawC = ciData.data?.[0]?.consolidator_id;
                if (typeof rawC === "object" && rawC !== null) {
                    consolidatorId = normalizeId(rawC.id);
                    consolidatorNo = (rawC as { consolidator_no?: string }).consolidator_no || null;
                } else if (rawC) {
                    consolidatorId = normalizeId(rawC);
                    const cRes = await fetch(`${DIRECTUS_BASE}/items/consolidator/${rawC}?fields=id,consolidator_no`, { headers: directusHeaders() });
                    if (cRes.ok) {
                        const cData = await cRes.json();
                        consolidatorNo = cData.data?.consolidator_no || null;
                    }
                }
            }
        } catch (e) {
            console.error("[Conversion API] Error checking consolidator_invoices:", e);
        }

        // Second: Check dispatch_plan_details (scan all linked dispatches)
        if (!consolidatorId) {
            try {
                const dpdRes = await fetch(`${DIRECTUS_BASE}/items/dispatch_plan_details?filter[sales_order_id][_eq]=${orderId}&fields=dispatch_id.dispatch_no,dispatch_id.dispatch_id&sort=-dispatch_id`, {
                    headers: directusHeaders()
                });
                if (dpdRes.ok) {
                    const dpdData = await dpdRes.json();
                    const dispatchRecords = dpdData.data || [];
                    for (const dpd of dispatchRecords) {
                        const dispatchNo = dpd?.dispatch_id?.dispatch_no;
                        if (!dispatchNo) continue;
                        const lcRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_dispatches?filter[dispatch_no][_eq]=${dispatchNo}&fields=consolidator_id.id,consolidator_id.consolidator_no&sort=-id&limit=1`, {
                            headers: directusHeaders()
                        });
                        if (lcRes.ok) {
                            const lcData = await lcRes.json();
                            const rawC = lcData.data?.[0]?.consolidator_id;
                            if (typeof rawC === "object" && rawC !== null) {
                                consolidatorId = normalizeId(rawC.id);
                                consolidatorNo = (rawC as { consolidator_no?: string }).consolidator_no || null;
                            } else if (rawC) {
                                consolidatorId = normalizeId(rawC);
                                const cRes = await fetch(`${DIRECTUS_BASE}/items/consolidator/${rawC}?fields=id,consolidator_no`, { headers: directusHeaders() });
                                if (cRes.ok) {
                                    const cData = await cRes.json();
                                    consolidatorNo = cData.data?.consolidator_no || null;
                                }
                            }
                        }
                        if (consolidatorId) break;
                    }
                }
            } catch (e) {
                console.error("[Conversion API] Error checking dispatch_plan_details:", e);
            }
        }

        // Third: Check consolidator_details by order item details
        if (!consolidatorId) {
            try {
                const soDetailIds = items.map((it: { detail_id?: unknown }) => normalizeId(it.detail_id)).filter(Boolean);
                if (soDetailIds.length > 0) {
                    const cdCheckRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_details?filter[sales_order_detail_id][_in]=${soDetailIds.join(",")}&fields=consolidator_id.id,consolidator_id.consolidator_no&sort=-id&limit=1`, {
                        headers: directusHeaders()
                    });
                    if (cdCheckRes.ok) {
                        const cdCheckData = await cdCheckRes.json();
                        const rawC = cdCheckData.data?.[0]?.consolidator_id;
                        if (typeof rawC === "object" && rawC !== null) {
                            consolidatorId = normalizeId(rawC.id);
                            consolidatorNo = (rawC as { consolidator_no?: string }).consolidator_no || null;
                        } else if (rawC) {
                            consolidatorId = normalizeId(rawC);
                            const cRes = await fetch(`${DIRECTUS_BASE}/items/consolidator/${rawC}?fields=id,consolidator_no`, { headers: directusHeaders() });
                            if (cRes.ok) {
                                const cData = await cRes.json();
                                consolidatorNo = cData.data?.consolidator_no || null;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("[Conversion API] Error checking consolidator_details:", e);
            }
        }

        // Determine if it is genuinely an unconsolidated direct order or a consolidation error
        const isDirect = !consolidatorId && Boolean(order.order_no && order.order_no.startsWith("SO-DIR-"));
        if (!consolidatorId && !isDirect) {
            consolidationError = "Consolidation batch record not found for this sales order";
        }

        // 5. Fetch Consolidation Details for quantity pool
        const conDetailsMap: Record<string, { product_id: unknown; ordered_quantity: number; picked_quantity: number; applied_quantity: number }> = {};
        let totalAllocated = 0;
        let totalPicked = 0;
        
        if (consolidatorId) {
            const cdRes = await fetch(`${DIRECTUS_BASE}/items/consolidator_details?filter[consolidator_id][_eq]=${consolidatorId}&fields=*`, {
                headers: directusHeaders()
            });
            if (cdRes.ok) {
                const cdData = await cdRes.json();
                (cdData.data || []).forEach((cd: { product_id: unknown; ordered_quantity: number; picked_quantity: number; applied_quantity: number }) => {
                    const pid = normalizeId(cd.product_id);
                    if (pid) {
                        const pidKey = String(pid);
                        if (!conDetailsMap[pidKey]) {
                            conDetailsMap[pidKey] = {
                                product_id: cd.product_id,
                                ordered_quantity: Number(cd.ordered_quantity) || 0,
                                picked_quantity: Number(cd.picked_quantity) || 0,
                                applied_quantity: Number(cd.applied_quantity) || 0
                            };
                        } else {
                            conDetailsMap[pidKey].ordered_quantity += (Number(cd.ordered_quantity) || 0);
                            conDetailsMap[pidKey].picked_quantity += (Number(cd.picked_quantity) || 0);
                            conDetailsMap[pidKey].applied_quantity += (Number(cd.applied_quantity) || 0);
                        }
                    }
                    totalAllocated += (Number(cd.ordered_quantity) || 0);
                    totalPicked += (Number(cd.picked_quantity) || 0);
                });
            }
        }

        // 5.1 Fetch Live Product and Batch On-hand from Spring Boot API (/api/mm-product-onhand & /api/mm-batch-onhand)
        const branchId = normalizeId(order.branch_id);
        const productOnhandMap: Record<string, number> = {};
        const batchOnhandMap: Record<string, Array<{ batchNo: string; onhandQuantity: number; expirationDate?: string | null; lotName?: string | null; inventoryCondition?: string }>> = {};

        if (branchId && SPRING_API_BASE) {
            try {
                const springHeaders = await getSpringHeaders();
                const [prodRes, batchRes] = await Promise.all([
                    fetch(`${SPRING_API_BASE}/api/mm-product-onhand/filter?branch=${branchId}`, {
                        headers: springHeaders,
                        cache: "no-store"
                    }).catch(() => null),
                    fetch(`${SPRING_API_BASE}/api/mm-batch-onhand/filter?branch=${branchId}`, {
                        headers: springHeaders,
                        cache: "no-store"
                    }).catch(() => null),
                ]);

                if (prodRes && prodRes.ok) {
                    const poData = await prodRes.json();
                    const list = Array.isArray(poData) ? poData : poData?.data || [];
                    list.forEach((row: { productId?: number; product_id?: number; onhandQuantity?: number; onhand_quantity?: number }) => {
                        const pid = row.productId || row.product_id;
                        if (pid) {
                            productOnhandMap[String(pid)] = Number(row.onhandQuantity ?? row.onhand_quantity ?? 0);
                        }
                    });
                }

                if (batchRes && batchRes.ok) {
                    const boData = await batchRes.json();
                    const list = Array.isArray(boData) ? boData : boData?.data || [];
                    list.forEach((row: { productId?: number; product_id?: number; batchNo?: string; batch_no?: string; onhandQuantity?: number; onhand_quantity?: number; expirationDate?: string | null; expiration_date?: string | null; lotName?: string | null; lot_name?: string | null; inventoryCondition?: string; inventory_condition?: string }) => {
                        const pid = row.productId || row.product_id;
                        if (pid) {
                            const pidStr = String(pid);
                            if (!batchOnhandMap[pidStr]) batchOnhandMap[pidStr] = [];
                            batchOnhandMap[pidStr].push({
                                batchNo: row.batchNo || row.batch_no || "N/A",
                                onhandQuantity: Number(row.onhandQuantity ?? row.onhand_quantity ?? 0),
                                expirationDate: row.expirationDate || row.expiration_date || null,
                                lotName: row.lotName || row.lot_name || null,
                                inventoryCondition: row.inventoryCondition || row.inventory_condition || "Good"
                            });
                        }
                    });

                    // FEFO sort: nearest expiration date first
                    Object.keys(batchOnhandMap).forEach((pidStr) => {
                        batchOnhandMap[pidStr].sort((a, b) => {
                            if (!a.expirationDate && !b.expirationDate) return 0;
                            if (!a.expirationDate) return 1;
                            if (!b.expirationDate) return -1;
                            return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
                        });
                    });
                }
            } catch (onhandErr) {
                console.warn("[Conversion API] Warning loading live onhand levels from Spring Boot:", onhandErr);
            }
        }

        // 6. Map everything together
        const isConsolidated = Boolean(consolidatorId);

        const mappedItems = items.map((sod: { product_id: unknown; ordered_quantity: number; allocated_quantity: number; served_quantity?: number; unit_price: number; discount_type: string; discount_amount: number; net_amount: number }) => {
            const pid = normalizeId(sod.product_id);
            const pidStr = pid ? String(pid) : "";
            
            const pInfo = productMap[pidStr] || { name: "N/A", unit: "PCS", barcode: "" };
            const pname = pInfo.name;
            const ushortcut = pInfo.unit;
            const cd = conDetailsMap[pidStr] || {};
            
            const sodAllocated = Number(sod.allocated_quantity || 0) > 0 
                ? Number(sod.allocated_quantity) 
                : Number(sod.ordered_quantity || 0);

            // In manufacturing flow, if order is "For Invoicing", it has passed picking.
            // Ensure picked quantity for this order is at least what was allocated to it.
            const cdPicked = Number(cd.picked_quantity || 0);
            const picked = isConsolidated && cdPicked > 0 ? cdPicked : sodAllocated;

            const cdApplied = Number(cd.applied_quantity || 0);
            const poolRem = Math.max(0, picked - cdApplied);

            // Ensure remaining is at least sodAllocated if poolRem is 0 (prevents false 0 remaining in For Invoicing stage)
            const remaining = poolRem > 0 ? Math.min(sodAllocated, poolRem) : sodAllocated;
            const conOrdered = isConsolidated && (Number(cd.ordered_quantity) || 0) > 0 ? Number(cd.ordered_quantity) : sodAllocated;

            return {
                product_id: pid || 0,
                product_name: pname,
                consolidator_no: consolidatorNo,
                order_no: order.order_no,
                ordered_quantity: sod.ordered_quantity,
                allocated_quantity: sodAllocated,
                total_allocated_quantity: conOrdered,
                picked_quantity: picked,
                applied_quantity: isConsolidated ? cdApplied : 0,
                remaining_quantity: remaining,
                onhand_quantity: productOnhandMap[pidStr] ?? null,
                available_batches: batchOnhandMap[pidStr] || [],
                unit_price: sod.unit_price,
                discount_type: sod.discount_type,
                discount_amount: sod.discount_amount,
                net_amount: sod.net_amount,
                unit_shortcut: ushortcut,
                barcode: pInfo.barcode
            };
        });

        if (!isConsolidated) {
            totalAllocated = mappedItems.reduce((sum: number, it: { total_allocated_quantity: number }) => sum + it.total_allocated_quantity, 0);
            totalPicked = mappedItems.reduce((sum: number, it: { picked_quantity: number }) => sum + it.picked_quantity, 0);
        }

        const dtRes = await fetch(`${DIRECTUS_BASE}/items/discount_type?limit=-1&fields=*`, { headers: directusHeaders() });
        const dtData = await dtRes.json();

        return NextResponse.json({
            items: mappedItems,
            max_receipt_length: maxLength,
            is_official: order.receipt_type?.isOfficial ?? null,
            discount_types: dtData.data || [],
            customer: customerInfo,
            payment_name: paymentName,
            total_allocated_quantity: totalAllocated,
            total_picked_quantity: totalPicked,
            consolidator_no: consolidatorNo,
            is_direct: isDirect,
            consolidation_error: consolidationError
        });

    } catch (err: unknown) {
        console.error("Conversion Final Fix Error:", err);
        return NextResponse.json({ error: "Internal Server Error", details: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
