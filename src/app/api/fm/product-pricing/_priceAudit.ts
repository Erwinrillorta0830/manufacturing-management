import {
    directusHeaders,
    fetchDirectus,
    mustBase,
    readAuditUserId,
} from "./price-change-batches/_batch";

type DirectusList<T> = { data?: T[] };

type DirectusUserRow = {
    user_id?: number | string | null;
};

export type PriceAuditRecord = {
    id?: number | string | null;
    created_by?: unknown;
    updated_by?: unknown;
};

const auditUserIdCache = new Map<number, number>();

export async function resolveAuditUserId(value: unknown): Promise<number> {
    const candidate = readAuditUserId(value);
    if (!candidate) throw new Error("A valid audit user is required before applying a price change.");

    const cached = auditUserIdCache.get(candidate);
    if (cached) return cached;

    const params = new URLSearchParams({
        limit: "1",
        fields: "user_id",
        "filter[user_id][_eq]": String(candidate),
    });
    const response = await fetchDirectus<DirectusList<DirectusUserRow>>(
        `${mustBase()}/items/user?${params.toString()}`,
        { headers: directusHeaders() },
    );
    const resolved = readAuditUserId(response.data?.[0]?.user_id);
    if (resolved !== candidate) {
        throw new Error(`Audit user ${candidate} was not found in the user collection.`);
    }

    auditUserIdCache.set(candidate, resolved);
    return resolved;
}

export function assertPriceAuditRecord(
    row: PriceAuditRecord | null | undefined,
    expected: { createdBy?: number | null; updatedBy: number },
) {
    const actualUpdatedBy = readAuditUserId(row?.updated_by);
    if (actualUpdatedBy !== expected.updatedBy) {
        throw new Error("Directus did not persist product_per_price_type.updated_by.");
    }

    if (expected.createdBy !== undefined) {
        const actualCreatedBy = readAuditUserId(row?.created_by);
        if (actualCreatedBy !== expected.createdBy) {
            throw new Error("Directus did not persist product_per_price_type.created_by.");
        }
    }
}
