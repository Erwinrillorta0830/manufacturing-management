export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
    executeJobOrderWorkflow,
    JobOrderWorkflowError
} from "../../_workflow-service";
import {
    JOB_ORDER_WORKFLOW_ACTIONS,
    type JobOrderWorkflowAction
} from "@/modules/manufacturing-management/job-order-workflow";
import { JobOrderOperatorAssignmentError } from "../../_operator-assignment-service";
import {
    jobOrderWorkflowModulePath,
    JobOrderModuleAccessError,
    requireJobOrderModuleAccess
} from "@/app/api/manufacturing/job-orders/_module-access";
import {
    deleteJobOrderTerminationImage,
    JobOrderTerminationImageError,
    uploadJobOrderTerminationImage,
    validateJobOrderTerminationImage
} from "@/app/api/manufacturing/production/job-order-termination/_image";
import {
    deleteJobOrderWorkflowEvidence,
    JobOrderWorkflowEvidenceError,
    uploadJobOrderWorkflowEvidence,
    validateJobOrderWorkflowEvidence
} from "../../_workflow-evidence";

interface WorkflowActor {
    userId: number | null;
    canOverride: boolean;
    canTerminate: boolean;
}

function readTokenPayload(token: string | undefined): Record<string, unknown> {
    if (!token) return {};
    try {
        const parts = token.split(".");
        if (parts.length < 2) return {};
        let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) base64 += "=";
        return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    } catch {
        return {};
    }
}

function isTruthyClaim(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || String(value ?? "").trim().toLowerCase() === "true";
}

async function getWorkflowActor(): Promise<WorkflowActor | null> {
    const token = (await cookies()).get("vos_access_token")?.value;
    if (!token) return null;
    const payload = readTokenPayload(token);
    if (Object.keys(payload).length === 0) return null;
    const expiration = Number(payload.exp);
    if (Number.isFinite(expiration) && expiration <= Math.floor(Date.now() / 1000)) return null;
    const userId = Number(payload.id ?? payload.user_id ?? payload.sub);
    const roleValues = [
        payload.role,
        payload.roles,
        payload.position,
        payload.job_title,
        payload.department
    ].flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => {
            if (value && typeof value === "object") {
                const role = value as Record<string, unknown>;
                return String(role.name ?? role.code ?? role.title ?? "").trim().toLowerCase();
            }
            return String(value ?? "").trim().toLowerCase();
        })
        .filter(Boolean);
    const adminFlag = isTruthyClaim(payload.isAdmin) || isTruthyClaim(payload.is_admin);
    const canOverride = adminFlag || roleValues.some((value) =>
        /admin|manager|supervisor|director|manufacturing|production lead/.test(value)
    );
    const canTerminate = adminFlag || roleValues.some((value) =>
        /admin|manager|supervisor|director|production lead/.test(value)
    );
    return {
        userId: Number.isSafeInteger(userId) && userId > 0 ? userId : null,
        canOverride,
        canTerminate
    };
}

function isWorkflowAction(value: unknown): value is JobOrderWorkflowAction {
    return typeof value === "string" && (JOB_ORDER_WORKFLOW_ACTIONS as readonly string[]).includes(value);
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    let uploadedTerminationImageId: string | null = null;
    let uploadedWorkflowEvidenceImageId: string | null = null;
    try {
        const { id } = await params;
        const contentType = request.headers.get("content-type")?.toLowerCase() || "";
        let body: Record<string, unknown>;
        let terminationImage: File | null = null;
        let workflowEvidenceImage: File | null = null;

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const payloadValue = formData.get("payload");
            if (typeof payloadValue !== "string") {
                return NextResponse.json({
                    success: false,
                    error: "The Job Order workflow payload is required.",
                    code: "WORKFLOW_PAYLOAD_REQUIRED"
                }, { status: 400 });
            }

            let parsedPayload: unknown;
            try {
                parsedPayload = JSON.parse(payloadValue);
            } catch {
                return NextResponse.json({
                    success: false,
                    error: "The Job Order workflow payload is not valid JSON.",
                    code: "WORKFLOW_PAYLOAD_INVALID"
                }, { status: 400 });
            }
            if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
                return NextResponse.json({
                    success: false,
                    error: "The Job Order workflow payload must be an object.",
                    code: "WORKFLOW_PAYLOAD_INVALID"
                }, { status: 400 });
            }
            body = parsedPayload as Record<string, unknown>;

            const imageValue = formData.get("image");
            if (imageValue !== null && (typeof File === "undefined" || !(imageValue instanceof File))) {
                return NextResponse.json({
                    success: false,
                    error: "The termination evidence image is invalid.",
                    code: "TERMINATION_IMAGE_INVALID"
                }, { status: 422 });
            }
            workflowEvidenceImage = typeof File !== "undefined" && imageValue instanceof File ? imageValue : null;
            terminationImage = workflowEvidenceImage;
        } else {
            const parsedBody = await request.json().catch(() => ({}));
            body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
                ? parsedBody as Record<string, unknown>
                : {};
        }

        const action = body?.action;
        if (!isWorkflowAction(action)) {
            return NextResponse.json({
                success: false,
                error: "A valid workflow action is required.",
                code: "WORKFLOW_ACTION_INVALID",
                actions: JOB_ORDER_WORKFLOW_ACTIONS
            }, { status: 400 });
        }

        const authorizedUser = await requireJobOrderModuleAccess(jobOrderWorkflowModulePath(action));
        const actor = await getWorkflowActor();
        if (!actor?.userId) {
            return NextResponse.json({
                success: false,
                error: "Authentication is required for Job Order workflow actions.",
                code: "AUTHENTICATION_REQUIRED"
            }, { status: 401 });
        }
        actor.userId = authorizedUser.userId;
        actor.canOverride ||= authorizedUser.admin;
        actor.canTerminate ||= authorizedUser.admin;
        if (action === "terminate-production" && !actor.canTerminate) {
            return NextResponse.json({
                success: false,
                error: "Only an authorized production supervisor, manager, or administrator may terminate a production Job Order.",
                code: "WORKFLOW_TERMINATION_NOT_AUTHORIZED"
            }, { status: 403 });
        }
        const overrideReason = typeof body?.overrideReason === "string"
            ? body.overrideReason.trim()
            : "";
        if (body?.force === true || overrideReason) {
            if (!actor.canOverride) {
                return NextResponse.json({
                    success: false,
                    error: "Only an authorized manufacturing supervisor or manager may approve a workflow override.",
                    code: "WORKFLOW_OVERRIDE_NOT_AUTHORIZED"
                }, { status: 403 });
            }
            if (!overrideReason) {
                return NextResponse.json({
                    success: false,
                    error: "An override reason is required.",
                    code: "WORKFLOW_OVERRIDE_REASON_REQUIRED"
                }, { status: 400 });
            }
        }

        const actorUserId = authorizedUser.userId;

        if (action === "terminate-production") {
            if (!terminationImage) {
                return NextResponse.json({
                    success: false,
                    error: "A termination evidence image is required.",
                    code: "TERMINATION_IMAGE_REQUIRED"
                }, { status: 422 });
            }
            const imageError = validateJobOrderTerminationImage(terminationImage);
            if (imageError) {
                return NextResponse.json({
                    success: false,
                    error: imageError,
                    code: "TERMINATION_IMAGE_INVALID"
                }, { status: 422 });
            }
            uploadedTerminationImageId = await uploadJobOrderTerminationImage(terminationImage, String(id));
        }
        if (action === "place-on-hold") {
            if (!workflowEvidenceImage) {
                return NextResponse.json({
                    success: false,
                    error: "A breakdown or hold evidence image is required.",
                    code: "WORKFLOW_EVIDENCE_REQUIRED"
                }, { status: 422 });
            }
            const imageError = validateJobOrderWorkflowEvidence(workflowEvidenceImage);
            if (imageError) {
                return NextResponse.json({
                    success: false,
                    error: imageError,
                    code: "WORKFLOW_EVIDENCE_INVALID"
                }, { status: 422 });
            }
            uploadedWorkflowEvidenceImageId = await uploadJobOrderWorkflowEvidence(
                workflowEvidenceImage,
                String(id),
                "hold"
            );
        }

        const routeId = body?.joRouteId === null || body?.joRouteId === undefined
            ? null
            : Number(body.joRouteId);
        const reportedYieldQuantity = body?.reportedYieldQuantity === null || body?.reportedYieldQuantity === undefined
            ? null
            : Number(body.reportedYieldQuantity);

        const result = await executeJobOrderWorkflow(id, {
            action,
            actorUserId,
            idempotencyKey: String(body?.idempotencyKey || request.headers.get("idempotency-key") || "").trim(),
            remarks: typeof body?.remarks === "string" ? body.remarks.trim() : undefined,
            resolutionRemarks: typeof body?.resolutionRemarks === "string"
                ? body.resolutionRemarks.trim()
                : (typeof body?.resumeResolution === "string" ? body.resumeResolution.trim() : undefined),
            workCenterId: body?.workCenterId === null || body?.workCenterId === undefined
                ? null
                : Number(body.workCenterId),
            overrideReason: overrideReason || undefined,
            force: body?.force === true,
            terminationImageId: uploadedTerminationImageId,
            evidenceImageId: uploadedWorkflowEvidenceImageId,
            joRouteId: routeId !== null && Number.isSafeInteger(routeId) && routeId > 0 ? routeId : null,
            reportedYieldQuantity: reportedYieldQuantity !== null && Number.isFinite(reportedYieldQuantity) && reportedYieldQuantity >= 0
                ? reportedYieldQuantity
                : null
        });

        if (result.idempotent && uploadedTerminationImageId) {
            await deleteJobOrderTerminationImage(uploadedTerminationImageId);
            uploadedTerminationImageId = null;
        }
        if (result.idempotent && uploadedWorkflowEvidenceImageId) {
            await deleteJobOrderWorkflowEvidence(uploadedWorkflowEvidenceImageId);
            uploadedWorkflowEvidenceImageId = null;
        }
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        if (uploadedTerminationImageId) {
            await deleteJobOrderTerminationImage(uploadedTerminationImageId);
        }
        if (uploadedWorkflowEvidenceImageId) {
            await deleteJobOrderWorkflowEvidence(uploadedWorkflowEvidenceImageId);
        }
        if (error instanceof JobOrderTerminationImageError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                code: error.code
            }, { status: error.status });
        }
        if (error instanceof JobOrderWorkflowEvidenceError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                code: error.code
            }, { status: error.status });
        }
        if (error instanceof JobOrderWorkflowError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                code: error.code,
                ...(error.details ? { details: error.details } : {})
            }, { status: error.status });
        }
        if (error instanceof JobOrderOperatorAssignmentError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                code: error.code
            }, { status: error.status });
        }
        if (error instanceof JobOrderModuleAccessError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                code: error.code
            }, { status: error.status });
        }
        console.error("Job Order workflow request failed:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Job Order workflow request failed.",
            code: "JOB_ORDER_WORKFLOW_FAILED"
        }, { status: 500 });
    }
}
