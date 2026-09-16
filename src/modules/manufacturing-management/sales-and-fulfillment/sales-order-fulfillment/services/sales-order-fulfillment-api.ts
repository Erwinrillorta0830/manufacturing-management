import { toast } from "sonner";
import {
    Branch,
    SalesOrderListItem,
    SalesOrderDetailData,
    ProceedResponse,
    FetchSalesOrdersParams,
    PaginatedSalesOrdersResponse,
} from "../types";

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
    if (!refreshPromise) {
        refreshPromise = fetch("/api/auth/refresh", {
            method: "POST",
            cache: "no-store",
        })
            .then((res) => res.ok)
            .catch(() => false)
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
}

async function fetchWithSessionRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    if (response.status !== 401) return response;
    const refreshed = await refreshAccessToken();
    if (!refreshed) return response;
    return fetch(input, init);
}

async function handleResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
    if (!res.ok) {
        if (res.status === 401) {
            toast.error("Session Expired", {
                description: "Your session has expired. Please log in again.",
            });
            throw new Error("Authentication Expired, please log in again");
        }

        let msg = fallbackMessage;
        try {
            const data = await res.json();
            if (data?.message) msg = data.message;
        } catch {
            const txt = await res.text().catch(() => "");
            if (txt) msg = `${fallbackMessage}: ${txt}`;
        }

        toast.error("Request Failed", {
            description: msg,
        });
        throw new Error(msg);
    }

    const data = await res.json();
    return data;
}

export async function fetchBranches(): Promise<Branch[]> {
    try {
        const res = await fetchWithSessionRetry(
            "/api/manufacturing/sales-and-fulfillment/sales-order-fulfillment/branches"
        );
        const data = await handleResponse<{ success: boolean; data: Branch[] }>(
            res,
            "Failed to load branches"
        );
        return data.data || [];
    } catch (err) {
        console.error("[Sales Order Fulfillment API] fetchBranches error:", err);
        throw err;
    }
}

export async function fetchSalesOrders(
    params: FetchSalesOrdersParams = {}
): Promise<PaginatedSalesOrdersResponse> {
    try {
        const qs = new URLSearchParams();
        if (params.search?.trim()) qs.set("search", params.search.trim());
        if (params.branchId) qs.set("branchId", String(params.branchId));
        if (params.page) qs.set("page", String(params.page));
        if (params.pageSize) qs.set("pageSize", String(params.pageSize));

        const url = `/api/manufacturing/sales-and-fulfillment/sales-order-fulfillment${
            qs.toString() ? `?${qs.toString()}` : ""
        }`;
        const res = await fetchWithSessionRetry(url, { cache: "no-store" });
        const data = await handleResponse<{
            success: boolean;
            data: SalesOrderListItem[];
            total: number;
            page: number;
            pageSize: number;
            totalPages: number;
        }>(
            res,
            "Failed to load Sales Orders"
        );
        return {
            data: data.data || [],
            total: data.total || 0,
            page: data.page || 1,
            pageSize: data.pageSize || 10,
            totalPages: data.totalPages || 1,
        };
    } catch (err) {
        console.error("[Sales Order Fulfillment API] fetchSalesOrders error:", err);
        throw err;
    }
}

export async function fetchSalesOrderDetail(orderId: number): Promise<SalesOrderDetailData> {
    try {
        const res = await fetchWithSessionRetry(
            `/api/manufacturing/sales-and-fulfillment/sales-order-fulfillment/${orderId}`,
            { cache: "no-store" }
        );
        const data = await handleResponse<{ success: boolean; data: SalesOrderDetailData }>(
            res,
            `Failed to load details for Sales Order #${orderId}`
        );
        return data.data;
    } catch (err) {
        console.error(`[Sales Order Fulfillment API] fetchSalesOrderDetail(${orderId}) error:`, err);
        throw err;
    }
}

export async function proceedToConsolidation(orderId: number): Promise<ProceedResponse> {
    try {
        const res = await fetchWithSessionRetry(
            "/api/manufacturing/sales-and-fulfillment/sales-order-fulfillment/proceed",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
            }
        );
        const data = await handleResponse<ProceedResponse>(
            res,
            "Failed to proceed to consolidation"
        );
        toast.success("Proceeded to Consolidation", {
            description: data.message || "Sales order successfully transitioned to 'For Consolidation'.",
        });
        return data;
    } catch (err) {
        console.error(`[Sales Order Fulfillment API] proceedToConsolidation(${orderId}) error:`, err);
        throw err;
    }
}
