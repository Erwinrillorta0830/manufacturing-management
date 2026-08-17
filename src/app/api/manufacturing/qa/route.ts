/* eslint-disable */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DIRECTUS_URL, headers, getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { createJobOrder } from "@/app/api/manufacturing/planning-engineering/planning-helper";

const DISPOSITIONS_FILE = path.join(process.cwd(), "src/app/api/manufacturing/qa/dispositions.json");

// Helper to resolve job_order_id (integer) and product_id from job_order_no (string)
async function getJobOrderIdByNo(joNo: string): Promise<{ id: number; productId: number } | null> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joNo)}&limit=1`, { headers });
        if (res.ok) {
            const data = (await res.json()).data?.[0];
            if (data) {
                return {
                    id: Number(data.job_order_id),
                    productId: Number(data.product_id)
                };
            }
        }
    } catch (e) {
        console.error("Failed to resolve job_order_id for", joNo, e);
    }
    return null;
}

// Helper to resolve or create master lot in lots collection
async function resolveMasterLotId(name: string, typeId: number): Promise<number> {
    let lotId = 49; // Default fallback
    const mappedTypeId = typeId === 1 ? 390 : 389; // 1 = Raw Materials, 2 = Finished Goods
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
                    inventory_type_id: mappedTypeId,
                    max_batch_capacity: 100000,
                    created_by: 24
                })
            });
            if (createLotRes.ok) {
                lotId = (await createLotRes.json()).data.lot_id;
            } else {
                console.error(`Failed to create master lot ${name}:`, await createLotRes.text());
            }
        }
    } catch (err) {
        console.error(`Error resolving master lot ID for ${name}:`, err);
    }
    return lotId;
}

// Helper to ensure the local dispositions database file exists and read it
function readDispositions(): any[] {
    try {
        const dir = path.dirname(DISPOSITIONS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(DISPOSITIONS_FILE)) {
            fs.writeFileSync(DISPOSITIONS_FILE, JSON.stringify([]));
            return [];
        }
        const fileContent = fs.readFileSync(DISPOSITIONS_FILE, "utf-8");
        return JSON.parse(fileContent || "[]");
    } catch (err) {
        console.error("Error reading dispositions JSON:", err);
        return [];
    }
}

// Helper to write to local dispositions database
function writeDispositions(data: any[]): void {
    try {
        const dir = path.dirname(DISPOSITIONS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(DISPOSITIONS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing dispositions JSON:", err);
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get("action");

        // Action 1: Fetch QA Rejection Reasons (from qa_rejection_reasons)
        if (action === "rejection-reasons") {
            try {
                const res = await fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons?filter[is_active][_eq]=true&limit=-1&sort=reason_code`, { headers, cache: "no-store" });
                if (res.ok) {
                    const data = (await res.json()).data || [];
                    return NextResponse.json(data);
                }
            } catch (err) {
                console.error("Error fetching rejection reasons from Directus:", err);
            }
            // Fallback standard reasons if table is still loading
            const fallbackReasons = [
                { id: 1, reason_code: "DIM_OOS", reason_name: "Dimension Out of Specification", category: "Dimensional" },
                { id: 2, reason_code: "SURF_DEF", reason_name: "Surface & Visual Defect", category: "Visual" },
                { id: 3, reason_code: "CONTAM", reason_name: "Foreign Material Contamination", category: "Quality" },
                { id: 4, reason_code: "WEIGHT_DEV", reason_name: "Weight Deviation", category: "Weight" },
                { id: 5, reason_code: "PACK_LEAK", reason_name: "Packaging Seal / Leak Failure", category: "Packaging" },
                { id: 6, reason_code: "ASSEMBLY_ERR", reason_name: "Assembly / Alignment Error", category: "Assembly" },
                { id: 7, reason_code: "LABEL_MISPRINT", reason_name: "Label / Barcode Misprint", category: "Labeling" },
                { id: 8, reason_code: "MOISTURE_OOS", reason_name: "Moisture / Viscosity Out of Spec", category: "Chemical" },
                { id: 9, reason_code: "MECH_FAIL", reason_name: "Mechanical / Strength Failure", category: "Functional" },
                { id: 10, reason_code: "OTHER", reason_name: "Other Non-Conformance", category: "General" }
            ];
            return NextResponse.json(fallbackReasons);
        }

        // Action 2: Fetch QA Inspection Logs (from qa_jo_inspection_logs)
        if (action === "inspection-logs") {
            const jobOrderId = searchParams.get("jobOrderId");
            let url = `${DIRECTUS_URL}/items/qa_jo_inspection_logs?limit=-1&sort=-id`;
            if (jobOrderId) {
                url += `&filter[job_order_id][_eq]=${Number(jobOrderId)}`;
            }

            try {
                const [logsRes, reasonsRes, josRes, productsRes] = await Promise.all([
                    fetch(url, { headers, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons?limit=-1`, { headers, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,product_id`, { headers, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name`, { headers, cache: "no-store" })
                ]);

                const rawLogs = logsRes.ok ? (await logsRes.json()).data || [] : [];
                const reasons = reasonsRes.ok ? (await reasonsRes.json()).data || [] : [];
                const jos = josRes.ok ? (await josRes.json()).data || [] : [];
                const products = productsRes.ok ? (await productsRes.json()).data || [] : [];

                const enrichedLogs = rawLogs.map((log: any) => {
                    const matchedJO = jos.find((j: any) => Number(j.job_order_id) === Number(log.job_order_id));
                    const matchedReworkJO = log.rework_job_order_id ? jos.find((j: any) => Number(j.job_order_id) === Number(log.rework_job_order_id)) : null;
                    const matchedProduct = matchedJO ? products.find((p: any) => Number(p.product_id) === Number(matchedJO.product_id)) : null;
                    const matchedReason = log.rejection_reason_id ? reasons.find((r: any) => Number(r.id) === Number(log.rejection_reason_id)) : null;

                    return {
                        id: log.id,
                        job_order_id: log.job_order_id,
                        job_order_no: matchedJO?.job_order_no || `JO-${log.job_order_id}`,
                        product_id: matchedJO?.product_id,
                        product_name: matchedProduct?.product_name || "Finished Good",
                        inspected_quantity: Number(log.inspected_quantity || 0),
                        passed_quantity: Number(log.passed_quantity || 0),
                        rejected_quantity: Number(log.rejected_quantity || 0),
                        rejection_reason_id: log.rejection_reason_id || null,
                        rejection_reason: matchedReason || null,
                        rejection_reason_name: matchedReason?.reason_name || null,
                        rejection_reason_code: matchedReason?.reason_code || null,
                        rework_job_order_id: log.rework_job_order_id || null,
                        rework_job_order_no: matchedReworkJO?.job_order_no || null,
                        inspected_by: log.inspected_by || null,
                        inspector_name: log.inspected_by ? `Inspector #${log.inspected_by}` : "QA Inspector",
                        inspected_at: log.inspected_at || new Date().toISOString(),
                        status: log.status || (Number(log.rejected_quantity) > 0 ? "REWORK_TRIGGERED" : "PASSED"),
                        remarks: log.remarks || ""
                    };
                });

                return NextResponse.json(enrichedLogs);
            } catch (err) {
                console.error("Error loading inspection logs:", err);
                return NextResponse.json([]);
            }
        }

        // Action 3: Fetch Status History (from manufacturing_job_order_status_history)
        if (action === "status-history") {
            const jobOrderId = searchParams.get("jobOrderId");
            let url = `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?limit=-1&sort=-history_id`;
            if (jobOrderId) {
                url += `&filter[job_order_id][_eq]=${Number(jobOrderId)}`;
            }

            try {
                const res = await fetch(url, { headers, cache: "no-store" });
                if (res.ok) {
                    const data = (await res.json()).data || [];
                    return NextResponse.json(data);
                }
            } catch (err) {
                console.error("Error fetching status history:", err);
            }
            return NextResponse.json([]);
        }

        // Action: Fetch QA templates and parameters
        if (action === "templates") {
            const [templatesRes, parametersRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/quality_inspection_templates?limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters?limit=-1`, { headers, cache: "no-store" })
            ]);

            if (!templatesRes.ok || !parametersRes.ok) {
                throw new Error("Failed to fetch templates/parameters from Directus");
            }

            const templates = (await templatesRes.json()).data || [];
            const parameters = (await parametersRes.json()).data || [];

            const templatesWithParams = templates.map((tpl: any) => ({
                ...tpl,
                parameters: parameters.filter((param: any) => param.template_id === tpl.template_id)
            }));

            return NextResponse.json(templatesWithParams);
        }

        // Action: Fetch supervisor dispositions
        if (action === "dispositions") {
            const list = readDispositions();
            return NextResponse.json(list);
        }

        // Action: Match dynamic checklist template for a specific task and product
        if (action === "matching-template") {
            const taskName = searchParams.get("taskName") || "";
            const productId = searchParams.get("productId") || "";

            const [templatesRes, parametersRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/quality_inspection_templates?limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters?limit=-1`, { headers, cache: "no-store" })
            ]);

            if (!templatesRes.ok || !parametersRes.ok) {
                throw new Error("Failed to fetch templates/parameters from Directus");
            }

            const templates = (await templatesRes.json()).data || [];
            const parameters = (await parametersRes.json()).data || [];

            let matchedTpl = templates.find((tpl: any) => 
                tpl.is_active && 
                taskName.toLowerCase().includes(tpl.template_name.toLowerCase())
            );

            if (!matchedTpl) {
                matchedTpl = templates.find((tpl: any) => tpl.is_active);
            }

            if (!matchedTpl) {
                return NextResponse.json({ template: null, parameters: [] });
            }

            const tplParams = parameters.filter((param: any) => param.template_id === matchedTpl.template_id);
            return NextResponse.json({
                template: matchedTpl,
                parameters: tplParams
            });
        }

        return NextResponse.json({ error: "Invalid action parameter" }, { status: 400 });
    } catch (e) {
        console.error("API Error in QA GET:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to process QA request" }, { status: 500 });
    }
}

// POST handler
export async function POST(request: Request) {
    try {
        const todayStr = await getTodayDateString();
        const body = await request.json();
        const { action } = body;

        // Action: Simplified 2-Point QA Entry & Rework Trigger
        if (action === "two-point-inspection" || action === "2-point-inspection") {
            const {
                jobOrderId,
                jobOrderNo,
                inspectedQuantity,
                passedQuantity,
                rejectedQuantity,
                rejectionReasonId,
                lotNumber,
                manufacturingDate,
                expiryDate,
                unitCost = 0,
                remarks = "",
                userId = 1
            } = body;

            // 1. Validation of required quantities
            const inspQty = Number(inspectedQuantity);
            const passQty = Number(passedQuantity);
            const rejQty = Number(rejectedQuantity);

            if (isNaN(inspQty) || inspQty <= 0) {
                return NextResponse.json({ error: "Inspected quantity must be a positive number." }, { status: 400 });
            }
            if (isNaN(passQty) || passQty < 0) {
                return NextResponse.json({ error: "Passed quantity cannot be negative." }, { status: 400 });
            }
            if (isNaN(rejQty) || rejQty < 0) {
                return NextResponse.json({ error: "Rejected quantity cannot be negative." }, { status: 400 });
            }
            if (Math.abs((passQty + rejQty) - inspQty) > 0.001) {
                return NextResponse.json({ 
                    error: `Quantity mismatch: Passed (${passQty}) + Rejected (${rejQty}) must equal Inspected (${inspQty}).` 
                }, { status: 400 });
            }

            // Mandatory rejection reason validation if defects exist
            if (rejQty > 0 && !rejectionReasonId) {
                return NextResponse.json({ 
                    error: "Rejection reason is mandatory when rejected quantity is greater than 0." 
                }, { status: 400 });
            }

            // 2. Resolve Job Order details from Directus
            let joQuery = "";
            if (jobOrderId) {
                joQuery = `filter[job_order_id][_eq]=${Number(jobOrderId)}`;
            } else if (jobOrderNo) {
                joQuery = `filter[job_order_no][_eq]=${encodeURIComponent(jobOrderNo)}`;
            } else {
                return NextResponse.json({ error: "Missing jobOrderId or jobOrderNo" }, { status: 400 });
            }

            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?${joQuery}&limit=1`, { headers, cache: "no-store" });
            if (!joRes.ok) {
                return NextResponse.json({ error: "Failed to query Job Order from database" }, { status: 500 });
            }
            const joList = (await joRes.json()).data || [];
            if (joList.length === 0) {
                return NextResponse.json({ error: `Job Order not found.` }, { status: 404 });
            }

            const parentJO = joList[0];
            const parentJoIdInt = Number(parentJO.job_order_id);
            const parentJoNo = String(parentJO.job_order_no);
            const productId = Number(parentJO.product_id);
            const branchId = Number(parentJO.branch_id || body.branchId || 1);
            const versionId = parentJO.version_id ? Number(parentJO.version_id) : null;
            const finalLotNo = lotNumber || `MFG-${parentJoNo}`;
            const finalExpDate = expiryDate || await getTodayDateString(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
            const finalMfgDate = manufacturingDate || todayStr;

            // Fetch rejection reason details if present
            let reasonObj: any = null;
            if (rejectionReasonId) {
                try {
                    const rRes = await fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons/${rejectionReasonId}`, { headers, cache: "no-store" });
                    if (rRes.ok) {
                        reasonObj = (await rRes.json()).data;
                    }
                } catch (rErr) {
                    console.warn("Could not fetch rejection reason details:", rErr);
                }
            }
            const reasonName = reasonObj?.reason_name || (rejectionReasonId ? `Reason #${rejectionReasonId}` : "");

            let spawnedReworkJo: any = null;
            let reworkJoIdInt: number | null = null;

            // 3. Auto-spawn Standalone Rework Job Order if rejected_quantity > 0
            if (rejQty > 0) {
                // Find existing rework orders for this parent to determine suffix sequence
                let reworkSequence = 1;
                try {
                    const existingReworksRes = await fetch(
                        `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[parent_job_order_id][_eq]=${parentJoIdInt}&fields=job_order_id,job_order_no&limit=-1`,
                        { headers, cache: "no-store" }
                    );
                    if (existingReworksRes.ok) {
                        const existingList = (await existingReworksRes.json()).data || [];
                        reworkSequence = existingList.length + 1;
                    }
                } catch (seqErr) {
                    console.warn("Error checking existing reworks sequence:", seqErr);
                }

                const reworkSuffix = String(reworkSequence).padStart(2, "0");
                const reworkJoNo = `JO-RWK-${parentJoNo}-${reworkSuffix}`;

                console.log(`[QA Rework Spawner] Spawning standalone rework Job Order: ${reworkJoNo} for target quantity ${rejQty}`);

                try {
                    // Create rework Job Order with parent_job_order_id link and exploded routings
                    const reworkPayload = {
                        jo_id: reworkJoNo,
                        product_id: productId,
                        quantity: rejQty,
                        target_quantity: rejQty,
                        due_date: parentJO.end_date || null,
                        status: "Released",
                        branch_id: branchId,
                        created_by: userId,
                        parent_job_order_id: parentJoIdInt,
                        shift_option: parentJO.shift_option || "8",
                        remarks: `Standalone Rework Job Order spawned from QA Inspection of ${parentJoNo}. Rejection reason: ${reasonName}. Remarks: ${remarks || "None"}`,
                        bom: versionId ? { version_id: versionId } : null
                    };

                    const reworkResult = await createJobOrder(reworkPayload, []);
                    
                    // Lookup the spawned rework JO integer ID
                    const lookupRework = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(reworkJoNo)}&limit=1`, { headers });
                    if (lookupRework.ok) {
                        const rData = (await lookupRework.json()).data?.[0];
                        if (rData) {
                            reworkJoIdInt = Number(rData.job_order_id);
                            spawnedReworkJo = {
                                job_order_id: reworkJoIdInt,
                                job_order_no: reworkJoNo,
                                target_quantity: rejQty,
                                status: "Released"
                            };
                        }
                    }
                } catch (reworkErr: any) {
                    console.error("[QA Rework Spawner] Error auto-spawning rework JO:", reworkErr);
                    // If full creation failed, create base record directly
                    try {
                        const fallbackReworkRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders`, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                job_order_no: `JO-RWK-${parentJoNo}-${reworkSuffix}`,
                                parent_job_order_id: parentJoIdInt,
                                product_id: productId,
                                version_id: versionId,
                                target_quantity: rejQty,
                                actual_quantity_produced: 0,
                                completed_quantity: 0,
                                rejected_quantity: 0,
                                start_date: todayStr,
                                status: "Released",
                                branch_id: branchId,
                                created_by: userId,
                                created_at: new Date().toISOString(),
                                remarks: `Standalone Rework Job Order spawned from QA Inspection of ${parentJoNo}. Rejection: ${reasonName}`
                            })
                        });
                        if (fallbackReworkRes.ok) {
                            const createdFallback = (await fallbackReworkRes.json()).data;
                            reworkJoIdInt = Number(createdFallback.job_order_id);
                            spawnedReworkJo = {
                                job_order_id: reworkJoIdInt,
                                job_order_no: createdFallback.job_order_no,
                                target_quantity: rejQty,
                                status: "Released"
                            };
                        }
                    } catch (fbErr) {
                        console.error("Fallback rework creation failed:", fbErr);
                    }
                }
            }

            // 4. Insert Inspection Record into qa_jo_inspection_logs
            const inspectionLogPayload = {
                job_order_id: parentJoIdInt,
                inspected_quantity: inspQty,
                passed_quantity: passQty,
                rejected_quantity: rejQty,
                rejection_reason_id: rejQty > 0 ? Number(rejectionReasonId) : null,
                rework_job_order_id: reworkJoIdInt,
                inspected_by: userId ? Number(userId) : 1,
                inspected_at: new Date().toISOString(),
                status: rejQty === 0 ? "PASSED" : "REWORK_TRIGGERED",
                remarks: remarks || (rejQty === 0 ? "100% Passed QA Inspection" : `Rework required: ${rejQty} units due to ${reasonName}`)
            };

            let createdLog: any = null;
            try {
                const logRes = await fetch(`${DIRECTUS_URL}/items/qa_jo_inspection_logs`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(inspectionLogPayload)
                });
                if (logRes.ok) {
                    createdLog = (await logRes.json()).data;
                } else {
                    console.error("Failed to insert into qa_jo_inspection_logs:", await logRes.text());
                }
            } catch (logErr) {
                console.error("Error creating qa_jo_inspection_logs entry:", logErr);
            }

            // 5. Update Parent Job Order status and completed/rejected quantities
            const oldStatus = parentJO.status || "In Progress";
            const newStatus = "COMPLETED"; // Transitions to COMPLETED on QA inspection signoff

            const newCompletedQty = (Number(parentJO.completed_quantity) || 0) + passQty;
            const newProducedQty = (Number(parentJO.actual_quantity_produced) || 0) + passQty;
            const newRejectedQty = (Number(parentJO.rejected_quantity) || 0) + rejQty;

            try {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${parentJoIdInt}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        status: newStatus,
                        completed_quantity: newCompletedQty,
                        actual_quantity_produced: newProducedQty,
                        rejected_quantity: newRejectedQty,
                        modified_at: new Date().toISOString()
                    })
                });
            } catch (joPatchErr) {
                console.error("Error updating Job Order status:", joPatchErr);
            }

            // 6. Insert audit trail into manufacturing_job_order_status_history
            try {
                const statusHistoryPayload = {
                    job_order_id: parentJoIdInt,
                    old_status: oldStatus,
                    new_status: newStatus,
                    changed_by: userId ? Number(userId) : 1,
                    changed_at: new Date().toISOString(),
                    remarks: rejQty === 0
                        ? `QA Inspection Completed: 100% Passed (${passQty} units). Transitioned status to COMPLETED.`
                        : `QA Inspection Completed: ${passQty} Passed, ${rejQty} Rejected (${reasonName}). Spawned Rework Job Order ${spawnedReworkJo?.job_order_no || 'JO-RWK'}.`
                };
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_status_history`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(statusHistoryPayload)
                });
            } catch (shErr) {
                console.error("Error logging status history:", shErr);
            }

            // 7. Positive Finished Goods Inventory Movement (if passed_quantity > 0)
            let createdMovement: any = null;
            if (passQty > 0) {
                try {
                    const finishedLotId = await resolveMasterLotId(finalLotNo, 2); // 2 = Finished Goods
                    const movementPayload = {
                        product_id: productId,
                        lot_id: finishedLotId,
                        branch_id: branchId,
                        transaction_type_id: 2, // Job Order Finished Goods Receipt
                        source_document_id: parentJoIdInt,
                        source_document_no: parentJoNo,
                        version_id: versionId,
                        batch_no: finalLotNo,
                        expiry_date: finalExpDate,
                        manufacturing_date: finalMfgDate,
                        quantity: passQty,
                        created_by: userId || 24,
                        remarks: `Positive finished goods receipt from QA Inspection of Job Order ${parentJoNo}`
                    };

                    const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(movementPayload)
                    });

                    if (movRes.ok) {
                        createdMovement = (await movRes.json()).data;
                    } else {
                        console.error("Error writing inventory_movements record:", await movRes.text());
                    }

                    // Also post to product_ledger for warehouse consistency
                    await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            branchId: branchId,
                            productId: productId,
                            quantity: passQty,
                            documentType: "Job Order Receipt",
                            documentNo: parentJoNo,
                            documentDescription: `QA Passed Yield: ${finalLotNo}`,
                            documentDate: todayStr
                        })
                    }).catch(err => console.error("Error writing product_ledger entry:", err));

                } catch (movErr) {
                    console.error("Error processing finished goods movement:", movErr);
                }
            }

            return NextResponse.json({
                success: true,
                message: rejQty === 0 
                    ? `QA Inspection 100% Passed. Job Order ${parentJoNo} is marked COMPLETED with ${passQty} units released to inventory.`
                    : `QA Inspection logged: ${passQty} units passed to inventory, ${rejQty} units rejected. Standalone Rework Job Order ${spawnedReworkJo?.job_order_no || 'JO-RWK'} spawned successfully.`,
                inspectionLog: createdLog || inspectionLogPayload,
                jobOrderStatus: newStatus,
                reworkJobOrder: spawnedReworkJo,
                inventoryMovement: createdMovement
            });
        }

        // Action: Verify a QA routing step checklist
        if (action === "verify") {
            const {
                joId,
                taskId,
                taskName,
                productName,
                expectedQty,
                actualQty,
                verifications,
                comments,
                userId
            } = body;

            if (!joId || !taskId) {
                return NextResponse.json({ error: "Missing joId or taskId" }, { status: 400 });
            }

            const joInfo = await getJobOrderIdByNo(joId);
            if (!joInfo) {
                return NextResponse.json({ error: `Job Order not found: ${joId}` }, { status: 404 });
            }
            const joIdInt = joInfo.id;
            const hasCriticalFailure = verifications?.some((v: any) => v.is_failed && v.is_critical);

            if (hasCriticalFailure) {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "On Hold" })
                });

                const dispositions = readDispositions();
                const newDisp = {
                    id: `DISP-${Date.now()}`,
                    jo_id: joId,
                    task_id: taskId,
                    task_name: taskName || "Unknown Task",
                    product_name: productName || "Unknown Product",
                    expected_quantity: expectedQty,
                    actual_quantity: actualQty,
                    failed_parameters: verifications.filter((v: any) => v.is_failed),
                    disposition_status: "Pending",
                    decision: null,
                    supervisor_comments: "",
                    recorded_at: new Date().toISOString(),
                    resolved_at: null,
                    resolved_by: null
                };
                dispositions.push(newDisp);
                writeDispositions(dispositions);

                return NextResponse.json({
                    success: false,
                    onHold: true,
                    message: "Critical parameter failure detected. Job Order has been placed ON HOLD.",
                    disposition: newDisp
                });
            } else {
                return NextResponse.json({
                    success: true,
                    onHold: false,
                    message: "All quality checks completed successfully."
                });
            }
        }

        // Action: Resolve a supervisor disposition override
        if (action === "disposition") {
            const { dispositionId, decision, supervisorComments, userId } = body;
            if (!dispositionId || !decision) {
                return NextResponse.json({ error: "Missing dispositionId or decision" }, { status: 400 });
            }

            const dispositions = readDispositions();
            const dispIdx = dispositions.findIndex((d: any) => d.id === dispositionId);
            if (dispIdx === -1) {
                return NextResponse.json({ error: "Disposition record not found" }, { status: 404 });
            }

            const disp = dispositions[dispIdx];
            const joInfo = await getJobOrderIdByNo(disp.jo_id);
            if (!joInfo) {
                return NextResponse.json({ error: `Job Order not found: ${disp.jo_id}` }, { status: 404 });
            }
            const joIdInt = joInfo.id;

            const targetStatus = decision === "Scrap" ? "Cancelled" : "In Progress";
            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status: targetStatus })
            });

            disp.disposition_status = "Resolved";
            disp.decision = decision;
            disp.supervisor_comments = supervisorComments || "";
            disp.resolved_at = new Date().toISOString();
            disp.resolved_by = userId || null;

            dispositions[dispIdx] = disp;
            writeDispositions(dispositions);

            return NextResponse.json({
                success: true,
                message: `Disposition resolved successfully as ${decision}.`
            });
        }

        return NextResponse.json({ error: "Invalid action parameter" }, { status: 400 });
    } catch (e) {
        console.error("API Error in QA POST:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to save QA action" }, { status: 500 });
    }
}
