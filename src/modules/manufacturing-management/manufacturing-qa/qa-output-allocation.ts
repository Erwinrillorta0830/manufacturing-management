const QUANTITY_SCALE = 1_000_000;

export interface QAOutputAllocation {
    acceptedQuantity: number;
    rejectedQuantity: number;
}

export interface QAOutputLedgerRow {
    ledger_id?: unknown;
    commit_status?: unknown;
    yield_quantity?: unknown;
    rejected_quantity?: unknown;
    scrap_quantity?: unknown;
    qa_accepted_quantity?: unknown;
    qa_rejected_quantity?: unknown;
}

export interface QAOutputAllocationCapacity {
    totalProducedQuantity: number;
    allocatedElsewhereQuantity: number;
    maxAuditQuantity: number;
    loggedOutputQuantity: number;
}

export interface QAOutputAllocationCapacityIndex {
    totalProducedQuantity: number;
    byLedgerId: Map<number, QAOutputAllocationCapacity>;
}

function quantityMicros(value: unknown, missingAsZero = false): number | null {
    if (missingAsZero && (value === null || value === undefined || String(value).trim() === "")) return 0;
    const quantity = parseQAOutputQuantity(value);
    if (quantity === null) return null;
    const scaled = Math.round(quantity * QUANTITY_SCALE);
    return Number.isSafeInteger(scaled) ? scaled : null;
}

function isCommitted(row: QAOutputLedgerRow): boolean {
    const status = String(row.commit_status ?? "").trim().toUpperCase();
    return !status || status === "COMMITTED";
}

function ledgerId(row: QAOutputLedgerRow): number {
    const id = Number(row.ledger_id);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function parseQAOutputQuantity(value: unknown): number | null {
    const text = String(value ?? "").trim();
    if (!/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(text)) return null;

    const quantity = Number(text);
    if (!Number.isFinite(quantity) || quantity < 0) return null;
    return Number(quantity.toFixed(6));
}

export function sumQAOutputQuantities(...values: unknown[]): number | null {
    let total = 0;
    for (const value of values) {
        const quantity = quantityMicros(value, true);
        if (quantity === null) return null;
        total += quantity;
        if (!Number.isSafeInteger(total)) return null;
    }
    return total / QUANTITY_SCALE;
}

export function calculateQAOutputAllocationCapacities(
    rows: QAOutputLedgerRow[]
): QAOutputAllocationCapacityIndex | null {
    let totalProducedMicros = 0;
    let totalAllocatedMicros = 0;
    const committedRows: Array<{
        id: number;
        loggedOutputMicros: number;
        savedAllocationMicros: number;
    }> = [];

    for (const row of rows) {
        if (!isCommitted(row)) continue;

        const goodMicros = quantityMicros(row.yield_quantity, true);
        const rejectedMicros = quantityMicros(row.rejected_quantity, true);
        const scrapMicros = quantityMicros(row.scrap_quantity, true);
        if (goodMicros === null || rejectedMicros === null || scrapMicros === null) return null;

        const rowTotalMicros = goodMicros + rejectedMicros + scrapMicros;
        if (!Number.isSafeInteger(rowTotalMicros)) return null;
        totalProducedMicros += rowTotalMicros;
        if (!Number.isSafeInteger(totalProducedMicros)) return null;

        const hasSavedAllocation = (row.qa_accepted_quantity !== null
            && row.qa_accepted_quantity !== undefined)
            || (row.qa_rejected_quantity !== null
                && row.qa_rejected_quantity !== undefined);
        let savedAllocationMicros = 0;
        if (hasSavedAllocation) {
            const acceptedMicros = quantityMicros(row.qa_accepted_quantity, true);
            const qaRejectedMicros = quantityMicros(row.qa_rejected_quantity, true);
            if (acceptedMicros === null || qaRejectedMicros === null) return null;
            savedAllocationMicros = acceptedMicros + qaRejectedMicros;
            totalAllocatedMicros += savedAllocationMicros;
            if (!Number.isSafeInteger(savedAllocationMicros) || !Number.isSafeInteger(totalAllocatedMicros)) return null;
        }
        committedRows.push({
            id: ledgerId(row),
            loggedOutputMicros: rowTotalMicros,
            savedAllocationMicros
        });
    }

    const byLedgerId = new Map<number, QAOutputAllocationCapacity>();
    for (const row of committedRows) {
        if (!row.id) continue;
        const allocatedElsewhereMicros = totalAllocatedMicros - row.savedAllocationMicros;
        const remainingMicros = Math.max(0, totalProducedMicros - allocatedElsewhereMicros);
        byLedgerId.set(row.id, {
            totalProducedQuantity: totalProducedMicros / QUANTITY_SCALE,
            allocatedElsewhereQuantity: allocatedElsewhereMicros / QUANTITY_SCALE,
            maxAuditQuantity: remainingMicros / QUANTITY_SCALE,
            loggedOutputQuantity: row.loggedOutputMicros / QUANTITY_SCALE
        });
    }

    return {
        totalProducedQuantity: totalProducedMicros / QUANTITY_SCALE,
        byLedgerId
    };
}

export function calculateQAOutputAllocationCapacity(
    rows: QAOutputLedgerRow[],
    currentLedgerId: number
): QAOutputAllocationCapacity | null {
    return calculateQAOutputAllocationCapacities(rows)?.byLedgerId.get(currentLedgerId) ?? null;
}

export function qaOutputAllocationWithinCapacity(
    allocation: QAOutputAllocation,
    maxAuditQuantity: unknown
): boolean {
    const acceptedMicros = quantityMicros(allocation.acceptedQuantity);
    const rejectedMicros = quantityMicros(allocation.rejectedQuantity);
    const maxMicros = quantityMicros(maxAuditQuantity);
    if (acceptedMicros === null || rejectedMicros === null || maxMicros === null) return false;
    const totalMicros = acceptedMicros + rejectedMicros;
    return Number.isSafeInteger(totalMicros) && totalMicros <= maxMicros;
}

export function qaOutputAllocationCapacityErrorMessage(
    maxAuditQuantity: unknown,
    totalProducedQuantity: unknown,
    unit: unknown
): string {
    const available = parseQAOutputQuantity(maxAuditQuantity);
    const total = parseQAOutputQuantity(totalProducedQuantity);
    const format = (quantity: number | null) => (quantity ?? 0).toLocaleString("en-US", {
        maximumFractionDigits: 6,
        useGrouping: false
    });
    const unitLabel = String(unit ?? "").trim() || "units";
    return `Total audited quantity (Good + Bad) cannot exceed the remaining Job Order production capacity (${format(available)} ${unitLabel}; ${format(total)} ${unitLabel} produced).`;
}

export function qaOutputAllocationMatchesLoggedTotal(
    allocation: QAOutputAllocation,
    loggedGoodQuantity: unknown,
    loggedRejectedQuantity: unknown
): boolean {
    const acceptedMicros = quantityMicros(allocation.acceptedQuantity);
    const rejectedMicros = quantityMicros(allocation.rejectedQuantity);
    const loggedGoodMicros = quantityMicros(loggedGoodQuantity, true);
    const loggedRejectedMicros = quantityMicros(loggedRejectedQuantity, true);
    if (
        acceptedMicros === null
        || rejectedMicros === null
        || loggedGoodMicros === null
        || loggedRejectedMicros === null
    ) return false;

    return acceptedMicros + rejectedMicros === loggedGoodMicros + loggedRejectedMicros;
}
