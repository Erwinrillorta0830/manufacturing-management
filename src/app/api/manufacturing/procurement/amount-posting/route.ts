import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { assertLandedCostStatus, LandedCostEligibilityError } from "../_landed-cost-eligibility";
import {
    finalizeLandedCost,
    getLandedCostComputation,
    getLandedCostExpenseTypes,
    isLandedCostError,
    loadLandedCostSnapshot,
    buildPricingFingerprint
} from "../landed-cost/_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { isPurchaseOrderPosted } from "@/modules/manufacturing-management/procurement/landed-cost-eligibility";
import { PROCUREMENT_MONEY_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";

function weightedAverage(
    rows: Array<{ received_quantity?: unknown; quantity_allocated?: unknown; quantity_rejected?: unknown; qa_status?: unknown } & Record<string, unknown>>,
    field: string,
    quantity: number,
    fallback: number
): number {
    if (quantity <= 0) return fallback;
    let weightedTotal = 0;
    let weightedQuantity = 0;
    for (const row of rows) {
        const qaStatus = String(row.qa_status || "").toUpperCase();
        let accepted = 0;
        if (qaStatus === "GOOD") {
            accepted = Math.max(0, Number(row.quantity_allocated ?? row.received_quantity ?? 0));
        } else if (qaStatus === "DAMAGED" || qaStatus === "QUARANTINED" || qaStatus === "EXPIRED") {
            accepted = 0;
        } else {
            accepted = Math.max(0, Number(row.received_quantity || 0) - Number(row.quantity_rejected ?? row.quantity_allocated ?? 0));
        }
        const value = Number(row[field]);
        if (accepted > 0 && Number.isFinite(value)) {
            weightedTotal += accepted * value;
            weightedQuantity += accepted;
        }
    }
    return weightedQuantity > 0 ? weightedTotal / weightedQuantity : fallback;
}

function buildCanonicalLineItems(snapshot: Awaited<ReturnType<typeof loadLandedCostSnapshot>>) {
    return snapshot.lines.map(line => {
        const product = {
            ...(line.product as Record<string, unknown>),
            product_id: line.productId,
            product_name: line.productName
        };
        const receivingRows = line.receivingRows as Array<{ received_quantity?: unknown; quantity_allocated?: unknown; quantity_rejected?: unknown; qa_status?: unknown } & Record<string, unknown>>;
        const receivedQuantity = receivingRows.reduce((sum, row) => sum + Math.max(0, Number(row.received_quantity || 0)), 0);
        const rejectedQuantity = receivingRows.reduce((sum, row) => {
            const qaStatus = String(row.qa_status || "").toUpperCase();
            if (qaStatus === "DAMAGED" || qaStatus === "QUARANTINED" || qaStatus === "EXPIRED") {
                return sum + Math.max(0, Number(row.quantity_allocated ?? row.received_quantity ?? 0));
            }
            return sum + Math.max(0, Number(row.quantity_rejected || 0));
        }, 0);
        const allocatedExpense = weightedAverage(receivingRows, "allocated_expense_php", line.quantity, 0);
        const finalLandedUnitCost = weightedAverage(receivingRows, "final_landed_unit_cost", line.quantity, line.baseUnitCostPhp + allocatedExpense);

        return {
            purchase_order_product_id: line.key,
            product_id: product,
            product_name: line.productName,
            category_type: line.categoryType,
            received_quantity: line.quantity,
            accepted_quantity: line.quantity,
            quantity_received: receivedQuantity,
            quantity_rejected: rejectedQuantity,
            unit_price: line.baseUnitCostPhp,
            unit_price_foreign: line.unitPriceForeign,
            base_unit_cost_php: line.baseUnitCostPhp,
            gross_weight: line.lineGrossWeightKg / line.quantity,
            line_gross_weight_kg: line.lineGrossWeightKg,
            allocated_expense_php: allocatedExpense,
            final_landed_unit_cost: finalLandedUnitCost,
            total_amount: finalLandedUnitCost * line.quantity,
            uom: line.uom,
            currency_code: snapshot.currencyCode,
            list_price: line.unitPriceTransaction,
            discount_percent: line.discountPercent,
            discount_amount: line.discountAmountTransaction,
            net_amount: line.netAmountTransaction,
            total_landed_cost: Number((finalLandedUnitCost * line.quantity).toFixed(PROCUREMENT_MONEY_DECIMAL_SCALE)),
            price_source: line.priceSource,
            priced_at: line.pricedAt
        };
    });
}

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.expenses });
        const { searchParams } = new URL(request.url);
        const poId = searchParams.get("poId");
        const includePosted = searchParams.get("includePosted") === "true";

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

        const expenseTypes = await getLandedCostExpenseTypes();

        // Fetch forex exchange rate from forex_configurations
        const forexRes = await fetch(`${DIRECTUS_URL}/items/forex_configurations?filter[currency_code][_eq]=USD&limit=1`, {
            headers,
            cache: "no-store"
        }).catch(() => null);

        let activeForexRate: number | null = null;
        if (forexRes && forexRes.ok) {
            const forexData = await forexRes.json();
            const configuredRate = Number(forexData?.data?.[0]?.exchange_rate);
            if (Number.isFinite(configuredRate) && configuredRate > 0) {
                activeForexRate = configuredRate;
            }
        }

        if (!poId) {
            return NextResponse.json({
                chartOfAccounts,
                activeForexRate,
                expenseTypes
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
        if (includePosted) {
            if (!isPurchaseOrderPosted(purchaseOrder)) {
                return NextResponse.json({
                    error: "Purchase order is not posted for ledger viewing.",
                    code: "POSTED_LEDGER_REQUIRED"
                }, { status: 409 });
            }
        } else {
            await assertLandedCostStatus(purchaseOrderId);
        }

        // Build the preview from the same persisted PO-line and accepted-receipt
        // snapshot used by the canonical finalizer. Receiving unit_price is PHP;
        // it is never treated as the foreign invoice price.
        const snapshot = await loadLandedCostSnapshot(purchaseOrderId);
        const lineItems = buildCanonicalLineItems(snapshot);
        const pricingFingerprint = buildPricingFingerprint(lineItems.map(item => ({
            key: item.purchase_order_product_id,
            listPrice: Number(item.list_price || 0),
            discountPercent: Number(item.discount_percent || 0),
            discountAmount: Number(item.discount_amount || 0),
            quantity: Number(item.accepted_quantity ?? item.received_quantity ?? 0),
            priceSource: String(item.price_source || "PO")
        })));

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

        // Fetch approval workflow history and resolve actor names
        let approvalHistory: Array<{
            history_id: number;
            action: string;
            approval_stage: string;
            actor_id: number;
            actor_name: string;
            remarks: string;
            from_inventory_status: number | null;
            to_inventory_status: number | null;
            revision_before: number;
            revision_after: number;
            created_at: string;
        }> = [];

        try {
            const historyRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_approval_history?filter[purchase_order_id][_eq]=${poId}&fields=*&sort=created_at,history_id&limit=-1`, {
                headers,
                cache: "no-store"
            }).catch(() => null);

            if (historyRes && historyRes.ok) {
                const historyData = await historyRes.json();
                const rawHistory = Array.isArray(historyData?.data) ? historyData.data : [];

                const actorIds = [...new Set([
                    ...rawHistory.map((row: Record<string, unknown>) => Number(row.actor_id)),
                    Number(purchaseOrder?.encoder_id),
                    Number(purchaseOrder?.user_created)
                ].filter(id => Number.isSafeInteger(id) && id > 0))];

                const actorsMap = new Map<number, string>();
                if (actorIds.length > 0) {
                    const usersRes = await fetch(`${DIRECTUS_URL}/items/user?filter[user_id][_in]=${actorIds.join(",")}&fields=user_id,user_fname,user_mname,user_lname,user_email&limit=-1`, {
                        headers,
                        cache: "no-store"
                    }).catch(() => null);

                    if (usersRes && usersRes.ok) {
                        const usersData = await usersRes.json();
                        const users = Array.isArray(usersData?.data) ? usersData.data : [];
                        for (const user of users) {
                            const fullName = [user.user_fname, user.user_mname, user.user_lname]
                                .map(part => typeof part === "string" ? part.trim() : "")
                                .filter(Boolean)
                                .join(" ");
                            actorsMap.set(Number(user.user_id), fullName || user.user_email?.trim() || "Unknown user");
                        }
                    }
                }

                approvalHistory = rawHistory.map((row: Record<string, unknown>) => ({
                    history_id: Number(row.history_id || row.id || 0),
                    action: String(row.action || "Unknown Action"),
                    approval_stage: String(row.approval_stage || "System"),
                    actor_id: Number(row.actor_id || 0),
                    actor_name: actorsMap.get(Number(row.actor_id)) || "Unknown user",
                    remarks: String(row.remarks || ""),
                    from_inventory_status: row.from_inventory_status != null ? Number(row.from_inventory_status) : null,
                    to_inventory_status: row.to_inventory_status != null ? Number(row.to_inventory_status) : null,
                    revision_before: Number(row.revision_before || 0),
                    revision_after: Number(row.revision_after || 0),
                    created_at: String(row.created_at || "")
                }));

                // If PO creator is known, resolve their display name as well
                const creatorId = Number(purchaseOrder?.encoder_id || purchaseOrder?.user_created || 0);
                if (creatorId > 0 && purchaseOrder) {
                    purchaseOrder.creator_name = actorsMap.get(creatorId) || "System";
                }
            }
        } catch (error) {
            console.warn("[Manufacturing] Failed to load approval history for amount-posting audit view:", error);
        }

        return NextResponse.json({
            purchaseOrder,
            lineItems,
            importExpenses,
            landedCost,
            approvalHistory,
            chartOfAccounts,
            activeForexRate,
            expenseTypes,
            currencyCode: snapshot.currencyCode,
            exchangeRate: snapshot.exchangeRate,
            pricingFingerprint,
            pricingAsOf: new Date().toISOString()
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({
            error: message,
            ...(error instanceof LandedCostEligibilityError || isLandedCostError(error) ? { code: (error as { code?: string }).code } : {})
        }, { status: error instanceof LandedCostEligibilityError || isLandedCostError(error)
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
                overhead_id: Number(expense.overhead_id) || null,
                amount_php: Number(expense.amount_php ?? expense.amount ?? 0)
            }))
            : [];
        const result = await finalizeLandedCost({
            purchaseOrderId: Number(body.purchase_order_id),
            computationId: body.computation_id ? Number(body.computation_id) : null,
            allocationRule,
            expenses,
            exchangeRate: body.exchange_rate,
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
            : error instanceof LandedCostEligibilityError || isLandedCostError(error)
            ? error.status
            : 500 });
    }
}
