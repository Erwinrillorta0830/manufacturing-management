/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://vtc:8074";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

// GET handler: Fetches yield ledger logs from the database
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get("taskId");
        const joId = searchParams.get("joId");

        let url = `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&sort=-logged_at`;
        if (joId) {
            url += `&filter[job_order_id][_eq]=${joId}`;
        }

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to fetch yield ledger from database");
        }
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("Error fetching yield ledger:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch ledger logs" }, { status: 500 });
    }
}

// POST handler: Logs the shift yield, updates inventory (FIFO), and inserts a ledger record
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { 
            taskId, 
            joId, 
            shiftName, 
            yieldQty, 
            inspectorId, 
            qaStatus, 
            qaParameters, 
            materialsConsumed,
            batchNo,
            expiryDate,
            manufacturingDate,
            targetLotId
        } = body;

        if (!taskId || !joId || !shiftName || yieldQty === undefined) {
            return NextResponse.json({ error: "Missing required fields: taskId, joId, shiftName, yieldQty" }, { status: 400 });
        }

        // 1. Fetch Job Order Details to find product_id, branch_id, and job_order_no
        const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}`, { headers, cache: "no-store" });
        if (!joRes.ok) {
            throw new Error(`Failed to load job order with ID: ${joId}`);
        }
        const joData = (await joRes.json()).data;
        const producedProductId = joData.product_id;
        if (!joData.branch_id) {
            return NextResponse.json({ error: `Job Order with ID ${joId} has no branch_id` }, { status: 400 });
        }
        const branchId = joData.branch_id;
        const jobOrderNo = joData.job_order_no;
        const targetQuantity = Number(joData.target_quantity || 0);

        // Fetch all existing yield logs for this Job Order to compute accumulated yield
        const existingYieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${joId}&limit=-1`, { headers, cache: "no-store" });
        let accumulatedYield = 0;
        if (existingYieldRes.ok) {
            const existingYieldData = await existingYieldRes.json();
            accumulatedYield = (existingYieldData.data || []).reduce((sum: number, log: any) => sum + Number(log.yield_quantity || 0), 0);
        }

        if (accumulatedYield + Number(yieldQty) > targetQuantity) {
            return NextResponse.json({ 
                error: `Accumulated yield would exceed target! Already yielded: ${accumulatedYield.toLocaleString()} units. New yield: ${Number(yieldQty).toLocaleString()} units. Target: ${targetQuantity.toLocaleString()} units.` 
            }, { status: 400 });
        }

        const timestamp = new Date().toISOString();

        // 2. Validate all material stock levels before writing any database entries
        const lotsCache: Record<number, any[]> = {};
        if (materialsConsumed && materialsConsumed.length > 0) {
            for (const item of materialsConsumed) {
                const rawProductId = Number(item.product_id);
                const consumedQty = Number(item.actual_qty || 0);

                if (consumedQty <= 0) continue;

                // Fetch inventory movements to calculate the true ledger stock
                const movFilter = encodeURIComponent(JSON.stringify({
                    _and: [
                        { product_id: { _eq: rawProductId } },
                        { branch_id: { _eq: branchId } }
                    ]
                }));
                const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
                const movements = movRes.ok ? (await movRes.json()).data || [] : [];
                const movementStockMap = sumMovementQuantitiesByStock(movements);

                // Fetch document statuses for this product to determine QA status
                const batchStatusMap = new Map<string, string>();
                
                try {
                    // 1. PO Receivings
                    const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${rawProductId}&limit=-1`, { headers, cache: "no-store" });
                    if (recRes.ok) {
                        const receipts = (await recRes.json()).data || [];
                        receipts.forEach((rec: any) => {
                            const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim();
                            batchStatusMap.set(batchNo, rec.qa_status || "Passed");
                        });
                    }
                } catch (err) {}

                try {
                    // 2. Yield Ledger
                    const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${rawProductId}&fields=*,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
                    if (yieldRes.ok) {
                        const yields = (await yieldRes.json()).data || [];
                        yields.forEach((yl: any) => {
                            const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim();
                            batchStatusMap.set(batchNo, yl.qa_status || "Pending");
                        });
                    }
                } catch (err) {}

                // Compile active passed batches from movementStockMap
                const lotsEnriched: any[] = [];
                movementStockMap.forEach((qty, key) => {
                    if (qty > 0) {
                        const parts = key.split(":");
                        const prodId = Number(parts[0]);
                        const bNo = parts[3] || "LOT-N/A";
                        if (prodId === rawProductId) {
                            const status = batchStatusMap.get(bNo) || "Passed"; // default to Passed for legacy/unknown lots
                            if (status === "Passed" || status === "Partially Accepted") {
                                lotsEnriched.push({
                                    lot_id: parts[2] === "null" ? 0 : Number(parts[2]),
                                    lot_number: bNo,
                                    batch_no: bNo,
                                    quantity: qty
                                });
                            }
                        }
                    }
                });

                lotsCache[rawProductId] = lotsEnriched;

                const totalAvailable = lotsEnriched.reduce((sum: number, l: any) => sum + Number(l.quantity || 0), 0);
                if (totalAvailable < consumedQty) {
                    let prodName = `Product #${rawProductId}`;
                    let unitName = "units";
                    try {
                        const prodDetailRes = await fetch(`${DIRECTUS_URL}/items/products/${rawProductId}?fields=product_name,unit_of_measurement.unit_shortcut`, { headers, cache: "no-store" });
                        if (prodDetailRes.ok) {
                            const prodData = (await prodDetailRes.json()).data;
                            if (prodData) {
                                prodName = prodData.product_name || prodName;
                                unitName = prodData.unit_of_measurement?.unit_shortcut || unitName;
                            }
                        }
                    } catch (err) {
                        console.error("Failed to fetch product details for stock validation message:", err);
                    }

                    return NextResponse.json({
                        error: `Insufficient stock for raw material "${prodName}". Only ${totalAvailable.toLocaleString()} ${unitName} available in active Passed lots, but ${consumedQty.toLocaleString()} was logged as consumed.`
                    }, { status: 400 });
                }
            }
        }

        // 3. Insert new row into relational manufacturing_job_order_yield_ledger table
        const ledgerPayload = {
            job_order_id: Number(joId),
            shift_name: shiftName,
            yield_quantity: Number(yieldQty),
            qa_status: qaStatus === "Passed" ? "Pending" : qaStatus,
            logged_at: timestamp,
            logged_by: inspectorId ? Number(inspectorId) : null
        };

        const ledgerRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger`, {
            method: "POST",
            headers,
            body: JSON.stringify(ledgerPayload)
        });

        if (!ledgerRes.ok) {
            throw new Error("Failed to insert into manufacturing_job_order_yield_ledger database table: " + await ledgerRes.text());
        }

        const ledgerData = (await ledgerRes.json()).data;
        const ledgerId = ledgerData.ledger_id || ledgerData.id;

        // 4. Insert QA Parameters/Yield Log into manufacturing_job_order_qa_records
        if (qaParameters && qaParameters.length > 0) {
            for (const param of qaParameters) {
                const valNumeric = param.value !== undefined && param.value !== "" ? Number(param.value) : null;
                const valText = typeof param.value === "string" ? param.value : null;
                const valBool = typeof param.value === "boolean" ? param.value : null;

                const qaPayload = {
                    job_order_id: Number(joId),
                    jo_route_id: Number(taskId),
                    parameter_id: Number(param.parameter_id),
                    value_text: valText,
                    value_numeric: valNumeric,
                    value_boolean: valBool,
                    is_passed: !param.is_failed,
                    inspected_by: inspectorId ? Number(inspectorId) : null,
                    inspected_at: timestamp,
                    remarks: `Shift: ${shiftName} | Yield: ${yieldQty} pcs | ${param.remarks || "Shift QA check"}`
                };

                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(qaPayload)
                });
            }
        } else {
            const qaPayload = {
                job_order_id: Number(joId),
                jo_route_id: Number(taskId),
                parameter_id: null,
                is_passed: qaStatus === "Passed" ? 1 : 0,
                inspected_by: inspectorId ? Number(inspectorId) : null,
                inspected_at: timestamp,
                remarks: `Shift Yield Log: ${shiftName} | Yield: ${yieldQty} pcs`
            };

            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                method: "POST",
                headers,
                body: JSON.stringify(qaPayload)
            });
        }

        // Helper function to resolve or create master lot
        const resolveMasterLotId = async (name: string, typeId: number) => {
            let lotId = 1;
            try {
                const lotQuery = encodeURIComponent(JSON.stringify({ lot_name: { _eq: name } }));
                const lotLookupRes = await fetch(`${DIRECTUS_URL}/items/lots?filter=${lotQuery}&limit=1`, { headers, cache: "no-store" });
                const lotLookup = lotLookupRes.ok ? (await lotLookupRes.json()).data || [] : [];
                if (lotLookup.length > 0) {
                    lotId = lotLookup[0].lot_id;
                } else {
                    const createLotRes = await fetch(`${DIRECTUS_URL}/items/lots`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            lot_name: name,
                            inventory_type_id: typeId,
                            max_batch_capacity: 100000,
                            created_by: inspectorId ? Number(inspectorId) : 24
                        })
                    });
                    if (createLotRes.ok) {
                        lotId = (await createLotRes.json()).data.lot_id;
                    }
                }
            } catch (err) {
                console.error(`Error resolving master lot ID for ${name}:`, err);
            }
            return lotId;
        };

        // 5. Process Material Consumption Reconciliations & deductions
        if (materialsConsumed && materialsConsumed.length > 0) {
            const matsSheetRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${joId}&limit=-1`, { headers, cache: "no-store" });
            const matsSheet = matsSheetRes.ok ? (await matsSheetRes.json()).data || [] : [];

            for (const item of materialsConsumed) {
                const rawProductId = Number(item.product_id);
                const consumedQty = Number(item.actual_qty || 0);

                if (consumedQty <= 0) continue;

                const matchingMat = matsSheet.find((m: any) => Number(m.product_id) === rawProductId);
                let remainingToConsume = consumedQty;

                // Log Consumage and Movements
                const logConsumageAndMovement = async (qty: number, lot: any) => {
                    if (qty <= 0) return;
                    let consumageId = 0;
                    if (ledgerId) {
                        const consumagePayload = {
                            ledger_id: Number(ledgerId),
                            product_id: rawProductId,
                            quantity_consumed: qty
                        };
                        const consumageRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify(consumagePayload)
                        });
                        if (consumageRes.ok) {
                            const cData = (await consumageRes.json()).data;
                            consumageId = cData.id || cData.consumage_id || 0;
                        }
                    }

                    const batchNumber = lot.batch_no || lot.lot_number || "LOT-N/A";
                    const relatedLotId = typeof lot.lot_id === "object"
                        ? Number(lot.lot_id?.lot_id || 0)
                        : Number(lot.lot_id || 0);
                    const consumedLotId = relatedLotId || await resolveMasterLotId(batchNumber, 1);
                    const mPayload = {
                        product_id: rawProductId,
                        lot_id: consumedLotId,
                        branch_id: branchId,
                        transaction_type_id: 1, // Job Order Consumage
                        source_document_id: consumageId,
                        source_document_no: String(ledgerId),
                        batch_no: batchNumber,
                        expiry_date: lot.expiry_date || null,
                        manufacturing_date: lot.created_on ? lot.created_on.split("T")[0] : null,
                        quantity: -qty, // OUT direction
                        created_by: inspectorId ? Number(inspectorId) : 24,
                        remarks: `Consumed from lot ${batchNumber} for JO yield`
                    };
                    await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(mPayload)
                    });
                };

                if (matchingMat) {
                    try {
                        const reservationsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_eq]=${matchingMat.jo_material_id || matchingMat.id}&limit=-1`, { headers, cache: "no-store" });
                        const reservations = reservationsRes.ok ? (await reservationsRes.json()).data || [] : [];
                        
                        const sortedReservations = [...reservations].sort((a, b) => {
                            const aQty = Number(a.reserved_quantity || 0);
                            const bQty = Number(b.reserved_quantity || 0);
                            return bQty - aQty;
                        });

                        for (const resRow of sortedReservations) {
                            if (remainingToConsume <= 0) break;

                            const reservedVal = Number(resRow.reserved_quantity || 0);
                            const usedVal = Number(resRow.actual_used_quantity || 0);
                            const porId = resRow.purchase_order_receiving_id ? Number(resRow.purchase_order_receiving_id) : null;

                            const portion = porId !== null ? Math.min(reservedVal, remainingToConsume) : remainingToConsume;

                            if (portion <= 0 && porId !== null) continue;

                            const newReserved = Math.max(0, reservedVal - portion);
                            const newUsed = usedVal + portion;

                            // Update reservation row
                            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${resRow.jo_materials_reservation_id || resRow.id}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({
                                    reserved_quantity: newReserved,
                                    actual_used_quantity: newUsed
                                })
                            }).catch(err => console.error(`Failed to update materials reservation row:`, err));

                            // Deduct from physical inventory_lots
                            if (porId && portion > 0) {
                                try {
                                    const porDetailRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving/${porId}?fields=purchase_order_id,lot_no,batch_no,expiry_date`, { headers, cache: "no-store" });
                                    if (porDetailRes.ok) {
                                        const porDetail = (await porDetailRes.json()).data;
                                        if (porDetail) {
                                            const poId = porDetail.purchase_order_id;
                                            const lotNo = porDetail.lot_no || porDetail.batch_no || "LOT-N/A";
                                            
                                            const lotQuery = encodeURIComponent(JSON.stringify({
                                                _and: [
                                                    { product_id: { _eq: rawProductId } },
                                                    { branch_id: { _eq: branchId } },
                                                    { source_type: { _eq: "procurement" } },
                                                    { source_reference: { _eq: String(poId) } },
                                                    { _or: [
                                                        { lot_number: { _eq: lotNo } },
                                                        { batch_no: { _eq: lotNo } }
                                                    ] }
                                                ]
                                            }));
                                            
                                            const lRes = await fetch(`${DIRECTUS_URL}/items/inventory_lots?filter=${lotQuery}&limit=1`, { headers, cache: "no-store" });
                                             if (lRes.ok) {
                                                 const lotList = (await lRes.json()).data || [];
                                                 if (lotList.length > 0) {
                                                      const lot = lotList[0];
                                                      await logConsumageAndMovement(portion, lot);
                                                 }
                                             }
                                        }
                                    }
                                } catch (porErr) {
                                    console.error(`Failed to deduct physical inventory lot for POR ID ${porId}:`, porErr);
                                }
                            } else {
                                // For sub-assembly direct reservations
                                await logConsumageAndMovement(portion, { lot_number: "Manufacturing Stock" });
                            }

                            remainingToConsume -= portion;
                        }

                        // Update parent manufacturing_job_order_materials row
                        const newJomReserved = Math.max(0, Number(matchingMat.reserved_quantity || 0) - consumedQty);
                        const newJomConsumed = Number(matchingMat.actual_consumed_quantity || 0) + consumedQty;
                        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${matchingMat.jo_material_id || matchingMat.id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                reserved_quantity: newJomReserved,
                                actual_consumed_quantity: newJomConsumed
                            })
                        }).catch(err => console.error("Error updating parent material requirement row:", err));
                    } catch (err) {
                        console.error("Error reconciling reservations:", err);
                    }
                }

                // If shortfall remains or mat wasn't pre-allocated, deduct standard FIFO
                if (remainingToConsume > 0) {
                    if (!matchingMat) {
                        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                job_order_id: Number(joId),
                                product_id: rawProductId,
                                uom_id: 1,
                                allocated_quantity: 0,
                                reserved_quantity: 0,
                                actual_consumed_quantity: consumedQty,
                                scrap_quantity: 0
                            })
                        }).catch(err => console.error("Error creating unallocated materials row:", err));
                    }

                    try {
                        const fallbackQuery = encodeURIComponent(JSON.stringify({
                            _and: [
                                { product_id: { _eq: rawProductId } },
                                { branch_id: { _eq: branchId } },
                                { qa_status: { _eq: "Passed" } },
                                { quantity: { _gt: 0 } }
                            ]
                        }));
                        const activeLots = lotsCache[rawProductId] || [];
                        if (activeLots.length > 0) {
                            const fbLot = activeLots[0];
                            await logConsumageAndMovement(remainingToConsume, fbLot);
                        }
                    } catch (err) {
                        console.error("Failed to deduct fallback lot for shortfall:", err);
                    }
                }
            }
        }

        // 6. Record Yield: Insert new inventory lot for the produced product
        const finalBatchNo = batchNo || `${jobOrderNo}-YLD-${new Date().toISOString().split("T")[0].replace(/-/g, "")}`;
        const finishedLotId = targetLotId ? Number(targetLotId) : await resolveMasterLotId(finalBatchNo, 2); // 2 = Finished Goods
        const newLotPayload = {
            product_id: producedProductId,
            branch_id: branchId,
            quantity: 0,
            qa_status: qaStatus || "Pending",
            source_type: "yield_ledger",
            source_reference: String(ledgerId),
            lot_number: finalBatchNo,
            lot_id: finishedLotId,
            expiry_date: expiryDate || null,
            created_on: manufacturingDate || null,
            remarks: `Yield from Job Order ${jobOrderNo} | Shift: ${shiftName}`
        };

        const lotRes = await fetch(`${DIRECTUS_URL}/items/inventory_lots`, {
            method: "POST",
            headers,
            body: JSON.stringify(newLotPayload)
        });

        if (!lotRes.ok) {
            console.error("Failed to insert new inventory lot:", await lotRes.text());
        }

        // 7. Log finished yield movement in inventory_movements ledger
        const finishedMovementPayload = {
            product_id: producedProductId,
            lot_id: finishedLotId,
            branch_id: branchId,
            transaction_type_id: 2, // Job Order Finished Goods
            source_document_id: Number(ledgerId),
            source_document_no: jobOrderNo,
            batch_no: finalBatchNo,
            expiry_date: expiryDate || null,
            manufacturing_date: manufacturingDate || null,
            quantity: Number(yieldQty),
            created_by: inspectorId ? Number(inspectorId) : 24,
            remarks: `Finished yield output from Job Order ${jobOrderNo}`
        };
        await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
            method: "POST",
            headers,
            body: JSON.stringify(finishedMovementPayload)
        });

        return NextResponse.json({ success: true, message: "Shift run progress logged successfully, inventory movements ledger updated." });
    } catch (e) {
        console.error("Error in shift-run-log POST API:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to log shift progress" }, { status: 500 });
    }
}
