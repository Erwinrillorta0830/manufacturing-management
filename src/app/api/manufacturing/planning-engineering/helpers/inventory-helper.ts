/* eslint-disable */
import { DIRECTUS_URL, headers } from "./shared";
import { getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";
import { fetchMmInventoryMovements, MmInventoryMovementError } from "../../services/mm-inventory-movements.service";

const ACTIVE_JOB_ORDER_STATUSES = ["Planned", "Draft", "Released", "In Progress", "Ongoing", "Proceed", "On Hold"];

export interface AvailableInventoryLot {
    batchNo: string;
    mmLotId: number | null;
    inventoryLotId: number | null;
    purchaseOrderReceivingId: number | null;
    available: number;
}

/**
 * Return the movement-backed lots that can be reserved for a raw material.
 *
 * Purchase receipts provide QA metadata when available, but they are not the
 * inventory source. Posted stock adjustments, transfers, and other movement
 * sources must also be reservable when their net movement balance is positive.
 */
export async function getAvailableInventoryLots(productId: number, branchId: number): Promise<AvailableInventoryLot[]> {
    if (!productId || !branchId) {
        throw new Error("Missing required productId or branchId in getAvailableInventoryLots");
    }

    const numericProductId = Number(productId);
    const numericBranchId = Number(branchId);
    const [movements, receiptsRes, yieldsRes, reservationsRes] = await Promise.all([
        fetchMmInventoryMovements({
            branch: numericBranchId,
            product: numericProductId
        }),
        fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${numericProductId}&filter[branch_id][_eq]=${numericBranchId}&fields=purchase_order_product_id,product_id,batch_no,lot_no,qa_status,is_reverted,received_quantity,mm_lot_id&limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${numericProductId}&fields=lot_number,qa_status,job_order_id.product_id&limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: numericProductId } },
                { jo_material_id: { job_order_id: { status: { _in: ACTIVE_JOB_ORDER_STATUSES } } } }
            ]
        }))}&fields=product_id,batch_no,mm_lot_id,reserved_quantity&limit=-1`, { headers, cache: "no-store" })
    ]);

    const receipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];
    const yields = yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];
    const reservations = reservationsRes.ok ? (await reservationsRes.json()).data || [] : [];

    const batchStatusMap = new Map<string, string>();
    const receiptByBatch = new Map<string, number>();
    const receiptMmLotByBatch = new Map<string, number>();

    receipts.forEach((receipt: any) => {
        const receiptProductId = Number(receipt.product_id?.product_id || receipt.product_id);
        if (receiptProductId !== numericProductId) return;
        const batchNo = String(receipt.batch_no || receipt.lot_no || "LOT-N/A").trim() || "LOT-N/A";
        const key = `${receiptProductId}:${batchNo}`;
        batchStatusMap.set(key, receipt.qa_status || "Passed");

        const receiptId = Number(receipt.purchase_order_product_id);
        if (receiptId > 0 && !receiptByBatch.has(batchNo)) receiptByBatch.set(batchNo, receiptId);
        const receiptMmLotId = Number(receipt.mm_lot_id);
        if (receiptMmLotId > 0 && !receiptMmLotByBatch.has(batchNo)) receiptMmLotByBatch.set(batchNo, receiptMmLotId);
    });

    yields.forEach((yieldRow: any) => {
        const yieldProductId = Number(yieldRow.job_order_id?.product_id || numericProductId);
        if (yieldProductId !== numericProductId) return;
        const batchNo = String(yieldRow.lot_number || "LOT-N/A").trim() || "LOT-N/A";
        batchStatusMap.set(`${yieldProductId}:${batchNo}`, yieldRow.qa_status || "Pending");
    });

    const movementBalances = new Map<string, {
        batchNo: string;
        mmLotId: number | null;
        inventoryLotId: number | null;
        quantity: number;
    }>();

    movements.forEach((movement: any) => {
        const movementProductId = Number(movement.product_id?.product_id || movement.product_id || movement.productId);
        if (movementProductId !== numericProductId) return;

        const batchNo = String(movement.batch_no || movement.batchNo || "LOT-N/A").trim() || "LOT-N/A";
        const mmLotValue = Number(movement.mm_lot_id ?? movement.mmLotId ?? movement.lot_id ?? movement.lotId ?? 0);
        const mmLotId = mmLotValue > 0 ? mmLotValue : null;
        const inventoryLotValue = Number(movement.inventory_lot_id ?? movement.inventoryLotId ?? 0);
        const inventoryLotId = inventoryLotValue > 0 ? inventoryLotValue : null;
        const key = `${mmLotId ?? "NO-MM-LOT"}:${batchNo}`;
        const existing = movementBalances.get(key);
        const quantity = Number(movement.quantity || 0);

        if (existing) {
            existing.quantity += quantity;
        } else {
            movementBalances.set(key, {
                batchNo,
                mmLotId,
                inventoryLotId,
                quantity
            });
        }
    });

    const exactReservations = new Map<string, number>();
    const batchOnlyReservations = new Map<string, number>();
    reservations.forEach((reservation: any) => {
        const batchNo = String(reservation.batch_no || "LOT-N/A").trim() || "LOT-N/A";
        const quantity = Number(reservation.reserved_quantity || 0);
        if (quantity <= 0) return;

        const mmLotValue = Number(reservation.mm_lot_id ?? 0);
        if (mmLotValue > 0) {
            const key = `${mmLotValue}:${batchNo}`;
            exactReservations.set(key, (exactReservations.get(key) || 0) + quantity);
        } else {
            batchOnlyReservations.set(batchNo, (batchOnlyReservations.get(batchNo) || 0) + quantity);
        }
    });

    const lotsByBatch = new Map<string, Array<{
        key: string;
        batchNo: string;
        mmLotId: number | null;
        inventoryLotId: number | null;
        quantity: number;
    }>>();
    movementBalances.forEach((balance, key) => {
        if (balance.quantity <= 0) return;
        const status = batchStatusMap.get(`${numericProductId}:${balance.batchNo}`) || "Passed";
        if (status !== "Passed" && status !== "Partially Accepted") return;

        if (!lotsByBatch.has(balance.batchNo)) lotsByBatch.set(balance.batchNo, []);
        lotsByBatch.get(balance.batchNo)!.push({ key, ...balance });
    });

    const availableLots: AvailableInventoryLot[] = [];
    lotsByBatch.forEach((batchLots, batchNo) => {
        let batchOnlyReserved = batchOnlyReservations.get(batchNo) || 0;

        batchLots.forEach((lot) => {
            const exactReserved = exactReservations.get(lot.key) || 0;
            const exactAvailable = Math.max(0, lot.quantity - exactReserved);
            const fallbackReserved = Math.min(batchOnlyReserved, exactAvailable);
            batchOnlyReserved -= fallbackReserved;
            const available = exactAvailable - fallbackReserved;
            if (available <= 0) return;

            availableLots.push({
                batchNo: lot.batchNo,
                mmLotId: lot.mmLotId || receiptMmLotByBatch.get(batchNo) || null,
                inventoryLotId: lot.inventoryLotId,
                purchaseOrderReceivingId: receiptByBatch.get(batchNo) || null,
                available
            });
        });
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
        const prodRes = await fetch(`${DIRECTUS_URL}/items/products?limit=-1${prodFilter}&fields=product_id,product_name,product_code,maintaining_quantity,product_type,parent_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut`, { headers, cache: "no-store" });
        const products = prodRes.ok ? (await prodRes.json()).data || [] : [];

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
                        { jo_material_id: { job_order_id: { status: { _in: ["Planned", "Draft", "Released", "In Progress", "Ongoing", "Proceed", "On Hold"] } } } }
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
