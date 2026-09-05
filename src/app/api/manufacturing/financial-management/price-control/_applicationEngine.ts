import { randomUUID } from "node:crypto";

import {
    HEADERS,
    directusHeaders,
    fetchDirectus,
    isFutureEffectiveAt,
    isPriceSnapshotConflictError,
    mustBase,
    nowManila,
    pickId,
} from "./price-change-batches/_batch";

export const APPLICATION_MAX_FAILURES = 3;
export const APPLICATION_STALE_MINUTES = 5;

export type ApplicationStatus = "SCHEDULED" | "APPLYING" | "APPLIED" | "FAILED" | "CANCELLED";

export type ApplicationRow = {
    request_id?: unknown;
    header_id?: unknown;
    requested_by?: unknown;
    current_price?: unknown;
    status?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_lock_id?: string | null;
    application_started_at?: string | null;
    application_attempts?: number | string | null;
    application_error?: string | null;
};

export type ApplicationOutcome<T extends ApplicationRow> = {
    state: "applied" | "failed" | "skipped";
    row: T | null;
    error?: string;
};

export type PostCommitApplicationNotice = {
    warning: string;
    retryable: true;
};

type DirectusList<T> = { data?: T[] };

const UNSTAGED_DETAIL_ERROR = "Batch has pending detail rows that were not staged for application.";

function sanitizedError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    if (!raw) return "Application failed.";
    try {
        const parsed = JSON.parse(raw) as { body?: string; message?: string };
        if (parsed?.body) {
            const body = JSON.parse(parsed.body) as { errors?: Array<{ message?: string }> };
            const message = body.errors?.[0]?.message;
            if (message) return String(message).slice(0, 500);
        }
        if (parsed?.message) return String(parsed.message).slice(0, 500);
    } catch {
        // The original message is already suitable for an operational error.
    }
    return raw.slice(0, 500);
}

export function fallbackApplicationStatus(args: {
    scheduled: boolean;
    applied: number;
    failed: number;
    affected: number;
}): ApplicationStatus {
    if (args.failed > 0) return "FAILED";
    if (args.scheduled || args.applied < args.affected) return "SCHEDULED";
    return "APPLIED";
}

export function postCommitApplicationNotice(error: unknown, operation: string): PostCommitApplicationNotice {
    const errorId = randomUUID();
    console.error(
        `[product-pricing:${errorId}] Post-commit ${operation} failed`,
        sanitizedError(error),
    );

    return {
        warning: `Approval was saved, but ${operation} could not be completed. Retry application from the batch details.`,
        retryable: true,
    };
}

function requestId(row: ApplicationRow): number {
    return pickId(row.request_id) ?? 0;
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
        body: JSON.stringify({
            data: patch,
            query: {
                filter,
                fields: fields.split(","),
            },
        }),
    });
    return response.data ?? [];
}

async function fetchBatchApplicationRows(collection: string, headerId: number): Promise<ApplicationRow[]> {
    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set(
        "fields",
        [
            "request_id",
            "status",
            "application_status",
            "application_attempts",
            "application_error",
        ].join(","),
    );
    params.set("filter[header_id][_eq]", String(headerId));

    const response = await fetchDirectus<DirectusList<ApplicationRow>>(
        `${mustBase()}/items/${collection}?${params.toString()}`,
        { headers: directusHeaders() },
    );
    return response.data ?? [];
}

function rowIdSet(rows: ApplicationRow[]) {
    return new Set(rows.map(requestId).filter((id) => id > 0));
}

export async function stageStandaloneApproval<T extends ApplicationRow>(args: {
    collection: string;
    id: number;
    userId: number;
    effectiveAt?: string | null;
    fields: string;
}): Promise<{ row: T; scheduled: boolean } | null> {
    const scheduled = isFutureEffectiveAt(args.effectiveAt);
    const now = nowManila();
    const effectiveAt = args.effectiveAt || now;
    const rows = await patchFiltered<T>(
        args.collection,
        {
            _and: [
                { request_id: { _eq: args.id } },
                { status: { _eq: "PENDING" } },
                {
                    _or: [
                        { application_status: { _null: true } },
                        { application_status: { _eq: "FAILED" } },
                    ],
                },
            ],
        },
        {
            status: "APPROVED",
            approved_by: args.userId,
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
        args.fields,
    );
    return rows[0] ? { row: rows[0], scheduled } : null;
}

export async function stageBatchApproval(args: {
    detailCollection: string;
    headerId: number;
    userId: number;
    effectiveAt?: string | null;
}) {
    const scheduled = isFutureEffectiveAt(args.effectiveAt);
    const now = nowManila();
    const effectiveAt = args.effectiveAt || now;
    const lockId = randomUUID();
    const headerFields = "header_id,status,effective_at,application_status,application_lock_id,application_started_at,application_attempts,application_error";
    const claimed = await patchFiltered<ApplicationRow>(
        HEADERS,
        {
            _and: [
                { header_id: { _eq: args.headerId } },
                { status: { _eq: "PENDING" } },
                {
                    _or: [
                        { application_status: { _null: true } },
                        { application_status: { _eq: "FAILED" } },
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
        headerFields,
    );
    if (!claimed[0]) return null;

    try {
        const pendingRows = await fetchBatchApplicationRows(args.detailCollection, args.headerId);
        const pendingIds = rowIdSet(pendingRows.filter((row) => String(row.status ?? "") === "PENDING"));
        if (pendingIds.size === 0) {
            throw new Error("Batch has no pending detail rows to stage.");
        }

        await patchFiltered<ApplicationRow>(
            args.detailCollection,
            { _and: [{ header_id: { _eq: args.headerId } }, { status: { _eq: "PENDING" } }] },
            {
                status: "APPROVED",
                approved_by: args.userId,
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
            "request_id,header_id,status,effective_at,application_status",
        );

        const rowsAfterStaging = await fetchBatchApplicationRows(args.detailCollection, args.headerId);
        const stagedIds = rowIdSet(rowsAfterStaging.filter((row) =>
            pendingIds.has(requestId(row)) &&
            String(row.status ?? "") === "APPROVED" &&
            String(row.application_status ?? "").toUpperCase() === "SCHEDULED",
        ));
        const allExpectedRowsStaged = Array.from(pendingIds).every((id) => stagedIds.has(id));
        if (!allExpectedRowsStaged) {
            throw new Error(UNSTAGED_DETAIL_ERROR);
        }

        const finalized = await patchFiltered<ApplicationRow>(
            HEADERS,
            {
                _and: [
                    { header_id: { _eq: args.headerId } },
                    { status: { _eq: "PENDING" } },
                    { application_status: { _eq: "APPLYING" } },
                    { application_lock_id: { _eq: lockId } },
                ],
            },
            {
                status: "APPROVED",
                approved_by: args.userId,
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
            headerFields,
        );
        if (!finalized[0]) throw new Error("Batch approval lock was lost before staging completed.");
        return { scheduled, effectiveAt };
    } catch (error: unknown) {
        await patchFiltered<ApplicationRow>(
            HEADERS,
            {
                _and: [
                    { header_id: { _eq: args.headerId } },
                    { application_status: { _eq: "APPLYING" } },
                    { application_lock_id: { _eq: lockId } },
                ],
            },
            {
                application_status: "FAILED",
                application_lock_id: null,
                application_started_at: null,
                application_attempts: 1,
                application_error: sanitizedError(error),
            },
            headerFields,
        ).catch(() => undefined);
        throw error;
    }
}

function claimFilter(row: ApplicationRow, id: number): Record<string, unknown> {
    const status = String(row.application_status ?? "").toUpperCase();
    const and: Record<string, unknown>[] = [
        { request_id: { _eq: id } },
        { status: { _eq: "APPROVED" } },
        { application_status: { _eq: status } },
    ];

    if (status === "APPLYING") {
        and.push({ application_lock_id: { _eq: row.application_lock_id ?? "" } });
        and.push({ application_started_at: { _eq: row.application_started_at ?? "" } });
    }

    return { _and: and };
}

export function staleApplicationCutoff(): string {
    return new Date(Date.now() - APPLICATION_STALE_MINUTES * 60_000)
        .toLocaleString("sv-SE", { timeZone: "Asia/Manila" })
        .replace(" ", "T");
}

export async function executeClaimedApplication<T extends ApplicationRow>(args: {
    collection: string;
    row: T;
    userId: number | null;
    effectiveAt?: string;
    claimFields?: string[];
    apply: (claimed: T) => Promise<void>;
}): Promise<ApplicationOutcome<T>> {
    const id = requestId(args.row);
    const currentStatus = String(args.row.application_status ?? "").toUpperCase();
    if (!id || !["SCHEDULED", "APPLYING"].includes(currentStatus)) {
        return { state: "skipped", row: null };
    }

    const lockId = randomUUID();
    const startedAt = nowManila();
    const fields = [
        "request_id",
        "header_id",
        "requested_by",
        "product_id",
        "price_type_id",
        "proposed_price",
        "proposed_cost",
        "status",
        "effective_at",
        "application_status",
        "application_lock_id",
        "application_started_at",
        "application_attempts",
        "application_error",
        ...(args.claimFields ?? []),
    ].join(",");

    const claimedRows = await patchFiltered<T>(
        args.collection,
        claimFilter(args.row, id),
        {
            application_status: "APPLYING",
            application_lock_id: lockId,
            application_started_at: startedAt,
            application_error: null,
            ...(args.effectiveAt ? { effective_at: args.effectiveAt } : {}),
        },
        fields,
    );
    const claimed = claimedRows[0];
    if (!claimed) return { state: "skipped", row: null };

    try {
        await args.apply(claimed);
        const appliedAt = nowManila();
        const finalized = await patchFiltered<T>(
            args.collection,
            {
                _and: [
                    { request_id: { _eq: id } },
                    { application_status: { _eq: "APPLYING" } },
                    { application_lock_id: { _eq: lockId } },
                ],
            },
            {
                application_status: "APPLIED",
                application_lock_id: null,
                application_started_at: null,
                application_error: null,
                applied_at: appliedAt,
                ...(args.userId ? { applied_by: args.userId } : {}),
            },
            fields,
        );
        if (!finalized[0]) throw new Error("Application lock was lost before completion.");
        return { state: "applied", row: finalized[0] };
    } catch (error: unknown) {
        const errorMessage = sanitizedError(error);
        const terminalFailure = isPriceSnapshotConflictError(error);
        const attempts = terminalFailure
            ? APPLICATION_MAX_FAILURES
            : Math.max(0, Number(claimed.application_attempts ?? 0)) + 1;
        const nextStatus: ApplicationStatus =
            terminalFailure || attempts >= APPLICATION_MAX_FAILURES ? "FAILED" : "SCHEDULED";
        await patchFiltered<T>(
            args.collection,
            {
                _and: [
                    { request_id: { _eq: id } },
                    { application_status: { _eq: "APPLYING" } },
                    { application_lock_id: { _eq: lockId } },
                ],
            },
            {
                application_status: nextStatus,
                application_lock_id: null,
                application_started_at: null,
                application_attempts: attempts,
                application_error: errorMessage,
            },
            fields,
        ).catch(() => undefined);
        return { state: "failed", row: claimed, error: errorMessage };
    }
}

export async function resetFailedApplication(collection: string, id: number, effectiveAt: string) {
    const rows = await patchFiltered<ApplicationRow>(
        collection,
        {
            _and: [
                { request_id: { _eq: id } },
                { status: { _eq: "APPROVED" } },
                { application_status: { _eq: "FAILED" } },
            ],
        },
        {
            application_status: "SCHEDULED",
            effective_at: effectiveAt,
            application_lock_id: null,
            application_started_at: null,
            application_error: null,
        },
        "request_id,header_id,status,effective_at,application_status,application_attempts",
    );
    return rows[0] ?? null;
}

export async function resetFailedBatchHeader(headerId: number) {
    const rows = await patchFiltered<ApplicationRow>(
        HEADERS,
        {
            _and: [
                { header_id: { _eq: headerId } },
                { status: { _eq: "APPROVED" } },
                { application_status: { _eq: "FAILED" } },
            ],
        },
        {
            application_status: "SCHEDULED",
            application_lock_id: null,
            application_started_at: null,
            application_error: null,
        },
        "header_id,status,application_status,application_attempts",
    );
    return rows[0] ?? null;
}

export async function refreshBatchApplicationStatus(args: {
    detailCollection: string;
    headerId: number;
    userId: number | null;
    additionalDetailCollections?: string[];
}) {
    if (args.headerId <= 0) return null;
    const collections = Array.from(new Set([
        args.detailCollection,
        ...(args.additionalDetailCollections ?? []),
    ].filter(Boolean)));
    const rows = (await Promise.all(
        collections.map((collection) => fetchBatchApplicationRows(collection, args.headerId)),
    )).flat();
    if (rows.length === 0) return null;

    const hasPendingRows = rows.some((row) => String(row.status ?? "") === "PENDING");
    const approvedRows = rows.filter((row) => String(row.status ?? "") === "APPROVED");
    const statuses = approvedRows.map((row) => String(row.application_status ?? "").toUpperCase());
    const applicationStatus: ApplicationStatus = hasPendingRows || statuses.includes("FAILED")
        ? "FAILED"
        : statuses.includes("APPLYING")
          ? "APPLYING"
          : statuses.includes("SCHEDULED")
            ? "SCHEDULED"
            : "APPLIED";
    const error = hasPendingRows
        ? UNSTAGED_DETAIL_ERROR
        : rows.find((row) => String(row.application_status ?? "").toUpperCase() === "FAILED")?.application_error ?? null;
    const attempts = Math.max(...rows.map((row) => Number(row.application_attempts ?? 0)), 0);
    const now = nowManila();

    const headerConditions: Record<string, unknown>[] = [{ header_id: { _eq: args.headerId } }];
    if (applicationStatus !== "APPLIED" && applicationStatus !== "FAILED") {
        headerConditions.push({ application_status: { _nin: ["APPLIED", "FAILED"] } });
    }

    await patchFiltered(
        HEADERS,
        { _and: headerConditions },
        {
            application_status: applicationStatus,
            application_attempts: attempts,
            application_error: error,
            application_lock_id: null,
            application_started_at: null,
            ...(applicationStatus === "APPLIED"
                ? { applied_at: now, ...(args.userId ? { applied_by: args.userId } : {}) }
                : {}),
        },
        "header_id,status,application_status,application_attempts,application_error,applied_at,applied_by",
    );

    return applicationStatus;
}
