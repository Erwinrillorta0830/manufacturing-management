import { NextResponse } from "next/server";
import { fetchShipmentExpenses } from "./expenses-helper";
import { expenseAllocationSchema } from "../_schemas";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { assertLandedCostStatus, LandedCostEligibilityError } from "../_landed-cost-eligibility";
import { finalizeLandedCost, isLandedCostError } from "../landed-cost/_domain";

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const { searchParams } = new URL(request.url);
        const shipmentId = Number(searchParams.get("shipmentId"));

        if (!Number.isInteger(shipmentId) || shipmentId <= 0) {
            return NextResponse.json({ error: "shipmentId is required" }, { status: 400 });
        }

        await assertLandedCostStatus(shipmentId);
        const expenses = await fetchShipmentExpenses(shipmentId);
        return NextResponse.json(expenses);
    } catch (e) {
        console.error("API Error fetching shipment expenses:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch shipment expenses" }, {
            status: e instanceof PurchaseOrderAuthorizationError || e instanceof LandedCostEligibilityError ? e.status : 500,
            ...(isLandedCostError(e) ? { code: e.code, details: e.details } : e instanceof LandedCostEligibilityError ? { code: e.code } : {})
        });
    }
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const parsed = expenseAllocationSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid expense allocation.", details: parsed.error.flatten() }, { status: 400 });
        }
        const { shipmentId, expenses, allocationMethod } = parsed.data;
        const normalizedRule = allocationMethod.replace(/^By\s+/i, "");
        const result = await finalizeLandedCost({
            purchaseOrderId: shipmentId,
            allocationRule: normalizedRule,
            expenses,
            actorId: actor.userId,
            sourceFlow: "SHIPMENT_EXPENSES"
        });
        return NextResponse.json(result);
    } catch (e) {
        console.error("API Error allocating shipment expenses:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to allocate shipment expenses" }, {
            status: e instanceof PurchaseOrderAuthorizationError || e instanceof LandedCostEligibilityError || isLandedCostError(e) ? e.status : 500,
            ...(isLandedCostError(e) ? { code: e.code, details: e.details } : e instanceof LandedCostEligibilityError ? { code: e.code } : {})
        });
    }
}
