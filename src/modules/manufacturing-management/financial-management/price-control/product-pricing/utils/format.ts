import { formatPriceCurrency } from "../../shared/pricePrecision";

export function toNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export function formatPHP(amount: number | null): string {
    return formatPriceCurrency(amount, "—");
}

export function clampMoney(v: number | null): number | null {
    if (v === null) return null;
    const rounded = Math.round(v * 10000) / 10000;
    return rounded;
}

export function moneyValuesEqual(a: number | null, b: number | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return clampMoney(a) === clampMoney(b);
}
