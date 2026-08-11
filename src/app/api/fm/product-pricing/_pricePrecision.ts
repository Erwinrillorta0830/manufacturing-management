export const PRICE_MAX_DECIMAL_PLACES = 4;

export class InvalidPriceValueError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidPriceValueError";
    }
}

export function isInvalidPriceValueError(error: unknown): error is InvalidPriceValueError {
    return error instanceof InvalidPriceValueError;
}

function hasAtMostDecimalPlaces(value: number, places: number): boolean {
    const factor = 10 ** places;
    const scaled = value * factor;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2;
    return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

export function assertValidPriceValue(value: unknown, fieldName = "price"): number {
    const price = Number(value);

    if (!Number.isFinite(price)) {
        throw new InvalidPriceValueError(`Invalid ${fieldName} value.`);
    }

    if (price < 0) {
        throw new InvalidPriceValueError(`${fieldName} cannot be negative.`);
    }

    if (!hasAtMostDecimalPlaces(price, PRICE_MAX_DECIMAL_PLACES)) {
        throw new InvalidPriceValueError(
            `${fieldName} cannot have more than ${PRICE_MAX_DECIMAL_PLACES} decimal places.`,
        );
    }

    return price;
}

export function isValidPriceValue(value: unknown): boolean {
    try {
        assertValidPriceValue(value);
        return true;
    } catch {
        return false;
    }
}
