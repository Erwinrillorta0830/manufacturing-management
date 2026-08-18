import { NextResponse } from "next/server";
import { z } from "zod";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import {
    createQuarantineDisposition,
    listQuarantineStock,
    QuarantineDispositionError
} from "../_quarantine-disposition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
    sourceReceivingId: z.coerce.number().int().positive(),
    lotId: z.coerce.number().int().positive().nullable().optional(),
    batchNo: z.string().trim().min(1).max(100).nullable().optional(),
    dispositionType: z.enum(["VENDOR_RETURN", "REPLACEMENT"]),
    requestedQuantity: z.coerce.number().finite().positive(),
    reason: z.string().trim().min(1).max(2000),
    supplierReference: z.string().trim().max(150).nullable().optional(),
    idempotencyKey: z.string().trim().max(100).nullable().optional()
});

export async function GET() {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        return NextResponse.json(await listQuarantineStock());
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof QuarantineDispositionError
                ? error.statusCode
                : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to load quarantine stock." }, { status });
    }
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        const parsed = createSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: "Invalid quarantine disposition request.", details: parsed.error.flatten() }, { status: 400 });
        const disposition = await createQuarantineDisposition({
            ...parsed.data,
            actorUserId: actor.userId
        });
        return NextResponse.json({ data: disposition }, { status: 201 });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof QuarantineDispositionError
                ? error.statusCode
                : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to create quarantine disposition." }, { status });
    }
}
