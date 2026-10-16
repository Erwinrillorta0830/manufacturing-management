type YieldRow = Record<string, unknown>;

function numericValue(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function releasedYieldGoodQuantity(yieldRow: YieldRow): number {
    if (String(yieldRow.qa_status ?? "").trim().toUpperCase() !== "PASSED") return 0;
    return Math.max(0, numericValue(yieldRow.qa_accepted_quantity ?? yieldRow.yield_quantity));
}

export function yieldAuditRowsAfterRevocation<T extends YieldRow>(yieldRow: YieldRow, auditRows: readonly T[]): T[] {
    const revokedThroughId = numericValue(yieldRow.qa_revoked_through_audit_id);
    if (!Number.isSafeInteger(revokedThroughId) || revokedThroughId <= 0) return [...auditRows];
    return auditRows.filter((audit) => numericValue(audit.daily_qa_id ?? audit.id) > revokedThroughId);
}

export function qaRecordAfterRevocation(record: YieldRow, revokedAt: unknown): boolean {
    if (!revokedAt) return true;
    const inspectedAt = String(record.inspected_at ?? "").trim().replace("T", " ").slice(0, 19);
    const revocationTime = String(revokedAt).trim().replace("T", " ").slice(0, 19);
    return Boolean(inspectedAt && revocationTime && inspectedAt > revocationTime);
}

export function releasedYieldQuantityDelta(previousYield: YieldRow, nextYield: YieldRow): number {
    return releasedYieldGoodQuantity(nextYield) - releasedYieldGoodQuantity(previousYield);
}
