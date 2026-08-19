import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { assertLandedCostStatus, LandedCostEligibilityError } from "../_landed-cost-eligibility";
import { finalizeLandedCost, getLandedCostComputation, isLandedCostError } from "../landed-cost/_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import {
    ProductWeightValidationError,
    resolveProductWeightBreakdown
} from "@/modules/manufacturing-management/procurement/packaging-weight";
import { ProductCategoryTypeValidationError, resolveProductCategoryTypes } from "../_category-type";

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const { searchParams } = new URL(request.url);
        const poId = searchParams.get("poId");

        // Fetch chart of accounts
        const coaRes = await fetch(`${DIRECTUS_URL}/items/chart_of_accounts?limit=-1&sort=gl_code`, {
            headers,
            cache: "no-store"
        }).catch(() => null);

        let chartOfAccounts = [];
        if (coaRes && coaRes.ok) {
            const coaData = await coaRes.json();
            chartOfAccounts = coaData?.data || [];
        }

        // Fetch forex exchange rate from forex_configurations
        const forexRes = await fetch(`${DIRECTUS_URL}/items/forex_configurations?filter[currency_code][_eq]=USD&limit=1`, {
            headers,
            cache: "no-store"
        }).catch(() => null);

        let activeForexRate = 58.50; // Default fallback exchange rate PHP/USD
        if (forexRes && forexRes.ok) {
            const forexData = await forexRes.json();
            if (forexData?.data?.[0]?.exchange_rate) {
                activeForexRate = Number(forexData.data[0].exchange_rate);
            }
        }

        if (!poId) {
            return NextResponse.json({
                chartOfAccounts,
                activeForexRate
            });
        }

        const purchaseOrderId = Number(poId);
        if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
            return NextResponse.json({ error: "Invalid purchase order ID" }, { status: 400 });
        }

        // Fetch purchase order details
        const poRes = await fetch(`${DIRECTUS_URL}/items/purchase_order/${poId}?fields=*,supplier_name.*`, {
            headers,
            cache: "no-store"
        });

        if (!poRes.ok) {
            return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });
        }

        const poData = await poRes.json();
        const purchaseOrder = poData?.data;
        await assertLandedCostStatus(purchaseOrderId);

        // Fetch PO line items from purchase_order_receiving
        const linesRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${poId}&filter[is_reverted][_eq]=0&fields=*,product_id.*,product_id.weight_unit_id.*&limit=-1`, {
            headers,
            cache: "no-store"
        });

        let lineItems: Record<string, unknown>[] = [];
        if (linesRes.ok) {
            const linesData = await linesRes.json();
            const persistedLines = (linesData?.data || []) as Record<string, unknown>[];
            const productIds = persistedLines
                .map(item => {
                    const product = item.product_id;
                    return Number(product && typeof product === "object"
                        ? (product as Record<string, unknown>).product_id
                        : product);
                })
                .filter(id => Number.isInteger(id) && id > 0);
            const categoryTypes = await resolveProductCategoryTypes(productIds);
            lineItems = persistedLines.map((item: Record<string, unknown>) => {
                const product = item.product_id;
                const productId = Number(product && typeof product === "object"
                    ? (product as Record<string, unknown>).product_id
                    : product);
                const weightBreakdown = resolveProductWeightBreakdown(item.product_id, {
                    requireComplete: categoryTypes.get(productId) === "PACKAGING"
                });
                return {
                ...item,
                category_type: categoryTypes.get(productId),
                gross_weight: weightBreakdown.grossWeightKg,
                net_weight: weightBreakdown.netWeight,
                outer_carton_weight: weightBreakdown.outerCartonWeight,
                pallet_weight: weightBreakdown.palletWeight,
                unit_gross_weight_kg: weightBreakdown.grossWeightKg,
                unit_net_weight_kg: weightBreakdown.netWeightKg,
                unit_outer_carton_weight_kg: weightBreakdown.outerCartonWeightKg,
                unit_pallet_weight_kg: weightBreakdown.palletWeightKg,
                weight_unit: weightBreakdown.weightUnitCode,
                line_gross_weight_kg: weightBreakdown.grossWeightKg * Number(item.received_quantity || 0)
                };
            });
        }

        // Fetch existing import landed cost entries
        const importRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_import?filter[purchase_order_id][_eq]=${poId}&fields=*&limit=-1`, {
            headers,
            cache: "no-store"
        }).catch(() => null);

        let importExpenses = [];
        if (importRes && importRes.ok) {
            const importData = await importRes.json();
            importExpenses = importData?.data || [];
        }

        let landedCost = { computation: null, attachments: [], expenses: [] } as Awaited<ReturnType<typeof getLandedCostComputation>>;
        try {
            landedCost = await getLandedCostComputation(purchaseOrderId);
        } catch (error) {
            console.warn("[Manufacturing] Canonical landed-cost draft unavailable; using compatibility import rows.", error);
        }

        return NextResponse.json({
            purchaseOrder,
            lineItems,
            importExpenses,
            landedCost,
            chartOfAccounts,
            activeForexRate
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({
            error: message,
            ...(error instanceof LandedCostEligibilityError ? { code: error.code } : {})
        }, { status: error instanceof LandedCostEligibilityError || error instanceof ProductCategoryTypeValidationError || error instanceof ProductWeightValidationError
            ? error.status
            : 500 });
    }
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const body = await request.json();

        if (!body.purchase_order_id || !Array.isArray(body.line_items) || body.line_items.length === 0) {
            return NextResponse.json({ error: "Missing required purchase_order_id or line_items" }, { status: 400 });
        }

        const allocationRule = body.allocation_rule || body.allocationMethod;
        if (!allocationRule) {
            return NextResponse.json({ error: "Select an allocation rule before posting purchase amounts.", code: "ALLOCATION_RULE_REQUIRED" }, { status: 400 });
        }
        const expenses = Array.isArray(body.expenses)
            ? body.expenses.map((expense: Record<string, unknown>) => ({
                chart_of_account_id: Number(expense.chart_of_account_id) || null,
                expense_type: typeof expense.expense_type === "string" ? expense.expense_type : "",
                amount_php: Number(expense.amount || expense.amount_php || 0)
            }))
            : [];
        const result = await finalizeLandedCost({
            purchaseOrderId: Number(body.purchase_order_id),
            computationId: body.computation_id ? Number(body.computation_id) : null,
            allocationRule,
            expenses,
            actorId: actor.userId,
            sourceFlow: "PURCHASE_AMOUNT_POSTING"
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Allocation Error";
        return NextResponse.json({
            error: message,
            ...(error instanceof LandedCostEligibilityError || isLandedCostError(error) ? { code: (error as { code?: string }).code } : {})
        }, { status: error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof LandedCostEligibilityError || error instanceof ProductCategoryTypeValidationError || error instanceof ProductWeightValidationError || isLandedCostError(error)
            ? error.status
            : 500 });
    }
}
