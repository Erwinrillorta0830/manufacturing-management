/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createJobOrder } from "../planning-helper";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

const RELEASE_DRAFT_FETCH_TIMEOUT_MS = 15000;

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

            if (joData.status !== "Draft" && joData.status !== "Planned" && joData.status !== "Planning") {
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

            const receiptsByProduct = new Map<number, any[]>();
            const physicalLotsByProduct = new Map<number, any[]>();
            const movementStockMap = new Map<string, number>(); // "${productId}:${batchNo}" -> quantity
            const reservationsMap = new Map<number, number>(); // recId -> quantity
            const productNamesMap = new Map<number, string>();

            if (shortfallProductIds.length > 0) {
                // Fetch valid receipts
                const receiptsUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_in]=${shortfallProductIds.join(",")}&filter[qa_status][_in]=Passed,Partially Accepted&filter[is_reverted][_eq]=0&filter[received_quantity][_gt]=0&filter[branch_id][_eq]=${branchId}&sort=expiry_date&limit=-1`;
                const receiptsRes = await fetchWithTimeout(receiptsUrl, { headers });
                const validReceipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];
                validReceipts.forEach((rec: any) => {
                    const pId = Number(rec.product_id);
                    if (!receiptsByProduct.has(pId)) {
                        receiptsByProduct.set(pId, []);
                    }
                    receiptsByProduct.get(pId)!.push(rec);
                });

                // Fetch reservations
                const receiptIds = validReceipts.map((r: any) => r.purchase_order_product_id).filter(Boolean);
                if (receiptIds.length > 0) {
                    try {
                        const resFilter = encodeURIComponent(JSON.stringify({
                            _and: [
                                { purchase_order_receiving_id: { _in: receiptIds } },
                                { jo_material_id: { job_order_id: { status: { _in: ["Planned", "Draft", "Released", "In Progress", "Ongoing", "Proceed", "On Hold"] } } } }
                            ]
                        }));
                        const resRes = await fetchWithTimeout(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${resFilter}&fields=purchase_order_receiving_id,reserved_quantity&limit=-1`, { headers });
                        if (resRes.ok) {
                            const reservationsData = (await resRes.json()).data || [];
                            reservationsData.forEach((r: any) => {
                                const porId = Number(r.purchase_order_receiving_id);
                                if (porId) {
                                    reservationsMap.set(porId, (reservationsMap.get(porId) || 0) + Number(r.reserved_quantity || 0));
                                }
                            });
                        }
                    } catch (err) {
                        console.error("Error fetching material reservations:", err);
                    }
                }

                // Fetch inventory movements to calculate the true ledger stock
                const movFilter = encodeURIComponent(JSON.stringify({
                    _and: [
                        { product_id: { _in: shortfallProductIds } },
                        { branch_id: { _eq: branchId } }
                    ]
                }));
                const movRes = await fetchWithTimeout(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
                const movements = movRes.ok ? (await movRes.json()).data || [] : [];
                movements.forEach((mov: any) => {
                    const productId = Number(mov.product_id?.product_id || mov.product_id);
                    const batchNo = mov.batch_no || "LOT-N/A";
                    const qty = Number(mov.quantity || 0);
                    const key = `${productId}:${batchNo}`;
                    movementStockMap.set(key, (movementStockMap.get(key) || 0) + qty);
                });

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

                const validReceipts = receiptsByProduct.get(compProductId) || [];

                let newlyReservedQty = 0;
                const newAllocations = [];

                for (const rec of validReceipts) {
                    if (newlyReservedQty >= needed) break;

                    const lotNo = rec.lot_no || rec.batch_no || "LOT-N/A";
                    const physicalQty = movementStockMap.get(`${compProductId}:${lotNo}`) || 0;
                    const recId = Number(rec.purchase_order_product_id);
                    const alreadyReserved = reservationsMap.get(recId) || 0;
                    const netAvailable = Math.max(0, physicalQty - alreadyReserved);

                    if (netAvailable <= 0) continue;

                    const currentNeeded = needed - newlyReservedQty;
                    const taken = Math.min(netAvailable, currentNeeded);

                    if (taken > 0) {
                        newlyReservedQty += taken;
                        newAllocations.push({
                            purchase_order_receiving_id: recId,
                            batch_no: lotNo,
                            allocated: taken
                        });
                    }
                }

                // Save new allocations/reservations
                if (newlyReservedQty > 0) {
                    for (const alloc of newAllocations) {
                        const reservationPayload = {
                            product_id: compProductId,
                            branch_id: branchId,
                            batch_no: alloc.batch_no || null,
                            jo_material_id: mat.jo_material_id || mat.id,
                            purchase_order_receiving_id: alloc.purchase_order_receiving_id || null,
                            reserved_quantity: alloc.allocated,
                            actual_used_quantity: 0,
                            created_by: joData.created_by ? Number(joData.created_by) : null
                        };
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
                    body: JSON.stringify({ status: "Released" })
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

            // Create reservation entry
            const reservationPayload = {
                product_id: Number(productId),
                jo_material_id: Number(materialId),
                purchase_order_receiving_id: Number(receivingId),
                reserved_quantity: Number(qty),
                actual_used_quantity: 0
            };

            const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations`, {
                method: "POST",
                headers,
                body: JSON.stringify(reservationPayload)
            });

            if (!res.ok) {
                const errTxt = await res.text();
                return NextResponse.json({ error: `Failed to save materials reservation: ${errTxt}` }, { status: 500 });
            }

            // Update parent requirement row
            const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${materialId}`, { headers });
            if (matRes.ok) {
                const matData = (await matRes.json()).data;
                const newReserved = Number(matData.reserved_quantity || 0) + Number(qty);
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${materialId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ reserved_quantity: newReserved })
                });
            }

            return NextResponse.json({ success: true, message: "Material successfully reserved from lot." });
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

            // Fetch the reservation row to get the quantity being unreserved
            const resUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations/${reservationId}`;
            const resRes = await fetch(resUrl, { headers });
            if (!resRes.ok) {
                return NextResponse.json({ error: "Reservation record not found." }, { status: 404 });
            }
            const resData = (await resRes.json()).data;
            const unreservedQty = Number(resData.reserved_quantity || 0);

            // Delete the reservation row
            const delRes = await fetch(resUrl, { method: "DELETE", headers });
            if (!delRes.ok) {
                return NextResponse.json({ error: "Failed to delete reservation." }, { status: 500 });
            }

            // Update parent requirement row
            const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${materialId}`, { headers });
            if (matRes.ok) {
                const matData = (await matRes.json()).data;
                const newReserved = Math.max(0, Number(matData.reserved_quantity || 0) - unreservedQty);
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${materialId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ reserved_quantity: newReserved })
                });
            }

            return NextResponse.json({ success: true, message: "Material successfully unreserved." });
        }

        if (action === "direct-allocate") {
            const { branchId, productId, recipeVersionId, lines } = body;

            if (!branchId || !productId || !recipeVersionId || !lines || !Array.isArray(lines) || lines.length === 0) {
                return NextResponse.json({ error: "Missing required fields (branchId, productId, recipeVersionId, lines)" }, { status: 400 });
            }

            // Fetch inventory movements to calculate the true ledger stock
            const movFilter = encodeURIComponent(JSON.stringify({
                _and: [
                    { product_id: { _eq: Number(productId) } },
                    { branch_id: { _eq: Number(branchId) } }
                ]
            }));
            const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements?filter=${movFilter}&limit=-1`, { headers, cache: "no-store" });
            const movements = movRes.ok ? (await movRes.json()).data || [] : [];
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

            const totalRequested = lines.reduce((sum: number, l: any) => sum + Number(l.ordered_quantity || 0), 0);
            const totalAvailable = matchingLots.reduce((sum: number, lot: any) => sum + Number(lot.quantity || 0), 0);

            if (totalAvailable < totalRequested) {
                return NextResponse.json({
                    error: `Insufficient stock of the correct recipe version. Available: ${totalAvailable}, Requested: ${totalRequested}`
                }, { status: 400 });
            }

            // We do NOT deduct the lots from inventory_lots, product_ledger, or inventory_movements.
            // We just record the allocation logically on the Sales Order detail lines.
            const parentOrderIdsToUpdate = new Set<number>();

            for (const line of lines) {
                const detailId = Number(line.detail_id || line.id);
                const detailRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, { headers, cache: "no-store" });
                if (!detailRes.ok) continue;
                const detailData = (await detailRes.json()).data;
                if (!detailData) continue;

                const orderedQty = Number(detailData.ordered_quantity || 0);
                const unitPrice = Number(detailData.unit_price || 0);

                // Update detail
                const patchDetailRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        allocated_quantity: orderedQty,
                        allocated_amount: orderedQty * unitPrice
                    })
                });
                if (!patchDetailRes.ok) {
                    console.error(`Failed to update detail ${detailId}`);
                }

                const parentOrderId = detailData.order_id;
                if (parentOrderId) {
                    parentOrderIdsToUpdate.add(Number(parentOrderId));
                }
            }

            // Check and update affected parent orders status
            for (const parentOrderId of parentOrderIdsToUpdate) {
                const allDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${parentOrderId}&limit=-1`, { headers, cache: "no-store" });
                if (allDetailsRes.ok) {
                    const allDetails = (await allDetailsRes.json()).data || [];
                    console.log(`[Diagnostic] checking parentOrderId ${parentOrderId}, lines count: ${lines.length}`);
                    const allFullyAllocated = allDetails.every((d: any) => {
                        const detailIdVal = Number(d.detail_id || d.id);
                        const isBeingAllocated = lines.some((l: any) => Number(l.detail_id || l.id) === detailIdVal);
                        const ordered = Number(d.ordered_quantity || 0);
                        const alloc = Number(d.allocated_quantity || 0);
                        const result = isBeingAllocated || alloc >= ordered;
                        console.log(`[Diagnostic] Detail ID: ${detailIdVal}, isBeingAllocated: ${isBeingAllocated}, ordered: ${ordered}, alloc: ${alloc}, line result: ${result}`);
                        return result;
                    });
                    console.log(`[BFF Direct Allocate] Transitioning SO ${parentOrderId} to status: For Invoicing`);
                    const updateStatusRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ order_status: "For Invoicing" })
                    });
                    if (!updateStatusRes.ok) {
                        console.error(`Failed to update parent Sales Order ${parentOrderId} status to For Invoicing:`, await updateStatusRes.text());
                    }
                }
            }

            return NextResponse.json({ success: true, message: "Sales order allocation marked successfully." });
        }

        const { jo, salesOrderIds } = body;

        if (!jo || !jo.jo_id) {
            return NextResponse.json({ error: "Missing job order configuration" }, { status: 400 });
        }

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
        const dbPayload = {
            jo_id: jo.jo_id,
            order_id: jo.order_id || null,
            order_no: jo.order_no || null,
            product_id: jo.product_id,
            product_name: jo.product_name,
            quantity: jo.quantity,
            due_date: jo.due_date,
            status: jo.status || "Draft",
            is_batched: !!jo.is_batched,
            bom: jo.bom || null,
            components: jo.components || null,
            routings: jo.routings || null,
            allocation_results: jo.allocationResults || null,
            procurement_status: jo.procurementStatus || "Idle",
            branch_id: jo.branch_id || null,
            shift_option: jo.shiftOption || "8",
            daily_breakdown: jo.dailyBreakdown || null,
            created_at: await getISOStringInConfiguredTimezone(),
            created_by: encoderId,
            parent_job_order_id: jo.parentJobOrderId || jo.parent_job_order_id || null,
            sub_assembly_version_map: jo.subAssemblyVersionMap || jo.sub_assembly_version_map || null,
            assignments: jo.assignments || null,
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
            products: jo.products ? jo.products.map((p: any) => ({
                product_id: p.product_id,
                product_name: p.product_name,
                quantity: p.quantity,
                bom: p.bom || null,
                components: p.components || null,
                routings: p.routings || null,
                allocation_results: p.allocationResults || null
            })) : null
        };

        const result = await createJobOrder(dbPayload, salesOrderIds);
        return NextResponse.json({ success: true, data: result });
    } catch (e) {
        console.error("API Error in planning-engineering POST:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create Job Order" }, { status: 500 });
    }
}

