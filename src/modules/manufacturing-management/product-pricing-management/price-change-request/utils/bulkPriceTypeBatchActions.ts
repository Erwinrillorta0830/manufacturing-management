import { isUnauthorizedError } from "../../shared/apiHttp";
import type { BulkActionResult, PriceTypeSelectionSnapshot } from "../types";

function emptyBulkResult(action: BulkActionResult["action"]): BulkActionResult {
    return { action, successIds: [], failedIds: [], failures: [] };
}

function mergeBulkResults(action: BulkActionResult["action"], parts: BulkActionResult[]): BulkActionResult {
    const successIds: number[] = [];
    const failedIds: number[] = [];
    const failures: BulkActionResult["failures"] = [];

    for (const part of parts) {
        successIds.push(...part.successIds);
        failedIds.push(...part.failedIds);
        failures.push(...part.failures);
    }

    return { action, successIds, failedIds, failures };
}

function splitSnapshotsByBatchLink(snapshots: PriceTypeSelectionSnapshot[]) {
    const batched: PriceTypeSelectionSnapshot[] = [];
    const orphans: PriceTypeSelectionSnapshot[] = [];

    for (const snapshot of snapshots) {
        const headerId = Number(snapshot.batch_header_id);
        if (Number.isFinite(headerId) && headerId > 0) {
            batched.push(snapshot);
        } else {
            orphans.push(snapshot);
        }
    }

    return { batched, orphans };
}

export function groupSnapshotsByBatch(
    snapshots: PriceTypeSelectionSnapshot[],
): Map<number, PriceTypeSelectionSnapshot[]> {
    const groups = new Map<number, PriceTypeSelectionSnapshot[]>();

    for (const snapshot of snapshots) {
        const headerId = Number(snapshot.batch_header_id);
        if (!Number.isFinite(headerId) || headerId <= 0) continue;

        const existing = groups.get(headerId) ?? [];
        existing.push(snapshot);
        groups.set(headerId, existing);
    }

    return groups;
}

export function uniqueBatchCount(snapshots: PriceTypeSelectionSnapshot[]): number {
    return groupSnapshotsByBatch(snapshots).size;
}

export function orphanPriceSnapshotCount(snapshots: PriceTypeSelectionSnapshot[]): number {
    return splitSnapshotsByBatchLink(snapshots).orphans.length;
}

async function approveManyOrphanRequests(
    snapshots: PriceTypeSelectionSnapshot[],
    approveRequest: (requestId: number, effectiveAt?: string | null) => Promise<void>,
    effectiveAt?: string | null,
): Promise<BulkActionResult> {
    if (snapshots.length === 0) return emptyBulkResult("approve");

    const successIds: number[] = [];
    const failedIds: number[] = [];
    const failures: BulkActionResult["failures"] = [];

    const settled = await Promise.allSettled(
        snapshots.map(async (snapshot) => {
            await approveRequest(snapshot.request_id, effectiveAt);
            return snapshot.request_id;
        }),
    );

    for (let i = 0; i < snapshots.length; i += 1) {
        const requestId = snapshots[i].request_id;
        const result = settled[i];

        if (result.status === "fulfilled") {
            successIds.push(requestId);
        } else {
            if (isUnauthorizedError(result.reason)) throw result.reason;
            failedIds.push(requestId);
            failures.push({
                request_id: requestId,
                message: result.reason instanceof Error ? result.reason.message : "Request approval failed",
            });
        }
    }

    return { action: "approve", successIds, failedIds, failures };
}

async function rejectManyOrphanRequests(
    snapshots: PriceTypeSelectionSnapshot[],
    reason: string,
    rejectRequest: (requestId: number, rejectReason: string) => Promise<void>,
): Promise<BulkActionResult> {
    if (snapshots.length === 0) return emptyBulkResult("reject");

    const successIds: number[] = [];
    const failedIds: number[] = [];
    const failures: BulkActionResult["failures"] = [];

    const settled = await Promise.allSettled(
        snapshots.map(async (snapshot) => {
            await rejectRequest(snapshot.request_id, reason);
            return snapshot.request_id;
        }),
    );

    for (let i = 0; i < snapshots.length; i += 1) {
        const requestId = snapshots[i].request_id;
        const result = settled[i];

        if (result.status === "fulfilled") {
            successIds.push(requestId);
        } else {
            if (isUnauthorizedError(result.reason)) throw result.reason;
            failedIds.push(requestId);
            failures.push({
                request_id: requestId,
                message: result.reason instanceof Error ? result.reason.message : "Request rejection failed",
            });
        }
    }

    return { action: "reject", successIds, failedIds, failures };
}

export async function approveManyBatches(
    snapshots: PriceTypeSelectionSnapshot[],
    approveBatch: (headerId: number, effectiveAt?: string | null) => Promise<void>,
    effectiveAt?: string | null,
): Promise<BulkActionResult> {
    const groups = groupSnapshotsByBatch(snapshots);
    if (groups.size === 0) return emptyBulkResult("approve");

    const successIds: number[] = [];
    const failedIds: number[] = [];
    const failures: BulkActionResult["failures"] = [];

    for (const [headerId, batchSnapshots] of groups) {
        const requestIds = batchSnapshots.map((item) => item.request_id);
        try {
            await approveBatch(headerId, effectiveAt);
            successIds.push(...requestIds);
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) throw error;
            const message = error instanceof Error ? error.message : "Batch approval failed";
            failedIds.push(...requestIds);
            for (const requestId of requestIds) {
                failures.push({ request_id: requestId, message });
            }
        }
    }

    return { action: "approve", successIds, failedIds, failures };
}

export async function rejectManyBatches(
    snapshots: PriceTypeSelectionSnapshot[],
    reason: string,
    rejectBatch: (headerId: number, rejectReason: string) => Promise<void>,
): Promise<BulkActionResult> {
    const groups = groupSnapshotsByBatch(snapshots);
    if (groups.size === 0) return emptyBulkResult("reject");

    const successIds: number[] = [];
    const failedIds: number[] = [];
    const failures: BulkActionResult["failures"] = [];

    for (const [headerId, batchSnapshots] of groups) {
        const requestIds = batchSnapshots.map((item) => item.request_id);
        try {
            await rejectBatch(headerId, reason);
            successIds.push(...requestIds);
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) throw error;
            const message = error instanceof Error ? error.message : "Batch rejection failed";
            failedIds.push(...requestIds);
            for (const requestId of requestIds) {
                failures.push({ request_id: requestId, message });
            }
        }
    }

    return { action: "reject", successIds, failedIds, failures };
}

export async function approveManyPriceRequestsHybrid(
    snapshots: PriceTypeSelectionSnapshot[],
    approveBatch: (headerId: number, effectiveAt?: string | null) => Promise<void>,
    approveRequest: (requestId: number, effectiveAt?: string | null) => Promise<void>,
    effectiveAt?: string | null,
): Promise<BulkActionResult> {
    if (snapshots.length === 0) return emptyBulkResult("approve");

    const { batched, orphans } = splitSnapshotsByBatchLink(snapshots);
    const parts: BulkActionResult[] = [];

    if (batched.length > 0) {
        parts.push(await approveManyBatches(batched, approveBatch, effectiveAt));
    }
    if (orphans.length > 0) {
        parts.push(await approveManyOrphanRequests(orphans, approveRequest, effectiveAt));
    }

    return mergeBulkResults("approve", parts);
}

export async function rejectManyPriceRequestsHybrid(
    snapshots: PriceTypeSelectionSnapshot[],
    reason: string,
    rejectBatch: (headerId: number, rejectReason: string) => Promise<void>,
    rejectRequest: (requestId: number, rejectReason: string) => Promise<void>,
): Promise<BulkActionResult> {
    if (snapshots.length === 0) return emptyBulkResult("reject");

    const { batched, orphans } = splitSnapshotsByBatchLink(snapshots);
    const parts: BulkActionResult[] = [];

    if (batched.length > 0) {
        parts.push(await rejectManyBatches(batched, reason, rejectBatch));
    }
    if (orphans.length > 0) {
        parts.push(await rejectManyOrphanRequests(orphans, reason, rejectRequest));
    }

    return mergeBulkResults("reject", parts);
}
