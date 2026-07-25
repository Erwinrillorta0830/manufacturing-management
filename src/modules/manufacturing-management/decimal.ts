export type DecimalInput = string | number | bigint | DecimalValue;

export const CURRENCY_DECIMAL_TOTAL_DIGITS = 65;
export const CURRENCY_DECIMAL_SCALE = 2;
export const UNIT_PRICE_DECIMAL_SCALE = 4;
export const EXCHANGE_RATE_DECIMAL_SCALE = 6;

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;

function powerOfTen(power: number): bigint {
    if (power < 0 || !Number.isInteger(power)) throw new Error("Decimal scale must be a non-negative integer.");
    return 10n ** BigInt(power);
}

function expandScientific(value: string): { coefficient: bigint; scale: number } {
    const match = DECIMAL_PATTERN.exec(value.trim());
    if (!match) throw new Error(`Invalid decimal value: ${value}`);

    const sign = match[1] === "-" ? -1n : 1n;
    const integer = match[2];
    const fraction = match[3] || "";
    const exponent = Number(match[4] || 0);
    const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, "");
    const scale = fraction.length - exponent;

    if (scale >= 0) {
        return { coefficient: sign * BigInt(digits || "0"), scale };
    }
    return { coefficient: sign * BigInt(`${digits}${"0".repeat(-scale)}`), scale: 0 };
}

function normalizeParts(coefficient: bigint, scale: number) {
    if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
    while (scale > 0 && coefficient % 10n === 0n) {
        coefficient /= 10n;
        scale -= 1;
    }
    return { coefficient, scale };
}

export class DecimalValue {
    readonly coefficient: bigint;
    readonly scale: number;

    constructor(coefficient: bigint, scale: number) {
        const normalized = normalizeParts(coefficient, scale);
        this.coefficient = normalized.coefficient;
        this.scale = normalized.scale;
    }

    static from(value: DecimalInput): DecimalValue {
        if (value instanceof DecimalValue) return value;
        if (typeof value === "bigint") return new DecimalValue(value, 0);
        const text = typeof value === "number" ? String(value) : value;
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new Error("Decimal value must be finite.");
        }
        const parsed = expandScientific(String(text));
        return new DecimalValue(parsed.coefficient, parsed.scale);
    }

    add(other: DecimalInput): DecimalValue {
        const right = DecimalValue.from(other);
        const scale = Math.max(this.scale, right.scale);
        const leftCoefficient = this.coefficient * powerOfTen(scale - this.scale);
        const rightCoefficient = right.coefficient * powerOfTen(scale - right.scale);
        return new DecimalValue(leftCoefficient + rightCoefficient, scale);
    }

    subtract(other: DecimalInput): DecimalValue {
        return this.add(DecimalValue.from(other).negate());
    }

    multiply(other: DecimalInput): DecimalValue {
        const right = DecimalValue.from(other);
        return new DecimalValue(this.coefficient * right.coefficient, this.scale + right.scale);
    }

    divideRounded(other: DecimalInput, decimalPlaces: number): DecimalValue {
        const right = DecimalValue.from(other);
        if (right.coefficient === 0n) throw new Error("Cannot divide by zero.");
        if (decimalPlaces < 0 || !Number.isInteger(decimalPlaces)) throw new Error("Invalid decimal precision.");

        const negative = (this.coefficient < 0n) !== (right.coefficient < 0n);
        const numerator = (this.coefficient < 0n ? -this.coefficient : this.coefficient)
            * powerOfTen(decimalPlaces + right.scale);
        const denominator = (right.coefficient < 0n ? -right.coefficient : right.coefficient)
            * powerOfTen(this.scale);
        let quotient = numerator / denominator;
        const remainder = numerator % denominator;
        if (remainder * 2n >= denominator) quotient += 1n;
        return new DecimalValue(negative ? -quotient : quotient, decimalPlaces);
    }

    round(decimalPlaces: number): DecimalValue {
        if (decimalPlaces >= this.scale) {
            return new DecimalValue(this.coefficient * powerOfTen(decimalPlaces - this.scale), decimalPlaces);
        }
        const divisor = powerOfTen(this.scale - decimalPlaces);
        const negative = this.coefficient < 0n;
        const absolute = negative ? -this.coefficient : this.coefficient;
        let quotient = absolute / divisor;
        if ((absolute % divisor) * 2n >= divisor) quotient += 1n;
        return new DecimalValue(negative ? -quotient : quotient, decimalPlaces);
    }

    compare(other: DecimalInput): number {
        const right = DecimalValue.from(other);
        const scale = Math.max(this.scale, right.scale);
        const leftCoefficient = this.coefficient * powerOfTen(scale - this.scale);
        const rightCoefficient = right.coefficient * powerOfTen(scale - right.scale);
        return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
    }

    negate(): DecimalValue {
        return new DecimalValue(-this.coefficient, this.scale);
    }

    toFixed(decimalPlaces = 2): string {
        if (decimalPlaces < 0 || !Number.isInteger(decimalPlaces)) throw new Error("Invalid decimal precision.");
        const divisor = this.scale > decimalPlaces ? powerOfTen(this.scale - decimalPlaces) : 1n;
        const multiplier = this.scale < decimalPlaces ? powerOfTen(decimalPlaces - this.scale) : 1n;
        const absoluteCoefficient = this.coefficient < 0n ? -this.coefficient : this.coefficient;
        let roundedAbsolute = absoluteCoefficient;
        if (this.scale > decimalPlaces) {
            roundedAbsolute = absoluteCoefficient / divisor;
            if ((absoluteCoefficient % divisor) * 2n >= divisor) roundedAbsolute += 1n;
        } else {
            roundedAbsolute *= multiplier;
        }
        const negative = this.coefficient < 0n;
        const absolute = roundedAbsolute;
        const digits = absolute.toString().padStart(decimalPlaces + 1, "0");
        const splitAt = digits.length - decimalPlaces;
        const integerPart = digits.slice(0, splitAt);
        const fractionPart = decimalPlaces > 0 ? `.${digits.slice(splitAt)}` : "";
        return `${negative ? "-" : ""}${integerPart}${fractionPart}`;
    }
}

export function normalizeDecimal(value: DecimalInput, decimalPlaces = 2): string {
    return DecimalValue.from(value).toFixed(decimalPlaces);
}

export function isWithinDecimalCapacity(value: DecimalInput, decimalPlaces = CURRENCY_DECIMAL_SCALE): boolean {
    try {
        const normalized = DecimalValue.from(value).toFixed(decimalPlaces);
        const integerDigits = normalized.replace(/^-/, "").split(".")[0].replace(/^0+(?=\d)/, "").length;
        return integerDigits <= CURRENCY_DECIMAL_TOTAL_DIGITS - decimalPlaces;
    } catch {
        return false;
    }
}

export function formatDecimal(value: DecimalInput, decimalPlaces = CURRENCY_DECIMAL_SCALE): string {
    const fixed = DecimalValue.from(value).toFixed(decimalPlaces);
    const [integerPart, fractionPart] = fixed.split(".");
    const sign = integerPart.startsWith("-") ? "-" : "";
    const unsignedInteger = sign ? integerPart.slice(1) : integerPart;
    const groupedInteger = unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${sign}${groupedInteger}${fractionPart === undefined ? "" : `.${fractionPart}`}`;
}

export function compareDecimals(left: DecimalInput, right: DecimalInput): number {
    return DecimalValue.from(left).compare(right);
}

export function isNonNegativeDecimal(value: DecimalInput): boolean {
    try {
        return DecimalValue.from(value).compare(0) >= 0;
    } catch {
        return false;
    }
}

export function sumDecimals(values: readonly DecimalInput[], decimalPlaces = 2): string {
    return values.reduce<DecimalValue>((total, value) => total.add(value), DecimalValue.from(0)).toFixed(decimalPlaces);
}
