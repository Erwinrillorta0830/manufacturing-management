import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    branchProductBatchKey,
    branchProductKey,
    branchProductLotBatchKey,
    normalizeBatchNo
} from "./_stock";
import { fetchMmInventoryMovements, MmInventoryMovementError } from "../services/mm-inventory-movements.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusMaterial {
    jo_material_id?: number;
    id?: number;
    job_order_id?: number | { job_order_id?: number };
    product_id?: number | { product_id?: number; product_name?: string; product_code?: string; unit_of_measurement?: { unit_shortcut?: string } };
    uom_id?: number;
    allocated_quantity?: number;
    reserved_quantity?: number;
    actual_consumed_quantity?: number;
    scrap_quantity?: number;
    reservation_status?: string;
    staging_bin?: string;
}

interface DirectusAllocation {
    allocation_id?: number;
    jo_materials_reservation_id?: number;
    id?: number;
    job_order_id?: number | { job_order_id?: number };
    branch_id?: number;
    jo_material_id?: number;
    product_id?: number;
    mm_lot_id?: number;
    lot_id?: number;
    batch_no?: string;
    allocated_quantity?: number;
    reserved_quantity?: number;
    staged_quantity?: number;
    staging_bin?: string;
    reservation_status?: string;
    override_negative?: boolean;
    created_at?: string;
}

class MaterialStagingReadError extends Error {
    readonly status = 503;
}

function isActiveWorkCenter(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    return normalized !== "0" && normalized !== "false";
}

interface NormalizedWorkCenter {
    work_center_id: number;
    work_center_name: string;
    is_active: boolean;
}

function requireDirectusResponse(response: Response | null, collection: string): asserts response is Response {
    if (!response || !response.ok) {
        throw new MaterialStagingReadError(
            `Unable to read ${collection} from Directus. Material staging data is unavailable until the connection and permissions are restored.`
        );
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchFilter = searchParams.get("branchId");
        const statusFilter = searchParams.get("status");
        const search = searchParams.get("search")?.toLowerCase().trim();

        // 1. Fetch data concurrently
        const [
            joRes,
            materialsRes,
            reservationsRes,
            productsRes,
            workCentersRes,
            branchesRes,
            movementsRes,
            receivingRes,
            yieldsRes
        ] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_id&fields=work_center_id,work_center_name,is_active`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code`, { headers, cache: "no-store" }).catch(() => null),
            fetchMmInventoryMovements({
                branch: branchFilter && branchFilter !== "all" ? Number(branchFilter) : null
            }),
            fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?limit=-1&fields=purchase_order_product_id,product_id,batch_no,lot_no,qa_status,expiry_date,received_quantity`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&fields=*,job_order_id.product_id,job_order_id.job_order_no`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        requireDirectusResponse(joRes, "Job Orders");
        requireDirectusResponse(materialsRes, "Job Order materials");
        requireDirectusResponse(reservationsRes, "Job Order material reservations");
        requireDirectusResponse(productsRes, "Products");

        const rawJOs = joRes.ok ? (await joRes.json()).data || [] : [];
        const rawMaterials: DirectusMaterial[] = materialsRes && materialsRes.ok ? (await materialsRes.json()).data || [] : [];
        const rawReservations: DirectusAllocation[] = reservationsRes && reservationsRes.ok ? (await reservationsRes.json()).data || [] : [];
        const rawProducts = productsRes.ok ? (await productsRes.json()).data || [] : [];
        const rawWorkCenters = workCentersRes && workCentersRes.ok ? (await workCentersRes.json()).data || [] : [];
        const rawBranches = branchesRes && branchesRes.ok ? (await branchesRes.json()).data || [] : [];
        const rawMovements = movementsRes;
        const rawReceiving = receivingRes && receivingRes.ok ? (await receivingRes.json()).data || [] : [];
        const rawYields = yieldsRes && yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];

        // Maps for quick lookup
        const productMap = new Map<number, { product_id: number; product_name: string; product_code: string; uom: string }>();
        rawProducts.forEach((p: { product_id: number; product_name: string; product_code: string; unit_of_measurement?: { unit_shortcut?: string } }) => {
            productMap.set(Number(p.product_id), {
                product_id: Number(p.product_id),
                product_name: p.product_name || `Product #${p.product_id}`,
                product_code: p.product_code || `ITEM-${p.product_id}`,
                uom: p.unit_of_measurement?.unit_shortcut || "units"
            });
        });

        const normalizedWorkCenters: NormalizedWorkCenter[] = rawWorkCenters
            .map((wc: { work_center_id?: number; work_center_name?: string; is_active?: unknown }) => ({
                work_center_id: Number(wc.work_center_id),
                work_center_name: wc.work_center_name || `Work Center #${wc.work_center_id}`,
                is_active: isActiveWorkCenter(wc.is_active)
            }))
            .filter((wc: NormalizedWorkCenter) => wc.work_center_id > 0);
        const workCenterMap = new Map<number, (typeof normalizedWorkCenters)[number]>();
        normalizedWorkCenters.forEach((wc) => {
            workCenterMap.set(wc.work_center_id, wc);
        });
        const fallbackWorkCenter = normalizedWorkCenters
            .filter((wc) => wc.is_active)
            .sort((left, right) => left.work_center_id - right.work_center_id)[0] || null;

        const branchMap = new Map<number, { id: number; branchName: string; branchCode?: string }>();
        rawBranches.forEach((b: { id: number; branch_name: string; branch_code?: string }) => {
            branchMap.set(Number(b.id), {
                id: Number(b.id),
                branchName: b.branch_name,
                branchCode: b.branch_code
            });
        });

        // Compute stock using the same branch/product/lot/batch identity used by the transfer API.
        const stockByBranchProduct = new Map<string, number>();
        const stockByBranchProductBatchLot = new Map<string, {
            branchId: number;
            productId: number;
            lotId: number;
            batchNo: string;
            quantity: number;
        }>();
        const lotIdsByBranchProductBatch = new Map<string, Set<number>>();

        rawMovements.forEach((m) => {
            const pId = Number(m.product_id || 0);
            const batchNo = String(m.batch_no || "LOT-N/A").trim() || "LOT-N/A";
            const normalizedBatchNo = normalizeBatchNo(batchNo) || "lot-n/a";
            const qty = Number(m.quantity || 0);
            const branchId = Number(m.branch_id || 0);
            const lotId = Number(m.mm_lot_id || 0);
            if (pId && branchId) {
                const productKey = branchProductKey(branchId, pId);
                stockByBranchProduct.set(productKey, (stockByBranchProduct.get(productKey) || 0) + qty);

                if (lotId) {
                    const batchKey = branchProductBatchKey(branchId, pId, normalizedBatchNo);
                    const lotKey = branchProductLotBatchKey(branchId, pId, lotId, normalizedBatchNo);
                    const currentLot = stockByBranchProductBatchLot.get(lotKey);
                    stockByBranchProductBatchLot.set(lotKey, {
                        branchId,
                        productId: pId,
                        lotId,
                        batchNo,
                        quantity: (currentLot?.quantity || 0) + qty
                    });
                    const lotIds = lotIdsByBranchProductBatch.get(batchKey) || new Set<number>();
                    lotIds.add(lotId);
                    lotIdsByBranchProductBatch.set(batchKey, lotIds);
                }
            }
        });

        // Recover the actual destination for staged transfers from the movement audit trail.
        // Older rows may contain FLOOR-STAGING-WC01, so only the current explicit work-center
        // audit format is trusted as an override of the resolved Job Order destination.
        const stagedDestinationByMaterialBatch = new Map<string, string>();
        rawMovements.forEach((m) => {
            if (Number(m.quantity || 0) <= 0) return;
            const remarks = String(m.remarks || "");
            const workCenterMatch = remarks.match(/work_center_id=(\d+)/i);
            const targetBinMatch = remarks.match(/target_bin=([^;]+)/i);
            const materialMatch = remarks.match(/jo_material_id=(\d+)/i);
            if (!workCenterMatch || !targetBinMatch || !materialMatch) return;

            const workCenterId = Number(workCenterMatch[1]);
            const targetBin = targetBinMatch[1].trim();
            if (targetBin !== `FLOOR-STAGING-${workCenterId}`) return;

            const batchNo = String(m.batch_no || "").trim();
            if (!batchNo) return;
            const key = `${Number(materialMatch[1])}:${normalizeBatchNo(batchNo)}`;
            if (!stagedDestinationByMaterialBatch.has(key)) {
                stagedDestinationByMaterialBatch.set(key, targetBin);
            }
        });

        const defaultLotByBranchProduct = new Map<string, { lotId: number; batchNo: string; quantity: number }>();
        stockByBranchProductBatchLot.forEach((lot) => {
            if (lot.quantity <= 0) return;
            const productKey = branchProductKey(lot.branchId, lot.productId);
            const currentLot = defaultLotByBranchProduct.get(productKey);
            if (!currentLot || lot.quantity > currentLot.quantity) {
                defaultLotByBranchProduct.set(productKey, {
                    lotId: lot.lotId,
                    batchNo: lot.batchNo,
                    quantity: lot.quantity
                });
            }
        });

        const resolveUniqueLot = (branchId: number, productId: number, batchNo: string) => {
            const batchKey = branchProductBatchKey(branchId, productId, batchNo);
            const lotIds = [...(lotIdsByBranchProductBatch.get(batchKey) || [])];
            const lotCandidates = lotIds
                .map((lotId) => stockByBranchProductBatchLot.get(
                    branchProductLotBatchKey(branchId, productId, lotId, batchNo)
                ))
                .filter((lot): lot is NonNullable<typeof lot> => Boolean(lot && lot.quantity > 0));
            if (lotCandidates.length === 1) return lotCandidates[0];
            if (lotCandidates.length > 1 || lotIds.length !== 1) return null;
            return stockByBranchProductBatchLot.get(
                branchProductLotBatchKey(branchId, productId, lotIds[0], batchNo)
            ) || null;
        };

        const getLotStock = (branchId: number, productId: number, lotId: number, batchNo: string): number => {
            if (lotId > 0) {
                return stockByBranchProductBatchLot.get(
                    branchProductLotBatchKey(branchId, productId, lotId, batchNo)
                )?.quantity || 0;
            }
            return resolveUniqueLot(branchId, productId, batchNo)?.quantity || 0;
        };

        // Map QA & Expiry metadata from receiving & yield ledger
        const lotMetadataMap = new Map<string, { qa_status: string; expiry_date: string | null }>();
        rawReceiving.forEach((r: { product_id?: number | { product_id?: number }; batch_no?: string; lot_no?: string; qa_status?: string; expiry_date?: string }) => {
            const pId = typeof r.product_id === "object" ? Number(r.product_id?.product_id) : Number(r.product_id);
            const batchNo = String(r.batch_no || r.lot_no || "LOT-N/A").trim() || "LOT-N/A";
            if (pId) {
                lotMetadataMap.set(`${pId}:${normalizeBatchNo(batchNo)}`, {
                    qa_status: r.qa_status || "Passed",
                    expiry_date: r.expiry_date || null
                });
            }
        });

        rawYields.forEach((yl: { job_order_id?: { product_id?: number }; lot_number?: string; qa_status?: string; expiry_date?: string }) => {
            const pId = Number(yl.job_order_id?.product_id);
            const batchNo = String(yl.lot_number || "LOT-N/A").trim() || "LOT-N/A";
            if (pId) {
                lotMetadataMap.set(`${pId}:${normalizeBatchNo(batchNo)}`, {
                    qa_status: yl.qa_status || "Passed",
                    expiry_date: yl.expiry_date || null
                });
            }
        });

        const getJoId = (val: unknown): number => {
            if (!val) return 0;
            if (typeof val === "object") {
                const obj = val as Record<string, unknown>;
                return Number(obj.job_order_id || obj.id || 0);
            }
            return Number(val);
        };

        const materialById = new Map<number, DirectusMaterial>();
        rawMaterials.forEach((material) => {
            const materialId = Number(material.jo_material_id || material.id || 0);
            if (materialId) materialById.set(materialId, material);
        });

        const stagingMovementByKey = new Map<string, { quantity: number; lotId: number; stagingBin: string | null; negativeOverride: boolean }>();
        rawMovements.forEach((movement) => {
            const remarks = String(movement.remarks || "");
            const productId = Number(movement.product_id || 0);
            const lotId = Number(movement.mm_lot_id || 0);
            const jobOrderId = Number(movement.source_document_id || 0);
            const branchId = Number(movement.branch_id || 0);
            const batchNo = String(movement.batch_no || "").trim().toLowerCase();
            const quantity = Number(movement.quantity || 0);
            if (
                !remarks.includes("[MM-MATERIAL-STAGING]") ||
                Number(movement.transaction_type_id) !== 4 ||
                quantity <= 0 ||
                !productId ||
                !lotId ||
                !jobOrderId ||
                !branchId ||
                !batchNo
            ) return;

            const key = `${jobOrderId}:${branchId}:${productId}:${batchNo}`;
            const targetBin = remarks.match(/target_bin=([^;|]+)/i)?.[1]?.trim() || null;
            const current = stagingMovementByKey.get(key);
            stagingMovementByKey.set(key, {
                quantity: (current?.quantity || 0) + quantity,
                lotId: lotId || current?.lotId || 0,
                stagingBin: targetBin || current?.stagingBin || null,
                negativeOverride: Boolean(current?.negativeOverride || remarks.includes("[NEGATIVE OVERRIDE]"))
            });
        });

        // Combine reservations and allocations
        const allAllocationsByJo = new Map<number, DirectusAllocation[]>();
        const assignedStagingQuantityByBatch = new Map<string, number>();
        rawReservations.forEach((res: {
            jo_materials_reservation_id?: number;
            id?: number;
            branch_id?: number;
            jo_material_id?: number;
            product_id?: number;
            mm_lot_id?: number;
            lot_id?: number;
            batch_no?: string;
            reserved_quantity?: number;
            created_at?: string;
        }) => {
            const materialId = Number(res.jo_material_id || 0);
            const material = materialById.get(materialId);
            const joId = getJoId(material?.job_order_id);
            const productId = Number(res.product_id || material?.product_id || 0);
            const branchId = Number(res.branch_id || 0);
            const batchNo = String(res.batch_no || "").trim();
            const normalizedBatchNo = normalizeBatchNo(batchNo);
            const reservationLotId = Number(res.mm_lot_id || 0);
            const stagingMovement = stagingMovementByKey.get(`${joId}:${branchId}:${productId}:${normalizedBatchNo}`);
            const lot = reservationLotId > 0
                ? stockByBranchProductBatchLot.get(
                    branchProductLotBatchKey(branchId, productId, reservationLotId, normalizedBatchNo)
                )
                : resolveUniqueLot(branchId, productId, normalizedBatchNo);
            const stagingKey = `${joId}:${branchId}:${productId}:${normalizedBatchNo}`;
            const stagingQuantity = Number(stagingMovement?.quantity || 0);
            const previouslyAssignedQuantity = assignedStagingQuantityByBatch.get(stagingKey) || 0;
            const reservedQuantity = Math.max(0, Number(res.reserved_quantity || 0));
            const stagedQuantity = Math.min(
                Math.max(0, stagingQuantity - previouslyAssignedQuantity),
                reservedQuantity
            );
            assignedStagingQuantityByBatch.set(stagingKey, previouslyAssignedQuantity + stagedQuantity);
            const isHard = stagedQuantity > 0;
            if (joId) {
                const list = allAllocationsByJo.get(joId) || [];
                list.push({
                    allocation_id: res.jo_materials_reservation_id || res.id,
                    job_order_id: joId,
                    branch_id: branchId,
                    jo_material_id: materialId,
                    product_id: productId,
                    mm_lot_id: stagingMovement?.lotId || reservationLotId || lot?.lotId || 0,
                    lot_id: stagingMovement?.lotId || reservationLotId || lot?.lotId || 0,
                    batch_no: batchNo,
                    allocated_quantity: Number(res.reserved_quantity || 0),
                    reserved_quantity: Number(res.reserved_quantity || 0),
                    staged_quantity: stagedQuantity,
                    staging_bin: stagedQuantity > 0 ? stagingMovement?.stagingBin || "MAIN-STORE" : "MAIN-STORE",
                    reservation_status: isHard ? "HARD" : "SOFT",
                    override_negative: stagedQuantity > 0 && Boolean(stagingMovement?.negativeOverride),
                    created_at: res.created_at
                });
                allAllocationsByJo.set(joId, list);
            }
        });

        // Assemble Job Orders
        const transformedJOs = rawJOs.map((jo: {
            job_order_id?: number;
            id?: number;
            job_order_no: string;
            parent_job_order_id?: number | null;
            product_id: number;
            version_id?: number | null;
            target_quantity?: number;
            completed_quantity?: number;
            rejected_quantity?: number;
            status: string;
            primary_work_center_id?: number | null;
            shift_option?: string | null;
            branch_id?: number | null;
            remarks?: string | null;
            created_at?: string;
        }) => {
            const joId = Number(jo.job_order_id || jo.id || 0);
            const joProduct = productMap.get(Number(jo.product_id));
            const primaryWorkCenterId = jo.primary_work_center_id ? Number(jo.primary_work_center_id) : null;
            const primaryWorkCenter = primaryWorkCenterId ? workCenterMap.get(primaryWorkCenterId) : null;
            const stagingWorkCenter = primaryWorkCenter?.is_active ? primaryWorkCenter : fallbackWorkCenter;
            const stagingWorkCenterId = stagingWorkCenter?.work_center_id || null;
            const wcName = stagingWorkCenter?.work_center_name || "No active work center";
            const branchInfo = jo.branch_id ? branchMap.get(Number(jo.branch_id)) : null;

            // The staging bin is derived from the same active work center used by the UI and transfer API.
            const suggestedStagingBin = stagingWorkCenterId
                ? `FLOOR-STAGING-${stagingWorkCenterId}`
                : null;

            // Filter materials belonging to this JO
            const joMaterials = rawMaterials.filter((m) => getJoId(m.job_order_id) === joId);
            const joAllocs = allAllocationsByJo.get(joId) || [];

            let totalMaterialsCount = 0;
            let stagedMaterialsCount = 0;
            let hasAnyShortage = false;

            const mappedMaterials = joMaterials.map((mat) => {
                const mProductId = typeof mat.product_id === "object" ? Number(mat.product_id?.product_id) : Number(mat.product_id);
                const matProdInfo = productMap.get(mProductId);
                const requiredQty = Number(mat.allocated_quantity || 0);
                const matId = Number(mat.jo_material_id || mat.id || 0);

                // Find allocations for this specific material
                const relatedAllocs = joAllocs.filter((a) => {
                    if (a.jo_material_id && matId) return Number(a.jo_material_id) === matId;
                    return Number(a.product_id) === mProductId;
                });

                const allocatedLots = relatedAllocs.map((al, idx) => {
                    const lotNo = (al.batch_no || `LOT-${jo.job_order_no}-${idx + 1}`).trim();
                    const lotMeta = lotMetadataMap.get(`${mProductId}:${normalizeBatchNo(lotNo)}`);
                    const lotId = Number(al.lot_id || 0);
                    const onHandLotQty = getLotStock(Number(jo.branch_id || 0), mProductId, lotId, lotNo);
                    const resStatus = (al.reservation_status === "HARD" || al.staging_bin?.startsWith("FLOOR-STAGING")) ? "HARD" : "SOFT";
                    const isStaged = resStatus === "HARD" || al.staging_bin?.startsWith("FLOOR-STAGING");
                    const allocationStagingBin = al.staging_bin?.trim();
                    const movementStagingBin = stagedDestinationByMaterialBatch.get(`${matId}:${normalizeBatchNo(lotNo)}`);
                    const allocQty = Number(al.allocated_quantity || al.reserved_quantity || requiredQty);
                    const stagedQty = Number(al.staged_quantity || 0);

                    return {
                        allocation_id: al.allocation_id || al.id,
                        mm_lot_id: lotId,
                        lot_id: lotId,
                        batch_no: lotNo,
                        allocated_quantity: allocQty,
                        staged_quantity: isStaged ? (stagedQty > 0 ? stagedQty : allocQty) : 0,
                        expiry_date: lotMeta?.expiry_date || null,
                        qa_status: lotMeta?.qa_status || "Passed",
                        reservation_status: resStatus as "SOFT" | "HARD",
                        staging_bin: isStaged
                            ? movementStagingBin || suggestedStagingBin || allocationStagingBin || "MAIN-STORE"
                            : allocationStagingBin || "MAIN-STORE",
                        source_bin: "MAIN-STORE",
                        on_hand_lot_quantity: Math.max(0, onHandLotQty),
                        override_negative: al.override_negative || false,
                        created_at: al.created_at || null
                    };
                });

                // If no specific lot allocations exist, synthesize a default allocation from available stock
                if (allocatedLots.length === 0 && requiredQty > 0) {
                    const defaultLot = defaultLotByBranchProduct.get(
                        branchProductKey(Number(jo.branch_id || 0), mProductId)
                    );
                    const defaultOnHand = defaultLot?.quantity ?? 0;
                    allocatedLots.push({
                        allocation_id: undefined,
                        mm_lot_id: defaultLot?.lotId || 0,
                        lot_id: defaultLot?.lotId || 0,
                        batch_no: defaultLot?.batchNo || `LOT-${mProductId}-MAIN`,
                        allocated_quantity: requiredQty,
                        staged_quantity: 0,
                        expiry_date: null,
                        qa_status: "Passed",
                        reservation_status: "SOFT" as const,
                        staging_bin: "MAIN-STORE",
                        source_bin: "MAIN-STORE",
                        on_hand_lot_quantity: Math.max(0, defaultOnHand),
                        override_negative: false,
                        created_at: null
                    });
                }

                const totalAllocatedQty = allocatedLots.reduce((sum, l) => sum + l.allocated_quantity, 0);
                const totalStagedQty = allocatedLots.reduce((sum, l) => sum + l.staged_quantity, 0);
                const onHandStock = stockByBranchProduct.get(
                    branchProductKey(Number(jo.branch_id || 0), mProductId)
                ) || 0;
                const shortageQty = Math.max(0, requiredQty - onHandStock);
                const isItemShort = onHandStock < requiredQty && totalStagedQty < requiredQty;

                if (isItemShort) hasAnyShortage = true;
                totalMaterialsCount++;
                const isFullyStaged = totalStagedQty >= requiredQty && requiredQty > 0;
                if (isFullyStaged) stagedMaterialsCount++;

                const hasAnyStaged = totalStagedQty > 0;
                const overallResStatus: "SOFT" | "HARD" | "PARTIAL" = isFullyStaged
                    ? "HARD"
                    : hasAnyStaged
                        ? "PARTIAL"
                        : "SOFT";

                return {
                    jo_material_id: matId,
                    job_order_id: joId,
                    product_id: mProductId,
                    product_name: matProdInfo?.product_name || `Component #${mProductId}`,
                    product_code: matProdInfo?.product_code || `SKU-${mProductId}`,
                    uom: matProdInfo?.uom || "units",
                    required_quantity: requiredQty,
                    allocated_quantity: totalAllocatedQty,
                    staged_quantity: totalStagedQty,
                    on_hand_quantity: Math.max(0, onHandStock),
                    shortage_quantity: shortageQty,
                    reservation_status: overallResStatus,
                    staging_bin: isFullyStaged
                        ? allocatedLots.find((lot) => lot.reservation_status === "HARD")?.staging_bin || suggestedStagingBin || "MAIN-STORE"
                        : allocatedLots.find((lot) => lot.reservation_status === "HARD")?.staging_bin || "MAIN-STORE",
                    is_staged: isFullyStaged,
                    has_shortage: isItemShort,
                    allocations: allocatedLots
                };
            });

            const stagingPct = totalMaterialsCount > 0
                ? Math.round((stagedMaterialsCount / totalMaterialsCount) * 100)
                : 0;

            const allStaged = totalMaterialsCount > 0 && stagedMaterialsCount === totalMaterialsCount;
            const hasAnyStaged = mappedMaterials.some((material) => material.staged_quantity > 0);

            const joResStatus: "SOFT" | "HARD" | "PARTIAL" = allStaged
                ? "HARD"
                : hasAnyStaged || stagedMaterialsCount > 0
                    ? "PARTIAL"
                    : "SOFT";

            return {
                job_order_id: joId,
                job_order_no: jo.job_order_no,
                parent_job_order_id: jo.parent_job_order_id ? Number(jo.parent_job_order_id) : null,
                product_id: Number(jo.product_id),
                product_name: joProduct?.product_name || `Product #${jo.product_id}`,
                product_code: joProduct?.product_code || `ITEM-${jo.product_id}`,
                version_id: jo.version_id ? Number(jo.version_id) : null,
                target_quantity: Number(jo.target_quantity || 0),
                completed_quantity: Number(jo.completed_quantity || 0),
                rejected_quantity: Number(jo.rejected_quantity || 0),
                status: jo.status,
                primary_work_center_id: jo.primary_work_center_id ? Number(jo.primary_work_center_id) : null,
                primary_work_center_name: wcName,
                staging_work_center_id: stagingWorkCenterId,
                suggested_staging_bin: suggestedStagingBin,
                shift_option: jo.shift_option || "Shift 1 (Day)",
                branch_id: jo.branch_id ? Number(jo.branch_id) : null,
                branch_name: branchInfo?.branchName || "Main Facility",
                remarks: jo.remarks || null,
                materials: mappedMaterials,
                total_materials_count: totalMaterialsCount,
                staged_materials_count: stagedMaterialsCount,
                staging_percentage: stagingPct,
                reservation_status: joResStatus,
                has_shortage: hasAnyShortage,
                all_staged: allStaged,
                created_at: jo.created_at || null
            };
        });

        // Apply search & branch filters
        let filtered = transformedJOs;

        if (branchFilter && branchFilter !== "all") {
            const bId = Number(branchFilter);
            filtered = filtered.filter((j: { branch_id: number | null }) => j.branch_id === bId);
        }

        if (statusFilter && statusFilter !== "all") {
            const sf = statusFilter.toUpperCase();
            filtered = filtered.filter((j: { status: string }) => j.status?.toUpperCase() === sf || (sf === "PLANNED" && (j.status === "Draft" || j.status === "Planned")));
        }

        if (search) {
            filtered = filtered.filter((j: {
                job_order_no?: string;
                product_name?: string;
                product_code?: string;
                primary_work_center_name?: string;
                materials?: Array<{
                    product_name?: string;
                    product_code?: string;
                    allocations?: Array<{ batch_no?: string }>;
                }>;
            }) =>
                j.job_order_no?.toLowerCase().includes(search) ||
                j.product_name?.toLowerCase().includes(search) ||
                j.product_code?.toLowerCase().includes(search) ||
                j.primary_work_center_name?.toLowerCase().includes(search) ||
                j.materials?.some((m) =>
                    m.product_name?.toLowerCase().includes(search) ||
                    m.product_code?.toLowerCase().includes(search) ||
                    m.allocations?.some((a) => a.batch_no?.toLowerCase().includes(search))
                )
            );
        }

        // Summary KPI statistics
        const stats = {
            totalActiveJobs: transformedJOs.filter((j: { status: string }) => ["PLANNED", "RESERVED", "Planned", "Reserved", "Proceed", "In Progress"].includes(j.status)).length,
            plannedJobs: transformedJOs.filter((j: { status: string }) => ["PLANNED", "Planned", "Draft"].includes(j.status)).length,
            reservedJobs: transformedJOs.filter((j: { status: string }) => ["RESERVED", "Reserved"].includes(j.status)).length,
            fullyStagedJobs: transformedJOs.filter((j: { all_staged: boolean }) => j.all_staged).length,
            pendingStagingJobs: transformedJOs.filter((j: { all_staged: boolean }) => !j.all_staged).length,
            shortageAlertJobs: transformedJOs.filter((j: { has_shortage: boolean }) => j.has_shortage).length
        };

        return NextResponse.json({
            success: true,
            data: filtered,
            stats,
            workCenters: normalizedWorkCenters,
            branches: Array.from(branchMap.values())
        });
    } catch (e) {
        console.error("[Material Staging GET API] Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to fetch material staging data" },
            {
                status: e instanceof MaterialStagingReadError
                    ? e.status
                    : e instanceof MmInventoryMovementError
                        ? e.status
                        : 500
            }
        );
    }
}
