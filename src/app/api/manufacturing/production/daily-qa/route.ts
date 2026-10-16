/* eslint-disable */
import { NextResponse } from "next/server";
import {
    authorizeJobOrderModuleAccess,
    JOB_ORDER_MODULE_PATHS,
    JobOrderModuleAccessError,
    requireJobOrderModuleAccess
} from "@/app/api/manufacturing/job-orders/_module-access";
import {
    createDisposition,
    findPendingDisposition,
    resolveDispositionMetadata,
    updateDisposition
} from "@/app/api/manufacturing/qa/_dispositions";
import {
    dailyQAAuditStateError,
    deriveDailyQAOutcome,
    latestDailyQAAuditsByRoute
} from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";
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
    isRejectedOutputRegistered,
    shouldRegisterRejectedOutput,
    type RejectedOutputMetadata
} from "@/modules/manufacturing-management/manufacturing-qa/rejected-output";
import { isCommittedYieldLedger } from "../_qa-accepted-output";
import { qaRecordAfterRevocation, releasedYieldQuantityDelta, yieldAuditRowsAfterRevocation } from "../qa-release";
import {
    applyParentQuantityDeltaWhileLocked,
    ParentYieldQuantitySyncError,
    withJobOrderActualQuantityLock
} from "../_parent-yield-quantity-sync";
import {
    calculateQAOutputAllocationCapacity,
    parseQAOutputQuantity,
    qaOutputAllocationCapacityErrorMessage,
    qaOutputAllocationWithinCapacity,
    sumQAOutputQuantities,
    type QAOutputAllocation,
    type QAOutputAllocationCapacity
} from "@/modules/manufacturing-management/manufacturing-qa/qa-output-allocation";
import { buildQaStartPatch } from "../_qa-start-fields";
import {
    persistYieldEvidenceUploads,
    loadYieldEvidenceRows,
    validateYieldEvidenceUploads,
    YieldEvidencePersistenceError,
    type YieldEvidenceRow,
    type YieldEvidenceUpload
} from "../_yield-evidence";
import { yieldEvidenceRequirementsForLedger } from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/utils/yield-evidence";

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

interface DailyQAOutputAllocation extends DailyQAOutputMetadata {
    allocationId?: number | null;
    allocationKey: string;
    quantity: number;
    rejectionReasonId: number | null;
}

type DailyQAOutputType = "ACCEPTED" | "REJECTED";

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

function normalizeOutputAllocations(
    value: unknown,
    legacyMetadata: unknown,
    targetQuantity: number,
    outputType: DailyQAOutputType,
    ledgerId: number
): DailyQAOutputAllocation[] {
    if (targetQuantity === 0) return [];
    const sourceRows = Array.isArray(value) && value.length > 0
        ? value
        : legacyMetadata
            ? [{ ...legacyMetadata as Record<string, unknown>, quantity: targetQuantity, allocationKey: `legacy-${outputType.toLowerCase()}-${ledgerId}` }]
            : [];
    if (sourceRows.length === 0) {
        throw new DailyQAValidationError(422, "OUTPUT_ALLOCATION_REQUIRED", "At least one lot / batch allocation is required for positive output.");
    }

    const rows = sourceRows.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new DailyQAValidationError(422, "OUTPUT_ALLOCATION_INVALID", "Every lot / batch allocation must be an object.");
        }
        const record = item as Record<string, unknown>;
        const metadata = normalizeOutputMetadata(record, true) as DailyQAOutputMetadata;
        const quantity = parseQAOutputQuantity(record.quantity);
        if (quantity === null || quantity <= 0) {
            throw new DailyQAValidationError(422, "OUTPUT_ALLOCATION_QUANTITY_INVALID", `Enter a positive quantity for ${outputType.toLowerCase()} allocation ${index + 1}.`);
        }
        const allocationKey = textValue(record.allocationKey ?? record.allocation_key);
        if (!allocationKey || allocationKey.length > 100) {
            throw new DailyQAValidationError(422, "OUTPUT_ALLOCATION_KEY_INVALID", `Allocation ${index + 1} is missing a valid allocation key.`);
        }
        const rawReasonId = record.rejectionReasonId ?? record.rejection_reason_id;
        const rejectionReasonId = outputType === "REJECTED" ? relationId(rawReasonId, ["id"]) : null;
        if (outputType === "REJECTED" && !rejectionReasonId) {
            throw new DailyQAValidationError(422, "REJECTION_REASON_REQUIRED", `Select an active defect / rejection reason for rejected allocation ${index + 1}.`);
        }
        const allocationId = relationId(record.allocationId ?? record.allocation_id, ["allocation_id", "id"]) || null;
        return { ...metadata, allocationId, allocationKey, quantity, rejectionReasonId };
    });

    const lineTotal = sumQAOutputQuantities(...rows.map((row) => row.quantity));
    if (lineTotal !== targetQuantity) {
        const quantityLabel = outputType === "ACCEPTED" ? "good" : "rejected";
        throw new DailyQAValidationError(
            422,
            "OUTPUT_ALLOCATION_MISMATCH",
            `Batch allocation mismatch: Total line allocations (${lineTotal ?? 0}) must equal total audited ${quantityLabel} quantity (${targetQuantity}).`
        );
    }
    return rows;
}

async function validateActiveRejectionReasons(rows: DailyQAOutputAllocation[], signal?: AbortSignal): Promise<void> {
    const reasonIds = [...new Set(rows.map((row) => row.rejectionReasonId).filter((id): id is number => Boolean(id)))];
    if (reasonIds.length === 0) return;
    const response = await fetch(
        `${DIRECTUS_URL}/items/qa_rejection_reasons?filter[id][_in]=${reasonIds.join(",")}&fields=id,is_active&limit=-1`,
        { headers, cache: "no-store", signal }
    );
    const reasonRows = await readDirectusRows(response, "QA rejection reason lookup");
    const activeIds = new Set(reasonRows.filter((row) => enabled(row.is_active)).map((row) => relationId(row.id)));
    if (reasonIds.some((id) => !activeIds.has(id))) {
        throw new DailyQAValidationError(422, "REJECTION_REASON_INVALID", "Every rejected allocation must use an active QA rejection reason.");
    }
}

function normalizeQAOutputAllocation(body: Record<string, any>, ledger: Record<string, any>): QAOutputAllocation {
    const loggedRejectedQuantity = sumQAOutputQuantities(ledger.rejected_quantity, ledger.scrap_quantity);
    const acceptedQuantity = parseQAOutputQuantity(
        body?.acceptedQuantity ?? ledger.qa_accepted_quantity ?? ledger.yield_quantity ?? 0
    );
    const rejectedQuantity = parseQAOutputQuantity(
        body?.rejectedQuantity ?? ledger.qa_rejected_quantity ?? loggedRejectedQuantity ?? 0
    );
    if (acceptedQuantity === null || rejectedQuantity === null) {
        throw new DailyQAValidationError(422, "INVALID_QA_OUTPUT_QUANTITY", "Accepted and rejected quantities must be nonnegative numbers with no more than six decimal places.");
    }
    return { acceptedQuantity, rejectedQuantity };
}

function productUomValue(jobOrder: Record<string, any>): string {
    const unit = jobOrder.product_id?.unit_of_measurement;
    if (unit && typeof unit === "object") {
        return textValue(unit.unit_shortcut) || textValue(unit.unit_name) || "units";
    }
    return textValue(unit) || "units";
}

async function loadQAOutputAllocationCapacity(
    jobOrderId: number,
    ledgerId: number,
    signal?: AbortSignal
): Promise<QAOutputAllocationCapacity> {
    const query = new URLSearchParams({
        "filter[job_order_id][_eq]": String(jobOrderId),
        limit: "-1",
        fields: "ledger_id,commit_status,yield_quantity,rejected_quantity,scrap_quantity,qa_accepted_quantity,qa_rejected_quantity"
    });
    let rows: any[];
    try {
        const response = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?${query.toString()}`, {
            headers,
            cache: "no-store",
            signal
        });
        rows = await readDirectusRows(response, "Job Order production-capacity lookup");
    } catch (error) {
        throw new DailyQAValidationError(
            502,
            "QA_OUTPUT_CAPACITY_UNAVAILABLE",
            error instanceof Error ? error.message : "Job Order production capacity could not be verified."
        );
    }

    const capacity = calculateQAOutputAllocationCapacity(rows, ledgerId);
    if (!capacity) {
        throw new DailyQAValidationError(409, "QA_OUTPUT_CAPACITY_UNAVAILABLE", "Job Order production capacity could not be verified. Refresh the audit and try again.");
    }
    return capacity;
}

function validateQAOutputAllocationCapacity(
    allocation: QAOutputAllocation,
    capacity: QAOutputAllocationCapacity,
    jobOrder: Record<string, any>
): void {
    if (qaOutputAllocationWithinCapacity(allocation, capacity.maxAuditQuantity)) return;
    throw new DailyQAValidationError(
        422,
        "QA_OUTPUT_CAP_EXCEEDED",
        qaOutputAllocationCapacityErrorMessage(
            capacity.maxAuditQuantity,
            capacity.totalProducedQuantity,
            productUomValue(jobOrder)
        )
    );
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
    const currentRejectedQuantity = savedRejectedQuantity
        ?? sumQAOutputQuantities(ledger.rejected_quantity, ledger.scrap_quantity)
        ?? 0;
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

function parentQuantitySyncClient(jobOrderId: number, signal?: AbortSignal) {
    return {
        readCurrentQuantity: async () => {
            const jobOrder = await readDirectusRecord(
                `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}?fields=actual_quantity_produced`,
                `Read Job Order ${jobOrderId} released-good quantity`,
                signal
            );
            return jobOrder.actual_quantity_produced;
        },
        writeQuantity: async (quantity: number) => patchDirectusRecord(
            `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}`,
            { actual_quantity_produced: quantity },
            `Sync Job Order ${jobOrderId} released-good quantity`,
            signal
        )
    };
}

async function writeDirectusRecord(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown> | undefined,
    label: string,
    signal?: AbortSignal
): Promise<Record<string, any> | null> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal
    });
    if (!response.ok) {
        throw new DailyQAValidationError(502, "DIRECTUS_WRITE_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
    const payload = await response.json().catch(() => null);
    return payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data as Record<string, any>
        : null;
}

async function syncYieldOutputAllocations(
    ledgerId: number,
    jobOrderId: number,
    outputType: DailyQAOutputType,
    rows: DailyQAOutputAllocation[],
    signal?: AbortSignal
): Promise<DailyQAOutputAllocation[]> {
    const params = new URLSearchParams({
        "filter[ledger_id][_eq]": String(ledgerId),
        "filter[allocation_type][_eq]": outputType,
        fields: "allocation_id,ledger_id,allocation_type,allocation_key,quantity,mm_lot_id,batch_no,manufacturing_date,expiry_date,rejection_reason_id",
        limit: "-1"
    });
    const existingResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_allocations?${params.toString()}`, {
        headers,
        cache: "no-store",
        signal
    });
    const existingRows = await readDirectusRows(existingResponse, "Existing yield output allocation lookup");
    const existingByKey = new Map(existingRows.map((row) => [textValue(row.allocation_key), row]));
    const requestedKeys = new Set(rows.map((row) => row.allocationKey));
    const existingIds = existingRows.map((row) => relationId(row.allocation_id, ["allocation_id", "id"])).filter(Boolean);
    if (existingIds.length > 0) {
        const movementTypeId = outputType === "ACCEPTED"
            ? 2
            : await loadTransactionTypeId("QA Reject / Bad Order Receipt", signal);
        const movementQuery = new URLSearchParams({
            "filter[source_document_id][_eq]": String(jobOrderId),
            "filter[transaction_type_id][_eq]": String(movementTypeId),
            "filter[source_document_detail_id][_in]": existingIds.join(","),
            fields: "movement_id,source_document_detail_id",
            limit: "-1"
        });
        const movementResponse = await fetch(`${DIRECTUS_URL}/items/inventory_movements?${movementQuery.toString()}`, {
            headers,
            cache: "no-store",
            signal
        });
        const postedMovements = await readDirectusRows(movementResponse, "Posted output allocation movement lookup");
        if (postedMovements.length > 0) {
            if (rows.length !== existingRows.length || existingRows.some((existing) => {
                const requested = rows.find((row) => row.allocationKey === textValue(existing.allocation_key));
                return !requested
                    || Number(existing.quantity) !== requested.quantity
                    || relationId(existing.mm_lot_id, ["lot_id", "mm_lot_id", "id"]) !== requested.mmLotId
                    || textValue(existing.batch_no) !== requested.batchNo
                    || textValue(existing.manufacturing_date).slice(0, 10) !== requested.manufacturingDate
                    || textValue(existing.expiry_date).slice(0, 10) !== requested.expiryDate;
            })) {
                throw new DailyQAValidationError(409, "OUTPUT_ALLOCATION_ALREADY_POSTED", "Inventory has already been posted for these allocations. Their quantities, lots, batches, and dates cannot be changed.");
            }
        }
    }
    const savedRows: DailyQAOutputAllocation[] = [];

    for (const [sortOrder, row] of rows.entries()) {
        const existing = existingByKey.get(row.allocationKey);
        const existingId = existing ? relationId(existing.allocation_id, ["allocation_id", "id"]) : 0;
        if (row.allocationId && existingId !== row.allocationId) {
            throw new DailyQAValidationError(409, "OUTPUT_ALLOCATION_REFERENCE_MISMATCH", "The selected allocation no longer belongs to this yield record. Refresh the audit and try again.");
        }
        const body = {
            ledger_id: ledgerId,
            allocation_type: outputType,
            allocation_key: row.allocationKey,
            quantity: row.quantity,
            mm_lot_id: row.mmLotId,
            batch_no: row.batchNo,
            manufacturing_date: row.manufacturingDate,
            expiry_date: row.expiryDate,
            rejection_reason_id: row.rejectionReasonId,
            sort_order: sortOrder
        };
        if (existingId) {
            await patchDirectusRecord(
                `/items/manufacturing_job_order_yield_allocations/${encodeURIComponent(String(existingId))}`,
                body,
                `Update ${outputType.toLowerCase()} output allocation ${existingId}`,
                signal
            );
            savedRows.push({ ...row, allocationId: existingId });
        } else {
            const created = await writeDirectusRecord(
                "/items/manufacturing_job_order_yield_allocations",
                "POST",
                body,
                `Create ${outputType.toLowerCase()} output allocation`,
                signal
            );
            const allocationId = relationId(created?.allocation_id ?? created?.id, ["allocation_id", "id"]);
            if (!allocationId) {
                throw new DailyQAValidationError(502, "OUTPUT_ALLOCATION_WRITE_UNCONFIRMED", "Directus did not return the new output allocation reference.");
            }
            savedRows.push({ ...row, allocationId });
        }
    }

    for (const existing of existingRows) {
        const allocationKey = textValue(existing.allocation_key);
        if (requestedKeys.has(allocationKey)) continue;
        const allocationId = relationId(existing.allocation_id, ["allocation_id", "id"]);
        if (allocationId) {
            await writeDirectusRecord(
                `/items/manufacturing_job_order_yield_allocations/${encodeURIComponent(String(allocationId))}`,
                "DELETE",
                undefined,
                `Remove ${outputType.toLowerCase()} output allocation ${allocationId}`,
                signal
            );
        }
    }
    return savedRows;
}

async function loadTransactionTypeId(typeName: string, signal?: AbortSignal): Promise<number> {
    const query = new URLSearchParams({
        "filter[type_name][_eq]": typeName,
        fields: "transaction_type_id,type_name",
        limit: "1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/inventory_transaction_types?${query.toString()}`, {
        headers,
        cache: "no-store",
        signal
    });
    const rows = await readDirectusRows(response, `Inventory transaction type ${typeName} lookup`);
    const id = relationId(rows[0]?.transaction_type_id ?? rows[0]?.id, ["transaction_type_id", "id"]);
    if (!id) {
        throw new DailyQAValidationError(409, "INVENTORY_TRANSACTION_TYPE_MISSING", `The ${typeName} inventory transaction type is not configured.`);
    }
    return id;
}

async function postOutputAllocationMovement(input: {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    branchId: number;
    transactionTypeId: number;
    inventoryLotId: number;
    row: DailyQAOutputAllocation;
    createdBy: number;
    outputType: DailyQAOutputType;
    isFirstAcceptedRow?: boolean;
    originalBatchNo?: string | null;
    originalYieldQuantity?: number;
    signal?: AbortSignal;
}): Promise<void> {
    if (!input.row.allocationId) {
        throw new DailyQAValidationError(503, "OUTPUT_ALLOCATION_REFERENCE_MISSING", "The output allocation must be saved before its inventory movement is posted.");
    }
    const movementQuery = new URLSearchParams({
        "filter[source_document_id][_eq]": String(input.jobOrderId),
        "filter[transaction_type_id][_eq]": String(input.transactionTypeId),
        "filter[product_id][_eq]": String(input.productId),
        "filter[branch_id][_eq]": String(input.branchId),
        "filter[source_document_detail_id][_eq]": String(input.row.allocationId),
        fields: "movement_id,source_document_detail_id,quantity",
        limit: "2"
    });
    const existingResponse = await fetch(`${DIRECTUS_URL}/items/inventory_movements?${movementQuery.toString()}`, {
        headers,
        cache: "no-store",
        signal: input.signal
    });
    const existingMovements = await readDirectusRows(existingResponse, "Existing output allocation movement lookup");
    if (existingMovements.length > 1) {
        throw new DailyQAValidationError(409, "OUTPUT_ALLOCATION_MOVEMENT_DUPLICATED", "More than one inventory movement is linked to this output allocation.");
    }
    const movementPayload = {
        product_id: input.productId,
        mm_lot_id: input.row.mmLotId,
        inventory_lot_id: input.inventoryLotId,
        lot_id: null,
        branch_id: input.branchId,
        transaction_type_id: input.transactionTypeId,
        source_document_id: input.jobOrderId,
        source_document_detail_id: input.row.allocationId,
        source_document_no: input.jobOrderNo,
        batch_no: input.row.batchNo,
        expiry_date: input.row.expiryDate,
        manufacturing_date: input.row.manufacturingDate,
        quantity: input.row.quantity,
        created_by: input.createdBy,
        remarks: input.outputType === "ACCEPTED"
            ? `QA accepted output allocation from Job Order ${input.jobOrderNo}; allocation ${input.row.allocationKey}`
            : `QA rejected output allocation from Job Order ${input.jobOrderNo}; allocation ${input.row.allocationKey}; reason ${input.row.rejectionReasonId}`
    };

    if (existingMovements[0]) {
        const movementId = relationId(existingMovements[0].movement_id, ["movement_id", "id"]);
        await patchDirectusRecord(
            `/items/inventory_movements/${encodeURIComponent(String(movementId))}`,
            movementPayload,
            `Reconcile output allocation movement ${movementId}`,
            input.signal
        );
        return;
    }

    if (input.outputType === "ACCEPTED" && input.isFirstAcceptedRow && input.originalBatchNo && input.originalYieldQuantity !== undefined) {
        const candidateParams = new URLSearchParams({
            "filter[source_document_id][_eq]": String(input.jobOrderId),
            "filter[transaction_type_id][_eq]": String(input.transactionTypeId),
            "filter[product_id][_eq]": String(input.productId),
            "filter[branch_id][_eq]": String(input.branchId),
            "filter[batch_no][_eq]": input.originalBatchNo,
            fields: "movement_id,source_document_detail_id,quantity,batch_no",
            limit: "-1"
        });
        const candidatesResponse = await fetch(`${DIRECTUS_URL}/items/inventory_movements?${candidateParams.toString()}`, {
            headers,
            cache: "no-store",
            signal: input.signal
        });
        const candidates = await readDirectusRows(candidatesResponse, "Original finished-goods movement lookup");
        const unallocatedCandidates = candidates.filter((row) => relationId(row.source_document_detail_id, ["id"]) === 0);
        const exactCandidates = unallocatedCandidates.filter((row) => Number(row.quantity) === input.originalYieldQuantity);
        const candidate = exactCandidates.length === 1
            ? exactCandidates[0]
            : exactCandidates.length === 0 && unallocatedCandidates.length === 1
                ? unallocatedCandidates[0]
                : null;
        if (!candidate && unallocatedCandidates.length > 1) {
            throw new DailyQAValidationError(409, "OUTPUT_MOVEMENT_RECONCILIATION_AMBIGUOUS", "Multiple unallocated finished-goods movements match this Job Order batch. Reconcile them before authorizing QA output.");
        }
        if (candidate) {
            const movementId = relationId(candidate.movement_id, ["movement_id", "id"]);
            await patchDirectusRecord(
                `/items/inventory_movements/${encodeURIComponent(String(movementId))}`,
                movementPayload,
                `Reconcile original finished-goods movement ${movementId}`,
                input.signal
            );
            return;
        }
    }

    if (input.outputType === "REJECTED") {
        const legacyParams = new URLSearchParams({
            "filter[source_document_id][_eq]": String(input.jobOrderId),
            "filter[transaction_type_id][_eq]": String(input.transactionTypeId),
            "filter[product_id][_eq]": String(input.productId),
            "filter[branch_id][_eq]": String(input.branchId),
            "filter[batch_no][_eq]": input.row.batchNo,
            fields: "movement_id,source_document_detail_id,quantity,batch_no",
            limit: "-1"
        });
        const legacyResponse = await fetch(`${DIRECTUS_URL}/items/inventory_movements?${legacyParams.toString()}`, {
            headers,
            cache: "no-store",
            signal: input.signal
        });
        const legacyRows = await readDirectusRows(legacyResponse, "Original rejected-output movement lookup");
        const unallocatedRows = legacyRows.filter((row) => relationId(row.source_document_detail_id, ["id"]) === 0);
        const exactLegacyRows = unallocatedRows.filter((row) => Number(row.quantity) === input.row.quantity);
        const legacyMovement = exactLegacyRows.length === 1
            ? exactLegacyRows[0]
            : exactLegacyRows.length === 0 && unallocatedRows.length === 1
                ? unallocatedRows[0]
                : null;
        if (!legacyMovement && unallocatedRows.length > 1) {
            throw new DailyQAValidationError(409, "REJECTED_MOVEMENT_RECONCILIATION_AMBIGUOUS", "Multiple unallocated rejected-output movements match this Job Order batch. Reconcile them before authorizing QA output.");
        }
        if (legacyMovement) {
            const movementId = relationId(legacyMovement.movement_id, ["movement_id", "id"]);
            await patchDirectusRecord(
                `/items/inventory_movements/${encodeURIComponent(String(movementId))}`,
                movementPayload,
                `Reconcile original rejected-output movement ${movementId}`,
                input.signal
            );
            return;
        }
    }

    await writeDirectusRecord(
        "/items/inventory_movements",
        "POST",
        movementPayload,
        `${input.outputType.toLowerCase()} output inventory movement`,
        input.signal
    );
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
    if (!rejectedMetadataMatches(ledger, metadata)) {
        await patchDirectusRecord(
            `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
            rejectedOutputLedgerPatch(metadata),
            `Save rejected-output traceability for yield ledger ${ledgerId}`,
            signal
        );
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
}): Promise<number> {
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
        return Number(inventoryLot.inventory_lot_id);
    } catch (error) {
        if (error instanceof DailyQAValidationError) throw error;
        if (error instanceof MmLotError) {
            throw new DailyQAValidationError(error.status, error.code, error.message);
        }
        throw error;
    }
}

async function registerAcceptedOutputAllocations(input: {
    ledger: Record<string, any>;
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    branchId: number;
    rows: DailyQAOutputAllocation[];
    createdBy: number;
    signal?: AbortSignal;
}): Promise<void> {
    const transactionTypeId = 2;
    for (const [index, row] of input.rows.entries()) {
        try {
            const inventoryLot = await resolveOrCreateMmInventoryLot({
                mmLotId: row.mmLotId,
                branchId: input.branchId,
                productId: input.productId,
                batchNo: row.batchNo,
                manufacturingDate: row.manufacturingDate,
                expiryDate: row.expiryDate,
                qaStatus: "GOOD",
                sourceType: "JOB_ORDER_YIELD",
                sourceReference: input.jobOrderNo,
                remarks: `QA-released finished yield from Job Order ${input.jobOrderNo}; allocation ${row.allocationKey}`,
                createdBy: input.createdBy,
                signal: input.signal
            });
            const inventoryLotId = Number(inventoryLot.inventory_lot_id) || 0;
            if (!inventoryLotId) {
                throw new MmLotError("The finished-goods inventory lot could not be verified after creation.", 503, "MM_INVENTORY_LOT_WRITE_FAILED");
            }
            await postOutputAllocationMovement({
                jobOrderId: input.jobOrderId,
                jobOrderNo: input.jobOrderNo,
                productId: input.productId,
                branchId: input.branchId,
                transactionTypeId,
                inventoryLotId,
                row,
                createdBy: input.createdBy,
                outputType: "ACCEPTED",
                isFirstAcceptedRow: index === 0,
                originalBatchNo: textValue(input.ledger.lot_number) || null,
                originalYieldQuantity: Number(input.ledger.yield_quantity ?? 0),
                signal: input.signal
            });
        } catch (error) {
            if (error instanceof DailyQAValidationError) throw error;
            if (error instanceof MmLotError) {
                throw new DailyQAValidationError(error.status, error.code, error.message);
            }
            throw error;
        }
    }
}

async function registerRejectedOutputAllocations(input: {
    ledgerId: number;
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    badStockBranchId: number;
    rows: DailyQAOutputAllocation[];
    createdBy: number;
    signal?: AbortSignal;
}): Promise<void> {
    const transactionTypeId = await loadTransactionTypeId("QA Reject / Bad Order Receipt", input.signal);
    for (const row of input.rows) {
        const inventoryLotId = await resolveRejectedInventoryLot({
            ledgerId: input.ledgerId,
            jobOrderNo: input.jobOrderNo,
            branchId: input.badStockBranchId,
            productId: input.productId,
            metadata: row,
            createdBy: input.createdBy,
            signal: input.signal
        });
        await postOutputAllocationMovement({
            jobOrderId: input.jobOrderId,
            jobOrderNo: input.jobOrderNo,
            productId: input.productId,
            branchId: input.badStockBranchId,
            transactionTypeId,
            inventoryLotId,
            row,
            createdBy: input.createdBy,
            outputType: "REJECTED",
            signal: input.signal
        });
    }
}

async function registerRejectedOutputOnly(body: Record<string, any>, signal: AbortSignal) {
    const jobOrderId = Number(body.jobOrderId || 0);
    const ledgerId = Number(body.ledgerId || 0);
    if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0 || !Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
        throw new DailyQAValidationError(400, "INVALID_OUTPUT_REFERENCE", "A valid Job Order and yield-ledger reference are required.");
    }

    const ledger = await readDirectusRecord(
        `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}?fields=ledger_id,job_order_id,commit_status,yield_quantity,rejected_quantity,scrap_quantity,qa_accepted_quantity,qa_rejected_quantity,qa_status,rejected_mm_lot_id,rejected_lot_number,rejected_manufacturing_date,rejected_expiry_date,rejected_inventory_condition`,
        `Load yield ledger ${ledgerId}`,
        signal
    );
    if (relationId(ledger.job_order_id, ["job_order_id", "id"]) !== jobOrderId) {
        throw new DailyQAValidationError(409, "LEDGER_JOB_ORDER_MISMATCH", "The selected yield ledger does not belong to this Job Order.");
    }
    const [jobOrder, capacity] = await Promise.all([
        readDirectusRecord(
            `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}?fields=job_order_id,job_order_no,product_id.product_id,product_id.unit_of_measurement.unit_shortcut,product_id.unit_of_measurement.unit_name,branch_id`,
            `Load Job Order ${jobOrderId}`,
            signal
        ),
        loadQAOutputAllocationCapacity(jobOrderId, ledgerId, signal)
    ]);
    const allocation = normalizeQAOutputAllocation(body, ledger);
    validateQAOutputAllocationCapacity(allocation, capacity, jobOrder);
    const rejectedQuantity = allocation.rejectedQuantity;
    if (!(rejectedQuantity > 0)) {
        throw new DailyQAValidationError(409, "REJECTED_OUTPUT_NOT_PRESENT", "This yield ledger has no rejected quantity to allocate.");
    }
    const rejectedEvidenceValidation = validateYieldEvidenceUploads(
        body.__rejectedEvidenceFiles || [],
        body.rejectedEvidenceKeys,
        "QA rejected stock evidence",
        false
    );
    if (rejectedEvidenceValidation.error) {
        throw new DailyQAValidationError(422, "REJECTED_EVIDENCE_REQUIRED", rejectedEvidenceValidation.error);
    }
    const rejectedAllocations = normalizeOutputAllocations(
        body.rejectedAllocations,
        body.rejectedOutputMetadata,
        rejectedQuantity,
        "REJECTED",
        ledgerId
    );
    await validateActiveRejectionReasons(rejectedAllocations, signal);
    const [routes, inspections] = await Promise.all([
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
    let badStockBranchId = 0;
    for (const metadata of rejectedAllocations) {
        const validatedBranchId = await validateRejectedOutputLot(productionBranchId, productId, metadata, signal);
        if (badStockBranchId && validatedBranchId !== badStockBranchId) {
            throw new DailyQAValidationError(409, "BAD_STOCK_BRANCH_CHANGED", "Rejected allocations must use the configured bad-stock branch.");
        }
        badStockBranchId = validatedBranchId;
    }
    let actorId: number;
    try {
        actorId = await requireManufacturingActorId(signal);
    } catch (error) {
        if (error instanceof AuthenticatedActorError) {
            throw new DailyQAValidationError(error.status, error.code, error.message);
        }
        throw error;
    }

    try {
        if (rejectedEvidenceValidation.uploads.length > 0) {
            await persistYieldEvidenceUploads({
                ledgerId,
                channel: "QA_REJECTED_STOCK",
                uploads: rejectedEvidenceValidation.uploads,
                uploaderId: actorId,
                title: `JO-${jobOrderId} rejected stock QA evidence`,
                signal
            });
        } else if ((await loadYieldEvidenceRows(ledgerId, "QA_REJECTED_STOCK", signal)).length === 0) {
            throw new DailyQAValidationError(422, "REJECTED_EVIDENCE_REQUIRED", "QA rejected stock evidence is required when rejected quantity is greater than zero.");
        }
    } catch (error) {
        if (error instanceof DailyQAValidationError) throw error;
        if (error instanceof YieldEvidencePersistenceError) {
            throw new DailyQAValidationError(error.status, "YIELD_EVIDENCE_SAVE_FAILED", error.message);
        }
        throw error;
    }

    await persistQAOutputAllocation(ledgerId, ledger, allocation, signal);
    const savedAllocations = await syncYieldOutputAllocations(ledgerId, jobOrderId, "REJECTED", rejectedAllocations, signal);
    await registerRejectedOutputAllocations({
        ledgerId,
        jobOrderId,
        jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${jobOrderId}`,
        productId,
        badStockBranchId,
        rows: savedAllocations,
        createdBy: actorId,
        signal
    });
    await persistRejectedOutputTraceability(ledgerId, ledger, savedAllocations[0], signal);

    return NextResponse.json({
        success: true,
        message: "Rejected output was registered in the configured bad-stock branch.",
        rejectedOutputMetadata: savedAllocations[0],
        rejectedAllocations: savedAllocations
    });
}

function multipartEvidenceFiles(formData: FormData, field: string): File[] {
    const values = formData.getAll(field);
    if (values.some((value) => typeof File === "undefined" || !(value instanceof File))) {
        throw new DailyQAValidationError(400, "YIELD_EVIDENCE_INVALID", `The ${field} upload contains an invalid file.`);
    }
    return values as File[];
}

async function readDailyQARequest(request: Request): Promise<{
    body: Record<string, any> | any[];
    acceptedEvidenceFiles: File[];
    rejectedEvidenceFiles: File[];
}> {
    if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
        const formData = await request.formData();
        const payload = formData.get("payload");
        if (typeof payload !== "string") {
            throw new DailyQAValidationError(400, "DAILY_QA_PAYLOAD_REQUIRED", "The QA audit payload is required.");
        }
        let body: unknown;
        try {
            body = JSON.parse(payload);
        } catch {
            throw new DailyQAValidationError(400, "DAILY_QA_PAYLOAD_INVALID", "The QA audit payload is not valid JSON.");
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new DailyQAValidationError(400, "DAILY_QA_PAYLOAD_INVALID", "The QA audit payload must be an object.");
        }
        return {
            body: body as Record<string, any>,
            acceptedEvidenceFiles: multipartEvidenceFiles(formData, "acceptedEvidence"),
            rejectedEvidenceFiles: multipartEvidenceFiles(formData, "rejectedEvidence")
        };
    }
    return {
        body: await request.json() as Record<string, any> | any[],
        acceptedEvidenceFiles: [],
        rejectedEvidenceFiles: []
    };
}

async function revokeJobOrderYieldAudit(body: Record<string, any>, signal: AbortSignal) {
    let actor: Awaited<ReturnType<typeof requireJobOrderModuleAccess>>;
    try {
        actor = await requireJobOrderModuleAccess([
            JOB_ORDER_MODULE_PATHS.qualityAssurance,
            JOB_ORDER_MODULE_PATHS.inspectionQa
        ], signal);
    } catch (error) {
        if (error instanceof JobOrderModuleAccessError) {
            return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
        }
        throw error;
    }

    const jobOrderId = Number(body.jobOrderId);
    const ledgerId = Number(body.ledgerId);
    const reason = textValue(body.reason);
    if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0 || !Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
        throw new DailyQAValidationError(400, "QA_REVOCATION_REFERENCE_REQUIRED", "A valid Job Order and yield ledger are required.");
    }
    if (!reason || reason.length > 500) {
        throw new DailyQAValidationError(422, "QA_REVOCATION_REASON_REQUIRED", "Enter a revocation reason of no more than 500 characters.");
    }

    return withJobOrderActualQuantityLock(jobOrderId, async () => {
        const ledger = await readDirectusRecord(
            `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}?fields=ledger_id,job_order_id,qa_status,qa_accepted_quantity,yield_quantity,qa_revoked_at,qa_revoked_through_audit_id`,
            `Load yield ledger ${ledgerId} for QA release revocation`,
            signal
        );
        if (relationId(ledger.job_order_id, ["job_order_id", "id"]) !== jobOrderId) {
            throw new DailyQAValidationError(409, "LEDGER_JOB_ORDER_MISMATCH", "The selected yield ledger does not belong to this Job Order.");
        }
        if (textValue(ledger.qa_status).toUpperCase() !== "PASSED") {
            if (ledger.qa_revoked_at && textValue(ledger.qa_status).toUpperCase() === "PENDING") {
                return NextResponse.json({ success: true, idempotent: true, message: "This QA release was already revoked." });
            }
            throw new DailyQAValidationError(409, "QA_RELEASE_NOT_ACTIVE", "Only an active, Passed QA release can be revoked.");
        }
        const quantityDelta = releasedYieldQuantityDelta(ledger, { ...ledger, qa_status: "Pending" });

        const inspectionsResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?filter[ledger_id][_eq]=${encodeURIComponent(String(ledgerId))}&limit=-1&fields=daily_qa_id`,
            { headers, cache: "no-store", signal }
        );
        const inspections = await readDirectusRows(inspectionsResponse, "Yield QA audit history lookup");
        const revokedThroughAuditId = inspections.reduce(
            (maximum, audit) => Math.max(maximum, relationId(audit.daily_qa_id, ["daily_qa_id", "id"])),
            0
        );
        const timestamp = formatPhtDateTime();
        const patchResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}`,
            {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    qa_status: "Pending",
                    qa_revoked_at: timestamp,
                    qa_revoked_by: actor.userId,
                    qa_revoke_reason: reason,
                    qa_revoked_through_audit_id: revokedThroughAuditId || null
                }),
                signal
            }
        );
        if (!patchResponse.ok) {
            throw new DailyQAValidationError(502, "QA_RELEASE_REVOCATION_FAILED", "The QA release could not be revoked. Confirm the QA revocation migration is installed and try again.");
        }
        await applyParentQuantityDeltaWhileLocked(
            jobOrderId,
            ledgerId,
            quantityDelta,
            parentQuantitySyncClient(jobOrderId, signal)
        );

        return NextResponse.json({
            success: true,
            message: "QA release revoked. Its accepted quantity has been removed from released output, and the yield can be audited again.",
            data: {
                jobOrderId,
                ledgerId,
                revokedGoodQuantity: Number(ledger.qa_accepted_quantity ?? ledger.yield_quantity ?? 0),
                revokedAt: timestamp
            }
        });
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
        const audits = yieldAuditRowsAfterRevocation(
            yieldRow,
            inspectionsByLedger.get(ledgerId) || []
        );
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
        const requestData = await readDailyQARequest(request);
        const body: any = requestData.body;
        if (!Array.isArray(body) && body?.action === "registerRejectedOutput") {
            body.__rejectedEvidenceFiles = requestData.rejectedEvidenceFiles;
        }
        if (body?.action === "registerRejectedOutput") {
            jobOrderIdForLog = Number(body.jobOrderId) || 0;
            ledgerIdForLog = Number(body.ledgerId) || 0;
            operationForLog = "register rejected output";
            return await registerRejectedOutputOnly(body, saveSignal);
        }
        if (!Array.isArray(body) && body?.action === "revokeJobOrderYieldAudit") {
            jobOrderIdForLog = Number(body.jobOrderId) || 0;
            ledgerIdForLog = Number(body.ledgerId) || 0;
            operationForLog = "revoke QA release";
            return await revokeJobOrderYieldAudit(body, saveSignal);
        }

        const isJobOrderYieldAudit = !Array.isArray(body) && body?.action === "jobOrderYieldAudit";
        if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data") && !isJobOrderYieldAudit) {
            return NextResponse.json({ error: "Multipart uploads are supported only for Job Order yield audits." }, { status: 400 });
        }

        const isEnvelope = Boolean(body && !Array.isArray(body) && Array.isArray(body.inspections));
        const inspectionsList = isEnvelope ? body.inspections : (Array.isArray(body) ? body : [body]);

        if (isJobOrderYieldAudit) {
            for (const entry of inspectionsList) {
                const stateError = dailyQAAuditStateError(entry?.labStatus, entry?.actionTaken);
                if (stateError) {
                    throw new DailyQAValidationError(422, "INVALID_LAB_DISPOSITION", stateError);
                }
            }
        }

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
            `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}?fields=ledger_id,job_order_id,session_key,commit_status,yield_quantity,rejected_quantity,scrap_quantity,qa_accepted_quantity,qa_rejected_quantity,qa_status,qa_revoked_at,qa_revoked_through_audit_id,lot_number,mm_lot_id,manufacturing_date,expiry_date,rejected_mm_lot_id,rejected_lot_number,rejected_manufacturing_date,rejected_expiry_date,rejected_inventory_condition`,
            `Load yield ledger ${ledgerId}`,
            saveSignal
        );
        const ledgerJobOrderId = relationId(ledger.job_order_id, ["job_order_id", "id"]);
        if (ledgerJobOrderId !== jobOrderId) {
            throw new DailyQAValidationError(409, "LEDGER_JOB_ORDER_MISMATCH", "The selected yield ledger does not belong to this Job Order.");
        }

        operationForLog = `load Job Order ${jobOrderId}`;
        const [jobOrder, capacity] = await Promise.all([
            readDirectusRecord(
                `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}?fields=job_order_id,job_order_no,product_id.product_id,product_id.unit_of_measurement.unit_shortcut,product_id.unit_of_measurement.unit_name,branch_id,qa_started_at,qa_started_by`,
                `Load Job Order ${jobOrderId}`,
                saveSignal
            ),
            loadQAOutputAllocationCapacity(jobOrderId, ledgerId, saveSignal)
        ]);
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const branchId = relationId(jobOrder.branch_id, ["branch_id", "id"]);
        const outputAllocation = normalizeQAOutputAllocation(isEnvelope ? body : {}, ledger);
        validateQAOutputAllocationCapacity(outputAllocation, capacity, jobOrder);
        const goodOutputQuantity = outputAllocation.acceptedQuantity;
        const rejectedOutputQuantity = outputAllocation.rejectedQuantity;
        const evidenceRequirements = yieldEvidenceRequirementsForLedger(
            goodOutputQuantity,
            rejectedOutputQuantity,
            isRejectedOutputRegistered(relationId(ledger.rejected_mm_lot_id, ["mm_lot_id", "lot_id", "id"]))
        );
        let acceptedEvidenceRows: YieldEvidenceRow[] = [];
        let rejectedEvidenceRows: YieldEvidenceRow[] = [];
        if (isJobOrderYieldAudit) {
            operationForLog = "load existing yield evidence";
            try {
                [acceptedEvidenceRows, rejectedEvidenceRows] = await Promise.all([
                    evidenceRequirements.acceptedStock && requestData.acceptedEvidenceFiles.length === 0
                        ? loadYieldEvidenceRows(ledgerId, "QA_ACCEPTED_STOCK", saveSignal)
                        : Promise.resolve([]),
                    evidenceRequirements.rejectedStock && requestData.rejectedEvidenceFiles.length === 0
                        ? loadYieldEvidenceRows(ledgerId, "QA_REJECTED_STOCK", saveSignal)
                        : Promise.resolve([])
                ]);
            } catch (error) {
                if (error instanceof YieldEvidencePersistenceError) {
                    console.error("Yield evidence lookup failed.", {
                        operation: operationForLog,
                        upstreamStatus: error.upstreamStatus,
                        message: error.message
                    });
                    throw new DailyQAValidationError(error.status, "YIELD_EVIDENCE_SAVE_FAILED", error.message);
                }
                throw error;
            }
        }
        const acceptedEvidenceValidation = validateYieldEvidenceUploads(
            requestData.acceptedEvidenceFiles,
            isEnvelope ? body.acceptedEvidenceKeys : undefined,
            "QA accepted stock evidence",
            isJobOrderYieldAudit && evidenceRequirements.acceptedStock && acceptedEvidenceRows.length === 0
        );
        const rejectedEvidenceValidation = validateYieldEvidenceUploads(
            requestData.rejectedEvidenceFiles,
            isEnvelope ? body.rejectedEvidenceKeys : undefined,
            "QA rejected stock evidence",
            isJobOrderYieldAudit && evidenceRequirements.rejectedStock && rejectedEvidenceRows.length === 0
        );
        if (acceptedEvidenceValidation.error) {
            throw new DailyQAValidationError(422, "ACCEPTED_EVIDENCE_REQUIRED", acceptedEvidenceValidation.error);
        }
        if (rejectedEvidenceValidation.error) {
            throw new DailyQAValidationError(422, "REJECTED_EVIDENCE_REQUIRED", rejectedEvidenceValidation.error);
        }
        if ((goodOutputQuantity > 0 || rejectedOutputQuantity > 0) && (!productId || !branchId)) {
            throw new DailyQAValidationError(409, "OUTPUT_TRACEABILITY_CONTEXT_MISSING", "The Job Order is missing its finished-good product or branch, so output traceability cannot be saved.");
        }
        const acceptedAllocations = normalizeOutputAllocations(
            isEnvelope ? body.acceptedAllocations : null,
            isEnvelope ? body.outputMetadata : null,
            goodOutputQuantity,
            "ACCEPTED",
            ledgerId
        );
        const rejectedAllocations = normalizeOutputAllocations(
            isEnvelope ? body.rejectedAllocations : null,
            isEnvelope ? body.rejectedOutputMetadata : null,
            rejectedOutputQuantity,
            "REJECTED",
            ledgerId
        );
        await validateActiveRejectionReasons(rejectedAllocations, saveSignal);
        const outputMetadata = acceptedAllocations[0] || null;

        let badStockBranchId: number | null = null;
        for (const metadata of rejectedAllocations) {
            operationForLog = "validate rejected-output storage lot";
            const validatedBranchId = await validateRejectedOutputLot(branchId, productId, metadata, saveSignal);
            if (badStockBranchId && badStockBranchId !== validatedBranchId) {
                throw new DailyQAValidationError(409, "BAD_STOCK_BRANCH_CHANGED", "Rejected allocations must use the configured bad-stock branch.");
            }
            badStockBranchId = validatedBranchId;
        }

        operationForLog = "validate finished-goods storage lots";
        try {
            await Promise.all(acceptedAllocations.map((allocation) => loadEligibleFinishedGoodsLot({
                mmLotId: allocation.mmLotId,
                branchId,
                productId,
                signal: saveSignal
            })));
        } catch (error) {
            if (error instanceof MmLotError) {
                throw new DailyQAValidationError(error.status, error.code, error.message);
            }
            throw error;
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
        const inventoryLotCreatedBy = goodOutputQuantity > 0 || rejectedAllocations.length > 0
            ? authenticatedInspectorId
            : null;
        let savedAcceptedAllocations = acceptedAllocations;
        let savedRejectedAllocations = rejectedAllocations;
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
            `${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?filter[ledger_id][_eq]=${ledgerId}&limit=-1&fields=daily_qa_id,inspected_at,ledger_id,jo_route_id,sensory_status,lab_status,action_taken,weight_check_passed`,
            { headers, cache: "no-store", signal: saveSignal }
        );
        const existingInspections = yieldAuditRowsAfterRevocation(
            ledger,
            await readDirectusRows(existingInspectionsResponse, "Existing daily QA inspection lookup")
        );
        const latestInspections = latestDailyQAAuditsByRoute(existingInspections);
        const savedInspectionByRoute = new Map<string, any>();
        for (const inspection of latestInspections) {
            const routeIdentifier = relationId(inspection.jo_route_id, ["jo_route_id", "id"]);
            savedInspectionByRoute.set(routeIdentifier ? "route:" + routeIdentifier : "general", inspection);
        }
        const existingOutcome = deriveDailyQAOutcome(
            existingInspections,
            routes.map((route: any) => relationId(route.jo_route_id, ["jo_route_id", "id"]))
        );
        if (existingOutcome.status === "Passed") {
            throw new DailyQAValidationError(409, "QA_AUDIT_ALREADY_VERIFIED", "This daily yield has already been verified and cannot be audited again.");
        }
        const submittedRouteIds = [...new Set(inspectionsList
            .map((entry: any) => relationId(entry?.joRouteId, ["joRouteId", "jo_route_id", "id"]))
            .filter((id: number) => id > 0))];
        const savedParameterKeys = new Set<string>();
        if (submittedRouteIds.length > 0 && inspectionsList.some((entry: any) => Array.isArray(entry?.qaParameters) && entry.qaParameters.length > 0)) {
            const parameterQuery = new URLSearchParams({
                "filter[job_order_id][_eq]": String(jobOrderId),
                "filter[jo_route_id][_in]": submittedRouteIds.join(","),
                limit: "-1",
                fields: "jo_route_id,parameter_id,inspected_at,remarks"
            });
            const savedParametersResponse = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?${parameterQuery.toString()}`,
                { headers, cache: "no-store", signal: saveSignal }
            );
            const savedParameters = await readDirectusRows(savedParametersResponse, "Existing daily QA parameter lookup");
            const parameterMarker = `Daily QA Audit | Yield Log ID: ${ledgerId} |`;
            for (const parameter of savedParameters) {
                if (!textValue(parameter.remarks).startsWith(parameterMarker)) continue;
                if (!qaRecordAfterRevocation(parameter, ledger.qa_revoked_at)) continue;
                const routeId = relationId(parameter.jo_route_id, ["jo_route_id", "id"]);
                const parameterId = relationId(parameter.parameter_id, ["parameter_id", "id"]);
                if (routeId && parameterId) savedParameterKeys.add(`${routeId}:${parameterId}`);
            }
        }

        if (isJobOrderYieldAudit) {
            try {
                operationForLog = "preflight yield evidence access";
                const [acceptedEvidenceRowsForPersistence, rejectedEvidenceRowsForPersistence] = await Promise.all([
                    acceptedEvidenceValidation.uploads.length > 0
                        ? loadYieldEvidenceRows(ledgerId, "QA_ACCEPTED_STOCK", saveSignal)
                        : Promise.resolve(undefined),
                    rejectedEvidenceValidation.uploads.length > 0
                        ? loadYieldEvidenceRows(ledgerId, "QA_REJECTED_STOCK", saveSignal)
                        : Promise.resolve(undefined)
                ]);

                operationForLog = "persist yield evidence uploads";
                await Promise.all([
                    persistYieldEvidenceUploads({
                        ledgerId,
                        channel: "QA_ACCEPTED_STOCK",
                        uploads: acceptedEvidenceValidation.uploads,
                        uploaderId: authenticatedInspectorId,
                        title: `JO-${jobOrderId} accepted stock QA evidence`,
                        signal: saveSignal,
                        existingRows: acceptedEvidenceRowsForPersistence
                    }),
                    persistYieldEvidenceUploads({
                        ledgerId,
                        channel: "QA_REJECTED_STOCK",
                        uploads: rejectedEvidenceValidation.uploads,
                        uploaderId: authenticatedInspectorId,
                        title: `JO-${jobOrderId} rejected stock QA evidence`,
                        signal: saveSignal,
                        existingRows: rejectedEvidenceRowsForPersistence
                    })
                ]);
            } catch (error) {
                if (error instanceof YieldEvidencePersistenceError) {
                    console.error("Yield evidence persistence failed.", {
                        operation: operationForLog,
                        upstreamStatus: error.upstreamStatus,
                        message: error.message
                    });
                    throw new DailyQAValidationError(error.status, "YIELD_EVIDENCE_SAVE_FAILED", error.message);
                }
                throw error;
            }
        }

        operationForLog = "save output allocation and traceability";
        await persistQAOutputAllocation(ledgerId, ledger, outputAllocation, saveSignal);
        savedAcceptedAllocations = await syncYieldOutputAllocations(ledgerId, jobOrderId, "ACCEPTED", acceptedAllocations, saveSignal);
        savedRejectedAllocations = await syncYieldOutputAllocations(ledgerId, jobOrderId, "REJECTED", rejectedAllocations, saveSignal);

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
                lab_status: isJobOrderYieldAudit ? labStatus : labStatus || "Passed",
                action_taken: isJobOrderYieldAudit ? actionTaken : actionTaken || "Released",
                inspected_at: timestamp,
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
            const routeKey = routeIdentifier ? "route:" + routeIdentifier : "general";
            const previousInspection = savedInspectionByRoute.get(routeKey);
            const stateIsUnchanged = previousInspection
                && textValue(previousInspection.lab_status) === String(payload.lab_status)
                && textValue(previousInspection.action_taken) === String(payload.action_taken);
            if (previousInspection && (!isJobOrderYieldAudit || stateIsUnchanged)) continue;

            const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: saveSignal
            });

            if (!res.ok) {
                throw new DailyQAValidationError(502, "INSPECTION_WRITE_FAILED", "Failed to write daily QA inspection record.");
            }
            savedInspectionByRoute.set(routeKey, payload);
        }

        operationForLog = "reconcile Job Order QA start fields";
        const firstInspectionQuery = new URLSearchParams({
            "filter[job_order_id][_eq]": String(jobOrderId),
            "filter[inspected_at][_nnull]": "true",
            fields: "daily_qa_id,inspector_id,inspected_at",
            sort: "inspected_at,daily_qa_id",
            limit: "1"
        });
        const firstInspectionResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_daily_qa_inspections?${firstInspectionQuery.toString()}`,
            { headers, cache: "no-store", signal: saveSignal }
        );
        const firstInspections = await readDirectusRows(firstInspectionResponse, "Earliest Job Order QA inspection lookup");
        const qaStartPatch = buildQaStartPatch(jobOrder, firstInspections);
        if (qaStartPatch) {
            await patchDirectusRecord(
                `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}`,
                qaStartPatch,
                `Save QA start fields for Job Order ${jobOrderId}`,
                saveSignal
            );
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
        const inspections = yieldAuditRowsAfterRevocation(ledger, inspectionsPayload.data);

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

        if (finalLedgerStatus === "Passed" && goodOutputQuantity > 0 && savedAcceptedAllocations.length > 0) {
            operationForLog = "register released finished-goods lot";
            if (!inventoryLotCreatedBy) {
                throw new DailyQAValidationError(401, "AUTHENTICATION_REQUIRED", "An authenticated user is required to register the audited finished-goods lot.");
            }
            await registerAcceptedOutputAllocations({
                ledger,
                jobOrderId,
                jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${jobOrderId}`,
                productId,
                branchId,
                rows: savedAcceptedAllocations,
                createdBy: inventoryLotCreatedBy,
                signal: saveSignal
            });
        }

        if (
            savedRejectedAllocations.length > 0
            && badStockBranchId
            && shouldRegisterRejectedOutput(rejectedOutputQuantity, outcome.isComplete)
        ) {
            operationForLog = "register rejected finished-goods lot";
            if (!inventoryLotCreatedBy) {
                throw new DailyQAValidationError(401, "AUTHENTICATION_REQUIRED", "An authenticated user is required to register rejected finished-goods output.");
            }
            await registerRejectedOutputAllocations({
                ledgerId,
                jobOrderId,
                jobOrderNo: textValue(jobOrder.job_order_no) || `JO-${jobOrderId}`,
                productId,
                badStockBranchId,
                rows: savedRejectedAllocations,
                createdBy: inventoryLotCreatedBy,
                signal: saveSignal
            });
            await persistRejectedOutputTraceability(ledgerId, ledger, savedRejectedAllocations[0], saveSignal);
            rejectedOutputRegistered = true;
        }

        // Sync QA disposition back to yield ledger (only "Passed" if all steps have been QA'd)
        operationForLog = "save final yield ledger QA status";
        await withJobOrderActualQuantityLock(jobOrderId, async () => {
            const latestLedger = await readDirectusRecord(
                `/items/manufacturing_job_order_yield_ledger/${encodeURIComponent(String(ledgerId))}?fields=ledger_id,job_order_id,qa_accepted_quantity,yield_quantity,qa_status`,
                `Reload yield ledger ${ledgerId} before saving its QA status`,
                saveSignal
            );
            if (relationId(latestLedger.job_order_id, ["job_order_id", "id"]) !== jobOrderId) {
                throw new DailyQAValidationError(409, "LEDGER_JOB_ORDER_MISMATCH", "The selected yield ledger no longer belongs to this Job Order.");
            }
            if (textValue(latestLedger.qa_status).toUpperCase() === "PASSED" && finalLedgerStatus !== "Passed") {
                throw new DailyQAValidationError(409, "QA_AUDIT_ALREADY_VERIFIED", "This yield ledger has already been released and cannot be moved out of Passed by a regular audit.");
            }

            const nextLedger = { ...latestLedger, qa_status: finalLedgerStatus };
            const quantityDelta = releasedYieldQuantityDelta(latestLedger, nextLedger);
            const ledgerPatchResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${ledgerId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ qa_status: finalLedgerStatus }),
                signal: saveSignal
            });
            if (!ledgerPatchResponse.ok) {
                throw new Error(`Failed to persist Daily QA status for yield ledger ${ledgerId}.`);
            }

            await applyParentQuantityDeltaWhileLocked(
                jobOrderId,
                ledgerId,
                quantityDelta,
                parentQuantitySyncClient(jobOrderId, saveSignal)
            );
        });

        // The finished-yield inventory view resolves Passed yield rows through mm_inventory_lots.
        // The physical receipt and Job Order completion remain owned by yield closing.

        return NextResponse.json({
            success: true,
            message: "Daily yield QA inspection logged successfully.",
            outputMetadata,
            acceptedAllocations: savedAcceptedAllocations,
            rejectedAllocations: savedRejectedAllocations,
            rejectedOutputRegistered
        });
    } catch (e) {
        console.error(`Daily QA POST failed during ${operationForLog} after ${Date.now() - startedAt}ms:`, e);
        if (e instanceof ParentYieldQuantitySyncError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
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
