import type {
    ExpenseType,
    ExpenseTypeChartAccount,
    ExpenseTypeFormValues,
    ExpenseTypeStatus,
} from "../types";

type ApiResponse<T> = {
    data?: T;
    error?: string;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        cache: "no-store",
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
    });
    const payload = await response.json().catch(() => ({})) as ApiResponse<T>;
    if (!response.ok) throw new Error(payload.error || `Expense Type request failed (${response.status}).`);
    return payload.data as T;
}

export async function fetchExpenseTypes(status: ExpenseTypeStatus = "all", query = ""): Promise<ExpenseType[]> {
    const params = new URLSearchParams({ status });
    if (query.trim()) params.set("q", query.trim());
    return (await request<ExpenseType[]>(`/api/manufacturing/expense-types?${params.toString()}`)) || [];
}

export async function fetchExpenseTypeChartAccounts(): Promise<ExpenseTypeChartAccount[]> {
    return (await request<ExpenseTypeChartAccount[]>("/api/manufacturing/expense-types?view=gl-accounts")) || [];
}

export async function createExpenseType(values: ExpenseTypeFormValues): Promise<ExpenseType> {
    return request<ExpenseType>("/api/manufacturing/expense-types", {
        method: "POST",
        body: JSON.stringify({
            name: values.name,
            coaId: Number(values.coaId),
            description: values.description,
        }),
    });
}

export async function updateExpenseType(id: number, values: ExpenseTypeFormValues): Promise<ExpenseType> {
    return request<ExpenseType>(`/api/manufacturing/expense-types/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        body: JSON.stringify({
            name: values.name,
            coaId: Number(values.coaId),
            description: values.description,
            isActive: values.isActive,
        }),
    });
}

export async function setExpenseTypeActive(id: number, isActive: boolean, current: ExpenseType): Promise<ExpenseType> {
    return updateExpenseType(id, {
        name: current.name,
        coaId: current.coaId ? String(current.coaId) : "",
        description: current.description || "",
        isActive,
    });
}
