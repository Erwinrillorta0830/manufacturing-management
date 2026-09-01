import { randomUUID } from "node:crypto";

import {
    DETAILS as PRICE_DETAILS,
    directusHeaders,
    fetchDirectus,
    findPriceSnapshotConflicts,
    getDetails as getPriceDetails,
    getHeader,
    isRecord,
    mustBase,
    normalizeHeaderId,
    nowManila,
    pickId,
    resolveBatchDecisionUserNames,
    supplierLabelOf,
    fetchProductTypesMap,
} from "./price-change-batches/_batch";
import {
    COST_DETAILS,
    getCostDetails,
} from "./cost-change-batches/_batch";
import { applyProposedPrice, applyProposedVersionPrice } from "./price-change-requests/_actions";
import { patchProductCostField } from "./cost-change-requests/_actions";
import { assertValidProposedCost, isInvalidProposedCostError } from "./cost-change-requests/_costValidation";
import {
    APPLICATION_MAX_FAILURES,
    executeClaimedApplication,
    fallbackApplicationStatus,
    postCommitApplicationNotice,
} from "./_applicationEngine";
import { isValidPriceValue } from "./_pricePrecision";

type DirectusList<T> = { data?: T[] };

type DetailRow = {
    request_id?: number | string | null;
    header_id?: number | string | null;
    product_id?: unknown;
    version_id?: unknown;
    supplier_id?: unknown;
    price_type_id?: unknown;
    current_price?: number | string | null;
    proposed_price?: number | string | null;
    current_cost?: number | string | null;
    proposed_cost?: number | string | null;
    status?: string | null;
    requested_by?: unknown;
    requested_at?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_lock_id?: string | null;
    application_started_at?: string | null;
    application_attempts?: number | string | null;
    application_error?: string | null;
    applied_at?: string | null;
    applied_by?: unknown;
};

class UnifiedBatchReconciliationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnifiedBatchReconciliationError";
    }
}

export type UnifiedBatchLine = {
    request_id: number | null;
    kind: "price_type" | "list_cost";
    product_id: number;
    product_name: string;
    product_code: string;
    version_id?: number | null;
    version_name?: string | null;
    unit_name: string;
    price_type_id?: number;
    price_type_name?: string;
    product_type_id?: number | null;
    product_type_name?: string | null;
    supplier_id?: number | null;
    supplier_name?: string | null;
    current_price?: number | null;
    proposed_price?: number | null;
    current_cost?: number | null;
    proposed_cost?: number | null;
    delta: number | null;
    percent_change: number | null;
    status: string;
    effective_at?: string | null;
    application_status?: string | null;
    application_attempts?: number | null;
    application_error?: string | null;
    applied_at?: string | null;
    applied_by?: unknown;
};

export type UnifiedBatchData = {
    id: number;
    header_id: number;
    reference_no: string;
    remarks: string;
    status: string;
    requested_by: number | null;
    requested_by_name: string | null;
    requested_at: string | null;
    approved_by: number | null;
    approved_by_name: string | null;
    approved_at?: string | null;
    rejected_by: number | null;
    rejected_by_name: string | null;
    rejected_at?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_attempts?: number;
    application_error?: string | null;
    retryable?: boolean;
    applied_at?: string | null;
    applied_by?: unknown;
    price_details: UnifiedBatchLine[];
    cost_details: UnifiedBatchLine[];
    batch_types: Array<"PRICE_TYPE" | "LIST_COST">;
    product_types?: Array<{ id: number; name: string }>;
};

function productValue(value: unknown, key: string): string {
    return isRecord(value) ? String(value[key] ?? "").trim() : "";
}

function productUom(value: unknown): string {
    if (!isRecord(value) || !isRecord(value.unit_of_measurement)) return "";
    return String(
        value.unit_of_measurement.unit_shortcut ?? value.unit_of_measurement.unit_name ?? "",
    ).trim();
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function userIdOf(value: unknown): number | null {
    const id = isRecord(value) ? pickId(value.user_id ?? value.id) : pickId(value);
    return id ?? null;
}

function detailProductId(line: DetailRow): number {
    return isRecord(line.product_id) ? pickId(line.product_id.product_id) ?? 0 : pickId(line.product_id) ?? 0;
}

function detailPriceTypeId(line: DetailRow): number {
    return isRecord(line.price_type_id)
        ? pickId(line.price_type_id.price_type_id) ?? 0
        : pickId(line.price_type_id) ?? 0;
}

function mapPriceLine(line: DetailRow, productTypesMap: Map<number, string>): UnifiedBatchLine {
    const current = numberOrNull(line.current_price);
    const proposed = numberOrNull(line.proposed_price);
    const delta = current !== null && proposed !== null ? proposed - current : null;
    
    const versionName = productValue(line.version_id, "version_name");
    const productName = productValue(line.product_id, "product_name");
    const displayName = versionName ? `${productName} (${versionName})` : productName;

    let product_type_id: number | null = null;
    if (isRecord(line.product_id) && 'product_type' in line.product_id) {
        product_type_id = numberOrNull(isRecord(line.product_id.product_type) ? line.product_id.product_type.id : line.product_id.product_type);
    }
    const product_type_name = product_type_id ? productTypesMap.get(product_type_id) ?? null : null;

    const supplier_id = isRecord(line.supplier_id) ? pickId(line.supplier_id.id) : pickId(line.supplier_id);
    const supplier_name = supplierLabelOf(line.supplier_id);

    return {
        request_id: pickId(line.request_id),
        kind: "price_type",
        product_id: detailProductId(line),
        product_name: displayName,
        product_code: productValue(line.product_id, "product_code"),
        version_id: numberOrNull(productValue(line.version_id, "version_id")) ?? null,
        version_name: versionName || null,
        unit_name: productUom(line.product_id),
        price_type_id: detailPriceTypeId(line),
        price_type_name: productValue(line.price_type_id, "price_type_name"),
        product_type_id,
        product_type_name,
        current_price: current,
        proposed_price: proposed,
        delta,
        percent_change: delta !== null && current !== null && current !== 0 ? (delta / current) * 100 : null,
        status: String(line.status ?? "PENDING"),
        effective_at: line.effective_at ?? null,
        application_status: line.application_status ?? null,
        application_attempts: Number(line.application_attempts ?? 0),
        application_error: line.application_error ?? null,
        applied_at: line.applied_at ?? null,
        applied_by: line.applied_by,
        supplier_id,
        supplier_name,
    };
}

function mapCostLine(line: DetailRow, productTypesMap: Map<number, string>): UnifiedBatchLine {
    const current = numberOrNull(line.current_cost);
    const proposed = numberOrNull(line.proposed_cost);
    const delta = current !== null && proposed !== null ? proposed - current : null;

    const versionName = productValue(line.version_id, "version_name");
    const productName = productValue(line.product_id, "product_name");
    const displayName = versionName ? `${productName} (${versionName})` : productName;

    let product_type_id: number | null = null;
    if (isRecord(line.product_id) && 'product_type' in line.product_id) {
        product_type_id = numberOrNull(isRecord(line.product_id.product_type) ? line.product_id.product_type.id : line.product_id.product_type);
    }
    const product_type_name = product_type_id ? productTypesMap.get(product_type_id) ?? null : null;

    const supplier_id = isRecord(line.supplier_id) ? pickId(line.supplier_id.id) : pickId(line.supplier_id);
    const supplier_name = supplierLabelOf(line.supplier_id);

    return {
        request_id: pickId(line.request_id),
        kind: "list_cost",
        product_id: detailProductId(line),
        product_name: displayName,
        product_code: productValue(line.product_id, "product_code"),
        version_id: numberOrNull(productValue(line.version_id, "version_id")) ?? null,
        version_name: versionName || null,
        unit_name: productUom(line.product_id),
        product_type_id,
        product_type_name,
        current_cost: current,
        proposed_cost: proposed,
        delta,
        percent_change: delta !== null && current !== null && current !== 0 ? (delta / current) * 100 : null,
        status: String(line.status ?? "PENDING"),
        effective_at: line.effective_at ?? null,
        application_status: line.application_status ?? null,
        application_attempts: Number(line.application_attempts ?? 0),
        application_error: line.application_error ?? null,
        applied_at: line.applied_at ?? null,
        applied_by: line.applied_by,
        supplier_id,
        supplier_name,
    };
}

export async function getUnifiedBatch(headerId: number): Promise<UnifiedBatchData | null> {
    const header = await getHeader(headerId);
    if (!header) return null;

    const [priceDetails, costDetails, productTypesMap] = await Promise.all([
        getPriceDetails(headerId) as Promise<DetailRow[]>,
        getCostDetails(headerId) as Promise<DetailRow[]>,
        fetchProductTypesMap(),
    ]);
    const normalizedHeaderId = normalizeHeaderId(header);
    const price = priceDetails.map((line) => mapPriceLine(line, productTypesMap));
    const cost = costDetails.map((line) => mapCostLine(line, productTypesMap));
    const requestedBy = userIdOf(header.requested_by);
    const { requested_by_name, approved_by_name, rejected_by_name } = await resolveBatchDecisionUserNames(header);
    const allLines = [...price, ...cost];
    const headerApplicationStatus = String(header.application_status ?? "").toUpperCase();
    const retryable = String(header.status ?? "").toUpperCase() === "APPROVED" &&
        ["FAILED", "SCHEDULED"].includes(headerApplicationStatus) &&
        allLines.some((line) => {
            const lineStatus = String(line.application_status ?? "").toUpperCase();
            return lineStatus === "SCHEDULED" ||
                (lineStatus === "FAILED" && Number(line.application_attempts ?? 0) < APPLICATION_MAX_FAILURES);
        });

    const productTypeMap = new Map<number, string>();
    for (const line of allLines) {
        if (line.product_type_id && line.product_type_name) {
            productTypeMap.set(line.product_type_id, line.product_type_name);
        }
    }
    const product_types = Array.from(productTypeMap.entries()).map(([id, name]) => ({ id, name }));

    return {
        id: normalizedHeaderId,
        header_id: normalizedHeaderId,
        reference_no: String(header.reference_no ?? ""),
        remarks: String(header.remarks ?? ""),
        status: String(header.status ?? "PENDING"),
        requested_by: requestedBy,
        requested_by_name,
        requested_at: header.requested_at ?? null,
        approved_by: userIdOf(header.approved_by),
        approved_by_name,
        approved_at: header.approved_at ?? null,
        rejected_by: userIdOf(header.rejected_by),
        rejected_by_name,
        rejected_at: header.rejected_at ?? null,
        reject_reason: header.reject_reason ?? null,
        effective_at: header.effective_at ?? null,
        application_status: header.application_status ?? null,
        application_attempts: Number(header.application_attempts ?? 0),
        application_error: header.application_error ?? null,
        retryable,
        applied_at: header.applied_at ?? null,
        applied_by: header.applied_by,
        price_details: price,
        cost_details: cost,
        batch_types: [
            ...(price.length > 0 ? (["PRICE_TYPE"] as const) : []),
            ...(cost.length > 0 ? (["LIST_COST"] as const) : []),
        ],
        product_types,
    };
}

export type UnifiedBatchKind = "mixed" | "single" | "missing";

export class UnifiedBatchDetectionError extends Error {
    readonly code = "mixed_batch_detection_unavailable";
    readonly retryable = true;
    readonly status = 503;
    readonly originalError: unknown;

    constructor(error: unknown) {
        super("Unable to determine the batch type. No changes were applied. Please retry.");
        this.name = "UnifiedBatchDetectionError";
        this.originalError = error;
    }
}

export function isUnifiedBatchDetectionError(error: unknown): error is UnifiedBatchDetectionError {
    return error instanceof UnifiedBatchDetectionError;
}

async function getBatchForDecision(headerId: number): Promise<UnifiedBatchData | null> {
    try {
        return await getUnifiedBatch(headerId);
    } catch (error: unknown) {
        throw new UnifiedBatchDetectionError(error);
    }
}

export async function resolveUnifiedBatchKind(headerId: number): Promise<UnifiedBatchKind> {
    const batch = await getBatchForDecision(headerId);
    if (!batch) return "missing";
    return batch.price_details.length > 0 && batch.cost_details.length > 0 ? "mixed" : "single";
}

async function patchFiltered<T>(
    collection: string,
    filter: Record<string, unknown>,
    patch: Record<string, unknown>,
    fields: string,
): Promise<T[]> {
    const response = await fetchDirectus<DirectusList<T>>(`${mustBase()}/items/${collection}`, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({ data: patch, query: { filter, fields: fields.split(",") } }),
    });
    return response.data ?? [];
}

async function fetchApplicationRows(collection: string, headerId: number): Promise<DetailRow[]> {
    const params = new URLSearchParams();
    params.set("limit", "-1");
    const fields = collection === PRICE_DETAILS
        ? "request_id,header_id,product_id,version_id,version_id.version_name,product_id.product_name,product_id.product_code,product_id.unit_of_measurement.unit_shortcut,product_id.unit_of_measurement.unit_name,price_type_id,price_type_id.price_type_name,current_price,proposed_price,status,effective_at,application_status,application_lock_id,application_started_at,application_attempts,application_error"
        : "request_id,header_id,product_id,version_id,version_id.version_name,product_id.product_name,product_id.product_code,product_id.unit_of_measurement.unit_shortcut,product_id.unit_of_measurement.unit_name,current_cost,proposed_cost,status,effective_at,application_status,application_lock_id,application_started_at,application_attempts,application_error";
    params.set(
        "fields",
        fields,
    );
    params.set("filter[header_id][_eq]", String(headerId));
    const response = await fetchDirectus<DirectusList<DetailRow>>(
        `${mustBase()}/items/${collection}?${params.toString()}`,
        { headers: directusHeaders() },
    );
    return response.data ?? [];
}

async function claimHeader(headerId: number, operation: "approve" | "retry" = "approve") {
    const lockId = randomUUID();
    const now = nowManila();
    const claimed = await patchFiltered(
        "price_change_headers",
        {
            _and: [
                { header_id: { _eq: headerId } },
                { status: { _eq: operation === "approve" ? "PENDING" : "APPROVED" } },
                { application_lock_id: { _null: true } },
                {
                    _or: [
                        ...(operation === "approve"
                            ? [
                                  { application_status: { _null: true } },
                                  { application_status: { _eq: "FAILED" } },
                              ]
                            : [
                                  { application_status: { _eq: "FAILED" } },
                                  { application_status: { _eq: "SCHEDULED" } },
                              ]),
                    ],
                },
            ],
        },
        {
            application_status: "APPLYING",
            application_lock_id: lockId,
            application_started_at: now,
            application_error: null,
        },
        "header_id,status,application_status,application_lock_id",
    );

    return claimed[0] ? { lockId, now } : null;
}

function normalizedApplicationLock(row: DetailRow) {
    const lockId = String(row.application_lock_id ?? "").trim();
    return lockId || null;
}

function detailStagingState(row: DetailRow): "pending" | "staged" | "invalid" {
    const status = String(row.status ?? "").toUpperCase();
    const applicationStatus = String(row.application_status ?? "").toUpperCase();
    const hasStarted = Boolean(String(row.application_started_at ?? "").trim());

    if (
        status === "PENDING" &&
        (applicationStatus === "" || applicationStatus === "FAILED") &&
        normalizedApplicationLock(row) === null
    ) {
        return "pending";
    }

    if (status === "APPROVED" && applicationStatus === "SCHEDULED" && !hasStarted) {
        return "staged";
    }

    return "invalid";
}

async function reconcileDetails(
    collection: string,
    headerId: number,
    userId: number,
    now: string,
    effectiveAt: string,
    expected: number,
    lockId: string,
) {
    const before = await fetchApplicationRows(collection, headerId);
    if (before.length !== expected) {
        throw new UnifiedBatchReconciliationError(`Mixed batch detail count changed for ${collection}; retry the approval.`);
    }

    const pendingRows = before.filter((row) => detailStagingState(row) === "pending");
    const stagedRows = before.filter((row) => detailStagingState(row) === "staged");
    const invalidRows = before.filter((row) => detailStagingState(row) === "invalid");
    if (invalidRows.length > 0) {
        throw new UnifiedBatchReconciliationError(`Mixed batch contains an inconsistent staged row in ${collection}; retry the approval.`);
    }

    const stagedLocks = new Set(stagedRows.map((row) => normalizedApplicationLock(row) ?? "<none>"));
    if (stagedLocks.size > 1) {
        throw new UnifiedBatchReconciliationError(`Mixed batch has conflicting staging locks in ${collection}; reconcile the batch before retrying.`);
    }

    const stagedLock = stagedRows.length > 0 ? normalizedApplicationLock(stagedRows[0]) : null;
    if (stagedRows.length > 0 && stagedLock !== lockId) {
        const rebound = await patchFiltered<DetailRow>(
            collection,
            {
                _and: [
                    { header_id: { _eq: headerId } },
                    { status: { _eq: "APPROVED" } },
                    { application_status: { _eq: "SCHEDULED" } },
                    { application_started_at: { _null: true } },
                    stagedLock === null
                        ? { application_lock_id: { _null: true } }
                        : { application_lock_id: { _eq: stagedLock } },
                ],
            },
            { application_lock_id: lockId },
            "request_id,header_id,status,application_status,application_lock_id",
        );
        if (rebound.length !== stagedRows.length) {
            throw new UnifiedBatchReconciliationError(`Mixed batch staging progress could not be reclaimed for ${collection}; retry the approval.`);
        }
    }

    if (pendingRows.length > 0) {
        const staged = await patchFiltered<DetailRow>(
            collection,
            {
                _and: [
                    { header_id: { _eq: headerId } },
                    { status: { _eq: "PENDING" } },
                    {
                        _or: [
                            { application_status: { _null: true } },
                            { application_status: { _eq: "FAILED" } },
                        ],
                    },
                    { application_lock_id: { _null: true } },
                ],
            },
            {
                status: "APPROVED",
                approved_by: userId,
                approved_at: now,
                effective_at: effectiveAt,
                application_status: "SCHEDULED",
                application_lock_id: lockId,
                application_started_at: null,
                application_attempts: 0,
                application_error: null,
                applied_at: null,
                applied_by: null,
            },
            "request_id,header_id,status,application_status,application_lock_id",
        );
        if (staged.length !== pendingRows.length) {
            throw new UnifiedBatchReconciliationError(`Mixed batch detail staging was incomplete for ${collection}; retry the approval.`);
        }
    }

    const verified = await fetchApplicationRows(collection, headerId);
    const allStaged = verified.length === expected && verified.every((row) =>
        String(row.status ?? "").toUpperCase() === "APPROVED" &&
        String(row.application_status ?? "").toUpperCase() === "SCHEDULED" &&
        normalizedApplicationLock(row) === lockId &&
        !String(row.application_started_at ?? "").trim(),
    );
    if (!allStaged) {
        throw new UnifiedBatchReconciliationError(`Mixed batch detail staging could not be reconciled for ${collection}; retry the approval.`);
    }
}

async function finalizeHeader(headerId: number, lockId: string, userId: number, now: string, effectiveAt: string) {
    const finalized = await patchFiltered(
        "price_change_headers",
        {
            _and: [
                { header_id: { _eq: headerId } },
                { status: { _eq: "PENDING" } },
                { application_status: { _eq: "APPLYING" } },
                { application_lock_id: { _eq: lockId } },
            ],
        },
        {
            status: "APPROVED",
            approved_by: userId,
            approved_at: now,
            effective_at: effectiveAt,
            application_status: "SCHEDULED",
            application_lock_id: null,
            application_started_at: null,
            application_attempts: 0,
            application_error: null,
            applied_at: null,
            applied_by: null,
        },
        "header_id,status,application_status,effective_at",
    );

    if (!finalized[0]) throw new Error("Mixed batch approval lock was lost before staging completed.");
}

async function refreshUnifiedApplicationStatus(headerId: number, userId: number | null, lockId?: string) {
    const [priceRows, costRows] = await Promise.all([
        fetchApplicationRows(PRICE_DETAILS, headerId),
        fetchApplicationRows(COST_DETAILS, headerId),
    ]);
    const rows = [...priceRows, ...costRows];
    if (rows.length === 0) return null;

    const hasPendingRows = rows.some((row) => String(row.status ?? "") === "PENDING");
    const approvedRows = rows.filter((row) => String(row.status ?? "") === "APPROVED");
    const statuses = approvedRows.map((row) => String(row.application_status ?? "").toUpperCase());
    const status = hasPendingRows || statuses.includes("FAILED")
        ? "FAILED"
        : statuses.includes("APPLYING")
          ? "APPLYING"
          : statuses.includes("SCHEDULED")
            ? "SCHEDULED"
            : "APPLIED";
    const error = hasPendingRows
        ? "Batch has pending detail rows that were not staged for application."
        : rows.find((row) => row.application_error)?.application_error ?? null;
    const attempts = Math.max(...rows.map((row) => Number(row.application_attempts ?? 0)), 0);

    const headerFilter: Record<string, unknown> = { _and: [{ header_id: { _eq: headerId } }] };
    if (lockId) {
        headerFilter._and = [
            { header_id: { _eq: headerId } },
            { application_status: { _eq: "APPLYING" } },
            { application_lock_id: { _eq: lockId } },
        ];
    }

    const updated = await patchFiltered(
        "price_change_headers",
        headerFilter,
        {
            application_status: status,
            application_attempts: attempts,
            application_error: error,
            application_lock_id: null,
            application_started_at: null,
            ...(status === "APPLIED" ? { applied_at: nowManila(), ...(userId ? { applied_by: userId } : {}) } : {}),
        },
        "header_id,status,application_status,application_attempts,application_error",
    );

    if (lockId && !updated[0]) throw new Error("Mixed batch retry lock was lost before reconciliation.");

    return status;
}

async function applyUnifiedDetails(headerId: number, userId: number) {
    let applied = 0;
    let failed = 0;
    let warning: string | null = null;
    let retryable = false;

    try {
        const [priceRows, costRows] = await Promise.all([
            fetchApplicationRows(PRICE_DETAILS, headerId),
            fetchApplicationRows(COST_DETAILS, headerId),
        ]);

        for (const row of priceRows) {
            const outcome = await executeClaimedApplication({
                collection: PRICE_DETAILS,
                row,
                userId,
                claimFields: ["current_price"],
                apply: async (claimedRow) => {
                    const versionId = pickId(claimedRow.version_id);
                    if (versionId) {
                        await applyProposedVersionPrice({
                            userId,
                            productId: detailProductId(claimedRow),
                            versionId: versionId,
                            priceTypeId: detailPriceTypeId(claimedRow),
                            proposedPrice: Number(claimedRow.proposed_price),
                        });
                    } else {
                        await applyProposedPrice({
                            userId,
                            productId: detailProductId(claimedRow),
                            priceTypeId: detailPriceTypeId(claimedRow),
                            currentPrice: claimedRow.current_price,
                            proposedPrice: Number(claimedRow.proposed_price),
                        });
                    }
                },
            });
            if (outcome.state === "applied") applied += 1;
            if (outcome.state === "failed") failed += 1;
        }

        for (const row of costRows) {
            const outcome = await executeClaimedApplication({
                collection: COST_DETAILS,
                row,
                userId,
                apply: async (claimedRow) => {
                    await patchProductCostField({
                        product_id: detailProductId(claimedRow),
                        proposed_cost: assertValidProposedCost(Number(claimedRow.proposed_cost)),
                        userId,
                    });
                },
            });
            if (outcome.state === "applied") applied += 1;
            if (outcome.state === "failed") failed += 1;
        }
    } catch (error: unknown) {
        const notice = postCommitApplicationNotice(error, "pricing application");
        warning = notice.warning;
        retryable = notice.retryable;
    }

    return { applied, failed, warning, retryable };
}

export async function approveUnifiedBatch(headerId: number, userId: number, effectiveAt?: string | null) {
    const batch = await getBatchForDecision(headerId);
    if (!batch) return { error: "Batch not found", status: 404 } as const;
    if (batch.status !== "PENDING") return { error: "Only PENDING batches can be approved.", status: 409 } as const;
    if (batch.price_details.length === 0 || batch.cost_details.length === 0) {
        return { error: "This batch is not a mixed batch.", status: 400 } as const;
    }

    for (const line of batch.price_details) {
        if (!line.product_id || !line.price_type_id || !isValidPriceValue(line.proposed_price)) {
            return { error: "Mixed batch contains an invalid price detail line.", status: 400 } as const;
        }
    }
    for (const line of batch.cost_details) {
        if (!line.product_id) {
            return { error: "Mixed batch contains an invalid list cost detail line.", status: 400 } as const;
        }
        try {
            assertValidProposedCost(line.proposed_cost);
        } catch (error: unknown) {
            if (isInvalidProposedCostError(error)) {
                return { error: error.message, status: 400 } as const;
            }
            throw error;
        }
    }

    const conflicts = await findPriceSnapshotConflicts(
        batch.price_details.map((line) => ({
            request_id: line.request_id ?? undefined,
            product_id: line.product_id,
            price_type_id: line.price_type_id!,
            current_price: line.current_price,
        })),
    );
    if (conflicts.length > 0) {
        return {
            error: "Mixed batch contains prices that changed after submission.",
            status: 409,
            conflicts,
        } as const;
    }

    const claimed = await claimHeader(headerId);
    if (!claimed) return { error: "Batch approval was already claimed or is no longer pending.", status: 409 } as const;

    const scheduled = Boolean(effectiveAt && new Date(effectiveAt).getTime() > Date.now());
    const effective = effectiveAt || claimed.now;

    try {
        await reconcileDetails(PRICE_DETAILS, headerId, userId, claimed.now, effective, batch.price_details.length, claimed.lockId);
        await reconcileDetails(COST_DETAILS, headerId, userId, claimed.now, effective, batch.cost_details.length, claimed.lockId);
        await finalizeHeader(headerId, claimed.lockId, userId, claimed.now, effective);
    } catch (error: unknown) {
        await patchFiltered(
            "price_change_headers",
            { _and: [{ header_id: { _eq: headerId } }, { application_lock_id: { _eq: claimed.lockId } }] },
            { application_status: "FAILED", application_lock_id: null, application_started_at: null, application_error: error instanceof Error ? error.message : String(error) },
            "header_id,status,application_status,application_error",
        ).catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        return {
            error: message,
            status: error instanceof UnifiedBatchReconciliationError || message.includes("approval lock was lost") ? 409 : 500,
        } as const;
    }

    let applied = 0;
    let failed = 0;
    let warning: string | null = null;
    let retryable = false;
    if (!scheduled) {
        ({ applied, failed, warning, retryable } = await applyUnifiedDetails(headerId, userId));
    }

    let applicationStatus: string | null = null;
    try {
        applicationStatus = await refreshUnifiedApplicationStatus(headerId, userId);
    } catch (error: unknown) {
        const notice = postCommitApplicationNotice(error, "application status reconciliation");
        warning = warning ?? notice.warning;
        retryable = notice.retryable;
    }
    if (failed > 0) {
        warning = warning ?? "Approval was saved, but one or more pricing lines failed to apply. Retry application from the batch details.";
        retryable = true;
    }

    const affected = batch.price_details.length + batch.cost_details.length;
    return {
        ok: true,
        committed: true,
        header_id: headerId,
        affected,
        applied,
        failed,
        scheduled,
        application_status: applicationStatus ?? fallbackApplicationStatus({ scheduled, applied, failed, affected }),
        effective_at: effective,
        warning,
        retryable,
    } as const;
}

async function resetRetryableDetails(collection: string, headerId: number, effectiveAt: string) {
    const rows = await patchFiltered<DetailRow>(
        collection,
        {
            _and: [
                { header_id: { _eq: headerId } },
                { status: { _eq: "APPROVED" } },
                { application_status: { _eq: "FAILED" } },
                { application_attempts: { _lt: APPLICATION_MAX_FAILURES } },
            ],
        },
        {
            application_status: "SCHEDULED",
            application_lock_id: null,
            application_started_at: null,
            application_error: null,
            effective_at: effectiveAt,
        },
        "request_id,header_id,status,application_status,application_attempts",
    );
    return rows.length;
}

export async function retryUnifiedBatch(headerId: number, userId: number) {
    const batch = await getBatchForDecision(headerId);
    if (!batch) return { error: "Batch not found", status: 404 } as const;
    if (batch.price_details.length === 0 || batch.cost_details.length === 0) {
        return { error: "This batch is not a mixed batch.", status: 400 } as const;
    }
    if (String(batch.status).toUpperCase() !== "APPROVED") {
        return { error: "Only approved mixed batches can be retried.", status: 409 } as const;
    }

    const [priceRows, costRows] = await Promise.all([
        fetchApplicationRows(PRICE_DETAILS, headerId),
        fetchApplicationRows(COST_DETAILS, headerId),
    ]);
    const rows = [...priceRows, ...costRows];
    if (rows.some((row) => String(row.status ?? "").toUpperCase() === "PENDING")) {
        return { error: "Mixed batch has pending detail lines and requires reconciliation before retry.", status: 409 } as const;
    }

    const allApplied = rows.length > 0 && rows.every(
        (row) => String(row.application_status ?? "").toUpperCase() === "APPLIED",
    );
    if (allApplied) {
        const applicationStatus = await refreshUnifiedApplicationStatus(headerId, userId);
        return {
            ok: true,
            committed: true,
            idempotent: true,
            header_id: headerId,
            affected: rows.length,
            applied: 0,
            failed: 0,
            application_status: applicationStatus ?? "APPLIED",
            retryable: false,
        } as const;
    }

    const retryableRows = rows.filter((row) => {
        const status = String(row.application_status ?? "").toUpperCase();
        return status === "SCHEDULED" ||
            (status === "FAILED" && Number(row.application_attempts ?? 0) < APPLICATION_MAX_FAILURES);
    });
    if (retryableRows.length === 0) {
        return { error: "This mixed batch has no retryable application lines.", status: 409 } as const;
    }

    const claimed = await claimHeader(headerId, "retry");
    if (!claimed) return { error: "Mixed batch retry is already running or no longer retryable.", status: 409 } as const;

    try {
        const effectiveAt = claimed.now;
        await resetRetryableDetails(PRICE_DETAILS, headerId, effectiveAt);
        await resetRetryableDetails(COST_DETAILS, headerId, effectiveAt);

        const stagedRows = [
            ...(await fetchApplicationRows(PRICE_DETAILS, headerId)),
            ...(await fetchApplicationRows(COST_DETAILS, headerId)),
        ];
        if (stagedRows.some((row) => String(row.status ?? "").toUpperCase() !== "APPROVED")) {
            throw new Error("Mixed batch retry found unresolved detail lines.");
        }

        const result = await applyUnifiedDetails(headerId, userId);
        const applicationStatus = await refreshUnifiedApplicationStatus(headerId, userId, claimed.lockId);
        const retryable = result.failed > 0 || result.retryable || applicationStatus === "SCHEDULED" || applicationStatus === "FAILED";

        return {
            ok: true,
            committed: true,
            header_id: headerId,
            affected: rows.length,
            applied: result.applied,
            failed: result.failed,
            application_status: applicationStatus,
            warning: result.warning ?? (result.failed > 0 ? "One or more mixed batch lines failed to apply. Retry the batch again." : null),
            retryable,
        } as const;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        await patchFiltered(
            "price_change_headers",
            {
                _and: [
                    { header_id: { _eq: headerId } },
                    { status: { _eq: "APPROVED" } },
                    { application_status: { _eq: "APPLYING" } },
                    { application_lock_id: { _eq: claimed.lockId } },
                ],
            },
            {
                application_status: "FAILED",
                application_lock_id: null,
                application_started_at: null,
                application_error: message,
            },
            "header_id,status,application_status,application_error",
        ).catch(() => undefined);

        return {
            error: message,
            status: message.includes("retry lock was lost") ? 409 : 502,
            retryable: true,
        } as const;
    }
}

export async function applyNowUnifiedBatch(headerId: number, userId: number) {
    const batch = await getBatchForDecision(headerId);
    if (!batch) return { error: "Batch not found", status: 404 } as const;
    if (batch.price_details.length === 0 || batch.cost_details.length === 0) {
        return { error: "This batch is not a mixed batch.", status: 400 } as const;
    }
    if (String(batch.status).toUpperCase() !== "APPROVED" || String(batch.application_status).toUpperCase() !== "SCHEDULED") {
        return { error: "Only scheduled approved mixed batches can be applied now.", status: 409 } as const;
    }

    return retryUnifiedBatch(headerId, userId);
}

export async function rejectUnifiedBatch(headerId: number, userId: number, reason: string) {
    const batch = await getBatchForDecision(headerId);
    if (!batch) return { error: "Batch not found", status: 404 } as const;
    if (batch.status !== "PENDING") return { error: "Only PENDING batches can be rejected.", status: 409 } as const;
    if (batch.price_details.length === 0 || batch.cost_details.length === 0) {
        return { error: "This batch is not a mixed batch.", status: 400 } as const;
    }

    const claimed = await claimHeader(headerId);
    if (!claimed) return { error: "Batch rejection was already claimed or is no longer pending.", status: 409 } as const;

    try {
        const detailGroups = await Promise.all(
            [PRICE_DETAILS, COST_DETAILS].map(async (collection) => ({
                collection,
                rows: await fetchApplicationRows(collection, headerId),
            })),
        );

        for (const { collection, rows } of detailGroups) {
            const pendingRows = rows.filter((row) => String(row.status ?? "").toUpperCase() === "PENDING");
            if (pendingRows.length === 0) continue;

            const rejectedRows = await patchFiltered<DetailRow>(
                collection,
                { _and: [{ header_id: { _eq: headerId } }, { status: { _eq: "PENDING" } }] },
                {
                    status: "REJECTED",
                    rejected_by: userId,
                    rejected_at: claimed.now,
                    reject_reason: reason,
                    application_status: null,
                    application_lock_id: null,
                    application_started_at: null,
                    application_error: null,
                },
                "request_id,header_id,status",
            );
            if (rejectedRows.length !== pendingRows.length) {
                throw new Error(`Mixed batch rejection was incomplete for ${collection}.`);
            }
        }

        const [priceRows, costRows] = await Promise.all([
            fetchApplicationRows(PRICE_DETAILS, headerId),
            fetchApplicationRows(COST_DETAILS, headerId),
        ]);
        if ([...priceRows, ...costRows].some((row) => String(row.status ?? "").toUpperCase() !== "REJECTED")) {
            throw new Error("Mixed batch rejection left one or more detail lines unresolved.");
        }

        const finalized = await patchFiltered(
            "price_change_headers",
            {
                _and: [
                    { header_id: { _eq: headerId } },
                    { status: { _eq: "PENDING" } },
                    { application_status: { _eq: "APPLYING" } },
                    { application_lock_id: { _eq: claimed.lockId } },
                ],
            },
            {
                status: "REJECTED",
                rejected_by: userId,
                rejected_at: claimed.now,
                reject_reason: reason,
                application_status: null,
                application_lock_id: null,
                application_started_at: null,
                application_error: null,
            },
            "header_id,status",
        );
        if (!finalized[0]) throw new Error("Mixed batch rejection lock was lost before finalization.");

        return { ok: true, header_id: headerId, rejected: batch.price_details.length + batch.cost_details.length } as const;
    } catch (error: unknown) {
        await patchFiltered(
            "price_change_headers",
            {
                _and: [
                    { header_id: { _eq: headerId } },
                    { status: { _eq: "PENDING" } },
                    { application_status: { _eq: "APPLYING" } },
                    { application_lock_id: { _eq: claimed.lockId } },
                ],
            },
            {
                application_status: "FAILED",
                application_lock_id: null,
                application_started_at: null,
                application_error: error instanceof Error ? error.message : String(error),
            },
            "header_id,status,application_status,application_error",
        ).catch(() => undefined);

        const message = error instanceof Error ? error.message : String(error);
        return {
            error: message,
            status: message.includes("rejection lock was lost") ? 409 : 500,
        } as const;
    }
}
