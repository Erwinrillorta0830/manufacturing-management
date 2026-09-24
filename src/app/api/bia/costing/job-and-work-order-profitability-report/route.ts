import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    JobOrderProfitabilityRow,
    ProfitabilitySummaryKPIs,
    MarginStatus,
    JobOrderCostBreakdown,
    MaterialCostItem,
    LaborCostItem,
    OverheadCostItem
} from "@/modules/business-intelligence-and-analytics/costing/job-and-work-order-profitability-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveMarginStatus(marginPercent: number): MarginStatus {
    if (marginPercent < 0) return "negative";
    if (marginPercent < 10) return "low";
    if (marginPercent < 25) return "moderate";
    if (marginPercent < 45) return "healthy";
    return "high";
}

function computeSummary(rows: JobOrderProfitabilityRow[]): ProfitabilitySummaryKPIs {
    const total_jobs = rows.length;
    const total_revenue = Math.round(rows.reduce((sum, r) => sum + r.total_revenue, 0) * 100) / 100;
    const total_cogs = Math.round(rows.reduce((sum, r) => sum + r.total_cogs, 0) * 100) / 100;
    const total_materials_cost = Math.round(rows.reduce((sum, r) => sum + r.direct_materials_cost, 0) * 100) / 100;
    const total_labor_cost = Math.round(rows.reduce((sum, r) => sum + r.direct_labor_cost, 0) * 100) / 100;
    const total_overhead_cost = Math.round(rows.reduce((sum, r) => sum + r.overhead_cost, 0) * 100) / 100;
    const total_gross_profit = Math.round((total_revenue - total_cogs) * 100) / 100;
    const average_gross_margin_percent = total_revenue > 0
        ? Math.round((total_gross_profit / total_revenue) * 1000) / 10
        : 0;
    const profitable_jobs_count = rows.filter(r => r.gross_profit >= 0).length;
    const loss_jobs_count = rows.filter(r => r.gross_profit < 0).length;

    return {
        total_jobs,
        total_revenue,
        total_cogs,
        total_materials_cost,
        total_labor_cost,
        total_overhead_cost,
        total_gross_profit,
        average_gross_margin_percent,
        profitable_jobs_count,
        loss_jobs_count
    };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const drilldownJoId = searchParams.get("jobOrderId");

        // If drilldown detail is requested for a specific Job Order
        if (drilldownJoId) {
            const joId = Number(drilldownJoId);
            const [joRes, yieldLedgersRes, routesRes, productsRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}?fields=job_order_id,job_order_no,product_id,actual_quantity_produced,target_quantity,completed_quantity`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${joId}&fields=ledger_id`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${joId}&fields=jo_route_id,work_center_id,planned_run_hours,actual_run_hours,status`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,cost_per_unit,price_per_unit`, { headers, cache: "no-store" })
            ]);

            if (!joRes.ok) {
                return NextResponse.json({ error: "Job order not found" }, { status: 404 });
            }

            const jo = (await joRes.json()).data;
            const productsMap = new Map<number, { name: string; code: string; cost: number; price: number }>();
            if (productsRes.ok) {
                const pJson = await productsRes.json();
                (pJson.data || []).forEach((p: Record<string, unknown>) => {
                    productsMap.set(Number(p.product_id), {
                        name: String(p.product_name || ""),
                        code: String(p.product_code || ""),
                        cost: Number(p.cost_per_unit || 0),
                        price: Number(p.price_per_unit || 0)
                    });
                });
            }

            // Material items
            const ledgerIds: number[] = [];
            if (yieldLedgersRes.ok) {
                const yJson = await yieldLedgersRes.json();
                (yJson.data || []).forEach((y: Record<string, unknown>) => ledgerIds.push(Number(y.ledger_id)));
            }

            const materials: MaterialCostItem[] = [];
            if (ledgerIds.length > 0) {
                const consumageRes = await fetch(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage?filter[ledger_id][_in]=${ledgerIds.join(",")}&fields=consumage_id,product_id,quantity_consumed,batch_no`,
                    { headers, cache: "no-store" }
                );
                if (consumageRes.ok) {
                    const cJson = await consumageRes.json();
                    (cJson.data || []).forEach((c: Record<string, unknown>) => {
                        const pid = Number(c.product_id);
                        const prod = productsMap.get(pid);
                        const qty = Number(c.quantity_consumed || 0);
                        const uCost = prod?.cost || 0;
                        materials.push({
                            consumage_id: Number(c.consumage_id),
                            product_id: pid,
                            product_name: prod?.name || `Material #${pid}`,
                            product_code: prod?.code || `MAT-${pid}`,
                            quantity_consumed: qty,
                            unit_cost: uCost,
                            total_cost: Math.round(qty * uCost * 100) / 100,
                            batch_no: c.batch_no ? String(c.batch_no) : null
                        });
                    });
                }
            }

            // Route & Work Center info
            const routeIds: number[] = [];
            const rawRoutes: Array<Record<string, unknown>> = [];
            if (routesRes.ok) {
                const rJson = await routesRes.json();
                (rJson.data || []).forEach((r: Record<string, unknown>) => {
                    routeIds.push(Number(r.jo_route_id));
                    rawRoutes.push(r);
                });
            }

            const workCentersRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name,overhead_cost_per_hour`, { headers, cache: "no-store" });
            const wcMap = new Map<number, { name: string; rate: number }>();
            if (workCentersRes.ok) {
                const wcJson = await workCentersRes.json();
                (wcJson.data || []).forEach((wc: Record<string, unknown>) => {
                    wcMap.set(Number(wc.work_center_id), {
                        name: String(wc.work_center_name || ""),
                        rate: Number(wc.overhead_cost_per_hour || 0)
                    });
                });
            }

            const overheads: OverheadCostItem[] = rawRoutes.map(r => {
                const wcId = Number(r.work_center_id);
                const wc = wcMap.get(wcId);
                const hrs = Number(r.actual_run_hours || r.planned_run_hours || 0);
                const rate = wc?.rate || 0;
                return {
                    jo_route_id: Number(r.jo_route_id),
                    work_center_id: wcId,
                    work_center_name: wc?.name || `Work Center #${wcId}`,
                    planned_run_hours: Number(r.planned_run_hours || 0),
                    actual_run_hours: hrs,
                    overhead_cost_per_hour: rate,
                    total_overhead_cost: Math.round(hrs * rate * 100) / 100,
                    status: String(r.status || "Pending")
                };
            });

            // Labor items
            const labor: LaborCostItem[] = [];
            if (routeIds.length > 0) {
                const [opsRes, usersRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?filter[jo_route_id][_in]=${routeIds.join(",")}&fields=jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate,started_at,stopped_at`,
                        { headers, cache: "no-store" }
                    ),
                    fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" })
                ]);

                const userNamesMap = new Map<number, string>();
                if (usersRes && usersRes.ok) {
                    const uJson = await usersRes.json();
                    (uJson.data || []).forEach((u: Record<string, unknown>) => {
                        const fname = String(u.user_fname || "").trim();
                        const lname = String(u.user_lname || "").trim();
                        const fullName = [fname, lname].filter(Boolean).join(" ") || `User #${u.user_id}`;
                        userNamesMap.set(Number(u.user_id), fullName);
                    });
                }

                if (opsRes.ok) {
                    const opsJson = await opsRes.json();
                    (opsJson.data || []).forEach((ro: Record<string, unknown>) => {
                        const hrs = Number(ro.logged_hours || 0);
                        const rate = Number(ro.hourly_rate || 0);
                        const opId = Number(ro.operator_id);
                        labor.push({
                            jo_route_operator_id: Number(ro.jo_route_operator_id),
                            jo_route_id: Number(ro.jo_route_id),
                            operator_id: opId,
                            operator_name: userNamesMap.get(opId) || `Operator #${opId}`,
                            logged_hours: hrs,
                            hourly_rate: rate,
                            labor_cost: Math.round(hrs * rate * 100) / 100,
                            started_at: ro.started_at ? String(ro.started_at) : null,
                            stopped_at: ro.stopped_at ? String(ro.stopped_at) : null
                        });
                    });
                }
            }

            const totalMaterialsCost = Math.round(materials.reduce((s, m) => s + m.total_cost, 0) * 100) / 100;
            const totalLaborCost = Math.round(labor.reduce((s, l) => s + l.labor_cost, 0) * 100) / 100;
            const totalOverheadCost = Math.round(overheads.reduce((s, o) => s + o.total_overhead_cost, 0) * 100) / 100;
            const totalCogs = Math.round((totalMaterialsCost + totalLaborCost + totalOverheadCost) * 100) / 100;
            const actualQty = Number(jo.actual_quantity_produced || jo.completed_quantity || jo.target_quantity || 1);
            const unitCogs = actualQty > 0 ? Math.round((totalCogs / actualQty) * 100) / 100 : 0;
            const fgProd = productsMap.get(Number(jo.product_id));
            const sellingPrice = fgProd?.price || 0;
            const totalRev = Math.round(actualQty * sellingPrice * 100) / 100;
            const grossProfit = Math.round((totalRev - totalCogs) * 100) / 100;
            const grossMarginPercent = totalRev > 0 ? Math.round((grossProfit / totalRev) * 1000) / 10 : 0;

            const breakdown: JobOrderCostBreakdown = {
                job_order_id: joId,
                job_order_no: String(jo.job_order_no || `JO-${joId}`),
                product_name: fgProd?.name || `Product #${jo.product_id}`,
                materials,
                labor,
                overheads,
                totalMaterialsCost,
                totalLaborCost,
                totalOverheadCost,
                totalCogs,
                actualQuantity: actualQty,
                unitCogs,
                sellingPrice,
                grossProfit,
                grossMarginPercent
            };

            return NextResponse.json({ data: breakdown });
        }

        // Full report fetch - ONLY 'Closed' status Job Orders
        const joRes = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[status][_eq]=Closed&limit=-1&fields=job_order_id,job_order_no,branch_id,product_id,version_id,target_quantity,actual_quantity_produced,completed_quantity,start_date,end_date,status`,
            { headers, cache: "no-store" }
        );
        const joData = joRes.ok ? (await joRes.json()).data || [] : [];

        if (joData.length === 0) {
            return NextResponse.json({
                rows: [],
                summary: computeSummary([])
            });
        }

        // Fetch supporting records in parallel
        const [
            productsRes,
            allocationsRes,
            salesOrderDetailsRes,
            salesOrdersRes,
            yieldLedgersRes,
            consumageRes,
            routesRes,
            routeOperatorsRes,
            workCentersRes,
            usersRes
        ] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,price_per_unit,priceA,priceB,cost_per_unit,estimated_unit_cost`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?limit=-1&fields=id,sales_order_detail_id,job_order_id,allocated_quantity`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/sales_order_details?limit=-1&fields=detail_id,product_id,order_id,unit_price,allocated_quantity`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/sales_order?limit=-1&fields=order_id,order_no,customer_code`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&fields=ledger_id,job_order_id,yield_quantity`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage?limit=-1&fields=consumage_id,ledger_id,product_id,quantity_consumed,batch_no`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,work_center_id,planned_run_hours,actual_run_hours,estimated_labor_cost,status`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?limit=-1&fields=jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate,started_at,stopped_at`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name,overhead_cost_per_hour`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        const usersMap = new Map<number, string>();
        if (usersRes && usersRes.ok) {
            const uJson = await usersRes.json();
            (uJson.data || []).forEach((u: Record<string, unknown>) => {
                const fname = String(u.user_fname || "").trim();
                const lname = String(u.user_lname || "").trim();
                const fullName = [fname, lname].filter(Boolean).join(" ") || `User #${u.user_id}`;
                usersMap.set(Number(u.user_id), fullName);
            });
        }

        const productsMap = new Map<number, { name: string; code: string; price: number; cost: number }>();
        if (productsRes && productsRes.ok) {
            const pJson = await productsRes.json();
            (pJson.data || []).forEach((p: Record<string, unknown>) => {
                const pricePerUnit = Number(p.price_per_unit || 0);
                const priceA = Number(p.priceA || 0);
                const priceB = Number(p.priceB || 0);
                const resolvedPrice = pricePerUnit > 0 ? pricePerUnit : priceA > 0 ? priceA : priceB;
                const resolvedCost = Number(p.cost_per_unit || p.estimated_unit_cost || 0);

                productsMap.set(Number(p.product_id), {
                    name: String(p.product_name || `Product #${p.product_id}`),
                    code: String(p.product_code || `PRD-${p.product_id}`),
                    price: resolvedPrice,
                    cost: resolvedCost
                });
            });
        }

        const salesOrderMap = new Map<number, { order_no: string; customer_code: string }>();
        if (salesOrdersRes && salesOrdersRes.ok) {
            const soJson = await salesOrdersRes.json();
            (soJson.data || []).forEach((so: Record<string, unknown>) => {
                salesOrderMap.set(Number(so.order_id), {
                    order_no: String(so.order_no || `SO-${so.order_id}`),
                    customer_code: String(so.customer_code || "N/A")
                });
            });
        }

        const sodMap = new Map<number, { unit_price: number; order_id: number }>();
        if (salesOrderDetailsRes && salesOrderDetailsRes.ok) {
            const sodJson = await salesOrderDetailsRes.json();
            (sodJson.data || []).forEach((sod: Record<string, unknown>) => {
                sodMap.set(Number(sod.detail_id), {
                    unit_price: Number(sod.unit_price || 0),
                    order_id: Number(sod.order_id)
                });
            });
        }

        const joAllocationsMap = new Map<number, Array<{ sodId: number; allocatedQty: number }>>();
        if (allocationsRes && allocationsRes.ok) {
            const aJson = await allocationsRes.json();
            (aJson.data || []).forEach((a: Record<string, unknown>) => {
                const joId = Number(a.job_order_id);
                const list = joAllocationsMap.get(joId) || [];
                list.push({
                    sodId: Number(a.sales_order_detail_id),
                    allocatedQty: Number(a.allocated_quantity || 0)
                });
                joAllocationsMap.set(joId, list);
            });
        }

        const ledgerToJobOrderMap = new Map<number, number>();
        if (yieldLedgersRes && yieldLedgersRes.ok) {
            const yJson = await yieldLedgersRes.json();
            (yJson.data || []).forEach((y: Record<string, unknown>) => {
                ledgerToJobOrderMap.set(Number(y.ledger_id), Number(y.job_order_id));
            });
        }

        const joMaterialsMap = new Map<number, MaterialCostItem[]>();
        const joTotalConsumedMap = new Map<number, number>();

        if (consumageRes && consumageRes.ok) {
            const cJson = await consumageRes.json();
            (cJson.data || []).forEach((c: Record<string, unknown>) => {
                const ledgerId = Number(c.ledger_id);
                const joId = ledgerToJobOrderMap.get(ledgerId);
                if (!joId) return;

                const prodId = Number(c.product_id);
                const prod = productsMap.get(prodId);
                const qty = Number(c.quantity_consumed || 0);
                const unitCost = prod?.cost || 0;
                const totalCost = qty * unitCost;

                const list = joMaterialsMap.get(joId) || [];
                list.push({
                    consumage_id: Number(c.consumage_id),
                    product_id: prodId,
                    product_name: prod?.name || `Material #${prodId}`,
                    product_code: prod?.code || `MAT-${prodId}`,
                    quantity_consumed: qty,
                    unit_cost: unitCost,
                    total_cost: totalCost,
                    batch_no: c.batch_no ? String(c.batch_no) : null
                });
                joMaterialsMap.set(joId, list);

                // Accumulate total quantity consumed from consumage
                const curConsumed = joTotalConsumedMap.get(joId) || 0;
                joTotalConsumedMap.set(joId, curConsumed + qty);
            });
        }

        const workCentersMap = new Map<number, { name: string; rate: number }>();
        if (workCentersRes && workCentersRes.ok) {
            const wcJson = await workCentersRes.json();
            (wcJson.data || []).forEach((wc: Record<string, unknown>) => {
                workCentersMap.set(Number(wc.work_center_id), {
                    name: String(wc.work_center_name || `Work Center #${wc.work_center_id}`),
                    rate: Number(wc.overhead_cost_per_hour || 0)
                });
            });
        }

        const routeOperatorsMap = new Map<number, LaborCostItem[]>();
        if (routeOperatorsRes && routeOperatorsRes.ok) {
            const roJson = await routeOperatorsRes.json();
            (roJson.data || []).forEach((ro: Record<string, unknown>) => {
                const rId = Number(ro.jo_route_id);
                const hrs = Number(ro.logged_hours || 0);
                const rate = Number(ro.hourly_rate || 0);
                const laborCost = Math.round(hrs * rate * 100) / 100;
                const opId = Number(ro.operator_id);

                const list = routeOperatorsMap.get(rId) || [];
                list.push({
                    jo_route_operator_id: Number(ro.jo_route_operator_id),
                    jo_route_id: rId,
                    operator_id: opId,
                    operator_name: usersMap.get(opId) || `Operator #${opId}`,
                    logged_hours: hrs,
                    hourly_rate: rate,
                    labor_cost: laborCost,
                    started_at: ro.started_at ? String(ro.started_at) : null,
                    stopped_at: ro.stopped_at ? String(ro.stopped_at) : null
                });
                routeOperatorsMap.set(rId, list);
            });
        }

        const joRoutesMap = new Map<number, OverheadCostItem[]>();
        const joLaborMap = new Map<number, LaborCostItem[]>();
        const joEstimatedLaborMap = new Map<number, number>();

        if (routesRes && routesRes.ok) {
            const rJson = await routesRes.json();
            (rJson.data || []).forEach((r: Record<string, unknown>) => {
                const joId = Number(r.job_order_id);
                const rId = Number(r.jo_route_id);
                const wcId = Number(r.work_center_id);
                const wc = workCentersMap.get(wcId);
                const runHrs = Number(r.actual_run_hours || r.planned_run_hours || 0);
                const rate = wc?.rate || 0;
                const overheadCost = Math.round(runHrs * rate * 100) / 100;
                const estLabor = Number(r.estimated_labor_cost || 0);

                const oList = joRoutesMap.get(joId) || [];
                oList.push({
                    jo_route_id: rId,
                    work_center_id: wcId,
                    work_center_name: wc?.name || `Work Center #${wcId}`,
                    planned_run_hours: Number(r.planned_run_hours || 0),
                    actual_run_hours: runHrs,
                    overhead_cost_per_hour: rate,
                    total_overhead_cost: overheadCost,
                    status: String(r.status || "Pending")
                });
                joRoutesMap.set(joId, oList);

                // Accumulate route estimated labor if available
                const curEstLabor = joEstimatedLaborMap.get(joId) || 0;
                joEstimatedLaborMap.set(joId, curEstLabor + estLabor);

                const operators = routeOperatorsMap.get(rId) || [];
                const lList = joLaborMap.get(joId) || [];
                lList.push(...operators);
                joLaborMap.set(joId, lList);
            });
        }

        const rows: JobOrderProfitabilityRow[] = joData.map((jo: Record<string, unknown>) => {
            const joId = Number(jo.job_order_id);
            const prodId = Number(jo.product_id);
            const product = productsMap.get(prodId);
            const targetQty = Number(jo.target_quantity || 0);
            const actualQty = Math.max(
                Number(jo.actual_quantity_produced || 0),
                Number(jo.completed_quantity || 0)
            );
            const effectiveQty = actualQty > 0 ? actualQty : targetQty;
            const totalConsumed = joTotalConsumedMap.get(joId) || 0;
            const yieldEfficiency = targetQty > 0 ? Math.round((effectiveQty / targetQty) * 1000) / 10 : 0;

            const allocations = joAllocationsMap.get(joId) || [];
            let salesUnitPrice = 0;
            let salesOrderNo: string | null = null;
            let customerCode: string | null = null;
            let salesOrderId: number | null = null;

            if (allocations.length > 0) {
                const primaryAlloc = allocations[0];
                const sod = sodMap.get(primaryAlloc.sodId);
                if (sod && Number(sod.unit_price) > 0) {
                    salesUnitPrice = Number(sod.unit_price);
                    salesOrderId = sod.order_id;
                    const so = salesOrderMap.get(sod.order_id);
                    if (so) {
                        salesOrderNo = so.order_no;
                        customerCode = so.customer_code;
                    }
                }
            }

            // Pricing Fallback: if no sales order or unit_price is 0, use master catalog selling price
            if (salesUnitPrice === 0 && product?.price) {
                salesUnitPrice = product.price;
            }

            const totalRevenue = Math.round(effectiveQty * salesUnitPrice * 100) / 100;

            // Direct Materials
            const materials = joMaterialsMap.get(joId) || [];
            let directMaterialsCost = Math.round(
                materials.reduce((sum, m) => sum + m.total_cost, 0) * 100
            ) / 100;

            // Material Cost Fallback: if consumage is 0, estimate using product standard unit cost
            if (directMaterialsCost === 0 && product?.cost && effectiveQty > 0) {
                directMaterialsCost = Math.round(effectiveQty * product.cost * 0.75 * 100) / 100;
            }

            // Direct Labor
            const labor = joLaborMap.get(joId) || [];
            let directLaborCost = Math.round(
                labor.reduce((sum, l) => sum + l.labor_cost, 0) * 100
            ) / 100;

            // Labor Fallback: if actual operator labor is 0, use estimated labor cost from routing
            if (directLaborCost === 0) {
                const estLabor = joEstimatedLaborMap.get(joId) || 0;
                if (estLabor > 0) {
                    directLaborCost = Math.round(estLabor * 100) / 100;
                } else if (product?.cost && effectiveQty > 0) {
                    directLaborCost = Math.round(effectiveQty * product.cost * 0.15 * 100) / 100;
                }
            }

            // Overhead
            const overheads = joRoutesMap.get(joId) || [];
            let overheadCost = Math.round(
                overheads.reduce((sum, o) => sum + o.total_overhead_cost, 0) * 100
            ) / 100;

            if (overheadCost === 0 && product?.cost && effectiveQty > 0) {
                overheadCost = Math.round(effectiveQty * product.cost * 0.10 * 100) / 100;
            }

            // Total COGS
            const totalCogs = Math.round((directMaterialsCost + directLaborCost + overheadCost) * 100) / 100;
            const unitCogs = effectiveQty > 0 ? Math.round((totalCogs / effectiveQty) * 100) / 100 : 0;

            const grossProfit = Math.round((totalRevenue - totalCogs) * 100) / 100;
            const grossMarginPercent = totalRevenue > 0
                ? Math.round((grossProfit / totalRevenue) * 1000) / 10
                : 0;

            const marginStatus = resolveMarginStatus(grossMarginPercent);

            return {
                job_order_id: joId,
                job_order_no: String(jo.job_order_no || `JO-${joId}`),
                product_id: prodId,
                product_name: product?.name || `Finished Good #${prodId}`,
                product_code: product?.code || `FG-${prodId}`,
                version_id: Number(jo.version_id || 1),
                branch_id: Number(jo.branch_id || 1),
                status: String(jo.status || "Closed"),
                target_quantity: targetQty,
                actual_quantity_produced: actualQty,
                total_quantity_consumed: totalConsumed,
                yield_efficiency_percent: yieldEfficiency,
                start_date: jo.start_date ? String(jo.start_date) : null,
                end_date: jo.end_date ? String(jo.end_date) : null,
                customer_code: customerCode,
                sales_order_no: salesOrderNo,
                sales_order_id: salesOrderId,
                sales_unit_price: salesUnitPrice,
                total_revenue: totalRevenue,
                direct_materials_cost: directMaterialsCost,
                direct_labor_cost: directLaborCost,
                overhead_cost: overheadCost,
                total_cogs: totalCogs,
                unit_cogs: unitCogs,
                gross_profit: grossProfit,
                gross_margin_percent: grossMarginPercent,
                margin_status: marginStatus,
                materials_count: materials.length,
                operators_count: labor.length,
                routes_count: overheads.length
            };
        });

        rows.sort((a, b) => b.job_order_id - a.job_order_id);

        return NextResponse.json({
            rows,
            summary: computeSummary(rows)
        });
    } catch (error) {
        console.error("[BIA JobOrderProfitability API] error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
