import { NextRequest, NextResponse } from "next/server";

import { invalidateGroupIndexCacheOnCatalogChange } from "../../_productGroupIndexCache";
import {
    executeClaimedApplication,
    refreshBatchApplicationStatus,
    resetFailedApplication,
    resetFailedBatchHeader,
    type ApplicationRow,
} from "../../_applicationEngine";
import {
    DETAILS as PRICE_DETAILS,
    HEADERS,
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    directusHeaders,
    fetchDirectus,
    findPriceSnapshotConflicts,
    getDetails,
    getHeader,
    mustBase,
    normalizePriceTypeId,
    normalizeProductId,
    nowManila,
    pickId,
    readAuditUserId,
    type BatchDetailRow,
} from "../../price-change-batches/_batch";
import { assertValidPriceValue } from "../../_pricePrecision";
import { applyProposedPrice, getPriceRequest, type PcrRow } from "../../price-change-requests/_actions";
import { CCR, getCostRequest, patchProductCostField, type CcrRow } from "../../cost-change-requests/_actions";
import { COST_DETAILS, getCostDetails, getCostHeader } from "../../cost-change-batches/_batch";
import { applyNowUnifiedBatch, retryUnifiedBatch } from "../../_unifiedBatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OverrideKind = "price_request" | "price_batch" | "cost_request" | "cost_batch" | "mixed_batch";
type OverrideAction = "reschedule" | "apply_now" | "cancel_schedule" | "reject_schedule" | "retry_application";

type OverrideBody = Partial<{
    kind: OverrideKind;
    id: number;
    action: OverrideAction;
    effective_at: string | null;
    reject_reason: string | null;
}>;

type BatchApplyFailure = {
    request_id: number;
    message: string;
};

function assertFutureDate(value?: string | null) {
    if (!value) throw new Error("effective_at is required.");
    const time = new Date(value).getTime();
    if (!Number.isFinite(time) || time <= Date.now()) {
        throw new Error("effective_at must be a valid future date/time.");
    }
}

function applicationStatus(row: { application_status?: string | null } | null) {
    return String(row?.application_status ?? "").toUpperCase();
}

function isScheduledApproved(row: { status?: string | null; application_status?: string | null } | null) {
    return String(row?.status ?? "") === "APPROVED" && applicationStatus(row) === "SCHEDULED";
}

function isPendingDetail(row: { status?: string | null; application_status?: string | null } | null) {
    return String(row?.status ?? "") === "PENDING" && !applicationStatus(row);
}

function isFutureScheduledApproved(
    row: { status?: string | null; application_status?: string | null; effective_at?: string | null } | null,
) {
    if (!isScheduledApproved(row)) return false;
    const time = new Date(row?.effective_at ?? "").getTime();
    return Number.isFinite(time) && time > Date.now();
}

function requireRejectReason(value?: string | null) {
    const reason = String(value ?? "").trim();
    if (!reason) throw new Error("reject_reason is required.");
    return reason;
}

function failedApplyResponse(args: {
    kind: OverrideKind;
    action: OverrideAction;
    id: number;
    message: string;
    status: 409 | 502;
    extra?: Record<string, unknown>;
}) {
    return NextResponse.json(
        {
            ok: false,
            kind: args.kind,
            action: args.action,
            id: args.id,
            error: args.message,
            ...args.extra,
        },
        { status: args.status },
    );
}

async function patchRows(collection: string, ids: number[], patch: Record<string, unknown>) {
    await Promise.all(
        ids.filter((id) => id > 0).map((id) =>
            fetchDirectus(`${mustBase()}/items/${collection}/${id}`, {
                method: "PATCH",
                headers: directusHeaders(),
                body: JSON.stringify(patch),
            }),
        ),
    );
}

async function stageLegacyPendingRows(collection: string, ids: number[], userId: number) {
    if (ids.length === 0) return;
    const now = nowManila();
    await patchRows(collection, ids, {
        status: "APPROVED",
        approved_by: userId,
        approved_at: now,
        effective_at: now,
        application_status: "SCHEDULED",
        application_lock_id: null,
        application_started_at: null,
        application_attempts: 0,
        application_error: null,
        applied_at: null,
        applied_by: null,
    });
}

async function failLegacyPendingRows(collection: string, headerId: number, ids: number[], message: string) {
    if (ids.length === 0) return;
    await patchRows(collection, ids, {
        status: "APPROVED",
        application_status: "FAILED",
        application_lock_id: null,
        application_started_at: null,
        application_attempts: 3,
        application_error: message,
    });
    await patchRows(HEADERS, [headerId], {
        application_status: "FAILED",
        application_lock_id: null,
        application_started_at: null,
        application_error: message,
    });
}

async function rescheduleRequest(collection: string, id: number, effectiveAt?: string | null) {
    assertFutureDate(effectiveAt);
    await patchRows(collection, [id], { effective_at: effectiveAt, application_status: "SCHEDULED" });
}

async function cancelScheduledRequest(collection: string, id: number) {
    await patchRows(collection, [id], { application_status: "CANCELLED" });
}

async function rejectScheduledRequest(collection: string, id: number, userId: number, rejectReason: string) {
    await patchRows(collection, [id], {
        status: "REJECTED",
        application_status: "CANCELLED",
        rejected_by: userId,
        rejected_at: nowManila(),
        reject_reason: rejectReason,
    });
}

async function applyPriceNow(row: PcrRow, userId: number, effectiveAt = nowManila()) {
    return executeClaimedApplication({
        collection: PRICE_DETAILS,
        row,
        userId,
        effectiveAt,
        claimFields: ["current_price"],
        apply: async (claimed) => {
            const productId = normalizeProductId(claimed as unknown as BatchDetailRow);
            const priceTypeId = normalizePriceTypeId(claimed as unknown as BatchDetailRow);
            const proposedPrice = Number(claimed.proposed_price);
            if (!productId || !priceTypeId || !Number.isFinite(proposedPrice)) {
                throw new Error("Scheduled price request has invalid product, price type, or proposed price.");
            }
            await applyProposedPrice({
                userId,
                createdBy: readAuditUserId(claimed.requested_by),
                productId,
                priceTypeId,
                currentPrice: claimed.current_price,
                proposedPrice,
            });
        },
    });
}

async function applyCostNow(row: CcrRow, userId: number, effectiveAt = nowManila()) {
    return executeClaimedApplication({
        collection: CCR,
        row,
        userId,
        effectiveAt,
        apply: async (claimed) => {
            const product_id = pickId(claimed.product_id) ?? 0;
            const proposed_cost = Number(claimed.proposed_cost);
            if (!product_id || !Number.isFinite(proposed_cost)) {
                throw new Error("Scheduled cost request has invalid product or proposed cost.");
            }
            await patchProductCostField({ product_id, proposed_cost, userId });
        },
    });
}

async function prepareRetry<T extends ApplicationRow>(collection: string, row: T) {
    const id = pickId(row.request_id) ?? 0;
    if (!id || applicationStatus(row) !== "FAILED") return row;
    return ((await resetFailedApplication(collection, id, nowManila())) as T | null) ?? row;
}

async function applyPriceBatchNow(headerId: number, userId: number, retryFailed: boolean) {
    let details = await getDetails(headerId);
    const pendingDetails = retryFailed ? details.filter(isPendingDetail) : [];
    if (retryFailed && pendingDetails.length === 0 && !(await resetFailedBatchHeader(headerId))) {
        const header = await getHeader(headerId);
        if (applicationStatus(header) !== "APPLIED") {
            return { affected: 0, applied: 0, failed: 0, skipped: 1, failures: [] as BatchApplyFailure[], application_status: null };
        }
    }
    if (pendingDetails.length > 0) {
        const pendingIds = pendingDetails.map((row) => pickId(row.request_id)).filter((id): id is number => Boolean(id));
        const conflicts = await findPriceSnapshotConflicts(
            pendingDetails.map((row) => ({
                request_id: pickId(row.request_id) ?? 0,
                product_id: normalizeProductId(row),
                price_type_id: normalizePriceTypeId(row),
                current_price: row.current_price,
            })),
        );
        for (const row of pendingDetails) {
            assertValidPriceValue(row.proposed_price, "proposed_price");
        }
        if (conflicts.length > 0) {
            const message = "Batch contains prices that changed after submission.";
            await failLegacyPendingRows(PRICE_DETAILS, headerId, pendingIds, message);
            return {
                affected: pendingIds.length,
                applied: 0,
                failed: pendingIds.length,
                skipped: 0,
                failures: conflicts.map((conflict) => ({
                    request_id: conflict.request_id,
                    message,
                })),
                application_status: "FAILED",
            };
        }
        await stageLegacyPendingRows(PRICE_DETAILS, pendingIds, userId);
        await patchRows(HEADERS, [headerId], {
            status: "APPROVED",
            application_status: "SCHEDULED",
            application_lock_id: null,
            application_started_at: null,
            application_error: null,
        });
        details = await getDetails(headerId);
    }
    const failures: BatchApplyFailure[] = [];
    let applied = 0;
    let failed = 0;
    let skipped = 0;
    for (const original of details) {
        if (!["SCHEDULED", ...(retryFailed ? ["FAILED"] : [])].includes(applicationStatus(original))) continue;
        const row = retryFailed ? await prepareRetry(PRICE_DETAILS, original) : original;
        const outcome = await applyPriceNow(row as PcrRow, userId);
        if (outcome.state === "applied") applied += 1;
        if (outcome.state === "failed") {
            failed += 1;
            failures.push({
                request_id: pickId(original.request_id) ?? 0,
                message: outcome.error ?? "Application failed.",
            });
        }
        if (outcome.state === "skipped") skipped += 1;
    }
    const status = await refreshBatchApplicationStatus({ detailCollection: PRICE_DETAILS, headerId, userId });
    return { affected: applied + failed + skipped, applied, failed, skipped, failures, application_status: status };
}

async function applyCostBatchNow(headerId: number, userId: number, retryFailed: boolean) {
    let details = await getCostDetails(headerId);
    const pendingDetails = retryFailed ? details.filter(isPendingDetail) : [];
    if (retryFailed && pendingDetails.length === 0 && !(await resetFailedBatchHeader(headerId))) {
        const header = await getCostHeader(headerId);
        if (applicationStatus(header) !== "APPLIED") {
            return { affected: 0, applied: 0, failed: 0, skipped: 1, failures: [] as BatchApplyFailure[], application_status: null };
        }
    }
    if (pendingDetails.length > 0) {
        const pendingIds = pendingDetails.map((row) => pickId(row.request_id)).filter((id): id is number => Boolean(id));
        await stageLegacyPendingRows(COST_DETAILS, pendingIds, userId);
        await patchRows(HEADERS, [headerId], {
            status: "APPROVED",
            application_status: "SCHEDULED",
            application_lock_id: null,
            application_started_at: null,
            application_error: null,
        });
        details = await getCostDetails(headerId);
    }
    const failures: BatchApplyFailure[] = [];
    let applied = 0;
    let failed = 0;
    let skipped = 0;
    for (const original of details) {
        if (!["SCHEDULED", ...(retryFailed ? ["FAILED"] : [])].includes(applicationStatus(original))) continue;
        const row = retryFailed ? await prepareRetry(COST_DETAILS, original) : original;
        const outcome = await applyCostNow(row as CcrRow, userId);
        if (outcome.state === "applied") applied += 1;
        if (outcome.state === "failed") {
            failed += 1;
            failures.push({
                request_id: pickId(original.request_id) ?? 0,
                message: outcome.error ?? "Application failed.",
            });
        }
        if (outcome.state === "skipped") skipped += 1;
    }
    const status = await refreshBatchApplicationStatus({ detailCollection: COST_DETAILS, headerId, userId });
    return { affected: applied + failed + skipped, applied, failed, skipped, failures, application_status: status };
}

async function patchBatchSchedule(collection: string, headerId: number, patch: Record<string, unknown>) {
    const detailRows = collection === PRICE_DETAILS ? await getDetails(headerId) : await getCostDetails(headerId);
    const ids = detailRows.map((row) => pickId(row.request_id)).filter((id): id is number => Boolean(id));
    await patchRows(HEADERS, [headerId], patch);
    await patchRows(collection, ids, patch);
    return ids.length;
}

async function rejectScheduledBatch(collection: string, headerId: number, userId: number, rejectReason: string) {
    return patchBatchSchedule(collection, headerId, {
        status: "REJECTED",
        application_status: "CANCELLED",
        rejected_by: userId,
        rejected_at: nowManila(),
        reject_reason: rejectReason,
    });
}

export async function POST(req: NextRequest) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await req.json().catch(() => ({}))) as OverrideBody;
        const kind = body.kind;
        const action = body.action;
        const id = Number(body.id);

        if (!kind || !["price_request", "price_batch", "cost_request", "cost_batch", "mixed_batch"].includes(kind)) {
            return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
        }
        if (!action || !["reschedule", "apply_now", "cancel_schedule", "reject_schedule", "retry_application"].includes(action)) {
            return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
        }
        if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "id is required" }, { status: 400 });

        if (kind === "mixed_batch") {
            if (action !== "apply_now" && action !== "retry_application") {
                return NextResponse.json({ error: "Mixed batches only support apply_now or retry_application from this route." }, { status: 400 });
            }

            const result = action === "apply_now"
                ? await applyNowUnifiedBatch(id, userId)
                : await retryUnifiedBatch(id, userId);
            if ("status" in result) {
                return failedApplyResponse({
                    kind,
                    action,
                    id,
                    status: result.status === 409 ? 409 : 502,
                    message: result.error ?? "Mixed batch retry failed.",
                    extra: "retryable" in result ? { retryable: result.retryable } : undefined,
                });
            }
            return NextResponse.json({ kind, action, id, ...result }, {
                status: result.failed > 0 || result.retryable ? 202 : 200,
            });
        }

        const retry = action === "retry_application";
        if (kind === "price_request") {
            let row = await getPriceRequest(id);
            const valid = retry ? applicationStatus(row) === "FAILED" : isFutureScheduledApproved(row);
            if (!row || !valid) return NextResponse.json({ error: "Request is not available for this override." }, { status: 400 });
            if (action === "reschedule") await rescheduleRequest(PRICE_DETAILS, id, body.effective_at);
            if (action === "cancel_schedule") await cancelScheduledRequest(PRICE_DETAILS, id);
            if (action === "reject_schedule") await rejectScheduledRequest(PRICE_DETAILS, id, userId, requireRejectReason(body.reject_reason));
            if (retry) row = (await prepareRetry(PRICE_DETAILS, row)) as PcrRow;
            if (action === "apply_now" || retry) {
                const outcome = await applyPriceNow(row, userId);
                if (outcome.state === "applied") invalidateGroupIndexCacheOnCatalogChange();
                if (outcome.state === "failed") {
                    return failedApplyResponse({
                        kind,
                        action,
                        id,
                        status: 502,
                        message: outcome.error ?? "Scheduled price change application failed.",
                        extra: { outcome },
                    });
                }
                if (outcome.state === "skipped") {
                    return failedApplyResponse({
                        kind,
                        action,
                        id,
                        status: 409,
                        message: "Scheduled price change was already changed or claimed by another process.",
                        extra: { outcome },
                    });
                }
                return NextResponse.json({ ok: true, kind, action, id, outcome });
            }
            return NextResponse.json({ ok: true, kind, action, id });
        }

        if (kind === "cost_request") {
            let row = await getCostRequest(id);
            const valid = retry ? applicationStatus(row) === "FAILED" : isFutureScheduledApproved(row);
            if (!row || !valid) return NextResponse.json({ error: "Request is not available for this override." }, { status: 400 });
            if (action === "reschedule") await rescheduleRequest(CCR, id, body.effective_at);
            if (action === "cancel_schedule") await cancelScheduledRequest(CCR, id);
            if (action === "reject_schedule") await rejectScheduledRequest(CCR, id, userId, requireRejectReason(body.reject_reason));
            if (retry) row = (await prepareRetry(CCR, row)) as CcrRow;
            if (action === "apply_now" || retry) {
                const outcome = await applyCostNow(row, userId);
                if (outcome.state === "applied") invalidateGroupIndexCacheOnCatalogChange();
                if (outcome.state === "failed") {
                    return failedApplyResponse({
                        kind,
                        action,
                        id,
                        status: 502,
                        message: outcome.error ?? "Scheduled list cost change application failed.",
                        extra: { outcome },
                    });
                }
                if (outcome.state === "skipped") {
                    return failedApplyResponse({
                        kind,
                        action,
                        id,
                        status: 409,
                        message: "Scheduled list cost change was already changed or claimed by another process.",
                        extra: { outcome },
                    });
                }
                return NextResponse.json({ ok: true, kind, action, id, outcome });
            }
            return NextResponse.json({ ok: true, kind, action, id });
        }

        const header = kind === "price_batch" ? await getHeader(id) : await getCostHeader(id);
        const valid = retry ? ["FAILED", "APPLIED"].includes(applicationStatus(header)) : isFutureScheduledApproved(header);
        if (!header || !valid) return NextResponse.json({ error: "Batch is not available for this override." }, { status: 400 });
        const collection = kind === "price_batch" ? PRICE_DETAILS : COST_DETAILS;
        if (action === "reschedule") {
            assertFutureDate(body.effective_at);
            const affected = await patchBatchSchedule(collection, id, { effective_at: body.effective_at, application_status: "SCHEDULED" });
            return NextResponse.json({ ok: true, kind, action, id, affected });
        }
        if (action === "cancel_schedule") {
            const affected = await patchBatchSchedule(collection, id, { application_status: "CANCELLED" });
            return NextResponse.json({ ok: true, kind, action, id, affected });
        }
        if (action === "reject_schedule") {
            const affected = await rejectScheduledBatch(collection, id, userId, requireRejectReason(body.reject_reason));
            return NextResponse.json({ ok: true, kind, action, id, affected });
        }
        const result = kind === "price_batch"
            ? await applyPriceBatchNow(id, userId, retry)
            : await applyCostBatchNow(id, userId, retry);
        if (result.applied > 0) invalidateGroupIndexCacheOnCatalogChange();
        if (result.failed > 0) {
            return failedApplyResponse({
                kind,
                action,
                id,
                status: 502,
                message: `${result.failed} scheduled change(s) failed to apply.`,
                extra: result,
            });
        }
        if (result.skipped > 0 || result.affected === 0) {
            return failedApplyResponse({
                kind,
                action,
                id,
                status: 409,
                message: "Scheduled batch was already changed or claimed by another process.",
                extra: result,
            });
        }
        return NextResponse.json({ ok: true, kind, action, id, ...result });
    } catch (error: unknown) {
        if (error instanceof Error && (error.message.includes("effective_at") || error.message.includes("reject_reason"))) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return directusErrorResponse(error);
    }
}
