/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers, formatPhtDateTime, getTodayDateString, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import { fetchMmInventoryMovements, MmInventoryMovementError } from "../../services/mm-inventory-movements.service";
import {
    loadEligibleFinishedGoodsLot,
    resolveOrCreateMmInventoryLot,
    MmInventoryLotRecord,
    MmInventoryLotWritePayload,
    MmLotError
} from "../../services/mm-lots.service";
import { salesOrderStatusAfterFulfillment } from "../../sales-order/_fulfillment";
import {
    isCancelledJobOrderStatus,
    isJobOrderStatus,
    JOB_ORDER_STATUS,
    normalizeJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import { isProductionSchedulingStatus } from "../../sales-order/_status";

// Helper to decode user ID from session cookie
async function getUserIdFromSession(): Promise<number> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                const tokenPayload = JSON.parse(jsonPayload);
                const id = tokenPayload?.id || tokenPayload?.user_id || tokenPayload?.sub;
                if (id && !isNaN(Number(id))) return Number(id);
            }
        }
    } catch (err) {
        console.error("Error decoding session in shift run log:", err);
    }
    return 24;
}

class DirectusPersistenceError extends Error {
    readonly status = 502;

    constructor(message: string) {
        super(message);
        this.name = "DirectusPersistenceError";
    }
}

function numericRelationId(value: unknown): number {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(
            relation.mm_lot_id
            ?? relation.inventory_lot_id
            ?? relation.product_id
            ?? relation.jo_material_id
            ?? relation.id
            ?? 0
        );
    }
    return Number(value ?? 0);
}

async function requireDirectusData<T = any>(response: Response, label: string): Promise<T> {
    const responseText = await response.text();
    let payload: any = null;

    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new DirectusPersistenceError(`${label} failed with HTTP ${response.status}: ${responseText || "No response body"}`);
    }

    if (!payload || payload.data === undefined || payload.data === null) {
        throw new DirectusPersistenceError(`${label} returned no data from Directus.`);
    }

    return payload.data as T;
}

async function directusRequest<T = any>(url: string, label: string, init: RequestInit = {}): Promise<T> {
    try {
        const response = await fetch(url, {
            headers,
            cache: "no-store",
            ...init
        });
        return await requireDirectusData<T>(response, label);
    } catch (error) {
        if (error instanceof DirectusPersistenceError) throw error;
        throw new DirectusPersistenceError(`${label} failed: ${(error as Error).message || "Directus request failed"}`);
    }
}

async function directusRows<T = any>(url: string, label: string): Promise<T[]> {
    const data = await directusRequest<unknown>(url, label);
    if (!Array.isArray(data)) {
        throw new DirectusPersistenceError(`${label} returned an invalid collection response.`);
    }
    return data as T[];
}

function normalizeGenealogyRecord(row: any): any {
    return {
        ...row,
        genealogy_id: row.genealogy_id ?? row.id,
        finished_batch_no: row.batch_no ?? row.finished_batch_no,
        raw_product_id: row.component_product_id ?? row.raw_product_id,
        component_mm_lot_id: row.component_mm_lot_id ?? null,
        raw_lot_id: row.component_mm_lot_id ?? row.component_lot_id ?? row.raw_lot_id,
        raw_batch_no: row.component_batch_no ?? row.raw_batch_no,
        quantity_consumed: row.consumed_quantity ?? row.quantity_consumed,
        created_by: row.created_by ?? null
    };
}

async function requireDirectusWriteData(response: Response, label: string): Promise<any> {
    return requireDirectusData(response, label);
}

async function reconcileSalesOrderFulfillment(
    jobOrderId: number,
    quantityProduced: number,
    targetQuantity: number,
    isRetryRun: boolean
): Promise<void> {
    if (isRetryRun || quantityProduced <= 0 || targetQuantity <= 0) return;

    let allocations: any[];
    try {
        allocations = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrderId))}&fields=sales_order_detail_id,allocated_quantity,status&limit=-1`,
            `Sales-order allocation lookup for Job Order ${jobOrderId}`
        );
    } catch (error) {
        if (!(error instanceof DirectusPersistenceError) || !/HTTP (400|403)/.test(error.message)) throw error;
        allocations = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrderId))}&fields=sales_order_detail_id,allocated_quantity&limit=-1`,
            `Sales-order allocation lookup for Job Order ${jobOrderId}`
        );
    }

    const parentOrderIds = new Set<number>();
    const proportionalFactor = quantityProduced / targetQuantity;
    for (const allocation of allocations) {
        if (isCancelledJobOrderStatus(allocation.status)) continue;

        const detailId = Number(
            typeof allocation.sales_order_detail_id === "object"
                ? allocation.sales_order_detail_id?.detail_id ?? allocation.sales_order_detail_id?.id
                : allocation.sales_order_detail_id
        );
        const allocatedQuantity = Number(allocation.allocated_quantity || 0);
        if (!Number.isSafeInteger(detailId) || detailId <= 0 || !Number.isFinite(allocatedQuantity) || allocatedQuantity <= 0) continue;

        const detail = await directusRequest<any>(
            `${DIRECTUS_URL}/items/sales_order_details/${encodeURIComponent(String(detailId))}`,
            `Sales-order detail lookup for allocation ${detailId}`
        );
        const orderedQuantity = Number(detail.ordered_quantity ?? detail.quantity ?? 0);
        const currentAllocated = Number(detail.allocated_quantity || 0);
        if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0 || !Number.isFinite(currentAllocated)) continue;

        const fulfillmentIncrement = allocatedQuantity * proportionalFactor;
        const nextAllocated = Math.min(orderedQuantity, currentAllocated + fulfillmentIncrement);
        const unitPrice = Number(detail.unit_price || 0);
        await directusRequest(
            `${DIRECTUS_URL}/items/sales_order_details/${encodeURIComponent(String(detailId))}`,
            `Update sales-order fulfillment for detail ${detailId}`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    allocated_quantity: nextAllocated,
                    allocated_amount: nextAllocated * (Number.isFinite(unitPrice) ? unitPrice : 0)
                })
            }
        );

        const parentOrderId = Number(
            typeof detail.order_id === "object"
                ? detail.order_id?.order_id ?? detail.order_id?.id
                : detail.order_id
        );
        if (Number.isSafeInteger(parentOrderId) && parentOrderId > 0) parentOrderIds.add(parentOrderId);
    }

    for (const parentOrderId of parentOrderIds) {
        const parentOrder = await directusRequest<any>(
            `${DIRECTUS_URL}/items/sales_order/${encodeURIComponent(String(parentOrderId))}?fields=order_id,order_status`,
            `Sales-order status lookup for ${parentOrderId}`
        );
        const currentStatus = String(parentOrder.order_status || "").trim();
        const details = await directusRows<any>(
            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${encodeURIComponent(String(parentOrderId))}&fields=detail_id,ordered_quantity,allocated_quantity,served_quantity&limit=-1`,
            `Sales-order fulfillment verification for ${parentOrderId}`
        );
        const nextStatus = salesOrderStatusAfterFulfillment(details);
        if (!isProductionSchedulingStatus(currentStatus) || nextStatus === currentStatus) continue;
        await directusRequest(
            `${DIRECTUS_URL}/items/sales_order/${encodeURIComponent(String(parentOrderId))}`,
            `Update Sales Order ${parentOrderId} fulfillment status`,
            {
                method: "PATCH",
                body: JSON.stringify({ order_status: nextStatus })
            }
        );
    }
}

// GET handler: Fetches yield ledger logs, rejection reasons, or status history
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get("taskId");
        const joId = searchParams.get("joId");
        const action = searchParams.get("action");

        // 1. Fetch rejection reasons list
        if (action === "rejection-reasons") {
            try {
                const res = await fetch(`${DIRECTUS_URL}/items/qa_rejection_reasons?filter[is_active][_neq]=0&limit=-1&sort=reason_name`, { headers, cache: "no-store" });
                if (res.ok) {
                    const json = await res.json();
                    return NextResponse.json({ success: true, data: json.data || [] });
                }
            } catch (err) {
                console.warn("Directus fetch for qa_rejection_reasons failed, using fallback list:", err);
            }

            // Fallback standard rejection reasons
            const fallbackReasons = [
                { id: 1, reason_id: 1, code: "DEF-DIM", reason_name: "Dimensional Variance / Out of Tolerance", category: "Dimensional", is_active: true },
                { id: 2, reason_id: 2, code: "DEF-SURF", reason_name: "Surface Flaw / Scratch / Dent", category: "Cosmetic", is_active: true },
                { id: 3, reason_id: 3, code: "DEF-CONT", reason_name: "Foreign Material Contamination", category: "Quality", is_active: true },
                { id: 4, reason_id: 4, code: "DEF-SEAL", reason_name: "Improper Sealing / Packaging Defect", category: "Packaging", is_active: true },
                { id: 5, reason_id: 5, code: "DEF-CHEM", reason_name: "Chemical / Viscosity Specification Failure", category: "Chemical", is_active: true },
                { id: 6, reason_id: 6, code: "DEF-MACH", reason_name: "Machine Jam / Processing Scrap", category: "Process", is_active: true },
                { id: 7, reason_id: 7, code: "DEF-SETUP", reason_name: "Line Setup / Calibration Waste", category: "Setup", is_active: true },
                { id: 8, reason_id: 8, code: "DEF-EXP", reason_name: "Material Expired in Staging", category: "Material", is_active: true }
            ];
            return NextResponse.json({ success: true, data: fallbackReasons });
        }

        // 2. Fetch yield ledger logs
        let url = `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&sort=-logged_at`;
        if (joId) {
            url += `&filter[job_order_id][_eq]=${joId}`;
        }

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to fetch yield ledger from database");
        }
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("Error fetching yield ledger:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch ledger logs" }, { status: 500 });
    }
}

// POST handler: Logs the shift yield, consumes hard-staged reservations, records genealogy, and updates Job Order status.
export async function POST(request: Request) {
    try {
        const todayStr = await getTodayDateString();
        const manilaTimestamp = await getISOStringInConfiguredTimezone();
        const phtMovementTimestamp = formatPhtDateTime();
        const sessionUserId = await getUserIdFromSession();

        const body = await request.json();
        const { 
            taskId, 
            joId, 
            shiftName, 
            yieldQty, 
            scrapQty = 0,
            rejectionReasonId,
            rejectionRemarks,
            inspectorId, 
            qaStatus = "Pending", 
            qaParameters, 
            materialsConsumed,
            batchNo,
            expiryDate,
            manufacturingDate,
            targetLotId
        } = body;

        if (!taskId || !joId || !shiftName || yieldQty === undefined) {
            return NextResponse.json({ error: "Missing required fields: taskId, joId, shiftName, yieldQty" }, { status: 400 });
        }

        const goodYield = Number(yieldQty || 0);
        const scrapUnits = Number(scrapQty || 0);
        const effectiveEncoderId = inspectorId ? Number(inspectorId) : sessionUserId;

        // 1. Fetch Job Order Details
        const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}`, { headers, cache: "no-store" });
        if (!joRes.ok) {
            throw new Error(`Failed to load job order with ID: ${joId}`);
        }
        const joData = (await joRes.json()).data;
        const canonicalJoStatus = normalizeJobOrderStatus(joData.status || JOB_ORDER_STATUS.DRAFT);
        if (!canonicalJoStatus) {
            return NextResponse.json({ error: `Job Order ${joId} has an unknown status and cannot accept a shift run.` }, { status: 409 });
        }
        if (isCancelledJobOrderStatus(canonicalJoStatus)) {
            return NextResponse.json({ error: `Job Order ${joId} is cancelled and cannot accept a shift run.` }, { status: 409 });
        }
        const producedProductId = Number(joData.product_id);
        if (!joData.branch_id) {
            return NextResponse.json({ error: `Job Order with ID ${joId} has no branch_id` }, { status: 400 });
        }
        const branchId = Number(joData.branch_id);
        const jobOrderNo = joData.job_order_no || `JO-${joId}`;
        const targetQuantity = Number(joData.target_quantity ?? joData.quantity ?? 0);
        const currentRejectedQty = Number(joData.rejected_quantity || 0);
        const requestedBatchNo = typeof batchNo === "string" ? batchNo.trim() : "";
        if (goodYield > 0 && !requestedBatchNo) {
            return NextResponse.json({
                success: false,
                error: "Enter a batch number for the finished-goods output.",
                code: "SHIFT_RUN_BATCH_REQUIRED"
            }, { status: 422 });
        }
        const finalBatchNo = requestedBatchNo || `${jobOrderNo}-YLD-${todayStr.replace(/-/g, "")}`;

        // Positive output must reuse an existing storage lot owned by the Job
        // Order branch with the finished good's UOM. No master lot is created.
        const requestedTargetLotId = Number(targetLotId ?? 0);
        if (goodYield > 0 && (!Number.isSafeInteger(requestedTargetLotId) || requestedTargetLotId <= 0)) {
            return NextResponse.json({
                success: false,
                error: "Select an existing storage lot for the finished-goods output.",
                code: "SHIFT_RUN_LOT_REQUIRED"
            }, { status: 422 });
        }
        let resolvedOutputLotId: number | null = null;
        if (goodYield > 0) {
            try {
                const eligibleLot = await loadEligibleFinishedGoodsLot({
                    mmLotId: requestedTargetLotId,
                    branchId,
                    productId: producedProductId
                });
                resolvedOutputLotId = Number(eligibleLot.lot_id);
            } catch (error) {
                if (error instanceof MmLotError) {
                    return NextResponse.json({
                        success: false,
                        error: error.message,
                        code: error.code
                    }, { status: error.status });
                }
                throw error;
            }
        }

        // Fetch all existing yield logs for this Job Order to compute accumulated yield
        const existingYieldRows = await directusRows<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${encodeURIComponent(String(joId))}&limit=-1`,
            `Existing yield ledger lookup for Job Order ${joId}`
        );
        const existingRun = existingYieldRows.find((log: any) => String(log.lot_number || "").trim() === finalBatchNo);
        const isRetryRun = Boolean(existingRun);

        if (existingRun) {
            const sameRun = String(existingRun.shift_name || "") === String(shiftName)
                && Math.abs(Number(existingRun.yield_quantity || 0) - goodYield) < 0.000001
                && Math.abs(Number(existingRun.scrap_quantity || 0) - scrapUnits) < 0.000001;

            if (!sameRun) {
                return NextResponse.json({
                    error: `Batch ${finalBatchNo} is already recorded for this Job Order with a different shift payload.`
                }, { status: 409 });
            }
        }

        const accumulatedYield = existingYieldRows.reduce((sum: number, log: any) => sum + Number(log.yield_quantity || 0), 0);

        if (!isRetryRun && accumulatedYield + goodYield > targetQuantity * 1.05) {
            return NextResponse.json({ 
                error: `Accumulated yield would exceed target by more than allowable tolerance! Already yielded: ${accumulatedYield.toLocaleString()} units. New yield: ${goodYield.toLocaleString()} units. Target: ${targetQuantity.toLocaleString()} units.` 
            }, { status: 400 });
        }

        // 2. Hard-staged reservations are the only valid raw-material source
        // for execution. This prerequisite runs before yield/QA writes so a
        // missing or short staging allocation cannot produce a partial run.
        if (!isRetryRun) {
            const requiredMaterialRows = await directusRows<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${encodeURIComponent(String(joId))}&limit=-1`,
                `Required staged materials lookup for Job Order ${joId}`
            );
            const consumedItems = Array.isArray(materialsConsumed) ? materialsConsumed : [];
            for (const materialRow of requiredMaterialRows) {
                const materialId = numericRelationId(materialRow.jo_material_id || materialRow.id || 0);
                const requiredQuantity = Number(materialRow.allocated_quantity || 0);
                if (materialId <= 0 || requiredQuantity <= 0) continue;

                const materialProductId = numericRelationId(materialRow.product_id);
                const matchingConsumedItems = consumedItems.filter((item: any) => numericRelationId(item.product_id) === materialProductId);
                const consumedQuantity = matchingConsumedItems.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.actual_qty || 0)), 0);
                if (consumedQuantity <= 0) {
                    return NextResponse.json({
                        success: false,
                        error: `Material ${materialRow.product_id} has not been supplied for this run. Select the hard-staged reservation before recording production.`,
                        code: "SHIFT_RUN_STAGING_REQUIRED",
                        jo_material_id: materialId
                    }, { status: 422 });
                }

                const reservationRows = await directusRows<any>(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_eq]=${encodeURIComponent(String(materialId))}&limit=-1`,
                    `Hard-staged reservation lookup for material ${materialId}`
                );
                const validReservations = reservationRows.filter((reservation: any) =>
                    numericRelationId(reservation.product_id) === materialProductId
                    && numericRelationId(reservation.branch_id) === branchId
                    && numericRelationId(reservation.mm_lot_id) > 0
                    && numericRelationId(reservation.inventory_lot_id) > 0
                    && String(reservation.batch_no || "").trim()
                    && Number(reservation.staged_quantity || 0) > 0
                );
                const availableStagedQuantity = validReservations.reduce((sum: number, reservation: any) => Math.max(0, sum + Number(reservation.staged_quantity || 0) - Number(reservation.actual_used_quantity || 0)), 0);
                if (availableStagedQuantity + 0.000001 < consumedQuantity) {
                    return NextResponse.json({
                        success: false,
                        error: `Insufficient hard-staged material for product ${materialRow.product_id}. Available staged quantity: ${availableStagedQuantity.toLocaleString()}, requested: ${consumedQuantity.toLocaleString()}.`,
                        code: "SHIFT_RUN_STAGING_SHORTAGE",
                        jo_material_id: materialId,
                        available_staged_quantity: availableStagedQuantity,
                        requested_quantity: consumedQuantity
                    }, { status: 409 });
                }
            }
        }

        // 3. Insert new row into manufacturing_job_order_yield_ledger table
        const ledgerPayload = {
            job_order_id: Number(joId),
            shift_name: shiftName,
            yield_quantity: goodYield,
            scrap_quantity: scrapUnits,
            lot_number: finalBatchNo,
            qa_status: qaStatus === "Passed" ? "Passed" : qaStatus,
            logged_at: phtMovementTimestamp,
            logged_by: effectiveEncoderId
        };

        const ledgerData = existingRun || await directusRequest<any>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger`,
            "Yield ledger insert",
            {
                method: "POST",
                body: JSON.stringify(ledgerPayload)
            }
        );
        const ledgerId = ledgerData.ledger_id || ledgerData.id;
        if (!ledgerId) {
            throw new DirectusPersistenceError("Yield ledger insert returned no ledger identifier.");
        }

        // 4. Insert QA Parameters/Yield Log into manufacturing_job_order_qa_records
        if (!isRetryRun) {
            if (qaParameters && qaParameters.length > 0) {
                for (const param of qaParameters) {
                    const valNumeric = param.value !== undefined && param.value !== "" ? Number(param.value) : null;
                    const valText = typeof param.value === "string" ? param.value : null;
                    const valBool = typeof param.value === "boolean" ? param.value : null;

                    const qaPayload = {
                        job_order_id: Number(joId),
                        jo_route_id: Number(taskId),
                        parameter_id: Number(param.parameter_id),
                        value_text: valText,
                        value_numeric: valNumeric,
                        value_boolean: valBool,
                        is_passed: !param.is_failed,
                        inspected_by: effectiveEncoderId,
                        inspected_at: manilaTimestamp,
                        remarks: `Shift: ${shiftName} | Yield: ${goodYield} pcs | Scrap: ${scrapUnits} pcs | ${param.remarks || "Shift QA Check"}`
                    };

                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(qaPayload)
                    });
                }
            } else {
                const qaPayload = {
                    job_order_id: Number(joId),
                    jo_route_id: Number(taskId),
                    parameter_id: null,
                    is_passed: qaStatus === "Passed" ? 1 : 0,
                    inspected_by: effectiveEncoderId,
                    inspected_at: manilaTimestamp,
                    remarks: `Shift Yield Log: ${shiftName} | Yield: ${goodYield} pcs | Scrap: ${scrapUnits} pcs ${rejectionRemarks ? `| Rejection: ${rejectionRemarks}` : ""}`
                };

                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(qaPayload)
                });
            }
        }

        // 5. Consume the hard-staged reservations and record genealogy.
        // Staging is the sole raw-material quantity-out operation.
        const genealogyRecords: any[] = [];
        const persistedGenealogyRecords: any[] = [];
        const existingGenealogyRows = await directusRows<any>(
            `${DIRECTUS_URL}/items/jo_material_genealogy?filter=${encodeURIComponent(JSON.stringify({ job_order_id: { _eq: Number(joId) } }))}&limit=-1`,
            `Existing genealogy lookup for Job Order ${joId}`
        );

        const persistedGenealogyRows = [...existingGenealogyRows];
        const sameQuantity = (left: unknown, right: number) => Math.abs(Number(left || 0) - right) < 0.000001;
        const sameId = (left: unknown, right: number) => Number(typeof left === "object" && left !== null
            ? (left as any).id ?? (left as any).lot_id
            : left) === right;
        const existingRunGenealogyRows = persistedGenealogyRows.filter((row: any) =>
            String(row.batch_no || "").trim() === finalBatchNo
        );
        const requestedMaterials = (materialsConsumed || []).filter((item: any) => Number(item.actual_qty || 0) > 0);
        const isCompleteRetry = isRetryRun
            && (requestedMaterials.length === 0
                ? existingRunGenealogyRows.length > 0
                : requestedMaterials.every((item: any) => {
                    const productGenealogyRows = existingRunGenealogyRows.filter((genealogy: any) =>
                        Number(genealogy.component_product_id) === Number(item.product_id)
                    );
                    const consumedForProduct = productGenealogyRows.reduce(
                        (sum: number, genealogy: any) => sum + Number(genealogy.consumed_quantity || 0),
                        0
                    );
                    return consumedForProduct >= Number(item.actual_qty || 0);
                }));

        // A replay of a fully persisted run should only read the existing audit
        // rows. Re-entering the material loop would otherwise risk deducting a
        // second time when reservations have already been consumed.
        if (isCompleteRetry) {
            persistedGenealogyRecords.push(...existingRunGenealogyRows);
            genealogyRecords.push(...existingRunGenealogyRows.map(normalizeGenealogyRecord));
        }

        if (!isCompleteRetry && materialsConsumed && materialsConsumed.length > 0) {
            const matsSheetRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${joId}&limit=-1`, { headers, cache: "no-store" });
            const matsSheet = matsSheetRes.ok ? (await matsSheetRes.json()).data || [] : [];

            for (const item of materialsConsumed) {
                const rawProductId = numericRelationId(item.product_id);
                const consumedQty = Number(item.actual_qty || 0);

                if (consumedQty <= 0) continue;

                const matchingMat = matsSheet.find((m: any) => numericRelationId(m.product_id) === rawProductId);
                const existingConsumedForItem = existingRunGenealogyRows
                    .filter((genealogy: any) => Number(genealogy.component_product_id) === rawProductId)
                    .reduce((sum: number, genealogy: any) => sum + Number(genealogy.consumed_quantity || 0), 0);
                const additionalQuantityToConsume = Math.max(0, consumedQty - existingConsumedForItem);
                if (additionalQuantityToConsume <= 0) continue;
                let remainingToConsume = additionalQuantityToConsume;

                // Consume the already-posted staging reservation and record
                // genealogy. Staging is the only raw-material issue point.
                const logConsumageAndMovement = async (qty: number, lot: any) => {
                    if (qty <= 0) return;

                    const batchNumber = String(lot.batch_no || lot.lot_number || item.batch_no || "LOT-STAGING").trim();
                    const consumedLotId = numericRelationId(lot.mm_lot_id);
                    const consumedInventoryLotId = numericRelationId(lot.inventory_lot_id);
                    if (consumedLotId <= 0 || consumedInventoryLotId <= 0 || !batchNumber) {
                        throw new DirectusPersistenceError("Production consumption requires an exact hard-staged MM lot, inventory lot, and batch.");
                    }

                    // Log consumage sub-record if the optional table exists. A matching
                    // yield ledger marks this run as a retry, so do not duplicate it.
                    if (!isRetryRun) {
                        try {
                            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify({
                                    ledger_id: Number(ledgerId),
                                    product_id: rawProductId,
                                    quantity_consumed: qty
                                })
                            });
                        } catch (cErr) {}
                    }

                    const genealogyPayload = {
                        job_order_id: Number(joId),
                        batch_no: finalBatchNo,
                        component_product_id: rawProductId,
                        component_mm_lot_id: consumedLotId,
                        component_lot_id: null,
                        component_batch_no: batchNumber,
                        consumed_quantity: qty,
                        created_at: phtMovementTimestamp
                    };
                    const existingGenealogy = persistedGenealogyRows.find((row: any) =>
                        Number(row.job_order_id) === Number(joId)
                        && String(row.batch_no || "").trim() === finalBatchNo
                        && Number(row.component_product_id) === rawProductId
                        && sameId(row.component_mm_lot_id ?? row.component_lot_id, consumedLotId)
                        && String(row.component_batch_no || "").trim() === batchNumber
                        && sameQuantity(row.consumed_quantity, qty)
                    );

                    const persistedGenealogy = existingGenealogy || await directusRequest<any>(
                        `${DIRECTUS_URL}/items/jo_material_genealogy`,
                        "Material genealogy insert",
                        {
                            method: "POST",
                            body: JSON.stringify(genealogyPayload)
                        }
                    );
                    if (!existingGenealogy) persistedGenealogyRows.push(persistedGenealogy);
                    persistedGenealogyRecords.push(persistedGenealogy);
                    genealogyRecords.push(normalizeGenealogyRecord(persistedGenealogy));
                };

                // Deduct from pre-reservations first if available
                if (matchingMat) {
                    try {
                        const reservationsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_eq]=${matchingMat.jo_material_id || matchingMat.id}&limit=-1`, { headers, cache: "no-store" });
                        const reservations = reservationsRes.ok ? (await reservationsRes.json()).data || [] : [];
                        
                        const sortedReservations = [...reservations].sort((a, b) => {
                            const aQty = Number(a.reserved_quantity || 0);
                            const bQty = Number(b.reserved_quantity || 0);
                            return bQty - aQty;
                        });

                        for (const resRow of sortedReservations) {
                            if (remainingToConsume <= 0) break;

                            const stagedVal = Number(resRow.staged_quantity || 0);
                            const usedVal = Number(resRow.actual_used_quantity || 0);
                            const lotNo = resRow.batch_no || "LOT-STAGING";

                            const stagedAvailable = Math.max(0, stagedVal - usedVal);
                            const portion = Math.min(stagedAvailable, remainingToConsume);
                            if (portion <= 0) continue;

                            const newUsed = usedVal + portion;

                            // Update reservation row only for a new run. A matching
                            // ledger row marks a retry and prevents double deduction.
                            if (!isRetryRun || remainingToConsume > 0) {
                                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${resRow.jo_materials_reservation_id || resRow.id}`, {
                                    method: "PATCH",
                                    headers,
                                    body: JSON.stringify({
                                        actual_used_quantity: newUsed
                                    })
                                }).catch(() => {});
                            }

                            // Preserve the exact lot selected during planning. The
                            // reservation row is authoritative; using only the
                            // batch number can resolve to a different MM lot when
                            // multiple lots share the same batch number.
                            await logConsumageAndMovement(portion, {
                                batch_no: lotNo,
                                mm_lot_id: numericRelationId(resRow.mm_lot_id),
                                inventory_lot_id: numericRelationId(resRow.inventory_lot_id)
                            });
                            remainingToConsume -= portion;
                        }

                        // Update parent manufacturing_job_order_materials row
                        const newJomReserved = Math.max(0, Number(matchingMat.reserved_quantity || 0) - additionalQuantityToConsume);
                        const newJomConsumed = Number(matchingMat.actual_consumed_quantity || 0) + additionalQuantityToConsume;
                        const newJomScrap = Number(matchingMat.scrap_quantity || 0) + (scrapUnits > 0 ? (additionalQuantityToConsume * (scrapUnits / (goodYield + scrapUnits))) : 0);

                        if (!isRetryRun || additionalQuantityToConsume > 0) {
                            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${matchingMat.jo_material_id || matchingMat.id}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({
                                    reserved_quantity: newJomReserved,
                                actual_consumed_quantity: newJomConsumed,
                                    scrap_quantity: Math.round(newJomScrap * 100) / 100
                                })
                            }).catch(() => {});
                        }
                    } catch (err) {
                        console.error("Error reconciling reservations:", err);
                    }
                }

                // A missing staged reservation is a hard workflow error. Never
                // fall back to product-only FIFO or create a replacement lot.
                if (remainingToConsume > 0) {
                    throw new DirectusPersistenceError(`Hard-staged reservation is short by ${remainingToConsume} units for product ${rawProductId}.`);
                }
            }
        }

        // Confirm the records that will be reported to the caller are present in
        // Directus before recording finished output or advancing the Job Order.
        if (persistedGenealogyRecords.length > 0) {
            const verifiedGenealogyRows = await directusRows<any>(
                `${DIRECTUS_URL}/items/jo_material_genealogy?filter=${encodeURIComponent(JSON.stringify({
                    _and: [
                        { job_order_id: { _eq: Number(joId) } },
                        { batch_no: { _eq: finalBatchNo } }
                    ]
                }))}&limit=-1`,
                `Genealogy verification for Job Order ${joId}`
            );

            const durableGenealogyRecords = persistedGenealogyRecords.map((record: any) => {
                const durableGenealogy = verifiedGenealogyRows.find((row: any) =>
                    Number(row.job_order_id) === Number(record.job_order_id)
                    && String(row.batch_no || "").trim() === String(record.batch_no || "").trim()
                    && Number(row.component_product_id) === Number(record.component_product_id)
                    && sameId(row.component_mm_lot_id ?? row.component_lot_id, Number(record.component_mm_lot_id ?? record.component_lot_id))
                    && String(row.component_batch_no || "").trim() === String(record.component_batch_no || "").trim()
                    && sameQuantity(row.consumed_quantity, Number(record.consumed_quantity))
                );

                if (!durableGenealogy) {
                    throw new DirectusPersistenceError(`Genealogy verification found no persisted row for ${record.component_batch_no}.`);
                }

                return durableGenealogy;
            });

            genealogyRecords.splice(0, genealogyRecords.length, ...durableGenealogyRecords.map(normalizeGenealogyRecord));
        }

        // 6. RECORD FINISHED GOODS / WIP OUTPUT MOVEMENT IN INVENTORY_MOVEMENTS LEDGER
        let finishedInventoryLotId: number | null = null;
        if (goodYield > 0 && resolvedOutputLotId) {
            const finishedLotId = resolvedOutputLotId;
            const inventoryLot = await resolveOrCreateMmInventoryLot({
                mmLotId: finishedLotId,
                branchId,
                productId: producedProductId,
                batchNo: finalBatchNo,
                manufacturingDate: manufacturingDate || todayStr,
                expiryDate: expiryDate || null,
                unitCost: 0,
                qaStatus: "GOOD",
                sourceType: "JOB_ORDER_YIELD",
                sourceReference: jobOrderNo,
                remarks: `Yield output from Job Order ${jobOrderNo} | Shift: ${shiftName}`,
                createdBy: effectiveEncoderId,
                onCreate: async (writePayload: MmInventoryLotWritePayload): Promise<MmInventoryLotRecord> => {
                    const createdBatch = await directusRequest<any>(
                        `${DIRECTUS_URL}/items/mm_inventory_lots`,
                        "Finished-goods batch insert",
                        {
                            method: "POST",
                            body: JSON.stringify(writePayload)
                        }
                    );
                    return createdBatch as MmInventoryLotRecord;
                }
            });
            finishedInventoryLotId = Number(inventoryLot.inventory_lot_id) || null;

            const yieldLotUpdate = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger/${ledgerId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ mm_lot_id: finishedLotId })
            });
            if (!yieldLotUpdate.ok) {
                throw new DirectusPersistenceError(`Yield ledger canonical lot update failed with HTTP ${yieldLotUpdate.status}.`);
            }

            const finishedMovementPayload = {
                product_id: producedProductId,
                mm_lot_id: finishedLotId,
                lot_id: null,
                branch_id: branchId,
                transaction_type_id: 2, // Job Order Finished Goods
                source_document_id: Number(joId),
                source_document_no: jobOrderNo, // 'JO-xxxx'
                batch_no: finalBatchNo,
                expiry_date: expiryDate || null,
                manufacturing_date: manufacturingDate || null,
                quantity: goodYield,
                created_by: effectiveEncoderId,
                remarks: `Yield output from Job Order ${jobOrderNo} | Shift: ${shiftName} | Lot: ${finalBatchNo}`
            };

            const existingFinishedMovements = await fetchMmInventoryMovements({
                referenceId: Number(joId),
                branch: branchId,
                product: producedProductId,
                batchNo: finalBatchNo,
                transactionTypeId: 2
            });
            const existingFinishedMovement = existingFinishedMovements.find((row: any) => sameQuantity(row.quantity, goodYield));
            if (!existingFinishedMovement) {
                await directusRequest<any>(
                    `${DIRECTUS_URL}/items/inventory_movements`,
                    "Finished-goods inventory movement insert",
                    {
                        method: "POST",
                        body: JSON.stringify(finishedMovementPayload)
                    }
                );
            }
        }

        // 7. UPDATE JOB ORDER ACCUMULATED COMPLETED QUANTITY, REJECTED QUANTITY, AND STATUS
        const newCompletedQty = isRetryRun ? accumulatedYield : accumulatedYield + goodYield;
        const newRejectedQty = isRetryRun ? currentRejectedQty : currentRejectedQty + scrapUnits;
        const isJobFullyFinished = newCompletedQty >= targetQuantity;

        // completed_quantity is the shift-run aggregate. Keep
        // actual_quantity_produced owned by finished-goods receiving; this
        // Directus field contains legacy nulls and rejects production-run writes.
        const joUpdatePayload: Record<string, any> = {
            completed_quantity: newCompletedQty,
            rejected_quantity: newRejectedQty,
            modified_by: effectiveEncoderId,
            modified_at: manilaTimestamp
        };

        if (isJobFullyFinished) {
            joUpdatePayload.status = JOB_ORDER_STATUS.COMPLETED;
        } else if (!isJobOrderStatus(canonicalJoStatus, JOB_ORDER_STATUS.IN_PROGRESS, JOB_ORDER_STATUS.ONGOING)) {
            joUpdatePayload.status = JOB_ORDER_STATUS.IN_PROGRESS;
        }

        const expectedStatus = isJobFullyFinished
            ? JOB_ORDER_STATUS.COMPLETED
            : (isJobOrderStatus(canonicalJoStatus, JOB_ORDER_STATUS.IN_PROGRESS, JOB_ORDER_STATUS.ONGOING) ? canonicalJoStatus : JOB_ORDER_STATUS.IN_PROGRESS);

        // Keep the PATCH response unscoped. This Directus instance rejects scoped
        // update responses when other records in the collection contain nulls in
        // actual_quantity_produced, even though the target Job Order is valid.
        const joUpdateRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(joUpdatePayload)
        });

        const updatedJoData = await requireDirectusWriteData(joUpdateRes, "Job Order completion update");
        const persistedCompletedQuantity = Number(updatedJoData.completed_quantity);
        const hasExpectedCompletedQuantity = Number.isFinite(persistedCompletedQuantity)
            && Math.abs(persistedCompletedQuantity - newCompletedQty) < 0.000001;
        const persistedStatus = normalizeJobOrderStatus(updatedJoData.status);

        if (!hasExpectedCompletedQuantity || persistedStatus !== expectedStatus) {
            throw new Error(`Job Order ${jobOrderNo} did not persist the expected completion state.`);
        }

        // 8. RECORD IN MANUFACTURING_JOB_ORDER_STATUS_HISTORY IF COMPLETED OR TRANSITIONED
        if (isJobFullyFinished && !isJobOrderStatus(canonicalJoStatus, JOB_ORDER_STATUS.COMPLETED)) {
            const statusHistoryPayload = {
                job_order_id: Number(joId),
                old_status: canonicalJoStatus,
                new_status: JOB_ORDER_STATUS.COMPLETED,
                changed_by: effectiveEncoderId,
                changed_at: manilaTimestamp,
                remarks: `Job Order completed. Target ${targetQuantity.toLocaleString()} pcs reached with final shift run (${goodYield} pcs).`
            };

            const existingHistoryRows = await directusRows<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?filter=${encodeURIComponent(JSON.stringify({
                    _and: [
                        { job_order_id: { _eq: Number(joId) } },
                        { new_status: { _eq: JOB_ORDER_STATUS.COMPLETED } }
                    ]
                }))}&limit=1`,
                `Existing completion history lookup for Job Order ${joId}`
            );

            if (existingHistoryRows.length === 0) {
                await directusRequest<any>(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_status_history`,
                    "Finished status-history insert",
                    {
                        method: "POST",
                        body: JSON.stringify(statusHistoryPayload)
                    }
                );
            }
        }

        await reconcileSalesOrderFulfillment(
            Number(joId),
            goodYield,
            targetQuantity,
            isRetryRun
        );

        return NextResponse.json({ 
            success: true, 
            message: `Shift run progress logged successfully. Consumed hard-staged material and updated output batch ${finalBatchNo} for ${jobOrderNo}.`,
            batchNo: finalBatchNo,
            yieldQty: goodYield,
            scrapQty: scrapUnits,
            completedQuantity: newCompletedQty,
            isFullyFinished: isJobFullyFinished,
            mmLotId: resolvedOutputLotId,
            inventoryLotId: finishedInventoryLotId,
            genealogyRecords
        });
    } catch (e) {
        console.error("Error in shift-run-log POST API:", e);
        const status = e instanceof DirectusPersistenceError
            ? e.status
            : e instanceof MmInventoryMovementError
                ? e.status
                : 500;
        return NextResponse.json({
            success: false,
            error: (e as Error).message || "Failed to log shift progress"
        }, { status });
    }
}
