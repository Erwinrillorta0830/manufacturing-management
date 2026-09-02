import { resolveLegacyProductsPatch } from "../_legacyProductPriceSync";
import { invalidateGroupIndexCacheOnCatalogChange } from "../_productGroupIndexCache";
import { executeClaimedApplication, stageStandaloneApproval } from "../_applicationEngine";
import { assertPriceAuditRecord, resolveAuditUserId } from "../_priceAudit";
import { resolveHeaderMeta } from "../_pcrHeaderMeta";
import { assertValidPriceValue, isValidPriceValue } from "../_pricePrecision";
import {
    DETAILS,
    PRODUCTS,
    PRICES,
    PRICE_TYPES,
    assertPriceSnapshotCurrent,
    directusHeaders,
    fetchDirectus,
    isRecord,
    mustBase,
    nowManila,
    pickId,
    readAuditUserId,
} from "../price-change-batches/_batch";

export const PCR = DETAILS;

const PCR_FIELDS = [
    "request_id",
    "product_id",
    "version_id",
    "price_type_id",
    "current_price",
    "proposed_price",
    "status",
    "effective_at",
    "application_status",
    "applied_at",
    "applied_by",
    "application_lock_id",
    "application_started_at",
    "application_attempts",
    "application_error",
    "requested_by",
    "header_id",
].join(",");

type PriceTypeRow = {
    price_type_id?: number | string | null;
    price_type_name?: string | null;
    sort?: number | string | null;
};

type ExistingPriceRow = {
    id?: number | string | null;
    product_id?: number | string | null;
    price_type_id?: number | string | null;
    created_by?: unknown;
};

type DirectusSingleResponse<T> = { data: T };
type DirectusList<T> = { data?: T[] };

export type PcrRow = {
    request_id?: number | string | null;
    product_id?: number | string | { product_id?: number | string | null } | null;
    version_id?: number | string | { version_id?: number | string | null; version_name?: string | null } | null;
    price_type_id?: number | string | { price_type_id?: number | string | null } | null;
    current_price?: number | string | null;
    proposed_price?: number | string | null;
    status?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    applied_at?: string | null;
    applied_by?: number | string | null;
    approved_by?: number | string | null;
    application_lock_id?: string | null;
    application_started_at?: string | null;
    application_attempts?: number | string | null;
    application_error?: string | null;
    requested_by?: number | string | null;
    header_id?:
        | number
        | string
        | {
              header_id?: number | string | null;
              id?: number | string | null;
          }
        | null;
};

export function resolvePriceBatchHeaderId(row: PcrRow): number | null {
    const meta = resolveHeaderMeta(row.header_id ?? null);
    return meta.batch_header_id;
}

export function isOrphanPriceRequest(row: PcrRow): boolean {
    return resolvePriceBatchHeaderId(row) == null;
}

function normalizeProductId(row: PcrRow): number {
    return pickId(row.product_id) ?? 0;
}

function normalizePriceTypeId(row: PcrRow): number {
    return pickId(row.price_type_id) ?? 0;
}

export async function getPriceRequest(request_id: number): Promise<PcrRow | null> {
    const params = new URLSearchParams();
    params.set("fields", PCR_FIELDS);

    const url = `${mustBase()}/items/${PCR}/${request_id}?${params.toString()}`;
    const json = await fetchDirectus<DirectusSingleResponse<PcrRow>>(url, {
        headers: directusHeaders(),
    });

    return json.data ?? null;
}

async function loadPriceTypeCatalog() {
    const params = new URLSearchParams();
    params.set("fields", "price_type_id,price_type_name,sort");
    params.set("sort", "sort,price_type_id");
    params.set("limit", "500");

    const url = `${mustBase()}/items/${PRICE_TYPES}?${params.toString()}`;
    const json = await fetchDirectus<DirectusList<PriceTypeRow>>(url, { headers: directusHeaders() });

    const catalog: Array<{ price_type_id: number; price_type_name: string; sort?: number | string | null }> = [];
    for (const row of json.data ?? []) {
        const id = Number(row.price_type_id);
        const name = String(row.price_type_name ?? "").trim();
        if (Number.isFinite(id) && id > 0 && name) {
            catalog.push({ price_type_id: id, price_type_name: name, sort: row.sort });
        }
    }
    return catalog;
}

async function findExistingPriceRecord(productId: number, priceTypeId: number): Promise<{
    id?: number | string | null;
    created_by?: unknown;
} | null> {
    const params = new URLSearchParams();
    params.set("fields", "id,created_by");
    params.set("limit", "1");
    params.set("filter[product_id][_eq]", String(productId));
    params.set("filter[price_type_id][_eq]", String(priceTypeId));

    const url = `${mustBase()}/items/${PRICES}?${params.toString()}`;
    const json = await fetchDirectus<DirectusList<ExistingPriceRow>>(url, { headers: directusHeaders() });
    return json.data?.[0] ?? null;
}

export function isFutureEffectiveAt(effectiveAt?: string | null): boolean {
    if (!effectiveAt) return false;
    const effectiveDate = new Date(effectiveAt);
    return Number.isFinite(effectiveDate.getTime()) && effectiveDate.getTime() > Date.now();
}

export function approvalApplicationPatch(args: {
    userId?: number | null;
    effectiveAt?: string | null;
    scheduled?: boolean;
}) {
    const now = nowManila();
    const effectiveAt = args.effectiveAt || now;

    if (args.scheduled) {
        return {
            effective_at: effectiveAt,
            application_status: "SCHEDULED",
            applied_at: null,
            applied_by: null,
        };
    }

    return {
        effective_at: effectiveAt,
        application_status: "APPLIED",
        applied_at: now,
        ...(args.userId ? { applied_by: args.userId } : {}),
    };
}

export async function applyProposedPrice(args: {
    userId: number;
    createdBy?: number | null;
    productId: number;
    priceTypeId: number;
    currentPrice: unknown;
    proposedPrice: number;
}) {
    const { userId, productId, priceTypeId, currentPrice, proposedPrice } = args;
    const updatedBy = await resolveAuditUserId(userId);
    const validProposedPrice = assertValidPriceValue(proposedPrice, "proposed_price");
    await assertPriceSnapshotCurrent({
        product_id: productId,
        price_type_id: priceTypeId,
        current_price: currentPrice,
    });

    const [existingPrice, priceTypeCatalog] = await Promise.all([
        findExistingPriceRecord(productId, priceTypeId),
        loadPriceTypeCatalog(),
    ]);
    const existingId = Number(existingPrice?.id);
    const hasExistingId = Number.isFinite(existingId) && existingId > 0;
    const existingCreatedBy = readAuditUserId(existingPrice?.created_by);
    const createdBy = !hasExistingId || !existingCreatedBy
        ? await resolveAuditUserId(args.createdBy ?? updatedBy)
        : null;

    const payload = {
        status: "approved",
        product_id: productId,
        price_type_id: priceTypeId,
        price: validProposedPrice,
        updated_at: nowManila(),
        updated_by: updatedBy,
        ...(createdBy ? { created_by: createdBy } : {}),
    };

    if (hasExistingId) {
        const response = await fetchDirectus<DirectusSingleResponse<{
            id?: number | string | null;
            created_by?: unknown;
            updated_by?: unknown;
        }>>(`${mustBase()}/items/${PRICES}/${existingId}?fields=id,created_by,updated_by`, {
            method: "PATCH",
            headers: directusHeaders(),
            body: JSON.stringify(payload),
        });
        assertPriceAuditRecord(
            response.data,
            createdBy ? { createdBy, updatedBy } : { updatedBy },
        );
    } else {
        const createPayload = {
            ...payload,
            created_at: nowManila(),
        };
        const response = await fetchDirectus<DirectusSingleResponse<{
            id?: number | string | null;
            created_by?: unknown;
            updated_by?: unknown;
        }>>(`${mustBase()}/items/${PRICES}?fields=id,created_by,updated_by`, {
            method: "POST",
            headers: directusHeaders(),
            body: JSON.stringify(createPayload),
        });
        assertPriceAuditRecord(response.data, { createdBy, updatedBy });
    }

    const priceTypeName =
        priceTypeCatalog.find((row) => row.price_type_id === priceTypeId)?.price_type_name ?? "";
    const productPatch = resolveLegacyProductsPatch({
        priceTypeId,
        priceTypeName,
        price: validProposedPrice,
        catalog: priceTypeCatalog,
    });

    if (productPatch) {
        const productPayload = {
            ...productPatch,
            last_updated: nowManila(),
            updated_by: updatedBy,
        };

        await fetchDirectus(`${mustBase()}/items/${PRODUCTS}/${productId}`, {
            method: "PATCH",
            headers: directusHeaders(),
            body: JSON.stringify(productPayload),
        });
    }

    invalidateGroupIndexCacheOnCatalogChange();
}

export async function applyProposedVersionPrice(args: {
    userId: number;
    productId: number;
    versionId: number;
    priceTypeId: number;
    proposedPrice: number;
}) {
    const { versionId, priceTypeId, proposedPrice } = args;
    const validProposedPrice = assertValidPriceValue(proposedPrice, "proposed_price");

    const existingParams = new URLSearchParams();
    existingParams.set("limit", "1");
    existingParams.set("fields", "version_price_id");
    existingParams.set("filter[version_id][_eq]", String(versionId));
    existingParams.set("filter[price_type_id][_eq]", String(priceTypeId));

    const existingJson = await fetchDirectus<{ data: { version_price_id?: number | string | null }[] }>(
        `${mustBase()}/items/product_version_prices?${existingParams.toString()}`
    );

    const existingId = Number(existingJson.data?.[0]?.version_price_id);
    const hasExistingId = Number.isFinite(existingId) && existingId > 0;

    const payload = {
        version_id: versionId,
        price_type_id: priceTypeId,
        price_per_unit: validProposedPrice,
    };

    if (hasExistingId) {
        await fetchDirectus(`${mustBase()}/items/product_version_prices/${existingId}`, {
            method: "PATCH",
            headers: directusHeaders(),
            body: JSON.stringify(payload),
        });
    } else {
        await fetchDirectus(`${mustBase()}/items/product_version_prices`, {
            method: "POST",
            headers: directusHeaders(),
            body: JSON.stringify(payload),
        });
    }
}

export async function approveOneOrphanPriceRequest(
    userId: number,
    request_id: number,
    row: PcrRow,
    effectiveAt?: string | null,
): Promise<PcrRow> {
    if (!isOrphanPriceRequest(row)) {
        throw new Error("This request is linked to a batch. Approve the batch instead.");
    }

    const productId = normalizeProductId(row);
    const priceTypeId = normalizePriceTypeId(row);
    const proposedPrice = Number(row.proposed_price);

    if (!productId) {
        throw new Error("Invalid product_id on request.");
    }

    if (!priceTypeId) {
        throw new Error("Invalid price_type_id on request.");
    }

    if (!isValidPriceValue(proposedPrice)) {
        throw new Error("Invalid proposed_price on request.");
    }

    await assertPriceSnapshotCurrent({
        request_id,
        product_id: productId,
        price_type_id: priceTypeId,
        current_price: row.current_price,
    });

    const staged = await stageStandaloneApproval<PcrRow>({
        collection: PCR,
        id: request_id,
        userId,
        effectiveAt,
        fields: PCR_FIELDS,
    });
    if (!staged) throw new Error("Request is no longer pending or is already being processed.");

    if (!staged.scheduled) {
        const outcome = await executeClaimedApplication({
            collection: PCR,
            row: staged.row,
            userId,
            claimFields: ["current_price"],
            apply: async (claimed) => applyProposedPrice({
                userId,
                createdBy: readAuditUserId(claimed.requested_by),
                productId,
                priceTypeId,
                currentPrice: claimed.current_price,
                proposedPrice,
            }),
        });
        if (outcome.state === "applied") invalidateGroupIndexCacheOnCatalogChange();
    }

    return (await getPriceRequest(request_id)) ?? staged.row;
}

export async function rejectOneOrphanPriceRequest(
    userId: number,
    request_id: number,
    row: PcrRow,
    reject_reason: string,
): Promise<PcrRow> {
    if (!isOrphanPriceRequest(row)) {
        throw new Error("This request is linked to a batch. Reject the batch instead.");
    }

    const url = `${mustBase()}/items/${PCR}/${request_id}`;
    const updated = await fetchDirectus<DirectusSingleResponse<PcrRow>>(url, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({
            status: "REJECTED",
            rejected_by: userId,
            rejected_at: nowManila(),
            reject_reason,
        }),
    });

    return updated.data;
}

export async function cancelOnePriceRequest(
    userId: number,
    request_id: number,
    row: PcrRow,
): Promise<PcrRow> {
    const requested_by = Number(row.requested_by);
    if (requested_by !== userId) {
        throw new Error("You can only cancel your own request.");
    }

    const url = `${mustBase()}/items/${PCR}/${request_id}`;
    const updated = await fetchDirectus<DirectusSingleResponse<PcrRow>>(url, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({ status: "CANCELLED" }),
    });

    return updated.data;
}

export function actionErrorMessage(error: unknown, fallback = "Request failed"): string {
    if (!(error instanceof Error) || !error.message) return fallback;

    try {
        const parsed: unknown = JSON.parse(error.message);
        if (!isRecord(parsed)) return error.message || fallback;

        const body = typeof parsed.body === "string" ? parsed.body : "";
        if (body) {
            try {
                const bodyParsed: unknown = JSON.parse(body);
                if (isRecord(bodyParsed) && typeof bodyParsed.errors === "object" && bodyParsed.errors) {
                    const first = Array.isArray(bodyParsed.errors) ? bodyParsed.errors[0] : null;
                    if (isRecord(first) && typeof first.message === "string" && first.message) {
                        return first.message;
                    }
                }
            } catch {
                // ignore nested parse errors
            }
        }

        if (typeof parsed.message === "string" && parsed.message) {
            return parsed.message;
        }
    } catch {
        // not a wrapped Directus error
    }

    return error.message || fallback;
}
