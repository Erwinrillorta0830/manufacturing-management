import { NextRequest, NextResponse } from "next/server";

import { invalidateGroupIndexCacheOnCatalogChange } from "../../_productGroupIndexCache";
import { resolveAuditUserId } from "../../_priceAudit";
import {
    DETAILS as PRICE_DETAILS,
    HEADERS,
    directusErrorResponse,
    directusHeaders,
    fetchDirectus,
    mustBase,
    normalizePriceTypeId,
    normalizeProductId,
    nowManila,
    pickId,
    readAuditUserId,
} from "../../price-change-batches/_batch";
import {
    applyProposedPrice,
    type PcrRow,
} from "../../price-change-requests/_actions";
import {
    CCR,
    patchProductCostField,
    type CcrRow,
} from "../../cost-change-requests/_actions";
import { COST_DETAILS } from "../../cost-change-batches/_batch";
import {
    executeClaimedApplication,
    refreshBatchApplicationStatus,
    staleApplicationCutoff,
} from "../../_applicationEngine";
import { getUnifiedBatch, retryUnifiedBatch } from "../../_unifiedBatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusList<T> = {
    data?: T[];
    meta?: { filter_count?: number | string } | null;
};

const DUE_PAGE_SIZE = 500;

type ApplyFailure = {
    request_id: number;
    message: string;
};

type ScheduledSummary = {
    scanned: number;
    applied: number;
    failed: number;
    skipped: number;
    failures: ApplyFailure[];
};

type HeaderCandidate = {
    header_id?: number | string | null;
    approved_by?: unknown;
    requested_by?: unknown;
};

function schedulerToken() {
    return String(process.env.PRICE_CHANGE_SCHEDULER_TOKEN ?? "").trim();
}

function assertSchedulerToken(req: NextRequest) {
    const expected = schedulerToken();
    if (!expected) {
        return NextResponse.json(
            { error: "PRICE_CHANGE_SCHEDULER_TOKEN is not configured." },
            { status: 500 },
        );
    }

    const actual = String(req.headers.get("x-scheduler-token") ?? "").trim();
    if (actual !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null;
}

async function fetchDuePriceRequests(now: string) {
    const all: PcrRow[] = [];
    let offset = 0;

    while (true) {
        const params = new URLSearchParams();
        params.set("limit", String(DUE_PAGE_SIZE));
        params.set("offset", String(offset));
        params.set(
            "fields",
            [
                "request_id",
                "header_id",
                "product_id",
                "price_type_id",
                "current_price",
                "proposed_price",
                "status",
                "application_status",
                "effective_at",
                "application_lock_id",
                "application_started_at",
                "application_attempts",
                "application_error",
                "approved_by",
                "requested_by",
            ].join(","),
        );
        params.set("filter[_and][0][status][_eq]", "APPROVED");
        params.set("filter[_and][1][_or][0][_and][0][application_status][_eq]", "SCHEDULED");
        params.set("filter[_and][1][_or][0][_and][1][effective_at][_lte]", now);
        params.set("filter[_and][1][_or][1][_and][0][application_status][_eq]", "APPLYING");
        params.set("filter[_and][1][_or][1][_and][1][application_started_at][_lte]", staleApplicationCutoff());
        params.set("sort", "effective_at,request_id");

        const url = `${mustBase()}/items/${PRICE_DETAILS}?${params.toString()}`;
        const json = await fetchDirectus<DirectusList<PcrRow>>(url, { headers: directusHeaders() });
        const rows = json.data ?? [];
        all.push(...rows);

        if (rows.length < DUE_PAGE_SIZE) break;
        offset += DUE_PAGE_SIZE;
    }

    return all;
}

async function fetchDueCostRequests(now: string) {
    const all: CcrRow[] = [];
    let offset = 0;

    while (true) {
        const params = new URLSearchParams();
        params.set("limit", String(DUE_PAGE_SIZE));
        params.set("offset", String(offset));
        params.set(
            "fields",
            [
                "request_id",
                "header_id",
                "product_id",
                "proposed_cost",
                "status",
                "application_status",
                "effective_at",
                "application_lock_id",
                "application_started_at",
                "application_attempts",
                "application_error",
                "approved_by",
                "requested_by",
            ].join(","),
        );
        params.set("filter[_and][0][status][_eq]", "APPROVED");
        params.set("filter[_and][1][_or][0][_and][0][application_status][_eq]", "SCHEDULED");
        params.set("filter[_and][1][_or][0][_and][1][effective_at][_lte]", now);
        params.set("filter[_and][1][_or][1][_and][0][application_status][_eq]", "APPLYING");
        params.set("filter[_and][1][_or][1][_and][1][application_started_at][_lte]", staleApplicationCutoff());
        params.set("sort", "effective_at,request_id");

        const url = `${mustBase()}/items/${CCR}?${params.toString()}`;
        const json = await fetchDirectus<DirectusList<CcrRow>>(url, { headers: directusHeaders() });
        const rows = json.data ?? [];
        all.push(...rows);

        if (rows.length < DUE_PAGE_SIZE) break;
        offset += DUE_PAGE_SIZE;
    }

    return all;
}

async function fetchDueBatchHeaders(now: string) {
    const params = new URLSearchParams();
    params.set("limit", String(DUE_PAGE_SIZE));
    params.set("fields", "header_id,approved_by,requested_by,application_status,effective_at,application_started_at");
    params.set("filter[_and][0][status][_eq]", "APPROVED");
    params.set("filter[_and][1][_or][0][_and][0][application_status][_eq]", "SCHEDULED");
    params.set("filter[_and][1][_or][0][_and][1][effective_at][_lte]", now);
    params.set("filter[_and][1][_or][1][_and][0][application_status][_eq]", "APPLYING");
    params.set("filter[_and][1][_or][1][_and][1][application_started_at][_lte]", staleApplicationCutoff());
    params.set("filter[_and][1][_or][2][application_status][_eq]", "FAILED");

    const response = await fetchDirectus<DirectusList<HeaderCandidate>>(
        `${mustBase()}/items/${HEADERS}?${params.toString()}`,
        { headers: directusHeaders() },
    );
    return response.data ?? [];
}

function auditUserCandidate(source: { approved_by?: unknown; requested_by?: unknown }) {
    return readAuditUserId(source.approved_by) ?? readAuditUserId(source.requested_by);
}

async function resolveSchedulerAuditUserId(
    source: { approved_by?: unknown; requested_by?: unknown },
    fallback?: number | null,
) {
    const candidate = auditUserCandidate(source) ?? fallback ?? null;
    if (!candidate) {
        throw new Error("Scheduled application has no approved or requested audit user.");
    }
    return resolveAuditUserId(candidate);
}

async function resolveHeaderAuditUsers(headers: HeaderCandidate[]) {
    const users = new Map<number, number | null>();
    for (const header of headers) {
        const headerId = pickId(header.header_id);
        if (!headerId) continue;

        try {
            users.set(headerId, await resolveSchedulerAuditUserId(header));
        } catch {
            users.set(headerId, null);
        }
    }
    return users;
}

async function resolveMixedHeaderIds(headerIds: number[]) {
    const batches = await Promise.all(headerIds.map((headerId) => getUnifiedBatch(headerId)));
    return new Set(
        batches
            .filter((batch): batch is NonNullable<typeof batch> =>
                Boolean(batch && batch.price_details.length > 0 && batch.cost_details.length > 0),
            )
            .map((batch) => batch.header_id),
    );
}

async function applyDueMixedBatches(
    headerIds: Set<number>,
    auditUsers: Map<number, number | null>,
): Promise<ScheduledSummary> {
    const failures: ApplyFailure[] = [];
    let applied = 0;
    let failed = 0;
    let skipped = 0;

    for (const headerId of headerIds) {
        const userId = auditUsers.get(headerId);
        if (!userId) {
            failed += 1;
            failures.push({
                request_id: headerId,
                message: "Scheduled application has no valid approved or requested audit user.",
            });
            continue;
        }
        const result = await retryUnifiedBatch(headerId, userId);
        if ("status" in result) {
            if (result.status === 409) {
                skipped += 1;
            } else {
                failed += 1;
                failures.push({ request_id: headerId, message: result.error ?? "Mixed batch retry failed." });
            }
            continue;
        }

        applied += result.applied;
        if (result.failed > 0) {
            failed += result.failed;
            failures.push({
                request_id: headerId,
                message: result.warning ?? "Mixed batch application failed.",
            });
        }
    }

    return { scanned: headerIds.size, applied, failed, skipped, failures };
}

async function applyDuePriceRequests(
    rows: PcrRow[],
    auditUsers: Map<number, number | null>,
): Promise<ScheduledSummary> {
    const failures: ApplyFailure[] = [];
    const headerIds = new Set<number>();
    let applied = 0;
    let skipped = 0;

    for (const row of rows) {
        const requestId = pickId(row.request_id) ?? 0;
        const headerId = pickId(row.header_id);
        if (headerId) headerIds.add(headerId);
        let userId: number;
        try {
            userId = await resolveSchedulerAuditUserId(row, headerId ? auditUsers.get(headerId) : null);
        } catch (error: unknown) {
            failures.push({
                request_id: requestId,
                message: error instanceof Error ? error.message : String(error),
            });
            continue;
        }
        const outcome = await executeClaimedApplication({
            collection: PRICE_DETAILS,
            row,
            userId,
            claimFields: ["current_price"],
            apply: async (claimed) => {
                const productId = normalizeProductId(claimed);
                const priceTypeId = normalizePriceTypeId(claimed);
                const proposedPrice = Number(claimed.proposed_price);
                if (!requestId || !productId || !priceTypeId || !Number.isFinite(proposedPrice)) {
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
        if (outcome.state === "applied") {
            applied += 1;
        } else if (outcome.state === "failed") {
            failures.push({
                request_id: requestId,
                message: outcome.error ?? "Application failed.",
            });
        } else {
            skipped += 1;
        }
    }

    for (const headerId of headerIds) {
        await refreshBatchApplicationStatus({
            detailCollection: PRICE_DETAILS,
            additionalDetailCollections: [COST_DETAILS],
            headerId,
            userId: auditUsers.get(headerId) ?? null,
        });
    }

    return { scanned: rows.length, applied, failed: failures.length, skipped, failures };
}

async function applyDueCostRequests(
    rows: CcrRow[],
    auditUsers: Map<number, number | null>,
): Promise<ScheduledSummary> {
    const failures: ApplyFailure[] = [];
    const headerIds = new Set<number>();
    let applied = 0;
    let skipped = 0;

    for (const row of rows) {
        const requestId = pickId(row.request_id) ?? 0;
        const headerId = pickId(row.header_id);
        if (headerId) headerIds.add(headerId);
        let userId: number;
        try {
            userId = await resolveSchedulerAuditUserId(row, headerId ? auditUsers.get(headerId) : null);
        } catch (error: unknown) {
            failures.push({
                request_id: requestId,
                message: error instanceof Error ? error.message : String(error),
            });
            continue;
        }
        const outcome = await executeClaimedApplication({
            collection: COST_DETAILS,
            row,
            userId,
            apply: async (claimed) => {
                const product_id = Number(claimed.product_id);
                const proposed_cost = Number(claimed.proposed_cost);
                if (!requestId || !Number.isFinite(product_id) || product_id <= 0 || !Number.isFinite(proposed_cost)) {
                    throw new Error("Scheduled cost request has invalid product or proposed cost.");
                }
                await patchProductCostField({ product_id, proposed_cost, userId });
            },
        });
        if (outcome.state === "applied") {
            applied += 1;
        } else if (outcome.state === "failed") {
            failures.push({
                request_id: requestId,
                message: outcome.error ?? "Application failed.",
            });
        } else {
            skipped += 1;
        }
    }

    for (const headerId of headerIds) {
        await refreshBatchApplicationStatus({
            detailCollection: COST_DETAILS,
            additionalDetailCollections: [PRICE_DETAILS],
            headerId,
            userId: auditUsers.get(headerId) ?? null,
        });
    }

    return { scanned: rows.length, applied, failed: failures.length, skipped, failures };
}

export async function POST(req: NextRequest) {
    try {
        const tokenError = assertSchedulerToken(req);
        if (tokenError) return tokenError;

        const now = nowManila();
        const [priceRows, costRows, dueHeaderIds] = await Promise.all([
            fetchDuePriceRequests(now),
            fetchDueCostRequests(now),
            fetchDueBatchHeaders(now),
        ]);
        const dueHeaderIdList = dueHeaderIds
            .map((row) => pickId(row.header_id))
            .filter((id): id is number => Boolean(id));
        const auditUsers = await resolveHeaderAuditUsers(dueHeaderIds);
        const candidateHeaderIds = Array.from(new Set([
            ...dueHeaderIdList,
            ...priceRows.map((row) => pickId(row.header_id)).filter((id): id is number => Boolean(id)),
            ...costRows.map((row) => pickId(row.header_id)).filter((id): id is number => Boolean(id)),
        ]));
        const mixedHeaderIds = await resolveMixedHeaderIds(candidateHeaderIds);
        const nonMixedPriceRows = priceRows.filter((row) => !mixedHeaderIds.has(pickId(row.header_id) ?? 0));
        const nonMixedCostRows = costRows.filter((row) => !mixedHeaderIds.has(pickId(row.header_id) ?? 0));
        const [price, cost] = await Promise.all([
            applyDuePriceRequests(nonMixedPriceRows, auditUsers),
            applyDueCostRequests(nonMixedCostRows, auditUsers),
        ]);
        const mixed = await applyDueMixedBatches(mixedHeaderIds, auditUsers);

        if (price.applied > 0 || cost.applied > 0 || mixed.applied > 0) {
            invalidateGroupIndexCacheOnCatalogChange();
        }

        return NextResponse.json({ ok: true, ran_at: now, price, cost, mixed });
    } catch (error: unknown) {
        return directusErrorResponse(error);
    }
}
