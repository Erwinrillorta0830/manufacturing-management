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
import { AuthenticatedActorError, requireManufacturingActorId } from "../_authenticated-actor";
import {
    loadEligibleFinishedGoodsLot,
    MmLotError,
    resolveOrCreateMmInventoryLot
} from "../../services/mm-lots.service";
import { formatPhtDateTime } from "@/app/api/manufacturing/directus-api";
import {
    rejectedOutputLedgerPatch,
    shouldRegisterRejectedOutput,
    type RejectedOutputMetadata
} from "@/modules/manufacturing-management/manufacturing-qa/rejected-output";
import { isCommittedYieldLedger } from "../_qa-accepted-output";
import { parseQAOutputQuantity, qaOutputAllocationMatchesLoggedTotal, type QAOutputAllocation } from "@/modules/manufacturing-management/manufacturing-qa/qa-output-allocation";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";
const DAILY_QA_SAVE_TIMEOUT_MS = 120_000;

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

function normalizeQAOutputAllocation(body: Record<string, any>, ledger: Record<string, any>): QAOutputAllocation {
    const acceptedQuantity = parseQAOutputQuantity(
        body?.acceptedQuantity ?? ledger.qa_accepted_quantity ?? ledger.yield_quantity ?? 0
    );
    const rejectedQuantity = parseQAOutputQuantity(
        body?.rejectedQuantity ?? ledger.qa_rejected_quantity ?? ledger.rejected_quantity ?? 0
    );
    if (acceptedQuantity === null || rejectedQuantity === null) {
        throw new DailyQAValidationError(422, "INVALID_QA_OUTPUT_QUANTITY", "Accepted and rejected quantities must be nonnegative numbers with no more than six decimal places.");
    }
    if (!qaOutputAllocationMatchesLoggedTotal(
        { acceptedQuantity, rejectedQuantity },
        ledger.yield_quantity ?? 0,
        ledger.rejected_quantity ?? 0
    )) {
        throw new DailyQAValidationError(422, "QA_OUTPUT_TOTAL_MISMATCH", "Accepted and rejected quantities must add up to the total output recorded by the operator.");
    }
    return { acceptedQuantity, rejectedQuantity };
}

async function persistQAOutputAllocation(
    ledgerId: number,
    ledger: Record<string, any>,
    allocation: QAOutputAllocation,
    signal?: AbortSignal
): Promise<void> {
    const savedAcceptedQuantity = ledger.qa_accepted_quantity === null || ledger.qa_accepted_quantity === undefined
        ? null
        : parseQAOutputQuantity(ledger.qa_accepted_quantity);
    const savedRejectedQuantity = ledger.qa_rejected_quantity === null || ledger.qa_rejected_quantity === undefined
        ? null
        : parseQAOutputQuantity(ledger.qa_rejected_quantity);
    const currentAcceptedQuantity = savedAcceptedQuantity ?? parseQAOutputQuantity(ledger.yield_quantity ?? 0) ?? 0;
    const currentRejectedQuantity = savedRejectedQuantity ?? parseQAOutputQuantity(ledger.rejected_quantity ?? 0) ?? 0;
    const isVerified = textValue(ledger.qa_status).toUpperCase() === "PASSED";

    if (isVerified && (
        currentAcceptedQuantity !== allocation.acceptedQuantity
        || currentRejectedQuantity !== allocation.rejectedQuantity
    )) {
        throw new DailyQAValidationError(409, "QA_OUTPUT_ALLOCATION_LOCKED", "QA-approved output quantities cannot be changed after the audit is authorized.");
    }

    if (savedAcceptedQuantity === allocation.acceptedQuantity && savedRejectedQuantity === allocation.rejectedQuantity) return;
    await patchDirectusRecord(
        `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
        {
            qa_accepted_quantity: allocation.acceptedQuantity,
            qa_rejected_quantity: allocation.rejectedQuantity
        },
        `Save QA output quantities for yield ledger ${ledgerId}`,
        signal
    );
}

async function readDirectusRecord(path: string, label: string, signal?: AbortSignal): Promise<Record<string, any>> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store", signal });
    if (!response.ok) {
        throw new DailyQAValidationError(502, "DIRECTUS_LOOKUP_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
    const payload = await response.json().catch(() => null);
    if (!payload?.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
        throw new DailyQAValidationError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an invalid response.`);
    }
    return payload.data as Record<string, any>;
}

async function patchDirectusRecord(path: string, body: Record<string, unknown>, label: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
        signal
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

function rejectedMetadataMatches(current: Record<string, any>, requested: RejectedOutputMetadata): boolean {
    return relationId(current.rejected_mm_lot_id, ["mm_lot_id", "lot_id", "id"]) === requested.mmLotId
        && textValue(current.rejected_lot_number) === requested.batchNo
        && textValue(current.rejected_manufacturing_date).slice(0, 10) === requested.manufacturingDate
        && textValue(current.rejected_expiry_date).slice(0, 10) === requested.expiryDate
        && ["DAMAGED", "QUARANTINED"].includes(textValue(current.rejected_inventory_condition).toUpperCase());
}

async function persistOutputTraceability(
    ledgerId: number,
    jobOrderId: number,
    ledger: Record<string, any>,
    metadata: DailyQAOutputMetadata | null,
    signal?: AbortSignal
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
            `Save output traceability for yield ledger ${ledgerId}`,
            signal
        );
    }

    const sessionKey = textValue(ledger.session_key);
    if (!sessionKey) return;

    const genealogyResponse = await fetch(
        `${DIRECTUS_URL}/items/jo_material_genealogy?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrderId))}&filter[session_key][_eq]=${encodeURIComponent(sessionKey)}&fields=genealogy_id,batch_no&limit=-1`,
        { headers, cache: "no-store", signal }
    );
    const genealogyRows = await readDirectusRows(genealogyResponse, "Production genealogy lookup");
    for (const row of genealogyRows) {
        const genealogyId = relationId(row.genealogy_id ?? row.id, ["genealogy_id", "id"]);
        if (!genealogyId || textValue(row.batch_no) === metadata.batchNo) continue;
        await patchDirectusRecord(
            `/items/jo_material_genealogy/${encodeURIComponent(String(genealogyId))}`,
            { batch_no: metadata.batchNo },
            `Save output batch for genealogy ${genealogyId}`,
            signal
        );
    }
}

async function persistRejectedOutputTraceability(
    ledgerId: number,
    ledger: Record<string, any>,
    metadata: RejectedOutputMetadata,
    signal?: AbortSignal
): Promise<void> {
    assertRejectedOutputTraceability(ledger, metadata);

    if (!rejectedMetadataMatches(ledger, metadata)) {
        await patchDirectusRecord(
            `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
            rejectedOutputLedgerPatch(metadata),
            `Save rejected-output traceability for yield ledger ${ledgerId}`,
            signal
        );
    }
}

function assertRejectedOutputTraceability(
    ledger: Record<string, any>,
    metadata: RejectedOutputMetadata
): void {
    const hasExistingMetadata = Boolean(
        relationId(ledger.rejected_mm_lot_id, ["mm_lot_id", "lot_id", "id"])
        || textValue(ledger.rejected_lot_number)
        || textValue(ledger.rejected_manufacturing_date)
        || textValue(ledger.rejected_expiry_date)
    );
    if (hasExistingMetadata && !rejectedMetadataMatches(ledger, metadata)) {
        throw new DailyQAValidationError(409, "REJECTED_OUTPUT_TRACEABILITY_CONFLICT", "This yield ledger already has different rejected-output traceability values.");
    }
}

function enabled(value: unknown): boolean {
    return value === true || value === 1 || ["1", "true", "yes"].includes(textValue(value).toLowerCase());
}

async function validateRejectedOutputLot(
    productionBranchId: number,
    productId: number,
    metadata: RejectedOutputMetadata,
    signal?: AbortSignal
): Promise<number> {
    const productionBranch = await readDirectusRecord(
        `/items/branches/${encodeURIComponent(String(productionBranchId))}?fields=id,bad_stock_branch_id`,
        `Load production branch ${productionBranchId}`,
        signal
    );
    const badStockBranchId = relationId(productionBranch.bad_stock_branch_id, ["id", "branch_id"]);
    if (!badStockBranchId) {
        throw new DailyQAValidationError(409, "BAD_STOCK_BRANCH_NOT_CONFIGURED", "No bad-stock branch is configured for this Job Order branch.");
    }

    const badStockBranch = await readDirectusRecord(
        `/items/branches/${encodeURIComponent(String(badStockBranchId))}?fields=id,isActive,isBadStock`,
        `Load bad-stock branch ${badStockBranchId}`,
        signal
    );
    if (!enabled(badStockBranch.isActive) || !enabled(badStockBranch.isBadStock)) {
        throw new DailyQAValidationError(409, "BAD_STOCK_BRANCH_INVALID", "The configured bad-stock branch must be active and marked as a bad-stock branch.");
    }

    try {
        await loadEligibleFinishedGoodsLot({
            mmLotId: metadata.mmLotId,
            branchId: badStockBranchId,
            productId,
            signal
        });
    } catch (error) {
        if (error instanceof MmLotError) {
            throw new DailyQAValidationError(error.status, error.code, error.message);
        }
        throw error;
    }

    return badStockBranchId;
}

async function resolveRejectedInventoryLot(input: {
    ledgerId: number;
    jobOrderNo: string;
    branchId: number;
    productId: number;
    metadata: RejectedOutputMetadata;
    createdBy: number;
    signal?: AbortSignal;
}): Promise<void> {
    try {
        const inventoryLot = await resolveOrCreateMmInventoryLot({
            mmLotId: input.metadata.mmLotId,
            branchId: input.branchId,
            productId: input.productId,
            batchNo: input.metadata.batchNo,
            manufacturingDate: input.metadata.manufacturingDate,
            expiryDate: input.metadata.expiryDate,
            qaStatus: "DAMAGED",
            sourceType: "JOB_ORDER_REJECTED_YIELD",
            sourceReference: input.jobOrderNo,
            remarks: `Rejected yield from Job Order ${input.jobOrderNo}; ledger ${input.ledgerId}`,
            createdBy: input.createdBy,
            signal: input.signal
        });
        if (!Number(inventoryLot.inventory_lot_id)) {
            throw new MmLotError("The rejected-output inventory lot could not be verified after creation.", 503, "MM_INVENTORY_LOT_WRITE_FAILED");
        }
        if (!["DAMAGED", "QUARANTINED", "EXPIRED"].includes(textValue(inventoryLot.qa_status).toUpperCase())) {
            throw new DailyQAValidationError(409, "REJECTED_LOT_STATUS_CONFLICT", "The selected rejected-output batch already exists with a GOOD inventory condition.");
        }
    } catch (error) {
        if (error instanceof DailyQAValidationError) throw error;
        if (error instanceof MmLotError) {
            throw new DailyQAValidationError(error.status, error.code, error.message);
        }
        throw error;
    }
}

async function registerRejectedOutputOnly(body: Record<string, any>, signal: AbortSignal) {
    const jobOrderId = Number(body.jobOrderId || 0);
    const ledgerId = Number(body.ledgerId || 0);
    if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0 || !Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
        throw new DailyQAValidationError(400, "INVALID_OUTPUT_REFERENCE", "A valid Job Order and yield-ledger reference are required.");
    }

    const ledger = await readDirectusRecord(
        `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}?fields=ledger_id,job_order_id,yield_quantity,rejected_quantity,qa_accepted_quantity,qa_rejected_quantity,qa_status,rejected_mm_lot_id,rejected_lot_number,rejected_manufacturing_date,rejected_expiry_date,rejected_inventory_condition`,
        `Load yield ledger ${ledgerId}`,
        signal
    );
    if (relationId(ledger.job_order_id, ["job_order_id", "id"]) !== jobOrderId) {
        throw new DailyQAValidationError(409, "LEDGER_JOB_ORDER_MISMATCH", "The selected yield ledger does not belong to this Job Order.");
    }
    const allocation = normalizeQAOutputAllocation(body, ledger);
    const rejectedQuantity = allocation.rejectedQuantity;
    if (!(rejectedQuantity > 0)) {
        throw new DailyQAValidationError(409, "REJECTED_OUTPUT_NOT_PRESENT", "This yield ledger has no rejected quantity to allocate.");
    }
    const metadata = normalizeOutputMetadata(body.rejectedOutputMetadata, true) as RejectedOutputMetadata;
    const [jobOrder, routes, inspections] = await Promise.all([
        readDirectusRecord(
            `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}?fields=job_order_id,job_order_no,product_id,branch_id`,
            `Load Job Order ${jobOrderId}`,
            signal
        ),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrderId))}&fields=jo_route_id`, { headers, cache: "no-store", signal })
            .then((response) => readDirectusRows(response, "Job Order routing lookup")),
        fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?filter[ledger_id][_eq]=${encodeURIComponent(String(ledgerId))}`, { headers, cache: "no-store", signal })
            .then((response) => readDirectusRows(response, "Daily QA inspection lookup"))
    ]);
    const outcome = deriveDailyQAOutcome(inspections, routes.map((route: any) => route.jo_route_id));
    if (!outcome.isComplete) {
        throw new DailyQAValidationError(409, "REJECTED_OUTPUT_AUDIT_INCOMPLETE", "Rejected output can be registered only after all required QA audit steps are complete.");
    }

    const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
    const productionBranchId = relationId(jobOrder.branch_id, ["branch_id", "id"]);
    if (!productId || !productionBranchId) {
        throw new DailyQAValidationError(409, "OUTPUT_TRACEABILITY_CONTEXT_MISSING", "The Job Order is missing its finished-good product or branch.");
    }
    const badStockBranchId = await validateRejectedOutputLot(productionBranchId, productId, metadata, signal);
    let actorId: number;
    try {
        actorId = await requireManufacturingActorId(signal);
    } catch (error) {
        if (error instanceof AuthenticatedActorError) {
            throw new DailyQAValidationError(error.status, error.code, error.message);
        }
        throw error;
    }

    assertRejectedOutputTraceability(ledger, metadata);
    await persistQAOutputAllocation(ledgerId, ledger, allocation, signal);
    await resolveRejectedInventoryLot({
        ledgerId,
        jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${jobOrderId}`,
        branchId: badStockBranchId,
        productId,
        metadata,
        createdBy: actorId,
        signal
    });
    await persistRejectedOutputTraceability(ledgerId, ledger, metadata, signal);

    return NextResponse.json({
        success: true,
        message: "Rejected output was registered in the configured bad-stock branch.",
        rejectedOutputMetadata: metadata
    });
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
    const committedYieldRows = yieldRows.filter(isCommittedYieldLedger);

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

    const rows = committedYieldRows.map((yieldRow: any) => {
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
    const startedAt = Date.now();
    const saveSignal = AbortSignal.timeout(DAILY_QA_SAVE_TIMEOUT_MS);
    let jobOrderIdForLog = 0;
    let ledgerIdForLog = 0;
    let operationForLog = "authorize QA access";
    try {
        const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.qualityAssurance, saveSignal);
        if (saveSignal.aborted) throw saveSignal.reason;
        if (accessDenied) return accessDenied;

        operationForLog = "read request body";
        const body = await request.json();
        if (body?.action === "registerRejectedOutput") {
            jobOrderIdForLog = Number(body.jobOrderId) || 0;
            ledgerIdForLog = Number(body.ledgerId) || 0;
            operationForLog = "register rejected output";
            return await registerRejectedOutputOnly(body, saveSignal);
        }

        const isEnvelope = Boolean(body && !Array.isArray(body) && Array.isArray(body.inspections));
        const inspectionsList = isEnvelope ? body.inspections : (Array.isArray(body) ? body : [body]);

        if (inspectionsList.length === 0) {
            return NextResponse.json({ error: "No inspection data provided" }, { status: 400 });
        }

        const firstEntry = inspectionsList[0] || {};
        const jobOrderId = Number(isEnvelope ? body.jobOrderId : firstEntry.jobOrderId);
        const ledgerId = Number(isEnvelope ? body.ledgerId : firstEntry.ledgerId);
        jobOrderIdForLog = jobOrderId;
        ledgerIdForLog = ledgerId;

        if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0 || !Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
            return NextResponse.json({ error: "Missing required fields: jobOrderId, ledgerId" }, { status: 400 });
        }

        operationForLog = `load yield ledger ${ledgerId}`;
        const ledger = await readDirectusRecord(
            `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}?fields=ledger_id,job_order_id,session_key,yield_quantity,rejected_quantity,qa_accepted_quantity,qa_rejected_quantity,qa_status,lot_number,mm_lot_id,manufacturing_date,expiry_date,rejected_mm_lot_id,rejected_lot_number,rejected_manufacturing_date,rejected_expiry_date,rejected_inventory_condition`,
            `Load yield ledger ${ledgerId}`,
            saveSignal
        );
        const ledgerJobOrderId = relationId(ledger.job_order_id, ["job_order_id", "id"]);
        if (ledgerJobOrderId !== jobOrderId) {
            throw new DailyQAValidationError(409, "LEDGER_JOB_ORDER_MISMATCH", "The selected yield ledger does not belong to this Job Order.");
        }

        operationForLog = `load Job Order ${jobOrderId}`;
        const jobOrder = await readDirectusRecord(
            `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}?fields=job_order_id,job_order_no,product_id,branch_id`,
            `Load Job Order ${jobOrderId}`,
            saveSignal
        );
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const branchId = relationId(jobOrder.branch_id, ["branch_id", "id"]);
        const outputAllocation = normalizeQAOutputAllocation(isEnvelope ? body : {}, ledger);
        const goodOutputQuantity = outputAllocation.acceptedQuantity;
        const rejectedOutputQuantity = outputAllocation.rejectedQuantity;
        if ((goodOutputQuantity > 0 || rejectedOutputQuantity > 0) && (!productId || !branchId)) {
            throw new DailyQAValidationError(409, "OUTPUT_TRACEABILITY_CONTEXT_MISSING", "The Job Order is missing its finished-good product or branch, so output traceability cannot be saved.");
        }
        const outputMetadata = goodOutputQuantity > 0
            ? normalizeOutputMetadata(isEnvelope ? body.outputMetadata : null, true)
            : null;
        const rejectedOutputMetadata = rejectedOutputQuantity > 0 && isEnvelope && body.rejectedOutputMetadata !== null && body.rejectedOutputMetadata !== undefined
            ? normalizeOutputMetadata(body.rejectedOutputMetadata, true) as RejectedOutputMetadata
            : null;

        let badStockBranchId: number | null = null;
        if (rejectedOutputMetadata) {
            operationForLog = "validate rejected-output storage lot";
            badStockBranchId = await validateRejectedOutputLot(branchId, productId, rejectedOutputMetadata, saveSignal);
            assertRejectedOutputTraceability(ledger, rejectedOutputMetadata);
        }

        if (outputMetadata) {
            operationForLog = "validate finished-goods storage lot";
            try {
                await loadEligibleFinishedGoodsLot({
                    mmLotId: outputMetadata.mmLotId,
                    branchId,
                    productId,
                    signal: saveSignal
                });
            } catch (error) {
                if (error instanceof MmLotError) {
                    throw new DailyQAValidationError(error.status, error.code, error.message);
                }
                throw error;
            }
        }

        let authenticatedInspectorId: number;
        try {
            authenticatedInspectorId = await requireManufacturingActorId(saveSignal);
        } catch (error) {
            if (error instanceof AuthenticatedActorError) {
                throw new DailyQAValidationError(error.status, error.code, error.message);
            }
            throw error;
        }
        const inventoryLotCreatedBy = goodOutputQuantity > 0 || rejectedOutputMetadata
            ? authenticatedInspectorId
            : null;
        if (inspectionsList.some((entry: any) =>
            Number(entry.jobOrderId || jobOrderId) !== jobOrderId
            || Number(entry.ledgerId || ledgerId) !== ledgerId
        )) {
            throw new DailyQAValidationError(422, "INSPECTION_REFERENCE_MISMATCH", "Every inspection must reference the selected Job Order and yield ledger.");
        }

        operationForLog = "load routing and saved QA rows";
        const routesRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,status,completed_at,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers, cache: "no-store", signal: saveSignal });
        if (!routesRes.ok) {
            throw new DailyQAValidationError(502, "ROUTE_LOOKUP_FAILED", `Job Order routing lookup failed with HTTP ${routesRes.status}.`);
        }
        const routesPayload = await routesRes.json().catch(() => null);
        if (!Array.isArray(routesPayload?.data)) {
            throw new DailyQAValidationError(502, "ROUTE_LOOKUP_INVALID", "Job Order routing lookup returned an invalid response.");
        }
        const routes = routesPayload.data;
        validateSubmittedQARoutes(jobOrderId, routes, inspectionsList);

        const existingInspectionsResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?filter[ledger_id][_eq]=${ledgerId}&limit=-1&fields=ledger_id,jo_route_id`,
            { headers, cache: "no-store", signal: saveSignal }
        );
        const existingInspections = await readDirectusRows(existingInspectionsResponse, "Existing daily QA inspection lookup");
        const savedRouteIds = new Set(existingInspections
            .map((inspection: any) => relationId(inspection.jo_route_id, ["jo_route_id", "id"]))
            .filter((id: number) => id > 0));
        let hasSavedGeneralInspection = existingInspections.some((inspection: any) => !relationId(inspection.jo_route_id, ["jo_route_id", "id"]));

        const submittedRouteIds = [...new Set(inspectionsList
            .map((entry: any) => relationId(entry?.joRouteId, ["joRouteId", "jo_route_id", "id"]))
            .filter((id: number) => id > 0))];
        const savedParameterKeys = new Set<string>();
        if (submittedRouteIds.length > 0 && inspectionsList.some((entry: any) => Array.isArray(entry?.qaParameters) && entry.qaParameters.length > 0)) {
            const parameterQuery = new URLSearchParams({
                "filter[job_order_id][_eq]": String(jobOrderId),
                "filter[jo_route_id][_in]": submittedRouteIds.join(","),
                limit: "-1",
                fields: "jo_route_id,parameter_id,remarks"
            });
            const savedParametersResponse = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?${parameterQuery.toString()}`,
                { headers, cache: "no-store", signal: saveSignal }
            );
            const savedParameters = await readDirectusRows(savedParametersResponse, "Existing daily QA parameter lookup");
            const parameterMarker = `Daily QA Audit | Yield Log ID: ${ledgerId} |`;
            for (const parameter of savedParameters) {
                if (!textValue(parameter.remarks).startsWith(parameterMarker)) continue;
                const routeId = relationId(parameter.jo_route_id, ["jo_route_id", "id"]);
                const parameterId = relationId(parameter.parameter_id, ["parameter_id", "id"]);
                if (routeId && parameterId) savedParameterKeys.add(`${routeId}:${parameterId}`);
            }
        }

        operationForLog = "save output allocation and traceability";
        await persistQAOutputAllocation(ledgerId, ledger, outputAllocation, saveSignal);

        if (outputMetadata) {
            await persistOutputTraceability(ledgerId, jobOrderId, ledger, outputMetadata, saveSignal);
        }

        const inspectionInstant = new Date();
        const timestamp = formatPhtDateTime(inspectionInstant);
        const timestampInstant = inspectionInstant.toISOString();

        operationForLog = "save QA parameters and route inspections";
        for (const entry of inspectionsList) {
            const { 
                joRouteId, 
                moisturePercentage, 
                acidityPh, 
                sensoryStatus, 
                weightCheckPassed, 
                labStatus, 
                actionTaken, 
                remarks, 
                qaParameters 
            } = entry;

            const payload = {
                job_order_id: Number(jobOrderId),
                jo_route_id: joRouteId ? Number(joRouteId) : null,
                ledger_id: Number(ledgerId),
                inspector_id: authenticatedInspectorId,
                moisture_percentage: moisturePercentage !== undefined && moisturePercentage !== "" ? Number(moisturePercentage) : null,
                acidity_ph: acidityPh !== undefined && acidityPh !== "" ? Number(acidityPh) : null,
                sensory_status: sensoryStatus || "Passed",
                weight_check_passed: weightCheckPassed ? 1 : 0,
                lab_status: labStatus || "Passed",
                action_taken: actionTaken || "Released",
                inspected_at: timestampInstant,
                remarks: remarks || ""
            };

            // Parameter rows use the yield-ledger marker to resume a partial save safely.
            if (qaParameters && qaParameters.length > 0 && joRouteId) {
                for (const param of qaParameters) {
                    const parameterKey = `${Number(joRouteId)}:${Number(param.parameter_id)}`;
                    if (savedParameterKeys.has(parameterKey)) continue;
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
                        inspected_by: authenticatedInspectorId,
                        inspected_at: timestamp,
                        remarks: `Daily QA Audit | Yield Log ID: ${ledgerId} | ${param.remarks || "Daily QA check"}`
                    };

                    const qaResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(qaPayload),
                        signal: saveSignal
                    });
                    if (!qaResponse.ok) {
                        throw new DailyQAValidationError(502, "QA_PARAMETER_WRITE_FAILED", `Failed to write QA parameter ${param.parameter_id} for route ${joRouteId}.`);
                    }
                    savedParameterKeys.add(parameterKey);
                }
            }

            const routeIdentifier = relationId(joRouteId, ["joRouteId", "jo_route_id", "id"]);
            if (routeIdentifier ? savedRouteIds.has(routeIdentifier) : hasSavedGeneralInspection) continue;

            const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: saveSignal
            });

            if (!res.ok) {
                throw new DailyQAValidationError(502, "INSPECTION_WRITE_FAILED", "Failed to write daily QA inspection record.");
            }
            if (routeIdentifier) savedRouteIds.add(routeIdentifier);
            else hasSavedGeneralInspection = true;
        }

        // Fetch all daily QA inspections for this ledgerId
        operationForLog = "recalculate QA outcome";
        const inspectionsFetch = await fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?filter[ledger_id][_eq]=${ledgerId}`, { headers, cache: "no-store", signal: saveSignal });
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
        let rejectedOutputRegistered = false;

        if (outcome.hasFailure) {
            operationForLog = "save QA hold and disposition";
            // 1. Update the Job Order status to "On Hold" and fail the request if
            // the authoritative state could not be persisted.
            const holdResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status: JOB_ORDER_STATUS.ON_HOLD }),
                signal: saveSignal
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
                const metadata = await resolveDispositionMetadata(Number(jobOrderId), routeId, saveSignal);
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
                    recorded_at: timestampInstant,
                    resolved_at: null,
                    resolved_by: null
                };

                const existingDisposition = await findPendingDisposition(
                    Number(newDisp.job_order_id),
                    Number(newDisp.task_id || 0) || null,
                    saveSignal
                );
                if (existingDisposition?.id) {
                    const { id: _existingId, ...updatePayload } = newDisp;
                    await updateDisposition(String(existingDisposition.id), {
                        ...updatePayload
                    }, saveSignal);
                } else {
                    await createDisposition(newDisp, saveSignal);
                }
            }
        }

        if (finalLedgerStatus === "Passed" && goodOutputQuantity > 0 && outputMetadata) {
            operationForLog = "register released finished-goods lot";
            if (!inventoryLotCreatedBy) {
                throw new DailyQAValidationError(401, "AUTHENTICATION_REQUIRED", "An authenticated user is required to register the audited finished-goods lot.");
            }

            try {
                const inventoryLot = await resolveOrCreateMmInventoryLot({
                    mmLotId: outputMetadata.mmLotId,
                    branchId,
                    productId,
                    batchNo: outputMetadata.batchNo,
                    manufacturingDate: outputMetadata.manufacturingDate,
                    expiryDate: outputMetadata.expiryDate,
                    qaStatus: "GOOD",
                    sourceType: "JOB_ORDER_YIELD",
                    sourceReference: textValue(jobOrder.job_order_no) || `JO-${jobOrderId}`,
                    remarks: `QA-released finished yield from Job Order ${textValue(jobOrder.job_order_no) || jobOrderId}`,
                    createdBy: inventoryLotCreatedBy,
                    signal: saveSignal
                });
                if (!Number(inventoryLot.inventory_lot_id)) {
                    throw new MmLotError("The finished-goods inventory lot could not be verified after creation.", 503, "MM_INVENTORY_LOT_WRITE_FAILED");
                }
            } catch (error) {
                if (error instanceof MmLotError) {
                    throw new DailyQAValidationError(error.status, error.code, error.message);
                }
                throw error;
            }
        }

        if (
            rejectedOutputMetadata
            && badStockBranchId
            && shouldRegisterRejectedOutput(rejectedOutputQuantity, outcome.isComplete)
        ) {
            operationForLog = "register rejected finished-goods lot";
            if (!inventoryLotCreatedBy) {
                throw new DailyQAValidationError(401, "AUTHENTICATION_REQUIRED", "An authenticated user is required to register rejected finished-goods output.");
            }
            assertRejectedOutputTraceability(ledger, rejectedOutputMetadata);
            await resolveRejectedInventoryLot({
                ledgerId,
                jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${jobOrderId}`,
                branchId: badStockBranchId,
                productId,
                metadata: rejectedOutputMetadata,
                createdBy: inventoryLotCreatedBy,
                signal: saveSignal
            });
            await persistRejectedOutputTraceability(ledgerId, ledger, rejectedOutputMetadata, saveSignal);
            rejectedOutputRegistered = true;
        }

        // Sync QA disposition back to yield ledger (only "Passed" if all steps have been QA'd)
        operationForLog = "save final yield ledger QA status";
        const ledgerPatchResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${ledgerId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ qa_status: finalLedgerStatus }),
            signal: saveSignal
        });
        if (!ledgerPatchResponse.ok) {
            throw new Error(`Failed to persist Daily QA status for yield ledger ${ledgerId}.`);
        }

        // The finished-yield inventory view resolves Passed yield rows through mm_inventory_lots.
        // The physical receipt and Job Order completion remain owned by yield closing.

        return NextResponse.json({
            success: true,
            message: "Daily yield QA inspection logged successfully.",
            outputMetadata,
            rejectedOutputRegistered
        });
    } catch (e) {
        console.error(`Daily QA POST failed during ${operationForLog} after ${Date.now() - startedAt}ms:`, e);
        if (saveSignal.aborted) {
            console.error(`Daily QA save timed out during ${operationForLog} after ${Date.now() - startedAt}ms for Job Order ${jobOrderIdForLog || "unknown"}, yield ledger ${ledgerIdForLog || "unknown"}.`);
            return NextResponse.json({
                error: "Saving the audit exceeded the time limit. The system will check which audit details were saved before allowing a retry.",
                code: "DAILY_QA_SAVE_TIMEOUT"
            }, { status: 504 });
        }
        if (e instanceof DailyQAValidationError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        return NextResponse.json({ error: (e as Error).message || "Failed to log inspection" }, { status: 500 });
    }
}
