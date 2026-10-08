/* eslint-disable */
import { DIRECTUS_URL, headers } from "./shared";
import { getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";
import { fetchMmInventoryMovements, MmInventoryMovementError, type NormalizedMmInventoryMovement } from "../../services/mm-inventory-movements.service";
import { isExpired, normalizeDirectusStagingMovement } from "../../material-staging/_stock";
import { loadMmInventoryLots, loadMmLots, mmInventoryLotId, mmLotId, resolveProductUnitId } from "../../services/mm-lots.service";
import { JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";
import { getUnissuedReservationQuantity } from "./reservation-availability";

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
    storageLotName: string | null;
    mmLotId: number | null;
    inventoryLotId: number | null;
    purchaseOrderReceivingId: number | null;
    available: number;
    physicalQuantity?: number;
    expiryDate?: string | null;
    manufacturingDate?: string | null;
    qaStatus?: string | null;
}

const RESERVABLE_QA_STATUSES = new Set([
    "GOOD",
    "PASSED",
    "PASS",
    "APPROVED",
    "PARTIALLY_ACCEPTED"
]);

const INVENTORY_MOVEMENT_REQUEST_CONCURRENCY = 2;

async function fetchDirectusMovementFallback(
    productIds: number[],
    branchId: number
): Promise<NormalizedMmInventoryMovement[]> {
    if (productIds.length === 0) return [];

    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { branch_id: { _eq: branchId } },
            { product_id: { _in: productIds } }
        ]
    }));

    try {
        const response = await fetch(
            `${DIRECTUS_URL}/items/inventory_movements?filter=${filter}&fields=*&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!response.ok) return [];

        const payload = await response.json().catch(() => null);
        const rows = payload && typeof payload === "object" && Array.isArray((payload as any).data)
            ? (payload as { data: Record<string, unknown>[] }).data
            : [];

        return rows.map((row) => normalizeDirectusStagingMovement(row) as unknown as NormalizedMmInventoryMovement);
    } catch (error) {
        console.warn("Directus inventory movement fallback could not be loaded:", error);
        return [];
    }
}

async function mapWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    task: (value: T) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), values.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await task(values[index]);
        }
    }));

    return results;
}

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

function isGoodQaStatus(value: unknown): boolean {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") === "GOOD";
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
    /** Set false when planning must use physical stock without subtracting other JO reservations. */
    includeReservations?: boolean;
    /** Require an explicit GOOD QA status rather than the broader reservable status set. */
    requireGoodQa?: boolean;
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
    const reservationsResPromise = options.includeReservations === false
        ? Promise.resolve<Response | null>(null)
        : fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: numericProductId } },
                { branch_id: { _eq: numericBranchId } },
                { jo_material_id: { job_order_id: { status: { _in: ACTIVE_JOB_ORDER_STATUSES } } } }
            ]
        }))}&fields=product_id,batch_no,mm_lot_id,inventory_lot_id,reserved_quantity,staged_quantity,issued_to_wip_quantity&limit=-1`, { headers, cache: "no-store" });
    const [springMovements, receiptsRes, yieldsRes, reservationsRes, eligibleStorageLots, inventoryLots, directusMovementsRes] = await Promise.all([
        movementRowsPromise,
        fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${numericProductId}&filter[branch_id][_eq]=${numericBranchId}&fields=purchase_order_product_id,product_id,batch_no,lot_no,qa_status,is_reverted,received_quantity,mm_lot_id,expiry_date,manufacturing_date,created_at&limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${numericProductId}&fields=lot_number,qa_status,job_order_id.product_id&limit=-1`, { headers, cache: "no-store" }),
        reservationsResPromise,
        loadMmLots({ branchId: numericBranchId, unitId: productUnitId }),
        loadMmInventoryLots({ branchId: numericBranchId, productId: numericProductId, onlyActive: true }),
        fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[branch_id][_eq]=${numericBranchId}&filter[product_id][_eq]=${numericProductId}&fields=*&limit=-1`, { headers, cache: "no-store" }).catch(() => null)
    ]);
    const eligibleStorageLotIds = new Set(
        eligibleStorageLots
            .map((lot) => mmLotId(lot.lot_id))
            .filter((lotId): lotId is number => lotId !== null)
    );
    const storageLotNamesById = new Map<number, string>();
    eligibleStorageLots.forEach((lot) => {
        const storageLotId = mmLotId(lot.lot_id);
        const storageLotName = String(lot.lot_name || "").trim();
        if (storageLotId !== null && storageLotName) storageLotNamesById.set(storageLotId, storageLotName);
    });

    const receipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];
    const yields = yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];
    const reservations = reservationsRes?.ok ? (await reservationsRes.json()).data || [] : [];
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
        const qaStatus = canonicalInventory?.qaStatus || batchStatusMap.get(`${numericProductId}:${batchKey(batchNo)}`) || null;

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
        // Staged/issued stock has already reduced the movement-backed Main
        // Store balance. Only deduct the still-unissued portion of a JO reserve.
        const quantity = getUnissuedReservationQuantity(
            reservation.reserved_quantity,
            reservation.staged_quantity,
            reservation.issued_to_wip_quantity
        );
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
        const qaEligible = options.requireGoodQa
            ? isGoodQaStatus(balance.qaStatus)
            : isReservableQaStatus(balance.qaStatus);
        if (!qaEligible || isExpired(balance.expiryDate)) return;

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
                storageLotName: lot.mmLotId ? storageLotNamesById.get(lot.mmLotId) || null : null,
                mmLotId: lot.mmLotId,
                inventoryLotId: lot.inventoryLotId,
                purchaseOrderReceivingId: lot.mmLotId
                    ? receiptByMmLotBatch.get(`${lot.mmLotId}:${normalizedBatch}`) || receiptByBatch.get(normalizedBatch) || null
                    : receiptByBatch.get(normalizedBatch) || null,
                available,
                physicalQuantity: lot.quantity,
                expiryDate: lot.expiryDate,
                manufacturingDate: lot.manufacturingDate,
                qaStatus: lot.qaStatus
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

export interface ProductInventoryOptions {
    /** Set false when planning must use physical stock without subtracting other JO reservations. */
    includeReservations?: boolean;
    /** Use branch-scoped SOFT/PARTIAL reservations and fail if that ledger cannot be read. */
    reservationAware?: boolean;
}

export interface AvailableInventoryBreakdownRow {
    product_id: number;
    lot_id: number | null;
    lot_name: string | null;
    inventory_lot_id: number | null;
    batch_no: string;
    available: number;
    expiry_date: string | null;
    manufacturing_date: string | null;
}

export interface InventoryBreakdownBalance extends AvailableInventoryBreakdownRow {
    quantity: number;
    qa_status: string | null;
}

export interface InventoryBreakdownReservation {
    product_id: number;
    lot_id: number | null;
    inventory_lot_id: number | null;
    batch_no: string;
    quantity: number;
}

function compareInventoryDates(left: string | null, right: string | null): number {
    const leftDate = left ? Date.parse(left) : Number.MAX_SAFE_INTEGER;
    const rightDate = right ? Date.parse(right) : Number.MAX_SAFE_INTEGER;
    const safeLeft = Number.isFinite(leftDate) ? leftDate : Number.MAX_SAFE_INTEGER;
    const safeRight = Number.isFinite(rightDate) ? rightDate : Number.MAX_SAFE_INTEGER;
    return safeLeft - safeRight;
}

/** Calculates displayable stock by exact inventory lot, storage lot, and batch. */
export function buildAvailableLotBreakdown(
    balances: InventoryBreakdownBalance[],
    reservations: InventoryBreakdownReservation[]
): AvailableInventoryBreakdownRow[] {
    const sortedBalances = balances
        .filter((balance) => {
            const quantity = Number(balance.quantity);
            return Number.isFinite(quantity)
                && quantity > 0
                && isReservableQaStatus(balance.qa_status || "Passed");
        })
        .map((balance) => ({ ...balance, available: Math.max(0, Number(balance.quantity)) }))
        .sort((left, right) =>
            compareInventoryDates(left.expiry_date, right.expiry_date)
            || compareInventoryDates(left.manufacturing_date, right.manufacturing_date)
            || (left.lot_id || Number.MAX_SAFE_INTEGER) - (right.lot_id || Number.MAX_SAFE_INTEGER)
            || (left.inventory_lot_id || Number.MAX_SAFE_INTEGER) - (right.inventory_lot_id || Number.MAX_SAFE_INTEGER)
            || batchKey(left.batch_no).localeCompare(batchKey(right.batch_no))
        );

    const reservationGroups = new Map<string, {
        scope: "inventory" | "lot" | "batch" | "product";
        productId: number;
        identity: number | null;
        batch: string | null;
        quantity: number;
    }>();
    const addReservation = (
        scope: "inventory" | "lot" | "batch" | "product",
        productId: number,
        identity: number | null,
        batch: string | null,
        quantity: number
    ) => {
        const key = JSON.stringify([scope, productId, identity, batch]);
        const current = reservationGroups.get(key);
        reservationGroups.set(key, {
            scope,
            productId,
            identity,
            batch,
            quantity: (current?.quantity || 0) + quantity
        });
    };

    reservations.forEach((reservation) => {
        const quantity = Number(reservation.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || !reservation.product_id) return;

        const normalizedBatch = batchKey(reservation.batch_no);
        const hasBatch = normalizedBatch !== batchKey("LOT-N/A");
        if (reservation.inventory_lot_id !== null) {
            addReservation("inventory", reservation.product_id, reservation.inventory_lot_id, null, quantity);
        } else if (reservation.lot_id !== null) {
            addReservation("lot", reservation.product_id, reservation.lot_id, hasBatch ? normalizedBatch : null, quantity);
        } else if (hasBatch) {
            addReservation("batch", reservation.product_id, null, normalizedBatch, quantity);
        } else {
            addReservation("product", reservation.product_id, null, null, quantity);
        }
    });

    const allocate = (quantity: number, matches: (balance: AvailableInventoryBreakdownRow) => boolean) => {
        let remaining = quantity;
        if (remaining <= 0) return;

        sortedBalances.forEach((balance) => {
            if (remaining <= 0 || !matches(balance) || balance.available <= 0) return;
            const reserved = Math.min(balance.available, remaining);
            balance.available -= reserved;
            remaining -= reserved;
        });
    };

    const reservationPriority = { inventory: 0, lot: 1, batch: 2, product: 3 };
    const orderedReservations = [...reservationGroups.values()].sort(
        (left, right) => reservationPriority[left.scope] - reservationPriority[right.scope]
    );
    for (const reservation of orderedReservations) {
        if (reservation.quantity <= 0) continue;
        if (reservation.scope === "inventory") {
            allocate(reservation.quantity, (balance) =>
                balance.product_id === reservation.productId
                && balance.inventory_lot_id === reservation.identity
            );
        } else if (reservation.scope === "lot") {
            allocate(reservation.quantity, (balance) =>
                balance.product_id === reservation.productId
                && balance.lot_id === reservation.identity
                && (reservation.batch === null || batchKey(balance.batch_no) === reservation.batch)
            );
        } else if (reservation.scope === "batch") {
            allocate(reservation.quantity, (balance) =>
                balance.product_id === reservation.productId
                && batchKey(balance.batch_no) === reservation.batch
            );
        } else if (reservation.scope === "product") {
            allocate(reservation.quantity, (balance) => balance.product_id === reservation.productId);
        }
    }

    return sortedBalances
        .filter((balance) => balance.available > 0)
        .map(({ product_id, lot_id, lot_name, inventory_lot_id, batch_no, available, expiry_date, manufacturing_date }) => ({
            product_id,
            lot_id,
            lot_name,
            inventory_lot_id,
            batch_no,
            available,
            expiry_date,
            manufacturing_date
        }));
}

export class InventoryReservationError extends Error {
    readonly code = "INVENTORY_RESERVATIONS_UNAVAILABLE";
    readonly status = 503;

    constructor() {
        super("Unable to load active Job Order reservations for inventory availability.");
        this.name = "InventoryReservationError";
    }
}

export async function getProductInventoryAndSafetyStock(
    productIds: number[],
    branchId: number,
    options: ProductInventoryOptions = {}
) {
    if (!branchId) {
        throw new Error("Missing required branchId in getProductInventoryAndSafetyStock");
    }
    if (productIds.length === 0) return [];
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
        const storageLotNamesById = new Map<number, string>();
        await Promise.all(uniqueUnitIds.map(async (unitId) => {
            try {
                const lots = await loadMmLots({ branchId: Number(branchId), unitId });
                eligibleStorageLotsByUnit.set(unitId, new Set(
                    lots
                        .map((lot) => mmLotId(lot.lot_id))
                        .filter((lotId): lotId is number => lotId !== null)
                ));
                lots.forEach((lot) => {
                    const lotId = mmLotId(lot.lot_id);
                    const lotName = String(lot.lot_name || "").trim();
                    if (lotId !== null && lotName) storageLotNamesById.set(lotId, lotName);
                });
            } catch (error) {
                console.error(`Error loading UOM-compatible storage lots for unit ${unitId}:`, error);
                eligibleStorageLotsByUnit.set(unitId, new Set());
            }
        }));

        const allProductIds: number[] = productIds.length > 0
            ? productIds
            : products.map((p: any) => Number(p.product_id)).filter((id: number) => id > 0);

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
        const inventoryLotFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _in: allProductIds.length > 0 ? allProductIds : [0] } },
                { branch_id: { _eq: bId } },
                { status: { _eq: "ACTIVE" } }
            ]
        }));

        const productTypeIds = new Set<number>(
            products
                .map((product: any) => Number(product.product_type?.id || product.product_type || 0))
                .filter((productTypeId: number) => productTypeId > 0)
        );
        const movementProductType = productTypeIds.size === 1 ? [...productTypeIds][0] : null;

        // Request only the products used by this BOM. Fetching the complete
        // branch ledger for a multi-material BOM can take longer than the
        // wizard's client timeout even though the final response is valid.
        const movementResponsesPromise = allProductIds.length > 0
            ? mapWithConcurrency(
                allProductIds,
                INVENTORY_MOVEMENT_REQUEST_CONCURRENCY,
                (productId) => fetchMmInventoryMovements({
                    branch: bId,
                    product: productId,
                    productType: movementProductType
                })
            ).catch(async (error) => {
                if (!(error instanceof MmInventoryMovementError) || error.status !== 429) throw error;

                console.warn("Spring inventory movements are rate-limited; using the Directus movement fallback for the planning preview.");
                return [await fetchDirectusMovementFallback(allProductIds, bId)];
            })
            : fetchMmInventoryMovements({
                branch: bId,
                product: null,
                productType: movementProductType
            }).then((rows) => [rows]);

        const [recRes, yieldRes, movementResponses, versionsRes, unitsRes, inventoryLotsRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?${recFilter}filter[branch_id][_eq]=${bId}&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?${yieldFilter}fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" }),
            movementResponsesPromise,
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${versionFilter}&fields=product_id&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/mm_inventory_lots?filter=${inventoryLotFilter}&fields=inventory_lot_id,product_id,branch_id,lot_id,batch_no,qa_status,expiry_date,manufacturing_date,status&limit=-1`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        const receipts = recRes.ok ? (await recRes.json()).data || [] : [];
        const yields = yieldRes.ok ? (await yieldRes.json()).data || [] : [];
        const movements = movementResponses.flat();
        const versionData = versionsRes.ok ? (await versionsRes.json()).data || [] : [];
        const unitsData = unitsRes.ok ? (await unitsRes.json()).data || [] : [];
        const inventoryLotData = inventoryLotsRes?.ok ? (await inventoryLotsRes.json()).data || [] : [];

        const inventoryLotMetadataById = new Map<number, {
            inventoryLotId: number;
            productId: number;
            mmLotId: number | null;
            batchNo: string;
            qaStatus: string | null;
            expiryDate: string | null;
            manufacturingDate: string | null;
        }>();
        const inventoryLotsByLocationAndBatch = new Map<string, Array<{ inventoryLotId: number; mmLotId: number; batchNo: string }>>();
        inventoryLotData.forEach((inventoryLot: any) => {
            const inventoryLotId = mmInventoryLotId(inventoryLot.inventory_lot_id ?? inventoryLot.id);
            const productId = productIdFrom(inventoryLot.product_id);
            const inventoryBranchId = relationId(inventoryLot.branch_id, ["branch_id", "id"]);
            const storageLotId = mmLotId(inventoryLot.lot_id);
            if (!inventoryLotId || !productId || inventoryBranchId !== bId) return;

            const metadata = {
                inventoryLotId,
                productId,
                mmLotId: storageLotId,
                batchNo: batchText(inventoryLot.batch_no),
                qaStatus: String(inventoryLot.qa_status || "").trim() || null,
                expiryDate: String(inventoryLot.expiry_date || "").trim() || null,
                manufacturingDate: String(inventoryLot.manufacturing_date || "").trim() || null
            };
            inventoryLotMetadataById.set(inventoryLotId, metadata);
            if (storageLotId !== null) {
                const key = `${productId}:${storageLotId}:${batchKey(metadata.batchNo)}`;
                const matchingLots = inventoryLotsByLocationAndBatch.get(key) || [];
                matchingLots.push({ inventoryLotId, mmLotId: storageLotId, batchNo: metadata.batchNo });
                inventoryLotsByLocationAndBatch.set(key, matchingLots);
            }
        });

        const unitsMap = new Map<number, any>();
        unitsData.forEach((u: any) => unitsMap.set(Number(u.unit_id), u));

        const versionProductIds = new Set<number>(versionData.map((v: any) => Number(v.product_id)));

        // Batch fetch reservations for all products by product_id & batch_no
        const lotReservationsMap: Record<string, number> = {};
        const productReservationsMap: Record<number, number> = {};
        const availableLotReservations: InventoryBreakdownReservation[] = [];
        if (options.includeReservations !== false && allProductIds.length > 0) {
            try {
                const reservationFilters: Record<string, unknown>[] = [
                    { product_id: { _in: allProductIds } },
                    { jo_material_id: { job_order_id: { status: { _in: ACTIVE_JOB_ORDER_STATUSES } } } }
                ];
                if (options.reservationAware) {
                    reservationFilters.push(
                        { branch_id: { _eq: bId } },
                        { reservation_status: { _in: ["SOFT", "PARTIAL"] } }
                    );
                }
                const resFilter = encodeURIComponent(JSON.stringify({
                    _and: reservationFilters
                }));
                // Keep this field list aligned with the reservation-aware
                // availability helper. Asking for purchase_order_receiving_id
                // makes Directus reject the entire query for the manufacturing
                // service token, which previously made reservations disappear
                // from the wizard while initialization still saw them.
                const reservationFields = options.reservationAware
                    ? "product_id,batch_no,mm_lot_id,inventory_lot_id,reserved_quantity,staged_quantity,issued_to_wip_quantity,reservation_status"
                    : "product_id,batch_no,mm_lot_id,inventory_lot_id,reserved_quantity";
                const resRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${resFilter}&fields=${reservationFields}&limit=-1`, { headers, cache: "no-store" });
                if (!resRes.ok) {
                    if (options.reservationAware) throw new InventoryReservationError();
                    console.error(`Reservation query failed while loading inventory availability (HTTP ${resRes.status}).`);
                }
                if (resRes.ok) {
                    const payload = await resRes.json().catch(() => null);
                    if (!Array.isArray(payload?.data)) {
                        if (options.reservationAware) throw new InventoryReservationError();
                        throw new Error("Reservation response did not include rows.");
                    }
                    const resData = payload.data;
                    resData.forEach((r: any) => {
                        const pId = options.reservationAware
                            ? productIdFrom(r.product_id)
                            : Number(r.product_id);
                        const batchNo = options.reservationAware ? batchText(r.batch_no) : r.batch_no;
                        const reservationStatus = String(r.reservation_status || "").trim().toUpperCase();
                        if (options.reservationAware && reservationStatus !== "SOFT" && reservationStatus !== "PARTIAL") return;
                        const quantity = options.reservationAware
                            ? getUnissuedReservationQuantity(
                                r.reserved_quantity,
                                r.staged_quantity,
                                r.issued_to_wip_quantity
                            )
                            : Number(r.reserved_quantity || 0);
                        if (pId && batchNo && quantity > 0) {
                            const key = `${pId}:${batchNo}`;
                            lotReservationsMap[key] = (lotReservationsMap[key] || 0) + quantity;
                            productReservationsMap[pId] = (productReservationsMap[pId] || 0) + quantity;

                            const reservationInventoryLotId = mmInventoryLotId(r.inventory_lot_id);
                            const inventoryMetadata = reservationInventoryLotId !== null
                                ? inventoryLotMetadataById.get(reservationInventoryLotId)
                                : undefined;
                            availableLotReservations.push({
                                product_id: pId,
                                lot_id: mmLotId(r.mm_lot_id) || inventoryMetadata?.mmLotId || null,
                                inventory_lot_id: reservationInventoryLotId,
                                batch_no: batchText(batchNo || inventoryMetadata?.batchNo),
                                quantity
                            });
                        }
                    });
                }
            } catch (err) {
                if (options.reservationAware) {
                    if (err instanceof InventoryReservationError) throw err;
                    throw new InventoryReservationError();
                }
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
        const movementLotBalances = new Map<string, InventoryBreakdownBalance>();
        movements
            .filter((movement) => allProductIds.length === 0 || allProductIds.includes(Number(movement.product_id || movement.productId || 0)))
            .forEach((mov: any) => {
            const pId = Number(mov.product_id?.product_id || mov.product_id);
            const productUnitId = productUnitIds.get(pId);
            const movementMmLotId = mmLotId(mov.mm_lot_id ?? mov.mmLotId ?? mov.lot_id ?? mov.lotId);
            const movementInventoryLotId = mmInventoryLotId(mov.inventory_lot_id ?? mov.inventoryLotId);
            const batchNo = mov.batch_no || "LOT-N/A";
            const qty = Number(mov.quantity || 0);

            const exactMetadata = movementInventoryLotId !== null
                ? inventoryLotMetadataById.get(movementInventoryLotId)
                : undefined;
            const normalizedMovementBatch = batchText(batchNo);
            const candidateMetadata = movementMmLotId !== null
                ? inventoryLotsByLocationAndBatch.get(`${pId}:${movementMmLotId}:${batchKey(normalizedMovementBatch)}`) || []
                : [];
            const uniqueMetadata = candidateMetadata.length === 1
                ? inventoryLotMetadataById.get(candidateMetadata[0].inventoryLotId)
                : undefined;
            const inventoryMetadata = exactMetadata || uniqueMetadata;
            const resolvedMmLotId = inventoryMetadata?.mmLotId ?? movementMmLotId;
            const resolvedInventoryLotId = inventoryMetadata?.inventoryLotId ?? movementInventoryLotId;
            const resolvedBatchNo = inventoryMetadata?.batchNo || normalizedMovementBatch;

            if (resolvedMmLotId !== null && productUnitId) {
                const eligibleLotIds = eligibleStorageLotsByUnit.get(productUnitId);
                if (!eligibleLotIds?.has(resolvedMmLotId)) return;
            }

            if (pId) {
                const key = `${pId}:${batchNo}`;
                movementStockMap.set(key, (movementStockMap.get(key) || 0) + qty);
            }

            if (!pId || !Number.isFinite(qty)) return;
            const lotKey = `${pId}:${resolvedMmLotId ?? "NO-LOT"}:${resolvedInventoryLotId ?? "NO-INVENTORY-LOT"}:${batchKey(resolvedBatchNo)}`;
            const existing = movementLotBalances.get(lotKey);
            const qaStatus = inventoryMetadata?.qaStatus
                || batchStatusMap.get(`${pId}:${resolvedBatchNo}`)
                || "Passed";
            const expiryDate = inventoryMetadata?.expiryDate
                || batchExpiryMap.get(`${pId}:${resolvedBatchNo}`)
                || null;
            const manufacturingDate = inventoryMetadata?.manufacturingDate || null;
            if (existing) {
                existing.quantity += qty;
                existing.qa_status = existing.qa_status || qaStatus;
                existing.expiry_date = existing.expiry_date || expiryDate;
                existing.manufacturing_date = existing.manufacturing_date || manufacturingDate;
            } else {
                movementLotBalances.set(lotKey, {
                    product_id: pId,
                    lot_id: resolvedMmLotId,
                    lot_name: resolvedMmLotId !== null ? storageLotNamesById.get(resolvedMmLotId) || null : null,
                    inventory_lot_id: resolvedInventoryLotId,
                    batch_no: resolvedBatchNo,
                    quantity: qty,
                    available: 0,
                    expiry_date: expiryDate,
                    manufacturing_date: manufacturingDate,
                    qa_status: qaStatus
                });
            }
            });

        const availableLotsByProduct = new Map<number, AvailableInventoryBreakdownRow[]>();
        for (const productId of allProductIds) {
            const productBalances = [...movementLotBalances.values()].filter((balance) => balance.product_id === productId);
            const productReservations = availableLotReservations.filter((reservation) => reservation.product_id === productId);
            availableLotsByProduct.set(productId, buildAvailableLotBreakdown(productBalances, productReservations));
        }

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
                ? Math.max(0, onHand - (options.reservationAware ? productReservationsMap[pId] || 0 : 0))
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
                available_lots: availableLotsByProduct.get(pId) || [],
                recommended_lots: recommendedLots
            });
        }

        return enrichedProducts;
    } catch (e) {
        console.error("Error in getProductInventoryAndSafetyStock:", e);
        if (e instanceof MmInventoryMovementError || e instanceof InventoryReservationError) throw e;
        return [];
    }
}
