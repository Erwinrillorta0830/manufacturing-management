/* eslint-disable */
import { DIRECTUS_URL, headers } from "./shared";
import { getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";
import { fetchMmInventoryMovements, MmInventoryMovementError, type NormalizedMmInventoryMovement } from "../../services/mm-inventory-movements.service";
import { isExpired, normalizeDirectusStagingMovement } from "../../material-staging/_stock";
import { loadMmInventoryLots, loadMmLots, mmInventoryLotId, mmLotId, resolveProductUnitId } from "../../services/mm-lots.service";
import { JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";

const ACTIVE_JOB_ORDER_STATUSES = [
    JOB_ORDER_STATUS.DRAFT,
    JOB_ORDER_STATUS.FOR_PICKING,
    JOB_ORDER_STATUS.PICKED,
    JOB_ORDER_STATUS.IN_PRODUCTION,
    JOB_ORDER_STATUS.ON_HOLD,
    JOB_ORDER_STATUS.QA_HOLD
];

export interface AvailableInventoryLot {
    batchNo: string;
    mmLotId: number | null;
    inventoryLotId: number | null;
    purchaseOrderReceivingId: number | null;
    available: number;
    physicalQuantity?: number;
    expiryDate?: string | null;
    manufacturingDate?: string | null;
}

const RESERVABLE_QA_STATUSES = new Set([
    "GOOD",
    "PASSED",
    "PASS",
    "APPROVED",
    "PARTIALLY_ACCEPTED"
]);

function relationId(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const resolved = relationId(record[key], keys);
            if (resolved !== null) return resolved;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function batchText(value: unknown): string {
    return String(value ?? "LOT-N/A").trim() || "LOT-N/A";
}

function batchKey(value: unknown): string {
    return batchText(value).toLowerCase();
}

function productIdFrom(value: unknown): number {
    return relationId(value, ["product_id", "id"]) || 0;
}

function isReservableQaStatus(value: unknown): boolean {
    const status = String(value ?? "GOOD")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return RESERVABLE_QA_STATUSES.has(status || "GOOD");
}

/**
 * Return the movement-backed lots that can be reserved for a raw material.
 *
 * Purchase receipts provide QA metadata when available, but they are not the
 * inventory source. Posted stock adjustments, transfers, and other movement
 * sources must also be reservable when their net movement balance is positive.
 */
export interface AvailableInventoryLotOptions {
    movementRows?: NormalizedMmInventoryMovement[];
}

export async function getAvailableInventoryLots(
    productId: number,
    branchId: number,
    options: AvailableInventoryLotOptions = {}
): Promise<AvailableInventoryLot[]> {
    if (!productId || !branchId) {
        throw new Error("Missing required productId or branchId in getAvailableInventoryLots");
    }

    const numericProductId = Number(productId);
    const numericBranchId = Number(branchId);
    const productUnitId = await resolveProductUnitId(numericProductId);
    const movementRowsPromise = options.movementRows
        ? Promise.resolve(options.movementRows)
        : fetchMmInventoryMovements({
            branch: numericBranchId,
            product: numericProductId
        });
    const [springMovements, receiptsRes, yieldsRes, reservationsRes, eligibleStorageLots, inventoryLots, directusMovementsRes] = await Promise.all([
        movementRowsPromise,
        fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${numericProductId}&filter[branch_id][_eq]=${numericBranchId}&fields=purchase_order_product_id,product_id,batch_no,lot_no,qa_status,is_reverted,received_quantity,mm_lot_id,expiry_date,manufacturing_date,created_at&limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${numericProductId}&fields=lot_number,qa_status,job_order_id.product_id&limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: numericProductId } },
                { branch_id: { _eq: numericBranchId } },
                { jo_material_id: { job_order_id: { status: { _in: ACTIVE_JOB_ORDER_STATUSES } } } }
            ]
        }))}&fields=product_id,batch_no,mm_lot_id,inventory_lot_id,reserved_quantity&limit=-1`, { headers, cache: "no-store" }),
        loadMmLots({ branchId: numericBranchId, unitId: productUnitId }),
        loadMmInventoryLots({ branchId: numericBranchId, productId: numericProductId, onlyActive: true }),
        fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[branch_id][_eq]=${numericBranchId}&filter[product_id][_eq]=${numericProductId}&fields=*&limit=-1`, { headers, cache: "no-store" }).catch(() => null)
    ]);
    const eligibleStorageLotIds = new Set(
        eligibleStorageLots
            .map((lot) => mmLotId(lot.lot_id))
            .filter((lotId): lotId is number => lotId !== null)
    );

    const receipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];
    const yields = yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];
    const reservations = reservationsRes.ok ? (await reservationsRes.json()).data || [] : [];
    const directusMovements = directusMovementsRes?.ok
        ? (((await directusMovementsRes.json()).data || []) as unknown[])
            .filter((row: unknown): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
            .map(normalizeDirectusStagingMovement)
        : [];
    // Spring is the canonical movement ledger used by Lot Management. Directus
    // is only a fallback for environments where that ledger has no rows; merging
    // both sources double-counts the same stock movements.
    const movements = springMovements.length > 0 ? springMovements : directusMovements;

    type InventoryMetadata = {
        inventoryLotId: number;
        mmLotId: number | null;
        batchNo: string;
        qaStatus: string | null;
        expiryDate: string | null;
        manufacturingDate: string | null;
    };
    const inventoryById = new Map<number, InventoryMetadata>();
    const inventoryByMmLotBatch = new Map<string, InventoryMetadata[]>();
    inventoryLots.forEach((inventoryLot: any) => {
        const inventoryLotId = mmInventoryLotId(inventoryLot.inventory_lot_id ?? inventoryLot.id);
        const inventoryProductId = productIdFrom(inventoryLot.product_id);
        const inventoryBranchId = relationId(inventoryLot.branch_id, ["branch_id", "id"]);
        if (!inventoryLotId || inventoryProductId !== numericProductId || inventoryBranchId !== numericBranchId) return;

        const metadata: InventoryMetadata = {
            inventoryLotId,
            mmLotId: mmLotId(inventoryLot.lot_id),
            batchNo: batchText(inventoryLot.batch_no),
            qaStatus: String(inventoryLot.qa_status ?? "").trim() || null,
            expiryDate: String(inventoryLot.expiry_date ?? "").trim() || null,
            manufacturingDate: String(inventoryLot.manufacturing_date ?? "").trim() || null
        };
        inventoryById.set(inventoryLotId, metadata);
        if (metadata.mmLotId) {
            const key = `${metadata.mmLotId}:${batchKey(metadata.batchNo)}`;
            const sameKeyLots = inventoryByMmLotBatch.get(key) || [];
            sameKeyLots.push(metadata);
            inventoryByMmLotBatch.set(key, sameKeyLots);
        }
    });

    const batchStatusMap = new Map<string, string>();
    const receiptByBatch = new Map<string, number>();
    const receiptMmLotByBatch = new Map<string, number>();
    const receiptByMmLotBatch = new Map<string, number>();
    const receiptExpiryByBatch = new Map<string, string>();
    const receiptManufacturingByBatch = new Map<string, string>();

    receipts.forEach((receipt: any) => {
        const receiptProductId = Number(receipt.product_id?.product_id || receipt.product_id);
        if (receiptProductId !== numericProductId) return;
        const batchNo = batchText(receipt.batch_no || receipt.lot_no);
        const normalizedBatch = batchKey(batchNo);
        const key = `${receiptProductId}:${normalizedBatch}`;
        batchStatusMap.set(key, receipt.qa_status || "Passed");

        const receiptId = relationId(receipt.purchase_order_product_id, ["purchase_order_product_id", "id"]);
        if (receiptId && !receiptByBatch.has(normalizedBatch)) receiptByBatch.set(normalizedBatch, receiptId);
        const receiptMmLotId = mmLotId(receipt.mm_lot_id ?? receipt.lot_id);
        if (receiptMmLotId !== null && !receiptMmLotByBatch.has(normalizedBatch)) receiptMmLotByBatch.set(normalizedBatch, receiptMmLotId);
        if (receiptId && receiptMmLotId !== null) {
            const receiptLotKey = `${receiptMmLotId}:${normalizedBatch}`;
            if (!receiptByMmLotBatch.has(receiptLotKey)) receiptByMmLotBatch.set(receiptLotKey, receiptId);
        }
        const expiryDate = String(receipt.expiry_date || "").trim();
        if (expiryDate && !receiptExpiryByBatch.has(normalizedBatch)) receiptExpiryByBatch.set(normalizedBatch, expiryDate);
        const manufacturingDate = String(receipt.manufacturing_date || receipt.created_at || "").trim();
        if (manufacturingDate && !receiptManufacturingByBatch.has(normalizedBatch)) receiptManufacturingByBatch.set(normalizedBatch, manufacturingDate);
    });

    yields.forEach((yieldRow: any) => {
        const yieldProductId = Number(yieldRow.job_order_id?.product_id || numericProductId);
        if (yieldProductId !== numericProductId) return;
        const batchNo = batchText(yieldRow.lot_number);
        batchStatusMap.set(`${yieldProductId}:${batchKey(batchNo)}`, yieldRow.qa_status || "Pending");
    });

    const movementBalances = new Map<string, {
        batchNo: string;
        mmLotId: number | null;
        inventoryLotId: number | null;
        quantity: number;
        expiryDate: string | null;
        manufacturingDate: string | null;
        qaStatus: string | null;
    }>();

    movements.forEach((movement: any) => {
        const movementProductId = Number(movement.product_id?.product_id || movement.product_id || movement.productId);
        if (movementProductId !== numericProductId) return;

        const movementInventoryLotId = mmInventoryLotId(movement.inventory_lot_id ?? movement.inventoryLotId);
        const inventoryMetadata = movementInventoryLotId ? inventoryById.get(movementInventoryLotId) : undefined;
        const movementMmLotId = mmLotId(movement.mm_lot_id ?? movement.mmLotId ?? movement.lot_id ?? movement.lotId);
        const movementBatchNo = batchText(movement.batch_no || movement.batchNo);
        const matchingInventoryLots = movementMmLotId
            ? inventoryByMmLotBatch.get(`${movementMmLotId}:${batchKey(movementBatchNo)}`) || []
            : [];
        const uniqueInventoryMetadata = matchingInventoryLots.length === 1 ? matchingInventoryLots[0] : undefined;
        const canonicalInventory = inventoryMetadata || uniqueInventoryMetadata;
        const batchNo = canonicalInventory?.batchNo || movementBatchNo;
        const inventoryLotId = canonicalInventory?.inventoryLotId || movementInventoryLotId;
        const resolvedMmLotId = canonicalInventory?.mmLotId
            || movementMmLotId
            || receiptMmLotByBatch.get(batchKey(batchNo))
            || null;
        if (!resolvedMmLotId || !eligibleStorageLotIds.has(resolvedMmLotId)) return;
        if (movementInventoryLotId && !canonicalInventory) return;
        const key = `${resolvedMmLotId}:${inventoryLotId ?? "NO-INVENTORY-LOT"}:${batchKey(batchNo)}`;
        const existing = movementBalances.get(key);
        const quantity = Number(movement.quantity || 0);
        const expiryDate = canonicalInventory?.expiryDate
            || String(movement.expiry_date || movement.expiryDate || "").trim()
            || receiptExpiryByBatch.get(batchKey(batchNo))
            || null;
        const manufacturingDate = canonicalInventory?.manufacturingDate
            || String(movement.manufacturing_date || movement.manufacturingDate || movement.created_at || "").trim()
            || receiptManufacturingByBatch.get(batchKey(batchNo))
            || null;
        const qaStatus = canonicalInventory?.qaStatus || batchStatusMap.get(`${numericProductId}:${batchKey(batchNo)}`) || "GOOD";

        if (existing) {
            existing.quantity += quantity;
            existing.expiryDate = existing.expiryDate || expiryDate;
            existing.manufacturingDate = existing.manufacturingDate || manufacturingDate;
            existing.qaStatus = existing.qaStatus || qaStatus;
        } else {
            movementBalances.set(key, {
                batchNo,
                mmLotId: resolvedMmLotId,
                inventoryLotId,
                quantity,
                expiryDate,
                manufacturingDate,
                qaStatus
            });
        }
    });

    const exactReservations = new Map<string, number>();
    const inventoryReservations = new Map<string, number>();
    const mmLotBatchReservations = new Map<string, number>();
    const batchOnlyReservations = new Map<string, number>();
    reservations.forEach((reservation: any) => {
        const batchNo = batchText(reservation.batch_no);
        const normalizedBatch = batchKey(batchNo);
        const quantity = Number(reservation.reserved_quantity || 0);
        if (quantity <= 0) return;

        const reservationMmLotId = mmLotId(reservation.mm_lot_id);
        const reservationInventoryLotId = mmInventoryLotId(reservation.inventory_lot_id);
        if (reservationInventoryLotId !== null) {
            const inventoryKey = `${reservationInventoryLotId}:${normalizedBatch}`;
            inventoryReservations.set(inventoryKey, (inventoryReservations.get(inventoryKey) || 0) + quantity);
            if (reservationMmLotId !== null) {
                const key = `${reservationMmLotId}:${reservationInventoryLotId}:${normalizedBatch}`;
                exactReservations.set(key, (exactReservations.get(key) || 0) + quantity);
            }
        } else if (reservationMmLotId !== null) {
            const key = `${reservationMmLotId}:${normalizedBatch}`;
            mmLotBatchReservations.set(key, (mmLotBatchReservations.get(key) || 0) + quantity);
        } else {
            batchOnlyReservations.set(normalizedBatch, (batchOnlyReservations.get(normalizedBatch) || 0) + quantity);
        }
    });

    const lotsByBatch = new Map<string, Array<{
        key: string;
        batchNo: string;
        mmLotId: number | null;
        inventoryLotId: number | null;
        quantity: number;
        expiryDate: string | null;
        manufacturingDate: string | null;
        qaStatus: string | null;
    }>>();
    movementBalances.forEach((balance, key) => {
        if (balance.quantity <= 0) return;
        if (!isReservableQaStatus(balance.qaStatus) || isExpired(balance.expiryDate)) return;

        const normalizedBatch = batchKey(balance.batchNo);
        if (!lotsByBatch.has(normalizedBatch)) lotsByBatch.set(normalizedBatch, []);
        lotsByBatch.get(normalizedBatch)!.push({ key, ...balance });
    });

    const availableLots: AvailableInventoryLot[] = [];
    lotsByBatch.forEach((batchLots, normalizedBatch) => {
        let batchOnlyReserved = batchOnlyReservations.get(normalizedBatch) || 0;

        batchLots.forEach((lot) => {
            const exactReserved = lot.inventoryLotId
                ? exactReservations.get(lot.key)
                    || inventoryReservations.get(`${lot.inventoryLotId}:${normalizedBatch}`)
                    || 0
                : mmLotBatchReservations.get(`${lot.mmLotId}:${normalizedBatch}`) || 0;
            const exactAvailable = Math.max(0, lot.quantity - exactReserved);
            const fallbackReserved = Math.min(batchOnlyReserved, exactAvailable);
            batchOnlyReserved -= fallbackReserved;
            const available = exactAvailable - fallbackReserved;
            if (available <= 0) return;

            availableLots.push({
                batchNo: lot.batchNo,
                mmLotId: lot.mmLotId,
                inventoryLotId: lot.inventoryLotId,
                purchaseOrderReceivingId: lot.mmLotId
                    ? receiptByMmLotBatch.get(`${lot.mmLotId}:${normalizedBatch}`) || receiptByBatch.get(normalizedBatch) || null
                    : receiptByBatch.get(normalizedBatch) || null,
                available,
                physicalQuantity: lot.quantity,
                expiryDate: lot.expiryDate,
                manufacturingDate: lot.manufacturingDate
            });
        });
    });

    availableLots.sort((left, right) => {
        const leftExpiry = left.expiryDate ? Date.parse(left.expiryDate) : Number.MAX_SAFE_INTEGER;
        const rightExpiry = right.expiryDate ? Date.parse(right.expiryDate) : Number.MAX_SAFE_INTEGER;
        const safeLeftExpiry = Number.isFinite(leftExpiry) ? leftExpiry : Number.MAX_SAFE_INTEGER;
        const safeRightExpiry = Number.isFinite(rightExpiry) ? rightExpiry : Number.MAX_SAFE_INTEGER;
        if (safeLeftExpiry !== safeRightExpiry) return safeLeftExpiry - safeRightExpiry;
        const leftManufacturing = left.manufacturingDate ? Date.parse(left.manufacturingDate) : Number.MAX_SAFE_INTEGER;
        const rightManufacturing = right.manufacturingDate ? Date.parse(right.manufacturingDate) : Number.MAX_SAFE_INTEGER;
        const safeLeftManufacturing = Number.isFinite(leftManufacturing) ? leftManufacturing : Number.MAX_SAFE_INTEGER;
        const safeRightManufacturing = Number.isFinite(rightManufacturing) ? rightManufacturing : Number.MAX_SAFE_INTEGER;
        if (safeLeftManufacturing !== safeRightManufacturing) return safeLeftManufacturing - safeRightManufacturing;
        return (left.inventoryLotId || left.mmLotId || Number.MAX_SAFE_INTEGER) - (right.inventoryLotId || right.mmLotId || Number.MAX_SAFE_INTEGER);
    });

    return availableLots;
}

export async function getProductInventoryAndSafetyStock(productIds: number[], branchId: number) {
    if (!branchId) {
        throw new Error("Missing required branchId in getProductInventoryAndSafetyStock");
    }
    try {
        const bId = Number(branchId);
        const prodFilter = productIds.length > 0 ? `&filter[product_id][_in]=${productIds.join(",")}` : "";
        const prodRes = await fetch(`${DIRECTUS_URL}/items/products?limit=-1${prodFilter}&fields=product_id,product_name,product_code,maintaining_quantity,product_type,parent_id,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut`, { headers, cache: "no-store" });
        const products = prodRes.ok ? (await prodRes.json()).data || [] : [];

        const productUnitIds = new Map<number, number>();
        products.forEach((product: any) => {
            const productId = Number(product.product_id);
            const unit = product.unit_of_measurement;
            const unitId = Number(typeof unit === "object" ? unit?.unit_id || unit?.id : unit || 0);
            if (productId > 0 && unitId > 0) productUnitIds.set(productId, unitId);
        });
        const uniqueUnitIds = [...new Set(productUnitIds.values())];
        const eligibleStorageLotsByUnit = new Map<number, Set<number>>();
        await Promise.all(uniqueUnitIds.map(async (unitId) => {
            try {
                const lots = await loadMmLots({ branchId: Number(branchId), unitId });
                eligibleStorageLotsByUnit.set(unitId, new Set(
                    lots
                        .map((lot) => mmLotId(lot.lot_id))
                        .filter((lotId): lotId is number => lotId !== null)
                ));
            } catch (error) {
                console.error(`Error loading UOM-compatible storage lots for unit ${unitId}:`, error);
                eligibleStorageLotsByUnit.set(unitId, new Set());
            }
        }));

        const allProductIds = productIds.length > 0 ? productIds : products.map((p: any) => Number(p.product_id)).filter(Boolean);

        // Extract parent IDs for version checking
        const parentIds = products.map((p: any) => {
            const parentVal = p.parent_id;
            return parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);
        }).filter((id: number | null): id is number => id !== null && id > 0);

        const versionCheckProductIds = Array.from(new Set([...allProductIds, ...parentIds]));

        // Fetch all batch data in parallel
        const recFilter = allProductIds.length > 0 ? `filter[product_id][_in]=${allProductIds.join(",")}&` : "";
        const yieldFilter = allProductIds.length > 0 ? `filter[job_order_id][product_id][_in]=${allProductIds.join(",")}&` : "";
        const versionFilter = encodeURIComponent(JSON.stringify({
            product_id: { _in: versionCheckProductIds.length > 0 ? versionCheckProductIds : [0] }
        }));

        const productTypeIds = new Set<number>(
            products
                .map((product: any) => Number(product.product_type?.id || product.product_type || 0))
                .filter((productTypeId: number) => productTypeId > 0)
        );
        const movementProductType = productTypeIds.size === 1 ? [...productTypeIds][0] : null;

        const [recRes, yieldRes, movements, versionsRes, unitsRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?${recFilter}filter[branch_id][_eq]=${bId}&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?${yieldFilter}fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" }),
            fetchMmInventoryMovements({
                branch: bId,
                product: allProductIds.length === 1 ? allProductIds[0] : null,
                productType: movementProductType
            }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${versionFilter}&fields=product_id&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" })
        ]);

        const receipts = recRes.ok ? (await recRes.json()).data || [] : [];
        const yields = yieldRes.ok ? (await yieldRes.json()).data || [] : [];
        const versionData = versionsRes.ok ? (await versionsRes.json()).data || [] : [];
        const unitsData = unitsRes.ok ? (await unitsRes.json()).data || [] : [];

        const unitsMap = new Map<number, any>();
        unitsData.forEach((u: any) => unitsMap.set(Number(u.unit_id), u));

        const versionProductIds = new Set<number>(versionData.map((v: any) => Number(v.product_id)));

        // Batch fetch reservations for all products by product_id & batch_no
        const lotReservationsMap: Record<string, number> = {};
        if (allProductIds.length > 0) {
            try {
                const resFilter = encodeURIComponent(JSON.stringify({
                    _and: [
                        { product_id: { _in: allProductIds } },
                        { jo_material_id: { job_order_id: { status: { _in: [
                            JOB_ORDER_STATUS.DRAFT,
                            JOB_ORDER_STATUS.FOR_PICKING,
                            JOB_ORDER_STATUS.PICKED,
                            JOB_ORDER_STATUS.IN_PRODUCTION,
                            JOB_ORDER_STATUS.ON_HOLD,
                            JOB_ORDER_STATUS.QA_HOLD
                        ] } } } }
                    ]
                }));
                const resRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${resFilter}&fields=product_id,batch_no,purchase_order_receiving_id,purchase_order_receiving_id.lot_no,purchase_order_receiving_id.batch_no,reserved_quantity&limit=-1`, { headers, cache: "no-store" });
                if (resRes.ok) {
                    const resData = (await resRes.json()).data || [];
                    resData.forEach((r: any) => {
                        const pId = Number(r.product_id);
                        const porObj = r.purchase_order_receiving_id;
                        const batchNo = r.batch_no || (typeof porObj === 'object' ? (porObj?.batch_no || porObj?.lot_no) : null);
                        if (pId && batchNo) {
                            const key = `${pId}:${batchNo}`;
                            lotReservationsMap[key] = (lotReservationsMap[key] || 0) + Number(r.reserved_quantity || 0);
                        }
                    });
                }
            } catch (err) {
                console.error("Error fetching reservations for net-requirements:", err);
            }
        }

        const batchStatusMap = new Map<string, string>();
        const batchExpiryMap = new Map<string, string>();

        receipts.forEach((rec: any) => {
            const pId = Number(rec.product_id?.product_id || rec.product_id);
            const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim() || "LOT-N/A";
            const key = `${pId}:${batchNo}`;
            batchStatusMap.set(key, rec.qa_status || "Passed");
            if (rec.expiry_date) batchExpiryMap.set(key, rec.expiry_date);
        });

        yields.forEach((yl: any) => {
            const pId = Number(yl.job_order_id?.product_id);
            if (!pId) return;
            const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
            const key = `${pId}:${batchNo}`;
            batchStatusMap.set(key, yl.qa_status || "Pending");
            if (yl.expiry_date) batchExpiryMap.set(key, yl.expiry_date);
        });
        
        const movementStockMap = new Map<string, number>(); // "productId:batchNo" -> sum of quantity
        movements
            .filter((movement) => allProductIds.length === 0 || allProductIds.includes(Number(movement.product_id || movement.productId || 0)))
            .forEach((mov: any) => {
            const pId = Number(mov.product_id?.product_id || mov.product_id);
            const productUnitId = productUnitIds.get(pId);
            const movementMmLotId = mmLotId(mov.mm_lot_id ?? mov.mmLotId ?? mov.lot_id ?? mov.lotId);
            if (movementMmLotId !== null && productUnitId) {
                const eligibleLotIds = eligibleStorageLotsByUnit.get(productUnitId);
                if (!eligibleLotIds?.has(movementMmLotId)) return;
            }
            const batchNo = mov.batch_no || "LOT-N/A";
            const qty = Number(mov.quantity || 0);

            if (pId) {
                const key = `${pId}:${batchNo}`;
                movementStockMap.set(key, (movementStockMap.get(key) || 0) + qty);
            }
            });

        // Compute onHand stock per product (summing only Passed / Partially Accepted batches using ledger quantities)
        const onHandMap: Record<number, number> = {};
        movementStockMap.forEach((qty, key) => {
            if (qty > 0) {
                const parts = key.split(":");
                const pId = Number(parts[0]);
                const batchNo = parts[1];
                const status = batchStatusMap.get(`${pId}:${batchNo}`) || "Passed"; // Default to Passed for legacy stock
                if (status === "Passed" || status === "Partially Accepted") {
                    onHandMap[pId] = (onHandMap[pId] || 0) + qty;
                }
            }
        });

        // Resolve recommended lot numbers from every eligible movement-backed batch.
        // Receipt metadata is used for QA status, but a purchase receipt is not
        // required because stock adjustments and manufacturing yields also create
        // valid inventory movement balances.
        const recommendedLotsByProduct = new Map<number, Map<string, number>>();
        movementStockMap.forEach((ledgerQty, key) => {
            if (ledgerQty <= 0) return;

            const separatorIndex = key.indexOf(":");
            const pId = Number(separatorIndex >= 0 ? key.slice(0, separatorIndex) : key);
            const batchNo = separatorIndex >= 0 ? key.slice(separatorIndex + 1) : "LOT-N/A";
            const status = batchStatusMap.get(`${pId}:${batchNo}`) || "Passed";
            if (status !== "Passed" && status !== "Partially Accepted") return;

            const alreadyReserved = lotReservationsMap[`${pId}:${batchNo}`] || 0;
            const netAvailable = Math.max(0, ledgerQty - alreadyReserved);
            if (netAvailable <= 0) return;

            if (!recommendedLotsByProduct.has(pId)) {
                recommendedLotsByProduct.set(pId, new Map<string, number>());
            }
            const lots = recommendedLotsByProduct.get(pId)!;
            lots.set(batchNo, (lots.get(batchNo) || 0) + netAvailable);
        });

        const enrichedProducts = [];
        for (const p of products) {
            const pId = Number(p.product_id);
            const onHand = onHandMap[pId] || 0;
            const safetyStock = Number(p.maintaining_quantity || 0);

            const parentVal = p.parent_id;
            const parentId = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);

            const isSubAssembly = Number(p.product_type) === 388 || versionProductIds.has(pId) || (parentId !== null && versionProductIds.has(parentId));

            const recommendedLots = Array.from(recommendedLotsByProduct.get(pId)?.entries() || [])
                .map(([lotNo, available]) => ({ lot_no: lotNo, available }));

            const availableOnHand = isSubAssembly
                ? onHand
                : recommendedLots.reduce((sum, lot) => sum + Number(lot.available || 0), 0);

            const uomId = Number(p.unit_of_measurement?.unit_id || p.unit_of_measurement || 0);
            const unitObj = unitsMap.get(uomId) || (typeof p.unit_of_measurement === "object" ? p.unit_of_measurement : null);
            const uomName = unitObj?.unit_name || unitObj?.unit_shortcut || "Pieces";
            const uomShortcut = unitObj?.unit_shortcut || unitObj?.unit_name || "PCS";

            enrichedProducts.push({
                product_id: pId,
                product_name: p.product_name,
                product_code: p.product_code,
                uom_name: uomName,
                uom_shortcut: uomShortcut,
                unit_of_measurement: uomName,
                on_hand: availableOnHand,
                safety_stock: safetyStock,
                recommended_lots: recommendedLots
            });
        }

        return enrichedProducts;
    } catch (e) {
        console.error("Error in getProductInventoryAndSafetyStock:", e);
        if (e instanceof MmInventoryMovementError) throw e;
        return [];
    }
}
