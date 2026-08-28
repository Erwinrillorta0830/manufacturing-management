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
    yieldLedgerId?: number | null;
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

export interface FinishedGoodsReceipt {
    id: number;
    movementId: number | null;
    yieldLedgerId: number | null;
    jobOrderId: number | null;
    jobOrderStatus: string | null;
    joId: string;
    productId: number;
    productName: string;
    quantityProduced: number;
    branchId: number;
    lotNumber: string;
    manufacturingDate: string | null;
    expirationDate: string | null;
    qaStatus: string;
    unitCost: number;
    dateReceived: string | null;
    legacySource: boolean;
}

export interface FinishedGoodsCloseResult {
    success: true;
    idempotent?: boolean;
    data: FinishedGoodsReceipt;
    accounting?: Record<string, unknown>;
}

interface FinishedGoodsReceiptApiRow {
    id?: number;
    movement_id?: number | null;
    yield_ledger_id?: number | null;
    job_order_id?: number | null;
    job_order_status?: string | null;
    jo_id?: string;
    product_id?: number;
    product_name?: string;
    quantity_produced?: number;
    branch_id?: number;
    lot_number?: string;
    manufacturing_date?: string | null;
    expiration_date?: string | null;
    qa_status?: string;
    unit_cost?: number;
    date_received?: string | null;
    legacy_source?: boolean;
}

function mapFinishedGoodsReceipt(row: FinishedGoodsReceiptApiRow): FinishedGoodsReceipt {
    return {
        id: Number(row.id || row.movement_id || 0),
        movementId: row.movement_id == null ? null : Number(row.movement_id),
        yieldLedgerId: row.yield_ledger_id == null ? null : Number(row.yield_ledger_id),
        jobOrderId: row.job_order_id == null ? null : Number(row.job_order_id),
        jobOrderStatus: row.job_order_status || null,
        joId: String(row.jo_id || ""),
        productId: Number(row.product_id || 0),
        productName: String(row.product_name || "Manufactured Good"),
        quantityProduced: Number(row.quantity_produced || 0),
        branchId: Number(row.branch_id || 0),
        lotNumber: String(row.lot_number || ""),
        manufacturingDate: row.manufacturing_date || null,
        expirationDate: row.expiration_date || null,
        qaStatus: String(row.qa_status || "Pending"),
        unitCost: Number(row.unit_cost || 0),
        dateReceived: row.date_received || null,
        legacySource: Boolean(row.legacy_source)
    };
}

export async function postFinishedGoodsReceipt(payload: FinishedGoodsReceiptPayload): Promise<FinishedGoodsCloseResult> {
    const res = await fetch("/api/manufacturing/production/finished-goods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data?.success !== true || !data?.data) {
        throw new Error(data?.error || "Failed to receive finished goods yield.");
    }
    return {
        success: true,
        ...(data.idempotent ? { idempotent: true } : {}),
        data: mapFinishedGoodsReceipt(data.data),
        accounting: data.accounting
    };
}

export async function fetchFinishedGoodsReceipts(joId?: string): Promise<FinishedGoodsReceipt[]> {
    const url = joId
        ? `/api/manufacturing/production/finished-goods?joId=${encodeURIComponent(joId)}`
        : "/api/manufacturing/production/finished-goods";
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
        throw new Error(data?.error || "Failed to load finished goods receipts.");
    }
    return data.map((row: FinishedGoodsReceiptApiRow) => mapFinishedGoodsReceipt(row));
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
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Failed to load final QA releases");
    return Array.isArray(data) ? data : [];
}

export interface FinalQACoa {
    final_release_id: number;
    stored_lot_id: number | null;
    canonical_lot_id: number;
    is_legacy_lot_reference: boolean;
    job_order_id: number | null;
    job_order_no: string;
    product_id: number | null;
    product_name: string;
    product_code: string;
    branch_id: number | null;
    branch_name: string;
    branch_code: string;
    lot_id: number;
    lot_number: string;
    lot_name: string;
    quantity: number;
    inspected_quantity: number;
    defect_quantity: number;
    microbiological_status: string;
    packaging_seal_passed: boolean;
    label_compliance_passed: boolean;
    overall_disposition: string;
    coa_reference_no: string;
    approved_by: number | null;
    approved_at: string | null;
    remarks: string;
    manufacturing_date: string | null;
    expiration_date: string | null;
    source_movement_id: number | null;
}

export async function fetchFinalQACoa(finalReleaseId: number): Promise<FinalQACoa> {
    const res = await fetch(
        `/api/manufacturing/production/final-qa/coa?finalReleaseId=${encodeURIComponent(finalReleaseId)}`,
        { cache: "no-store" }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.error || "Failed to load the final QA COA.");
    }
    return data as FinalQACoa;
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

export interface FinalQAReleasePayload {
    jobOrderId: number;
    lotId: number;
    productId: number;
    branchId: number;
    inspectedQuantity: number;
    defectQuantity: number;
    microbiologicalStatus: "Pending" | "Passed" | "Failed";
    packagingSealPassed: boolean;
    labelCompliancePassed: boolean;
    overallDisposition: "Approved" | "Quarantined" | "Rejected";
    coaReferenceNo?: string;
    approvedBy?: number | null;
    remarks?: string;
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

export async function postFinalQARelease(payload: FinalQAReleasePayload): Promise<any> {
    const res = await fetch("/api/manufacturing/production/final-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to submit final lot release");
    return data;
}
