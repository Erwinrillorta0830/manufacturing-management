/* eslint-disable */
import { NextResponse } from "next/server";
import {
    createDisposition,
    findPendingDisposition,
    resolveDispositionMetadata,
    updateDisposition
} from "@/app/api/manufacturing/qa/_dispositions";
import { deriveDailyQAOutcome } from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";
import { hasPagination, paginate } from "../../_pagination";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

function relationId(value: unknown, keys: string[] = ["id"]): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const candidate = Number(record[key] ?? 0);
            if (Number.isSafeInteger(candidate) && candidate > 0) return candidate;
        }
        return 0;
    }
    const candidate = Number(value ?? 0);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

async function readDirectusRows(response: Response, label: string): Promise<any[]> {
    if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.data)) {
        throw new Error(`${label} returned an invalid response`);
    }
    return payload.data;
}

async function fetchDailyQAQueue(searchParams: URLSearchParams): Promise<any[]> {
    const [yieldResponse, inspectionsResponse, jobOrdersResponse, routesResponse, productsResponse] = await Promise.all([
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&sort=-logged_at`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?limit=-1&sort=-inspected_at`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,sequence_order,operation_id,work_center_id`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code`, { headers, cache: "no-store" })
    ]);

    const [yieldRows, inspectionRows, jobOrderRows, routeRows, productRows] = await Promise.all([
        readDirectusRows(yieldResponse, "Daily yield ledger lookup"),
        readDirectusRows(inspectionsResponse, "Daily QA inspection lookup"),
        readDirectusRows(jobOrdersResponse, "Daily QA Job Order lookup"),
        readDirectusRows(routesResponse, "Daily QA routing lookup"),
        readDirectusRows(productsResponse, "Daily QA product lookup")
    ]);

    const jobsById = new Map<number, any>(jobOrderRows.map((job: any) => [
        relationId(job.job_order_id, ["job_order_id", "id"]),
        job
    ]));
    const productsById = new Map<number, any>(productRows.map((product: any) => [
        relationId(product.product_id, ["product_id", "id"]),
        product
    ]));
    const inspectionsByLedger = new Map<number, any[]>();
    inspectionRows.forEach((inspection: any) => {
        const ledgerId = relationId(inspection.ledger_id, ["ledger_id", "id"]);
        if (!ledgerId) return;
        const existing = inspectionsByLedger.get(ledgerId) || [];
        existing.push(inspection);
        inspectionsByLedger.set(ledgerId, existing);
    });
    const routesByJobOrder = new Map<number, any[]>();
    routeRows.forEach((route: any) => {
        const jobOrderId = relationId(route.job_order_id, ["job_order_id", "id"]);
        if (!jobOrderId) return;
        const existing = routesByJobOrder.get(jobOrderId) || [];
        existing.push(route);
        routesByJobOrder.set(jobOrderId, existing);
    });

    const rows = yieldRows.map((yieldRow: any) => {
        const ledgerId = relationId(yieldRow.ledger_id, ["ledger_id", "id"]);
        const jobOrderId = relationId(yieldRow.job_order_id, ["job_order_id", "id"]);
        const jobOrder = jobsById.get(jobOrderId);
        const productId = relationId(jobOrder?.product_id, ["product_id", "id"]);
        const product = productsById.get(productId);
        const audits = inspectionsByLedger.get(ledgerId) || [];
        const routes = (routesByJobOrder.get(jobOrderId) || [])
            .slice()
            .sort((left, right) => Number(left.sequence_order || 0) - Number(right.sequence_order || 0));
        const outcome = deriveDailyQAOutcome(
            audits,
            routes.map((route: any) => relationId(route.jo_route_id, ["jo_route_id", "id"]))
        );

        return {
            ...yieldRow,
            id: ledgerId || yieldRow.id,
            ledger_id: ledgerId || yieldRow.id,
            job_order_id: jobOrderId,
            job_order_no: jobOrder?.job_order_no || `JO-${jobOrderId}`,
            product_id: productId,
            product_name: product?.product_name || `Product #${productId}`,
            product_code: product?.product_code || "",
            branch_id: relationId(jobOrder?.branch_id, ["branch_id", "id"]) || null,
            target_quantity: Number(jobOrder?.target_quantity ?? jobOrder?.quantity ?? 0),
            quantity: Number(jobOrder?.target_quantity ?? jobOrder?.quantity ?? 0),
            process_qa_status: outcome.status,
            audits
        };
    });

    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const status = (searchParams.get("status") || "").trim().toLowerCase();
    return rows.filter((row: any) => {
        const haystack = `${row.job_order_no} ${row.product_name} ${row.product_code} ${row.shift_name || ""} ${row.lot_number || ""}`.toLowerCase();
        return (!search || haystack.includes(search))
            && (!status || String(row.process_qa_status || row.qa_status || "").toLowerCase() === status);
    });
}

// GET: Retrieves all daily yield QA inspections
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");

        if (searchParams.get("view") === "queue") {
            return NextResponse.json(paginate(await fetchDailyQAQueue(searchParams), searchParams));
        }
        
        let url = `${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?limit=-1&sort=-inspected_at`;
        if (joId) {
            url += `&filter[job_order_id][_eq]=${joId}`;
        }

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to fetch daily QA inspections");
        }
        const json = await res.json();
        const rows = json.data || [];
        if (searchParams.get("view") !== "queue" && !hasPagination(searchParams)) {
            return NextResponse.json(rows);
        }

        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const status = (searchParams.get("status") || "").trim().toLowerCase();
        const filtered = rows.filter((row: any) => {
            const haystack = `${row.job_order_no || ""} ${row.shift_name || ""} ${row.lot_number || ""} ${row.remarks || ""}`.toLowerCase();
            return (!search || haystack.includes(search)) && (!status || String(row.qa_status || "").toLowerCase() === status);
        });
        return NextResponse.json(paginate(filtered, searchParams));
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

                const existingDisposition = await findPendingDisposition(
                    Number(newDisp.job_order_id),
                    Number(newDisp.task_id || 0) || null
                );
                if (existingDisposition?.id) {
                    const { id: _existingId, ...updatePayload } = newDisp;
                    await updateDisposition(String(existingDisposition.id), {
                        ...updatePayload
                    });
                } else {
                    await createDisposition(newDisp);
                }
            }
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
