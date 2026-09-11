/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createJobOrder } from "../planning-helper";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import { fetchMmInventoryMovements, MmInventoryMovementError } from "../../services/mm-inventory-movements.service";
import { getAvailableInventoryLots } from "../helpers/inventory-helper";
import {
    assertJobOrderStatus,
    isCancelledJobOrderStatus,
    isJobOrderStatus,
    isTerminalJobOrderStatus,
    JOB_ORDER_STATUS
} from "@/modules/manufacturing-management/job-order-status";
import { isProductionSchedulingStatus } from "../../sales-order/_status";
import { salesOrderStatusAfterFulfillment } from "../../sales-order/_fulfillment";
import { SalesOrderAllocationConflictError } from "../helpers/create-helper";
import type { SalesOrderSchedulingPlan } from "../helpers/create-helper";

const RELEASE_DRAFT_FETCH_TIMEOUT_MS = 15000;

class PlanningConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PlanningConflictError";
    }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RELEASE_DRAFT_FETCH_TIMEOUT_MS);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error(`Inventory allocation request timed out after ${RELEASE_DRAFT_FETCH_TIMEOUT_MS / 1000} seconds`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function relationId(value: unknown): number {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(relation.detail_id ?? relation.order_id ?? relation.product_id ?? relation.job_order_id ?? relation.bom_version_id ?? relation.version_id ?? relation.id ?? 0);
    }
    return Number(value || 0);
}

function isCancelledStatus(value: unknown): boolean {
    return String(value || "").trim().toLowerCase() === "cancelled";
}

function isOptionalAllocationStatusError(status: number, body: string): boolean {
    return (status === 400 && /unknown field|invalid field|invalid query|does not exist|doesn't exist|field .* not found/i.test(body))
        || (status === 403 && (body.trim().length === 0 || /permission to access field|field .* does not exist|field .* not found/i.test(body)));
}

async function resolveEffectiveBomVersionIds(
    details: any[],
    ordersById: Map<number, any>
): Promise<Map<number, number>> {
    const customerCodes = [...new Set(
        details
            .map((detail) => ordersById.get(relationId(detail.order_id))?.customer_code)
            .map((code) => String(code || "").trim())
            .filter(Boolean)
    )];
    const customerIdsByCode = new Map<string, number>();

    if (customerCodes.length > 0) {
        const customerFilter = encodeURIComponent(JSON.stringify({
            customer_code: { _in: customerCodes }
        }));
        const customerResponse = await fetchWithTimeout(
            `${DIRECTUS_URL}/items/customer?filter=${customerFilter}&fields=id,customer_code&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!customerResponse.ok) {
            throw new Error(`Unable to resolve customer BOM mappings (${customerResponse.status}).`);
        }
        for (const customer of ((await customerResponse.json()).data || []) as any[]) {
            const code = String(customer.customer_code || "").trim();
            const customerId = Number(customer.id ?? customer.customer_id ?? 0);
            if (code && Number.isInteger(customerId) && customerId > 0) {
                customerIdsByCode.set(code, customerId);
            }
        }
    }

    const effectiveVersionIds = new Map<number, number>();
    for (const detail of details) {
        const detailId = relationId(detail.detail_id);
        const storedVersionId = relationId(detail.bom_version_id);
        if (storedVersionId > 0) {
            effectiveVersionIds.set(detailId, storedVersionId);
            continue;
        }

        const parentOrder = ordersById.get(relationId(detail.order_id));
        const customerCode = String(parentOrder?.customer_code || "").trim();
        const customerId = customerIdsByCode.get(customerCode);
        const productId = relationId(detail.product_id);
        const activeVersion = await getActiveVersionForProduct(productId, customerId);
        const versionId = Number(activeVersion.version?.version_id || 0);
        if (Number.isInteger(versionId) && versionId > 0) {
            effectiveVersionIds.set(detailId, versionId);
        }
    }

    return effectiveVersionIds;
}

async function fetchSchedulingAllocations(detailIds: number[]): Promise<any[]> {
    const allocationUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&fields=sales_order_detail_id,job_order_id,allocated_quantity,status&limit=-1`;
    const allocationResponse = await fetchWithTimeout(allocationUrl, { headers, cache: "no-store" });
    if (allocationResponse.ok) return (await allocationResponse.json()).data || [];

    const responseBody = await allocationResponse.text();
    if (!isOptionalAllocationStatusError(allocationResponse.status, responseBody)) {
        throw new Error(`Unable to validate existing Job Order allocations (${allocationResponse.status}).`);
    }

    const legacyResponse = await fetchWithTimeout(
        `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&fields=sales_order_detail_id,job_order_id,allocated_quantity&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!legacyResponse.ok) {
        throw new Error(`Unable to validate existing Job Order allocations (${legacyResponse.status}).`);
    }
    return (await legacyResponse.json()).data || [];
}

async function validateSalesOrderScheduling(jo: Record<string, any>, rawDetailIds: unknown, rawSalesOrderIds: unknown) {
    const jobOrderNo = String(jo.jo_id || "").trim();
    const existingJobOrderResponse = await fetchWithTimeout(
        `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(jobOrderNo)}&fields=job_order_id,job_order_no,status&limit=1`,
        { headers, cache: "no-store" }
    );
    if (!existingJobOrderResponse.ok) {
        throw new Error(`Unable to validate the Job Order number (${existingJobOrderResponse.status}).`);
    }
    if (((await existingJobOrderResponse.json()).data || []).length > 0) {
        throw new PlanningConflictError(`Job Order ${jobOrderNo} already exists. Use a new Job Order number.`);
    }

    const detailIds = Array.isArray(rawDetailIds)
        ? [...new Set(rawDetailIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))]
        : [];
    const suppliedSalesOrderIds = Array.isArray(rawSalesOrderIds)
        ? rawSalesOrderIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
        : [];

    // Buffer JOs are intentionally unlinked. Regular JOs must identify their
    // exact Sales Order detail lines so stale parent-only payloads cannot create
    // allocations for an entire order.
    const isBufferJobOrder = detailIds.length === 0 && suppliedSalesOrderIds.length === 0 && !jo.order_id;
    if (isBufferJobOrder) return { detailIds: [], parentOrderIds: [], schedulingPlan: null };
    if (detailIds.length === 0) {
        throw new PlanningConflictError("Select at least one Sales Order detail line before creating a Job Order.");
    }

    const requestedBranchId = Number(jo.branch_id);
    const requestedProductId = Number(jo.product_id);
    const requestedRecipeVersionId = relationId(jo.bom?.version_id ?? jo.bom_version_id);
    const requestedQuantity = Number(jo.quantity ?? jo.target_quantity);
    if (
        !Number.isInteger(requestedBranchId) || requestedBranchId <= 0
        || !Number.isInteger(requestedProductId) || requestedProductId <= 0
    ) {
        throw new PlanningConflictError("A valid branch and product are required before creating a Job Order.");
    }
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        throw new PlanningConflictError("The Job Order target quantity must be greater than zero.");
    }

    const detailsResponse = await fetchWithTimeout(
        `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${detailIds.join(",")}&fields=detail_id,order_id,product_id,bom_version_id,ordered_quantity,allocated_quantity,served_quantity&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!detailsResponse.ok) {
        throw new Error(`Unable to validate Sales Order details (${detailsResponse.status}).`);
    }
    const details: any[] = (await detailsResponse.json()).data || [];
    const detailsById = new Map(details.map((detail: any) => [Number(detail.detail_id), detail]));
    const missingDetailIds = detailIds.filter((detailId) => !detailsById.has(detailId));
    if (missingDetailIds.length > 0) {
        throw new PlanningConflictError(`Sales Order detail line(s) no longer exist: ${missingDetailIds.join(", ")}. Refresh the demand list and try again.`);
    }

    const selectedProductIds = new Set(details.map((detail: any) => relationId(detail.product_id)));
    if (selectedProductIds.size !== 1 || !selectedProductIds.has(requestedProductId)) {
        throw new PlanningConflictError("A regular Sales Order-linked Job Order must contain exactly one product matching every selected detail line.");
    }

    if (Array.isArray(jo.products) && jo.products.length > 0) {
        const declaredProductIds = jo.products.map((product: any) => relationId(product?.product_id ?? product));
        const declaredProductSet = new Set(declaredProductIds);
        if (
            declaredProductIds.some((productId: number) => !Number.isInteger(productId) || productId <= 0)
            || declaredProductSet.size !== 1
            || !declaredProductSet.has(requestedProductId)
        ) {
            throw new PlanningConflictError("A regular Sales Order-linked Job Order must declare exactly one product matching the selected detail lines.");
        }
    }

    const parentOrderIds: number[] = [...new Set(details.map((detail: any) => relationId(detail.order_id)).filter((id: number) => id > 0))];
    if (parentOrderIds.length === 0) {
        throw new PlanningConflictError("The selected Sales Order details have no valid parent Sales Order.");
    }
    const ordersResponse = await fetchWithTimeout(
        `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${parentOrderIds.join(",")}&fields=order_id,order_status,branch_id,customer_code&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!ordersResponse.ok) {
        throw new Error(`Unable to validate parent Sales Orders (${ordersResponse.status}).`);
    }
    const orders: any[] = (await ordersResponse.json()).data || [];
    const ordersById = new Map(orders.map((order: any) => [Number(order.order_id), order]));
    const effectiveVersionIds = await resolveEffectiveBomVersionIds(details, ordersById);
    const selectedVersionIds = new Set(
        detailIds
            .map((detailId) => effectiveVersionIds.get(detailId) || 0)
            .filter((versionId) => versionId > 0)
    );
    if (selectedVersionIds.size !== 1 || effectiveVersionIds.size !== detailIds.length) {
        throw new PlanningConflictError("Every selected Sales Order detail must resolve to the same active BOM version before consolidation.");
    }
    const effectiveBomVersionId = [...selectedVersionIds][0];
    if (requestedRecipeVersionId > 0 && requestedRecipeVersionId !== effectiveBomVersionId) {
        throw new PlanningConflictError("The submitted BOM version is stale or does not match the selected Sales Order details. Refresh the demand list and try again.");
    }

    const allocations: any[] = await fetchSchedulingAllocations(detailIds);
    const allocatedJobOrderIds = [...new Set(
        allocations
            .filter((allocation: any) => !isCancelledJobOrderStatus(allocation.status))
            .map((allocation: any) => relationId(allocation.job_order_id))
            .filter((id: number) => id > 0)
    )];
    const jobOrdersById = new Map<number, any>();
    if (allocatedJobOrderIds.length > 0) {
        const jobOrdersResponse = await fetchWithTimeout(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_in]=${allocatedJobOrderIds.join(",")}&fields=job_order_id,status&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!jobOrdersResponse.ok) {
            throw new Error(`Unable to validate linked Job Orders (${jobOrdersResponse.status}).`);
        }
        for (const jobOrder of ((await jobOrdersResponse.json()).data || []) as any[]) {
            jobOrdersById.set(Number(jobOrder.job_order_id), jobOrder);
        }
    }

    const plannedQuantityByDetail = new Map<number, number>();
    for (const allocation of allocations) {
        if (isCancelledJobOrderStatus(allocation.status)) continue;
        const jobOrder = jobOrdersById.get(relationId(allocation.job_order_id));
        if (jobOrder && (isCancelledJobOrderStatus(jobOrder.status) || isTerminalJobOrderStatus(jobOrder.status))) continue;
        const detailId = relationId(allocation.sales_order_detail_id);
        const quantity = Number(allocation.allocated_quantity ?? allocation.quantity ?? 0);
        if (!detailId || !Number.isFinite(quantity) || quantity <= 0) continue;
        plannedQuantityByDetail.set(detailId, (plannedQuantityByDetail.get(detailId) || 0) + quantity);
    }

    const availableLines: Array<{
        detailId: number;
        parentOrderId: number;
        availableQuantity: number;
    }> = [];
    const selectedBranchIds = new Set<number>();
    for (const detailId of detailIds) {
        const detail = detailsById.get(detailId);
        const parentOrderId = relationId(detail.order_id);
        const parentOrder = ordersById.get(parentOrderId);
        const ordered = Number(detail.ordered_quantity || 0);
        const allocated = Number(detail.allocated_quantity || 0);
        const served = Number(detail.served_quantity || 0);
        if (!parentOrder || !isProductionSchedulingStatus(parentOrder.order_status)) {
            throw new PlanningConflictError(`Sales Order detail ${detailId} is not eligible: its parent must be For Production or In Production.`);
        }
        if (relationId(parentOrder.branch_id) !== requestedBranchId) {
            throw new PlanningConflictError(`Sales Order detail ${detailId} belongs to a different production branch.`);
        }
        selectedBranchIds.add(relationId(parentOrder.branch_id));
        if (relationId(detail.product_id) !== requestedProductId) {
            throw new PlanningConflictError(`Sales Order detail ${detailId} does not match the Job Order product.`);
        }
        if (effectiveVersionIds.get(detailId) !== effectiveBomVersionId) {
            throw new PlanningConflictError(`Sales Order detail ${detailId} does not match the consolidated BOM version.`);
        }
        const planned = plannedQuantityByDetail.get(detailId) || 0;
        const remainingQuantity = Math.max(0, ordered - Math.max(allocated, served) - planned);
        if (!Number.isFinite(ordered) || ordered <= 0 || !Number.isFinite(allocated) || allocated < 0 || !Number.isFinite(served) || served < 0) {
            throw new PlanningConflictError(`Sales Order detail ${detailId} has invalid quantities.`);
        }
        if (!Number.isFinite(remainingQuantity) || remainingQuantity <= 0) {
            throw new PlanningConflictError(`Sales Order detail ${detailId} has no remaining quantity to schedule.`);
        }
        availableLines.push({ detailId, parentOrderId, availableQuantity: remainingQuantity });
    }

    if (selectedBranchIds.size !== 1) {
        throw new PlanningConflictError("All selected Sales Order details must belong to one production branch.");
    }

    const totalAvailableQuantity = availableLines.reduce((sum, line) => sum + line.availableQuantity, 0);
    if (requestedQuantity > totalAvailableQuantity + 0.000001) {
        throw new PlanningConflictError(
            `The requested Job Order quantity (${requestedQuantity}) exceeds the currently available Sales Order quantity (${totalAvailableQuantity}). Refresh the demand list and try again.`
        );
    }

    let quantityToAllocate = requestedQuantity;
    const schedulingLines: SalesOrderSchedulingPlan["lines"] = [];
    for (const line of availableLines) {
        if (quantityToAllocate <= 0.000001) break;
        const allocationQuantity = Math.min(line.availableQuantity, quantityToAllocate);
        if (allocationQuantity > 0) {
            schedulingLines.push({
                detailId: line.detailId,
                parentOrderId: line.parentOrderId,
                availableQuantity: line.availableQuantity,
                allocationQuantity
            });
            quantityToAllocate -= allocationQuantity;
        }
    }
    if (quantityToAllocate > 0.000001) {
        throw new PlanningConflictError("The requested Job Order quantity could not be allocated across the selected Sales Order details. Refresh the demand list and try again.");
    }

    return {
        detailIds,
        parentOrderIds,
        schedulingPlan: {
            branchId: requestedBranchId,
            productId: requestedProductId,
            bomVersionId: effectiveBomVersionId,
            totalQuantity: requestedQuantity,
            lines: schedulingLines
        } satisfies SalesOrderSchedulingPlan
    };
}


export async function handlePOST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === "release-draft") {
            const { joId } = body;
            if (!joId) {
                return NextResponse.json({ error: "Missing joId parameter" }, { status: 400 });
            }

            // 1. Fetch Job Order Header
            const joRes = await fetchWithTimeout(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}?fields=job_order_id,job_order_no,product_id,version_id,target_quantity,status,branch_id,remarks,created_by`, { headers, cache: "no-store" });
            if (!joRes.ok) {
                return NextResponse.json({ error: `Job Order not found: ${joId}` }, { status: 404 });
            }
            const joData = (await joRes.ok ? (await joRes.json()).data : null);
            if (!joData) {
                return NextResponse.json({ error: `Job Order not found: ${joId}` }, { status: 404 });
            }

            if (!isJobOrderStatus(joData.status, JOB_ORDER_STATUS.DRAFT, JOB_ORDER_STATUS.PLANNED, JOB_ORDER_STATUS.PLANNING)) {
                return NextResponse.json({ error: "Only Draft or Planned Job Orders can be released." }, { status: 400 });
            }

            // 2. Fetch Job Order Materials Worksheet
            const matsRes = await fetchWithTimeout(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${joData.job_order_id}&limit=-1`, { headers, cache: "no-store" });
            const mats = matsRes.ok ? (await matsRes.json()).data || [] : [];

            // 3. For each material in the worksheet, try to reserve any remaining shortfall
            let allRequirementsMet = true;
            const shortfallsList = [];
            const writePromises: Promise<any>[] = [];

            if (!joData.branch_id) {
                return NextResponse.json({ error: "Job Order has no branch assigned" }, { status: 400 });
            }
            const branchId = Number(joData.branch_id);

            const shortfallMats = mats.filter((m: any) => Number(m.allocated_quantity || 0) > Number(m.reserved_quantity || 0));
            const shortfallProductIds = shortfallMats.map((m: any) => Number(m.product_id));

            const productNamesMap = new Map<number, string>();

            if (shortfallProductIds.length > 0) {
                // Fetch product names for shortfall/error reporting
                try {
                    const productsRes = await fetchWithTimeout(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${shortfallProductIds.join(",")}&fields=product_id,product_name&limit=-1`, { headers });
                    if (productsRes.ok) {
                        const prods = (await productsRes.json()).data || [];
                        prods.forEach((p: any) => productNamesMap.set(Number(p.product_id), p.product_name));
                    }
                } catch (err) {
                    console.error("Error fetching product names:", err);
                }
            }

            for (const mat of mats) {
                const compProductId = Number(mat.product_id);
                const allocatedQty = Number(mat.allocated_quantity || 0);
                const reservedQty = Number(mat.reserved_quantity || 0);
                const needed = allocatedQty - reservedQty;

                if (needed <= 0) continue;

                let newlyReservedQty = 0;
                const newAllocations = [];

                const availableLots = await getAvailableInventoryLots(compProductId, branchId);
                for (const lot of availableLots) {
                    if (newlyReservedQty >= needed) break;

                    const currentNeeded = needed - newlyReservedQty;
                    const taken = Math.min(lot.available, currentNeeded);

                    if (taken > 0) {
                        newlyReservedQty += taken;
                        newAllocations.push({
                            purchase_order_receiving_id: lot.purchaseOrderReceivingId || null,
                            mm_lot_id: lot.mmLotId || null,
                            batch_no: lot.batchNo,
                            allocated: taken
                        });
                    }
                }

                // Save new allocations/reservations
                if (newlyReservedQty > 0) {
                    for (const alloc of newAllocations) {
                        const reservationPayload: Record<string, unknown> = {
                            product_id: compProductId,
                            branch_id: branchId,
                            mm_lot_id: alloc.mm_lot_id || null,
                            batch_no: alloc.batch_no || null,
                            jo_material_id: mat.jo_material_id || mat.id,
                            reserved_quantity: alloc.allocated,
                            actual_used_quantity: 0,
                            created_by: joData.created_by ? Number(joData.created_by) : null
                        };
                        if (alloc.purchase_order_receiving_id) {
                            reservationPayload.purchase_order_receiving_id = alloc.purchase_order_receiving_id;
                        }
                        writePromises.push(
                            fetchWithTimeout(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify(reservationPayload)
                            }).catch(err => console.error("Error creating materials reservation row during draft release:", err))
                        );
                    }

                    // Update parent requirements row's reserved_quantity
                    const updatedReservedQty = reservedQty + newlyReservedQty;
                    writePromises.push(
                        fetchWithTimeout(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${mat.jo_material_id || mat.id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ reserved_quantity: updatedReservedQty })
                        }).catch(err => console.error("Failed to update parent reserved quantity:", err))
                    );
                }

                const finalReservedQty = reservedQty + newlyReservedQty;
                if (finalReservedQty < allocatedQty) {
                    allRequirementsMet = false;
                    const prodName = productNamesMap.get(compProductId) || `Product #${compProductId}`;
                    shortfallsList.push({
                        name: prodName,
                        shortage: allocatedQty - finalReservedQty
                    });
                }
            }

            if (writePromises.length > 0) {
                await Promise.all(writePromises);
            }

            if (allRequirementsMet || body.forceRelease === true) {
                // Change status to Released
                const patchRes = await fetchWithTimeout(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joData.job_order_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: JOB_ORDER_STATUS.RELEASED })
                });
                if (patchRes.ok) {
                    return NextResponse.json({ 
                        success: true, 
                        message: allRequirementsMet 
                            ? "Job Order released successfully." 
                            : "Job Order forcibly released with material shortfalls." 
                    });
                } else {
                    return NextResponse.json({ error: "Failed to update Job Order status to Released." }, { status: 500 });
                }
            } else {
                const shortfallMsg = shortfallsList.map(s => `${s.name} (Shortfall: ${s.shortage.toFixed(2)} units)`).join("; ");
                return NextResponse.json({
                    success: false,
                    error: `Still insufficient raw materials to release: ${shortfallMsg}`
                }, { status: 400 });
            }
        }

        if (action === "reserve-lot") {
            const { joId, materialId, productId, receivingId, qty, isSubAssembly } = body;
            if (!joId || !materialId || !productId || !qty) {
                return NextResponse.json({ error: "Missing parameters for reservation." }, { status: 400 });
            }

            if (isSubAssembly) {
                // Update parent requirement row directly
                const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${materialId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ reserved_quantity: Number(qty) })
                });
                if (!matRes.ok) {
                    const errTxt = await matRes.text();
                    return NextResponse.json({ error: `Failed to update sub-assembly reservation: ${errTxt}` }, { status: 500 });
                }
                return NextResponse.json({ success: true, message: "Sub-assembly successfully reserved from manufacturing stock." });
            }

            if (!receivingId) {
                return NextResponse.json({ error: "Missing receivingId for raw material reservation." }, { status: 400 });
            }

            const numericJoId = Number(joId);
            const numericMaterialId = Number(materialId);
            const numericProductId = Number(productId);
            const numericReceivingId = Number(receivingId);
            const requestedQty = Number(qty);

            if (
                !Number.isInteger(numericJoId) || numericJoId <= 0 ||
                !Number.isInteger(numericMaterialId) || numericMaterialId <= 0 ||
                !Number.isInteger(numericProductId) || numericProductId <= 0 ||
                !Number.isInteger(numericReceivingId) || numericReceivingId <= 0 ||
                !Number.isFinite(requestedQty) || requestedQty <= 0
            ) {
                return NextResponse.json({ error: "Invalid reservation parameters." }, { status: 400 });
            }

            const joRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_orders/${numericJoId}?fields=job_order_id,branch_id`,
                { headers, cache: "no-store" }
            );
            if (!joRes.ok) {
                return NextResponse.json({ error: "Job Order not found for reservation." }, { status: 404 });
            }
            const joData = (await joRes.json()).data;
            const joBranchId = Number(joData?.branch_id);
            if (!joData || !Number.isInteger(joBranchId) || joBranchId <= 0) {
                return NextResponse.json({ error: "Job Order has no valid branch assigned." }, { status: 400 });
            }

            const materialRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_materials/${numericMaterialId}?fields=jo_material_id,job_order_id,product_id,reserved_quantity`,
                { headers, cache: "no-store" }
            );
            if (!materialRes.ok) {
                return NextResponse.json({ error: "Job Order material not found for reservation." }, { status: 404 });
            }
            const materialData = (await materialRes.json()).data;
            const materialJoId = Number(materialData?.job_order_id?.job_order_id || materialData?.job_order_id);
            const materialProductId = Number(materialData?.product_id?.product_id || materialData?.product_id);
            if (materialJoId !== numericJoId) {
                return NextResponse.json({ error: "Material does not belong to the selected Job Order." }, { status: 400 });
            }
            if (materialProductId !== numericProductId) {
                return NextResponse.json({ error: "Selected receiving lot does not match the material product." }, { status: 400 });
            }

            const receivingRes = await fetch(
                `${DIRECTUS_URL}/items/purchase_order_receiving/${numericReceivingId}?fields=purchase_order_product_id,product_id,branch_id,batch_no,qa_status,is_reverted,received_quantity`,
                { headers, cache: "no-store" }
            );
            if (!receivingRes.ok) {
                return NextResponse.json({ error: "Receiving lot not found for reservation." }, { status: 404 });
            }
            const receivingData = (await receivingRes.json()).data;
            const receivingProductId = Number(receivingData?.product_id?.product_id || receivingData?.product_id);
            const receivingBranchId = Number(receivingData?.branch_id?.id || receivingData?.branch_id);
            const batchNo = String(receivingData?.batch_no || "").trim();
            const qaStatus = String(receivingData?.qa_status || "").trim().toLowerCase();
            const isReverted = Number(receivingData?.is_reverted || 0) !== 0;

            if (receivingProductId !== materialProductId || receivingProductId !== numericProductId) {
                return NextResponse.json({ error: "Selected receiving lot does not match the material product." }, { status: 400 });
            }
            if (receivingBranchId !== joBranchId) {
                return NextResponse.json({ error: "Selected receiving lot belongs to a different branch." }, { status: 400 });
            }
            if (!batchNo) {
                return NextResponse.json({ error: "Selected receiving lot has no batch number." }, { status: 400 });
            }
            if (isReverted || !["passed", "partially accepted"].includes(qaStatus)) {
                return NextResponse.json({ error: "Only passed receiving lots can be reserved." }, { status: 400 });
            }
            if (Number(receivingData?.received_quantity || 0) <= 0) {
                return NextResponse.json({ error: "Selected receiving lot has no available received quantity." }, { status: 400 });
            }

            // Create reservation entry
            const reservationPayload = {
                product_id: numericProductId,
                branch_id: receivingBranchId,
                batch_no: batchNo,
                jo_material_id: numericMaterialId,
                purchase_order_receiving_id: numericReceivingId,
                reserved_quantity: requestedQty,
                actual_used_quantity: 0
            };

            const reservationUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations`;
            const res = await fetch(reservationUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(reservationPayload)
            });

            if (!res.ok) {
                const errTxt = await res.text();
                return NextResponse.json({ error: `Failed to save materials reservation: ${errTxt}` }, { status: 500 });
            }

            const createdReservation = (await res.json()).data;
            const createdReservationId = Number(createdReservation?.jo_materials_reservation_id || 0);
            const currentReserved = Number(materialData?.reserved_quantity || 0);
            const materialPatchRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${numericMaterialId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ reserved_quantity: currentReserved + requestedQty })
            });
            if (!materialPatchRes.ok) {
                if (createdReservationId > 0) {
                    await fetch(`${reservationUrl}/${createdReservationId}`, { method: "DELETE", headers });
                }
                const errTxt = await materialPatchRes.text();
                return NextResponse.json({ error: `Failed to update material reservation quantity: ${errTxt}` }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                reservationId: createdReservationId || null,
                message: "Material successfully reserved from lot."
            });
        }

        if (action === "unreserve-lot") {
            const { joId, materialId, reservationId, isSubAssembly } = body;
            if (!joId || !materialId) {
                return NextResponse.json({ error: "Missing parameters for unreservation." }, { status: 400 });
            }

            if (isSubAssembly) {
                // Set reserved_quantity to 0 directly
                const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${materialId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ reserved_quantity: 0 })
                });
                if (!matRes.ok) {
                    const errTxt = await matRes.text();
                    return NextResponse.json({ error: `Failed to clear sub-assembly reservation: ${errTxt}` }, { status: 500 });
                }
                return NextResponse.json({ success: true, message: "Sub-assembly reservation successfully cleared." });
            }

            if (!reservationId) {
                return NextResponse.json({ error: "Missing reservationId for raw material unreservation." }, { status: 400 });
            }

            const numericJoId = Number(joId);
            const numericMaterialId = Number(materialId);
            const numericReservationId = Number(reservationId);
            if (
                !Number.isInteger(numericJoId) || numericJoId <= 0 ||
                !Number.isInteger(numericMaterialId) || numericMaterialId <= 0 ||
                !Number.isInteger(numericReservationId) || numericReservationId <= 0
            ) {
                return NextResponse.json({ error: "Invalid unreservation parameters." }, { status: 400 });
            }

            // Fetch the reservation row to get the quantity being unreserved
            const resUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${numericReservationId}`;
            const resRes = await fetch(resUrl, { headers });
            if (!resRes.ok) {
                return NextResponse.json({ error: "Reservation record not found." }, { status: 404 });
            }
            const resData = (await resRes.json()).data;
            const reservationMaterialId = Number(resData?.jo_material_id?.jo_material_id || resData?.jo_material_id);
            if (reservationMaterialId !== numericMaterialId) {
                return NextResponse.json({ error: "Reservation does not belong to the selected material." }, { status: 400 });
            }
            const unreservedQty = Number(resData.reserved_quantity || 0);
            if (!Number.isFinite(unreservedQty) || unreservedQty <= 0) {
                return NextResponse.json({ error: "Reservation has no quantity to release." }, { status: 400 });
            }

            const materialRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_materials/${numericMaterialId}?fields=job_order_id,reserved_quantity`,
                { headers, cache: "no-store" }
            );
            if (!materialRes.ok) {
                return NextResponse.json({ error: "Job Order material not found for unreservation." }, { status: 404 });
            }
            const materialData = (await materialRes.json()).data;
            const materialJoId = Number(materialData?.job_order_id?.job_order_id || materialData?.job_order_id);
            if (materialJoId !== numericJoId) {
                return NextResponse.json({ error: "Material does not belong to the selected Job Order." }, { status: 400 });
            }
            const currentReserved = Number(materialData?.reserved_quantity || 0);
            const newReserved = Math.max(0, currentReserved - unreservedQty);

            // Update the parent requirement first so a failed update leaves the reservation intact.
            const materialPatchRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${numericMaterialId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ reserved_quantity: newReserved })
            });
            if (!materialPatchRes.ok) {
                return NextResponse.json({ error: "Failed to update material reservation quantity." }, { status: 500 });
            }

            // Delete the reservation row
            const delRes = await fetch(resUrl, { method: "DELETE", headers });
            if (!delRes.ok) {
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${numericMaterialId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ reserved_quantity: currentReserved })
                });
                return NextResponse.json({ error: "Failed to delete reservation." }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: "Material successfully unreserved." });
        }

        if (action === "direct-allocate") {
            const { branchId, productId, recipeVersionId, lines } = body;

            if (!branchId || !productId || !recipeVersionId || !lines || !Array.isArray(lines) || lines.length === 0) {
                return NextResponse.json({ error: "Missing required fields (branchId, productId, recipeVersionId, lines)" }, { status: 400 });
            }

            const requestedBranchId = Number(branchId);
            const requestedProductId = Number(productId);
            const requestedRecipeVersionId = Number(recipeVersionId);
            const detailIds = lines.map((line: any) => Number(line.detail_id || line.id));
            if (
                !Number.isSafeInteger(requestedBranchId) || requestedBranchId <= 0
                || !Number.isSafeInteger(requestedProductId) || requestedProductId <= 0
                || !Number.isSafeInteger(requestedRecipeVersionId) || requestedRecipeVersionId <= 0
                || detailIds.some((detailId: number) => !Number.isSafeInteger(detailId) || detailId <= 0)
                || new Set(detailIds).size !== detailIds.length
            ) {
                return NextResponse.json({ error: "Invalid branch, product, recipe version, or Sales Order detail lines." }, { status: 400 });
            }

            const detailsResponse = await fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${detailIds.join(",")}&fields=detail_id,order_id,product_id,bom_version_id,ordered_quantity,allocated_quantity,served_quantity,unit_price&limit=-1`,
                { headers, cache: "no-store" }
            );
            if (!detailsResponse.ok) {
                throw new Error(`Unable to validate Sales Order details (${detailsResponse.status}).`);
            }
            const details: any[] = (await detailsResponse.json()).data || [];
            const detailsById = new Map(details.map((detail: any) => [Number(detail.detail_id), detail]));
            const missingDetailIds = detailIds.filter((detailId: number) => !detailsById.has(detailId));
            if (missingDetailIds.length > 0) {
                return NextResponse.json({ error: `Sales Order detail line(s) no longer exist: ${missingDetailIds.join(", ")}.` }, { status: 409 });
            }

            const selectedProductIds = new Set(details.map((detail: any) => relationId(detail.product_id)));
            if (selectedProductIds.size !== 1 || !selectedProductIds.has(requestedProductId)) {
                return NextResponse.json({ error: "Direct allocation requires one product matching every selected detail line." }, { status: 409 });
            }

            const parentOrderIds = [...new Set(details.map((detail: any) => relationId(detail.order_id)).filter((id: number) => id > 0))];
            if (parentOrderIds.length === 0) {
                return NextResponse.json({ error: "The selected Sales Order details have no valid parent Sales Order." }, { status: 409 });
            }
            const ordersResponse = await fetch(
                `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${parentOrderIds.join(",")}&fields=order_id,order_status,branch_id,customer_code&limit=-1`,
                { headers, cache: "no-store" }
            );
            if (!ordersResponse.ok) {
                throw new Error(`Unable to validate parent Sales Orders (${ordersResponse.status}).`);
            }
            const orders: any[] = (await ordersResponse.json()).data || [];
            const ordersById = new Map(orders.map((order: any) => [Number(order.order_id), order]));
            const effectiveVersionIds = await resolveEffectiveBomVersionIds(details, ordersById);
            const selectedVersionIds = new Set(
                detailIds
                    .map((detailId) => effectiveVersionIds.get(detailId) || 0)
                    .filter((versionId) => versionId > 0)
            );
            if (selectedVersionIds.size !== 1 || effectiveVersionIds.size !== detailIds.length) {
                return NextResponse.json({ error: "Every selected Sales Order detail must resolve to the same active recipe version." }, { status: 409 });
            }
            const effectiveRecipeVersionId = [...selectedVersionIds][0];
            if (effectiveRecipeVersionId !== requestedRecipeVersionId) {
                return NextResponse.json({ error: "The selected recipe version is stale or does not match the Sales Order details." }, { status: 409 });
            }

            for (const detailId of detailIds) {
                const detail = detailsById.get(detailId);
                const parentOrderId = relationId(detail.order_id);
                const parentOrder = ordersById.get(parentOrderId);
                const ordered = Number(detail.ordered_quantity || 0);
                const allocated = Number(detail.allocated_quantity || 0);
                const served = Number(detail.served_quantity || 0);
                if (!parentOrder || !isProductionSchedulingStatus(parentOrder.order_status)) {
                    return NextResponse.json({ error: `Sales Order detail ${detailId} is not eligible: its parent must be For Production or In Production.` }, { status: 409 });
                }
                if (relationId(parentOrder.branch_id) !== requestedBranchId) {
                    return NextResponse.json({ error: `Sales Order detail ${detailId} belongs to a different production branch.` }, { status: 409 });
                }
                if (relationId(detail.product_id) !== requestedProductId) {
                    return NextResponse.json({ error: `Sales Order detail ${detailId} does not match the selected product.` }, { status: 409 });
                }
                if (effectiveVersionIds.get(detailId) !== effectiveRecipeVersionId) {
                    return NextResponse.json({ error: `Sales Order detail ${detailId} does not match the selected recipe version.` }, { status: 409 });
                }
                if (!Number.isFinite(ordered) || ordered <= 0 || !Number.isFinite(allocated) || !Number.isFinite(served) || allocated >= ordered || served >= ordered) {
                    return NextResponse.json({ error: `Sales Order detail ${detailId} is already fulfilled or has invalid quantities.` }, { status: 409 });
                }
            }

            const existingAllocations = await fetchSchedulingAllocations(detailIds);
            const linkedJobOrderIds = [...new Set(
                existingAllocations
                    .filter((allocation: any) => !isCancelledStatus(allocation.status))
                    .map((allocation: any) => relationId(allocation.job_order_id))
                    .filter((id: number) => id > 0)
            )];
            const linkedJobOrders = linkedJobOrderIds.length > 0
                ? await (async () => {
                    const response = await fetch(
                        `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_in]=${linkedJobOrderIds.join(",")}&fields=job_order_id,status&limit=-1`,
                        { headers, cache: "no-store" }
                    );
                    if (!response.ok) throw new Error(`Unable to validate linked Job Orders (${response.status}).`);
                    return (await response.json()).data || [];
                })()
                : [];
            const terminalJobOrderIds = new Set(
                linkedJobOrders
                    .filter((jobOrder: any) => isCancelledJobOrderStatus(jobOrder.status) || isTerminalJobOrderStatus(jobOrder.status))
                    .map((jobOrder: any) => relationId(jobOrder.job_order_id))
            );
            const activeAllocatedDetailIds = new Set(
                existingAllocations
                    .filter((allocation: any) => !isCancelledJobOrderStatus(allocation.status) && !terminalJobOrderIds.has(relationId(allocation.job_order_id)))
                    .map((allocation: any) => relationId(allocation.sales_order_detail_id))
            );
            const duplicateDetailIds = detailIds.filter((detailId: number) => activeAllocatedDetailIds.has(detailId));
            if (duplicateDetailIds.length > 0) {
                return NextResponse.json({ error: `Sales Order detail line(s) are already linked to an active Job Order: ${duplicateDetailIds.join(", ")}.` }, { status: 409 });
            }

            const allocationLines = details.map((detail: any) => ({
                detail_id: Number(detail.detail_id),
                remaining_quantity: Math.max(
                    0,
                    Number(detail.ordered_quantity || 0) - Math.max(
                        Number(detail.allocated_quantity || 0),
                        Number(detail.served_quantity || 0)
                    )
                )
            }));

            // Fetch inventory movements to calculate the true ledger stock
            const movements = await fetchMmInventoryMovements({
                branch: requestedBranchId,
                product: requestedProductId
            });
            const movementStockMap = new Map<string, number>();
            movements.forEach((mov: any) => {
                const batchNo = mov.batch_no || "LOT-N/A";
                const qty = Number(mov.quantity || 0);
                movementStockMap.set(batchNo, (movementStockMap.get(batchNo) || 0) + qty);
            });

            // Fetch QA status and Expiry from PO Receiving and Job Order Yield logs
            // 1. PO Receivings
            const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${Number(productId)}&filter[branch_id][_eq]=${Number(branchId)}&limit=-1`, { headers, cache: "no-store" });
            const receipts = recRes.ok ? (await recRes.json()).data || [] : [];
            const batchStatusMap = new Map<string, string>();
            const batchExpiryMap = new Map<string, string>();
            const batchCreatedMap = new Map<string, string>();
            
            receipts.forEach((rec: any) => {
                const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim() || "LOT-N/A";
                batchStatusMap.set(batchNo, rec.qa_status || "Passed");
                if (rec.expiry_date) batchExpiryMap.set(batchNo, rec.expiry_date);
                if (rec.received_date || rec.created_on) batchCreatedMap.set(batchNo, rec.received_date || rec.created_on);
            });

            // 2. Yield Ledger
            const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${Number(productId)}&fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
            const yields = yieldRes.ok ? (await yieldRes.json()).data || [] : [];
            yields.forEach((yl: any) => {
                const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
                batchStatusMap.set(batchNo, yl.qa_status || "Pending");
                if (yl.expiry_date) batchExpiryMap.set(batchNo, yl.expiry_date);
                if (yl.logged_at || yl.created_on) batchCreatedMap.set(batchNo, yl.logged_at || yl.created_on);
            });

            // Map and enrich with correct ledger quantity, filter for Passed qa_status and quantity > 0
            const lotsEnriched: any[] = [];
            movementStockMap.forEach((qty, lotNum) => {
                if (qty > 0) {
                    const status = batchStatusMap.get(lotNum) || "Passed";
                    if (status === "Passed" || status === "Partially Accepted") {
                        const matchedYield = yields.find((yl: any) => String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() === lotNum);
                        const source_type = matchedYield ? "manufacturing" : "procurement";
                        const source_reference = matchedYield ? (matchedYield.job_order_id?.job_order_no || `MFG-${matchedYield.job_order_id?.job_order_no}`) : "";
                        lotsEnriched.push({
                            lot_number: lotNum,
                            quantity: qty,
                            source_type,
                            source_reference,
                            expiry_date: batchExpiryMap.get(lotNum) || null,
                            created_on: batchCreatedMap.get(lotNum) || null
                        });
                    }
                }
            });

            // 2. Trace lot's recipe version
            const mfgLots = lotsEnriched.filter((lot: any) => lot.source_type === "manufacturing" && lot.source_reference);
            const joNos = Array.from(new Set(mfgLots.map((lot: any) => lot.source_reference)));
            const joMap = new Map<string, number>();

            if (joNos.length > 0) {
                const joFilter = encodeURIComponent(JSON.stringify({
                    job_order_no: { _in: joNos }
                }));
                const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${joFilter}&fields=job_order_no,version_id&limit=-1`, { headers, cache: "no-store" });
                if (joRes.ok) {
                    const jos = (await joRes.json()).data || [];
                    jos.forEach((jo: any) => {
                        if (jo.job_order_no && jo.version_id) {
                            joMap.set(jo.job_order_no, Number(jo.version_id));
                        }
                    });
                }
            }

            // Get product's active standard version
            const { version: activeVersion } = await getActiveVersionForProduct(Number(productId));
            const activeVersionId = activeVersion ? Number(activeVersion.version_id) : null;

            // Filter candidate lots matching target recipeVersionId
            const matchingLots = lotsEnriched.filter((lot: any) => {
                const resolvedVersionId = lot.source_type === "manufacturing" && lot.source_reference
                    ? (joMap.get(lot.source_reference) || activeVersionId)
                    : activeVersionId;
                return resolvedVersionId === Number(recipeVersionId);
            });

            // FIFO sorting
            matchingLots.sort((a: any, b: any) => {
                if (a.expiry_date && b.expiry_date) {
                    const timeDiff = new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
                    if (timeDiff !== 0) return timeDiff;
                } else if (a.expiry_date) {
                    return -1;
                } else if (b.expiry_date) {
                    return 1;
                }
                const dateA = a.created_on ? new Date(a.created_on).getTime() : 0;
                const dateB = b.created_on ? new Date(b.created_on).getTime() : 0;
                if (dateA !== dateB) return dateA - dateB;
                return Number(a.id) - Number(b.id);
            });

            const totalRequested = allocationLines.reduce((sum: number, line: any) => sum + Number(line.remaining_quantity || 0), 0);
            const totalAvailable = matchingLots.reduce((sum: number, lot: any) => sum + Number(lot.quantity || 0), 0);

            if (totalAvailable < totalRequested) {
                return NextResponse.json({
                    error: `Insufficient stock of the correct recipe version. Available: ${totalAvailable}, Requested: ${totalRequested}`
                }, { status: 400 });
            }

            // We do NOT deduct the lots from inventory_lots, product_ledger, or inventory_movements.
            // We just record the allocation logically on the Sales Order detail lines.
            const parentOrderIdsToUpdate = new Set<number>();
            const resultingOrderStatuses: Record<string, string> = {};

            for (const line of allocationLines) {
                const detailId = Number(line.detail_id);
                const detailRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, { headers, cache: "no-store" });
                if (!detailRes.ok) throw new Error(`Unable to reload Sales Order detail ${detailId} (${detailRes.status}).`);
                const detailData = (await detailRes.json()).data;
                if (!detailData) throw new Error(`Sales Order detail ${detailId} was not returned by Directus.`);

                const orderedQty = Number(detailData.ordered_quantity || 0);
                const currentAllocated = Number(detailData.allocated_quantity || 0);
                const currentServed = Number(detailData.served_quantity || 0);
                const unitPrice = Number(detailData.unit_price || 0);
                const plannedLine = allocationLines.find((line: any) => Number(line.detail_id) === detailId);
                const currentRemaining = Math.max(0, orderedQty - Math.max(currentAllocated, currentServed));
                if (!plannedLine || Math.abs(currentRemaining - Number(plannedLine.remaining_quantity)) > 0.000001) {
                    throw new Error(`Sales Order detail ${detailId} changed while allocation was being prepared. Refresh the demand list and try again.`);
                }
                const nextAllocatedQuantity = Math.min(
                    orderedQty,
                    Math.max(currentAllocated, currentServed) + Number(plannedLine.remaining_quantity)
                );

                // Update detail
                const patchDetailRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        allocated_quantity: nextAllocatedQuantity,
                        allocated_amount: nextAllocatedQuantity * unitPrice
                    })
                });
                if (!patchDetailRes.ok) {
                    throw new Error(`Failed to update Sales Order detail ${detailId} (${patchDetailRes.status}).`);
                }

                const parentOrderId = relationId(detailData.order_id);
                if (parentOrderId) {
                    parentOrderIdsToUpdate.add(parentOrderId);
                }
            }

            // Check and update affected parent orders status
            for (const parentOrderId of parentOrderIdsToUpdate) {
                const allDetailsRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${parentOrderId}&fields=detail_id,ordered_quantity,allocated_quantity,served_quantity&limit=-1`,
                    { headers, cache: "no-store" }
                );
                if (!allDetailsRes.ok) throw new Error(`Unable to verify Sales Order ${parentOrderId} detail fulfillment (${allDetailsRes.status}).`);
                const allDetails = (await allDetailsRes.json()).data || [];
                const parentOrderRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order/${parentOrderId}?fields=order_id,order_status`,
                    { headers, cache: "no-store" }
                );
                if (!parentOrderRes.ok) {
                    throw new Error(`Unable to read Sales Order ${parentOrderId} status (${parentOrderRes.status}).`);
                }
                const parentOrder = (await parentOrderRes.json()).data;
                const currentStatus = String(parentOrder?.order_status || "").trim();
                const nextStatus = salesOrderStatusAfterFulfillment(allDetails);
                if (isProductionSchedulingStatus(currentStatus) && nextStatus !== currentStatus) {
                    console.log(`[BFF Direct Allocate] Transitioning SO ${parentOrderId} to status: ${nextStatus}`);
                    const updateStatusRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ order_status: nextStatus })
                    });
                    if (!updateStatusRes.ok) {
                        throw new Error(`Failed to update parent Sales Order ${parentOrderId} status to ${nextStatus} (${updateStatusRes.status}).`);
                    }
                }
                resultingOrderStatuses[String(parentOrderId)] = isProductionSchedulingStatus(currentStatus)
                    ? nextStatus
                    : currentStatus;
            }

            return NextResponse.json({
                success: true,
                message: "Sales order allocation marked successfully.",
                orderStatus: resultingOrderStatuses
            });
        }

        const { jo, salesOrderIds, salesOrderDetailIds } = body;

        if (!jo || !jo.jo_id) {
            return NextResponse.json({ error: "Missing job order configuration" }, { status: 400 });
        }

        const schedulingValidation = await validateSalesOrderScheduling(jo, salesOrderDetailIds, salesOrderIds);
        const effectiveSalesOrderIds = schedulingValidation.parentOrderIds;

        // Get logged in user ID from secure access token cookie
        let encoderId: number | null = null;
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get("vos_access_token")?.value;
            if (token) {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    const base64Url = parts[1];
                    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                    while (base64.length % 4) base64 += "=";
                    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                    const payload = JSON.parse(jsonPayload);
                    const rawId = payload?.id || payload?.user_id || payload?.sub;
                    if (rawId) {
                        const parsed = Number(rawId);
                        if (!isNaN(parsed)) {
                            encoderId = parsed;
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Error decoding user token in JO creation:", err);
        }

        // Map camelCase from frontend to snake_case for Directus database
        const schedulingPlan = schedulingValidation.schedulingPlan;
        const dbPayload = {
            jo_id: jo.jo_id,
            order_id: jo.order_id || null,
            order_no: jo.order_no || null,
            product_id: schedulingPlan?.productId ?? jo.product_id,
            product_name: jo.product_name,
            quantity: schedulingPlan?.totalQuantity ?? jo.quantity,
            due_date: jo.due_date,
            status: assertJobOrderStatus(jo.status || JOB_ORDER_STATUS.DRAFT),
            is_batched: !!jo.is_batched,
            bom: schedulingPlan
                ? { version_id: schedulingPlan.bomVersionId }
                : (jo.bom || null),
            components: jo.components || null,
            routings: jo.routings || null,
            allocation_results: jo.allocationResults || null,
            procurement_status: jo.procurementStatus || "Idle",
            branch_id: jo.branch_id || null,
            shift_option: jo.shiftOption || "8",
            daily_breakdown: jo.dailyBreakdown || null,
            remarks: jo.remarks || null,
            created_at: await getISOStringInConfiguredTimezone(),
            created_by: encoderId,
            parent_job_order_id: jo.parentJobOrderId || jo.parent_job_order_id || null,
            sub_assembly_version_map: jo.subAssemblyVersionMap || jo.sub_assembly_version_map || null,
            assignments: jo.assignments || null,
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
            products: schedulingPlan
                ? [{
                    product_id: schedulingPlan.productId,
                    product_name: jo.product_name,
                    quantity: schedulingPlan.totalQuantity,
                    bom: { version_id: schedulingPlan.bomVersionId },
                    components: jo.components || null,
                    routings: jo.routings || null,
                    allocation_results: jo.allocationResults || null
                }]
                : (jo.products ? jo.products.map((p: any) => ({
                    product_id: p.product_id,
                    product_name: p.product_name,
                    quantity: p.quantity,
                    bom: p.bom || null,
                    components: p.components || null,
                    routings: p.routings || null,
                    allocation_results: p.allocationResults || null
                })) : null)
        };

        const result = await createJobOrder(dbPayload, effectiveSalesOrderIds, schedulingValidation.detailIds, schedulingPlan);
        return NextResponse.json({ success: true, data: result });
    } catch (e) {
        console.error("API Error in planning-engineering POST:", e);
        if (e instanceof PlanningConflictError || e instanceof SalesOrderAllocationConflictError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to create Job Order" },
            { status: e instanceof MmInventoryMovementError ? e.status : 500 }
        );
    }
}

