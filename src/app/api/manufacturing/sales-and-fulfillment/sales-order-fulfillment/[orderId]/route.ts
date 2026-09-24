import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import { fetchLiveProductOnhand, getAuthToken } from "../helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ orderId: string }> }
) {
    try {
        const { orderId } = await context.params;
        const orderIdNum = Number(orderId);

        if (!orderId || isNaN(orderIdNum)) {
            return NextResponse.json(
                { success: false, message: "Valid orderId is required" },
                { status: 400 }
            );
        }

        const token = await getAuthToken(req);

        // 1. Fetch sales_order header
        const soRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order/${orderIdNum}?fields=order_id,order_no,po_no,customer_code,branch_id,order_date,delivery_date,order_status,total_amount,allocated_amount,net_amount,remarks,created_date`,
            { headers: directusHeaders, cache: "no-store" }
        );

        if (!soRes.ok) {
            return NextResponse.json(
                { success: false, message: `Sales order #${orderId} not found` },
                { status: 404 }
            );
        }

        const soData = await soRes.json();
        const so = soData.data;

        // 2. Fetch customer and branch details
        const [custRes, branchRes, sodRes] = await Promise.all([
            so.customer_code
                ? fetch(
                      `${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(
                          so.customer_code
                      )}&limit=1&fields=customer_code,customer_name,contact_number,customer_email`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            so.branch_id
                ? fetch(
                      `${DIRECTUS_URL}/items/branches/${so.branch_id}?fields=id,branch_name,branch_code,city,state_province`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${orderIdNum}&limit=-1&fields=detail_id,order_id,product_id,bom_version_id,ordered_quantity,allocated_quantity,unit_price,gross_amount,net_amount,remarks`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
        ]);

        let customerName = so.customer_code;
        if (custRes && custRes.ok) {
            const custJson = await custRes.json();
            if (custJson.data?.[0]?.customer_name) {
                customerName = custJson.data[0].customer_name;
            }
        }

        let branchName = `Branch #${so.branch_id}`;
        let branchCode = "";
        if (branchRes && branchRes.ok) {
            const branchJson = await branchRes.json();
            if (branchJson.data?.branch_name) {
                branchName = branchJson.data.branch_name;
            }
            if (branchJson.data?.branch_code) {
                branchCode = branchJson.data.branch_code;
            }
        }

        const lineItems: Array<{
            detail_id: number;
            order_id: number;
            product_id: number;
            bom_version_id: number | null;
            ordered_quantity: number;
            allocated_quantity: number;
            unit_price: number;
            gross_amount: number;
            net_amount: number;
            remarks: string | null;
        }> = sodRes && sodRes.ok ? (await sodRes.json()).data || [] : [];

        if (lineItems.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    header: {
                        order_id: so.order_id,
                        order_no: so.order_no,
                        po_no: so.po_no || "N/A",
                        customer_code: so.customer_code,
                        customer_name: customerName,
                        branch_id: so.branch_id,
                        branch_name: branchName,
                        branch_code: branchCode,
                        order_date: so.order_date,
                        delivery_date: so.delivery_date,
                        order_status: so.order_status,
                        total_amount: Number(so.total_amount || so.net_amount || 0),
                        remarks: so.remarks || "",
                        created_date: so.created_date,
                    },
                    lines: [],
                    readiness: {
                        can_proceed_to_consolidation: false,
                        readiness_summary: "Sales order has no product line items.",
                        total_items_count: 0,
                        ready_items_count: 0,
                        blockers: ["Sales order contains no line items."],
                    },
                },
            });
        }

        // 3. Product & BOM Version metadata lookup
        const productIds = Array.from(new Set(lineItems.map((l) => Number(l.product_id)).filter(Boolean)));
        const versionIds = Array.from(new Set(lineItems.map((l) => Number(l.bom_version_id)).filter(Boolean)));
        const detailIds = lineItems.map((l) => Number(l.detail_id));

        const [prodRes, verRes, allocRes] = await Promise.all([
            productIds.length > 0
                ? fetch(
                      `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(
                          ","
                      )}&fields=product_id,product_name,product_code,description,unit_of_measurement.unit_name&limit=-1`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            versionIds.length > 0
                ? fetch(
                      `${DIRECTUS_URL}/items/product_manufacturing_version?filter[version_id][_in]=${versionIds.join(
                          ","
                      )}&fields=version_id,version_name&limit=-1`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            detailIds.length > 0
                ? fetch(
                      `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_in]=${detailIds.join(
                          ","
                      )}&limit=-1&fields=id,sales_order_detail_id,job_order_id,allocated_quantity,created_at`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
        ]);

        const prodMap = new Map<
            number,
            { product_name: string; product_code: string; description: string; unit_name: string }
        >();
        if (prodRes && prodRes.ok) {
            const prodJson = await prodRes.json();
            for (const p of prodJson.data || []) {
                const uName =
                    typeof p.unit_of_measurement === "object" && p.unit_of_measurement !== null
                        ? p.unit_of_measurement.unit_name
                        : "pcs";
                prodMap.set(Number(p.product_id), {
                    product_name: p.product_name || `Product #${p.product_id}`,
                    product_code: p.product_code || "",
                    description: p.description || "",
                    unit_name: uName || "pcs",
                });
            }
        }

        const verMap = new Map<number, string>();
        if (verRes && verRes.ok) {
            const verJson = await verRes.json();
            for (const v of verJson.data || []) {
                verMap.set(Number(v.version_id), v.version_name || `v${v.version_id}`);
            }
        }

        // 4. Fetch linked Job Orders
        const rawAllocations: Array<{
            id: number;
            sales_order_detail_id: number;
            job_order_id: number;
            allocated_quantity: number;
            created_at: string;
        }> = allocRes && allocRes.ok ? (await allocRes.json()).data || [] : [];

        const jobOrderIds = Array.from(new Set(rawAllocations.map((a) => Number(a.job_order_id)).filter(Boolean)));
        const joMap = new Map<
            number,
            {
                job_order_id: number;
                job_order_no: string;
                status: string;
                target_quantity: number;
                actual_quantity_produced: number;
                completed_quantity: number;
                start_date: string | null;
                end_date: string | null;
            }
        >();

        const passedYieldByJo = new Map<number, number>();

        if (jobOrderIds.length > 0) {
            const [joRes, yieldRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_in]=${jobOrderIds.join(
                        ","
                    )}&limit=-1&fields=job_order_id,job_order_no,status,target_quantity,actual_quantity_produced,completed_quantity,start_date,end_date`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
                fetch(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_in]=${jobOrderIds.join(
                        ","
                    )}&filter[qa_status][_eq]=Passed&limit=-1&fields=ledger_id,job_order_id,yield_quantity,qa_status,commit_status`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
            ]);

            if (joRes && joRes.ok) {
                const joJson = await joRes.json();
                for (const jo of joJson.data || []) {
                    joMap.set(Number(jo.job_order_id), {
                        job_order_id: Number(jo.job_order_id),
                        job_order_no: jo.job_order_no,
                        status: jo.status || "Draft",
                        target_quantity: Number(jo.target_quantity || 0),
                        actual_quantity_produced: Number(jo.actual_quantity_produced || 0),
                        completed_quantity: Number(jo.completed_quantity || 0),
                        start_date: jo.start_date,
                        end_date: jo.end_date,
                    });
                }
            }

            if (yieldRes && yieldRes.ok) {
                const yieldJson = await yieldRes.json();
                for (const y of yieldJson.data || []) {
                    const commitStatus = String(y.commit_status || "COMMITTED").toUpperCase();
                    if (commitStatus === "CANCELLED" || commitStatus === "CANCELED" || commitStatus === "VOID") {
                        continue;
                    }
                    const joId = Number(y.job_order_id);
                    const yQty = Number(y.yield_quantity || 0);
                    passedYieldByJo.set(joId, (passedYieldByJo.get(joId) || 0) + yQty);
                }
            }
        }

        // Clone map for tracking remaining passed yield when distributing to allocations
        const remainingPassedYieldMap = new Map<number, number>(passedYieldByJo);

        // 5. Query Spring Boot live on-hand for each distinct product at this branch
        const onhandByProduct = new Map<number, { onhandQuantity: number; error?: string | null }>();
        await Promise.all(
            productIds.map(async (pId) => {
                const onhandRes = await fetchLiveProductOnhand(so.branch_id, pId, token);
                onhandByProduct.set(pId, {
                    onhandQuantity: onhandRes.onhandQuantity,
                    error: onhandRes.error,
                });
            })
        );

        // 6. Build resolved line items with readiness calculations
        const blockers: string[] = [];
        let readyCount = 0;

        const resolvedLines = lineItems.map((line) => {
            const pId = Number(line.product_id);
            const prod = prodMap.get(pId);
            const orderedQty = Number(line.ordered_quantity || 0);

            // Job Order Allocations for this line item
            const lineAllocations = rawAllocations.filter(
                (a) => Number(a.sales_order_detail_id) === Number(line.detail_id)
            );

            let totalProduced = 0;
            const connectedJobOrders = lineAllocations.map((alloc) => {
                const jo = joMap.get(Number(alloc.job_order_id));
                const allocQty = Number(alloc.allocated_quantity || 0);
                const actualProd = Number(jo?.actual_quantity_produced || 0);
                const completedQty = Number(jo?.completed_quantity || 0);

                // Business Rule: Produced quantity only counts if qa_status is 'Passed' in yield ledger
                const joId = Number(alloc.job_order_id);
                const availablePassed = remainingPassedYieldMap.get(joId) || 0;
                const effectiveProduced = Math.min(allocQty, availablePassed);
                remainingPassedYieldMap.set(joId, Math.max(0, availablePassed - effectiveProduced));

                totalProduced += effectiveProduced;

                return {
                    allocation_id: alloc.id,
                    job_order_id: alloc.job_order_id,
                    job_order_no: jo?.job_order_no || `JO #${alloc.job_order_id}`,
                    status: jo?.status || "Unknown",
                    target_quantity: jo?.target_quantity || 0,
                    actual_quantity_produced: actualProd,
                    completed_quantity: completedQty,
                    allocated_quantity: allocQty,
                    effective_produced_for_order: effectiveProduced,
                    start_date: jo?.start_date || null,
                    end_date: jo?.end_date || null,
                };
            });

            // Live On-Hand
            const onhandInfo = onhandByProduct.get(pId) || { onhandQuantity: 0, error: null };
            const liveOnhand = onhandInfo.onhandQuantity;
            const hasDeficit = liveOnhand < 0;

            // Fulfillment evaluation:
            // "if the product on hand or the produced qty is meet with ordered it will enable the Proceed To Consolidation Button"
            // Strict Validation: Cannot proceed if on-hand quantity is negative (inventory deficit), even if produced quantity meets ordered.
            const meetsByOnhand = liveOnhand >= orderedQty;
            const meetsByProduction = totalProduced >= orderedQty;
            const isReady = !hasDeficit && (meetsByOnhand || meetsByProduction);

            const shortageQty = isReady ? 0 : Math.max(0, orderedQty - Math.max(Math.max(0, liveOnhand), totalProduced));

            if (isReady) {
                readyCount++;
            } else {
                const prodName = prod?.description || prod?.product_name || `Product #${pId}`;
                const uName = prod?.unit_name || "pcs";
                if (hasDeficit) {
                    blockers.push(
                        `${prodName}: On-hand quantity is negative (${liveOnhand.toLocaleString()} ${uName}). Stock deficit must be resolved before proceeding.`
                    );
                } else {
                    blockers.push(
                        `${prodName}: Ordered ${orderedQty} ${uName}, but only ${liveOnhand.toLocaleString()} on hand and ${totalProduced} produced (Shortage: ${shortageQty})`
                    );
                }
            }

            return {
                detail_id: line.detail_id,
                order_id: line.order_id,
                product_id: pId,
                product_code: prod?.product_code || "",
                product_name: prod?.product_name || `Product #${pId}`,
                description: prod?.description || "",
                unit_name: prod?.unit_name || "pcs",
                bom_version_id: line.bom_version_id,
                bom_version_name: line.bom_version_id ? verMap.get(line.bom_version_id) || `v${line.bom_version_id}` : null,
                ordered_quantity: orderedQty,
                allocated_quantity: Number(line.allocated_quantity || 0),
                unit_price: Number(line.unit_price || 0),
                gross_amount: Number(line.gross_amount || 0),
                net_amount: Number(line.net_amount || 0),
                remarks: line.remarks || "",
                live_onhand_quantity: liveOnhand,
                has_deficit: hasDeficit,
                onhand_error: onhandInfo.error || null,
                total_produced_quantity: totalProduced,
                meets_by_onhand: meetsByOnhand,
                meets_by_production: meetsByProduction,
                is_ready: isReady,
                shortage_quantity: shortageQty,
                job_orders: connectedJobOrders,
            };
        });

        // 7. Overall Readiness (User approved: required all line items)
        const canProceed = resolvedLines.length > 0 && readyCount === resolvedLines.length;
        const readinessSummary = canProceed
            ? `All ${resolvedLines.length} product line items are fully satisfied and ready for consolidation.`
            : `${readyCount} of ${resolvedLines.length} line items fulfilled. Remaining items require additional production or stock.`;

        return NextResponse.json({
            success: true,
            data: {
                header: {
                    order_id: so.order_id,
                    order_no: so.order_no,
                    po_no: so.po_no || "N/A",
                    customer_code: so.customer_code,
                    customer_name: customerName,
                    branch_id: so.branch_id,
                    branch_name: branchName,
                    branch_code: branchCode,
                    order_date: so.order_date,
                    delivery_date: so.delivery_date,
                    order_status: so.order_status,
                    total_amount: Number(so.total_amount || so.net_amount || 0),
                    allocated_amount: Number(so.allocated_amount || 0),
                    remarks: so.remarks || "",
                    created_date: so.created_date,
                },
                lines: resolvedLines,
                readiness: {
                    can_proceed_to_consolidation: canProceed,
                    readiness_summary: readinessSummary,
                    total_items_count: resolvedLines.length,
                    ready_items_count: readyCount,
                    blockers,
                },
            },
        });
    } catch (error) {
        console.error("[Sales Order Fulfillment] Error in GET [orderId]:", error);
        return NextResponse.json(
            { success: false, message: (error as Error).message || "Internal server error" },
            { status: 500 }
        );
    }
}
