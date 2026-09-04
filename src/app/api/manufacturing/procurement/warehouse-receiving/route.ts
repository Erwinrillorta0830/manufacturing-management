import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { procurementDirectusFetch } from "../_directus";
import {
    INVENTORY_STATUS,
    inventoryStatusToPurchaseOrderStatus,
    type InventoryStatusId
} from "../_domain";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECEIPT_NUMBER_MAX_LENGTH = 32;
const QUANTITY_EPSILON = 1e-9;

const positiveId = z.coerce.number().int().positive();
const warehouseLineSchema = z.object({
    lineId: positiveId,
    productId: positiveId,
    receivedQuantity: z.coerce.number().finite().min(0)
});

const warehouseRequestSchema = z.object({
    action: z.enum(["start", "save_draft", "submit_to_qa"]),
    purchaseOrderId: positiveId,
    workflowRevision: z.coerce.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(100).optional(),
    receiptNumber: z.string().trim().max(RECEIPT_NUMBER_MAX_LENGTH).nullable().optional(),
    receiptType: z.enum(["full", "partial"]).nullable().optional(),
    receiptDate: z.string().trim().nullable().optional(),
    branchId: positiveId.optional(),
    lines: z.array(warehouseLineSchema).optional()
});

type WarehouseRequest = z.infer<typeof warehouseRequestSchema>;

interface DirectusOrder {
    purchase_order_id?: unknown;
    purchase_order_no?: unknown;
    reference?: unknown;
    supplier_name?: unknown;
    branch_id?: unknown;
    inventory_status?: unknown;
    payment_status?: unknown;
    workflow_revision?: unknown;
    currency_code?: unknown;
    total_amount?: unknown;
    date_encoded?: unknown;
}

interface DirectusLine {
    purchase_order_product_id?: unknown;
    purchase_order_id?: unknown;
    product_id?: unknown;
    branch_id?: unknown;
    ordered_quantity?: unknown;
    received?: unknown;
    unit_price?: unknown;
    unit_price_foreign?: unknown;
    discounted_amount?: unknown;
    discount_percent?: unknown;
    total_amount?: unknown;
}

interface DirectusProduct {
    product_id?: unknown;
    product_name?: unknown;
    product_code?: unknown;
}

interface DirectusReceiving {
    purchase_order_product_id?: unknown;
    purchase_order_id?: unknown;
    purchase_order_line_id?: unknown;
    receiving_header_id?: unknown;
    product_id?: unknown;
    branch_id?: unknown;
    receipt_no?: unknown;
    receipt_date?: unknown;
    received_date?: unknown;
    received_quantity?: unknown;
    quantity_rejected?: unknown;
    isPosted?: unknown;
    is_reverted?: unknown;
    receiving_method?: unknown;
    receipt_type?: unknown;
    qa_status?: unknown;
}

interface DirectusHeader {
    id?: unknown;
    receiving_ticket_no?: unknown;
    purchase_order_id?: unknown;
    branch_id?: unknown;
    workflow_revision?: unknown;
    idempotency_key?: unknown;
    posting_status?: unknown;
    created_by?: unknown;
    receipt_date?: unknown;
    receipt_type?: unknown;
    quantity_status?: unknown;
}

interface DirectusBranch {
    id?: unknown;
    branch_name?: unknown;
    branch_code?: unknown;
    isActive?: unknown;
}

class WarehouseReceivingError extends Error {
    constructor(message: string, readonly statusCode = 500) {
        super(message);
    }
}

function bodyRows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function bodyData(body: unknown): Record<string, unknown> | null {
    return body && typeof body === "object" && "data" in body && body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? body.data as Record<string, unknown>
        : null;
}

function relationId(value: unknown, keys: string[] = ["id"]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationId(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function numberValue(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isOne(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

function isWarehouse(row: DirectusReceiving): boolean {
    return String(row.receiving_method || "").trim().toUpperCase() === "WAREHOUSE";
}

function isUnposted(row: DirectusReceiving): boolean {
    return !isOne(row.isPosted) && !isOne(row.is_reverted);
}

function headerId(row: DirectusReceiving): number | null {
    return relationId(row.receiving_header_id, ["id", "receiving_header_id"]);
}

function lineId(row: DirectusReceiving | DirectusLine): number | null {
    return relationId(
        "purchase_order_line_id" in row ? row.purchase_order_line_id : row.purchase_order_product_id,
        ["purchase_order_product_id", "id"]
    );
}

function productId(row: DirectusReceiving | DirectusLine): number | null {
    return relationId(row.product_id, ["product_id", "id"]);
}

function validateDateOnly(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new WarehouseReceivingError("Receipt Date must use YYYY-MM-DD format.", 400);
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new WarehouseReceivingError("Receipt Date is not a valid calendar date.", 400);
    }
    return value;
}

function directusUrl(path: string): string {
    return path.startsWith("/") ? path : `/${path}`;
}

async function directusJson(path: string, init?: RequestInit) {
    const response = await procurementDirectusFetch(directusUrl(path), init);
    const text = await response.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { response, body, text };
}

async function directusRows(path: string, message: string): Promise<Record<string, unknown>[]> {
    const result = await directusJson(path);
    if (!result.response.ok) throw new WarehouseReceivingError(message, 503);
    return bodyRows(result.body);
}

async function loadOrder(purchaseOrderId: number): Promise<DirectusOrder> {
    const result = await directusJson(`/items/purchase_order/${purchaseOrderId}?fields=purchase_order_id,purchase_order_no,reference,supplier_name,branch_id,inventory_status,payment_status,workflow_revision,currency_code,total_amount,date_encoded`);
    if (result.response.status === 404) throw new WarehouseReceivingError("Purchase order not found.", 404);
    if (!result.response.ok) throw new WarehouseReceivingError("Unable to load the purchase order.", 503);
    const order = bodyData(result.body) as DirectusOrder | null;
    if (!order) throw new WarehouseReceivingError("Purchase order data is unavailable.", 503);
    return order;
}

async function loadLines(purchaseOrderId: number) {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        fields: "purchase_order_product_id,purchase_order_id,product_id,branch_id,ordered_quantity,received,unit_price,unit_price_foreign,discounted_amount,discount_percent,total_amount",
        limit: "-1",
        sort: "purchase_order_product_id"
    });
    const rows = await directusRows(`/items/purchase_order_products?${params.toString()}`, "Unable to load purchase-order lines.");
    const productIds = [...new Set(rows.map(productId).filter((id): id is number => id !== null))];
    const products = productIds.length === 0
        ? []
        : await directusRows(
            `/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`,
            "Unable to load purchase-order products."
        );
    const productMap = new Map(products.map(product => [relationId(product.product_id, ["product_id", "id"]), product as DirectusProduct]));
    return rows.map(row => {
        const id = lineId(row as DirectusLine);
        const product = productMap.get(productId(row as DirectusLine) || 0);
        return {
            lineId: id || 0,
            productId: productId(row as DirectusLine) || 0,
            productName: String(product?.product_name || `Product #${productId(row as DirectusLine) || ""}`),
            productCode: String(product?.product_code || ""),
            orderedQuantity: numberValue(row.ordered_quantity),
            receivedFlag: isOne(row.received),
            unitPrice: numberValue(row.unit_price),
            unitPriceForeign: numberValue(row.unit_price_foreign),
            discountedAmount: numberValue(row.discounted_amount),
            discountPercent: numberValue(row.discount_percent),
            totalAmount: numberValue(row.total_amount),
            branchId: relationId(row.branch_id, ["id", "branch_id"])
        };
    });
}

async function loadReceivingRows(purchaseOrderId: number): Promise<DirectusReceiving[]> {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        "filter[is_reverted][_eq]": "0",
        fields: "purchase_order_product_id,purchase_order_id,purchase_order_line_id,receiving_header_id,product_id,branch_id,receipt_no,receipt_date,received_date,received_quantity,quantity_rejected,isPosted,is_reverted,receiving_method,receipt_type,qa_status",
        limit: "-1",
        sort: "purchase_order_product_id"
    });
    return await directusRows(`/items/purchase_order_receiving?${params.toString()}`, "Unable to load receiving history.") as DirectusReceiving[];
}

async function loadHeaders(purchaseOrderId: number): Promise<DirectusHeader[]> {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        fields: "id,receiving_ticket_no,purchase_order_id,branch_id,workflow_revision,idempotency_key,posting_status,created_by,receipt_date,receipt_type,quantity_status",
        limit: "-1",
        sort: "-id"
    });
    return await directusRows(`/items/purchase_order_receiving_headers?${params.toString()}`, "Unable to load receiving drafts.") as DirectusHeader[];
}

async function loadBranch(branchId: number): Promise<DirectusBranch> {
    const result = await directusJson(`/items/branches/${branchId}?fields=id,branch_name,branch_code,isActive`);
    if (!result.response.ok) throw new WarehouseReceivingError("The selected receiving branch could not be loaded.", 503);
    const branch = bodyData(result.body) as DirectusBranch | null;
    if (!branch || (branch.isActive !== undefined && !isOne(branch.isActive))) {
        throw new WarehouseReceivingError("The selected receiving branch is not active.", 400);
    }
    return branch;
}

async function loadSupplierName(value: unknown): Promise<string> {
    const supplierId = relationId(value, ["id", "supplier_id"]);
    if (!supplierId) return "Unknown supplier";
    const result = await directusJson(`/items/suppliers/${supplierId}?fields=id,supplier_name`);
    if (!result.response.ok) return `Supplier #${supplierId}`;
    const supplier = bodyData(result.body);
    return String(supplier?.supplier_name || `Supplier #${supplierId}`);
}

async function findWarehouseHeader(purchaseOrderId: number, workflowRevision: number): Promise<DirectusHeader | null> {
    const headers = await loadHeaders(purchaseOrderId);
    return headers.find(header =>
        Number(header.workflow_revision) === workflowRevision
        && String(header.posting_status || "") === "Reserved"
    ) || null;
}

async function duplicateReceiptNumber(receiptNumber: string, currentHeaderId: number): Promise<boolean> {
    const params = new URLSearchParams({
        "filter[receiving_ticket_no][_eq]": receiptNumber,
        fields: "id",
        limit: "-1"
    });
    const rows = await directusRows(`/items/purchase_order_receiving_headers?${params.toString()}`, "Unable to verify Receipt Number uniqueness.");
    return rows.some(row => Number(row.id) !== currentHeaderId);
}

async function patchPurchaseOrderConditionally(
    purchaseOrderId: number,
    currentStatus: number,
    currentRevision: number,
    data: Record<string, unknown>
): Promise<boolean> {
    const result = await directusJson(`/items/purchase_order?fields=purchase_order_id,inventory_status,workflow_revision`, {
        method: "PATCH",
        body: JSON.stringify({
            query: {
                filter: {
                    purchase_order_id: { _eq: purchaseOrderId },
                    inventory_status: { _eq: currentStatus },
                    workflow_revision: { _eq: currentRevision }
                },
                limit: 1
            },
            data
        })
    });
    if (!result.response.ok) {
        throw new WarehouseReceivingError("Unable to update the purchase-order workflow.", 503);
    }
    return bodyRows(result.body).length === 1;
}

async function patchHeader(headerId: number, data: Record<string, unknown>) {
    const result = await directusJson(`/items/purchase_order_receiving_headers/${headerId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
    });
    if (!result.response.ok) throw new WarehouseReceivingError("Unable to persist the warehouse receiving draft.", 503);
}

async function deleteReceivingRow(id: number) {
    const result = await directusJson(`/items/purchase_order_receiving/${id}`, { method: "DELETE" });
    if (!result.response.ok) throw new WarehouseReceivingError(`Warehouse draft line ${id} could not be removed during rollback.`, 503);
}

async function writeWorkflowHistory(input: {
    purchaseOrderId: number;
    action: string;
    actorId: number;
    fromStatus: number;
    toStatus: number;
    revisionBefore: number;
    revisionAfter: number;
    remarks: string;
}) {
    const result = await directusJson("/items/purchase_order_approval_history", {
        method: "POST",
        body: JSON.stringify({
            purchase_order_id: input.purchaseOrderId,
            action: input.action,
            approval_stage: "System",
            actor_id: input.actorId,
            actor_role_id: null,
            remarks: input.remarks,
            from_inventory_status: input.fromStatus,
            to_inventory_status: input.toStatus,
            revision_before: input.revisionBefore,
            revision_after: input.revisionAfter,
            created_at: new Date().toISOString()
        })
    });
    if (!result.response.ok) throw new WarehouseReceivingError("Purchase-order workflow history could not be recorded.", 503);
}

function orderBranchId(order: DirectusOrder): number {
    const branchId = relationId(order.branch_id, ["id", "branch_id"]);
    if (!branchId) throw new WarehouseReceivingError("The purchase order does not have a valid receiving branch.", 409);
    return branchId;
}

function statusId(order: DirectusOrder): number {
    const status = Number(order.inventory_status);
    return Number.isSafeInteger(status) ? status : 0;
}

function workflowRevision(order: DirectusOrder): number {
    const revision = Number(order.workflow_revision || 0);
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

async function buildOrderView(order: DirectusOrder) {
    const purchaseOrderId = relationId(order.purchase_order_id, ["purchase_order_id", "id"]);
    if (!purchaseOrderId) throw new WarehouseReceivingError("Purchase order data is invalid.", 503);
    const [lines, receivingRows, headers, supplierName, branch] = await Promise.all([
        loadLines(purchaseOrderId),
        loadReceivingRows(purchaseOrderId),
        loadHeaders(purchaseOrderId),
        loadSupplierName(order.supplier_name),
        loadBranch(orderBranchId(order))
    ]);
    const warehouseHeaders = headers.filter(header => String(header.posting_status || "") === "Reserved");
    const warehouseHeader = warehouseHeaders.find(header =>
        Number(header.workflow_revision) === workflowRevision(order)
    ) || warehouseHeaders[0] || null;
    const warehouseHeaderId = Number(warehouseHeader?.id || 0);
    const warehouseRows = receivingRows.filter(row =>
        isWarehouse(row)
        && isUnposted(row)
        && headerId(row) === warehouseHeaderId
    );
    const postedRows = receivingRows.filter(row => !isWarehouse(row) || isOne(row.isPosted));
    const previousByLine = new Map<number, number>();
    for (const row of postedRows) {
        const id = lineId(row);
        if (!id) continue;
        previousByLine.set(id, (previousByLine.get(id) || 0) + Math.max(0, numberValue(row.received_quantity)));
    }
    const draftByLine = new Map<number, number>();
    for (const row of warehouseRows) {
        const id = lineId(row);
        if (!id) continue;
        draftByLine.set(id, (draftByLine.get(id) || 0) + Math.max(0, numberValue(row.received_quantity)));
    }
    const viewLines = lines.map(line => {
        const previouslyReceivedQuantity = previousByLine.get(line.lineId) || 0;
        const currentReceivedQuantity = draftByLine.get(line.lineId) || 0;
        return {
            ...line,
            previouslyReceivedQuantity,
            currentReceivedQuantity,
            remainingQuantity: Math.max(0, line.orderedQuantity - previouslyReceivedQuantity),
            allowableQuantity: Math.max(0, line.orderedQuantity - previouslyReceivedQuantity)
        };
    });
    return {
        id: purchaseOrderId,
        poNumber: String(order.reference || order.purchase_order_no || `PO-${purchaseOrderId}`),
        purchaseOrderNumber: String(order.purchase_order_no || ""),
        supplierName,
        branch: {
            id: relationId(branch.id, ["id", "branch_id"]) || orderBranchId(order),
            name: String(branch.branch_name || ""),
            code: String(branch.branch_code || "")
        },
        branchId: orderBranchId(order),
        status: inventoryStatusToPurchaseOrderStatus(statusId(order), Number(order.payment_status)) as string,
        inventoryStatus: statusId(order) as InventoryStatusId,
        workflowRevision: workflowRevision(order),
        currencyCode: String(order.currency_code || "PHP"),
        totalAmount: numberValue(order.total_amount),
        lines: viewLines,
        draft: warehouseHeader
            ? {
                id: Number(warehouseHeader.id),
                receiptNumber: String(warehouseHeader.receiving_ticket_no || ""),
                receiptDate: warehouseHeader.receipt_date ? String(warehouseHeader.receipt_date).slice(0, 10) : "",
                receiptType: String(warehouseHeader.receipt_type || "full").toLowerCase(),
                quantityStatus: String(warehouseHeader.quantity_status || "PARTIAL"),
                postingStatus: String(warehouseHeader.posting_status || "Reserved")
            }
            : null
    };
}

function requireReceiptMetadata(command: WarehouseRequest) {
    const receiptNumber = command.receiptNumber?.trim() || "";
    if (!receiptNumber) throw new WarehouseReceivingError("Receipt Number is required.", 400);
    if (receiptNumber.length > RECEIPT_NUMBER_MAX_LENGTH) {
        throw new WarehouseReceivingError(`Receipt Number cannot exceed ${RECEIPT_NUMBER_MAX_LENGTH} characters.`, 400);
    }
    const receiptDate = command.receiptDate?.trim() || "";
    if (!receiptDate) throw new WarehouseReceivingError("Receipt Date is required.", 400);
    return {
        receiptNumber,
        receiptDate: validateDateOnly(receiptDate),
        receiptType: command.receiptType || "full"
    };
}

async function validateWarehouseLines(order: DirectusOrder, command: WarehouseRequest, headerIdValue: number) {
    const submittedLines = command.lines || [];
    const lines = await loadLines(relationId(order.purchase_order_id, ["purchase_order_id", "id"]) || 0);
    if (submittedLines.length !== lines.length) {
        throw new WarehouseReceivingError("Every purchase-order line must be included in the warehouse receipt.", 400);
    }
    const submittedById = new Map<number, typeof submittedLines[number]>();
    for (const line of submittedLines) {
        if (submittedById.has(line.lineId)) throw new WarehouseReceivingError("Duplicate purchase-order lines are not allowed.", 400);
        submittedById.set(line.lineId, line);
    }
    const receivingRows = await loadReceivingRows(relationId(order.purchase_order_id, ["purchase_order_id", "id"]) || 0);
    const postedByLine = new Map<number, number>();
    for (const row of receivingRows) {
        if (isWarehouse(row) && isUnposted(row)) continue;
        const id = lineId(row);
        if (id) postedByLine.set(id, (postedByLine.get(id) || 0) + Math.max(0, numberValue(row.received_quantity)));
    }
    const validated = lines.map(line => {
        const submitted = submittedById.get(line.lineId);
        if (!submitted) throw new WarehouseReceivingError(`Missing warehouse quantity for line ${line.lineId}.`, 400);
        if (submitted.productId !== line.productId) throw new WarehouseReceivingError(`Product mismatch for line ${line.lineId}.`, 400);
        const previous = postedByLine.get(line.lineId) || 0;
        const allowable = Math.max(0, line.orderedQuantity - previous);
        if (submitted.receivedQuantity > allowable + QUANTITY_EPSILON) {
            throw new WarehouseReceivingError(`Received quantity for ${line.productName} exceeds the allowable quantity of ${allowable}.`, 400);
        }
        return { line, quantity: submitted.receivedQuantity };
    });
    if (command.action === "submit_to_qa") {
        const metadata = requireReceiptMetadata(command);
        const total = validated.reduce((sum, item) => sum + item.quantity, 0);
        if (metadata.receiptType === "partial" && total <= QUANTITY_EPSILON) {
            throw new WarehouseReceivingError("A partial warehouse receipt must include at least one received quantity.", 400);
        }
        if (metadata.receiptType === "full" && validated.some(item => item.quantity + QUANTITY_EPSILON < Math.max(0, item.line.orderedQuantity - (postedByLine.get(item.line.lineId) || 0)))) {
            throw new WarehouseReceivingError("A full warehouse receipt must cover the remaining quantity on every line.", 400);
        }
    }
    void headerIdValue;
    return validated;
}

async function persistWarehouseDraft(order: DirectusOrder, command: WarehouseRequest) {
    const purchaseOrderId = relationId(order.purchase_order_id, ["purchase_order_id", "id"]) || 0;
    const header = await findWarehouseHeader(purchaseOrderId, workflowRevision(order));
    if (!header) throw new WarehouseReceivingError("The warehouse receiving draft could not be found. Start Warehouse Receiving again.", 409);
    const headerIdValue = Number(header.id);
    if (!Number.isSafeInteger(headerIdValue) || headerIdValue <= 0) throw new WarehouseReceivingError("The warehouse receiving draft has an invalid header ID.", 503);
    const metadata = requireReceiptMetadata(command);
    const validated = await validateWarehouseLines(order, command, headerIdValue);
    if (await duplicateReceiptNumber(metadata.receiptNumber, headerIdValue)) {
        throw new WarehouseReceivingError("Receipt Number is already in use.", 409);
    }
    const priorHeader = {
        receiving_ticket_no: header.receiving_ticket_no ?? null,
        receipt_date: header.receipt_date ?? null,
        receipt_type: header.receipt_type ?? null,
        quantity_status: header.quantity_status ?? "PARTIAL"
    };
    const existingRows = (await loadReceivingRows(purchaseOrderId)).filter(row => isWarehouse(row) && isUnposted(row) && headerId(row) === headerIdValue);
    const existingByLine = new Map(existingRows.map(row => [lineId(row) || 0, row]));
    const createdIds: number[] = [];
    const updatedSnapshots: Array<{ id: number; data: Record<string, unknown> }> = [];
    try {
        await patchHeader(headerIdValue, {
            receiving_ticket_no: metadata.receiptNumber,
            receipt_date: metadata.receiptDate,
            receipt_type: metadata.receiptType,
            quantity_status: metadata.receiptType === "full" ? "FULL" : "PARTIAL"
        });
        for (const item of validated) {
            const receiptRow = existingByLine.get(item.line.lineId);
            const payload = {
                purchase_order_id: purchaseOrderId,
                purchase_order_line_id: item.line.lineId,
                product_id: item.line.productId,
                branch_id: relationId(order.branch_id, ["id", "branch_id"]),
                receiving_header_id: headerIdValue,
                receipt_no: `${metadata.receiptNumber}-${item.line.lineId}`,
                receipt_date: metadata.receiptDate,
                received_date: null,
                received_quantity: item.quantity,
                quantity_rejected: 0,
                isPosted: 0,
                is_reverted: 0,
                receiving_method: "WAREHOUSE",
                receipt_type: null,
                qa_status: "Pending",
                batch_no: null,
                mm_lot_id: null,
                lot_id: null,
                expiry_date: null,
                unit_price: item.line.unitPrice,
                discounted_amount: item.line.discountedAmount,
                total_amount: item.line.totalAmount,
                allocated_expense_php: 0,
                final_landed_unit_cost: item.line.unitPrice,
                rejection_reason: null
            } as Record<string, unknown>;
            if (receiptRow) {
                const id = Number(receiptRow.purchase_order_product_id);
                updatedSnapshots.push({
                    id,
                    data: Object.fromEntries(Object.keys(payload).map(key => [key, (receiptRow as Record<string, unknown>)[key] ?? null]))
                });
                const result = await directusJson(`/items/purchase_order_receiving/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                });
                if (!result.response.ok) throw new WarehouseReceivingError("Unable to update a warehouse receiving line.", 503);
            } else {
                const result = await directusJson("/items/purchase_order_receiving", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                if (!result.response.ok) throw new WarehouseReceivingError("Unable to create a warehouse receiving line.", 503);
                const createdId = Number(bodyData(result.body)?.purchase_order_product_id || bodyData(result.body)?.id);
                if (!Number.isSafeInteger(createdId) || createdId <= 0) throw new WarehouseReceivingError("Directus did not return the warehouse receiving line ID.", 503);
                createdIds.push(createdId);
            }
        }
    } catch (error) {
        await patchHeader(headerIdValue, priorHeader).catch(() => undefined);
        for (const snapshot of [...updatedSnapshots].reverse()) {
            await directusJson(`/items/purchase_order_receiving/${snapshot.id}`, { method: "PATCH", body: JSON.stringify(snapshot.data) }).catch(() => undefined);
        }
        for (const id of [...createdIds].reverse()) await deleteReceivingRow(id).catch(() => undefined);
        throw error;
    }
    return buildOrderView(await loadOrder(purchaseOrderId));
}

async function startWarehouseReceiving(order: DirectusOrder, command: WarehouseRequest, actorId: number) {
    const purchaseOrderId = relationId(order.purchase_order_id, ["purchase_order_id", "id"]) || 0;
    const currentStatus = statusId(order);
    const currentRevision = workflowRevision(order);
    if (currentStatus === INVENTORY_STATUS.WAREHOUSE_RECEIVING) {
        const header = await findWarehouseHeader(purchaseOrderId, currentRevision);
        if (!header) throw new WarehouseReceivingError("The purchase order is in Warehouse Receiving but its draft is missing.", 409);
        return buildOrderView(order);
    }
    if (currentStatus !== INVENTORY_STATUS.APPROVED) {
        throw new WarehouseReceivingError("Only Approved purchase orders can be started in Warehouse Receiving.", 409);
    }
    const branchId = orderBranchId(order);
    await loadBranch(branchId);
    const nextRevision = currentRevision + 1;
    const idempotencyKey = command.idempotencyKey || randomUUID();
    const existingByKey = await directusRows(
        `/items/purchase_order_receiving_headers?filter[idempotency_key][_eq]=${encodeURIComponent(idempotencyKey)}&fields=id,posting_status&limit=1`,
        "Unable to verify a previous warehouse receiving start."
    );
    if (existingByKey.length > 0) return buildOrderView(await loadOrder(purchaseOrderId));
    const updated = await patchPurchaseOrderConditionally(purchaseOrderId, currentStatus, currentRevision, {
        inventory_status: INVENTORY_STATUS.WAREHOUSE_RECEIVING,
        workflow_revision: nextRevision
    });
    if (!updated) throw new WarehouseReceivingError("The purchase order changed. Reload it before starting warehouse receiving.", 409);
    let createdHeaderId: number | null = null;
    try {
        const result = await directusJson("/items/purchase_order_receiving_headers", {
            method: "POST",
            body: JSON.stringify({
                purchase_order_id: purchaseOrderId,
                branch_id: branchId,
                receiving_ticket_no: null,
                receipt_date: null,
                receipt_type: "full",
                quantity_status: "PARTIAL",
                workflow_revision: nextRevision,
                idempotency_key: idempotencyKey,
                posting_status: "Reserved",
                created_by: actorId
            })
        });
        if (!result.response.ok) throw new WarehouseReceivingError("Unable to create the warehouse receiving draft.", 503);
        createdHeaderId = Number(bodyData(result.body)?.id);
        if (!Number.isSafeInteger(createdHeaderId) || createdHeaderId <= 0) throw new WarehouseReceivingError("Directus did not return the warehouse receiving draft ID.", 503);
        await writeWorkflowHistory({
            purchaseOrderId,
            action: "WarehouseReceivingStarted",
            actorId,
            fromStatus: currentStatus,
            toStatus: INVENTORY_STATUS.WAREHOUSE_RECEIVING,
            revisionBefore: currentRevision,
            revisionAfter: nextRevision,
            remarks: "Warehouse receiving started."
        });
    } catch (error) {
        if (createdHeaderId) await directusJson(`/items/purchase_order_receiving_headers/${createdHeaderId}`, { method: "DELETE" }).catch(() => undefined);
        await patchPurchaseOrderConditionally(purchaseOrderId, INVENTORY_STATUS.WAREHOUSE_RECEIVING, nextRevision, {
            inventory_status: currentStatus,
            workflow_revision: currentRevision
        }).catch(() => undefined);
        throw error;
    }
    return buildOrderView(await loadOrder(purchaseOrderId));
}

async function submitWarehouseReceiving(order: DirectusOrder, command: WarehouseRequest, actorId: number) {
    const purchaseOrderId = relationId(order.purchase_order_id, ["purchase_order_id", "id"]) || 0;
    const currentStatus = statusId(order);
    const currentRevision = workflowRevision(order);
    if (currentStatus !== INVENTORY_STATUS.WAREHOUSE_RECEIVING) {
        throw new WarehouseReceivingError("The purchase order must be in Warehouse Receiving before it can be sent to QA.", 409);
    }
    await persistWarehouseDraft(order, command);
    const nextRevision = currentRevision + 1;
    const updated = await patchPurchaseOrderConditionally(purchaseOrderId, currentStatus, currentRevision, {
        inventory_status: INVENTORY_STATUS.FOR_PICKUP,
        workflow_revision: nextRevision
    });
    if (!updated) throw new WarehouseReceivingError("The purchase order changed while it was being sent to QA. Reload and try again.", 409);
    const header = await findWarehouseHeader(purchaseOrderId, currentRevision);
    if (!header) throw new WarehouseReceivingError("The warehouse receiving draft could not be found after handoff.", 503);
    const headerIdValue = Number(header.id);
    try {
        await patchHeader(headerIdValue, { workflow_revision: nextRevision });
        await writeWorkflowHistory({
            purchaseOrderId,
            action: "WarehouseReceivingSubmittedToQa",
            actorId,
            fromStatus: currentStatus,
            toStatus: INVENTORY_STATUS.FOR_PICKUP,
            revisionBefore: currentRevision,
            revisionAfter: nextRevision,
            remarks: "Warehouse receipt completed and submitted to QA Receiving."
        });
    } catch (error) {
        await patchHeader(headerIdValue, { workflow_revision: currentRevision }).catch(() => undefined);
        await patchPurchaseOrderConditionally(purchaseOrderId, INVENTORY_STATUS.FOR_PICKUP, nextRevision, {
            inventory_status: currentStatus,
            workflow_revision: currentRevision
        }).catch(() => undefined);
        throw error;
    }
    return buildOrderView(await loadOrder(purchaseOrderId));
}

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.warehouseReceiving });
        const { searchParams } = new URL(request.url);
        const purchaseOrderId = Number(searchParams.get("purchaseOrderId") || searchParams.get("poId") || 0);
        if (purchaseOrderId > 0) {
            const order = await loadOrder(purchaseOrderId);
            if (!([INVENTORY_STATUS.APPROVED, INVENTORY_STATUS.WAREHOUSE_RECEIVING] as number[]).includes(statusId(order))) {
                throw new WarehouseReceivingError("This purchase order is not available in Warehouse Receiving.", 409);
            }
            return NextResponse.json({ data: await buildOrderView(order) });
        }
        const params = new URLSearchParams({
            "filter[inventory_status][_in]": `${INVENTORY_STATUS.APPROVED},${INVENTORY_STATUS.WAREHOUSE_RECEIVING}`,
            fields: "purchase_order_id,purchase_order_no,reference,supplier_name,branch_id,inventory_status,payment_status,workflow_revision,currency_code,total_amount,date_encoded",
            limit: "-1",
            sort: "-date_encoded"
        });
        const orders = await directusRows(`/items/purchase_order?${params.toString()}`, "Unable to load the Warehouse Receiving queue.") as DirectusOrder[];
        const views = await Promise.all(orders.map(order => buildOrderView(order)));
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const filtered = search
            ? views.filter(view => `${view.poNumber} ${view.purchaseOrderNumber} ${view.supplierName}`.toLowerCase().includes(search))
            : views;
        const page = Math.max(1, Number(searchParams.get("page") || 1));
        const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 25)));
        const start = (page - 1) * limit;
        return NextResponse.json({ data: { items: filtered.slice(start, start + limit), page, limit, total: filtered.length } });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof WarehouseReceivingError
                ? error.statusCode
                : 500;
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load Warehouse Receiving." }, { status });
    }
}

export async function POST(request: Request) {
    try {
        const rawBody = await request.json().catch(() => null);
        const parsed = warehouseRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid Warehouse Receiving request.", details: parsed.error.flatten() }, { status: 400 });
        }
        const actor = await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.warehouseReceiving });
        const command = parsed.data;
        const order = await loadOrder(command.purchaseOrderId);
        if (workflowRevision(order) !== command.workflowRevision) {
            throw new WarehouseReceivingError("This purchase order changed. Reload it before continuing.", 409);
        }
        if (command.action === "start") {
            return NextResponse.json({ data: await startWarehouseReceiving(order, command, actor.userId) });
        }
        if (statusId(order) !== INVENTORY_STATUS.WAREHOUSE_RECEIVING) {
            throw new WarehouseReceivingError("The purchase order must be in Warehouse Receiving before saving or submitting a draft.", 409);
        }
        if (command.action === "save_draft") {
            return NextResponse.json({ data: await persistWarehouseDraft(order, command) });
        }
        return NextResponse.json({ data: await submitWarehouseReceiving(order, command, actor.userId) });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError
            ? error.status
            : error instanceof WarehouseReceivingError
                ? error.statusCode
                : 500;
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to process Warehouse Receiving." }, { status });
    }
}
