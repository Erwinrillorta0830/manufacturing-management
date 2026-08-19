import { INVENTORY_STATUS, paymentStatusAllowsReceivingHandoff } from "../procurement/_domain";

export const FORCE_RECEIVED_REASON_MAX_LENGTH = 500;
export const FORCE_RECEIVED_ACTION = "ForceReceived";
export const FORCE_RECEIVED_STAGE = "System";
export const FORCE_RECEIVED_IDEMPOTENCY_KEY_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ForceReceivedError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

export interface ForceReceivedLineSnapshot {
    lineId: number;
    orderedQuantity: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    remainingQuantity: number;
    remainingAcceptedQuantity: number;
}

export interface ForceReceivedRevisionSnapshot {
    kind: typeof FORCE_RECEIVED_ACTION;
    idempotencyKey: string;
    lines: ForceReceivedLineSnapshot[];
}

export function isForceReceived(forceReceivedAt: unknown): boolean {
    if (forceReceivedAt == null) return false;
    if (typeof forceReceivedAt === "string") return forceReceivedAt.trim().length > 0;
    return true;
}

export function remainingReceivingQuantity(forceClosed: boolean, computed: number): number {
    if (forceClosed) return 0;
    return Number.isFinite(computed) && computed > 0 ? computed : 0;
}

export function forceReceivedById(value: unknown): number | null {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const nested = Number(record.user_id ?? record.id);
        return Number.isSafeInteger(nested) && nested > 0 ? nested : null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function canForceReceivePurchaseOrder(input: {
    inventoryStatus: unknown;
    isForceReceived: boolean;
    isReplacement: boolean;
}): boolean {
    return !input.isReplacement
        && !input.isForceReceived
        && Number(input.inventoryStatus) === INVENTORY_STATUS.PARTIALLY_RECEIVED;
}

export function normalizeForceReceivedReason(reason: unknown): string | null {
    if (typeof reason !== "string") return null;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > FORCE_RECEIVED_REASON_MAX_LENGTH) return null;
    return trimmed;
}

export function forceReceivedIntakeMessage(forceReceivedAt: unknown): string | null {
    return isForceReceived(forceReceivedAt)
        ? "This purchase order was force-received and cannot accept further QA intake."
        : null;
}

export function evaluateForceReceivedEligibility(input: {
    inventoryStatus: unknown;
    workflowRevision: unknown;
    expectedWorkflowRevision: unknown;
    forceReceivedAt: unknown;
    paymentStatus: unknown;
}): { ok: true } | { ok: false; status: number; message: string } {
    if (isForceReceived(input.forceReceivedAt)) {
        return { ok: false, status: 409, message: "This purchase order is already force-received." };
    }
    if (Number(input.inventoryStatus) !== INVENTORY_STATUS.PARTIALLY_RECEIVED) {
        return {
            ok: false,
            status: 409,
            message: "Force Received is only available for Partially Received purchase orders."
        };
    }
    if (Number(input.workflowRevision) !== Number(input.expectedWorkflowRevision)) {
        return {
            ok: false,
            status: 409,
            message: "Another receiving action changed this purchase order. Reload and try again."
        };
    }
    if (!paymentStatusAllowsReceivingHandoff(input.paymentStatus)) {
        return {
            ok: false,
            status: 409,
            message: "Payment status does not allow receiving handoff to Awaiting Payment."
        };
    }
    return { ok: true };
}

export function parseForceReceivedRevisionSnapshot(value: unknown): ForceReceivedRevisionSnapshot | null {
    const raw = typeof value === "string"
        ? (() => {
            try { return JSON.parse(value) as unknown; } catch { return null; }
        })()
        : value;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    if (record.kind !== FORCE_RECEIVED_ACTION || typeof record.idempotencyKey !== "string") return null;
    if (!Array.isArray(record.lines)) return null;
    const lines: ForceReceivedLineSnapshot[] = [];
    for (const row of record.lines) {
        if (!row || typeof row !== "object") return null;
        const line = row as Record<string, unknown>;
        const lineId = Number(line.lineId);
        const orderedQuantity = Number(line.orderedQuantity);
        const receivedQuantity = Number(line.receivedQuantity);
        const acceptedQuantity = Number(line.acceptedQuantity);
        const remainingQuantity = Number(line.remainingQuantity);
        const remainingAcceptedQuantity = Number(line.remainingAcceptedQuantity);
        if (!Number.isSafeInteger(lineId) || lineId <= 0) return null;
        if (![orderedQuantity, receivedQuantity, acceptedQuantity, remainingQuantity, remainingAcceptedQuantity]
            .every(quantity => Number.isFinite(quantity) && quantity >= 0)) return null;
        lines.push({
            lineId,
            orderedQuantity,
            receivedQuantity,
            acceptedQuantity,
            remainingQuantity,
            remainingAcceptedQuantity
        });
    }
    return { kind: FORCE_RECEIVED_ACTION, idempotencyKey: record.idempotencyKey, lines };
}
