/* eslint-disable */
import { DIRECTUS_URL, headers } from "./shared";
import { getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";
import { fetchMmInventoryMovements, MmInventoryMovementError } from "../../services/mm-inventory-movements.service";

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
        const validReceiptsFilter = encodeURIComponent(JSON.stringify({
            _and: [
                ...(allProductIds.length > 0 ? [{ product_id: { _in: allProductIds } }] : []),
                { branch_id: { _eq: bId } },
                { qa_status: { _in: ["Passed", "Partially Accepted"] } },
                { is_reverted: { _eq: 0 } },
                { received_quantity: { _gt: 0 } }
            ]
        }));

        const versionFilter = encodeURIComponent(JSON.stringify({
            product_id: { _in: versionCheckProductIds.length > 0 ? versionCheckProductIds : [0] }
        }));

        const productTypeIds = new Set<number>(
            products
                .map((product: any) => Number(product.product_type?.id || product.product_type || 0))
                .filter((productTypeId: number) => productTypeId > 0)
        );
        const movementProductType = productTypeIds.size === 1 ? [...productTypeIds][0] : null;

        const [recRes, yieldRes, movements, versionsRes, validReceiptsRes, unitsRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?${recFilter}filter[branch_id][_eq]=${bId}&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?${yieldFilter}fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" }),
            fetchMmInventoryMovements({
                branch: bId,
                product: allProductIds.length === 1 ? allProductIds[0] : null,
                productType: movementProductType
            }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${versionFilter}&fields=product_id&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter=${validReceiptsFilter}&sort=expiry_date&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" })
        ]);

        const receipts = recRes.ok ? (await recRes.json()).data || [] : [];
        const yields = yieldRes.ok ? (await yieldRes.json()).data || [] : [];
        const versionData = versionsRes.ok ? (await versionsRes.json()).data || [] : [];
        const validReceipts = validReceiptsRes.ok ? (await validReceiptsRes.json()).data || [] : [];
        const unitsData = unitsRes.ok ? (await unitsRes.json()).data || [] : [];

        const unitsMap = new Map<number, any>();
        unitsData.forEach((u: any) => unitsMap.set(Number(u.unit_id), u));

        const versionProductIds = new Set<number>(versionData.map((v: any) => Number(v.product_id)));

        // Map valid receipts by product_id
        const validReceiptsByProduct = new Map<number, any[]>();
        const allReceiptIds: number[] = [];
        validReceipts.forEach((r: any) => {
            const pId = Number(r.product_id?.product_id || r.product_id);
            if (pId) {
                if (!validReceiptsByProduct.has(pId)) {
                    validReceiptsByProduct.set(pId, []);
                }
                validReceiptsByProduct.get(pId)!.push(r);
            }
            const porId = Number(r.purchase_order_product_id);
            if (porId) allReceiptIds.push(porId);
        });

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

        // Resolve recommended lot numbers for raw materials and sub-assemblies
        const enrichedProducts = [];
        for (const p of products) {
            const pId = Number(p.product_id);
            const onHand = onHandMap[pId] || 0;
            const safetyStock = Number(p.maintaining_quantity || 0);

            const parentVal = p.parent_id;
            const parentId = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);

            const isSubAssembly = Number(p.product_type) === 388 || versionProductIds.has(pId) || (parentId !== null && versionProductIds.has(parentId));

            let recommendedLots: any[] = [];
            if (!isSubAssembly) {
                const prodValidReceipts = validReceiptsByProduct.get(pId) || [];

                prodValidReceipts.forEach((rec: any) => {
                    const lotNo = rec.lot_no || rec.batch_no || "LOT-N/A";
                    const physicalQty = movementStockMap.get(`${pId}:${lotNo}`) || 0;
                    const alreadyReserved = lotReservationsMap[`${pId}:${lotNo}`] || 0;
                    const netAvailable = Math.max(0, physicalQty - alreadyReserved);

                    if (netAvailable > 0) {
                        recommendedLots.push({
                            lot_no: lotNo,
                            available: netAvailable
                        });
                    }
                });
            } else {
                // If it is a sub-assembly, recommend its manufactured batches directly from movementStockMap minus reservations
                movementStockMap.forEach((ledgerQty, key) => {
                    const parts = key.split(":");
                    const keyPId = Number(parts[0]);
                    const lotNum = parts[1] || "LOT-N/A";
                    if (keyPId === pId && ledgerQty > 0) {
                        const status = batchStatusMap.get(`${pId}:${lotNum}`) || "Passed";
                        if (status === "Passed" || status === "Partially Accepted") {
                            const alreadyReserved = lotReservationsMap[`${pId}:${lotNum}`] || 0;
                            const netAvailable = Math.max(0, ledgerQty - alreadyReserved);
                            if (netAvailable > 0) {
                                recommendedLots.push({
                                    lot_no: lotNum,
                                    available: netAvailable
                                });
                            }
                        }
                    }
                });
            }

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
