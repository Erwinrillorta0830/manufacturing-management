import type { DestinationBatchResolutionAction } from "./_destination-batch";
import type { RecordValue } from "./_directus";

export function isRecord(value: unknown): value is RecordValue {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function numeric(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatProtectedAllocationQuantity(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function nullableNumeric(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function positiveCapacity(value: unknown): number | null {
    const parsed = nullableNumeric(value);
    return parsed !== null && parsed > 0 ? parsed : null;
}

export function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value).trim();
}

export function nullableString(value: unknown): string | null {
    const result = stringValue(value);
    return result || null;
}

export function relationId(value: unknown, preferredKeys: string[] = []): number {
    if (typeof value === "number" || typeof value === "string") return numeric(value);
    if (!isRecord(value)) return 0;
    for (const key of [...preferredKeys, "id"]) {
        const candidate = numeric(value[key]);
        if (candidate > 0) return candidate;
    }
    return 0;
}

export function relationName(value: unknown, keys: string[]): string | null {
    if (!isRecord(value)) return null;
    for (const key of keys) {
        const name = nullableString(value[key]);
        if (name) return name;
    }
    return null;
}

export function optionalRelationId(value: unknown, preferredKeys: string[] = []): number | null {
    const id = relationId(value, preferredKeys);
    return id > 0 ? id : null;
}

export function destinationBatchAction(value: unknown): DestinationBatchResolutionAction | null {
    const action = stringValue(value).toUpperCase();
    return action === "MERGE" || action === "CREATE" ? action : null;
}

export function firstValue(row: RecordValue, keys: string[]): unknown {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return undefined;
}

export function rowId(row: RecordValue, keys: string[]): number {
    return relationId(firstValue(row, keys), keys);
}

export function inventoryLotId(row: RecordValue): number {
    return rowId(row, ["inventory_lot_id", "id"]);
}

export function lotId(row: RecordValue): number {
    return relationId(row.lot_id, ["lot_id"]) || numeric(row.lot_id);
}

export function productId(row: RecordValue): number {
    return relationId(row.product_id, ["product_id"]) || numeric(row.product_id);
}

export function branchId(row: RecordValue): number {
    return relationId(row.branch_id, ["branch_id"]) || numeric(row.branch_id);
}

export function unitId(row: RecordValue): number | null {
    const resolved = relationId(firstValue(row, ["unit_id"]), ["unit_id", "id"]);
    return resolved > 0 ? resolved : null;
}

export function normalizeStatus(value: unknown): string {
    return stringValue(value).toUpperCase().replace(/[_-]+/g, " ");
}

export function dateValue(row: RecordValue, keys: string[]): string | null {
    return nullableString(firstValue(row, keys));
}

export function dateOnly(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function validDate(value: string | null): boolean {
    if (value === null) return true;
    const normalized = value.trim();
    if (!normalized) return true;
    const dateOnlyValue = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyValue) {
        const year = Number(dateOnlyValue[1]);
        const month = Number(dateOnlyValue[2]);
        const day = Number(dateOnlyValue[3]);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year
            && parsed.getUTCMonth() === month - 1
            && parsed.getUTCDate() === day;
    }
    return !Number.isNaN(new Date(normalized).getTime());
}

export function earliestDate(...values: Array<string | null>): string | null {
    const dates = values.map(dateOnly).filter((value): value is string => Boolean(value));
    if (dates.length === 0) return null;
    return dates.sort()[0];
}

export function extractAllergenToken(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(extractAllergenToken);
    if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim().toLowerCase();
        if (!text) return [];
        if (text.startsWith("[") || text.startsWith("{")) {
            try {
                return extractAllergenToken(JSON.parse(text));
            } catch {
                return [text];
            }
        }
        return text.split(",").map((part) => part.trim()).filter(Boolean);
    }
    if (!isRecord(value)) return [];
    for (const key of ["allergen_id", "allergenId", "allergen_name", "allergenName", "allergen_code", "allergenCode", "id", "name"]) {
        if (value[key] !== undefined && value[key] !== null) {
            const tokens = extractAllergenToken(value[key]);
            if (tokens.length > 0) return tokens;
        }
    }
    return [];
}

export function allergenProfile(row: RecordValue): { available: boolean; values: string[] } {
    for (const key of ["allergen_profile", "allergen_ids", "allergens", "product_allergens", "allergen"]) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
            const rawValue = row[key];
            if (rawValue === null || rawValue === undefined || (typeof rawValue === "string" && !rawValue.trim())) {
                return { available: false, values: [] };
            }
            return { available: true, values: [...new Set(extractAllergenToken(rawValue))].sort() };
        }
    }
    return { available: false, values: [] };
}

export function profilesEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function movementQuantity(row: RecordValue): number {
    const value = Number(row.quantity);
    return Number.isFinite(value) ? value : 0;
}

export function sumMovementQuantities(rows: RecordValue[]): number {
    return rows.reduce((sum, row) => sum + movementQuantity(row), 0);
}

export function normalizedBatch(value: unknown): string {
    return stringValue(value).toLowerCase();
}

export function activeStatus(value: unknown, statuses: Set<string>): boolean {
    return statuses.has(normalizeStatus(value));
}

export function transferId(row: RecordValue): number {
    return rowId(row, ["lot_transfer_id", "id"]);
}

export function movementId(row: RecordValue): number {
    return relationId(row.movement_id, ["movement_id"]) || relationId(row.id, ["id"]);
}

export function movementTransactionTypeId(row: RecordValue): number {
    return relationId(row.transaction_type_id, ["transaction_type_id"]) || numeric(row.transaction_type_id);
}

export function manilaCalendarDate(value = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        calendar: "gregory",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(value);
    const values = new Map(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
