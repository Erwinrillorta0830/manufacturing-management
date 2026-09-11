/**
 * src/modules/manufacturing-management/material-staging/services/staging-api.ts
 * Client service for Material Staging & Floor Holds Module
 */

import {
    AllocationPreview,
    AllocationPreviewPayload,
    StagingCommitPayload,
    StagingCommitResponse,
    StagingJobOrder,
    StagingStats,
    WorkCenter,
    Branch
} from "../types";

export interface StagingApiResponse {
    success: boolean;
    data: StagingJobOrder[];
    stats: StagingStats;
    workCenters: WorkCenter[];
    branches: Branch[];
    error?: string;
}

export interface AllocationApiError {
    error?: string;
    failure_code?: string;
    details?: unknown;
    shortages?: unknown;
}

/**
 * Fetch all staging job orders and metadata
 */
export async function fetchStagingJobOrders(params?: {
    branchId?: string | number;
    status?: string;
    search?: string;
}): Promise<StagingApiResponse> {
    const queryParams = new URLSearchParams();
    if (params?.branchId && params.branchId !== "all") queryParams.set("branchId", String(params.branchId));
    if (params?.status && params.status !== "all") queryParams.set("status", params.status);
    if (params?.search) queryParams.set("search", params.search);

    const url = `/api/manufacturing/material-staging${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || `Failed to fetch material staging data (${res.status})`);
    }

    return res.json();
}

/** Generate a read-only lot/batch allocation proposal. */
export async function fetchAllocationPreview(payload: AllocationPreviewPayload): Promise<AllocationPreview> {
    const res = await fetch("/api/manufacturing/material-staging/allocation-preview", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.error || json.message || `Allocation preview failed with status ${res.status}`);
    }
    return json as AllocationPreview;
}

/** Commit the reviewed allocation through the one canonical staging writer. */
export async function commitMaterialStaging(payload: StagingCommitPayload): Promise<StagingCommitResponse> {
    const res = await fetch("/api/manufacturing/material-staging/commit", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const details = json as AllocationApiError;
        throw Object.assign(new Error(details.error || `Material staging failed with status ${res.status}`), {
            status: res.status,
            failure_code: details.failure_code,
            shortages: details.shortages
        });
    }
    return json as StagingCommitResponse;
}
