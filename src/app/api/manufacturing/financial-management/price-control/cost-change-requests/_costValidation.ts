export const MAX_LIST_COST = 99_999_999.9999;

export class InvalidProposedCostError extends Error {
    constructor(public readonly field = "proposed_cost") {
        super(`${field} must be between 0.00 and 99999999.9999 with at most 4 decimal places.`);
        this.name = "InvalidProposedCostError";
    }
}

export function isInvalidProposedCostError(error: unknown): error is InvalidProposedCostError {
    return error instanceof InvalidProposedCostError;
}

export function assertValidProposedCost(value: unknown, field = "proposed_cost"): number {
    if (
        value === null ||
        value === undefined ||
        typeof value === "boolean" ||
        (typeof value === "string" && value.trim() === "")
    ) {
        throw new InvalidProposedCostError(field);
    }

    const cost = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(cost) || cost < 0 || cost > MAX_LIST_COST) {
        throw new InvalidProposedCostError(field);
    }

    const scaled = cost * 10000;
    const nearestCent = Math.round(scaled);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8;
    if (Math.abs(scaled - nearestCent) > tolerance) {
        throw new InvalidProposedCostError(field);
    }

    return nearestCent / 10000;
}
