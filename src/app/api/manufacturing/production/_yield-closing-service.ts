/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import {
    calculateIncrementalMaterialConsumption,
    loadYieldMaterials,
    ResolvedYieldJobOrder,
    YieldMaterial,
    YieldMaterialsError,
    verifyZeroComponentBOM
} from "./_yield-materials";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

const EPSILON = 0.000001;

export interface CompleteYieldClosingInput {
    joId: string | number;
    productId: string | number;
    productName?: string;
    quantityProduced: string | number;
    branchId: string | number;
    lotNumber?: string | null;
    expirationDate?: string | null;
    manufacturingDate?: string | null;
    unitCost?: string | number | null;
    componentsConsumed?: unknown;
}

interface ComponentPlan {
    material: YieldMaterial;
    quantity: number;
    lots: LotAllocation[];
}

interface LotAllocation {
    lotId: number;
    lotNumber: string;
    expiryDate: string | null;
    createdOn: string | null;
    quantity: number;
}

interface StockLot extends LotAllocation {
    availableQuantity: number;
}

interface CreatedMutation {
    collection: string;
    id: number;
}

interface UpdatedMutation {
    collection: string;
    id: number;
    previous: Record<string, unknown>;
}

export class YieldCompletionError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly reconciliation?: Record<string, number[]>
    ) {
        super(message);
        this.name = "YieldCompletionError";
    }
}

function numericRelationId(value: unknown): number {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(
            relation.product_id
            ?? relation.job_order_id
            ?? relation.branch_id
            ?? relation.version_id
            ?? relation.lot_id
            ?? relation.sales_order_detail_id
            ?? relation.order_id
            ?? relation.id
            ?? 0
        );
    }
    return Number(value ?? 0);
}

function finiteNumber(value: unknown, label: string, options: { positive?: boolean; nonNegative?: boolean } = {}): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} must be a finite number.`);
    }
    if (options.positive && numberValue <= 0) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} must be greater than zero.`);
    }
    if (options.nonNegative && numberValue < 0) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", `${label} cannot be negative.`);
    }
    return numberValue;
}

function recordId(value: unknown): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Number(
            record.id
            ?? record.movement_id
            ?? record.ledger_id
            ?? record.genealogy_id
            ?? record.lot_id
            ?? record.history_id
            ?? record.jo_material_id
            ?? record.job_order_id
            ?? 0
        );
    }
    return Number(value ?? 0);
}

function formatQuantity(value: number): string {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

async function directusJson<T = any>(url: string, label: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                ...headers,
                ...(init.headers || {})
            },
            cache: "no-store",
            ...init
        });
    } catch {
        throw new YieldCompletionError(502, "DIRECTUS_REQUEST_FAILED", `${label} could not be reached.`);
    }

    const responseText = await response.text();
    let payload: any = null;
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new YieldCompletionError(502, "DIRECTUS_WRITE_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
    if (!payload || payload.data === undefined || payload.data === null) {
        throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned no data.`);
    }
    return payload.data as T;
}

async function directusRows<T = any>(url: string, label: string): Promise<T[]> {
    const data = await directusJson<unknown>(url, label);
    if (!Array.isArray(data)) {
        throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an invalid collection.`);
    }
    return data as T[];
}

async function directusDelete(url: string, label: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: "DELETE",
            headers,
            cache: "no-store"
        });
    } catch {
        throw new YieldCompletionError(502, "ROLLBACK_FAILED", `${label} could not be reached.`);
    }

    if (!response.ok) {
        throw new YieldCompletionError(502, "ROLLBACK_FAILED", `${label} failed with HTTP ${response.status}.`);
    }
}

class MutationJournal {
    private readonly created: CreatedMutation[] = [];
    private readonly updated: UpdatedMutation[] = [];

    get reconciliationIds(): Record<string, number[]> {
        const ids: Record<string, number[]> = {};
        for (const mutation of this.created) {
            ids[mutation.collection] = [...(ids[mutation.collection] || []), mutation.id];
        }
        for (const mutation of this.updated) {
            ids[mutation.collection] = [...(ids[mutation.collection] || []), mutation.id];
        }
        return ids;
    }

    async create<T = any>(collection: string, payload: Record<string, unknown>, label: string): Promise<T> {
        const data = await directusJson<T>(
            `${DIRECTUS_URL}/items/${collection}`,
            label,
            {
                method: "POST",
                body: JSON.stringify(payload)
            }
        );
        const id = recordId(data);
        if (!Number.isFinite(id) || id <= 0) {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned no valid record identifier.`);
        }
        this.created.push({ collection, id });
        return data;
    }

    async patch(collection: string, id: number, payload: Record<string, unknown>, label: string): Promise<Record<string, unknown>> {
        const previous = await directusJson<Record<string, unknown>>(
            `${DIRECTUS_URL}/items/${collection}/${encodeURIComponent(String(id))}`,
            `${label} pre-update lookup`
        );
        const data = await directusJson<Record<string, unknown>>(
            `${DIRECTUS_URL}/items/${collection}/${encodeURIComponent(String(id))}`,
            label,
            {
                method: "PATCH",
                body: JSON.stringify(payload)
            }
        );
        if (!data || typeof data !== "object") {
            throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `${label} returned an invalid record.`);
        }
        const previousFields = Object.fromEntries(
            Object.keys(payload).map(field => [field, previous[field]])
        );
        this.updated.push({ collection, id, previous: previousFields });
        return data;
    }

    async rollback(): Promise<void> {
        const rollbackErrors: string[] = [];

        for (const mutation of [...this.updated].reverse()) {
            try {
                await directusJson(
                    `${DIRECTUS_URL}/items/${mutation.collection}/${encodeURIComponent(String(mutation.id))}`,
                    `Restore ${mutation.collection} ${mutation.id}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify(mutation.previous)
                    }
                );
            } catch (error) {
                rollbackErrors.push(error instanceof Error ? error.message : `Failed to restore ${mutation.collection} ${mutation.id}`);
            }
        }

        for (const mutation of [...this.created].reverse()) {
            try {
                await directusDelete(
                    `${DIRECTUS_URL}/items/${mutation.collection}/${encodeURIComponent(String(mutation.id))}`,
                    `Delete ${mutation.collection} ${mutation.id}`
                );
            } catch (error) {
                rollbackErrors.push(error instanceof Error ? error.message : `Failed to delete ${mutation.collection} ${mutation.id}`);
            }
        }

        if (rollbackErrors.length > 0) {
            throw new YieldCompletionError(
                502,
                "PARTIAL_WRITE_RECONCILIATION_REQUIRED",
                "Yield closing failed and automatic rollback was incomplete. Reconciliation is required.",
                this.reconciliationIds
            );
        }
    }
}

async function resolveMasterLotId(name: string, inventoryTypeId: number, journal: MutationJournal): Promise<number> {
    const filter = encodeURIComponent(JSON.stringify({ lot_name: { _eq: name } }));
    const rows = await directusRows<any>(
        `${DIRECTUS_URL}/items/lots?filter=${filter}&limit=1`,
        `Master lot lookup for ${name}`
    );
    const existingId = recordId(rows[0]);
    if (Number.isFinite(existingId) && existingId > 0) return existingId;

    const mappedTypeId = inventoryTypeId === 1 ? 390 : 389;
    const created = await journal.create<any>(
        "lots",
        {
            lot_name: name,
            inventory_type_id: mappedTypeId,
            max_batch_capacity: 100000,
            created_by: 24
        },
        `Create master lot ${name}`
    );
    const createdId = recordId(created);
    if (!Number.isFinite(createdId) || createdId <= 0) {
        throw new YieldCompletionError(502, "DIRECTUS_RESPONSE_INVALID", `Master lot ${name} returned no valid identifier.`);
    }
    return createdId;
}

function stockLotKey(lotId: number, lotNumber: string): string {
    return `${lotId}:${lotNumber}`;
}

async function loadStockLots(productId: number, branchId: number): Promise<StockLot[]> {
    const movementFilter = encodeURIComponent(JSON.stringify({
        _and: [
            { product_id: { _eq: productId } },
            { branch_id: { _eq: branchId } }
        ]
    }));
    const movements = await directusRows<any>(
        `${DIRECTUS_URL}/items/inventory_movements?filter=${movementFilter}&limit=-1`,
        `Inventory movement lookup for component ${productId}`
    );
    const receipts = await directusRows<any>(
        `${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${encodeURIComponent(String(productId))}&filter[branch_id][_eq]=${encodeURIComponent(String(branchId))}&limit=-1`,
        `Receiving lookup for component ${productId}`
    );

    const batchStatus = new Map<string, string>();
    const batchExpiry = new Map<string, string | null>();
    const batchCreated = new Map<string, string | null>();
    receipts.forEach(receipt => {
        const batchNumber = String(receipt.batch_no || receipt.lot_no || "LOT-N/A").trim() || "LOT-N/A";
        batchStatus.set(batchNumber, String(receipt.qa_status || "Passed"));
        batchExpiry.set(batchNumber, receipt.expiry_date || null);
        batchCreated.set(batchNumber, receipt.received_date || receipt.created_on || null);
    });

    const stock = new Map<string, StockLot>();
    movements.forEach(movement => {
        const batchNumber = String(movement.batch_no || movement.lot_number || "LOT-N/A").trim() || "LOT-N/A";
        const lotId = numericRelationId(movement.lot_id);
        const key = stockLotKey(lotId, batchNumber);
        const existing = stock.get(key);
        const quantity = finiteNumber(movement.quantity ?? 0, "Inventory movement quantity", { nonNegative: false });
        if (existing) {
            existing.availableQuantity += quantity;
        } else {
            stock.set(key, {
                lotId: Number.isFinite(lotId) && lotId > 0 ? lotId : 0,
                lotNumber: batchNumber,
                expiryDate: batchExpiry.get(batchNumber) || movement.expiry_date || null,
                createdOn: batchCreated.get(batchNumber) || movement.manufacturing_date || null,
                quantity: 0,
                availableQuantity: quantity
            });
        }
    });

    return [...stock.values()]
        .filter(lot => lot.availableQuantity > EPSILON)
        .filter(lot => {
            const status = batchStatus.get(lot.lotNumber) || "Passed";
            return status === "Passed" || status === "Partially Accepted";
        })
        .sort((left, right) => {
            if (left.expiryDate && right.expiryDate) {
                return new Date(left.expiryDate).getTime() - new Date(right.expiryDate).getTime();
            }
            if (left.expiryDate) return -1;
            if (right.expiryDate) return 1;
            return new Date(left.createdOn || 0).getTime() - new Date(right.createdOn || 0).getTime();
        });
}

async function buildComponentPlans(
    materials: YieldMaterial[],
    jobOrder: ResolvedYieldJobOrder,
    quantityProduced: number,
    branchId: number
): Promise<ComponentPlan[]> {
    const plans = materials
        .map(material => ({
            material,
            quantity: calculateIncrementalMaterialConsumption(material, quantityProduced, jobOrder.targetQuantity),
            lots: [] as LotAllocation[]
        }))
        .filter(plan => plan.quantity > EPSILON);

    const byProduct = new Map<number, ComponentPlan[]>();
    plans.forEach(plan => {
        const existing = byProduct.get(plan.material.productId) || [];
        existing.push(plan);
        byProduct.set(plan.material.productId, existing);
    });

    for (const [productId, productPlans] of byProduct) {
        const stockLots = await loadStockLots(productId, branchId);
        const totalRequired = productPlans.reduce((sum, plan) => sum + plan.quantity, 0);
        const totalAvailable = stockLots.reduce((sum, lot) => sum + lot.availableQuantity, 0);

        if (totalAvailable + EPSILON < totalRequired) {
            const productName = productPlans[0]?.material.productName || `Product #${productId}`;
            throw new YieldCompletionError(
                422,
                "INSUFFICIENT_COMPONENT_STOCK",
                `Insufficient stock for ${productName}. Needed ${formatQuantity(totalRequired)} units, available ${formatQuantity(totalAvailable)} units.`
            );
        }

        let lotIndex = 0;
        for (const plan of productPlans) {
            let remaining = plan.quantity;
            while (remaining > EPSILON) {
                const lot = stockLots[lotIndex];
                if (!lot) {
                    throw new YieldCompletionError(422, "INSUFFICIENT_COMPONENT_STOCK", `Unable to allocate stock for ${plan.material.productName}.`);
                }
                const portion = Math.min(remaining, lot.availableQuantity);
                if (portion <= EPSILON) {
                    lotIndex++;
                    continue;
                }
                plan.lots.push({
                    lotId: lot.lotId,
                    lotNumber: lot.lotNumber,
                    expiryDate: lot.expiryDate,
                    createdOn: lot.createdOn,
                    quantity: portion
                });
                lot.availableQuantity -= portion;
                remaining -= portion;
                if (lot.availableQuantity <= EPSILON) lotIndex++;
            }
        }
    }

    return plans;
}

async function findExistingFinishedMovement(productId: number, branchId: number, joNo: string, lotNumber: string): Promise<any | null> {
    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { product_id: { _eq: productId } },
            { branch_id: { _eq: branchId } },
            { batch_no: { _eq: lotNumber } },
            { source_document_no: { _eq: joNo } },
            { transaction_type_id: { _eq: 2 } },
            { quantity: { _gt: 0 } }
        ]
    }));
    const rows = await directusRows<any>(
        `${DIRECTUS_URL}/items/inventory_movements?filter=${filter}&limit=1`,
        `Existing finished-goods movement lookup for ${joNo}`
    );
    return rows[0] || null;
}

async function hasFinishedGoodsLedger(productId: number, branchId: number, joNo: string, quantity: number): Promise<boolean> {
    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { productId: { _eq: productId } },
            { branchId: { _eq: branchId } },
            { documentNo: { _eq: joNo } },
            { documentType: { _eq: "Job Order Receipt" } },
            { quantity: { _eq: quantity } }
        ]
    }));
    const rows = await directusRows<any>(
        `${DIRECTUS_URL}/items/product_ledger?filter=${filter}&limit=1`,
        `Existing finished-goods ledger lookup for ${joNo}`
    );
    return rows.length > 0;
}

async function processSalesOrderAllocations(
    journal: MutationJournal,
    jobOrder: ResolvedYieldJobOrder,
    quantityProduced: number
): Promise<void> {
    const links = await directusRows<any>(
        `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrder.jobOrderId))}&limit=-1`,
        `Job-order allocation lookup for ${jobOrder.jobOrderNo}`
    );

    for (const link of links) {
        const detailId = numericRelationId(link.sales_order_detail_id);
        if (!Number.isFinite(detailId) || detailId <= 0) continue;

        const detail = await directusJson<any>(
            `${DIRECTUS_URL}/items/sales_order_details/${encodeURIComponent(String(detailId))}`,
            `Sales-order detail lookup for allocation ${detailId}`
        );
        const linkedQuantity = finiteNumber(link.allocated_quantity ?? 0, "Sales-order allocation quantity", { nonNegative: true });
        const targetQuantity = jobOrder.targetQuantity;
        const proportionalQuantity = quantityProduced < targetQuantity
            ? (linkedQuantity * quantityProduced) / targetQuantity
            : linkedQuantity;
        const currentAllocated = finiteNumber(detail.allocated_quantity ?? 0, "Current sales-order allocated quantity", { nonNegative: true });
        const unitPrice = finiteNumber(detail.unit_price ?? 0, "Sales-order unit price", { nonNegative: true });

        await journal.patch(
            "sales_order_details",
            detailId,
            {
                allocated_quantity: currentAllocated + proportionalQuantity,
                allocated_amount: (currentAllocated + proportionalQuantity) * unitPrice
            },
            `Update sales-order detail allocation ${detailId}`
        );

        const parentOrderId = numericRelationId(detail.order_id);
        if (!Number.isFinite(parentOrderId) || parentOrderId <= 0) continue;

        const allDetails = await directusRows<any>(
            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${encodeURIComponent(String(parentOrderId))}&limit=-1`,
            `Sales-order detail allocation verification for ${parentOrderId}`
        );
        const allFullyAllocated = allDetails.every(orderDetail =>
            finiteNumber(orderDetail.allocated_quantity ?? 0, "Sales-order allocated quantity", { nonNegative: true })
            >= finiteNumber(orderDetail.ordered_quantity ?? 0, "Sales-order ordered quantity", { nonNegative: true })
        );
        if (allFullyAllocated) {
            await journal.patch(
                "sales_order",
                parentOrderId,
                { order_status: "For Invoicing" },
                `Update sales-order status ${parentOrderId}`
            );
        }
    }
}

function completionReceipt(
    jobOrder: ResolvedYieldJobOrder,
    input: CompleteYieldClosingInput,
    quantityProduced: number,
    branchId: number,
    lotNumber: string,
    expirationDate: string,
    movementId: number
) {
    return {
        id: movementId,
        jo_id: jobOrder.jobOrderNo,
        product_id: jobOrder.productId,
        product_name: input.productName || "Manufactured Good",
        quantity_produced: quantityProduced,
        branch_id: branchId,
        lot_number: lotNumber,
        expiration_date: expirationDate,
        unit_cost: finiteNumber(input.unitCost ?? 0, "Unit cost", { nonNegative: true }),
        date_received: new Date().toISOString()
    };
}

export async function completeYieldClosing(input: CompleteYieldClosingInput): Promise<Record<string, unknown>> {
    const quantityProduced = finiteNumber(input.quantityProduced, "Produced quantity", { positive: true });
    const branchId = finiteNumber(input.branchId, "Branch ID", { positive: true });
    const requestedProductId = finiteNumber(input.productId, "Product ID", { positive: true });
    const requestedJoId = String(input.joId ?? "").trim();
    if (!requestedJoId) {
        throw new YieldCompletionError(400, "INVALID_YIELD_REQUEST", "Job order ID or number is required.");
    }

    const { jobOrder, materials } = await loadYieldMaterials(requestedJoId);
    if (requestedProductId !== jobOrder.productId) {
        throw new YieldCompletionError(422, "JOB_ORDER_PRODUCT_MISMATCH", "The selected product does not belong to this Job Order.");
    }
    if (jobOrder.branchId !== null && jobOrder.branchId !== branchId) {
        throw new YieldCompletionError(422, "JOB_ORDER_BRANCH_MISMATCH", "The selected branch does not belong to this Job Order.");
    }

    if (materials.length === 0) {
        await verifyZeroComponentBOM(jobOrder);
    } else if (!Array.isArray(input.componentsConsumed) || input.componentsConsumed.length === 0) {
        throw new YieldCompletionError(
            422,
            "MATERIAL_COMPONENTS_REQUIRED",
            "This Job Order has material requirements. Reload the material requirements before submitting yield closing."
        );
    }

    const lotNumber = String(input.lotNumber || `MFG-${jobOrder.jobOrderNo}`).trim();
    const expirationDate = String(input.expirationDate || await getTodayDateString(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)));
    const existingMovement = await findExistingFinishedMovement(jobOrder.productId, branchId, jobOrder.jobOrderNo, lotNumber);
    const journal = new MutationJournal();

    try {
        const componentPlans = await buildComponentPlans(materials, jobOrder, quantityProduced, branchId);

        if (existingMovement) {
            const existingQuantity = finiteNumber(existingMovement.quantity, "Existing finished-goods quantity", { positive: true });
            const hasLedger = await hasFinishedGoodsLedger(jobOrder.productId, branchId, jobOrder.jobOrderNo, existingQuantity);
            const allMaterialConsumptionComplete = materials.every(material =>
                calculateIncrementalMaterialConsumption(material, quantityProduced, jobOrder.targetQuantity) <= EPSILON
            );
            const status = String(jobOrder.status || "").toLowerCase();
            if (Math.abs(existingQuantity - quantityProduced) <= EPSILON && hasLedger && allMaterialConsumptionComplete && status === "completed") {
                return {
                    success: true,
                    idempotent: true,
                    data: completionReceipt(jobOrder, input, existingQuantity, branchId, lotNumber, expirationDate, recordId(existingMovement)),
                    accounting: { finishedMovementId: recordId(existingMovement), componentPlans }
                };
            }

            throw new YieldCompletionError(
                409,
                "YIELD_ALREADY_POSTED_INCOMPLETE",
                `A finished-goods movement already exists for ${jobOrder.jobOrderNo} and lot ${lotNumber}, but its accounting trail is incomplete. Reconciliation is required.`
            );
        }

        const finishedLotId = await resolveMasterLotId(lotNumber, 2, journal);
        const finishedMovement = await journal.create<any>(
            "inventory_movements",
            {
                product_id: jobOrder.productId,
                lot_id: finishedLotId,
                branch_id: branchId,
                transaction_type_id: 2,
                source_document_id: jobOrder.jobOrderId,
                source_document_no: jobOrder.jobOrderNo,
                batch_no: lotNumber,
                expiry_date: expirationDate,
                manufacturing_date: input.manufacturingDate || await getTodayDateString(),
                quantity: quantityProduced,
                created_by: 24,
                remarks: `Finished yield output from Job Order ${jobOrder.jobOrderNo}`
            },
            "Create finished-goods inventory movement"
        );
        const finishedMovementId = recordId(finishedMovement);

        const finishedLedger = await journal.create<any>(
            "product_ledger",
            {
                branchId,
                productId: jobOrder.productId,
                quantity: quantityProduced,
                documentType: "Job Order Receipt",
                documentNo: jobOrder.jobOrderNo,
                documentDescription: `MFG Run: ${lotNumber}`,
                documentDate: await getTodayDateString()
            },
            "Create finished-goods product ledger"
        );

        const persistedComponentMovements: number[] = [];
        const persistedGenealogy: number[] = [];
        const persistedComponentLedgers: number[] = [];
        const persistedMaterialUpdates: number[] = [];

        for (const plan of componentPlans) {
            const componentLedger = await journal.create<any>(
                "product_ledger",
                {
                    branchId,
                    productId: plan.material.productId,
                    quantity: -plan.quantity,
                    documentType: "Job Order Issue",
                    documentNo: jobOrder.jobOrderNo,
                    documentDescription: `Consumed to produce: ${input.productName || "Finished Goods"}`,
                    documentDate: await getTodayDateString()
                },
                `Create component product ledger for ${plan.material.productName}`
            );
            persistedComponentLedgers.push(recordId(componentLedger));

            for (const lot of plan.lots) {
                const consumedLotId = lot.lotId > 0
                    ? lot.lotId
                    : await resolveMasterLotId(lot.lotNumber, 1, journal);
                const componentMovement = await journal.create<any>(
                    "inventory_movements",
                    {
                        product_id: plan.material.productId,
                        lot_id: consumedLotId,
                        branch_id: branchId,
                        transaction_type_id: 1,
                        source_document_id: jobOrder.jobOrderId,
                        source_document_no: jobOrder.jobOrderNo,
                        batch_no: lot.lotNumber,
                        expiry_date: lot.expiryDate,
                        manufacturing_date: lot.createdOn ? lot.createdOn.split("T")[0] : null,
                        quantity: -lot.quantity,
                        created_by: 24,
                        remarks: `Consumed from lot ${lot.lotNumber} for JO yield`
                    },
                    `Create component inventory movement for ${plan.material.productName}`
                );
                persistedComponentMovements.push(recordId(componentMovement));

                const genealogy = await journal.create<any>(
                    "jo_material_genealogy",
                    {
                        job_order_id: jobOrder.jobOrderId,
                        batch_no: lotNumber,
                        component_product_id: plan.material.productId,
                        component_lot_id: consumedLotId,
                        component_batch_no: lot.lotNumber,
                        consumed_quantity: lot.quantity,
                        created_at: new Date().toISOString()
                    },
                    `Create material genealogy for ${plan.material.productName}`
                );
                persistedGenealogy.push(recordId(genealogy));
            }

            const newConsumed = plan.material.actualConsumedQuantity + plan.quantity;
            const newReserved = Math.max(0, plan.material.reservedQuantity - plan.quantity);
            await journal.patch(
                "manufacturing_job_order_materials",
                plan.material.materialId,
                {
                    actual_consumed_quantity: newConsumed,
                    reserved_quantity: newReserved
                },
                `Update material consumption for ${plan.material.productName}`
            );
            persistedMaterialUpdates.push(plan.material.materialId);
        }

        await processSalesOrderAllocations(journal, jobOrder, quantityProduced);

        const oldStatus = jobOrder.status || "In Progress";
        await journal.patch(
            "manufacturing_job_orders",
            jobOrder.jobOrderId,
            {
                status: "Completed",
                actual_quantity_produced: quantityProduced,
                modified_at: new Date().toISOString()
            },
            `Complete Job Order ${jobOrder.jobOrderNo}`
        );

        const statusHistory = await journal.create<any>(
            "manufacturing_job_order_status_history",
            {
                job_order_id: jobOrder.jobOrderId,
                old_status: oldStatus,
                new_status: "Completed",
                changed_by: 24,
                changed_at: new Date().toISOString(),
                remarks: `Yield Closing completed: ${quantityProduced} units.`
            },
            `Create Job Order completion history for ${jobOrder.jobOrderNo}`
        );

        return {
            success: true,
            data: completionReceipt(jobOrder, input, quantityProduced, branchId, lotNumber, expirationDate, finishedMovementId),
            accounting: {
                finishedMovementId,
                finishedLedgerId: recordId(finishedLedger),
                componentLedgerIds: persistedComponentLedgers,
                componentMovementIds: persistedComponentMovements,
                genealogyIds: persistedGenealogy,
                materialIds: persistedMaterialUpdates,
                statusHistoryId: recordId(statusHistory)
            }
        };
    } catch (error) {
        try {
            await journal.rollback();
        } catch (rollbackError) {
            if (rollbackError instanceof YieldCompletionError) throw rollbackError;
            throw new YieldCompletionError(
                502,
                "PARTIAL_WRITE_RECONCILIATION_REQUIRED",
                "Yield closing failed and automatic rollback was incomplete. Reconciliation is required.",
                journal.reconciliationIds
            );
        }

        if (error instanceof YieldCompletionError) throw error;
        if (error instanceof YieldMaterialsError) {
            throw new YieldCompletionError(error.status, error.code, error.message);
        }
        throw new YieldCompletionError(502, "YIELD_CLOSING_FAILED", "Yield closing could not be completed.");
    }
}
