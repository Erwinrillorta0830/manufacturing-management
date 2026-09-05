/* eslint-disable */
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { canonicalBatchNumber } from "../_domain";
import { handleQaReceivingPost } from "./_receiving-service";
import { movementStockKey, sumMovementQuantitiesByStorageLot, sumMovementQuantitiesByStock, uniqueRowsByMovementStockKey } from "../../qa-receiving/_movement-stock";
import {
    loadMmLots,
    loadMovementRowsForMmLots,
    MmLotError,
    unitId,
    type MmLotRecord
} from "../../services/mm-lots.service";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import { ProductCategoryTypeValidationError, resolveProductCategoryTypes, type PurchaseOrderCategoryType } from "../_category-type";

interface DirectusLotLog {
    id: number;
    product_id: number | { product_id: number } | null | undefined;
    quantity: number;
    source_type?: string;
    source_reference?: string;
    lot_number?: string;
    batch_no?: string;
    mm_lot_id?: number | { lot_id: number; lot_name?: string } | null;
    lot_id?: number | { lot_id: number; lot_name?: string } | null;
    expiry_date?: string;
    created_on?: string;
    branch_id?: number;
    qa_status?: string;
    rejection_reason?: string;
    unit_cost?: number;
}

interface DirectusProductMin {
    product_id: number;
    product_name: string;
    product_code: string;
    category_type?: PurchaseOrderCategoryType;
}

interface DirectusPurchaseOrderMin {
    purchase_order_id: number;
    purchase_order_no: string;
    reference: string;
    date_received: string;
    date_encoded: string;
    datetime: string;
}

interface AllocationProductContext {
    productId: number;
    productTypeId: number;
    categoryType: PurchaseOrderCategoryType;
    uomId: number;
}

function relationNumber(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationNumber(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadAllocationProduct(productId: number): Promise<AllocationProductContext> {
    const response = await fetch(
        `${DIRECTUS_URL}/items/products/${productId}?fields=product_id,product_type,unit_of_measurement.unit_id`,
        { headers, cache: "no-store" }
    );
    if (!response.ok) throw new Error(`Directus error loading product allocation metadata: ${response.status}`);
    const product = (await response.json()).data as Record<string, unknown> | undefined;
    const productTypeId = relationNumber(product?.product_type, ["product_type_id", "type_id", "id"]);
    const uomId = relationNumber(product?.unit_of_measurement, ["unit_id", "id"]);
    if (!productTypeId || !uomId) throw new Error("The selected product must have a Product Type and UOM before inventory allocation.");
    const categoryTypes = await resolveProductCategoryTypes([productId]);
    const categoryType = categoryTypes.get(productId);
    if (!categoryType) throw new Error("The selected product has no valid Product Type classification.");
    return { productId, productTypeId, categoryType, uomId };
}

function lotNumber(value: unknown): number | null {
    return relationNumber(value, ["lot_id", "id"]);
}

function unitNumber(value: unknown): number | null {
    return relationNumber(value, ["unit_id", "id"]);
}

function productTypeNumber(value: unknown): number | null {
    return relationNumber(value, ["inventory_type_id", "product_type_id", "type_id", "id"]);
}

function finiteCapacity(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dateOnly(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, 10) : null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");
        const productId = searchParams.get("productId");
        const action = searchParams.get("action");
        const parsedProductId = productId === null ? null : Number(productId);

        if (productId !== null && (parsedProductId === null || !Number.isSafeInteger(parsedProductId) || parsedProductId <= 0)) {
            return NextResponse.json({ error: "productId must be a positive integer." }, { status: 400 });
        }

        if (parsedProductId === null || action !== null) {
            await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        }

        // Action: Fetch branches
        if (action === "branches") {
            const res = await fetch(`${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&sort=branch_name&limit=100`, { headers, cache: "no-store" });
            if (!res.ok) throw new Error(`Directus error loading branches: ${res.status}`);
            const json = await res.json();
            return NextResponse.json(json.data);
        }

        if (action === "lots" || action === "batches") {
            if (!parsedProductId) {
                return NextResponse.json({ error: "productId is required for lot and batch lookups." }, { status: 400 });
            }
            const parsedBranchId = Number(branchId);
            if (!Number.isSafeInteger(parsedBranchId) || parsedBranchId <= 0) {
                return NextResponse.json({ error: "branchId is required for lot and batch lookups." }, { status: 400 });
            }
            const product = await loadAllocationProduct(parsedProductId);
            let requestedLotId: number | undefined;
            if (action === "batches") {
                const parsedLotId = Number(searchParams.get("lotId"));
                if (!Number.isSafeInteger(parsedLotId) || parsedLotId <= 0) {
                    return NextResponse.json({ error: "lotId must be a positive integer for batch lookups." }, { status: 400 });
                }
                requestedLotId = parsedLotId;
            }

            const lots = await loadMmLots({
                branchId: parsedBranchId,
                ids: requestedLotId ? [requestedLotId] : undefined,
                onlyActive: true
            });
            const lotIds = lots.map(lot => lotNumber(lot.lot_id)).filter((id): id is number => id !== null);
            const movementRows = await loadMovementRowsForMmLots(
                lotIds,
                "movement_id,product_id,mm_lot_id,lot_id,batch_no,quantity,manufacturing_date,expiry_date"
            );
            const occupiedByLot = sumMovementQuantitiesByStorageLot(movementRows);

            if (action === "batches") {
                const lot = lots[0] as MmLotRecord | undefined;
                if (!lot) return NextResponse.json({ error: "The selected storage lot does not exist." }, { status: 404 });
                const lotId = lotNumber(lot.lot_id) as number;
                const capacity = finiteCapacity(lot.max_batch_capacity);
                const occupied = Math.max(0, occupiedByLot.get(lotId) || 0);
                const lotUomId = unitId(lot.unit_id);
                if (lotUomId !== product.uomId || !capacity || capacity - occupied <= 0) {
                    return NextResponse.json({ error: "The selected storage lot is not compatible with this product." }, { status: 409 });
                }
                const batches = new Map<string, { batchNumber: string; manufacturingDate: string | null; expirationDate: string | null }>();
                for (const movement of movementRows.filter(row =>
                    relationNumber(row.mm_lot_id, ["lot_id", "id"]) === lotId
                    && relationNumber(row.product_id, ["product_id", "id"]) === product.productId
                )) {
                    const batchNumber = String(movement.batch_no ?? "").trim();
                    if (!batchNumber) continue;
                    const existing = batches.get(batchNumber.toLowerCase());
                    batches.set(batchNumber.toLowerCase(), {
                        batchNumber,
                        manufacturingDate: existing?.manufacturingDate || dateOnly(movement.manufacturing_date),
                        expirationDate: existing?.expirationDate || dateOnly(movement.expiry_date)
                    });
                }
                return NextResponse.json([...batches.values()].sort((a, b) => a.batchNumber.localeCompare(b.batchNumber)));
            }

            const eligibleLots = lots.flatMap(lot => {
                const lotId = lotNumber(lot.lot_id);
                if (!lotId) return [];
                const capacity = finiteCapacity(lot.max_batch_capacity);
                const occupiedQuantity = Math.max(0, occupiedByLot.get(lotId) || 0);
                const remainingCapacity = capacity === null ? null : Math.max(0, capacity - occupiedQuantity);
                const uomId = unitId(lot.unit_id);
                if (uomId !== product.uomId || remainingCapacity === null || remainingCapacity <= 0) return [];
                return [{
                    ...lot,
                    mm_lot_id: lotId,
                    branch_id: parsedBranchId,
                    inventory_type_id: null,
                    unit_id: uomId,
                    product_type_id: product.productTypeId,
                    product_category_type: product.categoryType,
                    occupiedQuantity,
                    availableQuantity: remainingCapacity,
                    remainingCapacity,
                    mapping_status: "CANONICAL",
                    is_selectable: true,
                    is_legacy_only: false,
                    read_only: false
                }];
            });
            return NextResponse.json(eligibleLots);
        }

        const getMovementsAndResolveMetadata = async (filterKey: "product_id" | "branch_id", filterVal: number) => {
            const movementRes = await fetch(
                `${DIRECTUS_URL}/items/inventory_movements?filter[${filterKey}][_eq]=${filterVal}&fields=*,mm_lot_id.lot_id,mm_lot_id.lot_name,lot_id.lot_id,lot_id.lot_name,version_id.version_id,transaction_type_id.type_name&limit=-1`,
                { headers, cache: "no-store" }
            );
            if (!movementRes.ok) throw new Error(`Directus error loading movement stock: ${movementRes.status}`);
            const movements = (await movementRes.json()).data || [];

            const movementsByKey = new Map<string, any[]>();
            movements.forEach((m: any) => {
                const key = movementStockKey(m);
                const list = movementsByKey.get(key) || [];
                list.push(m);
                movementsByKey.set(key, list);
            });

            const productIds = Array.from(new Set(movements.map((m: any) => Number(m.product_id)).filter(Boolean)));

            let receipts: any[] = [];
            let yields: any[] = [];
            if (productIds.length > 0) {
                try {
                    const recRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_in]=${productIds.join(",")}&limit=-1`, { headers, cache: "no-store" });
                    if (recRes.ok) receipts = (await recRes.json()).data || [];
                } catch (err) {
                    console.error("Error loading PO receipts:", err);
                }
                try {
                    const yieldRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_in]=${productIds.join(",")}&fields=*,job_order_id.product_id,job_order_id.job_order_no&limit=-1`, { headers, cache: "no-store" });
                    if (yieldRes.ok) yields = (await yieldRes.json()).data || [];
                } catch (err) {
                    console.error("Error loading yield ledger:", err);
                }
            }

            const rawLogs: any[] = [];
            for (const [key, list] of movementsByKey.entries()) {
                const totalQty = list.reduce((sum: number, m: any) => sum + Number(m.quantity || 0), 0);
                if (totalQty <= 0) continue;

                const firstM = list.find((m: any) => Number(m.quantity) > 0) || list[0];
                const mmLotIdObj = firstM.mm_lot_id;
                const historicalLotIdObj = firstM.lot_id;
                const productId = Number(firstM.product_id);
                const batchNo = String(firstM.batch_no || "LOT-N/A").trim() || "LOT-N/A";

                const matchedReceipt = receipts.find((r: any) => {
                    const rProdId = typeof r.product_id === "object" ? r.product_id?.product_id : r.product_id;
                    const rBatch = String(r.batch_no || r.lot_no || "LOT-N/A").trim() || "LOT-N/A";
                    return Number(rProdId) === productId && rBatch === batchNo;
                });
                const matchedYield = yields.find((y: any) => {
                    const yProdId = y.job_order_id?.product_id;
                    const yBatch = String(y.lot_number || `MFG-${y.job_order_id?.job_order_no}`).trim() || "LOT-N/A";
                    return Number(yProdId) === productId && yBatch === batchNo;
                });

                const qaStatus = matchedReceipt?.qa_status || matchedYield?.qa_status || "Passed";
                const expiryDate = matchedReceipt?.expiry_date || firstM.expiry_date || null;
                const unitCost = matchedReceipt?.final_landed_unit_cost || matchedReceipt?.unit_price || null;

                rawLogs.push({
                    id: firstM.movement_id,
                    product_id: productId,
                    branch_id: Number(firstM.branch_id),
                    lot_number: batchNo,
                    batch_no: batchNo,
                    mm_lot_id: mmLotIdObj || null,
                    lot_id: mmLotIdObj || historicalLotIdObj || null,
                    lot_name: typeof mmLotIdObj === "object"
                        ? mmLotIdObj?.lot_name || null
                        : null,
                    expiry_date: expiryDate,
                    created_on: firstM.created_at,
                    qa_status: qaStatus,
                    unit_cost: unitCost,
                    quantity: totalQty,
                    source_type: matchedReceipt ? "procurement" : matchedYield ? "manufacturing" : "legacy",
                    source_reference: matchedReceipt ? String(matchedReceipt.purchase_order_id) : matchedYield ? String(matchedYield.job_order_id?.job_order_no) : null
                });
            }
            return { rawLogs, productIds };
        };

        // Action: Fetch FIFO Inventory for a product across all branches
        if (parsedProductId !== null) {
            const { rawLogs, productIds } = await getMovementsAndResolveMetadata("product_id", parsedProductId);
            let products: DirectusProductMin[] = [];
            if (productIds.length > 0) {
                const prodUrl = `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&limit=-1`;
                const prodRes = await fetch(prodUrl, { headers, cache: "no-store" });
                if (prodRes.ok) {
                    products = (await prodRes.json()).data || [];
                }
            }
            const categoryTypes = await resolveProductCategoryTypes(productIds.map(Number));

            interface DirectusBranch {
                id: number;
                branch_name: string;
                branch_code?: string;
            }
            const poMap: Record<string, DirectusPurchaseOrderMin> = {};
            const branchMap: Record<number, any> = {};
            if (rawLogs.length > 0) {
                const [poRes, branchRes] = await Promise.all([
                    fetch(`${DIRECTUS_URL}/items/purchase_order?limit=-1&fields=purchase_order_id,purchase_order_no,reference,date_received,date_encoded,datetime`, { headers }),
                    fetch(`${DIRECTUS_URL}/items/branches?limit=-1`, { headers })
                ]);
                const poList = (poRes.ok ? (await poRes.json()).data || [] : []) as DirectusPurchaseOrderMin[];
                poList.forEach((po) => {
                    poMap[String(po.purchase_order_id)] = po;
                    if (po.purchase_order_no) {
                        poMap[String(po.purchase_order_no)] = po;
                    }
                });
                const branchList = branchRes.ok ? (await branchRes.json()).data || [] : [];
                branchList.forEach((b: any) => {
                    branchMap[Number(b.id)] = b;
                });
            }

            const mapped = rawLogs.map((r) => {
                const rawProdId = typeof r.product_id === "object" && r.product_id ? r.product_id.product_id : r.product_id;
                const productObj = {
                    ...(products.find((p) => Number(p.product_id) === Number(rawProdId)) || {
                    product_id: Number(rawProdId) || 0,
                    product_name: `Product ID: ${rawProdId}`,
                    product_code: `ID-${rawProdId}`
                    }),
                    category_type: categoryTypes.get(Number(rawProdId))
                };

                const poRef = r.source_reference || "";
                let cleanPoRef = poRef;
                if (poRef.startsWith("PO-")) {
                    cleanPoRef = poRef.substring(3);
                }
                const matchedPo = poMap[poRef] || poMap[cleanPoRef] || null;

                return {
                    line_id: r.id,
                    shipment_id: {
                        shipment_id: matchedPo ? matchedPo.purchase_order_id : (parseInt(cleanPoRef) || null),
                        reference_number: matchedPo ? (matchedPo.reference || matchedPo.purchase_order_no) : poRef,
                        date_received: matchedPo ? (matchedPo.date_received || r.created_on) : r.created_on,
                        created_at: matchedPo ? (matchedPo.date_encoded || matchedPo.datetime) : r.created_on
                    },
                    product_id: productObj,
                    quantity_received: Number(r.quantity || 0),
                    batch_no: canonicalBatchNumber(r.batch_no, r.lot_number),
                    lot_number: canonicalBatchNumber(r.batch_no, r.lot_number) || "LOT-N/A",
                    mm_lot_id: typeof r.mm_lot_id === "object" ? r.mm_lot_id?.lot_id : r.mm_lot_id || null,
                    lot_id: typeof r.mm_lot_id === "object"
                        ? r.mm_lot_id?.lot_id
                        : r.mm_lot_id || (typeof r.lot_id === "object" ? r.lot_id?.lot_id : r.lot_id || null),
                    lot_name: typeof r.mm_lot_id === "object"
                        ? r.mm_lot_id?.lot_name || null
                        : null,
                    storage_assignment_state: r.mm_lot_id ? "assigned" : "legacy_unassigned",
                    expiration_date: r.expiry_date,
                    branch_id: branchMap[Number(r.branch_id)] || { branch_name: `Branch ID ${r.branch_id}`, branch_code: `BR-${r.branch_id}` },
                    rejection_reason: "",
                    qa_status: r.qa_status || "Passed",
                    base_unit_cost_php: Number(r.unit_cost || 0),
                    allocated_expense_php: 0,
                    final_landed_unit_cost: Number(r.unit_cost || 0)
                };
            });

            return NextResponse.json(mapped);
        }

        // Action: Fetch FIFO Inventory for a branch
        if (branchId) {
            const { rawLogs, productIds } = await getMovementsAndResolveMetadata("branch_id", Number(branchId));
            let products: DirectusProductMin[] = [];
            if (productIds.length > 0) {
                const prodUrl = `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&limit=-1`;
                const prodRes = await fetch(prodUrl, { headers, cache: "no-store" });
                if (prodRes.ok) {
                    products = (await prodRes.json()).data || [];
                }
            }
            const categoryTypes = await resolveProductCategoryTypes(productIds.map(Number));

            const poMap: Record<string, DirectusPurchaseOrderMin> = {};
            if (rawLogs.length > 0) {
                const poRes = await fetch(`${DIRECTUS_URL}/items/purchase_order?limit=-1&fields=purchase_order_id,purchase_order_no,reference,date_received,date_encoded,datetime`, { headers });
                const poList = (poRes.ok ? (await poRes.json()).data || [] : []) as DirectusPurchaseOrderMin[];
                poList.forEach((po) => {
                    poMap[String(po.purchase_order_id)] = po;
                    if (po.purchase_order_no) {
                        poMap[String(po.purchase_order_no)] = po;
                    }
                });
            }

            const mapped = rawLogs.map((r) => {
                const rawProdId = typeof r.product_id === "object" && r.product_id ? r.product_id.product_id : r.product_id;
                const productObj = {
                    ...(products.find((p) => Number(p.product_id) === Number(rawProdId)) || {
                    product_id: Number(rawProdId) || 0,
                    product_name: `Product ID: ${rawProdId}`,
                    product_code: `ID-${rawProdId}`
                    }),
                    category_type: categoryTypes.get(Number(rawProdId))
                };

                const poRef = r.source_reference || "";
                let cleanPoRef = poRef;
                if (poRef.startsWith("PO-")) {
                    cleanPoRef = poRef.substring(3);
                }
                const matchedPo = poMap[poRef] || poMap[cleanPoRef] || null;

                return {
                    line_id: r.id,
                    shipment_id: {
                        shipment_id: matchedPo ? matchedPo.purchase_order_id : (parseInt(cleanPoRef) || null),
                        reference_number: matchedPo ? (matchedPo.reference || matchedPo.purchase_order_no) : poRef,
                        date_received: matchedPo ? (matchedPo.date_received || r.created_on) : r.created_on,
                        created_at: matchedPo ? (matchedPo.date_encoded || matchedPo.datetime) : r.created_on
                    },
                    product_id: productObj,
                    quantity_received: Number(r.quantity || 0),
                    batch_no: canonicalBatchNumber(r.batch_no, r.lot_number),
                    lot_number: canonicalBatchNumber(r.batch_no, r.lot_number) || "LOT-N/A",
                    mm_lot_id: typeof r.mm_lot_id === "object" ? r.mm_lot_id?.lot_id : r.mm_lot_id || null,
                    lot_id: typeof r.mm_lot_id === "object"
                        ? r.mm_lot_id?.lot_id
                        : r.mm_lot_id || (typeof r.lot_id === "object" ? r.lot_id?.lot_id : r.lot_id || null),
                    lot_name: typeof r.mm_lot_id === "object"
                        ? r.mm_lot_id?.lot_name || null
                        : null,
                    storage_assignment_state: r.mm_lot_id ? "assigned" : "legacy_unassigned",
                    expiration_date: r.expiry_date,
                    branch_id: r.branch_id,
                    rejection_reason: "",
                    qa_status: r.qa_status || "Passed",
                    base_unit_cost_php: Number(r.unit_cost || 0),
                    allocated_expense_php: 0,
                    final_landed_unit_cost: Number(r.unit_cost || 0)
                };
            });

            return NextResponse.json(mapped);
        }

        return NextResponse.json({ error: "Missing parameter branchId or action=branches" }, { status: 400 });
    } catch (e) {
        console.error("API Error in QA Receiving route:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Internal server error" }, {
        status: e instanceof PurchaseOrderAuthorizationError || e instanceof ProductCategoryTypeValidationError
            ? e.status
            : e instanceof MmLotError
                ? e.status
                : 500
        });
    }
}

export async function POST(request: Request) {
    try {
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.receiving });
        return handleQaReceivingPost(request, { actorUserId: actor.userId });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message || "Failed to process QA receiving." }, {
            status: error instanceof PurchaseOrderAuthorizationError ? error.status : 500
        });
    }
}
