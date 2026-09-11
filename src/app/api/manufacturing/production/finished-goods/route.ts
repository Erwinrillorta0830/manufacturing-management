/* eslint-disable */
import { NextResponse } from "next/server";
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
    mm_lot_id?: number | string | Record<string, unknown>;
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
        const body = await request.json();
        const {
            joId,
            productId,
            productName,
            quantityProduced,
            branchId,
            lotNumber,
            mmLotId,
            expirationDate,
            manufacturingDate,
            unitCost,
            componentsConsumed,
            yieldLedgerId,
            completeJobOrder = true
        } = body;

        if (!joId || !productId || !quantityProduced || !branchId) {
            return NextResponse.json(
                { error: "Missing required fields (joId, productId, quantityProduced, branchId)" },
                { status: 400 }
            );
        }

        if (completeJobOrder !== true) {
            return NextResponse.json({
                success: false,
                error: "Legacy finished-goods posting is retired. Use the canonical yield-closing flow with an existing mmLotId and batch number.",
                code: "LEGACY_FINISHED_GOODS_POSTING_RETIRED"
            }, { status: 410 });
        }

        try {
            const result = await completeYieldClosing({
                joId,
                productId,
                productName,
                quantityProduced,
                branchId,
                lotNumber,
                mmLotId,
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
    } catch (error) {
        console.error("API Error in production finished-goods POST:", error);
        return NextResponse.json(
            { error: (error as { message?: string }).message || "Failed to create finished goods receipt" },
            { status: error instanceof MmInventoryMovementError ? error.status : 500 }
        );
    }
}
