type QaStartParent = {
    qa_started_at?: unknown;
    qa_started_by?: unknown;
};

type QaInspection = {
    daily_qa_id?: unknown;
    inspected_at?: unknown;
    inspector_id?: unknown;
};

type QaStartPatch = {
    qa_started_at?: string;
    qa_started_by?: number;
};

function isMissing(value: unknown): boolean {
    return value === null || value === undefined || value === "";
}

function relationId(value: unknown): number {
    const candidate = value && typeof value === "object"
        ? (value as Record<string, unknown>).user_id ?? (value as Record<string, unknown>).id
        : value;
    const id = Number(candidate ?? 0);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function phtDateTime(value: unknown): string | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;

    const wallClock = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    if (wallClock && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
        return `${wallClock[1]} ${wallClock[2]}`;
    }

    const instant = new Date(raw);
    if (Number.isNaN(instant.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

export function buildQaStartPatch(parent: QaStartParent, inspections: QaInspection[]): QaStartPatch | null {
    const needsTimestamp = isMissing(parent.qa_started_at);
    const needsInspector = isMissing(parent.qa_started_by);
    if (!needsTimestamp && !needsInspector) return null;

    const firstInspection = inspections
        .map(inspection => ({
            id: relationId(inspection.daily_qa_id),
            inspectedAt: phtDateTime(inspection.inspected_at),
            inspectorId: relationId(inspection.inspector_id)
        }))
        .filter(inspection => inspection.inspectedAt)
        .sort((left, right) =>
            left.inspectedAt!.localeCompare(right.inspectedAt!) || left.id - right.id
        )[0];

    if (!firstInspection) return null;

    const patch: QaStartPatch = {};
    if (needsTimestamp && firstInspection.inspectedAt) {
        patch.qa_started_at = firstInspection.inspectedAt;
    }
    if (needsInspector && firstInspection.inspectorId) {
        patch.qa_started_by = firstInspection.inspectorId;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}
