/* eslint-disable */
import { DIRECTUS_URL, headers } from "./shared";
import { getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";

export async function getProductInventoryAndSafetyStock(productIds: number[], branchId: number) {
    if (!branchId) {
        throw new Error("Missing required branchId in getProductInventoryAndSafetyStock");
    }
    try {
        const bId = Number(branchId);
        const prodFilter = productIds.length > 0 ? `&filter[product_id][_in]=${productIds.join(",")}` : "";
        const prodRes = await fetch(`${DIRECTUS_URL}/items/products?limit=-1${prodFilter}&fields=product_id,product_name,product_code,maintaining_quantity`, { headers, cache: "no-store" });
        const products = prodRes.ok ? (await prodRes.json()).data || [] : [];

        // 1. Fetch PO Receivings to resolve QA status for raw materials
        const recFilter = productIds.length > 0 ? `filter[product_id][_in]=${productIds.join(",")}&` : "";
        const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?${recFilter}filter[branch_id][_eq]=${bId}&limit=-1`, { headers, cache: "no-store" });
        const receipts = recRes.ok ? (await recRes.json()).data || [] : [];
        const batchStatusMap = new Map<string, string>();
        const batchExpiryMap = new Map<string, string>();
        receipts.forEach((rec: any) => {
            const pId = Number(rec.product_id?.product_id || rec.product_id);
            const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim() || "LOT-N/A";
            const key = `${pId}:${batchNo}`;
            batchStatusMap.set(key, rec.qa_status || "Passed");
            if (rec.expiry_date) batchExpiryMap.set(key, rec.expiry_date);
        });

        // 2. Fetch Yield Ledger logs to resolve QA status for finished goods
        const yieldFilter = productIds.length > 0 ? `filter[job_order_id][product_id][_in]=${productIds.join(",")}&` : "";
        const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?${yieldFilter}fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
        const yields = yieldRes.ok ? (await yieldRes.json()).data || [] : [];
        yields.forEach((yl: any) => {
            const pId = Number(yl.job_order_id?.product_id);
            if (!pId) return;
            const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
            const key = `${pId}:${batchNo}`;
            batchStatusMap.set(key, yl.qa_status || "Pending");
            if (yl.expiry_date) batchExpiryMap.set(key, yl.expiry_date);
        });

        // 3. Fetch inventory movements to calculate the true ledger stock
        const movFilter = encodeURIComponent(JSON.stringify({
            _and: [
                ...(productIds.length > 0 ? [{ product_id: { _in: productIds } }] : []),
                { branch_id: { _eq: bId } }
            ]
        }));
        const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
        const movements = movRes.ok ? (await movRes.json()).data || [] : [];
        
        const movementStockMap = new Map<string, number>(); // "productId:batchNo" -> sum of quantity
        movements.forEach((mov: any) => {
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

        // Resolve recommended lot numbers for raw materials
        const enrichedProducts = [];
        for (const p of products) {
            const pId = Number(p.product_id);
            const onHand = onHandMap[pId] || 0;
            const safetyStock = Number(p.maintaining_quantity || 0);

            // Check if it is a sub-assembly
            const activeVer = await getActiveVersionForProduct(pId);
            const isSubAssembly = activeVer && activeVer.version;

            let recommendedLots: any[] = [];
            if (!isSubAssembly) {
                const branchFilter = branchId ? `&filter[branch_id][_eq]=${branchId}` : "";
                const receiptsUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${pId}&filter[qa_status][_in]=Passed,Partially Accepted&filter[is_reverted][_eq]=0&filter[received_quantity][_gt]=0${branchFilter}&sort=expiry_date`;
                
                const receiptsRes = await fetch(receiptsUrl, { headers, cache: "no-store" });
                const validReceipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];

                const receiptIds = validReceipts.map((r: any) => r.purchase_order_product_id).filter(Boolean);
                const reservationsMap: Record<number, number> = {};

                if (receiptIds.length > 0) {
                    try {
                        const resFilter = encodeURIComponent(JSON.stringify({
                            _and: [
                                { purchase_order_receiving_id: { _in: receiptIds } },
                                { jo_material_id: { job_order_id: { status: { _in: ["Planned", "Draft", "Released", "In Progress", "Ongoing", "Proceed", "On Hold"] } } } }
                            ]
                        }));
                        const resRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${resFilter}&fields=purchase_order_receiving_id,reserved_quantity&limit=-1`, { headers, cache: "no-store" });
                        if (resRes.ok) {
                            const resData = (await resRes.json()).data || [];
                            resData.forEach((r: any) => {
                                const porId = Number(r.purchase_order_receiving_id);
                                if (porId) {
                                    reservationsMap[porId] = (reservationsMap[porId] || 0) + Number(r.reserved_quantity || 0);
                                }
                            });
                        }
                    } catch (err) {
                        console.error("Error fetching reservations for net-requirements:", err);
                    }
                }

                validReceipts.forEach((rec: any) => {
                    const lotNo = rec.lot_no || rec.batch_no || "LOT-N/A";
                    const physicalQty = movementStockMap.get(`${pId}:${lotNo}`) || 0;
                    const recId = Number(rec.purchase_order_product_id);
                    const alreadyReserved = reservationsMap[recId] || 0;
                    const netAvailable = Math.max(0, physicalQty - alreadyReserved);

                    if (netAvailable > 0) {
                        recommendedLots.push({
                            lot_no: lotNo,
                            available: netAvailable
                        });
                    }
                });
            } else {
                // If it is a sub-assembly, we can recommend its manufactured batches directly from movementStockMap
                movementStockMap.forEach((ledgerQty, key) => {
                    const parts = key.split(":");
                    const keyPId = Number(parts[0]);
                    const lotNum = parts[1] || "LOT-N/A";
                    if (keyPId === pId && ledgerQty > 0) {
                        const status = batchStatusMap.get(`${pId}:${lotNum}`) || "Passed";
                        if (status === "Passed" || status === "Partially Accepted") {
                            recommendedLots.push({
                                lot_no: lotNum,
                                available: ledgerQty
                            });
                        }
                    }
                });
            }

            const availableOnHand = isSubAssembly
                ? onHand
                : recommendedLots.reduce((sum, lot) => sum + Number(lot.available || 0), 0);

            enrichedProducts.push({
                product_id: pId,
                product_name: p.product_name,
                product_code: p.product_code,
                on_hand: availableOnHand,
                safety_stock: safetyStock,
                recommended_lots: recommendedLots
            });
        }

        return enrichedProducts;
    } catch (e) {
        console.error("Error in getProductInventoryAndSafetyStock:", e);
        return [];
    }
}
