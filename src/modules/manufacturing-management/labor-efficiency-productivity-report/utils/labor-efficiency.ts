import { parseProductionTimestamp } from "@/modules/manufacturing-management/production-workflow/operator-time";

const HOUR_MS = 60 * 60 * 1000;

export function roundHours(value: number): number {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export function earnedStandardLaborHours(
    positions: Array<{ hoursRequired: number | null; manpowerCount: number | null }>,
    goodOutputQuantity: number,
    baseQuantity: number
): number | null {
    if (!Number.isFinite(goodOutputQuantity) || goodOutputQuantity <= 0
        || !Number.isFinite(baseQuantity) || baseQuantity <= 0
        || positions.length === 0
        || positions.some((position) => position.hoursRequired === null || position.hoursRequired < 0
            || position.manpowerCount === null || position.manpowerCount <= 0)) {
        return null;
    }

    const standardPerBatch = positions.reduce(
        (total, position) => total + (position.hoursRequired || 0) * (position.manpowerCount || 0),
        0
    );
    return roundHours(standardPerBatch * goodOutputQuantity / baseQuantity);
}

export function runningTimerHours(startedAt: string | null | undefined, now = Date.now()): number | null {
    const started = parseProductionTimestamp(startedAt);
    if (started === null) return null;
    return roundHours(Math.max(0, now - started) / HOUR_MS);
}

export function laborVarianceHours(standardHours: number | null, actualHours: number): number | null {
    if (standardHours === null || !Number.isFinite(actualHours)) return null;
    return roundHours(actualHours - standardHours);
}

export function laborEfficiencyPercent(standardHours: number | null, actualHours: number): number | null {
    if (standardHours === null || !Number.isFinite(actualHours) || actualHours <= 0) return null;
    return roundHours(standardHours / actualHours * 100);
}

export function laborProductivity(goodOutputQuantity: number, actualHours: number): number | null {
    if (!Number.isFinite(goodOutputQuantity) || goodOutputQuantity <= 0
        || !Number.isFinite(actualHours) || actualHours <= 0) return null;
    return roundHours(goodOutputQuantity / actualHours);
}
