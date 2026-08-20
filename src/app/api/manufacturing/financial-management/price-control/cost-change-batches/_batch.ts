import { NextResponse } from "next/server";

import { invalidateGroupIndexCacheOnCatalogChange } from "../_productGroupIndexCache";
import {
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    directusHeaders,
    fetchDirectus,
    fetchUserNamesById,
    getSupplierNamesByProductId,
    HEADERS,
    isRecord,
    mustBase,
    nowManila,
    pickId,
    resolveBatchDecisionUserNames,
    resolveUserDisplayName,
    supplierNameOf,
    type DirectusFlagValue,
} from "../price-change-batches/_batch";

import type { NormalizedCostBulkItem } from "../cost-change-requests/_bulk";
import { patchProductCostField } from "../cost-change-requests/_actions";
import {
    assertValidProposedCost,
    isInvalidProposedCostError,
} from "../cost-change-requests/_costValidation";
import { resolveBatchReferenceNo } from "../_batchReference";

export {
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    fetchUserNamesById,
    getSupplierNamesByProductId,
    isRecord,
    pickId,
    resolveBatchDecisionUserNames,
    resolveUserDisplayName,
};

export const COST_HEADERS = HEADERS;
export const COST_DETAILS = "cost_change_requests";

type DirectusSingle<T> = { data?: T };
type DirectusList<T> = { data?: T[] };

const COST_BATCH_STORAGE_ERROR =
    "List cost batch storage is not configured. Confirm cost_change_requests.header_id exists and is readable/writable by the Directus token.";

type DirectusUserRelation = {
    id?: number | string | null;
    user_id?: number | string | null;
    user_fname?: string | null;
    user_mname?: string | null;
    user_lname?: string | null;
    suffix_name?: string | null;
    nickname?: string | null;
    user_email?: string | null;
};

export type CostHeaderRow = {
    id?: number | string | null;
    header_id?: number | string | null;
    supplier_id?: number | string | {
        id?: number | string | null;
        supplier_name?: string | null;
        supplier_shortcut?: string | null;
        isActive?: DirectusFlagValue;
        nonBuy?: DirectusFlagValue;
    } | null;
    reference_no?: string | null;
    remarks?: string | null;
    status?: string | null;
    requested_by?: number | string | DirectusUserRelation | null;
    requested_at?: string | null;
    approved_by?: number | string | DirectusUserRelation | null;
    approved_at?: string | null;
    rejected_by?: number | string | DirectusUserRelation | null;
    rejected_at?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_lock_id?: string | null;
    application_started_at?: string | null;
    application_attempts?: number | string | null;
    application_error?: string | null;
    applied_at?: string | null;
    applied_by?: number | string | DirectusUserRelation | null;
};

export type CostDetailRow = {
    request_id?: number | string | null;
    header_id?: number | string | CostHeaderRow | null;
    product_id?:
        | number
        | string
        | {
              product_id?: number | string | null;
              product_code?: string | null;
              product_name?: string | null;
          }
        | null;
    current_cost?: number | string | null;
    proposed_cost?: number | string | null;
    status?: string | null;
    requested_by?: number | string | null;
    requested_at?: string | null;
    reject_reason?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_lock_id?: string | null;
    application_started_at?: string | null;
    application_attempts?: number | string | null;
    application_error?: string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
};

export function normalizeCostHeaderId(header: CostHeaderRow): number {
    return pickId(header.header_id) ?? pickId(header.id) ?? 0;
}

export function normalizeCostProductId(detail: CostDetailRow): number {
    return pickId(detail.product_id) ?? 0;
}

export function normalizeCostHeaderIdOfDetail(detail: CostDetailRow): number {
    const raw = detail.header_id;
    if (isRecord(raw)) return pickId(raw.header_id ?? raw.id) ?? 0;
    return pickId(raw) ?? 0;
}

function normalizeCostRequestId(detail: CostDetailRow): number {
    return pickId(detail.request_id) ?? 0;
}

function isHeaderFieldAccessError(error: unknown): boolean {
    if (!(error instanceof Error) || !error.message) return false;

    try {
        const parsed: unknown = JSON.parse(error.message);
        if (!isRecord(parsed)) return false;

        const status = Number(parsed.status);
        const url = String(parsed.url ?? "");
        const body = String(parsed.body ?? "");
        const text = `${url} ${body}`.toLowerCase();

        return [400, 401, 403, 404].includes(status) && text.includes(COST_DETAILS) && text.includes("header_id");
    } catch {
        return false;
    }
}

export async function assertCostBatchStorageReady() {
    const params = new URLSearchParams();
    params.set("limit", "1");
    params.set("fields", "request_id,header_id");

    try {
        await fetchDirectus<DirectusList<Pick<CostDetailRow, "request_id" | "header_id">>>(
            `${mustBase()}/items/${COST_DETAILS}?${params.toString()}`,
            { headers: directusHeaders() },
        );
    } catch (error: unknown) {
        if (isHeaderFieldAccessError(error)) {
            throw new Error(COST_BATCH_STORAGE_ERROR);
        }
        throw error;
    }
}

export function isCostBatchStorageSetupError(error: unknown): error is Error {
    return error instanceof Error && error.message === COST_BATCH_STORAGE_ERROR;
}

export function mapCostBatchHeaderResponse(row: CostHeaderRow, lineCount = 0) {
    const headerId = normalizeCostHeaderId(row);
    const supplierId = pickId(row.supplier_id);
    return {
        id: headerId,
        header_id: headerId,
        supplier_id: supplierId,
        supplier_name: supplierNameOf(row.supplier_id) || null,
        reference_no: row.reference_no ?? "",
        remarks: row.remarks ?? "",
        status: row.status ?? "PENDING",
        requested_by: row.requested_by ?? null,
        requested_at: row.requested_at ?? null,
        approved_by: row.approved_by ?? null,
        approved_at: row.approved_at ?? null,
        rejected_by: row.rejected_by ?? null,
        rejected_at: row.rejected_at ?? null,
        reject_reason: row.reject_reason ?? null,
        effective_at: row.effective_at ?? null,
        application_status: row.application_status ?? null,
        applied_at: row.applied_at ?? null,
        applied_by: row.applied_by ?? null,
        line_count: lineCount,
    };
}

export async function createCostBatchDetails(args: {
    userId: number;
    headerId: number;
    itemsToCreate: NormalizedCostBulkItem[];
    requestedAt?: string;
}) {
    const { userId, headerId, itemsToCreate } = args;
    if (itemsToCreate.length === 0) {
        return { created: 0, detailRows: [] as CostDetailRow[] };
    }

    const validatedItems = itemsToCreate.map((item, index) => ({
        ...item,
        proposed_cost: assertValidProposedCost(
            item.proposed_cost,
            `items[${index}].proposed_cost`,
        ),
    }));

    const requestedAt = args.requestedAt ?? nowManila();
    const detailPayload = validatedItems.map((item) => ({
        header_id: headerId,
        product_id: item.product_id,
        current_cost: item.current_cost,
        proposed_cost: item.proposed_cost,
        status: "PENDING",
        requested_by: userId,
        requested_at: requestedAt,
    }));

    const details = await fetchDirectus<DirectusList<CostDetailRow>>(`${mustBase()}/items/${COST_DETAILS}`, {
        method: "POST",
        headers: directusHeaders(),
        body: JSON.stringify(detailPayload),
    });
    const createdDetails = details.data ?? [];

    const detailsMissingHeader = createdDetails.filter((detail) => {
        const requestId = normalizeCostRequestId(detail);
        return requestId > 0 && normalizeCostHeaderIdOfDetail(detail) !== headerId;
    });

    if (detailsMissingHeader.length > 0) {
        await Promise.all(
            detailsMissingHeader.map((detail) =>
                fetchDirectus(`${mustBase()}/items/${COST_DETAILS}/${normalizeCostRequestId(detail)}`, {
                    method: "PATCH",
                    headers: directusHeaders(),
                    body: JSON.stringify({ header_id: headerId }),
                }),
            ),
        );
    }

    const linkedDetails = await getCostDetails(headerId);
    if (linkedDetails.length !== detailPayload.length) {
        throw new Error(
            "List cost batch detail creation was incomplete. Confirm cost_change_requests.header_id exists and is writable.",
        );
    }

    return {
        created: linkedDetails.length,
        detailRows: linkedDetails,
    };
}

export async function createPendingCostBatch(args: {
    userId: number;
    itemsToCreate: NormalizedCostBulkItem[];
    supplierId?: number | null;
    referenceNo?: string;
    remarks?: string;
}) {
    const { userId, itemsToCreate } = args;
    if (itemsToCreate.length === 0) {
        return { created: 0, headerId: 0, headerRow: null as CostHeaderRow | null, detailRows: [] as CostDetailRow[] };
    }

    await assertCostBatchStorageReady();

    const requestedAt = nowManila();
    const referenceNo = resolveBatchReferenceNo(args.referenceNo, requestedAt);
    const headerPayload = {
        ...(args.supplierId ? { supplier_id: args.supplierId } : {}),
        reference_no: referenceNo,
        remarks: args.remarks?.trim() || "List cost change request",
        status: "PENDING",
        requested_by: userId,
        requested_at: requestedAt,
    };

    const header = await fetchDirectus<DirectusSingle<CostHeaderRow>>(`${mustBase()}/items/${COST_HEADERS}`, {
        method: "POST",
        headers: directusHeaders(),
        body: JSON.stringify(headerPayload),
    });

    const headerId = header.data ? normalizeCostHeaderId(header.data) : 0;
    if (!headerId) throw new Error("Cost change header was created without an id");

    const details = await createCostBatchDetails({
        userId,
        headerId,
        itemsToCreate,
        requestedAt,
    });

    return {
        headerId,
        created: details.created,
        headerRow: {
            ...(header.data ?? {}),
            header_id: headerId,
            reference_no: header.data?.reference_no?.trim() || referenceNo,
        },
        detailRows: details.detailRows,
    };
}

export async function getCostHeader(headerId: number) {
    const params = new URLSearchParams();
    params.set(
        "fields",
        [
            "header_id",
            "supplier_id",
            "supplier_id.id",
            "supplier_id.supplier_name",
            "supplier_id.supplier_shortcut",
            "supplier_id.isActive",
            "supplier_id.nonBuy",
            "reference_no",
            "remarks",
            "status",
            "requested_by",
            "requested_by.user_id",
            "requested_by.user_fname",
            "requested_by.user_mname",
            "requested_by.user_lname",
            "requested_by.user_email",
            "requested_at",
            "approved_by",
            "approved_by.user_id",
            "approved_by.user_fname",
            "approved_by.user_mname",
            "approved_by.user_lname",
            "approved_by.suffix_name",
            "approved_by.nickname",
            "approved_by.user_email",
            "approved_at",
            "rejected_by",
            "rejected_by.user_id",
            "rejected_by.user_fname",
            "rejected_by.user_mname",
            "rejected_by.user_lname",
            "rejected_by.suffix_name",
            "rejected_by.nickname",
            "rejected_by.user_email",
            "rejected_at",
            "reject_reason",
            "effective_at",
            "application_status",
            "application_lock_id",
            "application_started_at",
            "application_attempts",
            "application_error",
            "applied_at",
            "applied_by",
            "applied_by.user_id",
            "applied_by.user_fname",
            "applied_by.user_mname",
            "applied_by.user_lname",
            "applied_by.suffix_name",
            "applied_by.nickname",
            "applied_by.user_email",
        ].join(","),
    );

    const url = `${mustBase()}/items/${COST_HEADERS}/${headerId}?${params.toString()}`;
    const json = await fetchDirectus<DirectusSingle<CostHeaderRow>>(url, { headers: directusHeaders() });
    return json.data ?? null;
}

export async function getCostDetails(headerId: number) {
    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set("sort", "request_id");
    params.set("filter[header_id][_eq]", String(headerId));
    params.set(
        "fields",
        [
            "request_id",
            "header_id",
            "product_id",
            "product_id.product_id",
            "product_id.product_code",
            "product_id.product_name",
            "product_id.unit_of_measurement.unit_id",
            "product_id.unit_of_measurement.unit_name",
            "product_id.unit_of_measurement.unit_shortcut",
            "current_cost",
            "proposed_cost",
            "status",
            "requested_by",
            "requested_at",
            "reject_reason",
            "effective_at",
            "application_status",
            "application_lock_id",
            "application_started_at",
            "application_attempts",
            "application_error",
            "applied_at",
            "applied_by",
        ].join(","),
    );

    const url = `${mustBase()}/items/${COST_DETAILS}?${params.toString()}`;
    const json = await fetchDirectus<DirectusList<CostDetailRow>>(url, { headers: directusHeaders() });
    return json.data ?? [];
}

export function normalizeEffectiveAt(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized || null;
}

export async function approveCostBatch(headerId: number, userId: number, effectiveAt?: string | null) {
    const header = await getCostHeader(headerId);
    if (!header) return NextResponse.json({ error: "Cost batch not found" }, { status: 404 });
    if (String(header.status ?? "") !== "PENDING") {
        return NextResponse.json({ error: "Only PENDING cost batches can be approved." }, { status: 400 });
    }

    const details = await getCostDetails(headerId);
    if (details.length === 0) {
        return NextResponse.json({ error: "Cost batch has no detail lines." }, { status: 400 });
    }

    const normalized = details.map((line) => ({
        requestId: pickId(line.request_id) ?? 0,
        productId: normalizeCostProductId(line),
        proposedCost: line.proposed_cost,
    }));

    for (const line of normalized) {
        if (!line.productId) {
            return NextResponse.json({ error: "Cost batch contains an invalid detail line." }, { status: 400 });
        }

        try {
            line.proposedCost = assertValidProposedCost(line.proposedCost);
        } catch (error: unknown) {
            if (isInvalidProposedCostError(error)) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            throw error;
        }
    }

    const {
        executeClaimedApplication,
        fallbackApplicationStatus,
        postCommitApplicationNotice,
        refreshBatchApplicationStatus,
        stageBatchApproval,
    } =
        await import("../_applicationEngine");
    const staged = await stageBatchApproval({ detailCollection: COST_DETAILS, headerId, userId, effectiveAt });
    if (!staged) {
        return NextResponse.json({ error: "Cost batch approval was already claimed or is no longer pending." }, { status: 409 });
    }

    let applied = 0;
    let failed = 0;
    let warning: string | null = null;
    let retryable = false;
    if (!staged.scheduled) {
        try {
            const stagedDetails = await getCostDetails(headerId);
            for (const row of stagedDetails) {
                const outcome = await executeClaimedApplication({
                    collection: COST_DETAILS,
                    row,
                    userId,
                    apply: async (claimed) => {
                        const product_id = normalizeCostProductId(claimed);
                        const proposed_cost = Number(claimed.proposed_cost);
                        if (!product_id || !Number.isFinite(proposed_cost)) {
                            throw new Error("Cost batch contains an invalid detail line.");
                        }
                        await patchProductCostField({ product_id, proposed_cost, userId });
                    },
                });
                if (outcome.state === "applied") applied += 1;
                if (outcome.state === "failed") failed += 1;
            }
        } catch (error: unknown) {
            const notice = postCommitApplicationNotice(error, "list cost application");
            warning = notice.warning;
            retryable = notice.retryable;
        }
    }

    let applicationStatus: string | null = null;
    try {
        applicationStatus = await refreshBatchApplicationStatus({
            detailCollection: COST_DETAILS,
            headerId,
            userId,
        });
    } catch (error: unknown) {
        const notice = postCommitApplicationNotice(error, "application status reconciliation");
        warning = warning ?? notice.warning;
        retryable = notice.retryable;
    }
    if (failed > 0) {
        warning = warning ?? "Approval was saved, but one or more list cost lines failed to apply. Retry application from the batch details.";
        retryable = true;
    }
    if (applied > 0) {
        try {
            invalidateGroupIndexCacheOnCatalogChange();
        } catch (error: unknown) {
            const notice = postCommitApplicationNotice(error, "pricing cache refresh");
            warning = warning ?? notice.warning;
            retryable = notice.retryable;
        }
    }

    const affected = normalized.length;

    return NextResponse.json({
        ok: true,
        committed: true,
        header_id: headerId,
        affected,
        applied,
        failed,
        scheduled: staged.scheduled,
        application_status: applicationStatus ?? fallbackApplicationStatus({ scheduled: staged.scheduled, applied, failed, affected }),
        effective_at: staged.effectiveAt,
        warning,
        retryable,
    }, { status: failed > 0 || retryable ? 202 : 200 });
}

export async function rejectCostBatch(headerId: number, userId: number, rejectReason: string) {
    const header = await getCostHeader(headerId);
    if (!header) return NextResponse.json({ error: "Cost batch not found" }, { status: 404 });
    if (String(header.status ?? "") !== "PENDING") {
        return NextResponse.json({ error: "Only PENDING cost batches can be rejected." }, { status: 400 });
    }

    const details = await getCostDetails(headerId);
    const rejectedAt = nowManila();

    await fetchDirectus(`${mustBase()}/items/${COST_HEADERS}/${headerId}`, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({
            status: "REJECTED",
            rejected_by: userId,
            rejected_at: rejectedAt,
            reject_reason: rejectReason,
        }),
    });

    await Promise.all(
        details
            .map((line) => pickId(line.request_id))
            .filter((lineId): lineId is number => Boolean(lineId))
            .map((lineId) =>
                fetchDirectus(`${mustBase()}/items/${COST_DETAILS}/${lineId}`, {
                    method: "PATCH",
                    headers: directusHeaders(),
                    body: JSON.stringify({
                        status: "REJECTED",
                        rejected_by: userId,
                        rejected_at: rejectedAt,
                        reject_reason: rejectReason,
                    }),
                }),
            ),
    );

    return NextResponse.json({ ok: true, header_id: headerId, rejected: details.length });
}

export function costBatchErrorResponse(error: unknown) {
    const response = directusErrorResponse(error);
    return response;
}
