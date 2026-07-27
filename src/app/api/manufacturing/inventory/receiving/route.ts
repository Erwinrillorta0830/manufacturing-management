/* eslint-disable */
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers, fetchJobOrders } from "@/app/api/manufacturing/directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";


interface ComponentVarianceDetail {
    productId: number;
    productName: string;
    actualQty: number;
    actualUnitCost: number;
    actualTotalCost: number;
    standardQty: number;
    standardUnitCost: number;
    standardTotalCost: number;
    variance: number;
}

// Self-healing database fields creator for Directus
async function ensureFieldsExist() {
    const fieldsToCreate = [
        {
            field: "yield_allocations",
            type: "json",
            schema: { is_nullable: true },
            meta: { interface: "json", width: "full" }
        },
        {
            field: "material_cost_variances",
            type: "json",
            schema: { is_nullable: true },
            meta: { interface: "json", width: "full" }
        }
    ];

    for (const f of fieldsToCreate) {
        try {
            const check = await fetch(`${DIRECTUS_URL}/fields/job_order/${f.field}`, { headers });
            if (!check.ok) {
                console.log(`[Receiving API] Creating missing field "${f.field}" on job_order collection...`);
                const res = await fetch(`${DIRECTUS_URL}/fields/job_order`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(f)
                });
                if (!res.ok) {
                    console.error(`[Receiving API] Failed to create field "${f.field}":`, await res.text());
                } else {
                    console.log(`[Receiving API] Field "${f.field}" successfully created!`);
                }
            }
        } catch (e) {
            console.error(`[Receiving API] Error ensuring field "${f.field}" exists:`, e);
        }
    }
}

export async function GET(request: Request) {
    try {
        await ensureFieldsExist();

        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");

        // 1. Fetch all job orders
        const jobOrders = await fetchJobOrders();

        // If joId is provided, filter specifically for it
        let activeJOs = jobOrders;
        if (joId) {
            activeJOs = jobOrders.filter(jo => jo.jo_id === joId);
        } else {
            // Otherwise, filter for Ongoing (in production) or Finished (to view history)
            activeJOs = jobOrders.filter(jo => 
                jo.status === "Ongoing" || jo.status === "Proceed" || jo.status === "Finished"
            );
        }

        if (activeJOs.length === 0) {
            return NextResponse.json([]);
        }

        // 2. Fetch all WIP ledger entries (to calculate what has been picked for cost calculations)
        const joIds = activeJOs.map(jo => jo.jo_id);
        const joIdsFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { documentType: { _eq: "WIP Issue" } },
                { documentNo: { _in: joIds } }
            ]
        }));

        const ledgerRes = await fetch(`${DIRECTUS_URL}/items/product_ledger?filter=${joIdsFilter}&limit=-1`, {
            headers,
            cache: "no-store"
        });

        const ledgerEntries = ledgerRes.ok ? (await ledgerRes.json()).data || [] : [];

        // 3. Map JOs together with actual picks and custom fields
        const result = activeJOs.map(jo => {
            const joLedger = ledgerEntries.filter((e: { documentNo: string }) => e.documentNo === jo.jo_id);
            const actualConsumed = joLedger.map((e: { productId: number; quantity: number; documentDescription: string }) => {
                const lotMatch = e.documentDescription?.match(/Picked Lot:\s*(.+)$/);
                const lotNo = lotMatch ? lotMatch[1] : "LOT-N/A";
                return {
                    productId: e.productId,
                    quantity: Math.abs(e.quantity),
                    lotNumber: lotNo
                };
            });

            return {
                jo_id: jo.jo_id,
                product_id: jo.product_id,
                product_name: jo.product_name,
                quantity: jo.quantity,
                status: jo.status,
                branch_id: jo.branch_id,
                components: jo.components || [],
                allocationResults: jo.allocation_results || jo.allocationResults || [],
                yieldAllocations: jo.yield_allocations || null,
                materialCostVariances: jo.material_cost_variances || null,
                actualConsumed
            };
        });

        return NextResponse.json(result);
    } catch (e) {
        console.error("[Receiving API GET] Error:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch job orders for receiving" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        await ensureFieldsExist();

        const body = await request.json();
        const { joId, productId, quantityProduced, lotNumber, expirationDate, unitCost } = body;

        if (!joId || !productId || quantityProduced === undefined) {
            return NextResponse.json(
                { error: "Missing required fields (joId, productId, quantityProduced)" },
                { status: 400 }
            );
        }

        const qty = Number(quantityProduced);
        const pId = Number(productId);
        const uCost = Number(unitCost || 0);
        const finalLotNo = lotNumber || `MFG-${joId}`;
        const finalExpDate = expirationDate || await getTodayDateString(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

        // 1. Fetch the target Job Order
        const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joId)}&limit=1`, {
            headers,
            cache: "no-store"
        });
        if (!joRes.ok) {
            return NextResponse.json({ error: `Job Order ${joId} not found.` }, { status: 404 });
        }
        const joDataList = (await joRes.json()).data || [];
        if (joDataList.length === 0) {
            return NextResponse.json({ error: `Job Order ${joId} not found.` }, { status: 404 });
        }
        const jo = joDataList[0];
        const bId = jo.branch_id ? Number(jo.branch_id) : 1;

        // Fetch products details for fallbacks (cost_per_unit, names)
        const productsRes = await fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,cost_per_unit`, {
            headers,
            cache: "no-store"
        });
        const productsData = productsRes.ok ? (await productsRes.json()).data || [] : [];
        const productsMap = new Map(productsData.map((p: { product_id: number }) => [Number(p.product_id), p]));

        const matchedProduct = productsMap.get(pId);
        const productName = (matchedProduct as any)?.product_name || "Finished Goods";

        // 2. Fetch WIP Picked Materials (Actual consumption)
        const wIdFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { documentType: { _eq: "WIP Issue" } },
                { documentNo: { _eq: joId } }
            ]
        }));
        const picksRes = await fetch(`${DIRECTUS_URL}/items/product_ledger?filter=${wIdFilter}&limit=-1`, {
            headers,
            cache: "no-store"
        });
        const actualPicks = picksRes.ok ? (await picksRes.json()).data || [] : [];

        // Fetch actual lot unit costs from inventory_lots for consumed materials
        const actualUsageList = [];
        let actualTotalCost = 0;

        for (const pick of actualPicks) {
            const compId = Number(pick.productId);
            const pickQty = Math.abs(Number(pick.quantity || 0));
            const pickDesc = pick.documentDescription || "";
            const lotMatch = pickDesc.match(/Picked Lot:\s*(.+)$/);
            const lotNo = lotMatch ? lotMatch[1] : "LOT-N/A";

            let lotUnitCost = 0;
            if (lotNo !== "LOT-N/A") {
                const recQuery = encodeURIComponent(JSON.stringify({
                    _and: [
                        { product_id: { _eq: compId } },
                        { batch_no: { _eq: lotNo } }
                    ]
                }));
                const recCostRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter=${recQuery}&limit=1`, {
                    headers,
                    cache: "no-store"
                });
                if (recCostRes.ok) {
                    const recDetails = (await recCostRes.json()).data || [];
                    if (recDetails.length > 0) {
                        lotUnitCost = Number(recDetails[0].final_landed_unit_cost || recDetails[0].unit_price || 0);
                    }
                }
            }

            if (lotUnitCost === 0) {
                // Fallback to standard product cost
                const fallbackProd = productsMap.get(compId);
                lotUnitCost = Number((fallbackProd as any)?.cost_per_unit || 0);
            }

            const compTotalCost = pickQty * lotUnitCost;
            actualTotalCost += compTotalCost;

            actualUsageList.push({
                productId: compId,
                productName: (productsMap.get(compId) as any)?.product_name || `Product #${compId}`,
                qty: pickQty,
                unitCost: lotUnitCost,
                totalCost: compTotalCost
            });
        }

        // 3. Retrieve BOM components to calculate Standard Cost for the actual yield
        // Retrieve BOM components from manufacturing_job_order_materials
        const matsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${jo.job_order_id}&limit=-1`, {
            headers,
            cache: "no-store"
        });
        
        let bomComponents = [];
        if (matsRes.ok) {
            const matsData = (await matsRes.json()).data || [];
            bomComponents = matsData.map((m: any) => ({
                component_product_id: m.product_id,
                quantity: m.quantity_required,
                required: m.quantity_required
            }));
        }

        // Fallback: If no components found in JO products, fetch active BOM from directus-api
        if (bomComponents.length === 0) {
            const activeBOMRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_boms?filter[product_id][_eq]=${pId}&limit=1`, {
                headers,
                cache: "no-store"
            });
            if (activeBOMRes.ok) {
                const boms = (await activeBOMRes.json()).data || [];
                if (boms.length > 0) {
                    const compRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_bom_components?filter[bom_id][_eq]=${boms[0].bom_id}&limit=-1`, {
                        headers,
                        cache: "no-store"
                    });
                    if (compRes.ok) {
                        const comps = (await compRes.json()).data || [];
                        bomComponents = comps.map((c: { component_product_id: number | { product_id: number; product_name: string }; quantity_required: number; wastage_factor_percentage: number }) => {
                            const compProdId = typeof c.component_product_id === "object" ? c.component_product_id.product_id : c.component_product_id;
                            const compProdName = typeof c.component_product_id === "object" ? c.component_product_id.product_name : "";
                            return {
                                component_product_id: { product_id: compProdId, product_name: compProdName },
                                quantity_required: c.quantity_required,
                                wastage_factor_percentage: c.wastage_factor_percentage
                            };
                        });
                    }
                }
            }
        }

        let standardTotalCost = 0;
        const detailsBreakdown: ComponentVarianceDetail[] = [];

        // Aggregate actual picks by product ID for side-by-side comparison
        const actualsMap = new Map<number, { qty: number; totalCost: number }>();
        actualUsageList.forEach(u => {
            const prev = actualsMap.get(u.productId) || { qty: 0, totalCost: 0 };
            actualsMap.set(u.productId, {
                qty: prev.qty + u.qty,
                totalCost: prev.totalCost + u.totalCost
            });
        });

        // Compute standard details per component
        for (const comp of bomComponents) {
            // Handle different BOM component formats
            const compId = Number(comp.component_product_id?.product_id || comp.component_product_id || comp.productId || 0);
            if (compId === 0) continue;

            const compName = comp.component_product_id?.product_name || comp.product_name || (productsMap.get(compId) as any)?.product_name || `Component #${compId}`;
            const qtyReqPerUnit = Number(comp.quantity_required || comp.quantity || 0);
            const wastagePercent = Number(comp.wastage_factor_percentage || comp.wastagePercent || 0);

            // Standard quantity = quantityProduced * qtyReqPerUnit * (1 + wastagePercent / 100)
            const standardQtyForYield = qty * qtyReqPerUnit * (1 + wastagePercent / 100);
            const compStdProd = productsMap.get(compId);
            const standardUnitCost = Number((compStdProd as any)?.cost_per_unit || 0);
            const compStandardCost = standardQtyForYield * standardUnitCost;
            standardTotalCost += compStandardCost;

            const act = actualsMap.get(compId) || { qty: 0, totalCost: 0 };
            const variance = act.totalCost - compStandardCost;

            detailsBreakdown.push({
                productId: compId,
                productName: compName,
                actualQty: act.qty,
                actualUnitCost: act.qty > 0 ? act.totalCost / act.qty : 0,
                actualTotalCost: act.totalCost,
                standardQty: standardQtyForYield,
                standardUnitCost,
                standardTotalCost: compStandardCost,
                variance
            });

            // Remove from map to check if there are actuals not in the BOM
            actualsMap.delete(compId);
        }

        // Add any actual consumption items that were NOT part of the BOM
        for (const [compId, act] of actualsMap.entries()) {
            const compName = (productsMap.get(compId) as any)?.product_name || `Extra Component #${compId}`;
            const variance = act.totalCost; // Standard is 0, so entire cost is variance
            detailsBreakdown.push({
                productId: compId,
                productName: compName,
                actualQty: act.qty,
                actualUnitCost: act.qty > 0 ? act.totalCost / act.qty : 0,
                actualTotalCost: act.totalCost,
                standardQty: 0,
                standardUnitCost: 0,
                standardTotalCost: 0,
                variance
            });
        }

        const materialCostVariances = {
            actual_total_cost: actualTotalCost,
            standard_total_cost: standardTotalCost,
            total_variance: actualTotalCost - standardTotalCost,
            details: detailsBreakdown
        };

        // 4. Split and allocate yield proportionally back to the consolidated Sales Orders
        const josoRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[jo_id][_eq]=${encodeURIComponent(joId)}&limit=-1`, {
            headers,
            cache: "no-store"
        });
        const links = josoRes.ok ? (await josoRes.json()).data || [] : [];

        const yieldAllocations = [];
        if (links.length > 0) {
            const detailIds = links.map((l: any) => l.sales_order_detail_id).filter(Boolean);
            let details: any[] = [];
            if (detailIds.length > 0) {
                const filterDetails = encodeURIComponent(JSON.stringify({
                    detail_id: { _in: detailIds }
                }));
                const detailsRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details?filter=${filterDetails}&limit=-1`, {
                    headers,
                    cache: "no-store"
                });
                details = detailsRes.ok ? (await detailsRes.json()).data || [] : [];
            }

            const totalTargetQty = details.reduce((sum, d) => sum + Number(d.quantity || 0), 0);

            if (totalTargetQty > 0) {
                // Fetch Sales Order headers to get the Order Number and Client Name
                const orderIds = details.map(d => d.order_id).filter(Boolean);
                let ordersMap = new Map();
                if (orderIds.length > 0) {
                    const filterOrders = encodeURIComponent(JSON.stringify({
                        order_id: { _in: orderIds }
                    }));
                    const ordersRes = await fetch(`${DIRECTUS_URL}/items/sales_order?filter=${filterOrders}&limit=-1&fields=order_id,order_no,customer_id.customer_name`, {
                        headers,
                        cache: "no-store"
                    });
                    const orders = ordersRes.ok ? (await ordersRes.json()).data || [] : [];
                    ordersMap = new Map(orders.map((o: any) => [Number(o.order_id), o]));
                }

                for (const link of links) {
                    const d = details.find(det => Number(det.detail_id) === Number(link.sales_order_detail_id));
                    if (d) {
                        const targetQty = Number(d.quantity || 0);
                        const parentOrderId = Number(d.order_id);
                        const orderNo = (ordersMap.get(parentOrderId) as any)?.order_no || `SO-#${parentOrderId}`;
                        const customerName = (ordersMap.get(parentOrderId) as any)?.customer_id?.customer_name || "Unknown Customer";

                        // Proportional allocation
                        const allocatedQty = Math.round((qty * (targetQty / totalTargetQty)) * 100) / 100;
                        const allocatedAmt = allocatedQty * uCost;

                        yieldAllocations.push({
                            order_id: parentOrderId,
                            order_no: orderNo,
                            customer_name: customerName,
                            target_qty: targetQty,
                            allocated_yield: allocatedQty
                        });

                        // Patch detail record
                        await fetch(`${DIRECTUS_URL}/items/sales_order_details/${d.detail_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                allocated_quantity: allocatedQty,
                                allocated_amount: allocatedAmt
                            })
                        }).catch(err => console.error(`[Receiving API] Failed to update detail allocation:`, err));

                        // Transition Sales Order status to 'For Invoicing'
                        console.log(`[Receiving API] Updating Sales Order ${parentOrderId} status to "For Invoicing"`);
                        await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ order_status: "For Invoicing" })
                        }).catch(err => console.error(`[Receiving API] Failed to update Sales Order status:`, err));
                    }
                }
            }
        }

        // Resolve or create master lot in the lots table
        let finishedLotId = 49; // Default fallback to a valid existing lot ID
        try {
            const lotQuery = encodeURIComponent(JSON.stringify({ lot_name: { _eq: finalLotNo } }));
            const lotLookupRes = await fetch(`${DIRECTUS_URL}/items/lots?filter=${lotQuery}&limit=1`, { headers, cache: "no-store" });
            const lotLookup = lotLookupRes.ok ? (await lotLookupRes.json()).data || [] : [];
            if (lotLookup.length > 0) {
                finishedLotId = lotLookup[0].lot_id;
            } else {
                const createLotRes = await fetch(`${DIRECTUS_URL}/items/lots`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        lot_name: finalLotNo,
                        inventory_type_id: 389, // Finished Goods
                        max_batch_capacity: 100000,
                        created_by: 24
                    })
                });
                if (createLotRes.ok) {
                    finishedLotId = (await createLotRes.json()).data.lot_id;
                }
            }
        } catch (err) {
            console.error(`Error resolving master lot ID for ${finalLotNo}:`, err);
        }

        // 6. Write a positive entry to product_ledger (Yield Receive)
        const ledgerPosRes = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                branchId: bId,
                productId: pId,
                quantity: qty,
                documentType: "QA Receive",
                documentNo: joId,
                documentDescription: `MFG Run: ${finalLotNo}`,
                documentDate: await getTodayDateString()
            })
        });
        if (!ledgerPosRes.ok) {
            console.error("[Receiving API] Failed to log yield receipt in product ledger:", await ledgerPosRes.text());
        }

        // 6b. Write a positive entry to inventory_movements (Yield Receive)
        const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                product_id: pId,
                lot_id: finishedLotId,
                branch_id: bId,
                transaction_type_id: 2, // Job Order Finished Goods / Yield Receive
                source_document_no: joId,
                batch_no: finalLotNo,
                expiry_date: finalExpDate,
                quantity: qty,
                created_by: 24,
                remarks: `MFG Run: ${finalLotNo}`
            })
        });
        if (!movRes.ok) {
            console.error("[Receiving API] Failed to log yield receipt in inventory_movements:", await movRes.text());
        }

        // 7. Update Job Order: status = "Completed", save actual_quantity_produced & variances
        const patchPayload = {
            status: "Completed",
            actual_quantity_produced: qty,
            remarks: `Completed yield receiving. Variance details logged.`
        };
        const joUpdateRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jo.job_order_id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(patchPayload)
        });

        if (!joUpdateRes.ok) {
            const errTxt = await joUpdateRes.text();
            console.error(`[Receiving API] Failed to update Job Order metadata for ${joId}:`, errTxt);
        }

        return NextResponse.json({
            success: true,
            yieldAllocations,
            materialCostVariances
        });
    } catch (e) {
        console.error("[Receiving API POST] Error:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to receive yield" },
            { status: 500 }
        );
    }
}

