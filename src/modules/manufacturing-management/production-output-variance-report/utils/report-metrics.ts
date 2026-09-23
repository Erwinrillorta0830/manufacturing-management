export function roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function dateOnlyInManila(value: string | null | undefined): string | null {
    if (!value) return null;
    const input = String(value).trim();
    const dateMatch = input.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return null;

    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input);
    if (!hasTimezone || /^\d{4}-\d{2}-\d{2}$/.test(input)) return dateMatch[1];

    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(parsed);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export function completionVarianceDays(
    plannedCompletion: string | null | undefined,
    actualCompletion: string | null | undefined
): number | null {
    const planned = dateOnlyInManila(plannedCompletion);
    const actual = dateOnlyInManila(actualCompletion);
    if (!planned || !actual) return null;

    const plannedDate = new Date(`${planned}T00:00:00.000Z`);
    const actualDate = new Date(`${actual}T00:00:00.000Z`);
    return Math.round((actualDate.getTime() - plannedDate.getTime()) / 86_400_000);
}

export function displayDateInManila(value: string | null | undefined): string {
    const dateOnly = dateOnlyInManila(value);
    if (!dateOnly) return "—";
    const [year, month, day] = dateOnly.split("-");
    return `${month}/${day}/${year}`;
}

export function formatQuantity(value: number): string {
    return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 }).format(value);
}

export function formatCompletionVariance(value: number | null): string {
    if (value === null) return "Pending";
    if (value === 0) return "On time";
    return value > 0 ? `${value} day${value === 1 ? "" : "s"} late` : `${Math.abs(value)} day${value === -1 ? "" : "s"} early`;
}
