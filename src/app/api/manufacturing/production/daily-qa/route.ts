/* eslint-disable */
import { NextResponse } from "next/server";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";
import {
    createDisposition,
    findPendingDisposition,
    resolveDispositionMetadata,
    updateDisposition
} from "@/app/api/manufacturing/qa/_dispositions";
import { deriveDailyQAOutcome } from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";
import { hasPagination, paginate } from "../../_pagination";
import { JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";
import { loadEligibleFinishedGoodsLot, MmLotError } from "../../services/mm-lots.service";

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

class DailyQAValidationError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string
    ) {
        super(message);
        this.name = "DailyQAValidationError";
    }
}

interface DailyQAOutputMetadata {
    mmLotId: number;
    batchNo: string;
    manufacturingDate: string;
    expiryDate: string;
}

function textValue(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizeDate(value: unknown, label: string): string {
    const date = textValue(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new DailyQAValidationError(422, "INVALID_OUTPUT_DATE", `${label} must use YYYY-MM-DD format.`);
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new DailyQAValidationError(422, "INVALID_OUTPUT_DATE", `${label} is not a valid calendar date.`);
    }
    return date;
}

function normalizeOutputMetadata(value: unknown, required: boolean): DailyQAOutputMetadata | null {
    if (value === null || value === undefined || value === "") {
        if (required) {
            throw new DailyQAValidationError(422, "OUTPUT_TRACEABILITY_REQUIRED", "Storage lot, output batch, manufacturing date, and expiry date are required for positive output.");
        }
        return null;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new DailyQAValidationError(422, "OUTPUT_TRACEABILITY_INVALID", "Finished-goods output traceability must be an object.");
    }

    const record = value as Record<string, unknown>;
    const mmLotId = relationId(record.mmLotId ?? record.mm_lot_id, ["mmLotId", "mm_lot_id", "lot_id", "id"]);
    const batchNo = textValue(record.batchNo ?? record.batch_no ?? record.lotNumber ?? record.lot_number);
    if (!mmLotId) {
        throw new DailyQAValidationError(422, "OUTPUT_LOT_REQUIRED", "Select an active finished-goods storage lot before saving the audit.");
    }
    if (!batchNo) {
        throw new DailyQAValidationError(422, "OUTPUT_BATCH_REQUIRED", "Enter the finished-goods output batch or lot number before saving the audit.");
    }
    if (batchNo.length > 100) {
        throw new DailyQAValidationError(422, "OUTPUT_BATCH_TOO_LONG", "The finished-goods output batch or lot number cannot exceed 100 characters.");
    }

    const manufacturingDate = normalizeDate(record.manufacturingDate ?? record.manufacturing_date, "Manufacturing date");
    const expiryDate = normalizeDate(record.expiryDate ?? record.expiry_date, "Expiry date");
    if (expiryDate < manufacturingDate) {
        throw new DailyQAValidationError(422, "INVALID_OUTPUT_DATE_RANGE", "Expiry date cannot be earlier than the manufacturing date.");
    }

    return { mmLotId, batchNo, manufacturingDate, expiryDate };
}

async function readDirectusRecord(path: string, label: string): Promise<Record<string, any>> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new DailyQAValidationError(502, "DIRECTUS_LOOKUP_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
    const payload = await response.json().catch(() => null);
    if (!payload?.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
        throw new DailyQAValidationError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an invalid response.`);
    }
    return payload.data as Record<string, any>;
}

async function patchDirectusRecord(path: string, body: Record<string, unknown>, label: string): Promise<void> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new DailyQAValidationError(502, "DIRECTUS_WRITE_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
}

function metadataMatches(current: Record<string, any>, requested: DailyQAOutputMetadata): boolean {
    return relationId(current.mm_lot_id, ["mm_lot_id", "lot_id", "id"]) === requested.mmLotId
        && textValue(current.lot_number || current.batch_no) === requested.batchNo
        && textValue(current.manufacturing_date).slice(0, 10) === requested.manufacturingDate
        && textValue(current.expiry_date).slice(0, 10) === requested.expiryDate;
}

async function persistOutputTraceability(
    ledgerId: number,
    jobOrderId: number,
    ledger: Record<string, any>,
    metadata: DailyQAOutputMetadata | null
): Promise<void> {
    if (!metadata) return;

    const hasExistingMetadata = Boolean(
        relationId(ledger.mm_lot_id, ["mm_lot_id", "lot_id", "id"])
        || textValue(ledger.lot_number || ledger.batch_no)
        || textValue(ledger.manufacturing_date)
        || textValue(ledger.expiry_date)
    );
    if (hasExistingMetadata && !metadataMatches(ledger, metadata)) {
        throw new DailyQAValidationError(409, "OUTPUT_TRACEABILITY_CONFLICT", "This yield ledger already has different finished-goods traceability values.");
    }

    if (!metadataMatches(ledger, metadata)) {
        await patchDirectusRecord(
            `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
            {
                mm_lot_id: metadata.mmLotId,
                lot_number: metadata.batchNo,
                manufacturing_date: metadata.manufacturingDate,
                expiry_date: metadata.expiryDate
            },
            `Save output traceability for yield ledger ${ledgerId}`
        );
    }

    const sessionKey = textValue(ledger.session_key);
    if (!sessionKey) return;

    const genealogyResponse = await fetch(
        `${DIRECTUS_URL}/items/jo_material_genealogy?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrderId))}&filter[session_key][_eq]=${encodeURIComponent(sessionKey)}&fields=genealogy_id,batch_no&limit=-1`,
        { headers, cache: "no-store" }
    );
    const genealogyRows = await readDirectusRows(genealogyResponse, "Production genealogy lookup");
    for (const row of genealogyRows) {
        const genealogyId = relationId(row.genealogy_id ?? row.id, ["genealogy_id", "id"]);
        if (!genealogyId || textValue(row.batch_no) === metadata.batchNo) continue;
        await patchDirectusRecord(
            `/items/jo_material_genealogy/${encodeURIComponent(String(genealogyId))}`,
            { batch_no: metadata.batchNo },
            `Save output batch for genealogy ${genealogyId}`
        );
    }
}

function validateSubmittedQARoutes(
    jobOrderId: number,
    routeRows: any[],
    submittedInspections: any[]
): void {
    const submittedRouteIds = new Set<number>();

    for (const entry of submittedInspections) {
        const rawRouteId = entry?.joRouteId;
        if (rawRouteId === undefined || rawRouteId === null || rawRouteId === "") continue;

        const routeId = relationId(rawRouteId, ["joRouteId", "jo_route_id", "id"]);
        if (!routeId) {
            throw new DailyQAValidationError(422, "INVALID_ROUTE_REFERENCE", "Every QA audit must reference a valid routing step.");
        }
        submittedRouteIds.add(routeId);
    }

    if (submittedRouteIds.size === 0) return;

    const routesById = new Map<number, Record<string, any>>(
        routeRows.map((route: Record<string, any>) => [
            relationId(route.jo_route_id, ["jo_route_id", "id"]),
            route
        ])
    );
    for (const routeId of submittedRouteIds) {
        const route = routesById.get(routeId);
        const routeJobOrderId = relationId(route?.job_order_id, ["job_order_id", "id"]);
        if (!route || routeJobOrderId !== jobOrderId) {
            throw new DailyQAValidationError(422, "INSPECTION_ROUTE_MISMATCH", "The QA audit references a routing step from a different Job Order.");
        }
    }
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
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.qualityAssurance);
    if (accessDenied) return accessDenied;
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
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.qualityAssurance);
    if (accessDenied) return accessDenied;
    try {
        const body = await request.json();
        const isEnvelope = Boolean(body && !Array.isArray(body) && Array.isArray(body.inspections));
        const inspectionsList = isEnvelope ? body.inspections : (Array.isArray(body) ? body : [body]);

        if (inspectionsList.length === 0) {
            return NextResponse.json({ error: "No inspection data provided" }, { status: 400 });
        }

        const firstEntry = inspectionsList[0] || {};
        const jobOrderId = Number(isEnvelope ? body.jobOrderId : firstEntry.jobOrderId);
        const ledgerId = Number(isEnvelope ? body.ledgerId : firstEntry.ledgerId);

        if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0 || !Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
            return NextResponse.json({ error: "Missing required fields: jobOrderId, ledgerId" }, { status: 400 });
        }

        const ledger = await readDirectusRecord(
            `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}?fields=ledger_id,job_order_id,session_key,yield_quantity,lot_number,mm_lot_id,manufacturing_date,expiry_date`,
            `Load yield ledger ${ledgerId}`
        );
        const ledgerJobOrderId = relationId(ledger.job_order_id, ["job_order_id", "id"]);
        if (ledgerJobOrderId !== jobOrderId) {
            throw new DailyQAValidationError(409, "LEDGER_JOB_ORDER_MISMATCH", "The selected yield ledger does not belong to this Job Order.");
        }

        const jobOrder = await readDirectusRecord(
            `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}?fields=job_order_id,product_id,branch_id`,
            `Load Job Order ${jobOrderId}`
        );
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const branchId = relationId(jobOrder.branch_id, ["branch_id", "id"]);
        const goodOutputQuantity = Number(ledger.yield_quantity || 0);
        if (goodOutputQuantity > 0 && (!productId || !branchId)) {
            throw new DailyQAValidationError(409, "OUTPUT_TRACEABILITY_CONTEXT_MISSING", "The Job Order is missing its finished-good product or branch, so output traceability cannot be saved.");
        }
        const outputMetadata = goodOutputQuantity > 0
            ? normalizeOutputMetadata(isEnvelope ? body.outputMetadata : null, true)
            : null;

        if (outputMetadata) {
            try {
                await loadEligibleFinishedGoodsLot({
                    mmLotId: outputMetadata.mmLotId,
                    branchId,
                    productId
                });
            } catch (error) {
                if (error instanceof MmLotError) {
                    throw new DailyQAValidationError(error.status, error.code, error.message);
                }
                throw error;
            }
            await persistOutputTraceability(ledgerId, jobOrderId, ledger, outputMetadata);
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

            if (Number(entry.jobOrderId || jobOrderId) !== jobOrderId || Number(entry.ledgerId || ledgerId) !== ledgerId) {
                throw new DailyQAValidationError(422, "INSPECTION_REFERENCE_MISMATCH", "Every inspection must reference the selected Job Order and yield ledger.");
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
        const routesRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,status,completed_at,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers, cache: "no-store" });
        if (!routesRes.ok) {
            throw new DailyQAValidationError(502, "ROUTE_LOOKUP_FAILED", `Job Order routing lookup failed with HTTP ${routesRes.status}.`);
        }
        const routesPayload = await routesRes.json().catch(() => null);
        if (!Array.isArray(routesPayload?.data)) {
            throw new DailyQAValidationError(502, "ROUTE_LOOKUP_INVALID", "Job Order routing lookup returned an invalid response.");
        }
        const routes = routesPayload.data;

        // Fetch all daily QA inspections for this ledgerId
        const inspectionsFetch = await fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?filter[ledger_id][_eq]=${ledgerId}`, { headers, cache: "no-store" });
        if (!inspectionsFetch.ok) {
            throw new DailyQAValidationError(502, "INSPECTION_LOOKUP_FAILED", `Daily QA inspection lookup failed with HTTP ${inspectionsFetch.status}.`);
        }
        const inspectionsPayload = await inspectionsFetch.json().catch(() => null);
        if (!Array.isArray(inspectionsPayload?.data)) {
            throw new DailyQAValidationError(502, "INSPECTION_LOOKUP_INVALID", "Daily QA inspection lookup returned an invalid response.");
        }
        const inspections = inspectionsPayload.data;

        // Use the same precedence as the Daily QA queue: failures take priority over
        // incomplete audits, and only fully released passing audits become Passed.
        const outcome = deriveDailyQAOutcome(
            inspections,
            routes.map((route: any) => route.jo_route_id)
        );
        const finalLedgerStatus = outcome.status;

        validateSubmittedQARoutes(
            jobOrderId,
            routes,
            inspectionsList
        );

        if (outcome.hasFailure) {
            // 1. Update the Job Order status to "On Hold" and fail the request if
            // the authoritative state could not be persisted.
            const holdResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status: JOB_ORDER_STATUS.ON_HOLD })
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

        return NextResponse.json({
            success: true,
            message: "Daily yield QA inspection logged successfully.",
            outputMetadata
        });
    } catch (e) {
        console.error("Error in daily-qa POST API:", e);
        if (e instanceof DailyQAValidationError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        return NextResponse.json({ error: (e as Error).message || "Failed to log inspection" }, { status: 500 });
    }
}
