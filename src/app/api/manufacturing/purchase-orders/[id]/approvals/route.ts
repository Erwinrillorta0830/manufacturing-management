import { NextResponse } from "next/server";
import {
    purchaseOrderApprovalModulePath,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../_auth";
import {
    getPurchaseOrderApprovalDetail,
    PurchaseOrderApprovalError,
    submitPurchaseOrderApproval
} from "../../_approval-service";
import { purchaseOrderApprovalSchema, purchaseOrderApprovalStageSchema } from "../../_schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeError(error: unknown) {
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : error instanceof PurchaseOrderApprovalError
            ? error.status
            : 500;
    return NextResponse.json({
        error: (error as Error).message || "Purchase-order approval failed.",
        details: error instanceof PurchaseOrderApprovalError ? error.details : undefined
    }, { status });
}

function requestedStage(request: Request) {
    const value = new URL(request.url).searchParams.get("approvalStage");
    const parsed = purchaseOrderApprovalStageSchema.safeParse(value);
    if (!parsed.success) throw new PurchaseOrderApprovalError("A valid approval stage is required.", 400);
    return parsed.data;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
    try {
        const stage = requestedStage(request);
        await requirePurchaseOrderModuleAccess({
            modulePath: purchaseOrderApprovalModulePath(stage),
            approvalStage: stage
        });
        return NextResponse.json({ data: await getPurchaseOrderApprovalDetail(id, stage) });
    } catch (error) {
        return routeError(error);
    }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid purchase-order ID." }, { status: 400 });
    try {
        const stage = requestedStage(request);
        const parsed = purchaseOrderApprovalSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid approval action.", details: parsed.error.flatten() }, { status: 400 });
        }
        const actor = await requirePurchaseOrderModuleAccess({
            modulePath: purchaseOrderApprovalModulePath(stage),
            approvalStage: stage,
            requireReject: parsed.data.action !== "approve"
        });
        return NextResponse.json(await submitPurchaseOrderApproval(id, parsed.data, actor, stage));
    } catch (error) {
        return routeError(error);
    }
}
