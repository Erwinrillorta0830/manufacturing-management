import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

type WorkCenterPayload = Record<string, unknown>;

export class WorkCenterValidationError extends Error {
    constructor(
        public readonly field: string,
        message: string
    ) {
        super(`${field}: ${message}`);
        this.name = "WorkCenterValidationError";
    }
}

export class WorkCenterConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WorkCenterConflictError";
    }
}

export class WorkCenterDependencyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WorkCenterDependencyError";
    }
}

function hasOwn(payload: WorkCenterPayload, field: string): boolean {
    return Object.prototype.hasOwnProperty.call(payload, field);
}

function parseNumericField(
    payload: WorkCenterPayload,
    field: string,
    defaultValue: number,
    options: { integer?: boolean; maxDecimalPlaces?: number } = {}
): number {
    const rawValue = payload[field];
    if (rawValue === undefined || rawValue === "") return defaultValue;
    if (rawValue === null || typeof rawValue === "boolean" || (typeof rawValue !== "number" && typeof rawValue !== "string")) {
        throw new WorkCenterValidationError(field, "must be a number.");
    }

    const rawText = String(rawValue).trim();
    if (!rawText) return defaultValue;

    const value = Number(rawText);
    if (!Number.isFinite(value)) {
        throw new WorkCenterValidationError(field, "must be a finite number.");
    }
    if (value < 0) {
        throw new WorkCenterValidationError(field, "must be greater than or equal to zero.");
    }
    if (options.integer && !Number.isInteger(value)) {
        throw new WorkCenterValidationError(field, "must be a whole number greater than or equal to zero.");
    }

    if (options.maxDecimalPlaces !== undefined) {
        const decimalPart = rawText.split(".")[1];
        if (decimalPart && decimalPart.length > options.maxDecimalPlaces) {
            throw new WorkCenterValidationError(field, `cannot have more than ${options.maxDecimalPlaces} decimal places.`);
        }
    }

    return value;
}

function parseNullableId(payload: WorkCenterPayload, field: string, partial: boolean): number | null | undefined {
    if (partial && !hasOwn(payload, field)) return undefined;
    const rawValue = payload[field];
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;
    if (typeof rawValue === "boolean") {
        throw new WorkCenterValidationError(field, "must be a positive integer or null.");
    }

    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new WorkCenterValidationError(field, "must be a positive integer or null.");
    }
    return value;
}

export function validateWorkCenterPayload(input: unknown, options: { partial?: boolean } = {}): WorkCenterPayload {
    const partial = options.partial === true;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new WorkCenterValidationError("request", "must be a JSON object.");
    }

    const body = input as WorkCenterPayload;
    const payload: WorkCenterPayload = {};

    if (!partial || hasOwn(body, "work_center_name")) {
        if (typeof body.work_center_name !== "string" || !body.work_center_name.trim()) {
            throw new WorkCenterValidationError("work_center_name", "is required.");
        }
        payload.work_center_name = body.work_center_name.trim();
    }

    if (!partial || hasOwn(body, "overhead_cost_per_hour")) {
        payload.overhead_cost_per_hour = parseNumericField(body, "overhead_cost_per_hour", 0, { maxDecimalPlaces: 3 });
    }
    if (!partial || hasOwn(body, "capacity_per_hour")) {
        payload.capacity_per_hour = parseNumericField(body, "capacity_per_hour", 0, { integer: true });
    }

    const assetId = parseNullableId(body, "asset_id", partial);
    if (assetId !== undefined) payload.asset_id = assetId;

    const departmentId = parseNullableId(body, "department_id", partial);
    if (departmentId !== undefined) payload.department_id = departmentId;

    if (!partial || hasOwn(body, "is_active")) {
        if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
            throw new WorkCenterValidationError("is_active", "must be a boolean.");
        }
        payload.is_active = body.is_active === undefined ? true : body.is_active;
    }

    return payload;
}

export async function assertUniqueWorkCenterName(name: string, excludeId?: number): Promise<void> {
    const filter = encodeURIComponent(JSON.stringify({
        work_center_name: { _icontains: name }
    }));
    try {
        const response = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_work_centers?filter=${filter}&fields=work_center_id,work_center_name&limit=-1`,
            { headers, cache: "no-store" }
        );

        if (!response.ok) {
            throw new WorkCenterDependencyError("Unable to verify work station name uniqueness.");
        }

        const body = await response.json() as { data?: Array<{ work_center_id?: unknown; work_center_name?: unknown }> };
        const duplicate = (body.data || []).some((record) => {
            const recordId = Number(record.work_center_id);
            return record.work_center_name?.toString().trim().toLowerCase() === name.toLowerCase()
                && recordId !== excludeId;
        });

        if (duplicate) {
            throw new WorkCenterConflictError("Work station name already exists. Please choose a unique name.");
        }
    } catch (error) {
        if (error instanceof WorkCenterConflictError || error instanceof WorkCenterDependencyError) {
            throw error;
        }
        throw new WorkCenterDependencyError("Unable to verify work station name uniqueness.");
    }
}
