/* eslint-disable */
import { NextResponse } from "next/server";
import { readDispositions, resolveDispositionMetadata, writeDispositions } from "@/app/api/manufacturing/qa/_dispositions";
import { deriveDailyQAOutcome } from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";

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

        // Use the same precedence as the Daily QA queue: failures take priority over
        // incomplete audits, and only fully released passing audits become Passed.
        const outcome = deriveDailyQAOutcome(
            inspections,
            routes.map((route: any) => route.jo_route_id)
        );
        const finalLedgerStatus = outcome.status;

        if (outcome.hasFailure) {
            // 1. Update the Job Order status to "On Hold" and fail the request if
            // the authoritative state could not be persisted.
            const holdResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status: "On Hold" })
            });
            if (!holdResponse.ok) {
                throw new Error(`Failed to place Job Order ${jobOrderId} on QA Hold.`);
            }

            // 2. Alert the supervisor disposition dashboard with authoritative
            // product, operation, and station metadata.
            const dispositions = readDispositions();
            const failedInps = inspections.filter((ins: any) =>
                deriveDailyQAOutcome([ins], []).status === "QA Hold"
            );

            for (const ins of failedInps) {
                const routeId = Number(ins.jo_route_id || 0) || null;
                const metadata = await resolveDispositionMetadata(Number(jobOrderId), routeId);
                const matchingPayloadEntry = inspectionsList.find((p: any) => Number(p.joRouteId) === Number(routeId));
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
                        test_name: String(ins.sensory_status || "").trim().toLowerCase() === "failed"
                            ? "Sensory Inspection"
                            : "Lab Test Check",
                        value: ins.remarks || "Out of Spec",
                        is_failed: true,
                        is_critical: true
                    });
                }

                const newDisp = {
                    id: `DISP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    job_order_id: metadata.job_order_id || Number(jobOrderId),
                    jo_id: metadata.jo_id,
                    product_id: metadata.product_id,
                    task_id: metadata.task_id || routeId,
                    task_name: metadata.task_name,
                    station_id: metadata.station_id,
                    station_name: metadata.station_name,
                    product_name: metadata.product_name,
                    expected_quantity: metadata.expected_quantity,
                    actual_quantity: metadata.expected_quantity,
                    failed_parameters: failedParams,
                    disposition_status: "Pending",
                    decision: null,
                    supervisor_comments: "",
                    inspection_remarks: String(ins.remarks || ""),
                    recorded_at: new Date().toISOString(),
                    resolved_at: null,
                    resolved_by: null
                };

                const existingIndex = dispositions.findIndex((disp: any) =>
                    disp.disposition_status === "Pending"
                    && Number(disp.job_order_id || 0) === Number(newDisp.job_order_id)
                    && Number(disp.task_id || 0) === Number(newDisp.task_id || 0)
                );
                if (existingIndex >= 0) {
                    dispositions[existingIndex] = {
                        ...dispositions[existingIndex],
                        ...newDisp,
                        id: dispositions[existingIndex].id
                    };
                } else {
                    dispositions.push(newDisp);
                }
            }

            writeDispositions(dispositions);
        }

        // Sync QA disposition back to yield ledger (only "Passed" if all steps have been QA'd)
        const ledgerPatchResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${ledgerId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ qa_status: finalLedgerStatus })
        });
        if (!ledgerPatchResponse.ok) {
            throw new Error(`Failed to persist Daily QA status for yield ledger ${ledgerId}.`);
        }

        // Sync inventory lot status as well - removed since inventory_lots is deprecated

        return NextResponse.json({ success: true, message: "Daily yield QA inspection logged successfully." });
    } catch (e) {
        console.error("Error in daily-qa POST API:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to log inspection" }, { status: 500 });
    }
}
