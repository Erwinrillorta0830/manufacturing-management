/* eslint-disable */
import { 
    JobOrder, 
    User, 
    RouteOperatorRecord, 
    WorkCenter, 
    StationScanPayload, 
    StationScanResponse, 
    JobOrderStatusHistoryRecord, 
    RejectionReason, 
    MaterialGenealogyRecord,
    ShiftRunLogPayload 
} from "../types";

export type { ShiftRunLogPayload };

export async function fetchJobOrders(): Promise<JobOrder[]> {
    const res = await fetch("/api/manufacturing/planning-engineering", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load job orders");
    return res.json();
}

export async function fetchUsersList(): Promise<User[]> {
    const res = await fetch("/api/manufacturing/planning-engineering?action=users", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load operators list");
    return res.json();
}

export interface RouteOperatorsResponse {
    data: RouteOperatorRecord[];
    summary: {
        total_hours: number;
        total_labor_cost: number;
    };
}

export async function fetchRouteOperators(taskId: number): Promise<RouteOperatorsResponse> {
    const res = await fetch(`/api/manufacturing/production/route-operators?taskId=${taskId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load operators logs");
    return res.json();
}

export interface RouteOperatorPayload {
    action: string;
    taskId: number;
    userId: number;
    joId?: string;
    routingId?: number;
    actualHours?: number;
    hourlyRate?: number;
}

export async function manageRouteOperator(payload: RouteOperatorPayload): Promise<any> {
    const res = await fetch("/api/manufacturing/production/route-operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to manage operator.");
    }
    return res.json();
}

export interface PatchTaskPayload {
    taskId: number;
    taskPatch: {
        status?: string;
        completed_at?: string | null;
        actual_run_hours?: number;
        actual_setup_hours?: number;
        work_center_id?: number | null;
    };
}

export async function patchRoutingTask(payload: PatchTaskPayload): Promise<void> {
    const res = await fetch("/api/manufacturing/planning-engineering", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to update task.");
}

export async function fetchQATemplate(taskName: string, productId: number, templateId?: number | null): Promise<any> {
    const templateParam = templateId && templateId > 0 ? `&templateId=${templateId}` : "";
    const res = await fetch(
        `/api/manufacturing/qa?action=matching-template&taskName=${encodeURIComponent(taskName)}&productId=${productId}${templateParam}`,
        { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Failed to load QA Checklist template.");
    return res.json();
}

export interface QAVerificationPayload {
    action: "verify";
    joId: string;
    taskId: number;
    taskName: string;
    productName: string;
    expectedQty: number;
    actualQty: number;
    verifications: Array<{
        parameter_id: number;
        test_name: string;
        value: string | number | boolean;
        min_value: number | null;
        max_value: number | null;
        target_value: string | null;
        is_failed: boolean;
        is_critical: boolean;
    }>;
    comments: string;
    userId: number | null;
}

export async function submitQAVerification(payload: QAVerificationPayload): Promise<any> {
    const res = await fetch("/api/manufacturing/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to process QA verification.");
    }
    return res.json();
}

export async function submitShiftRunLog(payload: ShiftRunLogPayload): Promise<any> {
    const res = await fetch("/api/manufacturing/production/shift-run-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to submit shift run log.");
    }
    return res.json();
}

export async function scanStationStart(payload: StationScanPayload): Promise<StationScanResponse> {
    const res = await fetch("/api/manufacturing/production/station-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed to process station start scan.");
    }
    return data;
}

export async function fetchWorkCenters(): Promise<WorkCenter[]> {
    const res = await fetch("/api/manufacturing/production/station-scan", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load work centers list.");
    const json = await res.json();
    return json.data || [];
}

export async function fetchJobOrderStatusHistory(joId: string | number): Promise<JobOrderStatusHistoryRecord[]> {
    const res = await fetch(`/api/manufacturing/production/station-scan?action=history&joId=${joId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load Job Order status history.");
    const json = await res.json();
    return json.data || [];
}

export async function fetchRejectionReasons(): Promise<RejectionReason[]> {
    const res = await fetch("/api/manufacturing/production/shift-run-log?action=rejection-reasons", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load rejection reasons.");
    const json = await res.json();
    return json.data || [];
}

export async function fetchGenealogyAndMovements(joId: string | number, batchNo?: string): Promise<{
    genealogy: MaterialGenealogyRecord[];
    movements: any[];
}> {
    let url = `/api/manufacturing/production/genealogy?joId=${joId}`;
    if (batchNo) url += `&batchNo=${encodeURIComponent(batchNo)}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to load genealogy records.");
    return {
        genealogy: json.genealogy || [],
        movements: json.movements || []
    };
}
