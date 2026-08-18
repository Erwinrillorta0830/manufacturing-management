import { procurementDirectusFetch } from "../procurement/_directus";

export type QuarantineDispositionType = "VENDOR_RETURN" | "REPLACEMENT";
export type QuarantineDispositionStatus =
    | "REQUESTED"
    | "PARTIALLY_PROCESSED"
    | "REPLACEMENT_PENDING"
    | "REPLACEMENT_RECEIVED"
    | "COMPLETED"
    | "CANCELLED";

export interface QuarantineDisposition {
    id: number;
    sourceReceivingId: number;
    purchaseOrderId: number;
    purchaseOrderLineId: number;
    productId: number;
    supplierId: number | null;
    branchId: number;
    lotId: number;
    batchNo: string;
    expiryDate: string | null;
    dispositionType: QuarantineDispositionType;
    requestedQuantity: number;
    processedQuantity: number;
    remainingQuantity: number;
    status: QuarantineDispositionStatus;
    reason: string;
    supplierReference: string | null;
    replacementReceivingId: number | null;
    returnMovementId: number | null;
    idempotencyKey: string;
    lastOperationKey: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface QuarantineStock {
    sourceReceivingId: number;
    purchaseOrderId: number;
    purchaseOrderLineId: number;
    purchaseOrderReference: string;
    productId: number;
    productName: string;
    productCode: string;
    supplierId: number | null;
    supplierName: string;
    branchId: number;
    branchName: string;
    branchCode: string;
    lotId: number;
    lotName: string;
    batchNo: string;
    expiryDate: string | null;
    rejectedQuantity: number;
    availableQuantity: number;
    rejectionReason: string;
    receiptNo: string;
    qaStatus: string;
}

export class QuarantineDispositionError extends Error {
    constructor(readonly statusCode: number, message: string) {
        super(message);
    }
}

interface SourceReceiving {
    sourceReceivingId: number;
    purchaseOrderId: number;
    purchaseOrderLineId: number;
    purchaseOrderReference: string;
    productId: number;
    productName: string;
    productCode: string;
    supplierId: number | null;
    supplierName: string;
    branchId: number;
    branchName: string;
    branchCode: string;
    branchIsBadStock: boolean;
    lotId: number;
    lotName: string;
    batchNo: string;
    expiryDate: string | null;
    rejectedQuantity: number;
    rejectionReason: string;
    receiptNo: string;
    qaStatus: string;
}

interface QuarantineRejectMovement {
    branchId: number;
    lotId: number;
    batchNo: string;
    expiryDate: string | null;
    quantity: number;
}

interface ReplacementLineInput {
    lineId: number;
    productId: number;
    receivedQuantity: number;
    acceptedQuantity: number;
}

const EPSILON = 1e-9;
const TERMINAL_STATUSES = new Set<QuarantineDispositionStatus>(["COMPLETED", "CANCELLED"]);
const activeLocks = new Map<string, Promise<unknown>>();
let quarantineRejectMovementTypeIdPromise: Promise<number> | null = null;

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function relationId(value: unknown, key: string): number {
    const raw = value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function asBoolean(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

function finiteQuantity(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isBadStockBranch(row: Record<string, unknown>): boolean {
    return asBoolean(row.isBadStock) || asBoolean(row.is_bad_stock);
}

function mapDisposition(row: Record<string, unknown>): QuarantineDisposition {
    const id = relationId(row.id, "id");
    if (!id) throw new QuarantineDispositionError(503, "A quarantine disposition has an invalid ID.");
    return {
        id,
        sourceReceivingId: relationId(row.source_receiving_id, "purchase_order_product_id"),
        purchaseOrderId: relationId(row.purchase_order_id, "purchase_order_id"),
        purchaseOrderLineId: relationId(row.purchase_order_line_id, "purchase_order_product_id"),
        productId: relationId(row.product_id, "product_id"),
        supplierId: relationId(row.supplier_id, "id") || null,
        branchId: relationId(row.branch_id, "id"),
        lotId: relationId(row.lot_id, "lot_id"),
        batchNo: String(row.batch_no || ""),
        expiryDate: row.expiry_date ? String(row.expiry_date) : null,
        dispositionType: String(row.disposition_type) as QuarantineDispositionType,
        requestedQuantity: finiteQuantity(row.requested_quantity),
        processedQuantity: finiteQuantity(row.processed_quantity),
        remainingQuantity: finiteQuantity(row.remaining_quantity),
        status: String(row.status) as QuarantineDispositionStatus,
        reason: String(row.reason || ""),
        supplierReference: row.supplier_reference ? String(row.supplier_reference) : null,
        replacementReceivingId: relationId(row.replacement_receiving_id, "purchase_order_product_id") || null,
        returnMovementId: relationId(row.return_movement_id, "movement_id") || null,
        idempotencyKey: String(row.idempotency_key || ""),
        lastOperationKey: row.last_operation_key ? String(row.last_operation_key) : null,
        createdAt: row.created_at ? String(row.created_at) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null
    };
}

async function readJson(response: Response): Promise<unknown> {
    return response.json().catch(() => ({}));
}

async function directusRows(path: string, errorMessage: string): Promise<Record<string, unknown>[]> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) {
        throw new QuarantineDispositionError(response.status === 404 ? 503 : 502, errorMessage);
    }
    return rows(await readJson(response));
}

async function directusItem(path: string, errorMessage: string): Promise<Record<string, unknown>> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) {
        throw new QuarantineDispositionError(response.status === 404 ? 404 : 502, errorMessage);
    }
    const body = await readJson(response);
    if (!body || typeof body !== "object" || !("data" in body) || !body.data || typeof body.data !== "object") {
        throw new QuarantineDispositionError(503, errorMessage);
    }
    return body.data as Record<string, unknown>;
}

async function quarantineRejectMovementTypeId(): Promise<number> {
    if (!quarantineRejectMovementTypeIdPromise) {
        quarantineRejectMovementTypeIdPromise = (async () => {
            const rowsFound = await directusRows(
                "/items/inventory_transaction_types?filter[type_name][_eq]=QA%20Reject%20%2F%20Bad%20Order%20Receipt&filter[direction][_eq]=IN&fields=transaction_type_id&limit=-1",
                "The QA rejection movement type is not configured."
            );
            const ids = rowsFound
                .map(row => relationId(row.transaction_type_id, "transaction_type_id"))
                .filter(id => id > 0);
            if (ids.length !== 1) throw new QuarantineDispositionError(503, "The QA rejection movement type is not configured uniquely.");
            return ids[0];
        })();
    }
    return quarantineRejectMovementTypeIdPromise;
}

async function fetchQuarantineRejectMovements(sourceReceivingId: number): Promise<QuarantineRejectMovement[]> {
    const transactionTypeId = await quarantineRejectMovementTypeId();
    const params = new URLSearchParams({
        "filter[source_document_id][_eq]": String(sourceReceivingId),
        "filter[transaction_type_id][_eq]": String(transactionTypeId),
        "filter[quantity][_gt]": "0",
        fields: "movement_id,branch_id,lot_id,batch_no,expiry_date,quantity",
        limit: "-1"
    });
    const movementRows = await directusRows(`/items/inventory_movements?${params.toString()}`, "Unable to load the QA rejection movement for this receiving record.");
    const grouped = new Map<string, QuarantineRejectMovement>();
    for (const row of movementRows) {
        const branchId = relationId(row.branch_id, "id");
        const lotId = relationId(row.lot_id, "lot_id");
        const quantity = finiteQuantity(row.quantity);
        if (!branchId || !lotId || quantity <= 0) continue;
        const batchNo = String(row.batch_no || "LOT-N/A");
        const key = `${branchId}:${lotId}:${batchNo}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.quantity += quantity;
        } else {
            grouped.set(key, {
                branchId,
                lotId,
                batchNo,
                expiryDate: row.expiry_date ? String(row.expiry_date) : null,
                quantity
            });
        }
    }
    return [...grouped.values()];
}

async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const response = await procurementDirectusFetch(path, {
        method,
        body: body ? JSON.stringify(body) : undefined
    });
    const payload = await readJson(response);
    if (!response.ok) {
        const detail = payload && typeof payload === "object" && "errors" in payload ? JSON.stringify(payload.errors).slice(0, 400) : "";
        throw new QuarantineDispositionError(response.status === 409 ? 409 : 502, `Directus quarantine operation failed${detail ? `: ${detail}` : "."}`);
    }
    if (!payload || typeof payload !== "object" || !("data" in payload) || !payload.data) return null;
    return (Array.isArray(payload.data) ? payload.data[0] : payload.data) as Record<string, unknown>;
}

function dispositionFields(): string {
    return [
        "id", "source_receiving_id", "purchase_order_id", "purchase_order_line_id", "product_id", "supplier_id",
        "branch_id", "lot_id", "batch_no", "expiry_date", "disposition_type", "requested_quantity", "processed_quantity",
        "remaining_quantity", "status", "reason", "supplier_reference", "replacement_receiving_id", "return_movement_id",
        "idempotency_key", "last_operation_key", "created_at", "updated_at"
    ].join(",");
}

export async function fetchQuarantineDisposition(id: number): Promise<QuarantineDisposition> {
    const row = await directusItem(
        `/items/purchase_order_quarantine_dispositions/${id}?fields=${dispositionFields()}`,
        "The quarantine disposition could not be found."
    );
    return mapDisposition(row);
}

async function fetchSourceReceivingVariants(id: number): Promise<SourceReceiving[]> {
    const receiving = await directusItem(
        `/items/purchase_order_receiving/${id}?fields=purchase_order_product_id,purchase_order_id,purchase_order_line_id,product_id,branch_id,lot_id,batch_no,expiry_date,received_quantity,quantity_rejected,rejection_reason,receipt_no,qa_status`,
        "The source QA receiving record could not be found."
    );
    const sourceReceivingId = relationId(receiving.purchase_order_product_id, "purchase_order_product_id") || id;
    const purchaseOrderId = relationId(receiving.purchase_order_id, "purchase_order_id");
    let purchaseOrderLineId = relationId(receiving.purchase_order_line_id, "purchase_order_product_id");
    const productId = relationId(receiving.product_id, "product_id");
    const rejectedQuantity = finiteQuantity(receiving.quantity_rejected);
    if (!purchaseOrderId || !productId || rejectedQuantity <= 0) {
        throw new QuarantineDispositionError(422, "The source receiving record does not contain a rejected quarantine quantity.");
    }

    if (!purchaseOrderLineId) {
        const lineRows = await directusRows(
            `/items/purchase_order_products?filter[purchase_order_id][_eq]=${purchaseOrderId}&filter[product_id][_eq]=${productId}&fields=purchase_order_product_id&limit=-1`,
            "Unable to identify the purchase-order line for this receiving record."
        );
        const matchingLineIds = lineRows
            .map(row => relationId(row.purchase_order_product_id, "purchase_order_product_id"))
            .filter(lineId => lineId > 0);
        if (matchingLineIds.length !== 1) {
            throw new QuarantineDispositionError(422, "The rejected receiving record does not map to one purchase-order line.");
        }
        purchaseOrderLineId = matchingLineIds[0];
    }

    const rejectionMovements = await fetchQuarantineRejectMovements(sourceReceivingId);
    if (rejectionMovements.length === 0) {
        throw new QuarantineDispositionError(422, "The source receiving record has no QA rejection movement in quarantine.");
    }

    const [purchaseOrder, product] = await Promise.all([
        directusItem(`/items/purchase_order/${purchaseOrderId}?fields=purchase_order_id,reference,purchase_order_no,supplier_name`, "The source purchase order could not be found."),
        directusItem(`/items/products/${productId}?fields=product_id,product_name,product_code`, "The source product could not be found.")
    ]);
    const supplierId = relationId(purchaseOrder.supplier_name, "id") || relationId(purchaseOrder.supplier_name, "supplier_id") || relationId(purchaseOrder.supplier_name, "supplier_name") || null;
    let supplierName = "Unknown supplier";
    if (supplierId) {
        const supplier = await directusItem(`/items/suppliers/${supplierId}?fields=id,supplier_name`, "The source supplier could not be found.");
        supplierName = String(supplier.supplier_name || `Supplier #${supplierId}`);
    } else if (typeof purchaseOrder.supplier_name === "string") {
        supplierName = purchaseOrder.supplier_name;
    }

    return Promise.all(rejectionMovements.map(async movement => {
        const [branch, lot] = await Promise.all([
            directusItem(`/items/branches/${movement.branchId}?fields=id,branch_name,branch_code,isBadStock`, "The source quarantine branch could not be found."),
            directusItem(`/items/lots/${movement.lotId}?fields=lot_id,lot_name`, "The source storage lot could not be found.")
        ]);
        return {
            sourceReceivingId,
            purchaseOrderId,
            purchaseOrderLineId,
            purchaseOrderReference: String(purchaseOrder.reference || purchaseOrder.purchase_order_no || `PO #${purchaseOrderId}`),
            productId,
            productName: String(product.product_name || `Product #${productId}`),
            productCode: String(product.product_code || "N/A"),
            supplierId,
            supplierName,
            branchId: movement.branchId,
            branchName: String(branch.branch_name || `Branch #${movement.branchId}`),
            branchCode: String(branch.branch_code || "N/A"),
            branchIsBadStock: isBadStockBranch(branch),
            lotId: movement.lotId,
            lotName: String(lot.lot_name || `Lot #${movement.lotId}`),
            batchNo: movement.batchNo || String(receiving.batch_no || "LOT-N/A"),
            expiryDate: movement.expiryDate || (receiving.expiry_date ? String(receiving.expiry_date) : null),
            rejectedQuantity: movement.quantity,
            rejectionReason: String(receiving.rejection_reason || ""),
            receiptNo: String(receiving.receipt_no || ""),
            qaStatus: String(receiving.qa_status || "Rejected")
        } satisfies SourceReceiving;
    }));
}

async function fetchSourceReceiving(id: number, selection?: { lotId?: number | null; batchNo?: string | null }): Promise<SourceReceiving> {
    const variants = await fetchSourceReceivingVariants(id);
    const selected = selection?.lotId || selection?.batchNo
        ? variants.find(source => (!selection.lotId || source.lotId === selection.lotId) && (!selection.batchNo || source.batchNo === selection.batchNo))
        : variants[0];
    if (!selected) throw new QuarantineDispositionError(409, "The selected lot and batch are not part of the source quarantine stock.");
    return selected;
}

async function fetchDispositions(): Promise<QuarantineDisposition[]> {
    const sourceRows = await directusRows(
        `/items/purchase_order_quarantine_dispositions?fields=${dispositionFields()}&limit=-1&sort=-created_at`,
        "The quarantine disposition collection is not configured."
    );
    return sourceRows.map(mapDisposition);
}

function sameQuarantineStock(source: SourceReceiving, item: QuarantineDisposition): boolean {
    return item.sourceReceivingId === source.sourceReceivingId
        && item.lotId === source.lotId
        && item.batchNo === source.batchNo;
}

function reservedByOtherQuarantineStockDispositions(all: QuarantineDisposition[], source: SourceReceiving, excludeId?: number): number {
    return all.reduce((total, item) => {
        if (item.id === excludeId || !sameQuarantineStock(source, item) || TERMINAL_STATUSES.has(item.status)) return total;
        return total + Math.max(0, item.remainingQuantity);
    }, 0);
}

function availableFromDispositionLedger(source: SourceReceiving, all: QuarantineDisposition[], excludeId?: number): number {
    return Math.max(0, source.rejectedQuantity
        - all.reduce((total, item) => {
            if (!sameQuarantineStock(source, item) || item.status === "CANCELLED") return total;
            return total + Math.max(0, item.processedQuantity);
        }, 0)
        - reservedByOtherQuarantineStockDispositions(all, source, excludeId));
}

async function currentStockOnHand(source: SourceReceiving): Promise<number> {
    const params = new URLSearchParams({
        "filter[product_id][_eq]": String(source.productId),
        "filter[branch_id][_eq]": String(source.branchId),
        "filter[lot_id][_eq]": String(source.lotId),
        "filter[batch_no][_eq]": source.batchNo,
        fields: "quantity",
        limit: "-1"
    });
    const movementRows = await directusRows(`/items/inventory_movements?${params.toString()}`, "Unable to verify current quarantine stock.");
    return Math.max(0, movementRows.reduce((total, row) => total + finiteQuantity(row.quantity), 0));
}

function mapStock(source: SourceReceiving, availableQuantity: number): QuarantineStock {
    return {
        sourceReceivingId: source.sourceReceivingId,
        purchaseOrderId: source.purchaseOrderId,
        purchaseOrderLineId: source.purchaseOrderLineId,
        purchaseOrderReference: source.purchaseOrderReference,
        productId: source.productId,
        productName: source.productName,
        productCode: source.productCode,
        supplierId: source.supplierId,
        supplierName: source.supplierName,
        branchId: source.branchId,
        branchName: source.branchName,
        branchCode: source.branchCode,
        lotId: source.lotId,
        lotName: source.lotName,
        batchNo: source.batchNo,
        expiryDate: source.expiryDate,
        rejectedQuantity: source.rejectedQuantity,
        availableQuantity,
        rejectionReason: source.rejectionReason,
        receiptNo: source.receiptNo,
        qaStatus: source.qaStatus
    };
}

export async function listQuarantineStock(): Promise<{ stock: QuarantineStock[]; dispositions: QuarantineDisposition[] }> {
    const [receivingRows, allDispositions] = await Promise.all([
        directusRows(
            "/items/purchase_order_receiving?filter[quantity_rejected][_gt]=0&filter[is_reverted][_eq]=0&fields=purchase_order_product_id&limit=-1",
            "Unable to load rejected QA receiving records."
        ),
        fetchDispositions()
    ]);
    const sourceVariants = await Promise.all(receivingRows.map(async row => {
        try {
            return await fetchSourceReceivingVariants(relationId(row.purchase_order_product_id, "purchase_order_product_id"));
        } catch (error) {
            if (error instanceof QuarantineDispositionError && error.statusCode === 422) return [];
            throw error;
        }
    }));
    const sources = sourceVariants.flat();
    const eligible = sources.filter(source => source.branchIsBadStock).map(source => mapStock(
        source,
        availableFromDispositionLedger(source, allDispositions)
    ));
    return { stock: eligible.filter(item => item.availableQuantity > EPSILON), dispositions: allDispositions };
}

export async function createQuarantineDisposition(input: {
    sourceReceivingId: number;
    lotId?: number | null;
    batchNo?: string | null;
    dispositionType: QuarantineDispositionType;
    requestedQuantity: number;
    reason: string;
    supplierReference?: string | null;
    idempotencyKey?: string | null;
    actorUserId: number;
}): Promise<QuarantineDisposition> {
    const source = await fetchSourceReceiving(input.sourceReceivingId, { lotId: input.lotId, batchNo: input.batchNo });
    if (!source.branchIsBadStock) throw new QuarantineDispositionError(422, "Only rejected stock in a configured Bad Order branch can be dispositioned.");
    if (!Number.isFinite(input.requestedQuantity) || input.requestedQuantity <= 0) throw new QuarantineDispositionError(422, "Disposition quantity must be greater than zero.");
    if (!input.reason.trim()) throw new QuarantineDispositionError(422, "A disposition reason is required.");
    const allDispositions = await fetchDispositions();
    const available = availableFromDispositionLedger(source, allDispositions);
    if (input.requestedQuantity > available + EPSILON) {
        throw new QuarantineDispositionError(409, `Only ${available} unit(s) remain available in quarantine for this lot.`);
    }
    const idempotencyKey = input.idempotencyKey?.trim() || crypto.randomUUID();
    const existing = allDispositions.find(item => item.idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const row = await mutate("/items/purchase_order_quarantine_dispositions", "POST", {
        source_receiving_id: source.sourceReceivingId,
        purchase_order_id: source.purchaseOrderId,
        purchase_order_line_id: source.purchaseOrderLineId,
        product_id: source.productId,
        supplier_id: source.supplierId,
        branch_id: source.branchId,
        lot_id: source.lotId,
        batch_no: source.batchNo,
        expiry_date: source.expiryDate,
        disposition_type: input.dispositionType,
        requested_quantity: input.requestedQuantity,
        processed_quantity: 0,
        remaining_quantity: input.requestedQuantity,
        status: input.dispositionType === "REPLACEMENT" ? "REPLACEMENT_PENDING" : "REQUESTED",
        reason: input.reason.trim(),
        supplier_reference: input.supplierReference?.trim() || null,
        idempotency_key: idempotencyKey,
        created_by: input.actorUserId,
        updated_by: input.actorUserId
    });
    if (!row) throw new QuarantineDispositionError(503, "Directus did not return the created quarantine disposition.");
    return mapDisposition(row);
}

async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = activeLocks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => current);
    activeLocks.set(key, tail);
    await previous;
    try {
        return await task();
    } finally {
        release();
        if (activeLocks.get(key) === tail) activeLocks.delete(key);
    }
}

async function movementAlreadyRecorded(reference: string): Promise<boolean> {
    const params = new URLSearchParams({
        "filter[source_document_no][_eq]": reference,
        fields: "movement_id",
        limit: "1"
    });
    const response = await procurementDirectusFetch(`/items/inventory_movements?${params.toString()}`);
    if (!response.ok) throw new QuarantineDispositionError(503, "Unable to verify whether the quarantine operation was already processed.");
    return rows(await readJson(response)).length > 0;
}

async function vendorReturnMovementTypeId(): Promise<number> {
    const rowsFound = await directusRows(
        "/items/inventory_transaction_types?filter[type_name][_eq]=QA%20Vendor%20Return&filter[direction][_eq]=OUT&filter[origin_table][_eq]=purchase_order_quarantine_dispositions&fields=transaction_type_id&limit=-1",
        "The QA Vendor Return movement type is not configured."
    );
    const id = rowsFound.length === 1 ? relationId(rowsFound[0].transaction_type_id, "transaction_type_id") : 0;
    if (!id) throw new QuarantineDispositionError(503, "The QA Vendor Return movement type is not configured uniquely.");
    return id;
}

export async function processQuarantineDisposition(input: {
    dispositionId: number;
    quantity: number;
    operationKey: string;
    actorUserId: number;
    replacementReceivingId?: number | null;
}): Promise<QuarantineDisposition> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new QuarantineDispositionError(422, "Processed quantity must be greater than zero.");
    const operationKey = input.operationKey.trim();
    if (!operationKey || operationKey.length > 100) throw new QuarantineDispositionError(400, "A unique operation key is required.");
    return withLock(`quarantine:${input.dispositionId}`, async () => {
        const disposition = await fetchQuarantineDisposition(input.dispositionId);
        const operationReference = `QD-${disposition.id}-${operationKey}`.slice(0, 150);
        if (await movementAlreadyRecorded(operationReference)) return fetchQuarantineDisposition(disposition.id);
        if (TERMINAL_STATUSES.has(disposition.status)) throw new QuarantineDispositionError(409, "This quarantine disposition is already closed.");
        if (input.quantity > disposition.remainingQuantity + EPSILON) throw new QuarantineDispositionError(409, "The processed quantity exceeds the disposition quantity remaining.");
        const source = await fetchSourceReceiving(disposition.sourceReceivingId, { lotId: disposition.lotId, batchNo: disposition.batchNo });
        if (!source.branchIsBadStock || source.branchId !== disposition.branchId || source.lotId !== disposition.lotId || source.productId !== disposition.productId || source.batchNo !== disposition.batchNo) {
            throw new QuarantineDispositionError(409, "The source quarantine stock no longer matches the disposition.");
        }
        const allDispositions = await fetchDispositions();
        const dispositionAvailable = availableFromDispositionLedger(source, allDispositions, disposition.id);
        const ledgerOnHand = await currentStockOnHand(source);
        if (input.quantity > Math.min(dispositionAvailable, ledgerOnHand) + EPSILON) {
            throw new QuarantineDispositionError(409, "The requested quantity is no longer available in quarantine stock.");
        }
        const transactionTypeId = await vendorReturnMovementTypeId();
        const movement = await mutate("/items/inventory_movements", "POST", {
            product_id: source.productId,
            lot_id: source.lotId,
            branch_id: source.branchId,
            transaction_type_id: transactionTypeId,
            source_document_id: disposition.id,
            source_document_no: operationReference,
            batch_no: source.batchNo,
            expiry_date: source.expiryDate,
            version_id: null,
            quantity: -input.quantity,
            created_by: input.actorUserId,
            remarks: `${disposition.dispositionType === "REPLACEMENT" ? "Replacement received" : "Vendor return"}: ${disposition.reason}`.slice(0, 255)
        });
        const movementId = relationId(movement?.movement_id, "movement_id") || relationId(movement?.id, "id");
        if (!movementId) throw new QuarantineDispositionError(503, "Directus did not return the quarantine return movement ID.");
        const processed = disposition.processedQuantity + input.quantity;
        const remaining = Math.max(0, disposition.requestedQuantity - processed);
        const status: QuarantineDispositionStatus = remaining <= EPSILON
            ? "COMPLETED"
            : disposition.dispositionType === "REPLACEMENT"
                ? "REPLACEMENT_RECEIVED"
                : "PARTIALLY_PROCESSED";
        try {
            await mutate(`/items/purchase_order_quarantine_dispositions/${disposition.id}`, "PATCH", {
                processed_quantity: processed,
                remaining_quantity: remaining,
                status,
                replacement_receiving_id: input.replacementReceivingId || disposition.replacementReceivingId || null,
                return_movement_id: movementId,
                last_operation_key: operationKey,
                updated_by: input.actorUserId,
                processed_at: new Date().toISOString()
            });
        } catch (error) {
            await mutate(`/items/inventory_movements/${movementId}`, "DELETE").catch(() => undefined);
            throw error;
        }
        return fetchQuarantineDisposition(disposition.id);
    });
}

export async function cancelQuarantineDisposition(id: number, actorUserId: number): Promise<QuarantineDisposition> {
    return withLock(`quarantine:${id}`, async () => {
        const disposition = await fetchQuarantineDisposition(id);
        if (disposition.processedQuantity > EPSILON || disposition.status === "COMPLETED") {
            throw new QuarantineDispositionError(409, "A processed quarantine disposition cannot be cancelled.");
        }
        if (disposition.status === "CANCELLED") return disposition;
        await mutate(`/items/purchase_order_quarantine_dispositions/${id}`, "PATCH", {
            status: "CANCELLED",
            remaining_quantity: 0,
            updated_by: actorUserId
        });
        return fetchQuarantineDisposition(id);
    });
}

export async function validateReplacementContext(input: {
    dispositionId: number;
    shipmentId: number;
    lines: readonly ReplacementLineInput[];
}): Promise<{ disposition: QuarantineDisposition; source: SourceReceiving; targetLineId: number }> {
    const disposition = await fetchQuarantineDisposition(input.dispositionId);
    if (disposition.dispositionType !== "REPLACEMENT") throw new QuarantineDispositionError(422, "The selected disposition is not a replacement request.");
    if (TERMINAL_STATUSES.has(disposition.status)) throw new QuarantineDispositionError(409, "The replacement disposition is already closed.");
    const source = await fetchSourceReceiving(disposition.sourceReceivingId, { lotId: disposition.lotId, batchNo: disposition.batchNo });
    if (source.purchaseOrderId !== input.shipmentId || source.purchaseOrderLineId !== disposition.purchaseOrderLineId) {
        throw new QuarantineDispositionError(409, "The replacement must use the original purchase order and line.");
    }
    const target = input.lines.find(line => line.lineId === source.purchaseOrderLineId);
    if (!target || target.productId !== source.productId) {
        throw new QuarantineDispositionError(422, "The replacement receiving line must match the rejected product and purchase-order line.");
    }
    const otherReceived = input.lines.some(line => line.lineId !== target.lineId && line.receivedQuantity > EPSILON);
    if (otherReceived) throw new QuarantineDispositionError(422, "A replacement receipt may contain only the original rejected purchase-order line.");
    if (target.receivedQuantity > disposition.remainingQuantity + EPSILON) {
        throw new QuarantineDispositionError(409, "The replacement quantity exceeds the disposition quantity remaining.");
    }
    if (target.acceptedQuantity > disposition.remainingQuantity + EPSILON) {
        throw new QuarantineDispositionError(409, "The accepted replacement quantity exceeds the disposition quantity remaining.");
    }
    return { disposition, source, targetLineId: target.lineId };
}

export async function completeReplacementDisposition(input: {
    dispositionId: number;
    acceptedQuantity: number;
    replacementReceivingId: number;
    operationKey: string;
    actorUserId: number;
}): Promise<QuarantineDisposition> {
    const disposition = await fetchQuarantineDisposition(input.dispositionId);
    if (disposition.dispositionType !== "REPLACEMENT") throw new QuarantineDispositionError(422, "Only replacement dispositions can be completed from a replacement receipt.");
    if (disposition.status === "COMPLETED") return disposition;
    if (disposition.status === "CANCELLED") throw new QuarantineDispositionError(409, "This replacement disposition is cancelled.");
    if (input.acceptedQuantity <= EPSILON) return disposition;
    return processQuarantineDisposition({
        dispositionId: input.dispositionId,
        quantity: input.acceptedQuantity,
        replacementReceivingId: input.replacementReceivingId,
        operationKey: input.operationKey,
        actorUserId: input.actorUserId
    });
}
