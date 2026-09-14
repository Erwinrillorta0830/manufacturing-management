import { procurementDirectusFetch } from "../procurement/_directus";
import type { QaReceiptOption } from "@/modules/manufacturing-management/qa-receiving/types";

export interface QaReceiptSelection {
    key: string;
    receivingHeaderId: number | null;
    receiptNumber: string;
}

export class QaReceiptSelectionError extends Error {
    constructor(
        message: string,
        readonly statusCode: 409 | 503 = 409
    ) {
        super(message);
    }
}

interface ReceiptHeaderRow {
    id?: unknown;
    receiving_ticket_no?: unknown;
    receipt_date?: unknown;
    receipt_type?: unknown;
    workflow_revision?: unknown;
    posting_status?: unknown;
    created_at?: unknown;
}

interface ReceiptLineRow {
    purchase_order_product_id?: unknown;
    purchase_order_line_id?: unknown;
    receipt_no?: unknown;
    receipt_date?: unknown;
    received_date?: unknown;
    receiving_header_id?: unknown;
    receiving_method?: unknown;
    isPosted?: unknown;
    is_reverted?: unknown;
    is_replacement?: unknown;
}

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
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

function dateOnly(value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, 10) : null;
}

function timestamp(value: unknown): number {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function isReverted(row: ReceiptLineRow): boolean {
    return row.is_reverted === true || Number(row.is_reverted) === 1;
}

function isReplacement(row: ReceiptLineRow): boolean {
    return row.is_replacement === true || Number(row.is_replacement) === 1;
}

function isUnpostedWarehouseRow(row: ReceiptLineRow): boolean {
    return String(row.receiving_method || "").trim().toUpperCase() === "WAREHOUSE"
        && Number(row.isPosted) !== 1
        && !isReverted(row);
}

function lineId(row: ReceiptLineRow): number | null {
    return relationId(row.purchase_order_line_id, ["purchase_order_product_id", "id"]);
}

function legacyReceiptNumber(row: ReceiptLineRow): string {
    const receiptNumber = String(row.receipt_no || "").trim();
    const purchaseOrderLineId = lineId(row);
    if (!purchaseOrderLineId) return receiptNumber;
    const suffix = `-${purchaseOrderLineId}`;
    return receiptNumber.endsWith(suffix)
        ? receiptNumber.slice(0, -suffix.length)
        : receiptNumber;
}

function optionSortDate(option: QaReceiptOption): number {
    return timestamp(option.receiptDate);
}

async function directusRows(path: string, message: string): Promise<Record<string, unknown>[]> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) throw new QaReceiptSelectionError(message, 503);
    return rows(await response.json());
}

function mapHeaderOption(
    header: ReceiptHeaderRow,
    linkedRows: ReceiptLineRow[],
    currentWorkflowRevision: number
): QaReceiptOption | null {
    const id = relationId(header.id);
    if (!id) return null;
    const receiptNumber = String(
        header.receiving_ticket_no
        || linkedRows.map(legacyReceiptNumber).find(Boolean)
        || ""
    ).trim();
    if (!receiptNumber) return null;

    const receiptDate = dateOnly(header.receipt_date)
        || linkedRows
            .map(row => dateOnly(row.receipt_date) || dateOnly(row.received_date))
            .find((value): value is string => Boolean(value))
        || null;
    const postingStatus = String(header.posting_status || "Posted").trim() || "Posted";
    const workflowRevision = Number(header.workflow_revision || 0);
    const isCurrent = (postingStatus === "Reserved" || postingStatus === "Failed")
        && workflowRevision === currentWorkflowRevision
        && linkedRows.some(isUnpostedWarehouseRow);

    return {
        key: `header:${id}`,
        receiptNumber,
        receiptDate,
        receiptType: header.receipt_type == null ? null : String(header.receipt_type),
        postingStatus,
        workflowRevision: Number.isSafeInteger(workflowRevision) ? workflowRevision : 0,
        receivingHeaderId: id,
        isCurrent,
        readOnly: !isCurrent
    };
}

function mapLegacyOptions(rows: ReceiptLineRow[]): QaReceiptOption[] {
    const grouped = new Map<string, ReceiptLineRow[]>();
    for (const row of rows) {
        if (isReverted(row) || isReplacement(row)) continue;
        const receiptNumber = legacyReceiptNumber(row);
        if (!receiptNumber) continue;
        const existing = grouped.get(receiptNumber) || [];
        existing.push(row);
        grouped.set(receiptNumber, existing);
    }

    return [...grouped.entries()].flatMap(([receiptNumber, groupedRows]) => {
        const receiptDate = groupedRows
            .map(row => dateOnly(row.receipt_date) || dateOnly(row.received_date))
            .sort((left, right) => timestamp(right) - timestamp(left))[0] || null;
        return [{
            key: `legacy:${receiptNumber}`,
            receiptNumber,
            receiptDate,
            receiptType: null,
            postingStatus: "Legacy",
            workflowRevision: 0,
            receivingHeaderId: null,
            isCurrent: false,
            readOnly: true
        } satisfies QaReceiptOption];
    });
}

export async function fetchQaReceiptOptions(
    purchaseOrderId: number,
    currentWorkflowRevision: number,
    requestedKey?: string | null
): Promise<{
    receiptOptions: QaReceiptOption[];
    selectedReceipt: QaReceiptOption | null;
}> {
    const headerParams = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        fields: "id,receiving_ticket_no,receipt_date,receipt_type,workflow_revision,posting_status,created_at",
        limit: "-1"
    });
    const receivingParams = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        "filter[is_reverted][_eq]": "0",
        fields: "purchase_order_product_id,purchase_order_line_id,receipt_no,receipt_date,received_date,receiving_header_id,receiving_header_id.id,receiving_method,isPosted,is_reverted,is_replacement",
        limit: "-1"
    });

    const [headerRows, receivingRows] = await Promise.all([
        directusRows(`/items/purchase_order_receiving_headers?${headerParams.toString()}`, "Unable to load purchase-order receipt headers."),
        directusRows(`/items/purchase_order_receiving?${receivingParams.toString()}`, "Unable to load purchase-order receipt records.")
    ]);
    const headers = headerRows as ReceiptHeaderRow[];
    const rowsForPurchaseOrder = receivingRows as ReceiptLineRow[];

    const headerOptions = headers.flatMap(header => {
        const headerId = relationId(header.id);
        if (!headerId) return [];
        const linkedRows = rowsForPurchaseOrder.filter(row => relationId(row.receiving_header_id) === headerId);
        const option = mapHeaderOption(header, linkedRows, currentWorkflowRevision);
        return option ? [option] : [];
    });
    const legacyOptions = mapLegacyOptions(rowsForPurchaseOrder.filter(row => relationId(row.receiving_header_id) === null));
    const receiptOptions = [...headerOptions, ...legacyOptions].sort((left, right) =>
        optionSortDate(right) - optionSortDate(left)
        || right.workflowRevision - left.workflowRevision
        || right.key.localeCompare(left.key)
    );

    const normalizedRequestedKey = requestedKey?.trim() || "";
    const selectedReceipt = normalizedRequestedKey
        ? receiptOptions.find(option => option.key === normalizedRequestedKey) || null
        : receiptOptions.find(option => option.isCurrent) || receiptOptions[0] || null;
    if (normalizedRequestedKey && !selectedReceipt) {
        throw new QaReceiptSelectionError("The selected receipt does not belong to this purchase order.");
    }

    return { receiptOptions, selectedReceipt };
}

export async function assertEditableQaReceiptSelection(input: {
    purchaseOrderId: number;
    workflowRevision: number;
    receivingHeaderId: number;
    receiptNumber: string;
}): Promise<QaReceiptOption> {
    const { selectedReceipt } = await fetchQaReceiptOptions(
        input.purchaseOrderId,
        input.workflowRevision,
        `header:${input.receivingHeaderId}`
    );
    if (
        !selectedReceipt
        || !selectedReceipt.isCurrent
        || selectedReceipt.receiptNumber !== input.receiptNumber.trim()
    ) {
        throw new QaReceiptSelectionError("Only the active Warehouse Receiving receipt can be posted.");
    }
    return selectedReceipt;
}
