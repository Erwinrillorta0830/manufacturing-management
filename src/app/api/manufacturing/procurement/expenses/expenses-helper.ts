import { DIRECTUS_URL, headers } from "../_directus";
import { DirectusShipmentExpense } from "@/modules/manufacturing-management/procurement/types";
import { fetchShipmentLineItems } from "../shipments/shipments-helper";

export type AllocationMethod = "Value" | "Weight" | "Volume";

interface ExtendedProduct {
    product_id: number;
    weight?: number | string | null;
    product_weight?: number | string | null;
    cbm_height?: number | string | null;
    cbm_width?: number | string | null;
    cbm_length?: number | string | null;
}

interface ExtendedShipmentLineItem {
    line_id: number;
    product_id: ExtendedProduct;
    quantity_ordered: number;
    quantity_received: number;
    base_unit_cost_php: number;
}

export interface LandedCostInput {
    key: number;
    quantity: number;
    baseUnitCost: number;
    weight?: number;
    volume?: number;
}

export interface LandedCostResult {
    allocatedExpense: number;
    finalLandedUnitCost: number;
}

interface StoredExpense {
    expense_id?: number;
    shipment_id?: number;
    purchase_order_id?: number;
    overhead_id?: unknown;
    expense_type?: string;
    amount_php?: number;
    allocation_method?: string;
    [key: string]: unknown;
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeAllocationMethod(value: string): AllocationMethod {
    switch (value) {
        case "Weight":
        case "By Weight":
            return "Weight";
        case "Volume":
        case "By Volume":
            return "Volume";
        case "Value":
        case "By Value":
            return "Value";
        default:
            throw new Error(`Unsupported allocation method: ${value}`);
    }
}

export function calculateLandedCostAllocations(
    lines: LandedCostInput[],
    totalExpensesPhp: number,
    method: AllocationMethod
): Map<number, LandedCostResult> {
    const totalValue = lines.reduce((sum, line) => sum + line.quantity * line.baseUnitCost, 0);
    const totalWeight = lines.reduce((sum, line) => sum + line.quantity * Number(line.weight || 0), 0);
    const totalVolume = lines.reduce((sum, line) => sum + line.quantity * Number(line.volume || 0), 0);

    return new Map(lines.map(line => {
        let ratio: number;
        if (method === "Weight" && totalWeight > 0) {
            ratio = line.quantity * Number(line.weight || 0) / totalWeight;
        } else if (method === "Volume" && totalVolume > 0) {
            ratio = line.quantity * Number(line.volume || 0) / totalVolume;
        } else if (totalValue > 0) {
            ratio = line.quantity * line.baseUnitCost / totalValue;
        } else {
            ratio = lines.length > 0 ? 1 / lines.length : 0;
        }

        const allocatedExpense = roundMoney(ratio * totalExpensesPhp);
        const finalLandedUnitCost = roundMoney(
            line.baseUnitCost + (line.quantity > 0 ? allocatedExpense / line.quantity : 0)
        );
        return [line.key, { allocatedExpense, finalLandedUnitCost }];
    }));
}

export async function fetchShipmentExpenses(shipmentId: number): Promise<StoredExpense[]> {
    const url = `${DIRECTUS_URL}/items/purchase_order_expenses?filter[purchase_order_id][_eq]=${shipmentId}&fields=*,overhead_id.*&limit=-1`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load shipment expenses (${res.status}).`);
    return (await res.json()).data || [];
}

async function deleteExpense(expenseId: number): Promise<void> {
    const response = await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses/${expenseId}`, {
        method: "DELETE",
        headers
    });
    if (!response.ok) throw new Error(`Failed to delete shipment expense ${expenseId}.`);
}

async function createExpense(payload: Record<string, unknown>): Promise<number> {
    const response = await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Failed to save shipment expense: ${await response.text()}`);
    return Number((await response.json()).data?.expense_id);
}

export async function processShipmentLandedCosts(
    shipmentId: number,
    status: string,
    expenses: Array<Partial<DirectusShipmentExpense>>,
    allocationMethodInput: string,
    lineItemUpdates?: Array<{ line_id: number; quantity_received: number }>
): Promise<{ success: true; deferredInventoryUpdates: number }> {
    void status;
    void lineItemUpdates;
    const allocationMethod = normalizeAllocationMethod(allocationMethodInput);
    const previousExpenses = await fetchShipmentExpenses(shipmentId);
    const deletedExpenses: StoredExpense[] = [];
    const createdExpenseIds: number[] = [];
    const updatedProductCosts = new Map<number, { cost_per_unit: unknown; estimated_unit_cost: unknown }>();

    try {
        for (const expense of previousExpenses) {
            if (expense.expense_id) {
                await deleteExpense(expense.expense_id);
                deletedExpenses.push(expense);
            }
        }

        let totalExpensesPhp = 0;
        for (const expense of expenses) {
            const amountPhp = Number(expense.amount_php || 0);
            const expenseId = await createExpense({
                ...expense,
                amount_php: amountPhp,
                purchase_order_id: shipmentId,
                allocation_method: `By ${allocationMethod}`
            });
            if (!expenseId) throw new Error("Directus did not return the created expense ID.");
            createdExpenseIds.push(expenseId);
            totalExpensesPhp += amountPhp;
        }

        const lines = await fetchShipmentLineItems(shipmentId) as ExtendedShipmentLineItem[];
        const inputs: LandedCostInput[] = lines.map(line => {
            const product = line.product_id;
            const quantity = Number(line.quantity_received || line.quantity_ordered || 0);
            return {
                key: line.line_id,
                quantity,
                baseUnitCost: Number(line.base_unit_cost_php || 0),
                weight: Number(product?.weight || product?.product_weight || 0),
                volume: Number(product?.cbm_height || 0) * Number(product?.cbm_width || 0) * Number(product?.cbm_length || 0)
            };
        });
        const allocations = calculateLandedCostAllocations(inputs, totalExpensesPhp, allocationMethod);
        // Resolve inventory movements to check if receiving records exist
        const receivingUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${shipmentId}&filter[is_reverted][_eq]=0&fields=purchase_order_product_id,product_id&limit=-1`;
        const receivingRes = await fetch(receivingUrl, { headers, cache: "no-store" });
        const receivingData = receivingRes.ok ? (await receivingRes.json()).data || [] : [];
        
        interface ProcurementReceivingRow {
            purchase_order_product_id?: number | { purchase_order_product_id?: number } | null;
            product_id?: number | null;
        }

        // Map receiving record IDs
        const receivingIds = receivingData
            .map((row: ProcurementReceivingRow) => {
                const poProd = row.purchase_order_product_id;
                return typeof poProd === "object" && poProd ? poProd.purchase_order_product_id : poProd;
            })
            .filter(Boolean);

        let movements: Record<string, unknown>[] = [];
        if (receivingIds.length > 0) {
            const movementUrl = `${DIRECTUS_URL}/items/inventory_movements?filter[source_document_id][_in]=${receivingIds.join(",")}&limit=-1`;
            const movementRes = await fetch(movementUrl, { headers, cache: "no-store" });
            if (movementRes.ok) {
                movements = (await movementRes.json()).data || [];
            }
        }

        let deferredInventoryUpdates = 0;

        for (const line of lines) {
            const productId = Number(line.product_id?.product_id || line.product_id);
            const allocation = allocations.get(line.line_id);
            if (!allocation) continue;

            const hasMovements = movements.some(m => Number(m.product_id) === productId);
            if (!hasMovements) {
                deferredInventoryUpdates += 1;
                continue;
            }

            if (!updatedProductCosts.has(productId)) {
                const productResponse = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=cost_per_unit,estimated_unit_cost`, { headers, cache: "no-store" });
                if (!productResponse.ok) throw new Error(`Failed to load current cost for product ${productId}.`);
                const product = (await productResponse.json()).data || {};
                updatedProductCosts.set(productId, {
                    cost_per_unit: product.cost_per_unit,
                    estimated_unit_cost: product.estimated_unit_cost
                });
            }
            const productUpdateResponse = await fetch(`${DIRECTUS_URL}/items/products/${productId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    cost_per_unit: allocation.finalLandedUnitCost,
                    estimated_unit_cost: allocation.finalLandedUnitCost
                })
            });
            if (!productUpdateResponse.ok) throw new Error(`Failed to update landed cost for product ${productId}.`);
        }

        return { success: true, deferredInventoryUpdates };
    } catch (error) {
        let rollbackFailed = false;
        for (const [productId, previous] of [...updatedProductCosts.entries()].reverse()) {
            const response = await fetch(`${DIRECTUS_URL}/items/products/${productId}`, {
                method: "PATCH", headers, body: JSON.stringify(previous)
            }).catch(() => null);
            if (!response?.ok) rollbackFailed = true;
        }
        for (const expenseId of createdExpenseIds.reverse()) {
            await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses/${expenseId}`, { method: "DELETE", headers }).catch(() => undefined);
        }
        for (const expense of deletedExpenses) {
            const overheadId = expense.overhead_id && typeof expense.overhead_id === "object"
                ? Number((expense.overhead_id as Record<string, unknown>).id)
                : expense.overhead_id;
            await createExpense({
                purchase_order_id: expense.purchase_order_id,
                overhead_id: overheadId,
                expense_type: expense.expense_type || "",
                amount_php: Number(expense.amount_php || 0),
                allocation_method: expense.allocation_method
            }).catch(() => { rollbackFailed = true; });
        }
        if (rollbackFailed) throw new Error(`Expense allocation failed and previous costs could not be fully restored. Reconciliation is required. Original error: ${(error as Error).message}`);
        throw error;
    }
}
