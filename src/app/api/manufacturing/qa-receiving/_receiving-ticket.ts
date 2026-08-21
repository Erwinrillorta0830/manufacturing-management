import { procurementDirectusFetch } from "../procurement/_directus";

export type ReceivingTicketStatus = "Reserved" | "Posted" | "Failed";
const RECEIVING_TICKET_MAX_LENGTH = 32;

export class ReceivingTicketError extends Error {
    constructor(message: string, readonly statusCode: number = 503) {
        super(message);
    }
}

export interface ReceivingTicketRow {
    id: number;
    receiving_ticket_no: string | null;
    purchase_order_id: number;
    branch_id: number;
    receipt_mode: "full" | "partial" | string;
    workflow_revision: number;
    idempotency_key: string;
    posting_status: ReceivingTicketStatus | string;
}

function rows(body: unknown): Record<string, unknown>[] {
    return body && typeof body === "object" && "data" in body && Array.isArray(body.data)
        ? body.data as Record<string, unknown>[]
        : [];
}

function relationId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
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
        purchase_order_id: relationId(row.purchase_order_id, "purchase_order_id"),
        branch_id: relationId(row.branch_id, "id"),
        receipt_mode: String(row.receipt_mode || "full"),
        workflow_revision: Number(row.workflow_revision || 0),
        idempotency_key: String(row.idempotency_key || ""),
        posting_status: String(row.posting_status || "")
    };
}

function ticketFields() {
    return "id,receiving_ticket_no,purchase_order_id,branch_id,receipt_mode,workflow_revision,idempotency_key,posting_status";
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

export async function allocateReceivingTicket(input: {
    purchaseOrderId: number;
    branchId: number;
    receiptNumber: string;
    receiptMode: "full" | "partial";
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
                    throw new ReceivingTicketError("The previous receiving attempt failed. Generate a new preview before posting.", 409);
                }
                throw new ReceivingTicketError("A receiving commit with this idempotency key is already in progress.", 409);
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
                    receipt_mode: input.receiptMode,
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
            if (created.receiving_ticket_no !== receiptNumber) {
                await markReceivingTicketFailed(created.id).catch(() => false);
                throw new ReceivingTicketError("Unable to persist the submitted Receipt Number.");
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
