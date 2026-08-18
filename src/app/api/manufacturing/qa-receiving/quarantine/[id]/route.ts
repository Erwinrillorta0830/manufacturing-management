import { NextResponse } from "next/server";
import { z } from "zod";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../purchase-orders/_auth";
import {
    cancelQuarantineDisposition,
    fetchQuarantineDisposition,
    processQuarantineDisposition,
    QuarantineDispositionError
} from "../../_quarantine-disposition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const processSchema = z.object({
    action: z.enum(["PROCESS_RETURN", "CANCEL"]),
    quantity: z.coerce.number().finite().positive().optional(),
    operationKey: z.string().trim().min(1).max(100).optional()
});

function idFromParams(raw: string): number {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) throw new QuarantineDispositionError(400, "Invalid quarantine disposition ID.");
    return id;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        return NextResponse.json({ data: await fetchQuarantineDisposition(idFromParams((await params).id)) });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof QuarantineDispositionError
                ? error.statusCode
                : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to load quarantine disposition." }, { status });
    }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const parsed = processSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: "Invalid quarantine disposition operation.", details: parsed.error.flatten() }, { status: 400 });
        const id = idFromParams((await params).id);
        if (parsed.data.action === "CANCEL") {
            return NextResponse.json({ data: await cancelQuarantineDisposition(id, actor.userId) });
        }
        if (!parsed.data.quantity) return NextResponse.json({ error: "A positive quantity is required to process a vendor return." }, { status: 422 });
        const operationKey = parsed.data.operationKey || request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
        return NextResponse.json({ data: await processQuarantineDisposition({
            dispositionId: id,
            quantity: parsed.data.quantity,
            operationKey,
            actorUserId: actor.userId
        }) });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof QuarantineDispositionError
                ? error.statusCode
                : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to process quarantine disposition." }, { status });
    }
}
