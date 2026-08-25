import { SalesOrder, SalesOrderDetail, QuotationHeader, CreateSalesOrderPayload } from "../types";

let refreshPromise: Promise<boolean> | null = null;

async function fetchWithSessionRetry(input: RequestInfo | URL, init?: RequestInit) {
    const response = await fetch(input, init);
    if (response.status !== 401) return response;
    if (!refreshPromise) {
        refreshPromise = fetch("/api/auth/refresh", { method: "POST", cache: "no-store" })
            .then(result => result.ok)
            .catch(() => false)
            .finally(() => { refreshPromise = null; });
    }
    return await refreshPromise ? fetch(input, init) : response;
}

async function handleResponse<T = unknown>(res: Response, fallbackMessage: string): Promise<T> {
    if (!res.ok) {
        let errMsg = fallbackMessage;
        try {
            const data = await res.json();
            if (data && data.error) errMsg = data.error;
            if (data && Array.isArray(data.issues) && data.issues.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const issueDetails = data.issues.map((i: any) => i.message || `${i.path}: ${i.message}`).join("; ");
                errMsg = `${errMsg}: ${issueDetails}`;
            }
        } catch {}
        throw new Error(errMsg);
    }
    return res.json();
}

export async function fetchSalesOrders(
    params: { page?: number; limit?: number; search?: string; status?: string; selectedIds?: number[]; excludeHasJo?: boolean; customerCode?: string; dateFrom?: string; dateTo?: string } = {},
    options: { signal?: AbortSignal } = {}
): Promise<{ data: SalesOrder[]; detailsMap: Record<number, SalesOrderDetail[]>; meta: { totalCount: number; totalPages: number; page: number; limit: number; hasMore?: boolean; countExact?: boolean } }> {
    const query = new URLSearchParams();
    if (params.page) query.append("page", String(params.page));
    if (params.limit) query.append("limit", String(params.limit));
    if (params.search) query.append("search", params.search);
    if (params.status) query.append("status", params.status);
    if (params.customerCode) query.append("customerCode", params.customerCode);
    if (params.dateFrom) query.append("dateFrom", params.dateFrom);
    if (params.dateTo) query.append("dateTo", params.dateTo);
    if (params.excludeHasJo) query.append("excludeHasJo", "true");
    if (params.selectedIds && params.selectedIds.length > 0) {
        query.append("selectedIds", params.selectedIds.join(","));
    }
    const res = await fetchWithSessionRetry(`/api/manufacturing/sales-order?${query.toString()}`, {
        signal: options.signal
    });
    return handleResponse(res, "Failed to load sales orders");
}

export async function fetchSalesOrderDetails(
    orderId: number,
    options: { signal?: AbortSignal } = {}
): Promise<SalesOrderDetail[]> {
    const res = await fetchWithSessionRetry(`/api/manufacturing/sales-order?orderId=${orderId}`, {
        signal: options.signal
    });
    return handleResponse(res, "Failed to load order details");
}

export async function updateSalesOrderStatus(orderId: number, orderStatus: string): Promise<{ success: boolean }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/sales-order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, orderStatus })
    });
    return handleResponse(res, "Failed to update Sales Order status");
}

export async function updateSalesOrderDetails(orderId: number, details: { detail_id: number; ordered_quantity: number }[]): Promise<{ success: boolean }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/sales-order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, details })
    });
    return handleResponse(res, "Failed to update Sales Order quantities");
}

export async function approveSalesOrder(orderId: number): Promise<{ success: boolean }> {
    return updateSalesOrderStatus(orderId, "For Invoicing");
}

export async function holdSalesOrder(orderId: number): Promise<{ success: boolean }> {
    return updateSalesOrderStatus(orderId, "On Hold");
}

export async function cancelSalesOrder(orderId: number): Promise<{ success: boolean }> {
    return updateSalesOrderStatus(orderId, "Cancelled");
}

export async function convertQuotationToSalesOrder(quotationId: number): Promise<{ success: boolean; data?: SalesOrder }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/sales-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId })
    });
    return handleResponse(res, "Failed to convert quotation to sales order");
}


export async function createSalesOrderDirect(payload: CreateSalesOrderPayload): Promise<{ success: boolean; data?: SalesOrder }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/sales-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return handleResponse(res, "Failed to create sales order directly");
}

export async function updateSalesOrderDraft(orderId: number, payload: CreateSalesOrderPayload): Promise<{ success: boolean }> {
    const res = await fetchWithSessionRetry("/api/manufacturing/sales-order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-draft", orderId, ...payload })
    });
    return handleResponse(res, "Failed to update draft sales order");
}

export async function fetchQuotationPipeline(): Promise<QuotationHeader[]> {
    const res = await fetchWithSessionRetry("/api/manufacturing/finished-goods/quotes");
    return handleResponse(res, "Failed to load quotations");
}
