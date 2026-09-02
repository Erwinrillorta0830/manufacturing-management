/* eslint-disable */
import { NextResponse } from "next/server";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { completeYieldClosing, YieldCompletionError } from "../_yield-closing-service";
import { YieldMaterialsError } from "../_yield-materials";
import { fetchMmInventoryMovements, MmInventoryMovementError } from "../../services/mm-inventory-movements.service";


interface LedgerEntry {
    id: number;
    documentNo: string;
    documentDate?: string;
    documentDescription?: string;
    productId: string | number;
    quantity: string | number;
    branchId: string | number;
    documentType?: string;
}

interface Product {
    product_id: number;
    product_name?: string;
    cost_per_unit?: string | number;
}

interface InventoryLot {
    id: number;
    lot_number: string;
    expiry_date?: string | null;
    unit_cost?: string | number;
    quantity?: string | number;
    created_on?: string;
    qa_status?: string;
}

interface ConsumeComponentBody {
    component_product_id?: string | number;
    product_id?: string | number;
    required?: string | number;
    quantity?: string | number;
    component_name?: string;
    product_name?: string;
}

interface ComponentConsumed {
    component_product_id: number;
    product_id?: string | number;
    required?: string | number;
    quantity?: string | number;
    scaledQuantity: number;
    component_name?: string;
    product_name?: string;
}

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

interface FinishedGoodsMovement {
    id?: number | string;
    movement_id?: number | string;
    product_id?: number | string | Record<string, unknown>;
    lot_id?: number | string | Record<string, unknown>;
    branch_id?: number | string | Record<string, unknown>;
    transaction_type_id?: number | string | Record<string, unknown>;
    source_document_id?: number | string | Record<string, unknown> | null;
    source_document_no?: string | null;
    batch_no?: string | null;
    expiry_date?: string | null;
    manufacturing_date?: string | null;
    quantity?: number | string;
    created_at?: string | null;
    created_on?: string | null;
}

function relationId(value: unknown): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Number(record.id ?? record.movement_id ?? record.job_order_id ?? record.product_id ?? record.branch_id ?? 0);
    }
    return Number(value ?? 0);
}

function directusRecordId(value: unknown): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Number(record.movement_id ?? record.id ?? record.ledger_id ?? 0);
    }
    return Number(value ?? 0);
}

function dateOnly(value: unknown): string | null {
    const raw = String(value ?? "").trim();
    return raw ? raw.slice(0, 10) : null;
}

async function readDirectusCollection<T = any>(url: string, label: string): Promise<T[]> {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status}.`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.data)) {
        throw new Error(`${label} returned an invalid collection.`);
    }
    return payload.data as T[];
}

async function readOptionalDirectusCollection<T = any>(url: string, label: string): Promise<T[]> {
    try {
        return await readDirectusCollection<T>(url, label);
    } catch {
        return [];
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const requestedJobOrder = searchParams.get("joId")?.trim() || "";
        const requestedJobOrderId = Number(requestedJobOrder);
        const movements = await fetchMmInventoryMovements({
            transactionTypeId: 2,
            movementDirection: "IN",
            referenceId: Number.isSafeInteger(requestedJobOrderId) && requestedJobOrderId > 0
                ? requestedJobOrderId
                : null
        });
        const [products, yields, jobOrders, ledgerEntries] = await Promise.all([
            readOptionalDirectusCollection<Product>(
                `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,cost_per_unit`,
                "Product lookup"
            ),
            readOptionalDirectusCollection<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1`,
                "Yield ledger lookup"
            ),
            readOptionalDirectusCollection<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,product_id,branch_id,status,actual_quantity_produced`,
                "Job-order lookup"
            ),
            readOptionalDirectusCollection<LedgerEntry>(
                `${DIRECTUS_URL}/items/product_ledger?filter[documentType][_in]=QA Receive,Job Order Receipt&filter[quantity][_gt]=0&limit=-1&sort=-id`,
                "Legacy product-ledger lookup"
            )
        ]);

        const matchingMovements = movements.filter(movement => {
            if (!requestedJobOrder) return true;
            const sourceId = relationId(movement.source_document_id);
            const sourceNo = String(movement.source_document_no || "").trim();
            return (Number.isFinite(Number(requestedJobOrder)) && sourceId === Number(requestedJobOrder))
                || sourceNo === requestedJobOrder;
        });

        const movementReceiptRows = matchingMovements.map(movement => {
            const sourceId = relationId(movement.source_document_id);
            const sourceNo = String(movement.source_document_no || "").trim();
            const jobOrder = jobOrders.find(job => relationId(job.job_order_id) === sourceId)
                || jobOrders.find(job => sourceId <= 0 && String(job.job_order_no || "").trim() === sourceNo);
            const jobOrderNo = String(jobOrder?.job_order_no || sourceNo || (sourceId > 0 ? sourceId : ""));
            const productId = relationId(movement.product_id);
            const branchId = relationId(movement.branch_id);
            const lotNumber = String(movement.batch_no || "").trim();
            const matchedProduct = products.find(product => Number(product.product_id) === productId);
            const matchedYield = yields.find(yieldRow =>
                relationId(yieldRow.job_order_id) === sourceId
                && String(yieldRow.lot_number || "").trim() === lotNumber
            );

            return {
                id: directusRecordId(movement),
                movement_id: directusRecordId(movement),
                yield_ledger_id: directusRecordId(matchedYield),
                job_order_id: sourceId || relationId(jobOrder?.job_order_id),
                job_order_status: jobOrder?.status || null,
                jo_id: jobOrderNo,
                product_id: productId,
                product_name: matchedProduct?.product_name || "Manufactured Good",
                quantity_produced: Number(movement.quantity),
                quantity: Number(movement.quantity),
                branch_id: branchId,
                lot_number: lotNumber,
                qa_status: matchedYield?.qa_status || "Pending",
                manufacturing_date: dateOnly(movement.manufacturing_date) || dateOnly(matchedYield?.manufacturing_date),
                expiration_date: dateOnly(movement.expiry_date) || dateOnly(matchedYield?.expiry_date),
                unit_cost: Number(matchedProduct?.cost_per_unit || 0),
                date_received: movement.created_at || null,
                legacy_source: false
            };
        });

        // Older receipts may have a product-ledger row without an inventory
        // movement. Keep them visible, but label them so callers do not treat
        // substituted legacy metadata as authoritative.
        const legacyRows = ledgerEntries
            .filter(entry => !matchingMovements.some(movement =>
                relationId(movement.product_id) === Number(entry.productId)
                && relationId(movement.branch_id) === Number(entry.branchId)
                && Number(movement.quantity) === Number(entry.quantity)
                && (
                    relationId(movement.source_document_id) === Number(entry.documentNo)
                    || String(movement.source_document_no || "").trim() === String(entry.documentNo || "").trim()
                )
            ))
            .filter(entry => !requestedJobOrder || String(entry.documentNo || "").trim() === requestedJobOrder)
            .map(entry => {
                const lotNumber = entry.documentDescription?.startsWith("MFG Run: ")
                    ? entry.documentDescription.substring("MFG Run: ".length).trim()
                    : String(entry.documentDescription || "").trim();
                const matchedProduct = products.find(product => Number(product.product_id) === Number(entry.productId));
                const matchedYield = yields.find(yieldRow =>
                    String(yieldRow.lot_number || "").trim() === lotNumber
                    && String(yieldRow.job_order_id?.job_order_no || yieldRow.job_order_id || "").trim() === String(entry.documentNo || "").trim()
                );
                return {
                    id: entry.id,
                    movement_id: null,
                    yield_ledger_id: directusRecordId(matchedYield),
                    job_order_id: Number(entry.documentNo) || null,
                    job_order_status: null,
                    jo_id: entry.documentNo,
                    product_id: Number(entry.productId),
                    product_name: matchedProduct?.product_name || "Manufactured Good",
                    quantity_produced: Number(entry.quantity),
                    quantity: Number(entry.quantity),
                    branch_id: Number(entry.branchId),
                    lot_number: lotNumber,
                    qa_status: matchedYield?.qa_status || "Pending",
                    manufacturing_date: dateOnly(matchedYield?.manufacturing_date),
                    expiration_date: dateOnly(matchedYield?.expiry_date),
                    unit_cost: Number(matchedProduct?.cost_per_unit || 0),
                    date_received: entry.documentDate || null,
                    legacy_source: true
                };
            });

        return NextResponse.json([...movementReceiptRows, ...legacyRows]);
    } catch (e) {
        console.error("API Error in production finished-goods GET:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch finished goods receipts" },
            { status: e instanceof MmInventoryMovementError ? e.status : 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const todayStr = await getTodayDateString();
        const body = await request.json();
        const {
            joId,
            productId,
            productName,
            quantityProduced,
            branchId,
            lotNumber,
            expirationDate,
            manufacturingDate,
            unitCost,
            componentsConsumed,
            yieldLedgerId,
            completeJobOrder = true
        } = body;

        if (!joId || !productId || !quantityProduced || !branchId) {
            return NextResponse.json({ error: "Missing required fields (joId, productId, quantityProduced, branchId)" }, { status: 400 });
        }

        if (completeJobOrder) {
            try {
                const result = await completeYieldClosing({
                    joId,
                    productId,
                    productName,
                    quantityProduced,
                    branchId,
                    lotNumber,
                    expirationDate,
                    manufacturingDate,
                    unitCost,
                    componentsConsumed,
                    yieldLedgerId
                });
                return NextResponse.json(result);
            } catch (error) {
                if (error instanceof YieldCompletionError) {
                    return NextResponse.json({
                        success: false,
                        error: error.message,
                        code: error.code,
                        ...(error.operationKey ? { operationKey: error.operationKey } : {}),
                        reconciliationRequired: error.reconciliationRequired,
                        ...(error.reconciliation ? { reconciliation: error.reconciliation } : {})
                    }, { status: error.status });
                }
                if (error instanceof YieldMaterialsError) {
                    return NextResponse.json({
                        success: false,
                        error: error.message,
                        code: error.code,
                        reconciliationRequired: false
                    }, { status: error.status });
                }
                throw error;
            }
        }

        // Helper function to resolve or create master lot in the lots table
        const resolveMasterLotId = async (name: string, typeId: number) => {
            const mappedTypeId = typeId === 1 ? 390 : 389;
            const lotQuery = encodeURIComponent(JSON.stringify({ lot_name: { _eq: name } }));
            const lotLookupRes = await fetch(`${DIRECTUS_URL}/items/lots?filter=${lotQuery}&limit=1`, { headers, cache: "no-store" });
            if (!lotLookupRes.ok) {
                throw new Error(`Master lot lookup failed with HTTP ${lotLookupRes.status}.`);
            }
            const lotLookup = (await lotLookupRes.json()).data || [];
            const existingLotId = Number(lotLookup[0]?.lot_id ?? lotLookup[0]?.id ?? 0);
            if (Number.isFinite(existingLotId) && existingLotId > 0) return existingLotId;

            const createLotRes = await fetch(`${DIRECTUS_URL}/items/lots`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    lot_name: name,
                    inventory_type_id: mappedTypeId,
                    max_batch_capacity: 100000,
                    created_by: 24
                })
            });
            if (!createLotRes.ok) {
                throw new Error(`Master lot creation failed with HTTP ${createLotRes.status}.`);
            }
            const createdLot = (await createLotRes.json()).data;
            const createdLotId = Number(createdLot?.lot_id ?? createdLot?.id ?? 0);
            if (!Number.isFinite(createdLotId) || createdLotId <= 0) {
                throw new Error("Master lot creation returned no valid identifier.");
            }
            return createdLotId;
        };

        const qty = Number(quantityProduced);
        const bId = Number(branchId);
        const pId = Number(productId);
        const finalLotNo = lotNumber || `MFG-${joId}`;
        const finalExpDate = expirationDate || await getTodayDateString(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
        let sourceDocumentId = Number(joId);
        if (!Number.isSafeInteger(sourceDocumentId) || sourceDocumentId <= 0) sourceDocumentId = 0;

        // Fetch planned quantity to scale raw material consumption dynamically based on actual yield vs planned yield
        let scaleFactor = 1;
        try {
            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joId)}&limit=1`, { headers });
            if (joRes.ok) {
                const joData = (await joRes.json()).data || [];
                if (joData.length > 0) {
                    const resolvedJobOrderId = Number(joData[0].job_order_id);
                    if (sourceDocumentId <= 0 && Number.isSafeInteger(resolvedJobOrderId) && resolvedJobOrderId > 0) {
                        sourceDocumentId = resolvedJobOrderId;
                    }
                    const plannedQty = Number(joData[0].target_quantity) || 0;
                    if (plannedQty > 0) {
                        scaleFactor = qty / plannedQty;
                        console.log(`[BFF Finished Goods] Dynamic scaling factor: ${scaleFactor} (Actual: ${qty}, Planned: ${plannedQty})`);
                    }
                }
            }
        } catch (scaleErr) {
            console.error("[BFF Finished Goods] Error calculating raw material scale factor:", scaleErr);
        }

        const scaledComponents: ComponentConsumed[] = (componentsConsumed && Array.isArray(componentsConsumed))
            ? componentsConsumed.map((comp: ConsumeComponentBody) => {
                const compId = Number(comp.component_product_id || comp.product_id);
                const baseQty = Number(comp.required || comp.quantity || 0);
                return {
                    ...comp,
                    component_product_id: compId,
                    scaledQuantity: baseQty * scaleFactor
                };
            })
            : [];

        // Strict Inventory Sufficiency Check for Consumed Components using cloud product ledger
        if (scaledComponents.length > 0) {
            const compIds = scaledComponents
                .map(c => c.component_product_id)
                .filter(id => !isNaN(id) && id > 0);

            if (compIds.length > 0) {
                const compIdsStr = compIds.join(",");
                let ledgerData: LedgerEntry[] = [];
                try {
                    const ledgerRes = await fetch(`${DIRECTUS_URL}/items/product_ledger?filter[productId][_in]=${compIdsStr}&filter[branchId][_eq]=${bId}&limit=-1`, { 
                        headers, 
                        cache: "no-store" 
                    });
                    if (ledgerRes.ok) {
                        ledgerData = (await ledgerRes.json()).data || [];
                    } else {
                        console.error("[BFF Finished Goods] Failed to fetch ledger items for stock checks:", await ledgerRes.text());
                    }
                } catch (ledgerErr) {
                    console.error("[BFF Finished Goods] Ledger stock check request failed:", ledgerErr);
                }

                // Map product ID to current accumulated stock
                const stockMap: Record<number, number> = {};
                compIds.forEach(id => {
                    stockMap[id] = 0;
                });

                ledgerData.forEach(entry => {
                    const pId = Number(entry.productId);
                    const entryQty = Number(entry.quantity) || 0;
                    if (stockMap[pId] !== undefined) {
                        stockMap[pId] += entryQty;
                    }
                });

                const insufficient: string[] = [];
                for (const comp of scaledComponents) {
                    const compId = comp.component_product_id;
                    const compQtyRequired = comp.scaledQuantity;
                    const compName = comp.component_name || comp.product_name || `Component #${compId}`;

                    if (compId && compQtyRequired > 0) {
                        const available = stockMap[compId] || 0;
                        if (available < compQtyRequired) {
                            insufficient.push(`${compName} (Needed: ${compQtyRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Available: ${available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
                        }
                    }
                }

                if (insufficient.length > 0) {
                    return NextResponse.json({ 
                        error: `You have insufficient stock for: ${insufficient.join(", ")}` 
                    }, { status: 400 });
                }
            }
        }

        const newReceipt = {
            id: Date.now(),
            jo_id: joId,
            product_id: pId,
            product_name: productName || "Manufactured Good",
            quantity_produced: qty,
            branch_id: bId,
            lot_number: finalLotNo,
            expiration_date: finalExpDate,
            unit_cost: Number(unitCost || 0),
            date_received: new Date().toISOString()
        };

        // 1. Automatically register finished goods into the decoupled inventory system
        let skipStockOperations = false;
        try {
            // Check if there is already a positive finished goods movement for this lot and job order in inventory_movements
            let existingMvts = await fetchMmInventoryMovements({
                product: pId,
                batchNo: finalLotNo,
                transactionTypeId: 2,
                movementDirection: "IN",
                referenceId: sourceDocumentId > 0 ? sourceDocumentId : null,
                referenceNo: sourceDocumentId > 0 ? null : String(joId)
            });
            if (existingMvts.length === 0 && sourceDocumentId > 0) {
                existingMvts = await fetchMmInventoryMovements({
                    product: pId,
                    batchNo: finalLotNo,
                    transactionTypeId: 2,
                    movementDirection: "IN",
                    referenceNo: String(joId)
                });
            }
            if (existingMvts.length > 0) {
                skipStockOperations = true;
                console.log(`[BFF Finished Goods] Prior yield movement found for JO ${joId} and Lot ${finalLotNo}. Skipping stock operations to prevent duplicates.`);
            }
        } catch (checkErr) {
            console.error("[BFF Finished Goods] Error checking for prior yield movements:", checkErr);
            if (checkErr instanceof MmInventoryMovementError) throw checkErr;
        }

        if (!skipStockOperations) {
            try {
                const finishedLotId = await resolveMasterLotId(finalLotNo, 2); // 2 = Finished Goods

                // 1b. Log finished yield movement in inventory_movements ledger
                const finishedMovementPayload = {
                    product_id: pId,
                    lot_id: finishedLotId,
                    branch_id: bId,
                    transaction_type_id: 2, // Job Order Finished Goods
                    source_document_id: sourceDocumentId || null,
                    source_document_no: joId,
                    batch_no: finalLotNo,
                    expiry_date: finalExpDate,
                    manufacturing_date: manufacturingDate || todayStr,
                    quantity: qty,
                    created_by: 24,
                    remarks: `Finished yield output from Job Order ${joId}`
                };
                const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(finishedMovementPayload)
                });
                if (!movRes.ok) {
                    console.error("[BFF Finished Goods] Failed to create positive inventory movement record:", await movRes.text());
                }
            } catch (err) {
                console.error("[BFF Finished Goods] Error recording stock yield:", err);
                return NextResponse.json({ error: "Failed to record finished goods lot and movement in cloud" }, { status: 500 });
            }
        }

        // 2. Create positive product_ledger entry for produced item
        const ledgerPosRes = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                branchId: bId,
                productId: pId,
                quantity: qty,
                documentType: "Job Order Receipt",
                documentNo: joId,
                documentDescription: `MFG Run: ${finalLotNo}`,
                documentDate: todayStr
            })
        });
        if (!ledgerPosRes.ok) {
            console.error("[BFF Finished Goods] Failed to create positive product ledger record:", await ledgerPosRes.text());
        }

        // 3. Create negative product_ledger entries for consumed components (Deductions) and update inventory_lots
        if (scaledComponents.length > 0) {
            for (const comp of scaledComponents) {
                const compId = comp.component_product_id;
                const compQtyRequired = comp.scaledQuantity;

                if (compId && compQtyRequired > 0) {
                    console.log(`[BFF Finished Goods] Deducting raw material product ID ${compId} (${compQtyRequired} units) consumed for JO ${joId}...`);
                    
                    const ledgerNegRes = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            branchId: bId,
                            productId: compId,
                            quantity: -compQtyRequired,
                            documentType: "Job Order Issue",
                            documentNo: joId,
                            documentDescription: `Consumed to produce: ${productName || "Finished Goods"}`,
                            documentDate: todayStr
                        })
                    });
                    if (!ledgerNegRes.ok) {
                        console.error(`[BFF Finished Goods] Failed to create deduction product ledger record for product ${compId}:`, await ledgerNegRes.text());
                    }

                    // Deduct from FIFO inventory movements ONLY IF we are not skipping stock operations
                    if (!skipStockOperations) {
                        try {
                            // Fetch PO receivings to resolve batch metadata (qa_status, expiry, created_on)
                            const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${compId}&filter[branch_id][_eq]=${bId}&limit=-1`, { headers, cache: "no-store" });
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

                            // Fetch inventory movements to calculate the true ledger stock
                            const movements = await fetchMmInventoryMovements({
                                branch: bId,
                                product: compId
                            });
                            const movementStockMap = new Map<string, number>();
                            movements.forEach((mov: any) => {
                                const batchNo = mov.batch_no || "LOT-N/A";
                                const qty = Number(mov.quantity || 0);
                                movementStockMap.set(batchNo, (movementStockMap.get(batchNo) || 0) + qty);
                            });

                            // Construct active lots enriched
                            const activeLotsEnriched: any[] = [];
                            movementStockMap.forEach((qty, lotNum) => {
                                if (qty > 0) {
                                    const status = batchStatusMap.get(lotNum) || "Passed"; // Default to Passed for legacy stock
                                    if (status === "Passed" || status === "Partially Accepted") {
                                        activeLotsEnriched.push({
                                            lot_number: lotNum,
                                            quantity: qty,
                                            expiry_date: batchExpiryMap.get(lotNum) || null,
                                            created_on: batchCreatedMap.get(lotNum) || null
                                        });
                                    }
                                }
                            });

                            // Sort in JS to guarantee FIFO/FEFO
                            activeLotsEnriched.sort((a: any, b: any) => {
                                if (a.expiry_date && b.expiry_date) {
                                    return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
                                }
                                if (a.expiry_date) return -1;
                                if (b.expiry_date) return 1;
                                return new Date(a.created_on || 0).getTime() - new Date(b.created_on || 0).getTime();
                            });

                            let remainingToDeduct = compQtyRequired;
                            for (const lot of activeLotsEnriched) {
                                if (remainingToDeduct <= 0) break;
                                const available = Number(lot.quantity || 0);
                                const deduct = Math.min(available, remainingToDeduct);
                                remainingToDeduct -= deduct;
                                
                                console.log(`[BFF Finished Goods] Deducting ${deduct} units from lot number: ${lot.lot_number}.`);
                                
                                // Log negative ledger movement in inventory_movements
                                try {
                                    const consumedLotId = await resolveMasterLotId(lot.lot_number || "LOT-N/A", 1); // 1 = Raw Materials
                                    const componentMovementPayload = {
                                        product_id: compId,
                                        lot_id: consumedLotId,
                                        branch_id: bId,
                                        transaction_type_id: 1, // Job Order Consumage
                                        source_document_no: joId,
                                        batch_no: lot.lot_number || "LOT-N/A",
                                        expiry_date: lot.expiry_date || null,
                                        manufacturing_date: lot.created_on ? lot.created_on.split("T")[0] : null,
                                        quantity: -deduct, // Negative for deduction
                                        created_by: 24,
                                        remarks: `Consumed from lot ${lot.lot_number || "N/A"} for JO yield`
                                    };
                                    const movRes = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                                        method: "POST",
                                        headers,
                                        body: JSON.stringify(componentMovementPayload)
                                    });
                                    if (!movRes.ok) {
                                        console.error(`[BFF Finished Goods] Failed to create deduction movement record for product ${compId}:`, await movRes.text());
                                    }
                                } catch (movErr) {
                                    console.error(`[BFF Finished Goods] Error creating deduction movement record for product ${compId}:`, movErr);
                                }
                            }
                        } catch (lotDeductErr) {
                            console.error(`[BFF Finished Goods] Error during inventory movements deduction for component ${compId}:`, lotDeductErr);
                            if (lotDeductErr instanceof MmInventoryMovementError) throw lotDeductErr;
                        }
                    }
                }
            }
        }

        // 2. Update the Job Order status to Completed in the database
        if (completeJobOrder) {
            try {
                const joLookup = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joId)}&limit=1`, { headers });
                if (joLookup.ok) {
                    const joData = (await joLookup.json()).data?.[0];
                    if (joData) {
                        await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joData.job_order_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                status: "Completed",
                                actual_quantity_produced: qty
                            })
                        });

                        // 3. Proportional Sales Order Allocation Splitting & status updates
                        const josoRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[job_order_id][_eq]=${joData.job_order_id}&limit=-1`, { headers });
                        if (josoRes.ok) {
                            const linksResponse = await josoRes.json();
                            const links = linksResponse.data || [];
                            console.log(`[BFF Finished Goods] Found ${links.length} allocations for Job Order ${joId}`);

                            for (const link of links) {
                                const detailId = link.sales_order_detail_id;
                                if (!detailId) continue;

                                let allocatedQty = Number(link.allocated_quantity || 0);
                                const targetQty = Number(joData.target_quantity || 0);
                                if (qty < targetQty && targetQty > 0) {
                                    // Yield loss: split proportionally
                                    allocatedQty = (allocatedQty * qty) / targetQty;
                                }

                                // Fetch the sales order detail to get unit price and current allocated_quantity
                                const detailRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, { headers });
                                if (detailRes.ok) {
                                    const detailData = (await detailRes.json()).data;
                                    if (detailData) {
                                        const currentAllocated = Number(detailData.allocated_quantity || 0);
                                        const newAllocated = currentAllocated + allocatedQty;
                                        const unitPrice = Number(detailData.unit_price || 0);
                                        const newAllocatedAmount = newAllocated * unitPrice;

                                        // Update sales_order_details
                                        await fetch(`${DIRECTUS_URL}/items/sales_order_details/${detailId}`, {
                                            method: "PATCH",
                                            headers,
                                            body: JSON.stringify({
                                                allocated_quantity: newAllocated,
                                                allocated_amount: newAllocatedAmount
                                            })
                                        });

                                        // Check if parent sales order is fully allocated
                                        const parentOrderId = detailData.order_id;
                                        if (parentOrderId) {
                                            const allDetailsRes = await fetch(`${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${parentOrderId}&limit=-1`, { headers });
                                            if (allDetailsRes.ok) {
                                                const allDetails = (await allDetailsRes.json()).data || [];
                                                const allFullyAllocated = allDetails.every((d: any) => {
                                                    const ordered = Number(d.ordered_quantity || 0);
                                                    const alloc = Number(d.allocated_quantity || 0);
                                                    return alloc >= ordered;
                                                });

                                                console.log(`[BFF Finished Goods] Auto-transitioning Sales Order ${parentOrderId} to For Invoicing`);
                                                await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
                                                    method: "PATCH",
                                                    headers,
                                                    body: JSON.stringify({ order_status: "For Invoicing" })
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            console.error(`[BFF Finished Goods] Failed to fetch allocations for Job Order ${joId}: ${josoRes.status}`);
                        }
                    }
                }
            } catch (joErr) {
                console.error("[BFF Finished Goods] Failed to update job order status and process allocations:", joErr);
            }
        }

        return NextResponse.json({ success: true, data: newReceipt });
    } catch (e) {
        console.error("API Error in production finished-goods POST:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to create finished goods receipt" },
            { status: e instanceof MmInventoryMovementError ? e.status : 500 }
        );
    }
}

