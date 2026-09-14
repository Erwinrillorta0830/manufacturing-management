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
    options: { search?: string; supplierId?: string; dateFrom?: string; dateTo?: string; status?: string; page?: number; limit?: number } = {},
    signal?: AbortSignal
): Promise<WarehouseReceivingQueueResponse> {
    const params = new URLSearchParams({
        page: String(options.page || 1),
        limit: String(options.limit || 25)
    });
    if (options.search?.trim()) params.set("search", options.search.trim());
    if (options.supplierId?.trim()) params.set("supplierId", options.supplierId.trim());
    if (options.dateFrom?.trim()) params.set("dateFrom", options.dateFrom.trim());
    if (options.dateTo?.trim()) params.set("dateTo", options.dateTo.trim());
    if (options.status?.trim() && options.status !== "ALL") params.set("status", options.status.trim());
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

function downloadFileName(contentDisposition: string | null, fallback: string) {
    const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
}

export async function downloadWarehouseReceivingSummary(input: {
    purchaseOrderId: number;
    receivingHeaderId: number;
}): Promise<void> {
    const params = new URLSearchParams({ receivingHeaderId: String(input.receivingHeaderId) });
    const response = await fetch(`${API_URL}/${encodeURIComponent(String(input.purchaseOrderId))}/print?${params.toString()}`, {
        cache: "no-store"
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("application/pdf")) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Unable to generate the warehouse receiving summary.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadFileName(response.headers.get("content-disposition"), "warehouse-receiving-summary.pdf");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
