import { procurementDirectusFetch } from "../_directus";
import { INVENTORY_STATUS } from "../_domain";

type DirectusRecord = Record<string, unknown>;

export interface WarehouseReceivingPrintableLine {
    lineNumber: number;
    itemCode: string;
    description: string;
    uom: string;
    orderedQuantity: number;
    previouslyReceivedQuantity: number;
    receivingQuantity: number;
    overageOrRemaining: string;
}

export interface WarehouseReceivingPrintableSnapshot {
    purchaseOrderId: number;
    purchaseOrderNumber: string;
    receiptNumber: string;
    receiptDate: string;
    receivingBranch: string;
    supplierVendor: string;
    poReferenceNumber: string;
    poTotalAmount: number;
    poTotalCurrency: string;
    lines: WarehouseReceivingPrintableLine[];
    receivedQuantity: number;
    totalUnitsEntered: number;
}

export class WarehouseReceivingPrintDataError extends Error {
    constructor(message: string, readonly status = 503) {
        super(message);
    }
}

function bodyData(body: unknown): DirectusRecord | null {
    if (!body || typeof body !== "object" || !("data" in body)) return null;
    const data = (body as { data?: unknown }).data;
    return data && typeof data === "object" && !Array.isArray(data) ? data as DirectusRecord : null;
}

function bodyRows(body: unknown): DirectusRecord[] {
    if (!body || typeof body !== "object" || !("data" in body)) return [];
    const data = (body as { data?: unknown }).data;
    return Array.isArray(data) ? data as DirectusRecord[] : [];
}

function positiveId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function relationId(value: unknown, keys = ["id"]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as DirectusRecord;
        for (const key of keys) {
            const nested = relationId(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    return positiveId(value);
}

function numberValue(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = "N/A"): string {
    const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    return text || fallback;
}

function isOne(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

function isWarehouse(row: DirectusRecord): boolean {
    return textValue(row.receiving_method, "").toUpperCase() === "WAREHOUSE";
}

function isActiveReceivingRow(row: DirectusRecord): boolean {
    return !isOne(row.is_reverted);
}

function lineId(row: DirectusRecord): number | null {
    return relationId(row.purchase_order_line_id ?? row.purchase_order_product_id, ["purchase_order_product_id", "id"]);
}

function productId(row: DirectusRecord): number | null {
    return relationId(row.product_id, ["product_id", "id"]);
}

function headerId(row: DirectusRecord): number | null {
    return relationId(row.receiving_header_id, ["id", "receiving_header_id"]);
}

function dateOnly(value: unknown): string {
    return textValue(value, "").slice(0, 10);
}

function quantity(value: number): string {
    return new Intl.NumberFormat("en-PH", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }).format(Number.isFinite(value) ? value : 0);
}

async function directusJson(path: string): Promise<{ response: Response; body: unknown }> {
    let response: Response;
    try {
        response = await procurementDirectusFetch(path);
    } catch {
        throw new WarehouseReceivingPrintDataError("The warehouse receiving data service is unavailable.", 503);
    }
    const text = await response.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { response, body };
}

async function directusRows(path: string, message: string): Promise<DirectusRecord[]> {
    const result = await directusJson(path);
    if (!result.response.ok) throw new WarehouseReceivingPrintDataError(message, result.response.status === 404 ? 404 : 503);
    return bodyRows(result.body);
}

async function loadPurchaseOrder(purchaseOrderId: number): Promise<DirectusRecord> {
    const result = await directusJson(`/items/purchase_order/${purchaseOrderId}?fields=purchase_order_id,purchase_order_no,reference,supplier_name,branch_id,inventory_status,currency_code,total_amount,total_foreign_currency`);
    if (result.response.status === 404) throw new WarehouseReceivingPrintDataError("Purchase order not found.", 404);
    if (!result.response.ok) throw new WarehouseReceivingPrintDataError("Unable to load the purchase order.");
    const order = bodyData(result.body);
    if (!order) throw new WarehouseReceivingPrintDataError("Purchase order data is unavailable.");
    return order;
}

async function loadLines(purchaseOrderId: number): Promise<DirectusRecord[]> {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        fields: "purchase_order_product_id,purchase_order_id,product_id,ordered_quantity",
        limit: "-1",
        sort: "purchase_order_product_id"
    });
    return directusRows(`/items/purchase_order_products?${params.toString()}`, "Unable to load purchase-order lines.");
}

async function loadProducts(productIds: number[]): Promise<DirectusRecord[]> {
    if (productIds.length === 0) return [];
    const params = new URLSearchParams({
        "filter[product_id][_in]": productIds.join(","),
        fields: "product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name",
        limit: "-1"
    });
    return directusRows(`/items/products?${params.toString()}`, "Unable to load product details for the printable.");
}

async function loadReceivingRows(purchaseOrderId: number): Promise<DirectusRecord[]> {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        "filter[is_reverted][_eq]": "0",
        fields: "purchase_order_product_id,purchase_order_line_id,purchase_order_id,receiving_header_id,product_id,received_quantity,isPosted,is_reverted,receiving_method",
        limit: "-1",
        sort: "purchase_order_product_id"
    });
    return directusRows(`/items/purchase_order_receiving?${params.toString()}`, "Unable to load receiving history for the printable.");
}

async function loadHeader(purchaseOrderId: number, receivingHeaderId: number): Promise<DirectusRecord> {
    const result = await directusJson(`/items/purchase_order_receiving_headers/${receivingHeaderId}?fields=id,receiving_ticket_no,purchase_order_id,branch_id,posting_status,receipt_date`);
    if (result.response.status === 404) throw new WarehouseReceivingPrintDataError("The warehouse receiving draft was not found.", 404);
    if (!result.response.ok) throw new WarehouseReceivingPrintDataError("Unable to load the warehouse receiving draft.");
    const header = bodyData(result.body);
    if (!header) throw new WarehouseReceivingPrintDataError("Warehouse receiving draft data is unavailable.");
    if (relationId(header.purchase_order_id, ["purchase_order_id", "id"]) !== purchaseOrderId) {
        throw new WarehouseReceivingPrintDataError("The receiving draft does not belong to this purchase order.", 409);
    }
    if (textValue(header.posting_status, "").toUpperCase() !== "RESERVED") {
        throw new WarehouseReceivingPrintDataError("Only an active warehouse receiving draft can be printed.", 409);
    }
    if (!textValue(header.receiving_ticket_no, "")) {
        throw new WarehouseReceivingPrintDataError("Save a Receipt Number before printing the receiving summary.", 400);
    }
    if (!dateOnly(header.receipt_date)) {
        throw new WarehouseReceivingPrintDataError("Save a Date of Receipt before printing the receiving summary.", 400);
    }
    return header;
}

async function relatedName(
    value: unknown,
    collection: "suppliers" | "branches",
    field: "supplier_name" | "branch_name",
    fallback: string
): Promise<string> {
    if (typeof value === "string" && value.trim()) return value.trim();
    const id = relationId(value, ["id", collection === "suppliers" ? "supplier_id" : "branch_id"]);
    if (!id) return fallback;
    const fields = collection === "branches" ? `id,${field},branch_code` : `id,${field}`;
    const result = await directusJson(`/items/${collection}/${id}?fields=${fields}`);
    if (!result.response.ok) return `${fallback} #${id}`;
    const record = bodyData(result.body);
    if (!record) return `${fallback} #${id}`;
    const name = textValue(record[field], `${fallback} #${id}`);
    if (collection === "branches" && textValue(record.branch_code, "")) return `${name} (${record.branch_code})`;
    return name;
}

function productUnit(product: DirectusRecord | undefined): string {
    const uom = product?.unit_of_measurement;
    if (uom && typeof uom === "object") {
        const record = uom as DirectusRecord;
        return textValue(record.unit_shortcut || record.unit_name, "PCS");
    }
    return "PCS";
}

export async function loadWarehouseReceivingPrintableData(input: {
    purchaseOrderId: number;
    receivingHeaderId: number;
}): Promise<WarehouseReceivingPrintableSnapshot> {
    const [order, header, lines, receivingRows] = await Promise.all([
        loadPurchaseOrder(input.purchaseOrderId),
        loadHeader(input.purchaseOrderId, input.receivingHeaderId),
        loadLines(input.purchaseOrderId),
        loadReceivingRows(input.purchaseOrderId)
    ]);
    const productIds = [...new Set(lines.map(productId).filter((id): id is number => id !== null))];
    const [products, supplierVendor, receivingBranch] = await Promise.all([
        loadProducts(productIds),
        relatedName(order.supplier_name, "suppliers", "supplier_name", "Supplier"),
        relatedName(header.branch_id ?? order.branch_id, "branches", "branch_name", "Branch")
    ]);
    if (Number(order.inventory_status) !== INVENTORY_STATUS.WAREHOUSE_RECEIVING) {
        throw new WarehouseReceivingPrintDataError("Only an active Warehouse Receiving order can be printed.", 409);
    }
    const productsById = new Map(products.map(product => [productId(product) || 0, product]));
    const previousByLine = new Map<number, number>();
    const currentByLine = new Map<number, number>();
    for (const row of receivingRows.filter(isActiveReceivingRow)) {
        const id = lineId(row);
        if (!id) continue;
        const receivedQuantity = Math.max(0, numberValue(row.received_quantity));
        if (isWarehouse(row) && !isOne(row.isPosted) && headerId(row) === input.receivingHeaderId) {
            currentByLine.set(id, (currentByLine.get(id) || 0) + receivedQuantity);
        } else if (!isWarehouse(row) || isOne(row.isPosted)) {
            previousByLine.set(id, (previousByLine.get(id) || 0) + receivedQuantity);
        }
    }
    const printableLines = lines.map((line, index) => {
        const id = lineId(line) || 0;
        const product = productsById.get(productId(line) || 0);
        const orderedQuantity = Math.max(0, numberValue(line.ordered_quantity));
        const previouslyReceivedQuantity = previousByLine.get(id) || 0;
        const receivingQuantity = currentByLine.get(id) || 0;
        const allowableQuantity = Math.max(0, orderedQuantity - previouslyReceivedQuantity);
        const overage = Math.max(0, receivingQuantity - allowableQuantity);
        const remaining = Math.max(0, allowableQuantity - receivingQuantity);
        return {
            lineNumber: index + 1,
            itemCode: textValue(product?.product_code, `LINE-${index + 1}`),
            description: textValue(product?.product_name, `Product #${productId(line) || ""}`),
            uom: productUnit(product),
            orderedQuantity,
            previouslyReceivedQuantity,
            receivingQuantity,
            overageOrRemaining: overage > 1e-9 ? `+${quantity(overage)}` : quantity(remaining)
        };
    });
    const totalEntered = printableLines.reduce((sum, line) => sum + line.receivingQuantity, 0);
    const currencyCode = textValue(order.currency_code, "PHP").toUpperCase();
    const foreignAmount = order.total_foreign_currency == null ? null : numberValue(order.total_foreign_currency);
    return {
        purchaseOrderId: input.purchaseOrderId,
        purchaseOrderNumber: textValue(order.purchase_order_no, `PO-${input.purchaseOrderId}`),
        receiptNumber: textValue(header.receiving_ticket_no),
        receiptDate: dateOnly(header.receipt_date),
        receivingBranch,
        supplierVendor,
        poReferenceNumber: textValue(order.reference, textValue(order.purchase_order_no, `PO-${input.purchaseOrderId}`)),
        poTotalAmount: currencyCode !== "PHP" && foreignAmount !== null ? foreignAmount : numberValue(order.total_amount),
        poTotalCurrency: currencyCode !== "PHP" && foreignAmount !== null ? currencyCode : "PHP",
        lines: printableLines,
        receivedQuantity: totalEntered,
        totalUnitsEntered: totalEntered
    };
}
