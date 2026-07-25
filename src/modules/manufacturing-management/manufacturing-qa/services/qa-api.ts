/* eslint-disable */
import { QALog, DispositionRecord, JobOrder, Branch } from "../types";

export async function fetchQALogs(): Promise<QALog[]> {
    const res = await fetch("/api/manufacturing/planning-engineering?action=qa-logs");
    if (!res.ok) throw new Error("Failed to load QA logs");
    return res.json();
}

export async function fetchDispositions(): Promise<DispositionRecord[]> {
    const res = await fetch("/api/manufacturing/qa?action=dispositions");
    if (!res.ok) throw new Error("Failed to load dispositions");
    return res.json();
}

export async function fetchJobOrders(): Promise<JobOrder[]> {
    const res = await fetch("/api/manufacturing/planning-engineering");
    if (!res.ok) throw new Error("Failed to load Job Orders");
    return res.json();
}

export async function fetchBranchesList(): Promise<Branch[]> {
    const res = await fetch("/api/manufacturing/inventory");
    if (!res.ok) throw new Error("Failed to load branches");
    const data = await res.json();
    return data.branches || [];
}

export async function fetchJobOrderMaterials(joId: string): Promise<any[]> {
    const res = await fetch(`/api/manufacturing/planning-engineering?action=job-order-materials&joId=${joId}`);
    if (!res.ok) throw new Error("Failed to load materials");
    return res.json();
}

export interface FinishedGoodsReceiptPayload {
    joId: string;
    productId: number;
    productName: string;
    quantityProduced: number;
    branchId: number;
    lotNumber: string;
    expirationDate: string | null;
    manufacturingDate?: string | null;
    unitCost: number;
    componentsConsumed: Array<{
        component_product_id: number;
        required: number;
        quantity: number;
        component_name: string;
    }>;
    completeJobOrder: boolean;
}

export async function postFinishedGoodsReceipt(payload: FinishedGoodsReceiptPayload): Promise<any> {
    const res = await fetch("/api/manufacturing/production/finished-goods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed to receive finished goods yield.");
    }
    return data;
}

export interface SupervisorOverridePayload {
    action: "disposition";
    dispositionId: string;
    decision: "Release with Deviation" | "Rework" | "Scrap";
    supervisorComments: string;
    userId: number;
}

export async function postSupervisorOverride(payload: SupervisorOverridePayload): Promise<any> {
    const res = await fetch("/api/manufacturing/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed to submit override decision.");
    }
    return data;
}

export async function fetchDailyQAInspections(joId?: string): Promise<any[]> {
    const url = joId ? `/api/manufacturing/production/daily-qa?joId=${joId}` : "/api/manufacturing/production/daily-qa";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load daily QA inspections");
    return res.json();
}

export async function fetchFinalQAReleases(joId?: string): Promise<any[]> {
    const url = joId ? `/api/manufacturing/production/final-qa?joId=${joId}` : "/api/manufacturing/production/final-qa";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load final QA releases");
    return res.json();
}

export async function fetchYieldLedger(joId?: string): Promise<any[]> {
    const url = joId ? `/api/manufacturing/production/shift-run-log?joId=${joId}` : "/api/manufacturing/production/shift-run-log";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load yield ledger");
    return res.json();
}

export async function fetchInventoryLotsData(): Promise<{ lots: any[]; products: any[] }> {
    const res = await fetch("/api/manufacturing/inventory");
    if (!res.ok) throw new Error("Failed to load inventory lots");
    const json = await res.json();
    return {
        lots: json.batches || [],
        products: json.products || []
    };
}

export async function postDailyQAInspection(payload: any): Promise<any> {
    const res = await fetch("/api/manufacturing/production/daily-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to log daily QA inspection");
    return data;
}

export async function postFinalQARelease(payload: any): Promise<any> {
    const res = await fetch("/api/manufacturing/production/final-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to submit final lot release");
    return data;
}
