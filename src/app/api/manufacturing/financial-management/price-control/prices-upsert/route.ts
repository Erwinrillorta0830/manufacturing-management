import { NextRequest, NextResponse } from "next/server";
import {
    type LegacyPriceTypeRow,
    resolveLegacyProductsPatch,
} from "../_legacyProductPriceSync";
import { assertValidPriceValue, isInvalidPriceValueError } from "../_pricePrecision";
import { invalidateGroupIndexCacheOnCatalogChange } from "../_productGroupIndexCache";
import { batchAsyncOps, CHUNK_SIZE } from "../_supplierFilters";
import { assertPriceAuditRecord, resolveAuditUserId } from "../_priceAudit";
import { directusHeaders, readAuditUserId, nowManila } from "../price-change-batches/_batch";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const PRICE_TYPES = "price_types";
const PRICES = "product_per_price_type";
const PRODUCTS = "products";

type UpsertLine = {
    product_id: number;
    price_type_id: number;
    price: number | null;
    status?: string;
};

type JwtPayload = {
    sub?: string | number | null;
};

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
    updated_by?: unknown;
};

type PriceRecordPayload = {
    status: string;
    product_id: number;
    price_type_id: number;
    price: number | null;
    updated_at?: string;
    updated_by: number;
    created_by?: number;
};

type CreatePriceRecordPayload = PriceRecordPayload & {
    created_at?: string;
    created_by: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function fetchDirectus<T>(url: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(directusHeaders());
    if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    const res = await fetch(url, { cache: "no-store", ...init, headers });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
}

/**
 * Decode JWT payload (NO VERIFY) and extract numeric userId from `sub`.
 */
function decodeUserIdFromJwtCookie(req: NextRequest, cookieName = "vos_access_token") {
    const token = req.cookies.get(cookieName)?.value;
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        const payloadPart = parts[1];
        const pad = "=".repeat((4 - (payloadPart.length % 4)) % 4);
        const b64 = (payloadPart + pad).replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr = Buffer.from(b64, "base64").toString("utf8");
        const payloadUnknown: unknown = JSON.parse(jsonStr);

        if (!isRecord(payloadUnknown)) return null;

        const payload = payloadUnknown as JwtPayload;
        const userId = Number(payload.sub);
        return Number.isFinite(userId) ? userId : null;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized (missing/invalid token)" }, { status: 401 });
        }
        const auditUserId = await resolveAuditUserId(userId);

        const body = (await req.json()) as { lines?: UpsertLine[] };
        const lines = Array.isArray(body?.lines) ? body.lines : [];

        if (!lines.length) {
            return NextResponse.json({ ok: true, affected: 0 });
        }

        for (const line of lines) {
            const pid = Number(line.product_id);
            const ptid = Number(line.price_type_id);

            if (!pid || Number.isNaN(pid) || !ptid || Number.isNaN(ptid)) {
                return NextResponse.json({ error: "Invalid product_id / price_type_id" }, { status: 400 });
            }

            if (line.price !== null && line.price !== undefined) {
                assertValidPriceValue(line.price, "price");
            }
        }

        const priceTypeParams = new URLSearchParams();
        priceTypeParams.set("limit", "-1");
        priceTypeParams.set("fields", "price_type_id,price_type_name,sort");
        priceTypeParams.set("sort", "sort,price_type_id");

        const priceTypeUrl = `${DIRECTUS_URL}/items/${PRICE_TYPES}?${priceTypeParams.toString()}`;
        const priceTypeJson = await fetchDirectus<{ data: PriceTypeRow[] }>(priceTypeUrl);

        const priceTypeCatalog: LegacyPriceTypeRow[] = [];
        const idToTier = new Map<number, string>();
        for (const row of priceTypeJson.data ?? []) {
            const id = Number(row.price_type_id);
            const name = String(row.price_type_name ?? "").trim();
            if (Number.isFinite(id) && name) {
                idToTier.set(id, name);
                priceTypeCatalog.push({
                    price_type_id: id,
                    price_type_name: name,
                    sort: row.sort,
                });
            }
        }

        for (const line of lines) {
            if (!idToTier.has(Number(line.price_type_id))) {
                return NextResponse.json(
                    { error: `price_type_id not found: ${line.price_type_id}` },
                    { status: 400 },
                );
            }
        }

        const productIds = Array.from(new Set(lines.map((line) => Number(line.product_id))));
        const priceTypeIds = Array.from(new Set(lines.map((line) => Number(line.price_type_id))));

        const existingKeyToRow = new Map<string, ExistingPriceRow>();
        const productIdChunks = [];
        for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
            productIdChunks.push(productIds.slice(i, i + CHUNK_SIZE));
        }
        for (const pidChunk of productIdChunks) {
            const ptidChunks = [];
            for (let i = 0; i < priceTypeIds.length; i += CHUNK_SIZE) {
                ptidChunks.push(priceTypeIds.slice(i, i + CHUNK_SIZE));
            }
            for (const ptidChunk of ptidChunks) {
                const existingParams = new URLSearchParams();
                existingParams.set("limit", "-1");
                existingParams.set("fields", "id,product_id,price_type_id,created_by");
                existingParams.set("filter[product_id][_in]", pidChunk.join(","));
                existingParams.set("filter[price_type_id][_in]", ptidChunk.join(","));

                const existingUrl = `${DIRECTUS_URL}/items/${PRICES}?${existingParams.toString()}`;
                const existingJson = await fetchDirectus<{ data: ExistingPriceRow[] }>(existingUrl);

                for (const row of existingJson.data ?? []) {
                    const key = `${Number(row.product_id)}:${Number(row.price_type_id)}`;
                    existingKeyToRow.set(key, row);
                }
            }
        }

        const toCreate: CreatePriceRecordPayload[] = [];
        const toUpdate: Array<{ id: number; payload: PriceRecordPayload }> = [];

        for (const line of lines) {
            const pid = Number(line.product_id);
            const ptid = Number(line.price_type_id);
            const key = `${pid}:${ptid}`;

            const payload: PriceRecordPayload = {
                status: (line.status ?? "approved").trim() || "approved",
                product_id: pid,
                price_type_id: ptid,
                price: line.price === null || line.price === undefined
                    ? null
                    : assertValidPriceValue(line.price, "price"),
                updated_at: nowManila(),
                updated_by: auditUserId,
            };

            const existingRow = existingKeyToRow.get(key);
            const existingId = Number(existingRow?.id);
            if (Number.isFinite(existingId) && existingId > 0) {
                const existingCreatedBy = readAuditUserId(existingRow?.created_by);
                toUpdate.push({
                    id: existingId,
                    payload: existingCreatedBy ? payload : { ...payload, created_by: auditUserId },
                });
            } else {
                toCreate.push({ ...payload, created_at: nowManila(), created_by: auditUserId });
            }
        }

        let affected = 0;

        if (toCreate.length) {
            const createUrl = `${DIRECTUS_URL}/items/${PRICES}`;
            const res = await fetchDirectus<{ data: ExistingPriceRow[] }>(`${createUrl}?fields=id,created_by,updated_by`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(toCreate),
            });
            for (const row of res.data ?? []) {
                assertPriceAuditRecord(row, { createdBy: auditUserId, updatedBy: auditUserId });
            }
            affected += (res.data ?? []).length;
        }

        if (toUpdate.length) {
            await batchAsyncOps(toUpdate, async ({ id, payload }) => {
                const response = await fetchDirectus<{ data: ExistingPriceRow }>(`${DIRECTUS_URL}/items/${PRICES}/${id}?fields=id,created_by,updated_by`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                assertPriceAuditRecord(
                    response.data,
                    payload.created_by
                        ? { createdBy: payload.created_by, updatedBy: auditUserId }
                        : { updatedBy: auditUserId },
                );
                return response;
            });
            affected += toUpdate.length;
        }

        const syncOps = lines
            .map((line) => {
                const pid = Number(line.product_id);
                const ptid = Number(line.price_type_id);
                const price =
                    line.price === null || line.price === undefined ? null : Number(line.price);
                const patch = resolveLegacyProductsPatch({
                    priceTypeId: ptid,
                    priceTypeName: idToTier.get(ptid) ?? "",
                    price,
                    catalog: priceTypeCatalog,
                });

                if (!patch) return null;

                return fetchDirectus<unknown>(`${DIRECTUS_URL}/items/${PRODUCTS}/${pid}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patch),
                });
            })
            .filter((op): op is Promise<unknown> => op !== null);

        if (syncOps.length) {
            await Promise.all(syncOps);
            invalidateGroupIndexCacheOnCatalogChange();
        }

        return NextResponse.json({ ok: true, affected });
    } catch (error: unknown) {
        if (isInvalidPriceValueError(error)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json(
            {
                error: "Unexpected error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
