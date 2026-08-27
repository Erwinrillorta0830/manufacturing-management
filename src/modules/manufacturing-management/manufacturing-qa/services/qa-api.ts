/* eslint-disable */
import { 
    QALog, 
    DispositionRecord, 
    JobOrder, 
    Branch, 
    QARejectionReason, 
    QAJOInspectionLog, 
    JobOrderStatusHistory, 
    TwoPointQAInspectionPayload, 
    TwoPointQAInspectionResult,
    YieldJobOrderMaterial
} from "../types";

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

export async function fetchJobOrderMaterials(joId: string): Promise<YieldJobOrderMaterial[]> {
    const res = await fetch(`/api/manufacturing/planning-engineering?action=job-order-materials&joId=${encodeURIComponent(joId)}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.error || "Failed to load materials");
    }
    if (!Array.isArray(data)) {
        throw new Error("Materials lookup returned an invalid response");
    }
    return data as YieldJobOrderMaterial[];
}

// Fetch QA rejection reasons list
export async function fetchQARejectionReasons(): Promise<QARejectionReason[]> {
    const res = await fetch("/api/manufacturing/qa?action=rejection-reasons");
    if (!res.ok) throw new Error("Failed to load rejection reasons");
    return res.json();
}

// Fetch QA inspection logs
export async function fetchQAInspectionLogs(jobOrderId?: number): Promise<QAJOInspectionLog[]> {
    const url = jobOrderId ? `/api/manufacturing/qa?action=inspection-logs&jobOrderId=${jobOrderId}` : "/api/manufacturing/qa?action=inspection-logs";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load inspection logs");
    return res.json();
}

// Fetch Job Order status history
export async function fetchJobOrderStatusHistory(jobOrderId?: number): Promise<JobOrderStatusHistory[]> {
    const url = jobOrderId ? `/api/manufacturing/qa?action=status-history&jobOrderId=${jobOrderId}` : "/api/manufacturing/qa?action=status-history";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load status history");
    return res.json();
}

// Post Simplified 2-Point QA Inspection & Rework Spawning
export async function postTwoPointQAInspection(payload: TwoPointQAInspectionPayload): Promise<TwoPointQAInspectionResult> {
    const res = await fetch("/api/manufacturing/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "two-point-inspection",
            job_order_id: payload.job_order_id,
            job_order_no: payload.job_order_no,
            product_id: payload.product_id,
            branch_id: payload.branch_id,
            inspected_quantity: payload.inspected_quantity,
            passed_quantity: payload.passed_quantity,
            rejected_quantity: payload.rejected_quantity,
            rejection_reason_id: payload.rejection_reason_id ?? null,
            lot_number: payload.lot_number,
            manufacturing_date: payload.manufacturing_date,
            expiry_date: payload.expiry_date,
            unit_cost: payload.unit_cost ?? 0,
            remarks: payload.remarks ?? "",
            ...(payload.user_id ? { user_id: payload.user_id } : {})
        })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed to submit QA inspection");
    }
    return data;
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
