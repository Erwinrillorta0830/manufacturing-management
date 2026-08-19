export const PRICE_MAX_DECIMAL_PLACES = 4;
export const COST_MAX_DECIMAL_PLACES = 4;

function numericValue(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function hasAtMostDecimalPlaces(value: unknown, places: number): boolean {
    const n = numericValue(value);
    if (n === null) return false;
    const factor = 10 ** places;
    const scaled = n * factor;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2;
    return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

export function formatPriceNumber(value: number | null | undefined, fallback = "-") {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return fallback;
    return Number(value).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: PRICE_MAX_DECIMAL_PLACES,
    });
}

export function formatPriceCurrency(value: number | null | undefined, fallback = "-") {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return fallback;
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: PRICE_MAX_DECIMAL_PLACES,
    }).format(Number(value));
}

export function formatCostNumber(value: number | null | undefined, fallback = "-") {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return fallback;
    return Number(value).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: COST_MAX_DECIMAL_PLACES,
    });
}

export function formatCostCurrency(value: number | null | undefined, fallback = "-") {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return fallback;
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: COST_MAX_DECIMAL_PLACES,
    }).format(Number(value));
}

export function parseDecimalInput(value: string, maxDecimalPlaces: number) {
    const trimmed = value.trim();
    if (!trimmed) return { value: null as number | null, error: null as string | null };

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return { value: null, error: "Invalid price" };
    if (parsed < 0) return { value: null, error: "Must be 0 or higher" };
    if (!hasAtMostDecimalPlaces(trimmed, maxDecimalPlaces)) {
        return { value: null, error: `Use at most ${maxDecimalPlaces} decimal places` };
    }

    return { value: parsed, error: null };
}
