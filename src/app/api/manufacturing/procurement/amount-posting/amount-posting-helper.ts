import { DIRECTUS_URL, headers } from "../_directus";
import { finalizeLandedCost } from "../landed-cost/_domain";
import {
    resolveProductWeightBreakdown
} from "@/modules/manufacturing-management/procurement/packaging-weight";
import { calculateLandedCost } from "@/modules/manufacturing-management/procurement/landed-cost-calculation";
import {
    ProductCategoryTypeValidationError,
    resolveProductCategoryTypes,
    type PurchaseOrderCategoryType
} from "../_category-type";

export interface POLineItemForPosting {
    purchase_order_product_id: number;
    product_id: number;
    product_name?: string;
    product_category?: string;
    category_type?: PurchaseOrderCategoryType;
    received_quantity: number;
    /** Legacy field retained for compatibility; it is always the persisted PHP base cost. */
    unit_price: number;
    base_unit_cost_php?: number;
    unit_price_foreign?: number | null;
    gross_weight?: number | null; // in kg
    net_weight?: number | null;
    outer_carton_weight?: number | null;
    pallet_weight?: number | null;
    unit_gross_weight_kg?: number;
    unit_net_weight_kg?: number | null;
    unit_outer_carton_weight_kg?: number | null;
    unit_pallet_weight_kg?: number | null;
    weight_unit?: string;
    line_gross_weight_kg?: number;
    discount_type?: number;
    discounted_amount?: number;
    vat_amount?: number;
    withholding_amount?: number;
    total_amount?: number;
}

export interface LandedExpenseEntry {
    po_import_id?: number;
    purchase_order_id: number;
    overhead_id?: number | null;
    /** Legacy read-only field. Posting never trusts or forwards this value. */
    chart_of_account_id?: number | null;
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
    fgSubPool: number;
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
    _exchangeRate: number
): ProductCostUpdate[] {
    // Kept in the compatibility signature; landed costs are already PHP-denominated.
    void _exchangeRate;
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
        const baseUnitCostPhp = Number(item.base_unit_cost_php ?? item.unit_price) || 0;
        const finalLandedUnitCost = allocation
            ? allocation.final_landed_unit_cost
            : roundMoney(baseUnitCostPhp);

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

    const productIds = [...new Set(rows.map(row => relationId(row.product_id, "product_id")))].filter(Boolean);
    const productResponse = await fetchImpl(
        `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,weight,product_weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id.*&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!productResponse.ok) {
        throw new Error(`Failed to load packaging weight data (${productResponse.status}).`);
    }
    const products = ((await productResponse.json()).data || []) as Record<string, unknown>[];
    const productById = new Map(products.map(product => [Number(product.product_id), product]));
    const categoryTypes = await resolveProductCategoryTypes(productIds.map(Number), fetchImpl);

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

        const product = productById.get(productId);
        if (!product) {
            throw new Error(`Product ${productId} could not be loaded for receiving record ${lineId}.`);
        }
        const categoryType = categoryTypes.get(productId);
        if (!categoryType) {
            throw new ProductCategoryTypeValidationError(
                400,
                "PRODUCT_CATEGORY_TYPE_REQUIRED",
                `Product ${productId} must have a RAW_MATERIAL, PACKAGING, or FINISHED_GOODS Category_Type in the product master.`,
                { productId, lineId }
            );
        }
        if (item.category_type !== categoryType) {
            throw new ProductCategoryTypeValidationError(
                409,
                "CATEGORY_TYPE_MISMATCH",
                `Amount-posting Category_Type for receiving record ${lineId} does not match the product master classification.`,
                { productId, lineId, submittedCategoryType: item.category_type ?? null, masterCategoryType: categoryType }
            );
        }

        const weightBreakdown = resolveProductWeightBreakdown(product, {
            requireComplete: categoryType === "PACKAGING"
        });

        return {
            ...item,
            product_id: productId,
            category_type: categoryType,
            received_quantity: receivedQuantity,
            gross_weight: weightBreakdown.grossWeightKg,
            net_weight: weightBreakdown.netWeight,
            outer_carton_weight: weightBreakdown.outerCartonWeight,
            pallet_weight: weightBreakdown.palletWeight,
            unit_gross_weight_kg: weightBreakdown.grossWeightKg,
            unit_net_weight_kg: weightBreakdown.netWeightKg,
            unit_outer_carton_weight_kg: weightBreakdown.outerCartonWeightKg,
            unit_pallet_weight_kg: weightBreakdown.palletWeightKg,
            weight_unit: weightBreakdown.weightUnitCode,
            line_gross_weight_kg: weightBreakdown.grossWeightKg * receivedQuantity
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
    void exchangeRate;
    const totalLandedFee = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    for (const item of lineItems) {
        if (item.category_type !== "RAW_MATERIAL" && item.category_type !== "PACKAGING" && item.category_type !== "FINISHED_GOODS") {
            throw new Error(`Receiving line ${item.purchase_order_product_id} must have Category_Type RAW_MATERIAL, PACKAGING, or FINISHED_GOODS.`);
        }
    }

    const calculation = calculateLandedCost(
        lineItems.map(item => ({
            key: item.purchase_order_product_id,
            category_type: item.category_type as PurchaseOrderCategoryType,
            quantity: Number(item.received_quantity) || 0,
            baseUnitCostPhp: Number(item.base_unit_cost_php ?? item.unit_price) || 0,
            lineGrossWeightKg: Number(item.line_gross_weight_kg) || 0,
            volume: 0
        })),
        totalLandedFee,
        "Hybrid"
    );

    return {
        allocations: calculation.lines.map(line => ({
            purchase_order_product_id: line.key,
            allocated_amount: line.allocatedExpense,
            variance_adjustment: line.roundingVariance,
            allocated_expense_php: line.addedUnitCost,
            final_landed_unit_cost: line.finalLandedUnitCost
        })),
        rmSubPool: calculation.rmFeePool,
        pkgSubPool: calculation.pkgFeePool,
        fgSubPool: calculation.fgFeePool,
        totalLandedFee: calculation.totalLandedFee,
        roundingVariance: calculation.roundingVariance
    };
}

export async function processPurchaseAmountPosting(payload: {
    purchase_order_id: number;
    is_foreign: boolean;
    exchange_rate?: number;
    allocation_rule?: string;
    expenses?: LandedExpenseEntry[];
    line_items: POLineItemForPosting[];
}) {
    void payload.is_foreign;
    return finalizeLandedCost({
        purchaseOrderId: payload.purchase_order_id,
        allocationRule: payload.allocation_rule,
        expenses: (payload.expenses || []).map(expense => ({
            overhead_id: expense.overhead_id,
            amount_php: expense.amount
        })),
        exchangeRate: payload.exchange_rate,
        sourceFlow: "PURCHASE_AMOUNT_POSTING_LEGACY_ADAPTER"
    });
}
