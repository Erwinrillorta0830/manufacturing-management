/* eslint-disable */
import { NextResponse } from "next/server";
import { 
    fetchJobOrders, 
    getProductInventoryAndSafetyStock
} from "../planning-helper";
import {
    DIRECTUS_URL,
    headers
} from "@/app/api/manufacturing/directus-api";
import { getBOMDetailsForVersion, getActiveVersionForProduct, selectPreferredActiveVersion } from "../../finished-goods/versions/versions-helper";
import { movementStockKey, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";
import { loadYieldMaterials, YieldMaterialsError } from "../../production/_yield-materials";
import { enrichDispositions, readDispositions } from "../../qa/_dispositions";
import { fetchMmInventoryMovements, movementErrorStatus } from "../../services/mm-inventory-movements.service";
import { paginate } from "../../_pagination";

const WIZARD_STEP_TIMEOUT_MS = 20000;

async function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = WIZARD_STEP_TIMEOUT_MS): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${timeoutMs / 1000} seconds`));
                }, timeoutMs);
            })
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function mapQAQueueStatus(value: unknown): string {
    const status = String(value || "").trim().toLowerCase();
    if (status === "released" || status === "proceed") return "Proceed";
    if (status === "in progress" || status === "ongoing") return "Ongoing";
    if (status === "completed" || status === "finished" || status === "closed") return "Finished";
    if (status === "on hold" || status === "qa hold") return "On Hold";
    if (status === "draft") return "Draft";
    if (status === "planned") return "Planned";
    if (status === "planning") return "Planning";
    return String(value || "Unknown");
}

async function fetchQAJobOrderQueue(searchParams: URLSearchParams) {
    const queue = searchParams.get("queue") || "inspection";
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const requestedStatus = (searchParams.get("status") || "").trim().toLowerCase();
    const requestedType = (searchParams.get("type") || "").trim().toLowerCase();
    const requestedBranch = searchParams.get("branch") || searchParams.get("branchId") || "";

    const [jobOrdersRes, productsRes, yieldsRes] = await Promise.all([
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,unit_of_measurement`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&fields=job_order_id,yield_quantity,qa_status,lot_number,logged_at`, { headers, cache: "no-store" })
    ]);

    if (!jobOrdersRes.ok) {
        throw new Error(`Failed to fetch QA Job Orders (${jobOrdersRes.status})`);
    }

    const jobOrders = (await jobOrdersRes.json()).data || [];
    const products = productsRes.ok ? (await productsRes.json()).data || [] : [];
    const yields = yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];
    const productMap = new Map<number, any>(products.map((product: any) => [Number(product.product_id), product]));
    const yieldsByJobOrder = new Map<number, any[]>();

    yields.forEach((yieldRow: any) => {
        const jobOrderId = Number(yieldRow.job_order_id || 0);
        if (!jobOrderId) return;
        const existing = yieldsByJobOrder.get(jobOrderId) || [];
        existing.push(yieldRow);
        yieldsByJobOrder.set(jobOrderId, existing);
    });

    const rows = jobOrders
        .map((jobOrder: any) => {
            const id = Number(jobOrder.job_order_id || jobOrder.id || 0);
            const product = productMap.get(Number(jobOrder.product_id));
            const yieldLogs = yieldsByJobOrder.get(id) || [];
            const producedQuantity = yieldLogs.reduce((sum, row) => sum + Number(row.yield_quantity || 0), 0);
            const status = mapQAQueueStatus(jobOrder.status);
            const jobOrderNo = String(jobOrder.job_order_no || `JO-${id}`);
            const isRework = jobOrderNo.toLowerCase().includes("-rwk-") || Number(jobOrder.parent_job_order_id || 0) > 0;

            return {
                id,
                job_order_id: id,
                jo_id: jobOrderNo,
                job_order_no: jobOrderNo,
                order_id: id,
                parent_job_order_id: jobOrder.parent_job_order_id || null,
                parent_job_order_no: jobOrder.parent_job_order_no || null,
                product_id: Number(jobOrder.product_id || 0),
                product_name: product?.product_name || `Product #${jobOrder.product_id || 0}`,
                product_code: product?.product_code || "",
                version_id: jobOrder.version_id || null,
                target_quantity: Number(jobOrder.target_quantity ?? jobOrder.quantity ?? 0),
                quantity: Number(jobOrder.target_quantity ?? jobOrder.quantity ?? 0),
                completed_quantity: producedQuantity,
                actual_quantity_produced: producedQuantity,
                rejected_quantity: Number(jobOrder.rejected_quantity || 0),
                due_date: jobOrder.end_date || jobOrder.due_date || null,
                start_date: jobOrder.start_date || null,
                status,
                branch_id: jobOrder.branch_id || null,
                recipe_version_name: jobOrder.version_id ? `Version #${jobOrder.version_id}` : null,
                yield_logs: yieldLogs,
                is_rework: isRework
            };
        })
        .filter((jobOrder: any) => {
            const normalizedStatus = String(jobOrder.status).toLowerCase();
            const isFinished = ["finished", "completed", "closed"].includes(normalizedStatus);
            const isCancelled = normalizedStatus === "cancelled";
            if (queue === "closing" && (isFinished || isCancelled)) return false;
            if (queue === "closed" && !isFinished) return false;
            if (requestedStatus === "awaiting" && (isFinished || isCancelled)) return false;
            if (requestedStatus === "completed" && !isFinished) return false;
            if (requestedStatus === "on_hold" && !["on hold", "qa hold"].includes(normalizedStatus)) return false;
            if (requestedStatus && !["awaiting", "completed", "on_hold"].includes(requestedStatus) && normalizedStatus !== requestedStatus) return false;
            if (requestedType === "rework" && !jobOrder.is_rework) return false;
            if (requestedType === "standard" && jobOrder.is_rework) return false;
            if (requestedBranch && String(jobOrder.branch_id || "") !== requestedBranch) return false;
            if (search) {
                const haystack = `${jobOrder.jo_id} ${jobOrder.product_name} ${jobOrder.product_code}`.toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });

    return paginate(rows, searchParams);
}

export async function handleGET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");
        const bomId = searchParams.get("bomId");
        const action = searchParams.get("action");



        if (action === "net-requirements") {
            const productIdsStr = searchParams.get("productIds");
            const branchIdStr = searchParams.get("branchId");
            if (!branchIdStr) {
                return NextResponse.json({ error: "Missing required branchId query parameter" }, { status: 400 });
            }
            const productIds = productIdsStr ? productIdsStr.split(",").map(Number).filter(Boolean) : [];
            const branchId = Number(branchIdStr);
            const data = await getProductInventoryAndSafetyStock(productIds, branchId);
            return NextResponse.json(data);
        }

        if (action === "version-stock") {
            const prodId = Number(searchParams.get("productId") || "0");
            const branchId = Number(searchParams.get("branchId") || "0");
            if (!prodId || !branchId) {
                return NextResponse.json({ error: "Missing productId or branchId" }, { status: 400 });
            }

            // Fetch inventory movements to calculate the true ledger stock
            const movements = await fetchMmInventoryMovements({
                branch: branchId,
                product: prodId
            });
            const movementStockMap = new Map<string, number>();
            movements.forEach((mov: any) => {
                const batchNo = mov.batch_no || "LOT-N/A";
                const qty = Number(mov.quantity || 0);
                movementStockMap.set(batchNo, (movementStockMap.get(batchNo) || 0) + qty);
            });

            // Fetch QA status and Expiry from PO Receiving and Job Order Yield logs
            // 1. PO Receivings
            const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${prodId}&filter[branch_id][_eq]=${branchId}&limit=-1`, { headers, cache: "no-store" });
            const receipts = recRes.ok ? (await recRes.json()).data || [] : [];
            const batchStatusMap = new Map<string, string>();
            const batchExpiryMap = new Map<string, string>();
            
            receipts.forEach((rec: any) => {
                const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim() || "LOT-N/A";
                batchStatusMap.set(batchNo, rec.qa_status || "Passed");
                if (rec.expiry_date) batchExpiryMap.set(batchNo, rec.expiry_date);
            });

            // 2. Yield Ledger
            const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${prodId}&fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
            const yields = yieldRes.ok ? (await yieldRes.json()).data || [] : [];
            yields.forEach((yl: any) => {
                const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
                batchStatusMap.set(batchNo, yl.qa_status || "Pending");
                if (yl.expiry_date) batchExpiryMap.set(batchNo, yl.expiry_date);
            });

            // Map and enrich with correct ledger quantity, filter for Passed qa_status and quantity > 0
            const lotsEnriched: any[] = [];
            movementStockMap.forEach((qty, lotNum) => {
                if (qty > 0) {
                    const status = batchStatusMap.get(lotNum) || "Passed"; // Default to Passed for legacy / unclassified
                    if (status === "Passed" || status === "Partially Accepted") {
                        const matchedYield = yields.find((yl: any) => String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() === lotNum);
                        const source_type = matchedYield ? "manufacturing" : "procurement";
                        const source_reference = matchedYield ? (matchedYield.job_order_id?.job_order_no || `MFG-${matchedYield.job_order_id?.job_order_no}`) : "";
                        lotsEnriched.push({
                            lot_number: lotNum,
                            quantity: qty,
                            source_type,
                            source_reference,
                            expiry_date: batchExpiryMap.get(lotNum) || null
                        });
                    }
                }
            });

            // Trace lot's recipe version
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
            const { version: activeVersion } = await getActiveVersionForProduct(prodId);
            const activeVersionId = activeVersion ? Number(activeVersion.version_id) : null;

            // Group lot quantities by recipe version ID
            const versionStockMap: Record<number, number> = {};
            lotsEnriched.forEach((lot: any) => {
                const resolvedVersionId = lot.source_type === "manufacturing" && lot.source_reference
                    ? (joMap.get(lot.source_reference) || activeVersionId)
                    : activeVersionId;

                if (resolvedVersionId) {
                    versionStockMap[resolvedVersionId] = (versionStockMap[resolvedVersionId] || 0) + Number(lot.quantity || 0);
                }
            });

            return NextResponse.json(versionStockMap);
        }

        if (action === "qa-job-orders") {
            return NextResponse.json(await fetchQAJobOrderQueue(searchParams));
        }

        if (action === "job-materials") {
            const joId = searchParams.get("joId");
            const numericJoId = Number(joId);
            if (!joId || !Number.isFinite(numericJoId) || numericJoId <= 0) {
                return NextResponse.json({ error: "A valid Job Order ID is required", code: "JOB_MATERIALS_INVALID_ID" }, { status: 400 });
            }

            let mData: any[];
            try {
                const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${encodeURIComponent(joId)}&limit=-1`, { headers, cache: "no-store" });
                if (!res.ok) {
                    console.error("Required job-order materials lookup failed:", res.status, res.statusText);
                    return NextResponse.json(
                        { error: "Required material data is temporarily unavailable.", code: "JOB_MATERIALS_UNAVAILABLE" },
                        { status: 502 }
                    );
                }

                const materialsPayload = await res.json();
                if (!Array.isArray(materialsPayload?.data)) {
                    console.error("Required job-order materials lookup returned an invalid payload.");
                    return NextResponse.json(
                        { error: "Required material data is temporarily unavailable.", code: "JOB_MATERIALS_UNAVAILABLE" },
                        { status: 502 }
                    );
                }
                mData = materialsPayload.data;
            } catch (error) {
                console.error("Required job-order materials lookup failed:", error);
                return NextResponse.json(
                    { error: "Required material data is temporarily unavailable.", code: "JOB_MATERIALS_UNAVAILABLE" },
                    { status: 502 }
                );
            }

            const pIds = mData.map((d: any) => Number(d.product_id?.product_id || d.product_id)).filter(Boolean);
            const pMap = new Map<number, any>();
            
            // Get Job Order branch
            let joData: any;
            try {
                const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${encodeURIComponent(joId)}`, { headers, cache: "no-store" });
                if (!joRes.ok) {
                    console.error("Job Order context lookup failed:", joRes.status, joRes.statusText);
                    return NextResponse.json(
                        { error: "Job Order context is temporarily unavailable.", code: "JOB_ORDER_CONTEXT_UNAVAILABLE" },
                        { status: 502 }
                    );
                }

                const joPayload = await joRes.json();
                joData = joPayload?.data;
            } catch (error) {
                console.error("Job Order context lookup failed:", error);
                return NextResponse.json(
                    { error: "Job Order context is temporarily unavailable.", code: "JOB_ORDER_CONTEXT_UNAVAILABLE" },
                    { status: 502 }
                );
            }

            if (!joData?.branch_id) {
                return NextResponse.json({ error: "Job Order has no branch assigned", code: "JOB_ORDER_BRANCH_MISSING" }, { status: 400 });
            }
            const branchId = Number(joData.branch_id);

            if (pIds.length > 0) {
                const pRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${pIds.join(",")}&fields=product_id,product_name,unit_of_measurement.unit_shortcut,parent_id&limit=-1`, { headers });
                if (pRes.ok) {
                    const prods = (await pRes.json()).data || [];
                    prods.forEach((p: any) => pMap.set(Number(p.product_id), p));
                }
            }

            // Fetch children to handle child version fallback
            let children: any[] = [];
            if (pIds.length > 0) {
                try {
                    const childrenRes = await fetch(`${DIRECTUS_URL}/items/products?filter[parent_id][_in]=${pIds.join(",")}&fields=product_id,parent_id&limit=-1`, { headers });
                    if (childrenRes.ok) {
                        children = (await childrenRes.json()).data || [];
                    }
                } catch (err) {
                    console.error("Error resolving child fallback products:", err);
                }
            }

            // Collect all product IDs for version lookups
            const versionLookupProductIds = new Set<number>(pIds);
            pIds.forEach((id: number) => {
                const prod = pMap.get(id);
                const parentVal = prod?.parent_id;
                const parentIdVal = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);
                if (parentIdVal) versionLookupProductIds.add(parentIdVal);
            });
            children.forEach((c: any) => versionLookupProductIds.add(Number(c.product_id)));

            // Fetch versions in batch
            const versionsMapByProduct = new Map<number, any[]>();
            if (versionLookupProductIds.size > 0) {
                try {
                    const versionsRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[product_id][_in]=${Array.from(versionLookupProductIds).join(",")}&limit=-1`, { headers });
                    if (versionsRes.ok) {
                        const versionsData = (await versionsRes.json()).data || [];
                        versionsData.forEach((v: any) => {
                            const pId = Number(v.product_id);
                            if (!versionsMapByProduct.has(pId)) {
                                versionsMapByProduct.set(pId, []);
                            }
                            versionsMapByProduct.get(pId)!.push(v);
                        });
                    }
                } catch (err) {
                    console.error("Error fetching product versions:", err);
                }
            }

            // Helper to check active version for product (mimicking getActiveVersionForProduct check)
            function hasActiveVersionLocal(productId: number, visited = new Set<number>()): boolean {
                if (visited.has(productId)) return false;
                visited.add(productId);

                const prodVersions = versionsMapByProduct.get(productId) || [];
                const active = selectPreferredActiveVersion(prodVersions);
                if (active) return true;

                // parent fallback
                const prod = pMap.get(productId);
                const parentVal = prod?.parent_id;
                const parentIdVal = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);
                if (parentIdVal && hasActiveVersionLocal(parentIdVal, visited)) {
                    return true;
                }

                // child fallback
                const prodChildren = children.filter((c: any) => {
                    const cParentVal = c.parent_id;
                    const cParentId = cParentVal && typeof cParentVal === 'object' ? Number(cParentVal.product_id) : (cParentVal ? Number(cParentVal) : null);
                    return cParentId === productId;
                });
                for (const child of prodChildren) {
                    if (hasActiveVersionLocal(Number(child.product_id), visited)) {
                        return true;
                    }
                }

                return false;
            }

            function hasAnyVersionLocal(productId: number, visited = new Set<number>()): boolean {
                if (visited.has(productId)) return false;
                visited.add(productId);

                const prodVersions = versionsMapByProduct.get(productId) || [];
                if (prodVersions.length > 0) return true;

                // parent fallback
                const prod = pMap.get(productId);
                const parentVal = prod?.parent_id;
                const parentIdVal = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);
                if (parentIdVal && hasAnyVersionLocal(parentIdVal, visited)) {
                    return true;
                }

                // child fallback
                const prodChildren = children.filter((c: any) => {
                    const cParentVal = c.parent_id;
                    const cParentId = cParentVal && typeof cParentVal === 'object' ? Number(cParentVal.product_id) : (cParentVal ? Number(cParentVal) : null);
                    return cParentId === productId;
                });
                for (const child of prodChildren) {
                    if (hasAnyVersionLocal(Number(child.product_id), visited)) {
                        return true;
                    }
                }

                return false;
            }

            // Resolve QA status directly from document sources (PO Receivings and JO Yield Ledger) bypassing inventory_lots
            const batchStatusMap = new Map<string, string>();
            const batchExpiryMap = new Map<string, string>();
            const batchCreatedMap = new Map<string, string>();
            const hasMfgLotsSet = new Set<number>();

            if (pIds.length > 0) {
                try {
                    // 1. PO Receivings
                    const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_in]=${pIds.join(",")}&filter[branch_id][_eq]=${branchId}&limit=-1`, { headers, cache: "no-store" });
                    if (recRes.ok) {
                        const receipts = (await recRes.json()).data || [];
                        receipts.forEach((rec: any) => {
                            const productId = Number(rec.product_id?.product_id || rec.product_id);
                            const batchNo = String(rec.batch_no || rec.lot_no || "LOT-N/A").trim() || "LOT-N/A";
                            const key = `${productId}:${batchNo}`;
                            batchStatusMap.set(key, rec.qa_status || "Passed");
                            if (rec.expiry_date) batchExpiryMap.set(key, rec.expiry_date);
                            if (rec.received_date) batchCreatedMap.set(key, rec.received_date);
                        });
                    }
                } catch (err) {
                    console.error("Error loading PO receipts for stock check:", err);
                }

                try {
                    // 2. Yield Ledger
                    const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_in]=${pIds.join(",")}&fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
                    if (yieldRes.ok) {
                        const yields = (await yieldRes.json()).data || [];
                        yields.forEach((yl: any) => {
                            const productId = Number(yl.job_order_id?.product_id);
                            if (!productId) return;
                            hasMfgLotsSet.add(productId);
                            const batchNo = String(yl.lot_number || `MFG-${yl.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
                            const key = `${productId}:${batchNo}`;
                            batchStatusMap.set(key, yl.qa_status || "Pending");
                            if (yl.logged_at) batchCreatedMap.set(key, yl.logged_at);
                        });
                    }
                } catch (err) {
                    console.error("Error loading yield ledger for stock check:", err);
                }
            }

            // Fetch inventory movements to calculate the true ledger stock
            const stockMap = new Map<number, number>(); // product_id -> sum of passed stock
            const pendingQaMap = new Map<number, number>(); // product_id -> sum of pending QA stock
            const qaHoldMap = new Map<number, number>(); // product_id -> sum of QA hold stock
            const unclassifiedMap = new Map<number, number>();
            let movementStockMap = new Map<string, number>();
            const movementBatchStockMap = new Map<string, number>();
            let movements: any[] = [];

            if (pIds.length > 0) {
                movements = (await fetchMmInventoryMovements({
                    branch: branchId,
                    product: pIds.length === 1 ? pIds[0] : null
                })).filter((movement) => pIds.includes(Number(movement.product_id || movement.productId || 0)));
                movementStockMap = sumMovementQuantitiesByStock(movements);
                movements.forEach((movement: any) => {
                    const productId = Number(movement.product_id?.product_id || movement.product_id);
                    const batchNumber = movement.batch_no || "LOT-N/A";
                    const key = `${productId}:${batchNumber}`;
                    movementBatchStockMap.set(key, (movementBatchStockMap.get(key) || 0) + Number(movement.quantity || 0));
                });

                // Aggregate stock maps based on QA Status from batchStatusMap (bypassing inventory_lots)
                movementStockMap.forEach((qty, key) => {
                        if (qty > 0) {
                            const parts = key.split(":");
                            const prodId = Number(parts[0]);
                            const batchNo = parts[3] || "LOT-N/A";
                            const lookupKey = `${prodId}:${batchNo}`;
                            const status = batchStatusMap.get(lookupKey) || "Passed"; // Default to Passed for legacy stock

                            if (status === "Passed" || status === "Partially Accepted") {
                                stockMap.set(prodId, (stockMap.get(prodId) || 0) + qty);
                            } else if (status === "Pending") {
                                pendingQaMap.set(prodId, (pendingQaMap.get(prodId) || 0) + qty);
                            } else if (status === "QA Hold") {
                                qaHoldMap.set(prodId, (qaHoldMap.get(prodId) || 0) + qty);
                            } else {
                                unclassifiedMap.set(prodId, (unclassifiedMap.get(prodId) || 0) + qty);
                            }
                        }
                });
            }

            // Fetch reservations linked to these Job Order materials
            const jomIds = mData.map((d: any) => d.jo_material_id || d.id);
            const reservationsMap = new Map<number, any[]>();
            if (jomIds.length > 0) {
                try {
                    const reservationsUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter[jo_material_id][_in]=${jomIds.join(",")}&fields=jo_materials_reservation_id,jo_material_id,product_id,branch_id,batch_no,reserved_quantity&limit=-1`;
                    const resRes = await fetch(reservationsUrl, { headers });
                    if (resRes.ok) {
                        const reservations = (await resRes.json()).data || [];
                        reservations.forEach((r: any) => {
                            const jomId = Number(r.jo_material_id);
                            if (jomId) {
                                if (!reservationsMap.has(jomId)) {
                                    reservationsMap.set(jomId, []);
                                }
                                reservationsMap.get(jomId)!.push(r);
                            }
                        });
                    }
                } catch (resErr) {
                    console.error("Error looking up material reservations in get.ts:", resErr);
                }
            }

            // Subassembly lots and mfg set are determined directly from document sources and movements

            // Fetch active reservations by other JOs in batch
            const activeReservedMap = new Map<number, number>();
            if (pIds.length > 0) {
                try {
                    const activeReservedFilter = encodeURIComponent(JSON.stringify({
                        _and: [
                            { product_id: { _in: pIds } },
                            { job_order_id: { _and: [
                                { status: { _in: ["Proceed", "Ongoing", "On Hold", "Released", "In Progress"] } },
                                { job_order_id: { _ne: Number(joId) } }
                            ] } }
                        ]
                    }));
                    const activeReservedRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter=${activeReservedFilter}&fields=product_id,reserved_quantity&limit=-1`, { headers });
                    if (activeReservedRes.ok) {
                        const activeReservedData = (await activeReservedRes.json()).data || [];
                        activeReservedData.forEach((r: any) => {
                            const prodId = Number(r.product_id);
                            const qty = Number(r.reserved_quantity || 0);
                            activeReservedMap.set(prodId, (activeReservedMap.get(prodId) || 0) + qty);
                        });
                    }
                } catch (err) {
                    console.error("Error fetching active reservations by other JOs:", err);
                }
            }

            // Fetch purchase order receiving receipts in batch
            const receiptsByProduct = new Map<number, any[]>();
            let validReceiptsAll: any[] = [];
            if (pIds.length > 0) {
                try {
                    const receiptsUrl = `${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_in]=${pIds.join(",")}&filter[qa_status][_in]=Passed,Partially Accepted&filter[is_reverted][_eq]=0&filter[received_quantity][_gt]=0&filter[branch_id][_eq]=${branchId}&sort=expiry_date&limit=-1`;
                    const receiptsRes = await fetch(receiptsUrl, { headers });
                    if (receiptsRes.ok) {
                        validReceiptsAll = (await receiptsRes.json()).data || [];
                        validReceiptsAll.forEach((r: any) => {
                            const prodId = Number(r.product_id);
                            if (!receiptsByProduct.has(prodId)) {
                                receiptsByProduct.set(prodId, []);
                            }
                            receiptsByProduct.get(prodId)!.push(r);
                        });
                    }
                } catch (err) {
                    console.error("Error fetching purchase order receiving receipts:", err);
                }
            }

            // Fetch lot reservations map by product_id & batch_no
            const lotReservationsMap: Record<string, number> = {};
            if (pIds.length > 0) {
                try {
                    const resFilter = encodeURIComponent(JSON.stringify({
                        _and: [
                            { product_id: { _in: pIds } },
                            { branch_id: { _eq: branchId } },
                            { jo_material_id: { job_order_id: { status: { _in: ["Planned", "Draft", "Released", "In Progress", "Ongoing", "Proceed", "On Hold"] } } } }
                        ]
                    }));
                    const resRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${resFilter}&fields=product_id,batch_no,reserved_quantity&limit=-1`, { headers });
                    if (resRes.ok) {
                        const resData = (await resRes.json()).data || [];
                        resData.forEach((r: any) => {
                            const prodId = Number(r.product_id);
                            const batchNo = r.batch_no;
                            if (prodId && batchNo) {
                                const key = `${prodId}:${batchNo}`;
                                lotReservationsMap[key] = (lotReservationsMap[key] || 0) + Number(r.reserved_quantity || 0);
                            }
                        });
                    }
                } catch (err) {
                    console.error("Error fetching lot reservations:", err);
                }
            }

            const enriched = mData.map((d: any) => {
                const compProductId = Number(d.product_id?.product_id || d.product_id);
                const prod = pMap.get(compProductId);
                const availableStock = stockMap.get(compProductId) || 0;
                
                const jomId = Number(d.jo_material_id || d.id);
                const matReservations = reservationsMap.get(jomId) || [];

                // Check if sub assembly
                let isSubAssembly = hasActiveVersionLocal(compProductId);
                if (!isSubAssembly) {
                    isSubAssembly = hasAnyVersionLocal(compProductId);
                }
                if (!isSubAssembly) {
                    isSubAssembly = hasMfgLotsSet.has(compProductId);
                }

                let candidateLots: any[] = [];
                let lotNo: string | null = null;
                let receiptNo: string | null = null;

                if (isSubAssembly) {
                    const subLots: any[] = [];
                    movementStockMap.forEach((qty, key) => {
                        if (qty > 0) {
                            const parts = key.split(":");
                            const prodId = Number(parts[0]);
                            const bNo = parts[3] || "LOT-N/A";
                            if (prodId === compProductId) {
                                const lookupKey = `${prodId}:${bNo}`;
                                const status = batchStatusMap.get(lookupKey) || "Passed";
                                if (status === "Passed" || status === "Partially Accepted") {
                                    const matchingMov = movements.find((m: any) => 
                                        Number(m.product_id?.product_id || m.product_id) === prodId && 
                                        String(m.batch_no || "").trim() === bNo.trim() && 
                                        m.expiry_date
                                    );
                                    const expiry = matchingMov ? matchingMov.expiry_date : (batchExpiryMap.get(lookupKey) || null);
                                    
                                    subLots.push({
                                        id: parts[2] === "null" ? 0 : Number(parts[2]),
                                        lot_number: bNo,
                                        quantity: qty,
                                        expiry_date: expiry ? expiry.split("T")[0] : null
                                    });
                                }
                            }
                        }
                    });

                    const totalReservedByOthers = activeReservedMap.get(compProductId) || 0;
                    let remainingReserved = totalReservedByOthers;

                    candidateLots = subLots.map((lot: any) => {
                        const qty = Number(lot.quantity || 0);
                        const allocatedToOthers = Math.min(qty, remainingReserved);
                        remainingReserved -= allocatedToOthers;
                        const available = Math.max(0, qty - allocatedToOthers);

                        const isReservedForThisJo = Number(d.reserved_quantity || 0) > 0;

                        return {
                            receipt_id: lot.id,
                            receipt_no: "MANUFACTURING",
                            lot_no: lot.lot_number || "LOT-N/A",
                            received_quantity: qty,
                            physical_quantity: qty,
                            available: available,
                            expiry_date: lot.expiry_date || null,
                            reservation_id: isReservedForThisJo ? "sub-assembly-reserved" : null,
                            reserved_qty_for_this_lot: isReservedForThisJo ? Number(d.reserved_quantity) : 0
                        };
                    }).filter((c: any) => c.available > 0 || Number(d.reserved_quantity || 0) > 0);

                    if (Number(d.reserved_quantity || 0) > 0) {
                        lotNo = `MFG-STOCK (${Number(d.reserved_quantity).toFixed(0)})`;
                        receiptNo = "MANUFACTURING";
                    }
                } else {
                    const validReceipts = receiptsByProduct.get(compProductId) || [];
                    candidateLots = validReceipts.map((rec: any) => {
                        const lotNum = rec.lot_no || rec.batch_no || "LOT-N/A";
                        const physicalQty = movementBatchStockMap.get(`${compProductId}:${lotNum}`) || 0;
                        const recId = Number(rec.purchase_order_product_id);
                        const alreadyReserved = lotReservationsMap[`${compProductId}:${lotNum}`] || 0;
                        const netAvailable = Math.max(0, physicalQty - alreadyReserved);

                        const normalizedLotNo = String(lotNum || "").trim();
                        const matchingReservations = matReservations.filter((mr: any) =>
                            String(mr.batch_no || "").trim() === normalizedLotNo
                        );
                        const matchedRes = matchingReservations[0];
                        const reservationId = matchedRes ? Number(matchedRes.jo_materials_reservation_id) : null;
                        const reservedQtyForThisLot = matchingReservations.reduce(
                            (total: number, reservation: any) => total + Number(reservation.reserved_quantity || 0),
                            0
                        );

                        return {
                            receipt_id: recId,
                            receipt_no: rec.receipt_no || "N/A",
                            lot_no: lotNum,
                            received_quantity: Number(rec.received_quantity || 0),
                            physical_quantity: physicalQty,
                            available: netAvailable,
                            expiry_date: rec.expiry_date || null,
                            reservation_id: reservationId,
                            reserved_qty_for_this_lot: reservedQtyForThisLot
                        };
                    }).filter((c: any) => c.available > 0 || c.reservation_id !== null);

                    // Format multi-lot text if reservations exist
                    if (matReservations.length > 0) {
                        lotNo = matReservations.map((r: any) => {
                            const lNo = r.batch_no || "N/A";
                            return `${lNo} (${Number(r.reserved_quantity || 0).toFixed(0)})`;
                        }).join(", ");

                        receiptNo = matReservations.map((r: any) => r.receipt_no || "N/A").filter(Boolean).join(", ");
                    }
                }

                return {
                    ...d,
                    product_name: prod?.product_name || `Product #${d.product_id}`,
                    unit_shortcut: prod?.unit_of_measurement?.unit_shortcut || "units",
                    available_stock: availableStock,
                    pending_qa_stock: pendingQaMap.get(Number(d.product_id)) || 0,
                    qa_hold_stock: qaHoldMap.get(Number(d.product_id)) || 0,
                    unclassified_stock: unclassifiedMap.get(Number(d.product_id)) || 0,
                    lot_no: lotNo,
                    receipt_no: receiptNo,
                    candidate_lots: candidateLots,
                    is_sub_assembly: isSubAssembly
                };
            });
            return NextResponse.json(enriched);
        }

        if (action === "step-materials") {
            const joId = searchParams.get("joId");
            const joRouteId = searchParams.get("joRouteId");
            const quantity = Number(searchParams.get("quantity") || 0);

            // Fetch job order route step details
            const stepRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes/${joRouteId}?fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers, cache: "no-store" });
            if (!stepRes.ok) return NextResponse.json([]);
            const step = (await stepRes.json()).data;
            if (!step) return NextResponse.json([]);

            // Fetch Job Order details
            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joId}`, { headers, cache: "no-store" });
            if (!joRes.ok) return NextResponse.json([]);
            const jo = (await joRes.json()).data;
            if (!jo || !jo.version_id) return NextResponse.json([]);

            // Find master route matching version, sequence, and operation
            const masterRouteRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_routings?filter[version_id][_eq]=${jo.version_id}&filter[sequence_order][_eq]=${step.sequence_order}&filter[operation_id][_eq]=${step.operation_id}&limit=1`, { headers, cache: "no-store" });
            const masterRoutes = masterRouteRes.ok ? (await masterRouteRes.json()).data || [] : [];
            const masterRoute = masterRoutes[0];
            if (!masterRoute) return NextResponse.json([]);

            const routeId = masterRoute.route_id || masterRoute.id;
            
            const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom?filter[route_id][_eq]=${routeId}&limit=-1`, { headers, cache: "no-store" });
            const bomItems = res.ok ? (await res.json()).data || [] : [];
            
            const pIds = bomItems.map((d: any) => d.product_id);
            const pMap = new Map<number, any>();
            if (pIds.length > 0) {
                const pRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${pIds.join(",")}&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut&limit=-1`, { headers });
                if (pRes.ok) {
                    const prods = (await pRes.json()).data || [];
                    prods.forEach((p: any) => pMap.set(Number(p.product_id), p));
                }
            }

            const mapped = bomItems.map((b: any) => {
                const prod = pMap.get(Number(b.product_id));
                const qtyPerUnit = Number(b.quantity_required || 0);
                const wastage = 1 + (Number(b.wastage_factor_percentage || 0) / 100);
                const totalNeeded = qtyPerUnit * quantity * wastage;

                return {
                    product_id: b.product_id,
                    product_name: prod?.product_name || `Product #${b.product_id}`,
                    product_code: prod?.product_code || "",
                    unit_shortcut: prod?.unit_of_measurement?.unit_shortcut || "pcs",
                    qty_per_unit: qtyPerUnit,
                    total_needed: totalNeeded
                };
            });

            return NextResponse.json(mapped);
        }

        if (action === "lots") {
            const url = `${DIRECTUS_URL}/items/lots?limit=-1`;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) throw new Error("Failed to fetch lots");
            const data = await res.json();
            return NextResponse.json(data.data || []);
        }

        if (action === "users") {
            const url = `${DIRECTUS_URL}/items/user?limit=-1`;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) throw new Error("Failed to fetch users");
            const data = await res.json();
            const mappedUsers = (data.data || []).map((u: Record<string, unknown> & { user_id?: number; id?: number }) => ({
                ...u,
                user_id: u.user_id || u.id
            }));
            return NextResponse.json(mappedUsers);
        }

        if (action === "qa-logs") {
            const qaRecordsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?limit=-1&sort=-inspected_at`, { headers, cache: "no-store" });
            const qaRecords = qaRecordsRes.ok ? ((await qaRecordsRes.json()).data || []) : [];

            if (qaRecords.length === 0) {
                return NextResponse.json([]);
            }

            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1`, { headers, cache: "no-store" });
            const jobOrders = joRes.ok ? ((await joRes.json()).data || []) : [];
            const joMap = new Map<number, any>();
            jobOrders.forEach((jo: any) => joMap.set(Number(jo.job_order_id), jo));

            const routesRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers, cache: "no-store" });
            const routes = routesRes.ok ? ((await routesRes.json()).data || []) : [];
            const routeMap = new Map<number, any>();
            routes.forEach((r: any) => routeMap.set(Number(r.jo_route_id), r));

            const opsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" });
            const operations = opsRes.ok ? ((await opsRes.json()).data || []) : [];
            const opsMap = new Map<number, string>();
            operations.forEach((o: any) => opsMap.set(Number(o.id), o.operation_name));

            const dispositions = await enrichDispositions(await readDispositions());

            const groupsMap = new Map<string, any[]>();
            qaRecords.forEach((rec: any) => {
                const key = `${rec.jo_route_id}_${rec.inspected_at}`;
                if (!groupsMap.has(key)) {
                    groupsMap.set(key, []);
                }
                groupsMap.get(key)!.push(rec);
            });

            const mappedLogs = Array.from(groupsMap.values()).map((group, index) => {
                const first = group[0];
                const joId = Number(first.job_order_id);
                const routeId = Number(first.jo_route_id);
                const inspectedAt = first.inspected_at;

                const parentJo = joMap.get(joId);
                const joNo = parentJo?.job_order_no || `JO-${joId}`;
                const targetQty = parentJo ? Number(parentJo.target_quantity || 0) : 0;

                const routeTask = routeMap.get(routeId);
                const opId = routeTask ? Number(routeTask.operation_id) : 0;
                const opName = opsMap.get(opId) || "Production Step";
                const seqOrder = routeTask ? Number(routeTask.sequence_order || 1) : 1;
                const routeStatus = routeTask ? routeTask.status : "Completed";

                const overallPassed = group.every((r: any) => r.is_passed === true || r.is_passed === 1);
                const uniqueRemarks = Array.from(new Set(group.map((r: any) => r.remarks).filter(Boolean)));
                const comments = uniqueRemarks.join("; ") || (overallPassed ? "All parameters passed." : "Parameter checks failed.");

                let expected = targetQty;
                let actual = targetQty;
                if (!overallPassed && dispositions.length > 0) {
                    const disp = dispositions.find(d =>
                        Number(d.job_order_id) === joId && Number(d.task_id) === routeId
                    ) || dispositions.find(d => Number(d.task_id) === routeId);
                    if (disp) {
                        expected = Number(disp.expected_quantity || targetQty);
                        actual = Number(disp.actual_quantity || targetQty);
                    }
                }

                return {
                    id: Number(first.qa_record_id || index + 1),
                    task_id: {
                        jo_route_id: routeId,
                        jo_id: joNo,
                        operation_name: opName,
                        name: opName,
                        sequence_order: seqOrder,
                        status: routeStatus
                    },
                    expected_quantity: expected,
                    actual_quantity: actual,
                    deviation_quantity: Math.max(0, expected - actual),
                    qa_status: overallPassed ? "Passed" : "Failed",
                    recorded_at: inspectedAt,
                    comments: comments,
                    photos: null
                };
            });

            return NextResponse.json(mappedLogs);
        }

        if (action === "job-order-materials") {
            const joId = searchParams.get("joId");
            if (!joId) {
                return NextResponse.json({ error: "Missing joId" }, { status: 400 });
            }

            try {
                const { materials } = await loadYieldMaterials(joId);
                return NextResponse.json(materials);
            } catch (error) {
                if (error instanceof YieldMaterialsError) {
                    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
                }
                throw error;
            }
        }

        if (action === "wizard-step-2") {
            const prodId = Number(searchParams.get("productId") || "0");
            const vId = searchParams.get("bomId") ? Number(searchParams.get("bomId")) : undefined;
            const branchId = Number(searchParams.get("branchId") || "1");

            if (!prodId) {
                return NextResponse.json({ error: "Missing or invalid productId query parameter" }, { status: 400 });
            }

            // Load the selected recipe first. The operations catalog is supplemental display data and
            // must not prevent the BOM calculation from returning when it is slow or unavailable.
            const bomDetails = await withTimeout(
                vId
                    ? getBOMDetailsForVersion(prodId, vId)
                    : getActiveVersionForProduct(prodId),
                "BOM and routing details"
            );

            const { version, routes } = bomDetails;
            if (!version) {
                return NextResponse.json({
                    bom: null,
                    components: [],
                    routings: [],
                    subAssemblyBoms: {},
                    inventories: []
                });
            }

            // Resolve only the operations used by the selected recipe. Loading the entire catalog
            // is unnecessary for the preview and can block an otherwise valid BOM calculation.
            let operations: any[] = [];
            const operationIds = Array.from(new Set(
                routes.map((route: any) => Number(route.operation_id)).filter((id: number) => id > 0)
            ));
            if (operationIds.length > 0) {
                try {
                    const opRes = await withTimeout(
                        fetch(`${DIRECTUS_URL}/items/manufacturing_operations?filter[id][_in]=${operationIds.join(",")}&limit=-1`, { headers }),
                        "Selected manufacturing operations",
                        5000
                    );
                    operations = opRes.ok ? (await opRes.json()).data || [] : [];
                } catch (error) {
                    console.warn("Selected manufacturing operations could not be loaded for the Step 2 preview:", error);
                }
            }

            const operationsMap = new Map<number, string>(
                operations.map((o: any) => [Number(o.id), o.operation_name])
            );

            // Map version to bom structure
            const bom = {
                ...version,
                bom_id: version.version_id,
                bom_name: version.version_name,
                base_quantity: version.base_quantity,
                expected_yield_percentage: version.expected_yield_percentage
            };

            // Map routings
            const routings = routes.map(r => ({
                routing_id: r.route_id,
                bom_id: version.version_id,
                sequence_order: r.sequence_order,
                setup_time_hours: r.setup_time_hours,
                run_time_hours: r.run_time_hours,
                duration_hours: Number(r.setup_time_hours || 0) + Number(r.run_time_hours || 0),
                step_batch_size: r.step_batch_size,
                operation_id: r.operation_id,
                work_center_id: r.work_center_id,
                qa_template_id: r.qa_template_id,
                operation_name: operationsMap.get(Number(r.operation_id)) || `Operation #${r.operation_id}`
            }));

            // Helper to safely extract integer product ID from primitive or object
            const extractProductId = (val: any): number => {
                if (!val) return 0;
                if (typeof val === "object") {
                    return Number(val.product_id || val.id || 0);
                }
                return Number(val) || 0;
            };

            // Collect parent BOM items
            const versionObj = version as any;
            const parentBomItems: any[] = (versionObj.bom_items && versionObj.bom_items.length > 0)
                ? versionObj.bom_items
                : routes.flatMap(r => r.bom_items || []);

            // 2b: Identify sub-assemblies (all parent BOM component product IDs)
            const parentComponentProductIds = Array.from(new Set(
                parentBomItems
                    .map(item => extractProductId(item.product_id))
                    .filter(id => id > 0)
            ));

            // Resolve sub-assemblies BOM component lists in parallel upfront
            const subAssemblyBoms: Record<number, any[]> = {};
            const subAssemblyChildProductIds: number[] = [];
            const subBomItemsByProdId = new Map<number, { items: any[]; versionId: number | null; routes: any[]; baseQuantity: number }>();

            if (parentComponentProductIds.length > 0) {
                const subDetailsResults = await Promise.all(
                    parentComponentProductIds.map(subProdId => getActiveVersionForProduct(subProdId))
                );

                parentComponentProductIds.forEach((subProdId, index) => {
                    const subRes = subDetailsResults[index];
                    const subRoutes = subRes?.routes || [];
                    const verBomItems = (subRes?.version as any)?.bom_items || [];

                    // Combine verBomItems and subRoutes.bom_items, deduplicating by item id/product_id
                    const combinedItems: any[] = [...verBomItems];
                    subRoutes.forEach((sr: any) => {
                        if (sr.bom_items && Array.isArray(sr.bom_items)) {
                            sr.bom_items.forEach((bi: any) => {
                                const biPid = extractProductId(bi.product_id);
                                if (biPid > 0 && !combinedItems.some(ci => extractProductId(ci.product_id) === biPid)) {
                                    combinedItems.push(bi);
                                }
                            });
                        }
                    });

                    combinedItems.forEach((bItem: any) => {
                        const cPid = extractProductId(bItem.product_id);
                        if (cPid > 0) {
                            subAssemblyChildProductIds.push(cPid);
                        }
                    });

                    if (subRes?.version || subRoutes.length > 0 || combinedItems.length > 0) {
                        subBomItemsByProdId.set(subProdId, {
                            items: combinedItems,
                            versionId: subRes?.version?.version_id || null,
                            routes: subRoutes,
                            baseQuantity: Number(subRes?.version?.base_quantity || 1)
                        });
                    }
                });
            }

            // 2c: Collect all product IDs (parent components + sub-assembly components)
            const allProductIds = Array.from(new Set([...parentComponentProductIds, ...subAssemblyChildProductIds]));

            // Fetch product details for all collected product IDs to enrich component objects
            const productsMap = new Map<number, any>();
            if (allProductIds.length > 0) {
                const prodRes = await fetch(
                    `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${allProductIds.join(",")}&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,product_category.category_name,product_type&limit=-1`,
                    { headers }
                );
                if (prodRes.ok) {
                    const prods = (await prodRes.json()).data || [];
                    prods.forEach((p: any) => productsMap.set(Number(p.product_id), p));
                }
            }

            const resolveCategoryName = (pDetails: any, fallbackCode: string = "", pType: any = null): string => {
                const catName = pDetails?.product_category?.category_name || pDetails?.category_id?.category_name;
                if (catName && catName !== "Uncategorized") return catName;
                const code = String(pDetails?.product_code || fallbackCode || "").toUpperCase();
                const typeVal = pDetails?.product_type ?? pType;
                if (code.startsWith("FG-") || typeVal === 388) return "Sub-Assembly";
                if (code.startsWith("PKG-") || typeVal === 390) return "Packaging Material";
                if (code.startsWith("RAW-") || typeVal === 389) return "Raw Material";
                return "Material / Component";
            };

            // Build parent components array
            const components = parentBomItems.map(item => {
                const pId = extractProductId(item.product_id);
                const pDetails = productsMap.get(pId);
                return {
                    component_id: item.id,
                    bom_id: version.version_id,
                    component_product_id: {
                        product_id: pId,
                        product_name: pDetails?.product_name || `Product #${pId}`,
                        product_code: pDetails?.product_code || "",
                        category_name: resolveCategoryName(pDetails, pDetails?.product_code, pDetails?.product_type ?? item.product_type),
                        product_type: pDetails?.product_type ?? item.product_type
                    },
                    quantity_required: Number(item.quantity_required || 0),
                    wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
                    unit_of_measurement: pDetails?.unit_of_measurement?.unit_name || pDetails?.unit_of_measurement?.unit_shortcut || "pcs"
                };
            });

            // Build subAssemblyBoms and subAssemblyRoutings records
            const subAssemblyRoutings: Record<number, { setup_time_hours: number; run_time_hours_per_unit: number; base_quantity: number }> = {};

            parentComponentProductIds.forEach(subProdId => {
                const subData = subBomItemsByProdId.get(subProdId);
                if (!subData) return;

                const subItems = subData.items || [];
                const subRoutes = subData.routes || [];
                const baseQty = subData.baseQuantity || 1;
                const subVersionId = subData.versionId || null;

                subAssemblyBoms[subProdId] = subItems.map(item => {
                    const cPid = extractProductId(item.product_id);
                    const pDetails = productsMap.get(cPid);
                    return {
                        component_id: item.id,
                        bom_id: subVersionId,
                        base_quantity: baseQty,
                        component_product_id: {
                            product_id: cPid,
                            product_name: pDetails?.product_name || `Product #${cPid}`,
                            product_code: pDetails?.product_code || "",
                            category_name: resolveCategoryName(pDetails, pDetails?.product_code, pDetails?.product_type ?? item.product_type),
                            product_type: pDetails?.product_type ?? item.product_type
                        },
                        quantity_required: Number(item.quantity_required || 0),
                        wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
                        unit_of_measurement: pDetails?.unit_of_measurement?.unit_name || pDetails?.unit_of_measurement?.unit_shortcut || "pcs"
                    };
                });

                let setupHours = 0;
                let runHoursPerUnit = 0;
                subRoutes.forEach((r: any) => {
                    const stepBatch = Number(r.step_batch_size || 1);
                    setupHours += Number(r.setup_time_hours || 0);
                    runHoursPerUnit += (Number(r.run_time_hours || 0) / stepBatch);
                });

                subAssemblyRoutings[subProdId] = {
                    setup_time_hours: setupHours,
                    run_time_hours_per_unit: runHoursPerUnit,
                    base_quantity: baseQty
                };
            });

            // Fetch all available manufacturing versions for sub-assembly components
            const subAssemblyVersions: Record<number, any[]> = {};
            const selectedSubAssemblyVersions: Record<number, number> = {};

            if (parentComponentProductIds.length > 0) {
                try {
                    const verFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: parentComponentProductIds } }));
                    const verRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${verFilter}&fields=version_id,product_id,version_name,status,base_quantity&limit=-1`, { headers });
                    if (verRes.ok) {
                        const allVers = (await verRes.json()).data || [];
                        parentComponentProductIds.forEach(pId => {
                            const pVers = allVers.filter((v: any) => Number(v.product_id) === pId);
                            if (pVers.length > 0) {
                                subAssemblyVersions[pId] = pVers;
                                const selected = selectPreferredActiveVersion(pVers) || pVers[0];
                                selectedSubAssemblyVersions[pId] = Number(selected.version_id);
                            }
                        });
                    }
                } catch (e) {
                    console.error("Error fetching sub-assembly version lists:", e);
                }
            }

            // Run getProductInventoryAndSafetyStock for all collected product IDs
            const inventories = await getProductInventoryAndSafetyStock(allProductIds, branchId);

            // 2e: Return { bom, components, routings, subAssemblyVersions, selectedSubAssemblyVersions, subAssemblyBoms, subAssemblyRoutings, inventories }
            return NextResponse.json({
                bom,
                components,
                routings,
                subAssemblyVersions,
                selectedSubAssemblyVersions,
                subAssemblyBoms,
                subAssemblyRoutings,
                inventories
            });
        }

        if (action === "sub-assembly-version-details") {
            const extractProductId = (val: any): number => {
                if (!val) return 0;
                if (typeof val === "object") return Number(val.product_id || val.id || 0);
                return Number(val) || 0;
            };

            const subProdId = Number(searchParams.get("productId") || "0");
            const vId = Number(searchParams.get("versionId") || "0");
            const branchId = Number(searchParams.get("branchId") || "1");

            if (!subProdId || !vId) {
                return NextResponse.json({ error: "Missing productId or versionId" }, { status: 400 });
            }

            const { version, routes } = await getBOMDetailsForVersion(subProdId, vId);
            const versionObj = version as any;
            const verBomItems: any[] = (versionObj?.bom_items && versionObj.bom_items.length > 0)
                ? versionObj.bom_items
                : routes.flatMap(r => r.bom_items || []);

            const childProductIds = Array.from(new Set(verBomItems.map((item: any) => extractProductId(item.product_id)).filter(id => id > 0)));

            const productsMap = new Map<number, any>();
            if (childProductIds.length > 0) {
                const prodRes = await fetch(
                    `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${childProductIds.join(",")}&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,product_category.category_name,product_type&limit=-1`,
                    { headers }
                );
                if (prodRes.ok) {
                    const prods = (await prodRes.json()).data || [];
                    prods.forEach((p: any) => productsMap.set(Number(p.product_id), p));
                }
            }

            const resolveCategoryName = (pDetails: any, fallbackCode: string = "", pType: any = null): string => {
                const catName = pDetails?.product_category?.category_name || pDetails?.category_id?.category_name;
                if (catName && catName !== "Uncategorized") return catName;
                const code = String(pDetails?.product_code || fallbackCode || "").toUpperCase();
                const typeVal = pDetails?.product_type ?? pType;
                if (code.startsWith("FG-") || typeVal === 388) return "Sub-Assembly";
                if (code.startsWith("PKG-") || typeVal === 390) return "Packaging Material";
                if (code.startsWith("RAW-") || typeVal === 389) return "Raw Material";
                return "Material / Component";
            };

            const baseQty = Number(version?.base_quantity || 1);
            const bomItems = verBomItems.map((item: any) => {
                const cPid = extractProductId(item.product_id);
                const pDetails = productsMap.get(cPid);
                return {
                    component_id: item.id,
                    bom_id: vId,
                    base_quantity: baseQty,
                    component_product_id: {
                        product_id: cPid,
                        product_name: pDetails?.product_name || `Product #${cPid}`,
                        product_code: pDetails?.product_code || "",
                        category_name: resolveCategoryName(pDetails, pDetails?.product_code, pDetails?.product_type ?? item.product_type),
                        product_type: pDetails?.product_type ?? item.product_type
                    },
                    quantity_required: Number(item.quantity_required || 0),
                    wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
                    unit_of_measurement: pDetails?.unit_of_measurement?.unit_name || pDetails?.unit_of_measurement?.unit_shortcut || "pcs"
                };
            });

            let setupHours = 0;
            let runHoursPerUnit = 0;
            routes.forEach((r: any) => {
                const stepBatch = Number(r.step_batch_size || 1);
                setupHours += Number(r.setup_time_hours || 0);
                runHoursPerUnit += (Number(r.run_time_hours || 0) / stepBatch);
            });

            const routing = {
                setup_time_hours: setupHours,
                run_time_hours_per_unit: runHoursPerUnit,
                base_quantity: baseQty
            };

            const inventories = await getProductInventoryAndSafetyStock(childProductIds, branchId);

            return NextResponse.json({
                productId: subProdId,
                versionId: vId,
                bomItems,
                routing,
                inventories
            });
        }

        if (productId) {
            const prodId = Number(productId);
            const vId = bomId ? Number(bomId) : undefined;

            const { version, routes } = vId
                ? await getBOMDetailsForVersion(prodId, vId)
                : await getActiveVersionForProduct(prodId);

            if (!version) {
                return NextResponse.json({ bom: null, components: [], routings: [] });
            }

            // Map version to look like old bom format for client compatibility
            const bom = {
                ...version,
                bom_id: version.version_id,
                bom_name: version.version_name,
                base_quantity: version.base_quantity,
                expected_yield_percentage: version.expected_yield_percentage
            };

            // Fetch operations list to map operation_id to name
            const opRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers });
            const operations = opRes.ok ? (await opRes.json()).data || [] : [];
            const operationsMap = new Map(operations.map((o: any) => [Number(o.id), o.operation_name]));

            // Flatten and map components from route steps
            const allBomItems: any[] = [];
            routes.forEach(r => {
                if (r.bom_items) {
                    r.bom_items.forEach(bItem => {
                        allBomItems.push(bItem);
                    });
                }
            });

            // Fetch product details (names, codes, categories, UOMs) for BOM items
            const componentProductIds = Array.from(new Set(allBomItems.map(item => Number(item.product_id)).filter(Boolean)));
            const productsMap = new Map<number, any>();
            if (componentProductIds.length > 0) {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${componentProductIds.join(",")}&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut,product_category.category_name,product_type&limit=-1`, { headers });
                if (prodRes.ok) {
                    const prods = (await prodRes.json()).data || [];
                    prods.forEach((p: any) => productsMap.set(Number(p.product_id), p));
                }
            }

            const components = allBomItems.map(item => {
                const pDetails = productsMap.get(Number(item.product_id));
                return {
                    component_id: item.id,
                    bom_id: version.version_id,
                    component_product_id: {
                        product_id: item.product_id,
                        product_name: pDetails?.product_name || `Product #${item.product_id}`,
                        product_code: pDetails?.product_code || "",
                        category_name: pDetails?.product_category?.category_name || "Uncategorized",
                        product_type: pDetails?.product_type
                    },
                    quantity_required: item.quantity_required,
                    wastage_factor_percentage: item.wastage_factor_percentage || 0,
                    unit_of_measurement: pDetails?.unit_of_measurement?.unit_shortcut || "pcs"
                };
            });

            // Map routings to old format
            const routings = routes.map(r => ({
                routing_id: r.route_id,
                bom_id: version.version_id,
                sequence_order: r.sequence_order,
                setup_time_hours: r.setup_time_hours,
                run_time_hours: r.run_time_hours,
                duration_hours: Number(r.setup_time_hours || 0) + Number(r.run_time_hours || 0),
                step_batch_size: r.step_batch_size,
                operation_id: r.operation_id,
                work_center_id: r.work_center_id,
                qa_template_id: r.qa_template_id,
                operation_name: operationsMap.get(Number(r.operation_id)) || `Operation #${r.operation_id}`
            }));

            return NextResponse.json({
                bom,
                components,
                routings
            });
        } else {
            // Fetch all Job Orders
            const list = await fetchJobOrders();
            // Transform snake_case keys back to camelCase for client compatibility if needed
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
            const camelCaseList = list.map((item: any) => ({
                jo_id: item.jo_id,
                order_id: item.job_order_id || item.order_id || item.id,
                order_no: item.order_no,
                product_id: item.product_id,
                product_name: item.product_name,
                uom_name: item.uom_name,
                uom_shortcut: item.uom_shortcut,
                unit_of_measurement: item.unit_of_measurement,
                quantity: Number(item.quantity || 0),
                due_date: item.due_date,
                status: item.status,
                is_batched: !!item.is_batched,
                bom: item.bom,
                version_id: item.version_id,
                recipe_version_name: item.recipe_version_name,
                components: item.components,
                routings: item.routings,
                allocationResults: item.allocation_results,
                procurementStatus: item.procurement_status,
                branch_id: item.branch_id,
                products: item.products || [],
                routing_tasks: item.routing_tasks || [],
                routingTasks: item.routing_tasks || [],
                shiftOption: item.shift_option || "8",
                dailyBreakdown: item.daily_breakdown || null,
                remarks: item.remarks || null,
                createdAt: item.created_at || null,
                createdBy: item.created_by || null,
                parentJobOrderId: item.parent_job_order_id || null,
                producedQty: item.produced_quantity || 0,
                yield_logs: item.yield_logs || []
            }));
            return NextResponse.json(camelCaseList);
        }
    } catch (e) {
        console.error("API Error in planning-engineering GET:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to process planning request" },
            { status: movementErrorStatus(e) }
        );
    }
}
