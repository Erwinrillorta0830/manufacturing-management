/* eslint-disable */
import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

// GET: Retrieves all daily yield QA inspections
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");
        
        let url = `${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?limit=-1&sort=-inspected_at`;
        if (joId) {
            url += `&filter[job_order_id][_eq]=${joId}`;
        }

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to fetch daily QA inspections");
        }
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("Error fetching daily QA inspections:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch inspections" }, { status: 500 });
    }
}

// POST: Creates daily yield QA inspections (supports array for paper-based checklist batch entries)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const inspectionsList = Array.isArray(body) ? body : [body];

        if (inspectionsList.length === 0) {
            return NextResponse.json({ error: "No inspection data provided" }, { status: 400 });
        }

        const firstEntry = inspectionsList[0];
        const { jobOrderId, ledgerId } = firstEntry;

        if (!jobOrderId || !ledgerId) {
            return NextResponse.json({ error: "Missing required fields: jobOrderId, ledgerId" }, { status: 400 });
        }

        const timestamp = new Date().toISOString();

        for (const entry of inspectionsList) {
            const { 
                joRouteId, 
                inspectorId, 
                moisturePercentage, 
                acidityPh, 
                sensoryStatus, 
                weightCheckPassed, 
                labStatus, 
                actionTaken, 
                remarks, 
                qaParameters 
            } = entry;

            if (!inspectorId) {
                return NextResponse.json({ error: "Missing required field: inspectorId" }, { status: 400 });
            }

            const payload = {
                job_order_id: Number(jobOrderId),
                jo_route_id: joRouteId ? Number(joRouteId) : null,
                ledger_id: Number(ledgerId),
                inspector_id: Number(inspectorId),
                moisture_percentage: moisturePercentage !== undefined && moisturePercentage !== "" ? Number(moisturePercentage) : null,
                acidity_ph: acidityPh !== undefined && acidityPh !== "" ? Number(acidityPh) : null,
                sensory_status: sensoryStatus || "Passed",
                weight_check_passed: weightCheckPassed ? 1 : 0,
                lab_status: labStatus || "Passed",
                action_taken: actionTaken || "Released",
                inspected_at: timestamp,
                remarks: remarks || ""
            };

            const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error("Failed to write daily QA inspection record: " + await res.text());
            }

            // If qaParameters is provided, insert them into manufacturing_job_order_qa_records
            if (qaParameters && qaParameters.length > 0 && joRouteId) {
                for (const param of qaParameters) {
                    const valNumeric = param.value !== undefined && param.value !== "" ? Number(param.value) : null;
                    const valText = typeof param.value === "string" ? param.value : null;
                    const valBool = typeof param.value === "boolean" ? param.value : null;

                    const qaPayload = {
                        job_order_id: Number(jobOrderId),
                        jo_route_id: Number(joRouteId),
                        parameter_id: Number(param.parameter_id),
                        value_text: valText,
                        value_numeric: valNumeric,
                        value_boolean: valBool,
                        is_passed: !param.is_failed,
                        inspected_by: Number(inspectorId),
                        inspected_at: timestamp,
                        remarks: `Daily QA Audit | Yield Log ID: ${ledgerId} | ${param.remarks || "Daily QA check"}`
                    };

                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(qaPayload)
                    }).catch(err => console.error("Failed to insert QA record in Daily QA:", err));
                }
            }
        }

        // Fetch all routes (steps) for this Job Order
        const routesRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers, cache: "no-store" });
        const routes = routesRes.ok ? (await routesRes.json()).data || [] : [];

        // Fetch all daily QA inspections for this ledgerId
        const inspectionsFetch = await fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?filter[ledger_id][_eq]=${ledgerId}`, { headers, cache: "no-store" });
        const inspections = inspectionsFetch.ok ? (await inspectionsFetch.json()).data || [] : [];

        // Check if there are failed inspections or if all steps have been QA'd
        const hasFailedInspection = inspections.some((ins: any) => 
            ins.sensory_status === "Failed" || ins.lab_status === "Failed" || ins.action_taken === "Quarantined"
        );

        let finalLedgerStatus = "Pending";
        if (hasFailedInspection) {
            finalLedgerStatus = "QA Hold";
            
            // 1. Update the Job Order status to "On Hold"
            try {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "On Hold" })
                });
            } catch (joHoldErr) {
                console.error("Failed to patch Job Order to On Hold:", joHoldErr);
            }

            // 2. Alert supervisor disposition dashboard by creating a pending disposition entry
            try {
                const fs = require("fs");
                const path = require("path");
                const DISPOSITIONS_FILE = path.join(process.cwd(), "src/app/api/manufacturing/qa/dispositions.json");
                
                let dispositions = [];
                if (fs.existsSync(DISPOSITIONS_FILE)) {
                    dispositions = JSON.parse(fs.readFileSync(DISPOSITIONS_FILE, "utf-8") || "[]");
                }

                // Get Job Order details to resolve product name and target quantity
                let productName = "Unknown Product";
                let expectedQty = 0;
                let jobOrderNo = `JO-${jobOrderId}`;
                const joFetch = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, { headers, cache: "no-store" });
                if (joFetch.ok) {
                    const joData = (await joFetch.json()).data;
                    if (joData) {
                        productName = joData.product_name || productName;
                        expectedQty = Number(joData.target_quantity || 0);
                        jobOrderNo = joData.job_order_no || jobOrderNo;
                    }
                }

                // Filter failed inspections from this ledgerId
                const failedInps = inspections.filter((ins: any) => 
                    ins.sensory_status === "Failed" || ins.lab_status === "Failed" || ins.action_taken === "Quarantined"
                );

                for (const ins of failedInps) {
                    // Gather failed parameters from qaParameters in inspectionsList
                    const matchingPayloadEntry = inspectionsList.find((p: any) => Number(p.joRouteId) === Number(ins.jo_route_id));
                    const failedParams = (matchingPayloadEntry?.qaParameters || [])
                        .filter((p: any) => p.is_failed)
                        .map((p: any) => ({
                            parameter_id: p.parameter_id,
                            test_name: p.test_name || "Check",
                            value: p.value,
                            is_failed: true,
                            is_critical: true
                        }));

                    if (failedParams.length === 0) {
                        failedParams.push({
                            parameter_id: 999,
                            test_name: ins.sensory_status === "Failed" ? "Sensory Inspection" : "Lab Test Check",
                            value: ins.remarks || "Out of Spec",
                            is_failed: true,
                            is_critical: true
                        });
                    }

                    const newDisp = {
                        id: `DISP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        jo_id: jobOrderNo,
                        task_id: ins.jo_route_id,
                        task_name: ins.remarks ? ins.remarks.substring(0, 50) : "Daily Yield QA Check Failure",
                        product_name: productName,
                        expected_quantity: expectedQty,
                        actual_quantity: expectedQty,
                        failed_parameters: failedParams,
                        disposition_status: "Pending",
                        decision: null,
                        supervisor_comments: "",
                        recorded_at: new Date().toISOString(),
                        resolved_at: null,
                        resolved_by: null
                    };
                    dispositions.push(newDisp);
                }

                const dir = path.dirname(DISPOSITIONS_FILE);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(DISPOSITIONS_FILE, JSON.stringify(dispositions, null, 2));
            } catch (dispErr) {
                console.error("Failed to write supervisor quarantine disposition:", dispErr);
            }
        } else {
            const allStepsAudited = routes.length === 0 || routes.every((r: any) => {
                return inspections.some((ins: any) => Number(ins.jo_route_id) === Number(r.jo_route_id));
            });
            if (allStepsAudited) {
                finalLedgerStatus = "Passed";
            } else {
                finalLedgerStatus = "Pending"; // still pending other steps
            }
        }

        // Sync QA disposition back to yield ledger (only "Passed" if all steps have been QA'd)
        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${ledgerId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ qa_status: finalLedgerStatus })
        }).catch(err => console.error("Failed to patch yield ledger status:", err));

        // Sync inventory lot status as well - removed since inventory_lots is deprecated

        return NextResponse.json({ success: true, message: "Daily yield QA inspection logged successfully." });
    } catch (e) {
        console.error("Error in daily-qa POST API:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to log inspection" }, { status: 500 });
    }
}
