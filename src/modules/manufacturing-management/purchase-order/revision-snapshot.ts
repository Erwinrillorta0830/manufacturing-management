export const PURCHASE_ORDER_REVISION_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type RevisionSnapshotRecord = Record<string, unknown>;

export interface PurchaseOrderRevisionSnapshot {
    schemaVersion: typeof PURCHASE_ORDER_REVISION_SNAPSHOT_SCHEMA_VERSION;
    capturedAt: string;
    revisionBefore: number;
    header: RevisionSnapshotRecord;
    lines: RevisionSnapshotRecord[];
}

function assertNoUndefined(value: unknown, path: string): void {
    if (value === undefined) throw new Error(`Revision snapshot contains an undefined value at ${path}.`);
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`));
        return;
    }

    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        assertNoUndefined(child, `${path}.${key}`);
    });
}

function cloneJson<T>(value: T): T {
    assertNoUndefined(value, "snapshot");
    const serialized = JSON.stringify(value);
    if (!serialized) throw new Error("Revision snapshot could not be serialized.");
    return JSON.parse(serialized) as T;
}

export function buildPurchaseOrderRevisionSnapshot(
    purchaseOrderId: number,
    revisionBefore: number,
    header: RevisionSnapshotRecord,
    lines: RevisionSnapshotRecord[],
    capturedAt = new Date().toISOString()
): PurchaseOrderRevisionSnapshot {
    if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) {
        throw new Error("Revision snapshot requires a valid purchase-order ID.");
    }
    if (!Number.isSafeInteger(revisionBefore) || revisionBefore < 0) {
        throw new Error("Revision snapshot requires a valid prior revision.");
    }
    if (!header || typeof header !== "object" || Array.isArray(header)) {
        throw new Error("Revision snapshot requires a complete purchase-order header.");
    }
    if (Number((header as Record<string, unknown>).purchase_order_id) !== purchaseOrderId) {
        throw new Error("Revision snapshot header does not match the purchase order.");
    }
    if (!Array.isArray(lines)) throw new Error("Revision snapshot requires purchase-order lines.");
    if (lines.some(line => !line || typeof line !== "object" || Array.isArray(line))) {
        throw new Error("Revision snapshot contains an invalid purchase-order line.");
    }
    if (lines.some(line => Number((line as Record<string, unknown>).purchase_order_id) !== purchaseOrderId)) {
        throw new Error("Revision snapshot contains a line from another purchase order.");
    }
    if (lines.some(line => {
        const lineId = Number((line as Record<string, unknown>).purchase_order_product_id);
        return !Number.isSafeInteger(lineId) || lineId <= 0;
    })) {
        throw new Error("Revision snapshot contains a line without a persisted line ID.");
    }
    if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
        throw new Error("Revision snapshot requires a valid capture timestamp.");
    }

    const snapshot: PurchaseOrderRevisionSnapshot = {
        schemaVersion: PURCHASE_ORDER_REVISION_SNAPSHOT_SCHEMA_VERSION,
        capturedAt,
        revisionBefore,
        header: cloneJson(header),
        lines: cloneJson(lines)
    };

    if (snapshot.lines.length !== lines.length || Object.keys(snapshot.header).length !== Object.keys(header).length) {
        throw new Error("Revision snapshot completeness validation failed.");
    }
    return snapshot;
}

export function parsePurchaseOrderRevisionSnapshot(value: unknown): PurchaseOrderRevisionSnapshot | null {
    let candidate = value;
    if (typeof candidate === "string") {
        try {
            candidate = JSON.parse(candidate);
        } catch {
            return null;
        }
    }
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;

    const record = candidate as Record<string, unknown>;
    if (record.schemaVersion !== PURCHASE_ORDER_REVISION_SNAPSHOT_SCHEMA_VERSION) return null;
    if (typeof record.capturedAt !== "string" || Number.isNaN(Date.parse(record.capturedAt))) return null;
    const revisionBefore = Number(record.revisionBefore);
    if (!Number.isSafeInteger(revisionBefore) || revisionBefore < 0) return null;
    if (!record.header || typeof record.header !== "object" || Array.isArray(record.header)) return null;
    if (!Array.isArray(record.lines)) return null;
    const header = record.header as RevisionSnapshotRecord;
    const purchaseOrderId = Number(header.purchase_order_id);
    if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) return null;
    if (!record.lines.every(line => line && typeof line === "object" && !Array.isArray(line))) return null;
    const lines = record.lines as RevisionSnapshotRecord[];
    if (!lines.every(line => {
        const lineId = Number(line.purchase_order_product_id);
        const linePurchaseOrderId = Number(line.purchase_order_id);
        return Number.isSafeInteger(lineId) && lineId > 0
            && Number.isSafeInteger(linePurchaseOrderId) && linePurchaseOrderId === purchaseOrderId;
    })) return null;

    return {
        schemaVersion: PURCHASE_ORDER_REVISION_SNAPSHOT_SCHEMA_VERSION,
        capturedAt: record.capturedAt,
        revisionBefore,
        header,
        lines
    };
}
