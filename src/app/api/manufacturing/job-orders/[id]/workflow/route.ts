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
    deleteJobOrderTerminationImage,
    JobOrderTerminationImageError,
    uploadJobOrderTerminationImage,
    validateJobOrderTerminationImage
} from "@/app/api/manufacturing/production/job-order-termination/_image";

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
    try {
        const { id } = await params;
        const contentType = request.headers.get("content-type")?.toLowerCase() || "";
        let body: Record<string, unknown>;
        let terminationImage: File | null = null;

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
            terminationImage = typeof File !== "undefined" && imageValue instanceof File ? imageValue : null;
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

        const actor = await getWorkflowActor();
        if (!actor?.userId) {
            return NextResponse.json({
                success: false,
                error: "Authentication is required for Job Order workflow actions.",
                code: "AUTHENTICATION_REQUIRED"
            }, { status: 401 });
        }
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

        const result = await executeJobOrderWorkflow(id, {
            action,
            actorUserId: actor.userId,
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
            terminationImageId: uploadedTerminationImageId
        });

        if (result.idempotent && uploadedTerminationImageId) {
            await deleteJobOrderTerminationImage(uploadedTerminationImageId);
            uploadedTerminationImageId = null;
        }
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        if (uploadedTerminationImageId) {
            await deleteJobOrderTerminationImage(uploadedTerminationImageId);
        }
        if (error instanceof JobOrderTerminationImageError) {
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
        console.error("Job Order workflow request failed:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Job Order workflow request failed.",
            code: "JOB_ORDER_WORKFLOW_FAILED"
        }, { status: 500 });
    }
}
