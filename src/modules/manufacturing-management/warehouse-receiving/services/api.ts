import type {
    WarehouseReceivingCommand,
    WarehouseReceivingOrder,
    WarehouseReceivingQueueResponse
} from "../types";

const API_URL = "/api/manufacturing/procurement/warehouse-receiving";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {})
        },
        cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { data?: T; error?: string } | null;
    if (!response.ok) throw new Error(body?.error || "Warehouse Receiving request failed.");
    if (body?.data === undefined) throw new Error("Warehouse Receiving returned an invalid response.");
    return body.data;
}

export function fetchWarehouseReceivingQueue(
    options: { search?: string; page?: number; limit?: number } = {},
    signal?: AbortSignal
): Promise<WarehouseReceivingQueueResponse> {
    const params = new URLSearchParams({
        page: String(options.page || 1),
        limit: String(options.limit || 25)
    });
    if (options.search?.trim()) params.set("search", options.search.trim());
    return request<WarehouseReceivingQueueResponse>(`${API_URL}?${params.toString()}`, { signal });
}

export function fetchWarehouseReceivingOrder(purchaseOrderId: number, signal?: AbortSignal) {
    return request<WarehouseReceivingOrder>(`${API_URL}?purchaseOrderId=${encodeURIComponent(String(purchaseOrderId))}`, { signal });
}

export function postWarehouseReceiving(command: WarehouseReceivingCommand) {
    return request<WarehouseReceivingOrder>(API_URL, {
        method: "POST",
        body: JSON.stringify(command)
    });
}
