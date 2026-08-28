import { NextResponse } from "next/server";
import { z } from "zod";
import {
    getLandedCostComputation,
    isLandedCostError,
    previewLandedCost,
    saveLandedCostDraft,
    type LandedCostExpenseInput
} from "./_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const positiveId = z.coerce.number().int().positive();
const expenseSchema = z.object({
    overhead_id: positiveId.nullish(),
    amount_php: z.coerce.number().finite().nonnegative()
});
const draftSchema = z.object({
    purchaseOrderId: positiveId,
    allocationRule: z.enum(["Quantity", "Value", "Weight", "Volume", "Hybrid"]),
    expenses: z.array(expenseSchema).default([]),
    exchangeRate: z.coerce.number().finite().positive().optional(),
    sourceFlow: z.string().trim().max(40).optional()
});

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Landed-cost request failed.";
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

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const purchaseOrderId = positiveId.parse(new URL(request.url).searchParams.get("purchaseOrderId"));
        const data = await getLandedCostComputation(purchaseOrderId);
        let preview = null;
        if (data.computation?.allocation_rule) {
            preview = await previewLandedCost({
                purchaseOrderId,
                allocationRule: data.computation.allocation_rule,
                expenses: data.expenses as LandedCostExpenseInput[],
                exchangeRate: data.computation.exchange_rate
            });
        }
        return NextResponse.json({ ...data, preview });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const parsed = draftSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "A valid allocation rule and expense inputs are required.", details: parsed.error.flatten() }, { status: 400 });
        }
        const result = await saveLandedCostDraft({
            purchaseOrderId: parsed.data.purchaseOrderId,
            allocationRule: parsed.data.allocationRule,
            expenses: parsed.data.expenses,
            exchangeRate: parsed.data.exchangeRate,
            actorId: actor.userId,
            sourceFlow: parsed.data.sourceFlow
        });
        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}
