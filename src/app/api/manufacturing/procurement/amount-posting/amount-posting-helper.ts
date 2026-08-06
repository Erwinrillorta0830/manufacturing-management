import { DIRECTUS_URL, headers } from "../_directus";

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

function roundMoney(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
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
    const exchangeRate = payload.is_foreign ? (payload.exchange_rate || 1.0) : 1.0;
    const expenses = payload.expenses || [];
    const lineItems = payload.line_items || [];

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

        await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving/${item.purchase_order_product_id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                allocated_expense_php: allocatedExpensePhp,
                final_landed_unit_cost: finalLandedUnitCost,
                total_amount: itemTotalPHP,
                is_posted_amounts: 1
            })
        }).catch(() => {});
    }

    // 5. Update purchase_order header
    await fetch(`${DIRECTUS_URL}/items/purchase_order/${payload.purchase_order_id}`, {
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
    }).catch(() => {});

    return {
        success: true,
        purchase_order_id: payload.purchase_order_id,
        exchange_rate: exchangeRate,
        allocationOutput
    };
}
