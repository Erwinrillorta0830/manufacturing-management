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

interface WorkflowActor {
    userId: number | null;
    canOverride: boolean;
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

async function getWorkflowActor(): Promise<WorkflowActor> {
    const token = (await cookies()).get("vos_access_token")?.value;
    const payload = readTokenPayload(token);
    const userId = Number(payload.id ?? payload.user_id ?? payload.sub);
    const roleValues = [
        payload.role,
        payload.roles,
        payload.position,
        payload.job_title,
        payload.department
    ].flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean);
    const canOverride = roleValues.some((value) =>
        /admin|manager|supervisor|director|manufacturing|production lead/.test(value)
    );
    return {
        userId: Number.isSafeInteger(userId) && userId > 0 ? userId : 24,
        canOverride
    };
}

function isWorkflowAction(value: unknown): value is JobOrderWorkflowAction {
    return typeof value === "string" && (JOB_ORDER_WORKFLOW_ACTIONS as readonly string[]).includes(value);
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
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

        const result = await executeJobOrderWorkflow(id, {
            action,
            actorUserId: actor.userId,
            idempotencyKey: String(body?.idempotencyKey || request.headers.get("idempotency-key") || "").trim(),
            remarks: typeof body?.remarks === "string" ? body.remarks.trim() : undefined,
            workCenterId: body?.workCenterId === null || body?.workCenterId === undefined
                ? null
                : Number(body.workCenterId),
            overrideReason: overrideReason || undefined,
            force: body?.force === true
        });
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        if (error instanceof JobOrderWorkflowError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                code: error.code,
                ...(error.details ? { details: error.details } : {})
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
