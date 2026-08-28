import { NextResponse } from "next/server";
import { z } from "zod";
import {
    finalizeLandedCost,
    isLandedCostError,
    type LandedCostExpenseInput
} from "../_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const positiveId = z.coerce.number().int().positive();
const expenseSchema = z.object({
    overhead_id: positiveId.nullish(),
    amount_php: z.coerce.number().finite().nonnegative()
});
const finalizeSchema = z.object({
    purchaseOrderId: positiveId,
    computationId: positiveId.nullish(),
    allocationRule: z.enum(["Quantity", "Value", "Weight", "Volume", "Hybrid"]).optional(),
    expenses: z.array(expenseSchema).optional(),
    exchangeRate: z.coerce.number().finite().positive().optional(),
    sourceFlow: z.string().trim().max(40).optional()
});

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Landed-cost finalization failed.";
    const status = error instanceof PurchaseOrderAuthorizationError
        ? error.status
        : isLandedCostError(error)
            ? error.status
            : 500;
    return NextResponse.json({
        error: message,
        ...(isLandedCostError(error) ? { code: error.code, details: error.details } : {})
    }, { status });
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const parsed = finalizeSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "A purchase order and explicit allocation rule are required.", details: parsed.error.flatten() }, { status: 400 });
        }
        const result = await finalizeLandedCost({
            purchaseOrderId: parsed.data.purchaseOrderId,
            computationId: parsed.data.computationId,
            allocationRule: parsed.data.allocationRule,
            expenses: parsed.data.expenses as LandedCostExpenseInput[] | undefined,
            exchangeRate: parsed.data.exchangeRate,
            actorId: actor.userId,
            sourceFlow: parsed.data.sourceFlow
        });
        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}
