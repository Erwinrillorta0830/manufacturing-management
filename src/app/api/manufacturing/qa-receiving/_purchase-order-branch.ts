function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function relationId(value: unknown): number | null {
    const record = asRecord(value);
    const raw = record ? record.id ?? record.branch_id : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolvePurchaseOrderBranchId(purchaseOrder: unknown): number | null {
    const record = asRecord(purchaseOrder);
    if (!record) return relationId(purchaseOrder);

    return relationId(record.branch_id)
        ?? relationId(record.branch)
        ?? relationId(asRecord(record.po_data)?.branch)
        ?? relationId(asRecord(record.po_data)?.branch_id);
}
