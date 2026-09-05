import { procurementDirectusFetch } from "../procurement/_directus";
import type { ReceivingQuantityStatus } from "./_receiving-status";
import {
    RECEIVING_ERROR_CODES,
    receivingErrorCodeForStatus,
    type ReceivingErrorCode
} from "./_receiving-errors";

export type ReceivingTicketStatus = "Reserved" | "Posted" | "Failed";
const RECEIVING_TICKET_MAX_LENGTH = 32;

export class ReceivingTicketError extends Error {
    readonly code: ReceivingErrorCode;

    constructor(message: string, readonly statusCode: number = 503, code?: ReceivingErrorCode) {
        super(message);
        this.code = code || receivingErrorCodeForStatus(statusCode);
    }
}

export interface ReceivingTicketRow {
    id: number;
    receiving_ticket_no: string | null;
    receipt_date: string | null;
    purchase_order_id: number;
    branch_id: number;
    quantity_status: ReceivingQuantityStatus | string;
    workflow_revision: number;
    idempotency_key: string;
    posting_status: ReceivingTicketStatus | string;
    receipt_type?: string | null;
}

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function relationId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
}

function dateOnly(value: unknown): string | null {
    if (value == null || value === "") return null;
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, 10) : null;
}

function mapTicket(row: Record<string, unknown> | undefined): ReceivingTicketRow | null {
    if (!row) return null;
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return {
        id,
        receiving_ticket_no: row.receiving_ticket_no == null || row.receiving_ticket_no === ""
            ? null
            : String(row.receiving_ticket_no),
        receipt_date: dateOnly(row.receipt_date),
        purchase_order_id: relationId(row.purchase_order_id, "purchase_order_id"),
        branch_id: relationId(row.branch_id, "id"),
        quantity_status: String(row.quantity_status || "PARTIAL"),
        workflow_revision: Number(row.workflow_revision || 0),
        idempotency_key: String(row.idempotency_key || ""),
        posting_status: String(row.posting_status || ""),
        receipt_type: row.receipt_type == null ? null : String(row.receipt_type)
    };
}

function ticketFields() {
    return "id,receiving_ticket_no,receipt_date,purchase_order_id,branch_id,quantity_status,workflow_revision,idempotency_key,posting_status,receipt_type";
}

async function directusJson(path: string, init?: RequestInit) {
    const response = await procurementDirectusFetch(path, init);
    const text = await response.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { ok: response.ok, status: response.status, body, text };
}

const receivingTicketAllocationTails = new Map<string, Promise<void>>();

async function withReceivingTicketAllocationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = receivingTicketAllocationTails.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => current);
    receivingTicketAllocationTails.set(key, tail);
    await previous;
    try {
        return await task();
    } finally {
        release();
        if (receivingTicketAllocationTails.get(key) === tail) receivingTicketAllocationTails.delete(key);
    }
}

export async function fetchReceivingTicketByIdempotencyKey(idempotencyKey: string): Promise<ReceivingTicketRow | null> {
    const params = new URLSearchParams({
        "filter[idempotency_key][_eq]": idempotencyKey,
        fields: ticketFields(),
        limit: "1"
    });
    const result = await directusJson(`/items/purchase_order_receiving_headers?${params.toString()}`);
    if (!result.ok) throw new ReceivingTicketError("Unable to look up the receiving ticket.");
    return mapTicket(rows(result.body)[0]);
}

async function fetchReceivingTicketByNumber(receiptNumber: string): Promise<ReceivingTicketRow | null> {
    const params = new URLSearchParams({
        "filter[receiving_ticket_no][_eq]": receiptNumber,
        fields: ticketFields(),
        limit: "1"
    });
    const result = await directusJson(`/items/purchase_order_receiving_headers?${params.toString()}`);
    if (!result.ok) throw new ReceivingTicketError("Unable to verify Receipt Number uniqueness.");
    return mapTicket(rows(result.body)[0]);
}

function normalizeReceiptNumber(receiptNumber: string): string {
    const normalized = receiptNumber.trim();
    if (!normalized) throw new ReceivingTicketError("Receipt Number is required.", 400);
    if (normalized.length > RECEIVING_TICKET_MAX_LENGTH) {
        throw new ReceivingTicketError(`Receipt Number cannot exceed ${RECEIVING_TICKET_MAX_LENGTH} characters.`, 400);
    }
    return normalized;
}

export async function fetchOpenReceivingTickets(purchaseOrderId: number, workflowRevision: number): Promise<ReceivingTicketRow[]> {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        "filter[workflow_revision][_eq]": String(workflowRevision),
        "filter[posting_status][_eq]": "Reserved",
        fields: ticketFields(),
        limit: "-1"
    });
    const result = await directusJson(`/items/purchase_order_receiving_headers?${params.toString()}`);
    if (!result.ok) throw new ReceivingTicketError("Unable to verify concurrent receiving submissions.");
    return rows(result.body).map(mapTicket).filter((row): row is ReceivingTicketRow => Boolean(row));
}

/**
 * Finds the unposted warehouse draft that QA must adopt. Warehouse drafts are
 * deliberately identified by both their header revision and detail method so
 * historical RFID and older receiving rows cannot be mistaken for the QA handoff.
 */
export async function fetchWarehouseReceivingTicket(
    purchaseOrderId: number,
    workflowRevision: number
): Promise<ReceivingTicketRow | null> {
    const params = new URLSearchParams({
        "filter[purchase_order_id][_eq]": String(purchaseOrderId),
        "filter[workflow_revision][_eq]": String(workflowRevision),
        "filter[posting_status][_in]": "Reserved,Failed",
        fields: ticketFields(),
        limit: "-1",
        sort: "-id"
    });
    const headerResult = await directusJson(`/items/purchase_order_receiving_headers?${params.toString()}`);
    if (!headerResult.ok) throw new ReceivingTicketError("Unable to load the warehouse receiving draft.");
    for (const candidate of rows(headerResult.body).map(mapTicket).filter((row): row is ReceivingTicketRow => Boolean(row))) {
        const detailParams = new URLSearchParams({
            "filter[receiving_header_id][_eq]": String(candidate.id),
            "filter[receiving_method][_eq]": "WAREHOUSE",
            "filter[isPosted][_eq]": "0",
            "filter[is_reverted][_eq]": "0",
            fields: "purchase_order_product_id",
            limit: "1"
        });
        const detailResult = await directusJson(`/items/purchase_order_receiving?${detailParams.toString()}`);
        if (!detailResult.ok) throw new ReceivingTicketError("Unable to verify the warehouse receiving draft.");
        if (rows(detailResult.body).length > 0) return candidate;
    }
    return null;
}

export async function allocateReceivingTicket(input: {
    purchaseOrderId: number;
    branchId: number;
    receiptNumber: string;
    receiptDate: string;
    quantityStatus: ReceivingQuantityStatus;
    workflowRevision: number;
    idempotencyKey: string;
    createdBy: number;
}): Promise<ReceivingTicketRow> {
    const receiptNumber = normalizeReceiptNumber(input.receiptNumber);
    return withReceivingTicketAllocationLock(
        `${input.purchaseOrderId}:${input.workflowRevision}`,
        async () => {
            const existing = await fetchReceivingTicketByIdempotencyKey(input.idempotencyKey);
            if (existing) {
                if (existing.posting_status === "Posted" && existing.receiving_ticket_no) return existing;
                if (existing.posting_status === "Failed") {
                    throw new ReceivingTicketError(
                        "The previous receiving attempt failed. Generate a new preview before posting.",
                        409,
                        RECEIVING_ERROR_CODES.RETRY_REQUIRED
                    );
                }
                throw new ReceivingTicketError(
                    "A receiving commit with this idempotency key is already in progress.",
                    409,
                    RECEIVING_ERROR_CODES.CONFLICT
                );
            }

            const existingNumber = await fetchReceivingTicketByNumber(receiptNumber);
            if (existingNumber) {
                throw new ReceivingTicketError("Receipt Number is already in use.", 409);
            }

            const openTickets = await fetchOpenReceivingTickets(input.purchaseOrderId, input.workflowRevision);
            if (openTickets.length > 0) {
                throw new ReceivingTicketError("Another receiving commit is already in progress for this purchase-order revision.", 409);
            }

            const create = await directusJson("/items/purchase_order_receiving_headers", {
                method: "POST",
                body: JSON.stringify({
                    purchase_order_id: input.purchaseOrderId,
                    branch_id: input.branchId,
                    receiving_ticket_no: receiptNumber,
                    receipt_date: input.receiptDate,
                    quantity_status: input.quantityStatus,
                    workflow_revision: input.workflowRevision,
                    idempotency_key: input.idempotencyKey,
                    created_by: input.createdBy
                })
            });
            if (!create.ok) {
                const raced = await fetchReceivingTicketByIdempotencyKey(input.idempotencyKey);
                if (raced?.posting_status === "Posted" && raced.receiving_ticket_no) return raced;
                if (raced) throw new ReceivingTicketError("A receiving commit with this idempotency key is already in progress.", 409);
                const racedNumber = await fetchReceivingTicketByNumber(receiptNumber);
                if (racedNumber) throw new ReceivingTicketError("Receipt Number is already in use.", 409);
                throw new ReceivingTicketError(`Unable to create the receiving ticket header${create.text ? `: ${create.text.slice(0, 300)}` : "."}`);
            }

            const created = mapTicket((create.body as { data?: Record<string, unknown> })?.data);
            if (!created) throw new ReceivingTicketError("Directus did not return the receiving ticket header ID.");
            if (created.receiving_ticket_no !== receiptNumber || created.receipt_date !== input.receiptDate) {
                await markReceivingTicketFailed(created.id).catch(() => false);
                throw new ReceivingTicketError("Unable to persist the submitted receipt metadata.");
            }
            return created;
        }
    );
}

export async function markReceivingTicketPosted(headerId: number): Promise<void> {
    const result = await directusJson(`/items/purchase_order_receiving_headers/${headerId}`, {
        method: "PATCH",
        body: JSON.stringify({ posting_status: "Posted" })
    });
    if (!result.ok) throw new ReceivingTicketError("Unable to mark the receiving ticket as posted.");
}

export async function markReceivingTicketFailed(headerId: number): Promise<boolean> {
    const result = await directusJson(`/items/purchase_order_receiving_headers/${headerId}`, {
        method: "PATCH",
        body: JSON.stringify({ posting_status: "Failed" })
    });
    return result.ok;
}
