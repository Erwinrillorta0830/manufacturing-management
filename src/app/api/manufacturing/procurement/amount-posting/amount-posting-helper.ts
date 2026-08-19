import { DIRECTUS_URL, headers } from "../_directus";
import { assertLandedCostPostingEligible } from "../_landed-cost-eligibility";

export interface POLineItemForPosting {
    purchase_order_product_id: number;
    product_id: number;
    product_name?: string;
    product_category?: string; // "RM" | "Packaging" | "PKG" | etc.
    received_quantity: number;
    unit_price: number; // in foreign currency or local PHP
    gross_weight?: number | null; // in kg
    weight_unit?: string;
    discount_type?: number;
    discounted_amount?: number;
    vat_amount?: number;
    withholding_amount?: number;
    total_amount?: number;
}

export interface LandedExpenseEntry {
    po_import_id?: number;
    purchase_order_id: number;
    chart_of_account_id: number;
    chart_of_account_name?: string;
    amount: number;
    allocation_method?: string; // "hybrid" | "quantity" | "weight" | "value"
}

export interface AllocationResultItem {
    purchase_order_product_id: number;
    allocated_amount: number;
    variance_adjustment: number;
    allocated_expense_php: number;
    final_landed_unit_cost: number;
}

export interface HybridAllocationEngineOutput {
    allocations: AllocationResultItem[];
    rmSubPool: number;
    pkgSubPool: number;
    totalLandedFee: number;
    roundingVariance: number;
}

export interface ProductCostUpdate {
    product_id: number;
    cost_per_unit: number;
    estimated_unit_cost: number;
}

export interface ProductCostCommit {
    rollback: () => Promise<void>;
}

function roundMoney(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
}

function relationId(value: unknown, key: string): number {
    const raw = value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : value;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function buildProductCostUpdates(
    lineItems: POLineItemForPosting[],
    allocationOutput: HybridAllocationEngineOutput | null,
    exchangeRate: number
): ProductCostUpdate[] {
    const totals = new Map<number, { quantity: number; cost: number }>();

    for (const item of lineItems) {
        const productId = relationId(item.product_id, "product_id");
        if (!productId) {
            throw new Error(`Missing product ID for receiving line ${item.purchase_order_product_id}.`);
        }

        const quantity = Number(item.received_quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error(`Receiving line ${item.purchase_order_product_id} must have a positive received quantity.`);
        }

        const allocation = allocationOutput?.allocations.find(
            candidate => candidate.purchase_order_product_id === item.purchase_order_product_id
        );
        const finalLandedUnitCost = allocation
            ? allocation.final_landed_unit_cost
            : roundMoney((Number(item.unit_price) || 0) * exchangeRate);

        if (!Number.isFinite(finalLandedUnitCost) || finalLandedUnitCost < 0) {
            throw new Error(`Invalid final landed unit cost for receiving line ${item.purchase_order_product_id}.`);
        }

        const previous = totals.get(productId) || { quantity: 0, cost: 0 };
        totals.set(productId, {
            quantity: previous.quantity + quantity,
            cost: previous.cost + (finalLandedUnitCost * quantity)
        });
    }

    return [...totals.entries()].map(([productId, total]) => {
        const landedCost = roundMoney(total.cost / total.quantity);
        return {
            product_id: productId,
            cost_per_unit: landedCost,
            estimated_unit_cost: landedCost
        };
    });
}

interface PersistedReceivingLine {
    purchase_order_product_id?: unknown;
    product_id?: unknown;
    received_quantity?: unknown;
}

export async function resolvePostingLineItems(
    purchaseOrderId: number,
    lineItems: POLineItemForPosting[],
    fetchImpl: typeof fetch = fetch
): Promise<POLineItemForPosting[]> {
    if (lineItems.length === 0) return lineItems;

    const lineIds = [...new Set(lineItems.map(item => relationId(item.purchase_order_product_id, "purchase_order_product_id")))];
    if (lineIds.some(id => !id)) {
        throw new Error("Every amount-posting line must reference a valid receiving record.");
    }

    const response = await fetchImpl(
        `${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${purchaseOrderId}&filter[purchase_order_product_id][_in]=${lineIds.join(",")}&fields=purchase_order_product_id,product_id,received_quantity&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!response.ok) {
        throw new Error(`Failed to load persisted receiving lines (${response.status}).`);
    }

    const rows = ((await response.json()).data || []) as PersistedReceivingLine[];
    const byLineId = new Map(
        rows.map(row => [relationId(row.purchase_order_product_id, "purchase_order_product_id"), row])
    );

    return lineItems.map(item => {
        const lineId = relationId(item.purchase_order_product_id, "purchase_order_product_id");
        const persisted = byLineId.get(lineId);
        if (!persisted) {
            throw new Error(`Receiving record ${lineId} does not belong to purchase order ${purchaseOrderId}.`);
        }

        const productId = relationId(persisted.product_id, "product_id");
        const receivedQuantity = Number(persisted.received_quantity);
        if (!productId || !Number.isFinite(receivedQuantity) || receivedQuantity <= 0) {
            throw new Error(`Receiving record ${lineId} has incomplete product or quantity data.`);
        }

        return {
            ...item,
            product_id: productId,
            received_quantity: receivedQuantity
        };
    });
}

interface ProductCostSnapshot {
    cost_per_unit: unknown;
    estimated_unit_cost: unknown;
}

export async function persistProductCostUpdates(
    updates: ProductCostUpdate[],
    fetchImpl: typeof fetch = fetch
): Promise<ProductCostCommit> {
    const snapshots = new Map<number, ProductCostSnapshot>();
    const patchedProductIds: number[] = [];
    let rolledBack = false;

    const rollback = async () => {
        if (rolledBack) return;
        rolledBack = true;

        const failures: number[] = [];
        for (const productId of [...patchedProductIds].reverse()) {
            const snapshot = snapshots.get(productId);
            if (!snapshot) continue;

            const response = await fetchImpl(`${DIRECTUS_URL}/items/products/${productId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(snapshot)
            }).catch(() => null);
            if (!response?.ok) failures.push(productId);
        }

        if (failures.length > 0) {
            throw new Error(`Product cost rollback failed for product(s): ${failures.join(", ")}.`);
        }
    };

    try {
        for (const update of updates) {
            const response = await fetchImpl(
                `${DIRECTUS_URL}/items/products/${update.product_id}?fields=cost_per_unit,estimated_unit_cost`,
                { headers, cache: "no-store" }
            );
            if (!response.ok) {
                throw new Error(`Failed to load current cost for product ${update.product_id}.`);
            }

            const body = await response.json();
            snapshots.set(update.product_id, {
                cost_per_unit: body?.data?.cost_per_unit,
                estimated_unit_cost: body?.data?.estimated_unit_cost
            });
        }

        for (const update of updates) {
            const response = await fetchImpl(`${DIRECTUS_URL}/items/products/${update.product_id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    cost_per_unit: update.cost_per_unit,
                    estimated_unit_cost: update.estimated_unit_cost
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to update landed cost for product ${update.product_id}.`);
            }
            patchedProductIds.push(update.product_id);
        }

        return { rollback };
    } catch (error) {
        try {
            await rollback();
        } catch (rollbackError) {
            throw new Error(`${(error as Error).message} ${ (rollbackError as Error).message }`);
        }
        throw error;
    }
}

export function calculateHybridAllocationEngine(
    lineItems: POLineItemForPosting[],
    expenses: LandedExpenseEntry[],
    exchangeRate: number = 1.0
): HybridAllocationEngineOutput {
    const totalLandedFee = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    if (lineItems.length === 0 || totalLandedFee === 0) {
        return {
            allocations: lineItems.map(item => ({
                purchase_order_product_id: item.purchase_order_product_id,
                allocated_amount: 0,
                variance_adjustment: 0,
                allocated_expense_php: 0,
                final_landed_unit_cost: roundMoney((item.unit_price || 0) * exchangeRate)
            })),
            rmSubPool: 0,
            pkgSubPool: 0,
            totalLandedFee,
            roundingVariance: 0
        };
    }

    // Phase 1: Partition into Raw Materials (RM), Packaging (PKG), and Finished Goods (FG) based on commercial value
    let totalRMCommercialValue = 0;
    let totalPKGCommercialValue = 0;
    let totalFGCommercialValue = 0;

    const rmItems: POLineItemForPosting[] = [];
    const pkgItems: POLineItemForPosting[] = [];
    const fgItems: POLineItemForPosting[] = [];

    const isPkgCat = (cat: string) => cat === "390" || cat === "PKG" || cat === "PACKAGING" || cat === "PACKAGING ITEMS";
    const isRmCat = (cat: string) => cat === "389" || cat === "RM" || cat === "RAW MATERIAL" || cat === "RAW MATERIALS";

    for (const item of lineItems) {
        const itemCommercialValue = (item.received_quantity || 0) * (item.unit_price || 0) * exchangeRate;
        const cat = String(item.product_category || "").toUpperCase();
        
        if (isPkgCat(cat)) {
            totalPKGCommercialValue += itemCommercialValue;
            pkgItems.push(item);
        } else if (isRmCat(cat)) {
            totalRMCommercialValue += itemCommercialValue;
            rmItems.push(item);
        } else {
            totalFGCommercialValue += itemCommercialValue;
            fgItems.push(item);
        }
    }

    const totalCommercialValue = totalRMCommercialValue + totalPKGCommercialValue + totalFGCommercialValue;

    let rmSubPool = 0;
    let pkgSubPool = 0;
    let fgSubPool = 0;

    if (totalCommercialValue > 0) {
        rmSubPool = totalLandedFee * (totalRMCommercialValue / totalCommercialValue);
        pkgSubPool = totalLandedFee * (totalPKGCommercialValue / totalCommercialValue);
        fgSubPool = totalLandedFee * (totalFGCommercialValue / totalCommercialValue);
    } else {
        const count = lineItems.length;
        rmSubPool = totalLandedFee * (rmItems.length / count);
        pkgSubPool = totalLandedFee * (pkgItems.length / count);
        fgSubPool = totalLandedFee * (fgItems.length / count);
    }

    const rawAllocations = new Map<number, number>();

    // Phase 2: Product-Type Specific Allocation
    // Phase 2A: RM fee pool allocated by Unit Quantity
    const totalRMQuantity = rmItems.reduce((sum, item) => sum + (item.received_quantity || 0), 0);
    for (const item of rmItems) {
        let fee = 0;
        if (totalRMQuantity > 0) {
            fee = rmSubPool * ((item.received_quantity || 0) / totalRMQuantity);
        } else {
            fee = rmSubPool / (rmItems.length || 1);
        }
        rawAllocations.set(item.purchase_order_product_id, fee);
    }

    // Phase 2B: PKG fee pool allocated by physical Gross Weight
    let totalPKGWeight = 0;
    for (const item of pkgItems) {
        const weight = Number(item.gross_weight) || 0;
        if (weight <= 0) {
            throw new Error(`Gross Weight is required for Packaging items (${item.product_name || `ID: ${item.purchase_order_product_id}`}).`);
        }
        totalPKGWeight += weight * (item.received_quantity || 1);
    }

    for (const item of pkgItems) {
        let fee = 0;
        const weight = Number(item.gross_weight) || 0;
        if (totalPKGWeight > 0) {
            fee = pkgSubPool * ((weight * (item.received_quantity || 1)) / totalPKGWeight);
        } else {
            fee = pkgSubPool / (pkgItems.length || 1);
        }
        rawAllocations.set(item.purchase_order_product_id, fee);
    }

    // Phase 2C: FG / Other fee pool allocated by Commercial Value
    for (const item of fgItems) {
        let fee = 0;
        const itemCommVal = (item.received_quantity || 0) * (item.unit_price || 0) * exchangeRate;
        if (totalFGCommercialValue > 0) {
            fee = fgSubPool * (itemCommVal / totalFGCommercialValue);
        } else {
            fee = fgSubPool / (fgItems.length || 1);
        }
        rawAllocations.set(item.purchase_order_product_id, fee);
    }

    // Phase 3 & 4: Unit Allocated Cost & Rounding Cent Reconciliation
    let sumRoundedAllocations = 0;
    let maxCommercialValue = -1;
    let highestValueItemId = -1;

    const allocationsMap = new Map<number, AllocationResultItem>();

    for (const item of lineItems) {
        const commValue = (item.received_quantity || 0) * (item.unit_price || 0) * exchangeRate;
        if (commValue > maxCommercialValue) {
            maxCommercialValue = commValue;
            highestValueItemId = item.purchase_order_product_id;
        }

        const rawFee = rawAllocations.get(item.purchase_order_product_id) || 0;
        const roundedFee = roundMoney(rawFee);
        sumRoundedAllocations += roundedFee;

        allocationsMap.set(item.purchase_order_product_id, {
            purchase_order_product_id: item.purchase_order_product_id,
            allocated_amount: roundedFee,
            variance_adjustment: 0,
            allocated_expense_php: 0,
            final_landed_unit_cost: 0
        });
    }

    // Calculate rounding 0.01 cent variance
    const roundingVariance = roundMoney(totalLandedFee - sumRoundedAllocations);
    if (roundingVariance !== 0 && highestValueItemId !== -1) {
        const itemAlloc = allocationsMap.get(highestValueItemId);
        if (itemAlloc) {
            itemAlloc.variance_adjustment = roundingVariance;
            itemAlloc.allocated_amount = roundMoney(itemAlloc.allocated_amount + roundingVariance);
        }
    }

    // Phase 3: Final unit cost breakdown
    const allocations: AllocationResultItem[] = [];
    for (const item of lineItems) {
        const alloc = allocationsMap.get(item.purchase_order_product_id)!;
        const qty = item.received_quantity || 1;
        alloc.allocated_expense_php = roundMoney(alloc.allocated_amount / qty);
        alloc.final_landed_unit_cost = roundMoney(((item.unit_price || 0) * exchangeRate) + alloc.allocated_expense_php);
        allocations.push(alloc);
    }

    return {
        allocations,
        rmSubPool: roundMoney(rmSubPool),
        pkgSubPool: roundMoney(pkgSubPool),
        totalLandedFee: roundMoney(totalLandedFee),
        roundingVariance
    };
}

export async function processPurchaseAmountPosting(payload: {
    purchase_order_id: number;
    is_foreign: boolean;
    exchange_rate?: number;
    expenses?: LandedExpenseEntry[];
    line_items: POLineItemForPosting[];
}) {
    await assertLandedCostPostingEligible(payload.purchase_order_id);

    const exchangeRate = payload.is_foreign ? (payload.exchange_rate || 1.0) : 1.0;
    const expenses = payload.expenses || [];
    const lineItems = await resolvePostingLineItems(payload.purchase_order_id, payload.line_items || []);

    let allocationOutput: HybridAllocationEngineOutput | null = null;

    if (payload.is_foreign) {
        // Run Hybrid Allocation Engine for foreign import PO
        allocationOutput = calculateHybridAllocationEngine(lineItems, expenses, exchangeRate);
    }

    // 1. Delete existing purchase_order_import records for this PO if any
    const existingImportRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_import?filter[purchase_order_id][_eq]=${payload.purchase_order_id}&limit=-1`, { headers }).catch(() => null);
    if (existingImportRes && existingImportRes.ok) {
        const existingData = await existingImportRes.json();
        if (Array.isArray(existingData?.data)) {
            for (const imp of existingData.data) {
                const impId = imp.id || imp.po_import_id;
                if (!impId) continue;
                // Delete associated allocations
                await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving_import_allocation?filter[po_import_id][_eq]=${impId}&limit=-1`, { headers }).then(async r => {
                    if (r.ok) {
                        const allocData = await r.json();
                        if (Array.isArray(allocData?.data)) {
                            for (const a of allocData.data) {
                                await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving_import_allocation/${a.id}`, { method: "DELETE", headers }).catch(() => {});
                            }
                        }
                    }
                }).catch(() => {});

                await fetch(`${DIRECTUS_URL}/items/purchase_order_import/${impId}`, { method: "DELETE", headers }).catch(() => {});
            }
        }
    }

    // 2. Insert new purchase_order_import entries if foreign
    const createdImportRecords: { po_import_id: number; chart_of_account_id: number; amount: number }[] = [];
    if (payload.is_foreign && expenses.length > 0) {
        for (const exp of expenses) {
            const createRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_import`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    purchase_order_id: payload.purchase_order_id,
                    chart_of_account_id: exp.chart_of_account_id,
                    amount: exp.amount,
                    allocation_method: exp.allocation_method || "hybrid"
                })
            });
            if (createRes.ok) {
                const created = await createRes.json();
                const createdId = created?.data?.id || created?.data?.po_import_id;
                if (createdId) {
                    createdImportRecords.push({
                        po_import_id: Number(createdId),
                        chart_of_account_id: exp.chart_of_account_id,
                        amount: exp.amount
                    });
                }
            }
        }
    }

    // 3. Save purchase_order_receiving_import_allocation records
    if (payload.is_foreign && allocationOutput && createdImportRecords.length > 0) {
        const mainImportId = createdImportRecords[0].po_import_id;
        for (const alloc of allocationOutput.allocations) {
            await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving_import_allocation`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    po_import_id: mainImportId,
                    purchase_order_product_id: alloc.purchase_order_product_id,
                    allocated_amount: alloc.allocated_amount,
                    variance_adjustment: alloc.variance_adjustment
                })
            }).catch(() => {});
        }
    }

    // 4. Update purchase_order_product line items
    let calculatedHeaderTotalPHP = 0;
    let calculatedHeaderForeignTotal = 0;

    for (const item of lineItems) {
        const itemAlloc = allocationOutput?.allocations.find(a => a.purchase_order_product_id === item.purchase_order_product_id);
        const allocatedExpensePhp = itemAlloc ? itemAlloc.allocated_expense_php : 0;
        const finalLandedUnitCost = itemAlloc ? itemAlloc.final_landed_unit_cost : roundMoney((item.unit_price || 0) * exchangeRate);
        const qty = item.received_quantity || 0;
        const itemTotalPHP = roundMoney(finalLandedUnitCost * qty);

        calculatedHeaderTotalPHP += itemTotalPHP;
        calculatedHeaderForeignTotal += roundMoney((item.unit_price || 0) * qty);

        const lineResponse = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving/${item.purchase_order_product_id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                allocated_expense_php: allocatedExpensePhp,
                final_landed_unit_cost: finalLandedUnitCost,
                total_amount: itemTotalPHP,
                is_posted_amounts: 1
            })
        });
        if (!lineResponse.ok) {
            throw new Error(`Failed to update receiving line ${item.purchase_order_product_id}.`);
        }
    }

    const productCostUpdates = buildProductCostUpdates(lineItems, allocationOutput, exchangeRate);
    const productCostCommit = await persistProductCostUpdates(productCostUpdates);

    try {
        // 5. Update purchase_order header only after receiving lines and products succeed.
        const headerResponse = await fetch(`${DIRECTUS_URL}/items/purchase_order/${payload.purchase_order_id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                exchange_rate: exchangeRate,
                total_foreign_currency: calculatedHeaderForeignTotal,
                total_amount: calculatedHeaderTotalPHP,
                is_posted_amounts: 1,
                is_posted: 1,
                is_import: payload.is_foreign ? 1 : 0
            })
        });
        if (!headerResponse.ok) {
            throw new Error(`Failed to update purchase-order ${payload.purchase_order_id}.`);
        }
    } catch (error) {
        try {
            await productCostCommit.rollback();
        } catch (rollbackError) {
            throw new Error(`${(error as Error).message} ${(rollbackError as Error).message}`);
        }
        throw error;
    }

    return {
        success: true,
        purchase_order_id: payload.purchase_order_id,
        exchange_rate: exchangeRate,
        allocationOutput
    };
}
