// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/services/deliveries-api.ts

import {
    DeliveryClearanceRecord,
    ClearanceMetrics,
    Branch,
    ClearanceSubmissionPayload,
    FulfillmentStatus,
} from "../types";

export interface FetchDeliveryClearanceResponse {
    content: DeliveryClearanceRecord[];
    totalElements: number;
    totalPages: number;
    metrics: ClearanceMetrics;
    branches: Branch[];
}

export interface SubmitClearanceResponse {
    success: boolean;
    fulfillment_status: FulfillmentStatus;
    order_status: string;
    invoice_id: number;
    order_id: number;
    message: string;
}

const BASE_API_URL = "/api/manufacturing/sales-and-fulfillment/fulfilment-and-deliveries";

async function handleApiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
    if (!res.ok) {
        let errMsg = fallbackMessage;
        try {
            const data = await res.json();
            if (data && data.message) errMsg = data.message;
            else if (data && data.error) errMsg = data.error;
        } catch {
            // response was not JSON
        }
        throw new Error(errMsg);
    }
    return res.json();
}

export async function fetchDeliveryClearanceList(params: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    branchId?: string | number;
}): Promise<FetchDeliveryClearanceResponse> {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.size !== undefined) qs.set("size", String(params.size));
    if (params.search) qs.set("search", params.search.trim());
    if (params.status && params.status !== "All") qs.set("status", params.status);
    if (params.branchId && params.branchId !== "All") qs.set("branchId", String(params.branchId));

    const res = await fetch(`${BASE_API_URL}?${qs.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
    });

    return handleApiResponse<FetchDeliveryClearanceResponse>(res, "Failed to load delivery clearance data.");
}

export async function submitDeliveryClearance(
    payload: ClearanceSubmissionPayload
): Promise<SubmitClearanceResponse> {
    const res = await fetch(BASE_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(payload),
    });

    return handleApiResponse<SubmitClearanceResponse>(res, "Failed to submit delivery clearance.");
}
