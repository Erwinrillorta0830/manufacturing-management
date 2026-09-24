import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import { getAuthToken, fetchLiveProductOnhand } from "./helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const branchIdStr = searchParams.get("branchId");
        const branchId = branchIdStr ? Number(branchIdStr) : null;
        const pageParam = searchParams.get("page");
        const pageSizeParam = searchParams.get("pageSize") || searchParams.get("limit");
        const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
        const pageSize = pageSizeParam ? Math.max(1, Math.min(100, parseInt(pageSizeParam, 10) || 10)) : 10;

        // 1. Build Directus filter for sales orders
        const filterObj: Record<string, unknown> = {
            order_status: { _eq: "In Production" },
        };

        if (branchId && !isNaN(branchId)) {
            filterObj.branch_id = { _eq: branchId };
        }

        const queryParams = new URLSearchParams({
            filter: JSON.stringify(filterObj),
            limit: "-1",
            sort: "-order_date,-order_id",
            fields: "order_id,order_no,po_no,customer_code,branch_id,order_date,delivery_date,order_status,total_amount,allocated_amount,net_amount,remarks,created_date",
        });

        const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order?${queryParams.toString()}`, {
            headers: directusHeaders,
            cache: "no-store",
        });

        if (!soRes.ok) {
            const errTxt = await soRes.text().catch(() => "");
            return NextResponse.json(
                { success: false, message: `Failed to fetch Sales Orders: HTTP ${soRes.status} ${errTxt}` },
                { status: soRes.status }
            );
        }

        const soData = await soRes.json();
        const rawOrders: Array<{
            order_id: number;
            order_no: string;
            po_no: string;
            customer_code: string;
            branch_id: number;
            order_date: string;
            delivery_date: string | null;
            order_status: string;
            total_amount: number | null;
            allocated_amount: number | null;
            net_amount: number | null;
            remarks: string | null;
            created_date: string | null;
        }> = soData.data || [];

        if (rawOrders.length === 0) {
            return NextResponse.json({
                success: true,
                data: [],
                total: 0,
                page,
                pageSize,
                totalPages: 1,
            });
        }

        const orderIds = rawOrders.map((o) => o.order_id);
        const customerCodes = Array.from(new Set(rawOrders.map((o) => o.customer_code).filter(Boolean)));
        const branchIds = Array.from(new Set(rawOrders.map((o) => o.branch_id).filter(Boolean)));

        // 2. Concurrently fetch customers, branches, and sales_order_details
        const [custRes, branchRes, sodRes] = await Promise.all([
            customerCodes.length > 0
                ? fetch(
                      `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes
                          .map((c) => encodeURIComponent(c))
                          .join(",")}&limit=-1&fields=customer_code,customer_name`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            branchIds.length > 0
                ? fetch(
                      `${DIRECTUS_URL}/items/branches?filter[id][_in]=${branchIds.join(",")}&limit=-1&fields=id,branch_name,branch_code`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            orderIds.length > 0
                ? fetch(
                      `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${orderIds.join(
                          ","
                      )}&limit=-1&fields=detail_id,order_id,product_id,ordered_quantity,allocated_quantity`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
        ]);

        const customerMap = new Map<string, string>();
        if (custRes && custRes.ok) {
            const custJson = await custRes.json();
            for (const c of custJson.data || []) {
                customerMap.set(c.customer_code, c.customer_name);
            }
        }

        const branchMap = new Map<number, { name: string; code: string }>();
        if (branchRes && branchRes.ok) {
            const bJson = await branchRes.json();
            for (const b of bJson.data || []) {
                branchMap.set(Number(b.id), { name: b.branch_name, code: b.branch_code || "" });
            }
        }

        const detailsByOrder = new Map<
            number,
            Array<{ detail_id: number; product_id: number; ordered_quantity: number; allocated_quantity: number }>
        >();
        const allDetailIds: number[] = [];

        if (sodRes && sodRes.ok) {
            const sodJson = await sodRes.json();
            for (const d of sodJson.data || []) {
                const oId = Number(d.order_id);
                if (!detailsByOrder.has(oId)) {
                    detailsByOrder.set(oId, []);
                }
                detailsByOrder.get(oId)!.push(d);
                allDetailIds.push(Number(d.detail_id));
            }
        }

        // 3. Count connected job order allocations
        const allocationsByDetail = new Map<number, number>();
        if (allDetailIds.length > 0) {
            const allocRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_in]=${allDetailIds.join(
                    ","
                )}&limit=-1&fields=id,sales_order_detail_id,job_order_id`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);

            if (allocRes && allocRes.ok) {
                const allocJson = await allocRes.json();
                for (const a of allocJson.data || []) {
                    const sodId = Number(a.sales_order_detail_id);
                    allocationsByDetail.set(sodId, (allocationsByDetail.get(sodId) || 0) + 1);
                }
            }
        }

        // 4. Transform and assemble list
        let result = rawOrders.map((o) => {
            const items = detailsByOrder.get(o.order_id) || [];
            const itemCount = items.length;
            const totalOrderedQty = items.reduce((sum, item) => sum + Number(item.ordered_quantity || 0), 0);
            const totalAllocatedQty = items.reduce((sum, item) => sum + Number(item.allocated_quantity || 0), 0);

            let linkedJoCount = 0;
            for (const item of items) {
                linkedJoCount += allocationsByDetail.get(Number(item.detail_id)) || 0;
            }

            const customerName = customerMap.get(o.customer_code) || o.customer_code;
            const branchInfo = branchMap.get(Number(o.branch_id));
            const branchName = branchInfo?.name || `Branch #${o.branch_id}`;
            const branchCode = branchInfo?.code || "";

            return {
                order_id: o.order_id,
                order_no: o.order_no,
                po_no: o.po_no || "N/A",
                customer_code: o.customer_code,
                customer_name: customerName,
                branch_id: o.branch_id,
                branch_name: branchName,
                branch_code: branchCode,
                order_date: o.order_date,
                delivery_date: o.delivery_date,
                order_status: o.order_status,
                total_amount: Number(o.total_amount || o.net_amount || 0),
                item_count: itemCount,
                total_ordered_quantity: totalOrderedQty,
                total_allocated_quantity: totalAllocatedQty,
                linked_job_orders_count: linkedJoCount,
                readiness_status: "Pending" as "Ready" | "Pending",
                remarks: o.remarks || "",
                created_date: o.created_date,
            };
        });

        // 5. Apply search filter if present
        if (search) {
            result = result.filter(
                (item) =>
                    item.order_no.toLowerCase().includes(search) ||
                    item.po_no.toLowerCase().includes(search) ||
                    item.customer_name.toLowerCase().includes(search) ||
                    item.customer_code.toLowerCase().includes(search)
            );
        }

        const total = result.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const startIndex = (page - 1) * pageSize;
        const paginatedData = result.slice(startIndex, startIndex + pageSize);

        // 6. Evaluate readiness for paginated slice only (high performance, no full table scan)
        if (paginatedData.length > 0) {
            try {
                const pageDetailIds: number[] = [];
                const branchProductPairs = new Map<string, { branchId: number; productId: number }>();

                for (const order of paginatedData) {
                    const items = detailsByOrder.get(order.order_id) || [];
                    for (const item of items) {
                        pageDetailIds.push(Number(item.detail_id));
                        const pId = Number(item.product_id);
                        if (pId && order.branch_id) {
                            const key = `${order.branch_id}_${pId}`;
                            if (!branchProductPairs.has(key)) {
                                branchProductPairs.set(key, { branchId: order.branch_id, productId: pId });
                            }
                        }
                    }
                }

                const token = await getAuthToken(req);

                // Concurrently fetch allocations for these detail IDs and live onhand for products
                const [allocJson, ...onhandResults] = await Promise.all([
                    pageDetailIds.length > 0
                        ? fetch(
                              `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_in]=${pageDetailIds.join(
                                  ","
                              )}&limit=-1&fields=id,sales_order_detail_id,job_order_id,allocated_quantity`,
                              { headers: directusHeaders, cache: "no-store" }
                          )
                              .then((res) => (res.ok ? res.json() : { data: [] }))
                              .catch(() => ({ data: [] }))
                        : Promise.resolve({ data: [] }),
                    ...Array.from(branchProductPairs.entries()).map(async ([key, pair]) => {
                        const res = await fetchLiveProductOnhand(pair.branchId, pair.productId, token);
                        return { key, onhand: res.onhandQuantity };
                    }),
                ]);

                const onhandMap = new Map<string, number>();
                for (const r of onhandResults) {
                    onhandMap.set(r.key, r.onhand);
                }

                const rawPageAllocs: Array<{
                    id: number;
                    sales_order_detail_id: number;
                    job_order_id: number;
                    allocated_quantity: number;
                }> = allocJson.data || [];

                const pageAllocMap = new Map<number, Array<{ job_order_id: number; allocated_quantity: number }>>();
                const pageJoIds = new Set<number>();
                for (const a of rawPageAllocs) {
                    const sodId = Number(a.sales_order_detail_id);
                    if (!pageAllocMap.has(sodId)) {
                        pageAllocMap.set(sodId, []);
                    }
                    pageAllocMap.get(sodId)!.push({
                        job_order_id: Number(a.job_order_id),
                        allocated_quantity: Number(a.allocated_quantity || 0),
                    });
                    if (a.job_order_id) {
                        pageJoIds.add(Number(a.job_order_id));
                    }
                }

                const joIdsArr = Array.from(pageJoIds);
                const joPassedProducedMap = new Map<number, number>();
                if (joIdsArr.length > 0) {
                    const yieldRes = await fetch(
                        `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_in]=${joIdsArr.join(
                            ","
                        )}&filter[qa_status][_eq]=Passed&limit=-1&fields=ledger_id,job_order_id,yield_quantity,qa_status,commit_status`,
                        { headers: directusHeaders, cache: "no-store" }
                    ).catch(() => null);

                    if (yieldRes && yieldRes.ok) {
                        const yieldData = await yieldRes.json();
                        for (const y of yieldData.data || []) {
                            const commitStatus = String(y.commit_status || "COMMITTED").toUpperCase();
                            if (commitStatus === "CANCELLED" || commitStatus === "CANCELED" || commitStatus === "VOID") {
                                continue;
                            }
                            const joId = Number(y.job_order_id);
                            const yQty = Number(y.yield_quantity || 0);
                            joPassedProducedMap.set(joId, (joPassedProducedMap.get(joId) || 0) + yQty);
                        }
                    }
                }

                const remainingPassedYieldMap = new Map<number, number>(joPassedProducedMap);

                // Check readiness for each order
                for (const order of paginatedData) {
                    const items = detailsByOrder.get(order.order_id) || [];
                    if (items.length === 0) {
                        order.readiness_status = "Pending";
                        continue;
                    }

                    let allReady = true;
                    for (const line of items) {
                        const pId = Number(line.product_id);
                        const orderedQty = Number(line.ordered_quantity || 0);
                        const onhand = onhandMap.get(`${order.branch_id}_${pId}`) || 0;

                        const lineAllocs = pageAllocMap.get(Number(line.detail_id)) || [];
                        let totalProduced = 0;
                        for (const alloc of lineAllocs) {
                            // Produced only counts if qa_status is 'Passed'
                            const availablePassed = remainingPassedYieldMap.get(alloc.job_order_id) || 0;
                            const effectiveProduced = Math.min(alloc.allocated_quantity, availablePassed);
                            remainingPassedYieldMap.set(alloc.job_order_id, Math.max(0, availablePassed - effectiveProduced));
                            totalProduced += effectiveProduced;
                        }

                        const isLineReady = onhand >= 0 && (onhand >= orderedQty || totalProduced >= orderedQty);
                        if (!isLineReady) {
                            allReady = false;
                            break;
                        }
                    }

                    order.readiness_status = allReady ? "Ready" : "Pending";
                }
            } catch (evalErr) {
                console.warn("[Sales Order Fulfillment] Error evaluating readiness for page slice:", evalErr);
            }
        }

        return NextResponse.json({
            success: true,
            data: paginatedData,
            total,
            page,
            pageSize,
            totalPages,
        });
    } catch (error) {
        console.error("[Sales Order Fulfillment] Error in GET /route:", error);
        return NextResponse.json(
            { success: false, message: (error as Error).message || "Internal server error" },
            { status: 500 }
        );
    }
}
