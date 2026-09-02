import { formatPhtDateTime } from "./services/core-api.service";

export type ProductUpdateAuditFields = {
    updated_by: number | null;
    updated_at: string;
};

function normalizeUserId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function productCreationAuditFields(createdAt = formatPhtDateTime()) {
    return {
        created_at: createdAt,
        updated_by: null,
        updated_at: null
    } as const;
}

export function productUpdateAuditFields(userId?: unknown): ProductUpdateAuditFields {
    return {
        updated_by: normalizeUserId(userId),
        updated_at: formatPhtDateTime()
    };
}
