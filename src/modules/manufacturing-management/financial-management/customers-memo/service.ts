// src/modules/financial-management/accounting/customers-memo/service.ts

import {
    Supplier, Customer, Salesman, ChartOfAccount,
    CollectionLookupRow, MemoSavePayload,
    MemoApprovalRow, DetailedMemo
} from "./types";

const API_BASE = "/api/manufacturing/financial-management/customer-memo/customers-memo";

export async function fetchSuppliers(): Promise<Supplier[]> {
    const res = await fetch(`${API_BASE}?action=suppliers`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchCustomers(): Promise<Customer[]> {
    const res = await fetch(`${API_BASE}?action=customers`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchSalesmen(): Promise<Salesman[]> {
    const res = await fetch(`${API_BASE}?action=salesmen`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchCOAs(): Promise<ChartOfAccount[]> {
    const res = await fetch(`${API_BASE}?action=chart-of-accounts`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchNextMemoNumber(shortcut: string): Promise<string> {
    if (!shortcut) return "";
    const res = await fetch(`${API_BASE}?action=next-memo-number&shortcut=${shortcut}`);
    const json = await res.json();
    return json.memo_number || "";
}

export async function lookupCollections(params: {
    supplierName: string;
    salesmanCode: string;
    customerName: string;
}): Promise<CollectionLookupRow[]> {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}?action=collection-lookup&${query}`);
    const json = await res.json();
    return json.data || [];
}

export async function saveMemo(payload: MemoSavePayload) {
    const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function fetchMemosByStatus(status: string): Promise<MemoApprovalRow[]> {
    const res = await fetch(`${API_BASE}?action=list&status=${status}`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchDetailedMemo(id: number): Promise<DetailedMemo> {
    const res = await fetch(`${API_BASE}?action=memo-details&id=${id}`);
    const json = await res.json();
    return json;
}

export async function approveMemo(id: number) {
    const res = await fetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "APPROVED" })
    });
    return res.json();
}

export async function bulkApproveMemos(ids: number[]) {
    const res = await fetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: "APPROVED" })
    });
    return res.json();
}
