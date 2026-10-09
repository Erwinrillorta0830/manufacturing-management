const QUANTITY_SCALE = 1_000_000;

export interface QAOutputAllocation {
    acceptedQuantity: number;
    rejectedQuantity: number;
}

export function parseQAOutputQuantity(value: unknown): number | null {
    const text = String(value ?? "").trim();
    if (!/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(text)) return null;

    const quantity = Number(text);
    if (!Number.isFinite(quantity) || quantity < 0) return null;
    return Number(quantity.toFixed(6));
}

export function qaOutputAllocationMatchesLoggedTotal(
    allocation: QAOutputAllocation,
    loggedGoodQuantity: unknown,
    loggedRejectedQuantity: unknown
): boolean {
    const loggedGood = parseQAOutputQuantity(loggedGoodQuantity);
    const loggedRejected = parseQAOutputQuantity(loggedRejectedQuantity);
    if (loggedGood === null || loggedRejected === null) return false;

    const quantities = [
        allocation.acceptedQuantity,
        allocation.rejectedQuantity,
        loggedGood,
        loggedRejected
    ].map((quantity) => Math.round(quantity * QUANTITY_SCALE));

    if (!quantities.every(Number.isSafeInteger)) return false;
    return quantities[0] + quantities[1] === quantities[2] + quantities[3];
}
