/**
 * Formats a numeric value with thousands commas and specified decimal precision.
 * e.g., 1254.5 -> "1,254.50"
 */
export function formatNumberWithCommas(
    value: number | string | null | undefined,
    decimals: number = 2
): string {
    if (value === undefined || value === null || value === "") return "0.00";
    const num = typeof value === "number" ? value : Number(value);
    if (isNaN(num)) return "0.00";
    
    return num.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Formats a currency value with ₱ symbol and thousands commas.
 */
export function formatCurrencyPHP(
    value: number | string | null | undefined,
    decimals: number = 2
): string {
    return `₱${formatNumberWithCommas(value, decimals)}`;
}
