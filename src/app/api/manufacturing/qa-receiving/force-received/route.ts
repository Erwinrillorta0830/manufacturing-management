import { NextResponse } from "next/server";
import { z } from "zod";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { forceReceivePurchaseOrder } from "../_force-received-service";
import {
    FORCE_RECEIVED_IDEMPOTENCY_KEY_PATTERN,
    FORCE_RECEIVED_REASON_MAX_LENGTH,
    ForceReceivedError,
    normalizeForceReceivedReason
} from "../_force-received";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
    shipmentId: z.number().int().positive(),
    workflowRevision: z.number().int().nonnegative(),
    reason: z.string()
});

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
        if (!FORCE_RECEIVED_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
            throw new ForceReceivedError("A valid UUID Idempotency-Key header is required.", 400);
        }
        const parsed = requestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid Force Received request.", details: parsed.error.flatten() }, { status: 400 });
        }
        const reason = normalizeForceReceivedReason(parsed.data.reason);
        if (!reason) {
            return NextResponse.json({
                error: `Force Close Reason is required and must be at most ${FORCE_RECEIVED_REASON_MAX_LENGTH} characters.`
            }, { status: 400 });
        }
        const data = await forceReceivePurchaseOrder({
            shipmentId: parsed.data.shipmentId,
            workflowRevision: parsed.data.workflowRevision,
            reason,
            idempotencyKey,
            actor
        });
        return NextResponse.json({ data });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message || "Failed to force-receive the purchase order." }, {
            status: error instanceof PurchaseOrderAuthorizationError
                ? error.status
                : error instanceof ForceReceivedError
                    ? error.status
                    : 500
        });
    }
}
