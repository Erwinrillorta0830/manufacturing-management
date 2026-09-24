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
    ShiftRunLogPayload,
    JobOrderCancellationPayload,
    JobOrderCancellationPreview,
    JobOrderCancellationResponse,
    WipTopUpPayload,
    WipTopUpResponse,
    WorkCenterJobOrderAvailability,
    JobOrderMaterialLine
} from "../types";
import type { JobOrderWorkflowAction } from "../../job-order-workflow";

export type { ShiftRunLogPayload };

export async function fetchJobOrders(): Promise<JobOrder[]> {
    const res = await fetch("/api/manufacturing/planning-engineering", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load job orders");
    return res.json();
}

export async function fetchJobOrderMaterials(jobOrderId: number | string): Promise<JobOrderMaterialLine[]> {
    const res = await fetch(
        `/api/manufacturing/planning-engineering?action=job-materials&joId=${encodeURIComponent(String(jobOrderId))}`,
        { cache: "no-store" }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.error || "Failed to load Job Order material batches.");
    }
    return Array.isArray(data)
        ? data.map((line: any) => ({
            jo_material_id: Number(line.jo_material_id || line.id || 0) || undefined,
            product_id: Number(line.product_id?.product_id || line.product_id || 0),
            product_name: String(line.product_name || `Product #${line.product_id || ""}`),
            reservations: Array.isArray(line.reservations)
                ? line.reservations.map((reservation: any) => ({
                    reservation_id: Number(reservation.reservation_id || reservation.jo_materials_reservation_id || reservation.id || 0) || null,
                    batch_no: reservation.batch_no ? String(reservation.batch_no) : null,
                    reservation_status: reservation.reservation_status || null,
                    reserved_quantity: Number(reservation.reserved_quantity || 0),
                    staged_quantity: Number(reservation.staged_quantity || 0),
                    issued_to_wip_quantity: Number(reservation.issued_to_wip_quantity || 0),
                    remaining_wip_quantity: Number(reservation.remaining_wip_quantity || 0)
                }))
                : []
        }))
        : [];
}

export interface JobOrderWorkflowPayload {
    action: JobOrderWorkflowAction;
    remarks?: string;
    resolutionRemarks?: string;
    terminationImage?: File | null;
    workflowEvidenceImage?: File | null;
    joRouteId?: number | null;
    reportedYieldQuantity?: number | null;
    workCenterId?: number | null;
    force?: boolean;
    overrideReason?: string;
    idempotencyKey?: string;
}

export async function executeJobOrderWorkflow(
    joId: string | number,
    payload: JobOrderWorkflowPayload
): Promise<any> {
    const { terminationImage, workflowEvidenceImage, ...jsonPayload } = payload;
    const body = {
        ...jsonPayload,
        idempotencyKey: payload.idempotencyKey || (
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `workflow:${payload.action}:${joId}:${Date.now()}`
        )
    };
    const request: RequestInit = { method: "POST" };
    if (payload.action === "terminate-production" || payload.action === "place-on-hold") {
        const formData = new FormData();
        formData.set("payload", JSON.stringify(body));
        const image = payload.action === "terminate-production" ? terminationImage : workflowEvidenceImage;
        if (image) formData.set("image", image, image.name);
        request.body = formData;
    } else {
        request.headers = { "Content-Type": "application/json" };
        request.body = JSON.stringify(body);
    }

    const res = await fetch(`/api/manufacturing/job-orders/${encodeURIComponent(String(joId))}/workflow`, request);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || "Failed to execute Job Order workflow action.");
    }
    return data?.data ?? data;
}

export async function fetchUsersList(): Promise<User[]> {
    const res = await fetch("/api/manufacturing/planning-engineering?action=users", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load operators list");
    return res.json();
}

export interface RouteOperatorsResponse {
    data: RouteOperatorRecord[];
    assignedPersonnel?: Record<string, number[]> | null;
    assignmentState?: {
        jobOrderId: number;
        jobOrderNo: string;
        assignedPersonnel: Record<string, number[]>;
    } | null;
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
    action: "start-timer" | "stop-timer" | "log-hours" | "remove-operator" | "swap-operator" | "edit-hours" | "edit-times" | string;
    taskId: number;
    userId: number;
    joId: string;
    routeOperatorId?: number;
    routingId?: number;
    actualHours?: number;
    hourlyRate?: number;
    replacementUserId?: number;
    startedAt?: string;
    stoppedAt?: string;
    changeReason?: string;
    requestId?: string;
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
    const { evidenceImage, ...sessionPayload } = payload;
    const formData = new FormData();
    formData.set("payload", JSON.stringify(sessionPayload));
    formData.set("image", evidenceImage, evidenceImage.name);

    const res = await fetch("/api/manufacturing/production/shift-run-log", {
        method: "POST",
        body: formData
    });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to submit shift run log.");
    }
    return res.json();
}

export async function addReservedMaterial(payload: WipTopUpPayload): Promise<WipTopUpResponse> {
    const res = await fetch("/api/manufacturing/production/wip-top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || "Failed to add reserved materials.");
    }
    return data as WipTopUpResponse;
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

export type WorkCenterApplicabilitySource = "VERSION_ROUTING" | "JO_ROUTES" | "NONE" | "ALL";

export interface RouteWorkCenterOption {
    joRouteId: number;
    sequenceOrder: number;
    operationId: number | null;
    status: string | null;
    currentWorkCenterId: number | null;
    workCenterIds: number[];
    source: "VERSION_ROUTING" | "JO_ROUTES" | "NONE";
}

export interface WorkCenterListResponse {
    data: WorkCenter[];
    applicableWorkCenterIds: number[];
    source: WorkCenterApplicabilitySource;
    routeOptions: RouteWorkCenterOption[];
}

export async function fetchWorkCenters(jobOrderId?: number | string | null): Promise<WorkCenterListResponse> {
    const hasJobOrder = jobOrderId !== undefined && jobOrderId !== null && String(jobOrderId).trim() !== "";
    const query = hasJobOrder
        ? `?action=applicable-work-centers&joId=${encodeURIComponent(String(jobOrderId))}`
        : "";
    const res = await fetch(`/api/manufacturing/production/station-scan${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load work centers list.");
    const json = await res.json();
    return {
        data: json.data || [],
        applicableWorkCenterIds: Array.isArray(json.applicableWorkCenterIds) ? json.applicableWorkCenterIds : [],
        source: hasJobOrder ? (json.source || "NONE") : "ALL",
        routeOptions: Array.isArray(json.routeOptions) ? json.routeOptions : []
    };
}

export async function fetchWorkCenterAvailability(options: {
    workCenterId?: number | null;
    branchId?: number | null;
} = {}): Promise<WorkCenterJobOrderAvailability[]> {
    const params = new URLSearchParams({ action: "work-center-availability" });
    if (options.workCenterId) params.set("workCenterId", String(options.workCenterId));
    if (options.branchId) params.set("branchId", String(options.branchId));

    const res = await fetch(`/api/manufacturing/production/station-scan?${params.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
        throw new Error(json.error || "Failed to load Job Order workstation availability.");
    }
    return Array.isArray(json.data) ? json.data : [];
}

export interface RouteWorkCenterAssignment {
    joRouteId: number;
    workCenterId: number;
}

export interface RouteWorkCenterAssignmentResponse {
    success: boolean;
    data?: {
        jobOrderId: number;
        routes: Array<{
            joRouteId: number;
            sequenceOrder: number;
            operationId: number | null;
            status: string;
            workCenterId: number;
            workCenterName: string | null;
        }>;
    };
    error?: string;
}

export async function assignRouteWorkCenters(
    jobOrderId: number | string,
    assignments: RouteWorkCenterAssignment[]
): Promise<RouteWorkCenterAssignmentResponse["data"]> {
    const res = await fetch("/api/manufacturing/planning-engineering", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "assign-route-workcenters",
            jobOrderId,
            assignments
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
        throw new Error(data?.error || "Failed to save route workstation assignments.");
    }
    return data.data;
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

export async function fetchJobOrderCancellationPreview(joId: string | number): Promise<JobOrderCancellationPreview> {
    const res = await fetch(
        `/api/manufacturing/production/job-order-cancellation?joId=${encodeURIComponent(String(joId))}`,
        { cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to load the Job Order cancellation preview.");
    return json.data;
}

async function submitJobOrderCancellation(
    payload: JobOrderCancellationPayload,
    cancellationImage?: File | null
): Promise<JobOrderCancellationResponse> {
    const isCancellation = payload.action === "cancel-and-return";
    const request: RequestInit = { method: "POST" };

    if (isCancellation) {
        const formData = new FormData();
        formData.set("payload", JSON.stringify(payload));
        if (cancellationImage) formData.set("image", cancellationImage, cancellationImage.name);
        request.body = formData;
    } else {
        request.headers = { "Content-Type": "application/json" };
        request.body = JSON.stringify(payload);
    }

    const res = await fetch("/api/manufacturing/production/job-order-cancellation", request);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to process the Job Order cancellation.");
    return json.data;
}

export async function cancelJobOrder(
    joId: string | number,
    reason: string,
    cancellationImage: File
): Promise<JobOrderCancellationResponse> {
    return submitJobOrderCancellation({ action: "cancel-and-return", joId, reason }, cancellationImage);
}

export async function returnJobOrderMaterials(joId: string | number, reason?: string): Promise<JobOrderCancellationResponse> {
    return submitJobOrderCancellation({ action: "return-materials", joId, reason });
}
