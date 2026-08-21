import { PRICE_MAX_DECIMAL_PLACES, hasAtMostDecimalPlaces } from "../../shared/pricePrecision";

export const EMPTY_PRICE_ERROR = "Enter a proposed price";

export function validatePrice(v: number | null, raw?: unknown): string | null {
    if (v === null) return null; // allowed
    if (!Number.isFinite(v)) return "Invalid number";
    if (v < 0) return "Price cannot be negative";
    if (v > 99999999.99) return "Price too large";
    if (!hasAtMostDecimalPlaces(raw ?? v, PRICE_MAX_DECIMAL_PLACES)) {
        return `Use at most ${PRICE_MAX_DECIMAL_PLACES} decimal places`;
    }
    return null;
}
