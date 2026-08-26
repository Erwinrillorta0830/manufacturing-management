/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";
import { DIRECTUS_URL, headers, getTodayDateString, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

// Helper to decode user ID from session cookie
async function getUserIdFromSession(): Promise<number> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                const tokenPayload = JSON.parse(jsonPayload);
                const id = tokenPayload?.id || tokenPayload?.user_id || tokenPayload?.sub;
                if (id && !isNaN(Number(id))) return Number(id);
            }
        }
    } catch (err) {
        console.error("Error decoding session in shift run log:", err);
    }
    return 24;
}

async function requireDirectusWriteData(response: Response, label: string): Promise<any> {
    const responseText = await response.text();
    let payload: any = null;

    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status}: ${responseText || "No response body"}`);
    }

    if (!payload || payload.data === undefined || payload.data === null) {
        throw new Error(`${label} returned no data from Directus.`);
    }

    return payload.data;
}

// GET handler: Fetches yield ledger logs, rejection reasons, or status history
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get("taskId");
        const joId = searchParams.get("joId");
        const action = searchParams.get("action");

        // 1. Fetch rejection reasons list
        if (action === "rejection-reasons") {
            try {
                const res = await fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons?filter[is_active][_neq]=0&limit=-1&sort=reason_name`, { headers, cache: "no-store" });
                if (res.ok) {
                    const json = await res.json();
                    return NextResponse.json({ success: true, data: json.data || [] });
                }
            } catch (err) {
                console.warn("Directus fetch for qa_rejection_reasons failed, using fallback list:", err);
            }

            // Fallback standard rejection reasons
            const fallbackReasons = [
                { id: 1, reason_id: 1, code: "DEF-DIM", reason_name: "Dimensional Variance / Out of Tolerance", category: "Dimensional", is_active: true },
                { id: 2, reason_id: 2, code: "DEF-SURF", reason_name: "Surface Flaw / Scratch / Dent", category: "Cosmetic", is_active: true },
                { id: 3, reason_id: 3, code: "DEF-CONT", reason_name: "Foreign Material Contamination", category: "Quality", is_active: true },
                { id: 4, reason_id: 4, code: "DEF-SEAL", reason_name: "Improper Sealing / Packaging Defect", category: "Packaging", is_active: true },
                { id: 5, reason_id: 5, code: "DEF-CHEM", reason_name: "Chemical / Viscosity Specification Failure", category: "Chemical", is_active: true },
                { id: 6, reason_id: 6, code: "DEF-MACH", reason_name: "Machine Jam / Processing Scrap", category: "Process", is_active: true },
                { id: 7, reason_id: 7, code: "DEF-SETUP", reason_name: "Line Setup / Calibration Waste", category: "Setup", is_active: true },
                { id: 8, reason_id: 8, code: "DEF-EXP", reason_name: "Material Expired in Staging", category: "Material", is_active: true }
            ];
            return NextResponse.json({ success: true, data: fallbackReasons });
        }

        // 2. Fetch yield ledger logs
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

// POST handler: Logs the shift yield, performs point-of-use real-time backflushing, updates inventory movements ledger, records genealogy, and updates Job Order status
export async function POST(request: Request) {
    try {
        const todayStr = await getTodayDateString();
        const manilaTimestamp = await getISOStringInConfiguredTimezone();
        const sessionUserId = await getUserIdFromSession();

        const body = await request.json();
        const { 
            taskId, 
            joId, 
            shiftName, 
            yieldQty, 
            scrapQty = 0,
            rejectionReasonId,
            rejectionRemarks,
            inspectorId, 
            qaStatus = "Pending", 
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

        const goodYield = Number(yieldQty || 0);
        const scrapUnits = Number(scrapQty || 0);
        const effectiveEncoderId = inspectorId ? Number(inspectorId) : sessionUserId;

        // 1. Fetch Job Order Details
        const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}`, { headers, cache: "no-store" });
        if (!joRes.ok) {
            throw new Error(`Failed to load job order with ID: ${joId}`);
        }
        const joData = (await joRes.json()).data;
        const producedProductId = Number(joData.product_id);
        if (!joData.branch_id) {
            return NextResponse.json({ error: `Job Order with ID ${joId} has no branch_id` }, { status: 400 });
        }
        const branchId = Number(joData.branch_id);
        const jobOrderNo = joData.job_order_no || `JO-${joId}`;
        const targetQuantity = Number(joData.target_quantity ?? joData.quantity ?? 0);
        const currentRejectedQty = Number(joData.rejected_quantity || 0);

        // Fetch all existing yield logs for this Job Order to compute accumulated yield
        const existingYieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${joId}&limit=-1`, { headers, cache: "no-store" });
        if (!existingYieldRes.ok) {
            throw new Error(`Failed to fetch existing yield ledger for Job Order ${joId}: ${await existingYieldRes.text()}`);
        }

        const existingYieldData = await existingYieldRes.json();
        const accumulatedYield = (existingYieldData.data || []).reduce((sum: number, log: any) => sum + Number(log.yield_quantity || 0), 0);

        if (accumulatedYield + goodYield > targetQuantity * 1.05) {
            return NextResponse.json({ 
                error: `Accumulated yield would exceed target by more than allowable tolerance! Already yielded: ${accumulatedYield.toLocaleString()} units. New yield: ${goodYield.toLocaleString()} units. Target: ${targetQuantity.toLocaleString()} units.` 
            }, { status: 400 });
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
                            created_by: effectiveEncoderId
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

        // 2. Validate all material stock levels before writing database entries
        const lotsCache: Record<number, any[]> = {};
        if (materialsConsumed && materialsConsumed.length > 0) {
            for (const item of materialsConsumed) {
                const rawProductId = Number(item.product_id);
                const consumedQty = Number(item.actual_qty || 0);

                if (consumedQty <= 0) continue;

                // Fetch inventory movements to calculate true ledger stock
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
                            const bNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim();
                            batchStatusMap.set(bNo, rec.qa_status || "Passed");
                        });
                    }
                } catch (err) {}

                try {
                    // 2. Yield Ledger
                    const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${rawProductId}&fields=*,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
                    if (yieldRes.ok) {
                        const yields = (await yieldRes.json()).data || [];
                        yields.forEach((yl: any) => {
                            const bNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim();
                            batchStatusMap.set(bNo, yl.qa_status || "Pending");
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
                            const status = batchStatusMap.get(bNo) || "Passed";
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
                        error: `Insufficient staging stock for component "${prodName}". Only ${totalAvailable.toLocaleString()} ${unitName} available in active Passed staging lots, but ${consumedQty.toLocaleString()} was entered for point-of-use consumption.`,
                        isShortfall: true
                    }, { status: 400 });
                }
            }
        }

        // 3. Insert new row into manufacturing_job_order_yield_ledger table
        const requestedBatchNo = typeof batchNo === "string" ? batchNo.trim() : "";
        const finalBatchNo = requestedBatchNo || `${jobOrderNo}-YLD-${todayStr.replace(/-/g, "")}`;
        const ledgerPayload = {
            job_order_id: Number(joId),
            shift_name: shiftName,
            yield_quantity: goodYield,
            scrap_quantity: scrapUnits,
            lot_number: finalBatchNo,
            qa_status: qaStatus === "Passed" ? "Passed" : qaStatus,
            logged_at: manilaTimestamp,
            logged_by: effectiveEncoderId
        };

        const ledgerRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger`, {
            method: "POST",
            headers,
            body: JSON.stringify(ledgerPayload)
        });

        const ledgerData = await requireDirectusWriteData(ledgerRes, "Yield ledger insert");
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
                    inspected_by: effectiveEncoderId,
                    inspected_at: manilaTimestamp,
                    remarks: `Shift: ${shiftName} | Yield: ${goodYield} pcs | Scrap: ${scrapUnits} pcs | ${param.remarks || "Shift QA Check"}`
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
                inspected_by: effectiveEncoderId,
                inspected_at: manilaTimestamp,
                remarks: `Shift Yield Log: ${shiftName} | Yield: ${goodYield} pcs | Scrap: ${scrapUnits} pcs ${rejectionRemarks ? `| Rejection: ${rejectionRemarks}` : ""}`
            };

            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                method: "POST",
                headers,
                body: JSON.stringify(qaPayload)
            });
        }

        // 5. POINT-OF-USE REAL-TIME BACKFLUSHING: Write negative consumption entries into `inventory_movements`
        // Document No: 'JO-xxxx' (single standard source_document_no)
        const genealogyRecords: any[] = [];

        if (materialsConsumed && materialsConsumed.length > 0) {
            const matsSheetRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${joId}&limit=-1`, { headers, cache: "no-store" });
            const matsSheet = matsSheetRes.ok ? (await matsSheetRes.json()).data || [] : [];

            for (const item of materialsConsumed) {
                const rawProductId = Number(item.product_id);
                const consumedQty = Number(item.actual_qty || 0);

                if (consumedQty <= 0) continue;

                const matchingMat = matsSheet.find((m: any) => Number(m.product_id) === rawProductId);
                let remainingToConsume = consumedQty;

                // Function to write Point-of-Use negative consumption movement and genealogy
                const logConsumageAndMovement = async (qty: number, lot: any) => {
                    if (qty <= 0) return;
                    let consumageId = 0;

                    // Log consumage sub-record if ledger table exists
                    try {
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
                    } catch (cErr) {}

                    const batchNumber = String(lot.batch_no || lot.lot_number || item.batch_no || "LOT-STAGING").trim();
                    const relatedLotId = typeof lot.lot_id === "object"
                        ? Number(lot.lot_id?.lot_id || 0)
                        : Number(lot.lot_id || item.lot_id || 0);
                    const consumedLotId = relatedLotId || await resolveMasterLotId(batchNumber, 1);

                    // Standard Negative Backflushing entry into inventory_movements
                    const backflushMovementPayload = {
                        product_id: rawProductId,
                        lot_id: consumedLotId,
                        branch_id: branchId,
                        transaction_type_id: 1, // Job Order Consumage / Backflushing
                        source_document_id: Number(joId),
                        source_document_no: jobOrderNo, // 'JO-xxxx'
                        batch_no: batchNumber,
                        expiry_date: lot.expiry_date || null,
                        manufacturing_date: lot.created_on ? lot.created_on.split("T")[0] : null,
                        quantity: -qty, // Outgoing negative consumption entry
                        created_by: effectiveEncoderId,
                        remarks: `Point-of-use backflushing from lot ${batchNumber} for JO #${jobOrderNo} (${shiftName})`
                    };

                    await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(backflushMovementPayload)
                    });

                    // Record into jo_material_genealogy
                    try {
                        const genealogyPayload = {
                            job_order_id: Number(joId),
                            finished_batch_no: finalBatchNo,
                            raw_product_id: rawProductId,
                            raw_lot_id: consumedLotId,
                            raw_batch_no: batchNumber,
                            quantity_consumed: qty,
                            created_at: manilaTimestamp,
                            created_by: effectiveEncoderId
                        };

                        await fetch(`${DIRECTUS_URL}/items/jo_material_genealogy`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify(genealogyPayload)
                        });

                        genealogyRecords.push(genealogyPayload);
                    } catch (genErr) {
                        console.warn("Directus insert into jo_material_genealogy error (ignoring if table optional):", genErr);
                    }
                };

                // Deduct from pre-reservations first if available
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
                            const lotNo = resRow.batch_no || "LOT-STAGING";

                            const portion = Math.min(reservedVal, remainingToConsume);
                            if (portion <= 0) continue;

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
                            }).catch(() => {});

                            // Deduct from inventory_movements ledger by lotNo
                            await logConsumageAndMovement(portion, { batch_no: lotNo });
                            remainingToConsume -= portion;
                        }

                        // Update parent manufacturing_job_order_materials row
                        const newJomReserved = Math.max(0, Number(matchingMat.reserved_quantity || 0) - consumedQty);
                        const newJomConsumed = Number(matchingMat.actual_consumed_quantity || 0) + consumedQty;
                        const newJomScrap = Number(matchingMat.scrap_quantity || 0) + (scrapUnits > 0 ? (consumedQty * (scrapUnits / (goodYield + scrapUnits))) : 0);

                        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${matchingMat.jo_material_id || matchingMat.id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                reserved_quantity: newJomReserved,
                                actual_consumed_quantity: newJomConsumed,
                                scrap_quantity: Math.round(newJomScrap * 100) / 100
                            })
                        }).catch(() => {});
                    } catch (err) {
                        console.error("Error reconciling reservations:", err);
                    }
                }

                // If shortfall remains or mat wasn't pre-allocated, deduct standard FIFO from available staging stock
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
                        }).catch(() => {});
                    }

                    const activeLots = lotsCache[rawProductId] || [];
                    if (activeLots.length > 0) {
                        const fbLot = activeLots[0];
                        await logConsumageAndMovement(remainingToConsume, fbLot);
                    } else {
                        await logConsumageAndMovement(remainingToConsume, { batch_no: "LOT-STAGING" });
                    }
                }
            }
        }

        // 6. RECORD FINISHED GOODS / WIP OUTPUT MOVEMENT IN INVENTORY_MOVEMENTS LEDGER
        const finishedLotId = targetLotId ? Number(targetLotId) : await resolveMasterLotId(finalBatchNo, 2); // 2 = Finished Goods

        const finishedMovementPayload = {
            product_id: producedProductId,
            lot_id: finishedLotId,
            branch_id: branchId,
            transaction_type_id: 2, // Job Order Finished Goods
            source_document_id: Number(joId),
            source_document_no: jobOrderNo, // 'JO-xxxx'
            batch_no: finalBatchNo,
            expiry_date: expiryDate || null,
            manufacturing_date: manufacturingDate || null,
            quantity: goodYield,
            created_by: effectiveEncoderId,
            remarks: `Yield output from Job Order ${jobOrderNo} | Shift: ${shiftName} | Lot: ${finalBatchNo}`
        };

        const finishedMovementRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
            method: "POST",
            headers,
            body: JSON.stringify(finishedMovementPayload)
        });
        await requireDirectusWriteData(finishedMovementRes, "Finished-goods inventory movement insert");

        // 7. UPDATE JOB ORDER ACCUMULATED COMPLETED QUANTITY, REJECTED QUANTITY, AND STATUS
        const newCompletedQty = accumulatedYield + goodYield;
        const newRejectedQty = currentRejectedQty + scrapUnits;
        const isJobFullyFinished = newCompletedQty >= targetQuantity;

        // completed_quantity is the shift-run aggregate. Keep
        // actual_quantity_produced owned by finished-goods receiving; this
        // Directus field contains legacy nulls and rejects production-run writes.
        const joUpdatePayload: Record<string, any> = {
            completed_quantity: newCompletedQty,
            rejected_quantity: newRejectedQty,
            modified_by: effectiveEncoderId,
            modified_at: manilaTimestamp
        };

        if (isJobFullyFinished) {
            joUpdatePayload.status = "Completed";
        } else if (joData.status !== "In Progress" && joData.status !== "Ongoing") {
            joUpdatePayload.status = "In Progress";
        }

        const expectedStatus = isJobFullyFinished
            ? "Completed"
            : (joData.status === "In Progress" || joData.status === "Ongoing" ? joData.status : "In Progress");

        // Keep the PATCH response unscoped. This Directus instance rejects scoped
        // update responses when other records in the collection contain nulls in
        // actual_quantity_produced, even though the target Job Order is valid.
        const joUpdateRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(joUpdatePayload)
        });

        const updatedJoData = await requireDirectusWriteData(joUpdateRes, "Job Order completion update");
        const persistedCompletedQuantity = Number(updatedJoData.completed_quantity);
        const hasExpectedCompletedQuantity = Number.isFinite(persistedCompletedQuantity)
            && Math.abs(persistedCompletedQuantity - newCompletedQty) < 0.000001;
        const persistedStatus = String(updatedJoData.status || "");

        if (!hasExpectedCompletedQuantity || persistedStatus !== expectedStatus) {
            throw new Error(`Job Order ${jobOrderNo} did not persist the expected completion state.`);
        }

        // 8. RECORD IN MANUFACTURING_JOB_ORDER_STATUS_HISTORY IF COMPLETED OR TRANSITIONED
        if (isJobFullyFinished && joData.status !== "Completed") {
            const statusHistoryPayload = {
                job_order_id: Number(joId),
                old_status: joData.status,
                new_status: "Completed",
                changed_by: effectiveEncoderId,
                changed_at: manilaTimestamp,
                remarks: `Job Order completed. Target ${targetQuantity.toLocaleString()} pcs reached with final shift run (${goodYield} pcs).`
            };

            const historyRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_status_history`, {
                method: "POST",
                headers,
                body: JSON.stringify(statusHistoryPayload)
            });
            await requireDirectusWriteData(historyRes, "Finished status-history insert");
        }

        return NextResponse.json({ 
            success: true, 
            message: `Shift run progress logged successfully! Backflushed point-of-use materials into inventory movements (${jobOrderNo}) and updated output batch ${finalBatchNo}.`,
            batchNo: finalBatchNo,
            yieldQty: goodYield,
            scrapQty: scrapUnits,
            completedQuantity: newCompletedQty,
            isFullyFinished: isJobFullyFinished,
            genealogyRecords
        });
    } catch (e) {
        console.error("Error in shift-run-log POST API:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to log shift progress" }, { status: 500 });
    }
}
