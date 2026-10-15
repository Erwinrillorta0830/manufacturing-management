export interface SavedDailyQAParameter {
    parameter_id: number;
    value: string;
    is_passed: boolean | null;
}

type QAParameterRecord = Record<string, unknown>;

export function dailyQAParameterAuditKey(ledgerId: number, routeId: number): string {
    return `${ledgerId}:${routeId}`;
}

export function dailyQAParameterValueKey(routeId: number, parameterId: number): string {
    return `${routeId}:${parameterId}`;
}

function relationId(value: unknown, keys: string[] = []): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of [...keys, "id"]) {
            const candidate = relationId(record[key], keys);
            if (candidate > 0) return candidate;
        }
        return 0;
    }
    const candidate = Number(value ?? 0);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

function ledgerIdFromRemarks(value: unknown): number {
    const match = String(value ?? "").match(/^Daily QA Audit \| Yield Log ID: (\d+) \|/);
    return relationId(match?.[1]);
}

function parameterValue(record: QAParameterRecord): string {
    if (record.value_text !== null && record.value_text !== undefined) {
        return String(record.value_text);
    }
    if (record.value_numeric !== null && record.value_numeric !== undefined) {
        return String(record.value_numeric);
    }
    if (record.value_boolean !== null && record.value_boolean !== undefined) {
        const value = record.value_boolean;
        return value === true || value === 1 || value === "1" || value === "true" ? "Pass" : "Fail";
    }
    return "";
}

function passedValue(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "yes", "passed", "pass"].includes(normalized)) return true;
        if (["false", "no", "failed", "fail"].includes(normalized)) return false;
    }
    return null;
}

export function indexSavedDailyQAParameters(records: QAParameterRecord[]): Map<string, SavedDailyQAParameter[]> {
    const parametersByAudit = new Map<string, SavedDailyQAParameter[]>();
    const seenParameters = new Set<string>();

    for (const record of records) {
        const ledgerId = ledgerIdFromRemarks(record.remarks);
        const routeId = relationId(record.jo_route_id, ["jo_route_id"]);
        const parameterId = relationId(record.parameter_id, ["parameter_id"]);
        if (!ledgerId || !routeId || !parameterId) continue;

        const auditKey = dailyQAParameterAuditKey(ledgerId, routeId);
        const uniqueKey = `${auditKey}:${parameterId}`;
        if (seenParameters.has(uniqueKey)) continue;
        seenParameters.add(uniqueKey);

        const parameters = parametersByAudit.get(auditKey) || [];
        parameters.push({
            parameter_id: parameterId,
            value: parameterValue(record),
            is_passed: passedValue(record.is_passed),
        });
        parametersByAudit.set(auditKey, parameters);
    }

    return parametersByAudit;
}
