const PHT_TIME_ZONE = "Asia/Manila";

function phtParts(timestamp: number): Record<string, string> {
    return Object.fromEntries(new Intl.DateTimeFormat("en-PH", {
        timeZone: PHT_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
}

function parsePhtWallClock(value: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value.trim());
    if (!match) return null;

    const timestamp = Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]) - 8,
        Number(match[5]),
        Number(match[6] || 0),
        Number((match[7] || "").padEnd(3, "0") || 0)
    );
    if (Number.isNaN(timestamp)) return null;

    const parts = phtParts(timestamp);
    const expected = `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || "00"}`;
    const actual = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    return actual === expected ? timestamp : null;
}

/** Parse legacy offset timestamps and current PHT wall-clock timestamps. */
export function parseProductionTimestamp(value: string | null | undefined): number | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
        const timestamp = Date.parse(raw);
        return Number.isNaN(timestamp) ? null : timestamp;
    }
    return parsePhtWallClock(raw);
}

export function hasCompletedTimer(
    startedAt: string | null | undefined,
    stoppedAt: string | null | undefined
): boolean {
    const startedTimestamp = parseProductionTimestamp(startedAt);
    const stoppedTimestamp = parseProductionTimestamp(stoppedAt);
    return startedTimestamp !== null
        && stoppedTimestamp !== null
        && stoppedTimestamp >= startedTimestamp;
}

export function formatPhtDateTime(value: string | null | undefined): string {
    const timestamp = parseProductionTimestamp(value);
    if (timestamp === null) return "—";
    return new Intl.DateTimeFormat("en-PH", {
        timeZone: PHT_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    }).format(new Date(timestamp));
}

export function toPhtDateTimeLocal(value: string | null | undefined): string {
    const timestamp = parseProductionTimestamp(value);
    if (timestamp === null) return "";
    const parts = phtParts(timestamp);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function elapsedHours(startedAt: string | null | undefined, stoppedAt: string | null | undefined): number | null {
    const startedTimestamp = parseProductionTimestamp(startedAt);
    const stoppedTimestamp = parseProductionTimestamp(stoppedAt);
    if (startedTimestamp === null || stoppedTimestamp === null || stoppedTimestamp <= startedTimestamp) return null;
    return Math.max(0.01, Math.round(((stoppedTimestamp - startedTimestamp) / (1000 * 60 * 60)) * 100) / 100);
}

export function elapsedSecondsSince(value: string): number {
    const timestamp = parseProductionTimestamp(value);
    return timestamp === null ? 0 : Math.max(0, (Date.now() - timestamp) / 1000);
}
