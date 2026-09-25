/* eslint-disable */
import { DIRECTUS_URL, headers, DirectusJobOrder, getUomCountForProduct } from "./shared";
import { getBOMDetailsForVersion, getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { getTodayDateString, formatPhtDateTime } from "@/app/api/manufacturing/directus-api";
import { getAvailableInventoryLots } from "./inventory-helper";
import {
    isCancelledJobOrderStatus,
    isTerminalJobOrderStatus,
    JOB_ORDER_STATUS
} from "@/modules/manufacturing-management/job-order-status";
import { deleteJobOrder } from "./delete-helper";
import { calculateProductionMetrics } from "@/modules/manufacturing-management/planning-engineering/utils/production-metrics";
import {
    calculateRecipeMaterialCostPerUnit,
    roundManufacturingUnitCost
} from "@/modules/manufacturing-management/planning-engineering/utils/cogs-helper";
import { fetchMmInventoryMovements } from "../../services/mm-inventory-movements.service";
import {
    calculateReleaseMaterialRequirementPlan,
    calculateFullBatchTarget,
    readUomId,
    roundProductionValue,
    resolveProductionShiftHours
} from "@/modules/manufacturing-management/planning-engineering/utils/production-timing";
import { groupMaterialRequirements } from "@/modules/manufacturing-management/planning-engineering/utils/material-requirement-groups";
import { normalizeOperatorAssignments, synchronizeJobOrderOperatorAssignments } from "../../job-orders/_operator-assignment-service";
import {
    capReplacementCreditsToRemainingDemand,
    effectiveReplacementCreditQuantity,
    loadReplacementCreditData,
    type ReplacementCreditAttribution
} from "../../sales-order/_replacement-credits";

const QUANTITY_EPSILON = 0.000001;

async function readReplacementCreditCollection(collection: string, params: URLSearchParams) {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`Failed to read ${collection} from Manufacturing Directus (${response.status}).`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.data)) {
        throw new Error(`Manufacturing Directus returned an invalid ${collection} response.`);
    }
    return { data: payload.data };
}
async function readFinishedGoodsReceipts(jobOrderIds: number[]) {
    const receipts: Array<Record<string, unknown>> = [];
    const concurrency = 8;
    for (let index = 0; index < jobOrderIds.length; index += concurrency) {
        const chunk = jobOrderIds.slice(index, index + concurrency);
        const movementRows = await Promise.all(chunk.map((jobOrderId) =>
            fetchMmInventoryMovements({
                transactionTypeId: 2,
                movementDirection: "IN",
                referenceId: jobOrderId
            })
        ));
        receipts.push(...movementRows.flat());
    }
    return receipts;
}

interface ReplacementLeftoverReservation {
    id: number;
    joMaterialId: number;
    productId: number;
    branchId: number;
    mmLotId: number | null;
    inventoryLotId: number | null;
    batchNo: string | null;
    expiryDate: string | null;
    uomId: number | null;
    remaining: number;
}

interface ReplacementPredecessorSnapshot {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    completedQuantity: number;
    actualQuantityProduced: number;
    routes: Array<Record<string, unknown>>;
    leftoverReservations: ReplacementLeftoverReservation[];
}

async function directusGetList(collection: string, params: URLSearchParams): Promise<Array<Record<string, unknown>>> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null);
    if (Array.isArray(payload?.data)) return payload.data;
    if (payload?.data && typeof payload.data === "object") return [payload.data as Record<string, unknown>];
    return [];
}

/**
 * Snapshot of a terminated predecessor JO for replacement inheritance:
 * header progress, route rows (to re-run as Pending), and unconsumed
 * material reservations (to transfer). History (yield ledger, shift runs,
 * operator logs) intentionally stays on the predecessor.
 */
async function loadReplacementPredecessorSnapshot(predecessorJobOrderId: number): Promise<ReplacementPredecessorSnapshot | null> {
    const headerParams = new URLSearchParams({
        fields: "job_order_id,job_order_no,product_id,completed_quantity,actual_quantity_produced,status",
        limit: "1"
    });
    const headerRows = await directusGetList(
        `manufacturing_job_orders/${predecessorJobOrderId}`,
        headerParams
    );
    const header = headerRows[0];
    if (!header) return null;
    const routeParams = new URLSearchParams({
        [`filter[job_order_id][_eq]`]: String(predecessorJobOrderId),
        fields: "jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,step_batch_size,run_time_hours_factor,estimated_labor_cost,routing_id,qa_template_id,requires_qa,status",
        sort: "sequence_order",
        limit: "-1"
    });
    const routes = await directusGetList("manufacturing_job_order_routes", routeParams);
    const materialParams = new URLSearchParams({
        [`filter[job_order_id][_eq]`]: String(predecessorJobOrderId),
        fields: "jo_material_id,product_id",
        limit: "-1"
    });
    const materials = await directusGetList("manufacturing_job_order_materials", materialParams);
    const materialIds = materials
        .map((row) => Number(row.jo_material_id ?? 0))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
    const leftoverReservations: ReplacementLeftoverReservation[] = [];
    if (materialIds.length > 0) {
        const reservationParams = new URLSearchParams({
            [`filter[jo_material_id][_in]`]: materialIds.join(","),
            fields: "jo_materials_reservation_id,jo_material_id,product_id,branch_id,mm_lot_id,inventory_lot_id,batch_no,expiry_date,uom_id,reserved_quantity,actual_used_quantity,reservation_status",
            limit: "-1"
        });
        const reservations = await directusGetList("manufacturing_job_order_materials_reservations", reservationParams);
        for (const row of reservations) {
            const reserved = Number(row.reserved_quantity ?? 0);
            const used = Number(row.actual_used_quantity ?? 0);
            const remaining = reserved - used;
            if (!Number.isFinite(remaining) || remaining <= QUANTITY_EPSILON) continue;
            const id = Number(row.jo_materials_reservation_id ?? row.id ?? 0);
            if (!Number.isSafeInteger(id) || id <= 0) continue;
            leftoverReservations.push({
                id,
                joMaterialId: Number(row.jo_material_id ?? 0),
                productId: Number(row.product_id ?? 0),
                branchId: Number(row.branch_id ?? 0),
                mmLotId: row.mm_lot_id != null ? Number(row.mm_lot_id) : null,
                inventoryLotId: row.inventory_lot_id != null ? Number(row.inventory_lot_id) : null,
                batchNo: typeof row.batch_no === "string" ? row.batch_no : null,
                expiryDate: typeof row.expiry_date === "string" ? row.expiry_date : null,
                uomId: row.uom_id != null ? Number(row.uom_id) : null,
                remaining
            });
        }
        leftoverReservations.sort((left, right) => left.id - right.id);
    }
    return {
        jobOrderId: predecessorJobOrderId,
        jobOrderNo: String(header.job_order_no || `JO-${predecessorJobOrderId}`),
        productId: Number(header.product_id ?? 0),
        completedQuantity: Number(header.completed_quantity ?? 0),
        actualQuantityProduced: Number(header.actual_quantity_produced ?? 0),
        routes,
        leftoverReservations
    };
}

async function loadRouteOperationNames(routes: readonly unknown[]): Promise<Map<number, string>> {
    const operationIds = Array.from(new Set(routes
        .map((value) => {
            const route = value as Record<string, unknown>;
            const operation = route.operation_id;
            return Number(operation && typeof operation === "object"
                ? (operation as Record<string, unknown>).id ?? (operation as Record<string, unknown>).operation_id
                : operation);
        })
        .filter((id) => Number.isSafeInteger(id) && id > 0)));
    if (operationIds.length === 0) return new Map();

    try {
        const response = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_operations?filter[id][_in]=${operationIds.join(",")}&fields=id,operation_name&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!response.ok) return new Map();
        const operations = (await response.json()).data || [];
        return new Map(operations.map((operation: Record<string, unknown>) => [
            Number(operation.id),
            String(operation.operation_name || "")
        ]));
    } catch {
        return new Map();
    }
}

export class SalesOrderAllocationConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SalesOrderAllocationConflictError";
    }
}

export interface SalesOrderSchedulingPlan {
    branchId: number;
    productId: number;
    bomVersionId: number;
    requestedQuantity?: number;
    batchCount?: number;
    totalQuantity: number;
    lines: Array<{
        detailId: number;
        parentOrderId: number;
        availableQuantity: number;
        allocationQuantity: number;
    }>;
}

export interface CreateJobOrderOptions {
    deferSalesOrderTransition?: boolean;
    /** Creation is always a Draft; initialization is an explicit next action. */
    initialize?: boolean;
    /** Legacy buffer flag for initialization against physical on-hand stock. */
    physicalOnHandInitialization?: boolean;
    /** Planning may initialize an SO JO from physical on-hand stock without changing its SO linkage. */
    usePhysicalOnHand?: boolean;
}

function relationId(value: unknown): number {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(relation.job_order_id ?? relation.sales_order_detail_id ?? relation.detail_id ?? relation.id ?? 0);
    }
    return Number(value || 0);
}

async function readActiveAllocationQuantity(detailId: number, excludedJobOrderId?: number): Promise<number> {
    const allocationUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_eq]=${detailId}&fields=sales_order_detail_id,job_order_id,allocated_quantity,status&limit=-1`;
    let response = await fetch(allocationUrl, { headers, cache: "no-store" });
    let allocations: any[];
    if (response.ok) {
        allocations = (await response.json()).data || [];
    } else {
        const responseBody = await response.text();
        if (!/unknown field|invalid field|does not exist|doesn't exist|field .* not found/i.test(responseBody)) {
            throw new Error(`Failed to refresh Sales Order allocations for detail ${detailId}: ${response.status}`);
        }
        response = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_eq]=${detailId}&fields=sales_order_detail_id,job_order_id,allocated_quantity&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!response.ok) throw new Error(`Failed to refresh Sales Order allocations for detail ${detailId}: ${response.status}`);
        allocations = (await response.json()).data || [];
    }

    const activeAllocations = allocations.filter((allocation) => {
        if (isCancelledJobOrderStatus(allocation.status)) return false;
        const jobOrderId = relationId(allocation.job_order_id);
        return !excludedJobOrderId || jobOrderId !== excludedJobOrderId;
    });
    const jobOrderIds = [...new Set(activeAllocations.map((allocation) => relationId(allocation.job_order_id)).filter(Boolean))];
    const terminalJobOrderIds = new Set<number>();
    if (jobOrderIds.length > 0) {
        const jobOrderResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_in]=${jobOrderIds.join(",")}&fields=job_order_id,status&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!jobOrderResponse.ok) throw new Error(`Failed to refresh linked Job Orders for detail ${detailId}: ${jobOrderResponse.status}`);
        for (const jobOrder of ((await jobOrderResponse.json()).data || []) as any[]) {
            if (isCancelledJobOrderStatus(jobOrder.status) || isTerminalJobOrderStatus(jobOrder.status)) {
                terminalJobOrderIds.add(Number(jobOrder.job_order_id));
            }
        }
    }

    return activeAllocations.reduce((sum, allocation) => {
        if (terminalJobOrderIds.has(relationId(allocation.job_order_id))) return sum;
        const quantity = Number(allocation.allocated_quantity ?? allocation.quantity ?? 0);
        return Number.isFinite(quantity) && quantity > 0 ? sum + quantity : sum;
    }, 0);
}

async function assertFreshAllocationCapacity(
    detailId: number,
    requestedQuantity: number,
    excludedJobOrderId?: number,
    replacementCreditQuantity = 0
) {
    const detailResponse = await fetch(
        `${DIRECTUS_URL}/items/sales_order_details/${detailId}?fields=detail_id,ordered_quantity,allocated_quantity,served_quantity`,
        { headers, cache: "no-store" }
    );
    if (!detailResponse.ok) throw new Error(`Failed to refresh Sales Order detail ${detailId}: ${detailResponse.status}`);
    const detail = (await detailResponse.json()).data;
    const ordered = Number(detail?.ordered_quantity || 0);
    const fulfilled = Math.max(Number(detail?.allocated_quantity || 0), Number(detail?.served_quantity || 0));
    const planned = await readActiveAllocationQuantity(detailId, excludedJobOrderId);
    const available = Math.max(0, ordered - fulfilled - planned - Math.max(0, replacementCreditQuantity));
    if (!Number.isFinite(available) || requestedQuantity > available + QUANTITY_EPSILON) {
        throw new SalesOrderAllocationConflictError(`Sales Order detail ${detailId} no longer has enough remaining quantity for this Job Order. Refresh the demand list and try again.`);
    }
}

export async function transitionLinkedSalesOrdersToInProduction(
    parentOrderIds: Set<number>,
    previousParentStatuses: Map<number, string>
) {
    for (const parentOrderId of parentOrderIds) {
        const previousStatus = String(previousParentStatuses.get(parentOrderId) || "").trim();
        if (previousStatus !== "For Production") continue;

        // Re-read the parent before patching so a concurrent downstream
        // transition is not overwritten by this JO-link operation.
        const currentResponse = await fetch(
            `${DIRECTUS_URL}/items/sales_order/${parentOrderId}?fields=order_id,order_status`,
            { headers, cache: "no-store" }
        );
        if (!currentResponse.ok) {
            throw new Error(`Failed to re-read Sales Order ${parentOrderId} before status transition: ${currentResponse.status}`);
        }
        const currentOrder = (await currentResponse.json()).data;
        const currentStatus = String(currentOrder?.order_status || "").trim();
        if (currentStatus !== "For Production") continue;

        const statusResponse = await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ order_status: "In Production" })
        });
        if (!statusResponse.ok) {
            throw new Error(`Failed to transition Sales Order ${parentOrderId} to In Production: ${statusResponse.status}`);
        }
    }
}

export async function createJobOrder(
    joData: Partial<DirectusJobOrder>,
    salesOrderIds: number[] = [],
    salesOrderDetailIds: number[] = [],
    schedulingPlan?: SalesOrderSchedulingPlan | null,
    options: CreateJobOrderOptions = {}
): Promise<{ job_order_id?: number | null; jo_id?: string | null; status?: string; shortfalls?: Array<{ name: string; required: number; available: number; shortage: number }> }> {
    let createdJobOrderNo: string | null = null;
    const previousParentStatuses = new Map<number, string>();
    const createdReplacementCreditIds: number[] = [];
    const movedReservationRestorations: Array<{ id: number; previousJoMaterialId: number }> = [];
    try {
        const todayStr = await getTodayDateString();
        let productsList = schedulingPlan
            ? [{
                product_id: schedulingPlan.productId,
                product_name: joData.product_name,
                quantity: schedulingPlan.totalQuantity,
                requested_quantity: schedulingPlan.requestedQuantity ?? schedulingPlan.totalQuantity,
                material_target_quantity: (joData as any).products?.[0]?.material_target_quantity
                    ?? (joData as any).products?.[0]?.materialTargetQuantity,
                timing_target_quantity: (joData as any).products?.[0]?.timing_target_quantity
                    ?? (joData as any).products?.[0]?.timingTargetQuantity,
                bom: { version_id: schedulingPlan.bomVersionId }
            }]
            : (joData.products || []);
        if (productsList.length === 0 && joData.product_id) {
            productsList = [{
                product_id: joData.product_id,
                product_name: joData.product_name,
                quantity: joData.quantity,
                requested_quantity: (joData as any).requested_quantity ?? (joData as any).requestedQuantity ?? joData.quantity,
                bom: joData.bom
            }];
        }

        const mergedProducts: Record<string, any> = {};
        for (const p of productsList) {
            const pId = Number(p.product_id);
            let versionId = (p as any).bom?.version || (p as any).bom?.bom_id || (p as any).bom?.version_id || null;
            if (!versionId && salesOrderIds && salesOrderIds.length > 0) {
                try {
                    const soId = salesOrderIds[0];
                    const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, { headers });
                    if (soRes.ok) {
                        const so = (await soRes.json()).data;
                        const customerCode = so?.customer_code;
                        if (customerCode) {
                            const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(customerCode)}&limit=1`, { headers });
                            if (custRes.ok) {
                                const customer = (await custRes.json()).data?.[0];
                                const customerId = customer?.id || customer?.customer_id;
                                if (customerId) {
                                    const activeVer = await getActiveVersionForProduct(pId, Number(customerId));
                                    versionId = activeVer.version?.version_id || null;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to resolve customer override during creation:", err);
                }
            }
            if (!versionId) {
                const activeVer = await getActiveVersionForProduct(pId);
                versionId = activeVer.version?.version_id || null;
            }
            const key = `${pId}-${versionId || 'default'}`;
            if (!mergedProducts[key]) {
                mergedProducts[key] = {
                    product_id: pId,
                    product_name: p.product_name || `Product #${pId}`,
                    quantity: 0,
                    timing_target_quantity: 0,
                    material_target_quantity: 0,
                    uom_id: (p as any).uom_id ?? (p as any).uomId ?? (joData as any).uom_id ?? null,
                    bom: versionId ? { version_id: versionId } : null
                };
            }
            mergedProducts[key].quantity += Number(p.quantity || 0);
            mergedProducts[key].timing_target_quantity += Number(
                (p as any).timing_target_quantity
                    ?? (p as any).timingTargetQuantity
                    ?? (p as any).requested_quantity
                    ?? (p as any).requestedQuantity
                    ?? p.quantity
                    ?? 0
            );
            const materialTargetQuantity = Number((p as any).material_target_quantity ?? (p as any).materialTargetQuantity);
            if (Number.isFinite(materialTargetQuantity) && materialTargetQuantity > 0) {
                mergedProducts[key].material_target_quantity += materialTargetQuantity;
            }
        }
        const finalProductsList = Object.values(mergedProducts);
        const firstProd = finalProductsList[0];
        if (!firstProd) throw new Error("No products selected for Job Order");

        let versionId = firstProd.bom?.version_id;
        if (!versionId && salesOrderIds && salesOrderIds.length > 0) {
            try {
                const soId = salesOrderIds[0];
                const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, { headers });
                if (soRes.ok) {
                    const so = (await soRes.json()).data;
                    const customerCode = so?.customer_code;
                    if (customerCode) {
                        const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(customerCode)}&limit=1`, { headers });
                        if (custRes.ok) {
                            const customer = (await custRes.json()).data?.[0];
                            const customerId = customer?.id || customer?.customer_id;
                            if (customerId) {
                                const activeVer = await getActiveVersionForProduct(firstProd.product_id, Number(customerId));
                                versionId = activeVer.version?.version_id;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to resolve customer override for first product:", err);
            }
        }
        if (!versionId) {
            const activeVer = await getActiveVersionForProduct(firstProd.product_id);
            versionId = activeVer.version?.version_id;
        }

        let targetUomId = Number((joData as any).uom_id || (joData as any).uomId || firstProd.uom_id || 0);
        if (!targetUomId) {
            const productResponse = await fetch(
                `${DIRECTUS_URL}/items/products/${firstProd.product_id}?fields=unit_of_measurement,unit_of_measurement.unit_id`,
                { headers, cache: "no-store" }
            );
            if (productResponse.ok) {
                const product = (await productResponse.json()).data || {};
                const unit = product.unit_of_measurement;
                targetUomId = Number(
                    typeof unit === "object" ? unit?.unit_id ?? unit?.id : unit
                ) || 0;
            }
        }

        const shouldInitialize = options.initialize === true;

        // Dry-Run BOM Explosion & Raw Material Stock Verification. Draft saves
        // persist the worksheet only; they must not be rejected or annotated
        // from a point-in-time availability check.
        const shortfalls: Array<{ name: string; required: number; available: number; shortage: number }> = [];
        const preflightMaterialRequirements: Array<{ product_id: number; uom_id: unknown; required_quantity: number }> = [];
        const inventoryAvailabilityOptions = shouldInitialize
            && (options.physicalOnHandInitialization || options.usePhysicalOnHand)
            ? { includeReservations: false }
            : undefined;
        
        for (const p of finalProductsList) {
            const pId = p.product_id;
            let pVersionId = p.bom?.version_id;
            if (!pVersionId) {
                const activeVer = await getActiveVersionForProduct(pId);
                pVersionId = activeVer.version?.version_id || null;
            }

            const { version, routes } = pVersionId 
                ? await getBOMDetailsForVersion(pId, pVersionId)
                : await getActiveVersionForProduct(pId);

            if (version && version.status && (version.status as string) !== "Active" && (version.status as string) !== "Approved") {
                throw new Error(`Cannot create Job Order for Product '${p.product_name}': Version '${version.version_name || pVersionId}' is not yet approved (Status: ${version.status}).`);
            }
            
            const components: any[] = [];
            if (routes && routes.length > 0) {
                for (const r of routes) {
                    if (r.bom_items && r.bom_items.length > 0) {
                        components.push(...r.bom_items);
                    }
                }
            }
            
            let productionQty = Number(p.quantity);
            let timingTargetQuantity = Number((p as any).timing_target_quantity ?? productionQty);
            let materialTargetQuantity = Number((p as any).material_target_quantity);
            if (!Number.isFinite(materialTargetQuantity) || materialTargetQuantity <= 0) {
                materialTargetQuantity = Number.NaN;
            }
            if (version && version.product_id && Number(version.product_id) !== Number(pId)) {
                const pCount = await getUomCountForProduct(pId);
                if (pCount > 0) {
                    productionQty = Math.ceil(productionQty / pCount);
                    timingTargetQuantity = Math.ceil(timingTargetQuantity / pCount);
                    if (Number.isFinite(materialTargetQuantity)) materialTargetQuantity /= pCount;
                }
            }

            const recipeBaseQuantity = Number(version?.base_quantity);
            if (Number.isFinite(recipeBaseQuantity) && recipeBaseQuantity > 0) {
                productionQty = calculateFullBatchTarget(productionQty, recipeBaseQuantity);
                p.quantity = productionQty;
            }

            if (components.length > 0) {
                for (const bItem of components) {
                    const compProductId = Number(bItem.product_id);
                    const baseQuantity = Number(version?.base_quantity);
                    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
                        throw new Error(`Recipe base quantity is required for Product '${p.product_name}'.`);
                    }
                    const quantityRequired = calculateReleaseMaterialRequirementPlan(
                        productionQty,
                        productionQty,
                        Number(bItem.quantity_required || 0),
                        Number(bItem.wastage_factor_percentage || 0),
                        materialTargetQuantity
                    ).plannedRequired;
                    preflightMaterialRequirements.push({
                        product_id: compProductId,
                        uom_id: (bItem as any).uom_id ?? (bItem as any).unit_of_measurement,
                        required_quantity: quantityRequired
                    });
                }
            }
        }

        const groupedPreflightRequirements = groupMaterialRequirements(preflightMaterialRequirements, {
            productId: (item) => item.product_id,
            uomId: (item) => item.uom_id,
            quantity: (item) => item.required_quantity
        });
        for (const requirement of groupedPreflightRequirements) {
            const compProductId = requirement.productId;
            const compActiveVer = await getActiveVersionForProduct(compProductId);
            if (!shouldInitialize || compActiveVer?.version) continue;
            if (!joData.branch_id) throw new Error("Cannot verify stock: Job Order is missing branch_id");

            const availableLots = await getAvailableInventoryLots(
                compProductId,
                Number(joData.branch_id),
                inventoryAvailabilityOptions
            );
            const netAvailable = availableLots.reduce((total, lot) => total + lot.available, 0);
            const shortage = Math.max(0, requirement.requiredQuantity - netAvailable);
            if (shortage <= 0.000001) continue;

            let prodName = `Product #${compProductId}`;
            try {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${compProductId}?fields=product_name`, { headers });
                if (prodRes.ok) prodName = (await prodRes.json()).data?.product_name || prodName;
            } catch (err) {
                console.error("Failed to fetch product name for shortfall error:", err);
            }
            shortfalls.push({
                name: prodName,
                required: requirement.requiredQuantity,
                available: netAvailable,
                shortage
            });
        }

        const totalMergedQuantity = finalProductsList.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
        const numericTargetQuantity = Number(totalMergedQuantity);
        const numericBranchId = Number(joData.branch_id);
        const numericPriority = Number((joData as any).priority ?? 0);
        const numericVersionId = Number(versionId || 0);
        if (!Number.isSafeInteger(numericBranchId) || numericBranchId <= 0) {
            throw new Error("A valid branch is required before creating a Job Order.");
        }
        if (!Number.isSafeInteger(numericVersionId) || numericVersionId <= 0) {
            throw new Error("An approved product version/formula is required before creating a Job Order.");
        }
        if (!Number.isFinite(numericTargetQuantity) || numericTargetQuantity <= 0) {
            throw new Error("A target production quantity greater than zero is required before creating a Job Order.");
        }
        if (!Number.isSafeInteger(targetUomId) || targetUomId <= 0) {
            throw new Error("A target unit of measurement is required before creating a Job Order.");
        }
        if (!Number.isFinite(numericPriority) || numericPriority < 0) {
            throw new Error("A valid non-negative Job Order priority is required before creating a Job Order.");
        }

        // A create request never changes the lifecycle state. The caller must
        // invoke the workflow initialize action after the full BOM, routing,
        // and material worksheet are persisted.
        const initialStatus = JOB_ORDER_STATUS.DRAFT;

        let forcedDraftRemarks = "";
        if (shouldInitialize && shortfalls.length > 0) {
            console.log("[createJobOrder] Shortfall detected. Keeping Job Order in Draft. shortfalls:", shortfalls);
            const shortfallMsg = shortfalls.map(s => 
                `${s.name} (Shortfall: ${s.shortage.toFixed(4)} units)`
            ).join("; ");
            forcedDraftRemarks = ` | Saved as Draft due to raw material shortfalls: ${shortfallMsg}`;
        }

        // Replacement inheritance: when this JO replaces terminated
        // predecessor(s), snapshot their progress, routes, and unconsumed
        // material reservations up front so the header, route explosion, and
        // materials worksheet below can inherit instead of starting fresh.
        // Yield ledger and shift history stay on the predecessor; the
        // replacement_credits rows remain the audit link.
        let earlyDetails: Array<Record<string, unknown>> | null = null;
        let earlyCreditData: Awaited<ReturnType<typeof loadReplacementCreditData>> | null = null;
        const replacementSnapshots = new Map<number, ReplacementPredecessorSnapshot>();
        // Same detail-id resolution as the allocation section below so the
        // predecessor set always matches the allocation math.
        const requestedDetailIds = schedulingPlan
            ? schedulingPlan.lines.map((line) => line.detailId)
            : [...new Set(salesOrderDetailIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        if (requestedDetailIds.length > 0) {
            // Retry transient lookup failures (e.g. Spring 429s backing the
            // finished-goods receipt read). If the predecessors cannot be
            // established, fail loudly: a silently non-inherited replacement
            // JO would misstate progress, routes, and reservations.
            let lastInheritanceError: unknown = null;
            for (let attempt = 1; attempt <= 3; attempt += 1) {
                try {
                    const detailRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${requestedDetailIds.join(",")}&fields=detail_id,order_id,ordered_quantity,allocated_quantity,served_quantity&limit=-1`,
                        { headers, cache: "no-store" }
                    );
                    if (!detailRes.ok) {
                        throw new Error(`Failed to load sales order details for replacement check: ${detailRes.status}`);
                    }
                    const loadedDetails: any[] = (await detailRes.json()).data || [];
                    earlyDetails = loadedDetails;
                    earlyCreditData = await loadReplacementCreditData(
                        readReplacementCreditCollection,
                        loadedDetails,
                        readFinishedGoodsReceipts
                    );
                    const predecessorIds = Array.from(new Set(
                        (earlyCreditData.attributions || [])
                            .map((item: { predecessorJobOrderId?: unknown }) => Number(item.predecessorJobOrderId))
                            .filter((id: number) => Number.isSafeInteger(id) && id > 0)
                    ));
                    replacementSnapshots.clear();
                    for (const predecessorId of predecessorIds) {
                        const snapshot = await loadReplacementPredecessorSnapshot(predecessorId);
                        if (snapshot) replacementSnapshots.set(predecessorId, snapshot);
                    }
                    lastInheritanceError = null;
                    break;
                } catch (inheritanceError) {
                    lastInheritanceError = inheritanceError;
                    earlyDetails = null;
                    earlyCreditData = null;
                    replacementSnapshots.clear();
                    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
                }
            }
            if (lastInheritanceError) {
                throw new Error(`Failed to establish replacement predecessors: ${lastInheritanceError instanceof Error ? lastInheritanceError.message : "unknown error"}`);
            }
        }

        // 3. Insert header
        const headerPayload = {
            job_order_no: joData.jo_id || `JO-${Math.floor(100000 + Math.random() * 900000)}`,
            parent_job_order_id: joData.parent_job_order_id ? Number(joData.parent_job_order_id) : null,
            product_id: firstProd.product_id,
            version_id: versionId || null,
            target_quantity: numericTargetQuantity,
            completed_quantity: 0,
            rejected_quantity: 0,
            actual_quantity_produced: 0,
            start_date: joData.start_date || (joData as any).planned_date || todayStr,
            end_date: joData.due_date || null,
            status: initialStatus,
            uom_id: targetUomId,
            priority: numericPriority,
            primary_work_center_id: (joData as any).primary_work_center_id ? Number((joData as any).primary_work_center_id) : null,
            assigned_personnel: normalizeOperatorAssignments(
                (joData as any).assigned_personnel ?? (joData as any).assignments
            ),
            shift_option: String(resolveProductionShiftHours(joData.shift_option)),
            sub_assembly_version_map: (joData as any).sub_assembly_version_map 
                ? (typeof (joData as any).sub_assembly_version_map === "object" ? JSON.stringify((joData as any).sub_assembly_version_map) : (joData as any).sub_assembly_version_map) 
                : ((joData as any).subAssemblyVersionMap ? JSON.stringify((joData as any).subAssemblyVersionMap) : null),
            branch_id: numericBranchId,
            created_by: joData.created_by ? Number(joData.created_by) : null,
            created_at: formatPhtDateTime(),
            modified_at: null,
            remarks: (joData.remarks || `Consolidated production run. Shift: ${resolveProductionShiftHours(joData.shift_option)}`) + forcedDraftRemarks
        };

        const headerRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders`, {
            method: "POST",
            headers,
            body: JSON.stringify(headerPayload)
        });
        if (!headerRes.ok) {
            const txt = await headerRes.text();
            throw new Error(`Failed to create job_order header: ${headerRes.status} - ${txt}`);
        }

        const createdJo = (await headerRes.json()).data;
        const joIdInt = createdJo.job_order_id;
        const joNoStr = createdJo.job_order_no;
        createdJobOrderNo = joNoStr;

        // Insert initial status record into manufacturing_job_order_status_history
        const historyRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_status_history`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                job_order_id: joIdInt,
                old_status: JOB_ORDER_STATUS.DRAFT,
                new_status: JOB_ORDER_STATUS.DRAFT,
                workflow_action: "create-draft",
                event_key: `create:${joNoStr}`,
                remarks: "Initial Job Order Creation",
                changed_by: joData.created_by ? Number(joData.created_by) : null,
                changed_at: formatPhtDateTime()
            })
        });
        if (!historyRes.ok) {
            throw new Error(`Failed to create initial Job Order status history: ${historyRes.status} - ${await historyRes.text()}`);
        }

        // 4. Insert merged product(s) and explode BOM/routings
        let totalEstimatedHours = 0;
        let materialReservationSequence = 0;
        const initializationLotsByProduct = new Map<number, Awaited<ReturnType<typeof getAvailableInventoryLots>>>();
        const allocatedStockByLot = new Map<string, number>();
        for (const p of finalProductsList) {
            const { version, routes } = versionId
                ? await getBOMDetailsForVersion(p.product_id, versionId)
                : await getActiveVersionForProduct(p.product_id);
            const routeOperationNames = await loadRouteOperationNames(routes || []);
            // Replacement inheritance (re-run all): when a terminated
            // predecessor made the same product, clone its route rows as
            // Pending instead of exploding the BOM again.
            const inheritedPredecessor = Array.from(replacementSnapshots.values()).find(
                (snapshot) => Number(snapshot.productId) === Number(p.product_id) && snapshot.routes.length > 0
            ) || null;

            let productionQty = Number(p.quantity);
            let timingTargetQuantity = Number((p as any).timing_target_quantity ?? productionQty);
            let materialTargetQuantity = Number((p as any).material_target_quantity);
            if (!Number.isFinite(materialTargetQuantity) || materialTargetQuantity <= 0) {
                materialTargetQuantity = Number.NaN;
            }
            let productionUomId = readUomId((p as any).uom_id ?? (p as any).uomId ?? (joData as any).uom_id ?? (joData as any).uomId);
            if (version && version.product_id && Number(version.product_id) !== Number(p.product_id)) {
                try {
                    const originalUomCount = await getUomCountForProduct(Number(p.product_id));
                    const targetUomCount = await getUomCountForProduct(Number(version.product_id));
                    productionQty = productionQty * (originalUomCount / targetUomCount);
                    timingTargetQuantity = timingTargetQuantity * (originalUomCount / targetUomCount);
                    if (Number.isFinite(materialTargetQuantity)) {
                        materialTargetQuantity = materialTargetQuantity * (originalUomCount / targetUomCount);
                    }
                    productionUomId = readUomId(version.uom_id) || productionUomId;
                } catch (e) {
                    console.error("Error scaling quantity for job order product variant:", e);
                }
            }

            const baseQuantity = Number(version?.base_quantity);
            if (Number.isFinite(baseQuantity) && baseQuantity > 0) {
                productionQty = calculateFullBatchTarget(productionQty, baseQuantity);
            }
            const costingComponents = (routes || []).flatMap((route) => route.bom_items || []);
            const materialCostPerUnit = roundManufacturingUnitCost(calculateRecipeMaterialCostPerUnit(
                costingComponents.map((component: any) => ({
                    quantity_required: Number(component.quantity_required || 0),
                    wastage_factor_percentage: Number(component.wastage_factor_percentage || 0),
                    cost_per_unit: Number(component.cost_per_unit || 0)
                }))
            ));
            const productionMetrics = routes && routes.length > 0
                ? calculateProductionMetrics({
                    targetQuantity: productionQty,
                    timingTargetQuantity,
                    baseQuantity,
                    targetUomId: productionUomId,
                    baseUomId: readUomId(version?.uom_id),
                    routes: routes.map((route) => ({
                        sequence_order: Number(route.sequence_order || 0),
                        operation_name: String((route as any).operation_name || routeOperationNames.get(Number((route as any).operation_id)) || ""),
                        setup_time_hours: Number(route.setup_time_hours || 0),
                        run_time_hours: Number(route.run_time_hours || 0),
                        step_batch_size: route.step_batch_size == null ? undefined : Number(route.step_batch_size),
                        work_center_overhead_cost_per_hour: Number(
                            (route as any).work_center?.overhead_cost_per_hour
                                ?? (route as any).overhead_cost_per_hour
                                ?? 0
                        ),
                        work_center_capacity_per_hour: Number((route as any).work_center?.capacity_per_hour || 0)
                    })),
                    bomItems: costingComponents.map((component) => ({
                        quantity_required: Number(component.quantity_required || 0),
                        wastage_factor_percentage: Number(component.wastage_factor_percentage || 0),
                        cost_per_unit: Number(component.cost_per_unit || 0)
                    })),
                    laborPositions: version?.labor_positions || [],
                    overheadItems: version?.overhead_items || [],
                    customOverhead: version?.custom_overhead,
                    expectedYieldPercentage: version?.expected_yield_percentage,
                    materialCostPerUnit
                })
                : null;

            if (productionMetrics) {
                totalEstimatedHours += productionMetrics.lineLeadTimeHours;
            }

            if (routes && routes.length > 0) {
                if (!productionMetrics) {
                    throw new Error(`Unable to calculate production metrics for Product '${p.product_name}'.`);
                }
                const effectiveRoutes: Array<Record<string, unknown>> = inheritedPredecessor
                    ? inheritedPredecessor.routes
                    : ((routes || []) as unknown as Array<Record<string, unknown>>);
                for (const r of effectiveRoutes) {
                    let baseRoutePayload: Record<string, unknown>;
                    let masterRoutingId = 0;
                    let qaTemplateId = 0;
                    let requiresQa = false;
                    if (inheritedPredecessor) {
                        // Re-run all: clone the predecessor step as Pending with
                        // zeroed actuals. Planned hours/labor carry over as-is.
                        const inheritedQaTemplate = (r as any).qa_template_id;
                        qaTemplateId = inheritedQaTemplate && typeof inheritedQaTemplate === "object"
                            ? Number(inheritedQaTemplate.template_id || inheritedQaTemplate.id || 0)
                            : Number(inheritedQaTemplate || 0);
                        masterRoutingId = Number((r as any).routing_id || 0);
                        requiresQa = qaTemplateId > 0
                            || (r as any).requires_qa === true
                            || Number((r as any).requires_qa) === 1;
                        baseRoutePayload = {
                            job_order_id: joIdInt,
                            sequence_order: Number(r.sequence_order || 0),
                            work_center_id: Number(r.work_center_id || 1),
                            operation_id: Number((r as any).operation_id || 1),
                            planned_setup_hours: Number(r.planned_setup_hours || 0),
                            planned_run_hours: Number(r.planned_run_hours || 0),
                            actual_setup_hours: 0,
                            actual_run_hours: 0,
                            step_batch_size: Number(r.step_batch_size || 0),
                            run_time_hours_factor: Number(r.run_time_hours_factor || 0),
                            estimated_labor_cost: Number(r.estimated_labor_cost || 0),
                            status: "Pending"
                        };
                    } else {
                    const sequenceOrder = Number(r.sequence_order || 0);
                    const routeMetric = productionMetrics?.routeMetrics.find(
                        (metric) => metric.sequenceOrder === sequenceOrder
                    );
                    if (!routeMetric) {
                        throw new Error(`Unable to calculate production metrics for routing step ${sequenceOrder || ""}.`);
                    }

                    const plannedSetup = roundProductionValue(routeMetric.plannedSetupHours);
                    const plannedRun = roundProductionValue(routeMetric.plannedRunHours);
                    const laborWorkloadShare = productionMetrics.cumulativeWorkloadHours > 0
                        ? routeMetric.elapsedHours / productionMetrics.cumulativeWorkloadHours
                        : 0;
                    const plannedLabor = roundProductionValue(productionMetrics.cogsBreakdown.directLaborCostPerUnit
                        * productionQty
                        * laborWorkloadShare);

                    masterRoutingId = Number((r as any).route_id || (r as any).routing_id || (r as any).id || 0);
                    const rawQaTemplate = (r as any).qa_template_id;
                    qaTemplateId = rawQaTemplate && typeof rawQaTemplate === "object"
                        ? Number(rawQaTemplate.template_id || rawQaTemplate.id || 0)
                        : Number(rawQaTemplate || 0);
                    requiresQa = qaTemplateId > 0
                        || (r as any).requires_qa === true
                        || Number((r as any).requires_qa) === 1;

                    // Keep the legacy fields shared by both route collections. The
                    // job-order route receives the master routing/QA metadata when
                    // the Directus schema supports those optional fields.
                    baseRoutePayload = {
                        job_order_id: joIdInt,
                        sequence_order: Number(r.sequence_order || 0),
                        work_center_id: Number(r.work_center_id || 1),
                        operation_id: Number((r as any).operation_id || (r as any).id || 1),
                        planned_setup_hours: plannedSetup,
                        planned_run_hours: plannedRun,
                        actual_setup_hours: 0,
                        actual_run_hours: 0,
                        step_batch_size: roundProductionValue(routeMetric.stepBatchSize),
                        run_time_hours_factor: Number(r.run_time_hours || 0),
                        estimated_labor_cost: plannedLabor,
                        status: "Pending"
                    };
                    }

                    const jobOrderRoutePayload = {
                        ...baseRoutePayload,
                        routing_id: masterRoutingId || null,
                        qa_template_id: qaTemplateId || null,
                        requires_qa: requiresQa
                    };

                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_operations`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(baseRoutePayload)
                    }).catch(() => {});

                    let routeRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?fields=jo_route_id`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(jobOrderRoutePayload)
                    });
                    let routeResponseText = "";

                    // Older Directus instances may not yet have the optional QA
                    // metadata columns. Retry with the legacy payload only for an
                    // explicit schema/payload-field rejection; other write errors
                    // must remain visible to the caller.
                    if (!routeRes.ok) {
                        routeResponseText = await routeRes.text();
                        const optionalFieldsUnsupported = /unknown field|invalid payload|does not exist|doesn't exist|field .* not found/i.test(routeResponseText);
                        if (optionalFieldsUnsupported) {
                            console.warn("[createJobOrder] JO route QA metadata fields are unavailable; using legacy route payload.", routeResponseText);
                            routeRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?fields=jo_route_id`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify(baseRoutePayload)
                            });
                            routeResponseText = "";
                        }
                    }

                    if (!routeRes.ok) {
                        const errorText = routeResponseText || await routeRes.text();
                        throw new Error(`Failed to create Job Order route: ${routeRes.status} - ${errorText}`);
                    }

                }
            }
        }

        for (const requirement of groupedPreflightRequirements) {
            const componentProductId = requirement.productId;
            const requiredQuantity = requirement.requiredQuantity;
            let uomId = readUomId(requirement.uomId);
            if (!uomId) {
                try {
                    const productResponse = await fetch(
                        `${DIRECTUS_URL}/items/products/${componentProductId}?fields=unit_of_measurement`,
                        { headers }
                    );
                    if (productResponse.ok) {
                        const product = (await productResponse.json()).data;
                        uomId = readUomId(product?.unit_of_measurement) || 1;
                    }
                } catch (error) {
                    console.error("Error looking up UOM ID for component:", error);
                    uomId = 1;
                }
            }

            let reservedQuantity = 0;
            const allocations: Array<{
                purchase_order_product_id: number;
                mm_lot_id?: number;
                inventory_lot_id?: number;
                batch_no?: string;
                expiry_date?: string | null;
                allocated: number;
            }> = [];
            // Replacement inheritance (transfer leftovers): re-point
            // unconsumed predecessor reservations at the same branch to this
            // JO instead of freshly reserving the same stock. Whole rows only;
            // the fresh reservation loop below is capped by what was moved.
            let transferredReservationQuantity = 0;
            const reservationsToTransfer: Array<{
                id: number;
                previousJoMaterialId: number;
            }> = [];
            if (shouldInitialize && replacementSnapshots.size > 0) {
                let transferNeed = requiredQuantity;
                for (const snapshot of replacementSnapshots.values()) {
                    if (transferNeed <= QUANTITY_EPSILON) break;
                    for (const leftover of snapshot.leftoverReservations) {
                        if (transferNeed <= QUANTITY_EPSILON) break;
                        if (Number(leftover.productId) !== Number(componentProductId)) continue;
                        if (Number(leftover.branchId) !== Number(numericBranchId)) continue;
                        if (leftover.remaining <= QUANTITY_EPSILON) continue;
                        if (leftover.remaining - transferNeed > QUANTITY_EPSILON) continue;
                        reservationsToTransfer.push({ id: leftover.id, previousJoMaterialId: leftover.joMaterialId });
                        transferredReservationQuantity += leftover.remaining;
                        transferNeed -= leftover.remaining;
                    }
                }
            }
            if (shouldInitialize) {
                if (!joData.branch_id) throw new Error("Cannot allocate raw materials: Job Order is missing branch_id");
                const branchId = Number(joData.branch_id);
                let availableLots = initializationLotsByProduct.get(componentProductId);
                if (!availableLots) {
                    availableLots = await getAvailableInventoryLots(componentProductId, branchId, inventoryAvailabilityOptions);
                    initializationLotsByProduct.set(componentProductId, availableLots);
                }

                for (const lot of availableLots) {
                    if (reservedQuantity >= requiredQuantity - transferredReservationQuantity) break;
                    const lotKey = `${componentProductId}:${lot.inventoryLotId || 0}:${lot.mmLotId || 0}:${String(lot.batchNo || "").trim().toLowerCase()}`;
                    const previouslyAllocated = allocatedStockByLot.get(lotKey) || 0;
                    const availableQuantity = Math.max(0, lot.available - previouslyAllocated);
                    const allocated = Math.min(availableQuantity, requiredQuantity - transferredReservationQuantity - reservedQuantity);
                    if (allocated <= 0) continue;

                    reservedQuantity += allocated;
                    allocatedStockByLot.set(lotKey, previouslyAllocated + allocated);
                    allocations.push({
                        purchase_order_product_id: lot.purchaseOrderReceivingId || 0,
                        mm_lot_id: lot.mmLotId || undefined,
                        inventory_lot_id: lot.inventoryLotId || undefined,
                        batch_no: lot.batchNo,
                        expiry_date: lot.expiryDate || null,
                        allocated
                    });
                }
            }

            const materialResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    job_order_id: joIdInt,
                    product_id: componentProductId,
                    uom_id: uomId || 1,
                    allocated_quantity: requiredQuantity,
                    reserved_quantity: reservedQuantity + transferredReservationQuantity,
                    actual_consumed_quantity: 0,
                    scrap_quantity: 0
                })
            });
            if (!materialResponse.ok) {
                throw new Error(`Failed to create Job Order material worksheet row: ${materialResponse.status} - ${await materialResponse.text()}`);
            }

            const createdMaterial = (await materialResponse.json()).data;
            const joMaterialId = Number(createdMaterial?.jo_material_id || createdMaterial?.id || 0);
            if (!joMaterialId) throw new Error("Job Order material worksheet row was created without an identifier.");

            for (const allocation of allocations) {
                materialReservationSequence += 1;
                const reservationPayload: Record<string, unknown> = {
                    product_id: componentProductId,
                    branch_id: numericBranchId,
                    mm_lot_id: allocation.mm_lot_id || null,
                    inventory_lot_id: allocation.inventory_lot_id || null,
                    batch_no: allocation.batch_no || null,
                    expiry_date: allocation.expiry_date || null,
                    jo_material_id: joMaterialId,
                    reserved_quantity: allocation.allocated,
                    actual_used_quantity: 0,
                    reservation_status: "SOFT",
                    uom_id: uomId || null,
                    source_event_key: `jo:${joIdInt}:reserve:${joMaterialId}:${materialReservationSequence}:${allocation.purchase_order_product_id || 0}:${allocation.mm_lot_id || 0}:${allocation.batch_no || ""}`,
                    created_by: joData.created_by ? Number(joData.created_by) : null
                };
                if (allocation.purchase_order_product_id > 0) {
                    reservationPayload.purchase_order_receiving_id = allocation.purchase_order_product_id;
                }
                const reservationResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(reservationPayload)
                });
                if (!reservationResponse.ok) {
                    throw new Error(`Failed to create Job Order material reservation: ${reservationResponse.status} - ${await reservationResponse.text()}`);
                }
            }

            for (const leftover of reservationsToTransfer) {
                const repointResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${leftover.id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ jo_material_id: joMaterialId })
                });
                if (!repointResponse.ok) {
                    throw new Error(`Failed to transfer predecessor material reservation ${leftover.id}: ${repointResponse.status} - ${await repointResponse.text()}`);
                }
                movedReservationRestorations.push({ id: leftover.id, previousJoMaterialId: leftover.previousJoMaterialId });
            }

            const shortfall = requiredQuantity - reservedQuantity - transferredReservationQuantity;
            if (shouldInitialize && shortfall > QUANTITY_EPSILON) {
                try {
                    const subAssemblyVersionMap = (joData as any).subAssemblyVersionMap || (joData as any).sub_assembly_version_map || {};
                    const selectedVersionId = subAssemblyVersionMap[componentProductId] || subAssemblyVersionMap[String(componentProductId)];
                    const activeVersion = selectedVersionId
                        ? await getBOMDetailsForVersion(componentProductId, Number(selectedVersionId))
                        : await getActiveVersionForProduct(componentProductId);
                    if (!activeVersion?.version) continue;

                    const childJobOrderNo = `${joNoStr}-SUB${componentProductId}`;
                    const childCheckResponse = await fetch(
                        `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${childJobOrderNo}&limit=1`,
                        { headers }
                    );
                    const childExists = childCheckResponse.ok && ((await childCheckResponse.json()).data || []).length > 0;
                    if (childExists) continue;

                    await createJobOrder({
                        jo_id: childJobOrderNo,
                        product_id: componentProductId,
                        quantity: shortfall,
                        due_date: joData.due_date || null,
                        status: JOB_ORDER_STATUS.DRAFT,
                        branch_id: joData.branch_id,
                        created_by: joData.created_by,
                        parent_job_order_id: joIdInt,
                        shift_option: String(resolveProductionShiftHours(joData.shift_option)),
                        remarks: `Auto-spawned sub-assembly run for parent Job Order ${joNoStr}`,
                        bom: { version_id: activeVersion.version.version_id },
                        subAssemblyVersionMap: subAssemblyVersionMap
                    }, []);
                } catch (error) {
                    console.error(`[Sub-Assembly Spawner] Failed to spawn child Job Order for component ${componentProductId}:`, error);
                }
            }
        }

        // Persist the canonical personnel map and project it to every created
        // route after all route IDs are known. The synchronizer is idempotent
        // and never creates a second row for an existing route/operator pair.
        await synchronizeJobOrderOperatorAssignments(
            joIdInt,
            headerPayload.assigned_personnel,
            { persistMaster: false }
        );

        // Calculate and generate daily breakdown runs based on total planned hours and shift option
        const shiftHours = resolveProductionShiftHours(joData.shift_option);
        const numDays = Math.ceil(totalEstimatedHours / shiftHours) || 1;
        const baseQtyPerDay = Math.floor(totalMergedQuantity / numDays);
        const remainder = totalMergedQuantity % numDays;

        const startDateStr = headerPayload.start_date || todayStr;
        const startDateParts = startDateStr.split("-");
        const startYear = parseInt(startDateParts[0], 10);
        const startMonth = parseInt(startDateParts[1], 10) - 1;
        const startDay = parseInt(startDateParts[2], 10);

        const dailyBreakdown = [];
        for (let i = 1; i <= numDays; i++) {
            const currentDate = new Date(startYear, startMonth, startDay + (i - 1));
            const yyyy = currentDate.getFullYear();
            const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
            const dd = String(currentDate.getDate()).padStart(2, "0");
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const dayQty = baseQtyPerDay + (i <= remainder ? 1 : 0);
            dailyBreakdown.push({
                day: i,
                date: dateStr,
                status: "Pending",
                quantity: dayQty
            });
        }

        // Patch daily_breakdown to job order
        try {
            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    daily_breakdown: dailyBreakdown
                })
            });
        } catch (dbErr) {
            console.error("Error updating daily breakdown on Job Order:", dbErr);
        }

        // 5. Insert junction entries only for the detail lines explicitly
        // selected by Planning Engineering. Buffer JOs intentionally have no
        // Sales Order links or lifecycle transition.
        if (salesOrderDetailIds.length > 0 && (initialStatus !== JOB_ORDER_STATUS.DRAFT || schedulingPlan)) {
            const detailIds = schedulingPlan
                ? schedulingPlan.lines.map((line) => line.detailId)
                : [...new Set(salesOrderDetailIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
            const plannedLinesById = new Map(
                (schedulingPlan?.lines || []).map((line) => [line.detailId, line])
            );
            const detailRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${detailIds.join(",")}&fields=detail_id,order_id,ordered_quantity,allocated_quantity,served_quantity&limit=-1`,
                { headers, cache: "no-store" }
            );
            if (!detailRes.ok) {
                throw new Error(`Failed to load selected Sales Order details for allocation: ${detailRes.status}`);
            }
            const details: any[] = (await detailRes.json()).data || [];
            const detailsById = new Map(details.map((detail: any) => [Number(detail.detail_id), detail]));
            const missingDetailIds = detailIds.filter((detailId) => !detailsById.has(detailId));
            if (missingDetailIds.length > 0) {
                throw new Error(`Selected Sales Order details were not found: ${missingDetailIds.join(", ")}`);
            }
            const replacementCreditData = await loadReplacementCreditData(
                readReplacementCreditCollection,
                details,
                readFinishedGoodsReceipts
            );
            const uncreditedDemandByDetail = new Map<number, number>();

            const affectedOrderIds = new Set<number>();
            for (const detailId of detailIds) {
                const detail = detailsById.get(detailId);
                const orderedQuantity = Number(detail.ordered_quantity || 0);
                const allocatedQuantity = Number(detail.allocated_quantity || 0);
                const servedQuantity = Number(detail.served_quantity || 0);
                const plannedQuantity = await readActiveAllocationQuantity(detailId);
                const baseRemainingQuantity = Math.max(
                    0,
                    orderedQuantity - Math.max(allocatedQuantity, servedQuantity) - plannedQuantity
                );
                uncreditedDemandByDetail.set(detailId, baseRemainingQuantity);
                const replacementCreditQuantity = effectiveReplacementCreditQuantity(
                    orderedQuantity,
                    allocatedQuantity,
                    servedQuantity,
                    plannedQuantity,
                    replacementCreditData.byDetail.get(detailId) || 0
                );
                const currentRemainingQuantity = Math.max(0, baseRemainingQuantity - replacementCreditQuantity);
                const plannedLine = plannedLinesById.get(detailId);
                const allocationQuantity = plannedLine?.allocationQuantity ?? currentRemainingQuantity;
                if (allocationQuantity <= 0) {
                    throw new SalesOrderAllocationConflictError(`Sales Order detail ${detailId} has no remaining quantity for the Job Order allocation.`);
                }
                if (plannedLine && allocationQuantity > currentRemainingQuantity + 0.000001) {
                    throw new SalesOrderAllocationConflictError(`Sales Order detail ${detailId} no longer has enough remaining quantity for this Job Order. Refresh the demand list and try again.`);
                }

                await assertFreshAllocationCapacity(detailId, allocationQuantity, undefined, replacementCreditQuantity);

                const allocationResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        job_order_id: joIdInt,
                        sales_order_detail_id: detailId,
                        allocated_quantity: allocationQuantity,
                        reservation_type: "SOFT",
                        created_at: formatPhtDateTime(),
                        created_by: joData.created_by ? Number(joData.created_by) : null
                    })
                });
                if (!allocationResponse.ok) {
                    throw new Error(`Failed to create Sales Order allocation for detail ${detailId}: ${allocationResponse.status}`);
                }
                await assertFreshAllocationCapacity(detailId, allocationQuantity, joIdInt, replacementCreditQuantity);

                const parentOrderId = Number(
                    typeof detail.order_id === "object" ? detail.order_id?.order_id || detail.order_id?.id : detail.order_id
                );
                if (Number.isInteger(parentOrderId) && parentOrderId > 0) {
                    affectedOrderIds.add(parentOrderId);
                    if (!previousParentStatuses.has(parentOrderId)) {
                        const parentResponse = await fetch(
                            `${DIRECTUS_URL}/items/sales_order/${parentOrderId}?fields=order_id,order_status`,
                            { headers, cache: "no-store" }
                        );
                        if (!parentResponse.ok) {
                            throw new Error(`Failed to read Sales Order ${parentOrderId} before status transition: ${parentResponse.status}`);
                        }
                        const parent = (await parentResponse.json()).data;
                        previousParentStatuses.set(parentOrderId, String(parent?.order_status || ""));
                    }
                }
            }

            for (const detailId of detailIds) {
                const sourceAttributions = replacementCreditData.attributions.filter((item) => item.detailId === detailId);
                if (sourceAttributions.length === 0) continue;
                const cappedAttributions = capReplacementCreditsToRemainingDemand(
                    sourceAttributions,
                    detailId,
                    uncreditedDemandByDetail.get(detailId) || 0
                );
                const cappedByPredecessor = new Map(
                    cappedAttributions.map((item) => [item.predecessorJobOrderId, item.creditedQuantity])
                );
                for (const attribution of sourceAttributions) {
                    const creditKey = `${joIdInt}:${attribution.predecessorJobOrderId}:${detailId}`;
                    const response = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_replacement_credits`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            replacement_job_order_id: joIdInt,
                            predecessor_job_order_id: attribution.predecessorJobOrderId,
                            sales_order_detail_id: detailId,
                            credited_quantity: cappedByPredecessor.get(attribution.predecessorJobOrderId) || 0,
                            credit_key: creditKey,
                            created_at: formatPhtDateTime()
                        })
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to record predecessor credit for Job Order ${attribution.predecessorJobOrderNo}: ${response.status}`);
                    }
                    const payload = await response.json().catch(() => null);
                    const creditId = Number(payload?.data?.replacement_credit_id ?? payload?.data?.id ?? 0);
                    if (Number.isSafeInteger(creditId) && creditId > 0) createdReplacementCreditIds.push(creditId);
                }
            }

            // Replacement inheritance (header progress): seed attained output
            // from the written credits. Demand was already netted, so this
            // records progress without double-counting.
            let inheritedCompletedQuantity = 0;
            if (replacementSnapshots.size > 0) {
                const creditRows = await directusGetList(
                    "manufacturing_job_order_replacement_credits",
                    new URLSearchParams({
                        [`filter[replacement_job_order_id][_eq]`]: String(joIdInt),
                        fields: "credited_quantity",
                        limit: "-1"
                    })
                );
                for (const row of creditRows) {
                    inheritedCompletedQuantity += Number(row.credited_quantity ?? 0);
                }
                if (inheritedCompletedQuantity > 0) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            completed_quantity: inheritedCompletedQuantity,
                            actual_quantity_produced: inheritedCompletedQuantity
                        })
                    });
                }
            }

            // A regular JO puts its linked parent orders into production only
            // after every requested allocation has been persisted.
            if (shouldInitialize && !options.deferSalesOrderTransition) {
                await transitionLinkedSalesOrdersToInProduction(affectedOrderIds, previousParentStatuses);
            }
        }

        return { job_order_id: joIdInt, jo_id: joNoStr, status: initialStatus, shortfalls };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create job order:", e);
        if (createdJobOrderNo) {
            try {
                for (const creditId of createdReplacementCreditIds) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_replacement_credits/${creditId}`, {
                        method: "DELETE",
                        headers
                    }).catch(() => {});
                }
                for (const moved of movedReservationRestorations) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${moved.id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ jo_material_id: moved.previousJoMaterialId })
                    }).catch(() => {});
                }
                for (const [parentOrderId, previousStatus] of previousParentStatuses) {
                    if (!previousStatus) continue;
                    await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ order_status: previousStatus })
                    });
                }
                const rolledBack = await deleteJobOrder(createdJobOrderNo);
                if (!rolledBack) {
                    console.error(`[Manufacturing Directus API] Rollback could not remove Job Order ${createdJobOrderNo}; reconciliation is required.`);
                }
            } catch (rollbackError) {
                console.error(`[Manufacturing Directus API] Job Order ${createdJobOrderNo} rollback failed:`, rollbackError);
            }
        }
        throw e;
    }
}

