/**
 * src/modules/manufacturing-management/material-staging/services/staging-api.ts
 * Client service for Material Staging & Floor Holds Module
 */

import { BinTransferPayload, StagingJobOrder, StagingStats, WorkCenter, Branch } from "../types";

export interface StagingApiResponse {
    success: boolean;
    data: StagingJobOrder[];
    stats: StagingStats;
    workCenters: WorkCenter[];
    branches: Branch[];
    error?: string;
}

export interface TransferApiResponse {
    success: boolean;
    status?: number;
    failure_code?: string;
    message?: string;
    shortage?: boolean;
    available_quantity?: number;
    required_quantity?: number;
    shortage_quantity?: number;
    product_id?: number;
    lot_id?: number;
    allocation_id?: number;
    batch_no?: string;
    source_bin?: string;
    target_bin?: string;
    error?: string;
    data?: unknown;
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

/**
 * Execute bin transfer from MAIN-STORE to FLOOR-STAGING-[WorkCenterID]
 */
export async function executeBinTransfer(payload: BinTransferPayload): Promise<TransferApiResponse> {
    const res = await fetch("/api/manufacturing/material-staging/transfer", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const json = await res.json();

    if (res.status === 409 && json.shortage) {
        return { ...json, status: res.status };
    }

    if (!res.ok) {
        throw new Error(json.error || json.message || `Transfer failed with status ${res.status}`);
    }

    return { ...json, status: res.status };
}
