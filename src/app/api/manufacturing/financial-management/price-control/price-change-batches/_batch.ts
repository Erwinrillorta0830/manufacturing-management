import { NextRequest, NextResponse } from "next/server";
import { invalidateGroupIndexCacheOnCatalogChange } from "../_productGroupIndexCache";
import {
    assertValidPriceValue,
    isInvalidPriceValueError,
    isValidPriceValue,
} from "../_pricePrecision";

export const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const HEADERS = "price_change_headers";
export const DETAILS = "price_change_requests";
export const PRODUCTS = "products";
export const PRICE_TYPES = "price_types";
export const PRICES = "product_per_price_type";

type JwtPayload = {
    sub?: string | number | null;
};

export type DirectusWrappedError = {
    message: string;
    status: number;
    url: string;
    body: string;
};

type DirectusUserRelation = {
    id?: number | string | null;
    user_id?: number | string | null;
    user_fname?: string | null;
    user_mname?: string | null;
    user_lname?: string | null;
    suffix_name?: string | null;
    nickname?: string | null;
    user_email?: string | null;
};

export type DirectusFlagValue =
    | number
    | string
    | boolean
    | { type?: string | null; data?: unknown[] | null }
    | null;

export type BatchHeaderRow = {
    id?: number | string | null;
    header_id?: number | string | null;
    supplier_id?: number | string | {
        id?: number | string | null;
        supplier_name?: string | null;
        supplier_shortcut?: string | null;
        isActive?: DirectusFlagValue;
        nonBuy?: DirectusFlagValue;
    } | null;
    reference_no?: string | null;
    remarks?: string | null;
    status?: string | null;
    requested_by?: number | string | DirectusUserRelation | null;
    requested_at?: string | null;
    approved_by?: number | string | DirectusUserRelation | null;
    approved_at?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_lock_id?: string | null;
    application_started_at?: string | null;
    application_attempts?: number | string | null;
    application_error?: string | null;
    applied_at?: string | null;
    applied_by?: number | string | DirectusUserRelation | null;
    rejected_by?: number | string | DirectusUserRelation | null;
    rejected_at?: string | null;
    reject_reason?: string | null;
};

export type BatchDetailRow = {
    request_id?: number | string | null;
    header_id?: number | string | BatchHeaderRow | null;
    product_id?:
        | number
        | string
        | {
            product_id?: number | string | null;
            product_code?: string | null;
            product_name?: string | null;
            barcode?: string | null;
        }
        | null;
    version_id?:
        | number
        | string
        | {
            version_id?: number | string | null;
            version_name?: string | null;
        }
        | null;
    price_type_id?:
        | number
        | string
        | {
            price_type_id?: number | string | null;
            price_type_name?: string | null;
        }
        | null;
    current_price?: number | string | null;
    proposed_price?: number | string | null;
    status?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
    application_lock_id?: string | null;
    application_started_at?: string | null;
    application_attempts?: number | string | null;
    application_error?: string | null;
    applied_at?: string | null;
    applied_by?: number | string | DirectusUserRelation | null;
    requested_by?: number | string | DirectusUserRelation | null;
    requested_at?: string | null;
    rejected_by?: number | string | DirectusUserRelation | null;
    rejected_at?: string | null;
    reject_reason?: string | null;
};

type DirectusSingle<T> = { data?: T };
type DirectusList<T> = { data?: T[]; meta?: { total_count?: number } | null };

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function readAuditUserId(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (typeof value === "string") {
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : null;
    }
    if (isRecord(value)) {
        return readAuditUserId(value.user_id ?? value.id);
    }
    return null;
}

export function mustBase() {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set.");
    return DIRECTUS_URL;
}

export function directusToken() {
    return process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_SERVICE_TOKEN || "";
}

export function directusHeaders() {
    const token = directusToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

const BATCH_PAGE_SIZE = 500;
const IN_CHUNK_SIZE = 200;

function chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function fetchAllPagesLocal<T>(
    collection: string,
    buildParams: () => URLSearchParams,
): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;

    while (true) {
        const params = buildParams();
        params.set("limit", String(BATCH_PAGE_SIZE));
        params.set("offset", String(offset));

        const url = `${mustBase()}/items/${collection}?${params.toString()}`;
        const json = await fetchDirectus<DirectusList<T>>(url, { headers: directusHeaders() });
        const rows = json.data ?? [];
        all.push(...rows);

        if (rows.length < BATCH_PAGE_SIZE) break;
        offset += BATCH_PAGE_SIZE;
    }

    return all;
}

export async function fetchDirectus<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { cache: "no-store", ...init });
    const text = await res.text().catch(() => "");

    if (!res.ok) {
        throw new Error(
            JSON.stringify({
                message: "Directus request failed",
                status: res.status,
                url,
                body: text,
            } satisfies DirectusWrappedError),
        );
    }

    return text ? (JSON.parse(text) as T) : ({} as T);
}

export function decodeUserIdFromJwtCookie(req: NextRequest, cookieName = "vos_access_token") {
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

export function nowManila(): string {
    return new Date()
        .toLocaleString("sv-SE", { timeZone: "Asia/Manila" })
        .replace(" ", "T");
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

export function pickId(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (isRecord(value)) {
        for (const key of ["header_id", "request_id", "product_id", "price_type_id", "id"]) {
            const n = Number(value[key]);
            if (Number.isFinite(n) && n > 0) return n;
        }
    }
    return null;
}

export function normalizeHeaderId(header: BatchHeaderRow): number {
    return pickId(header.header_id) ?? pickId(header.id) ?? 0;
}

export function normalizeProductId(detail: BatchDetailRow): number {
    return pickId(detail.product_id) ?? 0;
}

export function normalizeVersionId(detail: BatchDetailRow): number | null {
    const id = pickId(detail.version_id);
    return id !== null && id > 0 ? id : null;
}

export function normalizePriceTypeId(detail: BatchDetailRow): number {
    return pickId(detail.price_type_id) ?? 0;
}

export function normalizePriceTypeName(value: unknown): string {
    if (isRecord(value)) return String(value.price_type_name ?? "").trim();
    return "";
}

export function parseWrappedError(message: string): DirectusWrappedError | null {
    try {
        const parsed: unknown = JSON.parse(message);
        if (!isRecord(parsed)) return null;

        const status = Number(parsed.status);
        const url = typeof parsed.url === "string" ? parsed.url : "";
        const body = typeof parsed.body === "string" ? parsed.body : "";
        const parsedMessage = typeof parsed.message === "string" ? parsed.message : "Directus request failed";

        if (!Number.isFinite(status) || !url) return null;

        return {
            message: parsedMessage,
            status,
            url,
            body,
        };
    } catch {
        return null;
    }
}

export function directusErrorResponse(error: unknown) {
    if (isInvalidPriceValueError(error)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : String(error);
    const wrapped = parseWrappedError(message);
    const errorId = crypto.randomUUID();

    if (wrapped) {
        const isBatchStorageRequest =
            wrapped.url.includes(`/items/${HEADERS}`) ||
            wrapped.url.includes(`/items/${DETAILS}`) ||
            wrapped.body.includes(HEADERS) ||
            wrapped.body.includes(DETAILS);

        if ((wrapped.status === 401 || wrapped.status === 403 || wrapped.status === 404) && isBatchStorageRequest) {
            console.error(
                `[directusErrorResponse:${errorId}] Storage/permission error`,
                `status=${wrapped.status}`,
                `url=${wrapped.url}`,
                `body=${wrapped.body}`,
                `message=${message}`,
            );
            return NextResponse.json(
                {
                    error: "Price change batch storage is not configured or the Directus token lacks permission.",
                    details: `Confirm ${HEADERS} exists, ${DETAILS} has header_id/current_price fields, and the Directus token role can read/create/update both collections.`,
                    setup_required: true,
                    directus_status: wrapped.status,
                    error_id: errorId,
                },
                { status: 503 },
            );
        }

        console.error(
            `[directusErrorResponse:${errorId}] Directus request failed`,
            `status=${wrapped.status}`,
            `url=${wrapped.url}`,
            `body=${wrapped.body}`,
            `message=${message}`,
        );

        return NextResponse.json(
            {
                error: "Product pricing service request failed.",
                directus_status: wrapped.status,
                error_id: errorId,
            },
            { status: 500 },
        );
    }

    console.error(`[directusErrorResponse:${errorId}] Unexpected error: ${message}`);
    return NextResponse.json({ error: "Unexpected product pricing error.", error_id: errorId }, { status: 500 });
}

export type BatchCreateLineInput = {
    product_id: number;
    version_id?: number | null;
    price_type_id: number;
    current_price?: number | null;
    proposed_price: number;
};

export type NormalizedBatchCreateLine = {
    product_id: number;
    version_id?: number | null;
    price_type_id: number;
    current_price: number | null;
    proposed_price: number;
};

export type BatchCreatePlan = {
    linesToCreate: NormalizedBatchCreateLine[];
    skippedDuplicates: number;
    skippedExistingPending: number;
};

function batchLineKey(productId: number, priceTypeId: number, versionId?: number | null) {
    return versionId ? `v:${versionId}:${priceTypeId}` : `${productId}:${priceTypeId}`;
}

type LivePriceRow = {
    product_id?: number | string | null;
    price_type_id?: number | string | null;
    price?: number | string | null;
};

export type PriceSnapshotConflict = {
    request_id: number;
    product_id: number;
    price_type_id: number;
    snapshot_price: number | null;
    live_price: number | null;
    reason: "invalid_snapshot" | "stale_snapshot";
};

export class PriceSnapshotConflictError extends Error {
    constructor(public readonly conflict: PriceSnapshotConflict) {
        super(
            `Price changed after submission for product ${conflict.product_id}, price type ${conflict.price_type_id}.`,
        );
        this.name = "PriceSnapshotConflictError";
    }
}

export function isPriceSnapshotConflictError(error: unknown): error is PriceSnapshotConflictError {
    return error instanceof PriceSnapshotConflictError;
}

function parseSnapshotPrice(value: unknown): { valid: boolean; value: number | null } {
    if (value === null || value === undefined) return { valid: true, value: null };
    const parsed = Number(value);
    return Number.isFinite(parsed)
        ? { valid: true, value: parsed }
        : { valid: false, value: null };
}

function snapshotPricesMatch(snapshot: number | null, live: number | null): boolean {
    if (snapshot === null || live === null) return snapshot === live;
    return Math.abs(snapshot - live) <= 1e-9;
}

export async function fetchLivePriceSnapshots(
    keys: Array<{ product_id: number; price_type_id: number; version_id?: number | null }>,
): Promise<Map<string, number | null>> {
    const snapshots = new Map<string, number | null>();

    const baseKeys = keys.filter((k) => !k.version_id);
    if (baseKeys.length > 0) {
        const productIds = Array.from(new Set(baseKeys.map((k) => k.product_id).filter((id) => id > 0)));
        const priceTypeIds = Array.from(new Set(baseKeys.map((k) => k.price_type_id).filter((id) => id > 0)));

        if (productIds.length > 0 && priceTypeIds.length > 0) {
            for (const productChunk of chunkArray(productIds, IN_CHUNK_SIZE)) {
                const rows = await fetchAllPagesLocal<LivePriceRow>(PRICES, () => {
                    const params = new URLSearchParams();
                    params.set("fields", "product_id,price_type_id,price");
                    params.set("filter[product_id][_in]", productChunk.join(","));
                    params.set("filter[price_type_id][_in]", priceTypeIds.join(","));
                    return params;
                });

                for (const row of rows) {
                    const productId = pickId(row.product_id) ?? 0;
                    const priceTypeId = pickId(row.price_type_id) ?? 0;
                    if (!productId || !priceTypeId) continue;
                    snapshots.set(
                        batchLineKey(productId, priceTypeId),
                        parseSnapshotPrice(row.price).value,
                    );
                }
            }
        }
    }

    const versionKeys = keys.filter((k) => k.version_id);
    if (versionKeys.length > 0) {
        const versionIds = Array.from(new Set(versionKeys.map((k) => k.version_id as number).filter((id) => id > 0)));
        const priceTypeIds = Array.from(new Set(versionKeys.map((k) => k.price_type_id).filter((id) => id > 0)));

        if (versionIds.length > 0 && priceTypeIds.length > 0) {
            for (const versionChunk of chunkArray(versionIds, IN_CHUNK_SIZE)) {
                const rows = await fetchAllPagesLocal<{ version_id?: number | null; price_type_id?: number | null; price_per_unit?: number | string | null }>("product_version_prices", () => {
                    const params = new URLSearchParams();
                    params.set("fields", "version_id,price_type_id,price_per_unit");
                    params.set("filter[version_id][_in]", versionChunk.join(","));
                    params.set("filter[price_type_id][_in]", priceTypeIds.join(","));
                    return params;
                });

                for (const row of rows) {
                    const versionId = pickId(row.version_id) ?? 0;
                    const priceTypeId = pickId(row.price_type_id) ?? 0;
                    if (!versionId || !priceTypeId) continue;
                    snapshots.set(
                        batchLineKey(0, priceTypeId, versionId),
                        parseSnapshotPrice(row.price_per_unit).value,
                    );
                }
            }
        }
    }

    return snapshots;
}

export async function findPriceSnapshotConflicts(
    lines: Array<{
        request_id?: number;
        product_id: number;
        version_id?: number | null;
        price_type_id: number;
        current_price: unknown;
    }>,
): Promise<PriceSnapshotConflict[]> {
    const liveSnapshots = await fetchLivePriceSnapshots(lines);
    const conflicts: PriceSnapshotConflict[] = [];

    for (const line of lines) {
        const stored = parseSnapshotPrice(line.current_price);
        const live = liveSnapshots.get(batchLineKey(line.product_id, line.price_type_id, line.version_id)) ?? null;
        if (!stored.valid || !snapshotPricesMatch(stored.value, live)) {
            conflicts.push({
                request_id: line.request_id ?? 0,
                product_id: line.product_id,
                price_type_id: line.price_type_id,
                snapshot_price: stored.value,
                live_price: live,
                reason: stored.valid ? "stale_snapshot" : "invalid_snapshot",
            });
        }
    }

    return conflicts;
}

export async function assertPriceSnapshotCurrent(args: {
    request_id?: number;
    product_id: number;
    version_id?: number | null;
    price_type_id: number;
    current_price: unknown;
}) {
    const conflicts = await findPriceSnapshotConflicts([args]);
    if (conflicts[0]) throw new PriceSnapshotConflictError(conflicts[0]);
}

function supplierIdOf(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    if (isRecord(value)) return pickId(value.id);
    return null;
}

function supplierFlag(value: unknown): number | null {
    if (value === true) return 1;
    if (value === false) return 0;
    if (isRecord(value)) {
        if (value.type !== "Buffer" || !Array.isArray(value.data) || value.data.length === 0) return null;
        return supplierFlag(value.data[0]);
    }
    if (typeof value !== "number" && typeof value !== "string") return null;
    const text = String(value).trim();
    if (!text) return null;
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
}

function isEligibleSupplier(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return supplierFlag(value.isActive) === 1 && supplierFlag(value.nonBuy) === 0;
}

export function supplierNameOf(value: unknown): string {
    if (!isRecord(value) || !isEligibleSupplier(value)) return "";
    return supplierLabelOf(value);
}

export function supplierLabelOf(value: unknown): string {
    if (!isRecord(value)) return "";
    const shortcut = String(value.supplier_shortcut ?? "").trim();
    const name = String(value.supplier_name ?? "").trim();
    return shortcut && name ? `${shortcut} - ${name}` : name || shortcut;
}

export function mapBatchHeaderResponse(row: BatchHeaderRow, lineCount = 0) {
    const headerId = normalizeHeaderId(row);
    const supplierId = supplierIdOf(row.supplier_id);
    return {
        id: headerId,
        header_id: headerId,
        supplier_id: supplierId,
        supplier_name: supplierNameOf(row.supplier_id),
        reference_no: row.reference_no ?? "",
        remarks: row.remarks ?? "",
        status: row.status ?? "PENDING",
        requested_by: row.requested_by ?? null,
        requested_at: row.requested_at ?? null,
        approved_by: row.approved_by ?? null,
        approved_at: row.approved_at ?? null,
        effective_at: row.effective_at ?? null,
        application_status: row.application_status ?? null,
        applied_at: row.applied_at ?? null,
        applied_by: row.applied_by ?? null,
        rejected_by: row.rejected_by ?? null,
        rejected_at: row.rejected_at ?? null,
        reject_reason: row.reject_reason ?? null,
        line_count: lineCount,
    };
}

export async function getExistingPendingBatchKeys(lines: NormalizedBatchCreateLine[]) {
    const productIds = Array.from(new Set(lines.map((line) => line.product_id)));
    const priceTypeIds = Array.from(new Set(lines.map((line) => line.price_type_id)));

    if (!productIds.length || !priceTypeIds.length) return new Set<string>();

    const keys = new Set<string>();
    const productChunks = chunkArray(productIds, IN_CHUNK_SIZE);

    for (const productChunk of productChunks) {
        const rows = await fetchAllPagesLocal<BatchDetailRow>(DETAILS, () => {
            const params = new URLSearchParams();
            params.set("fields", "request_id,product_id,version_id,price_type_id,status,application_status");
            params.set("filter[_and][0][_or][0][status][_eq]", "PENDING");
            params.set("filter[_and][0][_or][1][_and][0][status][_eq]", "APPROVED");
            params.set("filter[_and][0][_or][1][_and][1][application_status][_eq]", "SCHEDULED");
            params.set("filter[_and][1][product_id][_in]", productChunk.join(","));
            params.set("filter[_and][2][price_type_id][_in]", priceTypeIds.join(","));
            return params;
        });

        for (const row of rows) {
            const productId = normalizeProductId(row);
            const versionId = normalizeVersionId(row);
            const priceTypeId = normalizePriceTypeId(row);
            if (productId > 0 && priceTypeId > 0) {
                keys.add(batchLineKey(productId, priceTypeId, versionId));
            }
        }
    }

    return keys;
}

export async function normalizeBatchCreateLines(rawLines: BatchCreateLineInput[]): Promise<BatchCreatePlan> {
    const seen = new Set<string>();
    const normalizedLines: NormalizedBatchCreateLine[] = [];
    let skippedDuplicates = 0;

    for (const line of rawLines) {
        const productId = Number(line.product_id);
        const versionId = line.version_id ? Number(line.version_id) : null;
        const priceTypeId = Number(line.price_type_id);

        if (!Number.isFinite(productId) || productId <= 0) continue;
        if (versionId !== null && (!Number.isFinite(versionId) || versionId <= 0)) continue;
        if (!Number.isFinite(priceTypeId) || priceTypeId <= 0) continue;

        const proposedPrice = assertValidPriceValue(line.proposed_price, "proposed_price");

        const key = batchLineKey(productId, priceTypeId, versionId);
        if (seen.has(key)) {
            skippedDuplicates += 1;
            continue;
        }
        seen.add(key);

        normalizedLines.push({
            product_id: productId,
            version_id: versionId,
            price_type_id: priceTypeId,
            current_price: null,
            proposed_price: proposedPrice,
        });
    }

    const existingPendingKeys = await getExistingPendingBatchKeys(normalizedLines);
    const linesToCreate = normalizedLines.filter(
        (line) => !existingPendingKeys.has(batchLineKey(line.product_id, line.price_type_id, line.version_id)),
    );
    const skippedExistingPending = normalizedLines.length - linesToCreate.length;

    return {
        linesToCreate,
        skippedDuplicates,
        skippedExistingPending,
    };
}

export async function createPriceBatchHeader(args: {
    userId: number;
    supplierId: number;
    referenceNo: string;
    remarks: string;
}) {
    const headerPayload = {
        supplier_id: args.supplierId,
        reference_no: args.referenceNo || null,
        remarks: args.remarks,
        status: "PENDING",
        requested_by: args.userId,
        requested_at: nowManila(),
    };

    const header = await fetchDirectus<DirectusSingle<BatchHeaderRow>>(`${mustBase()}/items/${HEADERS}`, {
        method: "POST",
        headers: directusHeaders(),
        body: JSON.stringify(headerPayload),
    });

    const headerId = header.data ? normalizeHeaderId(header.data) : 0;
    if (!headerId) {
        throw new Error("Batch header was created without an id");
    }

    return {
        headerId,
        headerRow: header.data ?? { header_id: headerId },
        requestedAt: headerPayload.requested_at,
    };
}

export async function createPriceBatchDetails(args: {
    userId: number;
    headerId: number;
    linesToCreate: NormalizedBatchCreateLine[];
    requestedAt?: string;
}) {
    const { userId, headerId, linesToCreate } = args;
    if (linesToCreate.length === 0) {
        return { created: 0, detailRows: [] as BatchDetailRow[] };
    }

    const liveSnapshots = await fetchLivePriceSnapshots(linesToCreate);
    const snapshottedLines = linesToCreate.map((line) => ({
        ...line,
        current_price: liveSnapshots.get(batchLineKey(line.product_id, line.price_type_id, line.version_id)) ?? null,
    }));

    const requestedAt = args.requestedAt ?? nowManila();
    const detailPayload = snapshottedLines.map((line) => ({
        header_id: headerId,
        product_id: line.product_id,
        version_id: line.version_id,
        price_type_id: line.price_type_id,
        current_price: line.current_price,
        proposed_price: line.proposed_price,
        status: "PENDING",
        requested_by: userId,
        requested_at: requestedAt,
    }));

    const details = await fetchDirectus<DirectusList<BatchDetailRow>>(`${mustBase()}/items/${DETAILS}`, {
        method: "POST",
        headers: directusHeaders(),
        body: JSON.stringify(detailPayload),
    });

    const created = details.data?.length ?? detailPayload.length;
    if (created !== detailPayload.length) {
        throw new Error("Price batch detail creation was incomplete.");
    }

    return {
        created,
        detailRows: details.data ?? [],
    };
}

export async function createPendingPriceBatch(args: {
    userId: number;
    supplierId: number;
    referenceNo: string;
    remarks: string;
    linesToCreate: NormalizedBatchCreateLine[];
}) {
    const { userId, supplierId, referenceNo, remarks, linesToCreate } = args;

    if (linesToCreate.length === 0) {
        throw new Error("linesToCreate must be non-empty");
    }

    const header = await createPriceBatchHeader({ userId, supplierId, referenceNo, remarks });
    const details = await createPriceBatchDetails({
        userId,
        headerId: header.headerId,
        linesToCreate,
        requestedAt: header.requestedAt,
    });

    return {
        headerId: header.headerId,
        created: details.created,
        headerRow: header.headerRow,
    };
}

export async function getHeader(headerId: number) {
    const params = new URLSearchParams();
    params.set(
        "fields",
        [
            "header_id",
            "supplier_id",
            "supplier_id.id",
            "supplier_id.supplier_name",
            "supplier_id.supplier_shortcut",
            "supplier_id.isActive",
            "supplier_id.nonBuy",
            "reference_no",
            "remarks",
            "status",
            "requested_by",
            "requested_by.user_id",
            "requested_by.user_fname",
            "requested_by.user_mname",
            "requested_by.user_lname",
            "requested_by.suffix_name",
            "requested_by.nickname",
            "requested_by.user_email",
            "requested_at",
            "approved_by",
            "approved_by.user_id",
            "approved_by.user_fname",
            "approved_by.user_mname",
            "approved_by.user_lname",
            "approved_by.suffix_name",
            "approved_by.nickname",
            "approved_by.user_email",
            "approved_at",
            "effective_at",
            "application_status",
            "application_started_at",
            "application_attempts",
            "application_error",
            "applied_at",
            "applied_by",
            "applied_by.user_id",
            "applied_by.user_fname",
            "applied_by.user_mname",
            "applied_by.user_lname",
            "applied_by.suffix_name",
            "applied_by.nickname",
            "applied_by.user_email",
            "rejected_by",
            "rejected_by.user_id",
            "rejected_by.user_fname",
            "rejected_by.user_mname",
            "rejected_by.user_lname",
            "rejected_by.suffix_name",
            "rejected_by.nickname",
            "rejected_by.user_email",
            "rejected_at",
            "reject_reason",
        ].join(","),
    );

    const url = `${mustBase()}/items/${HEADERS}/${headerId}?${params.toString()}`;
    const json = await fetchDirectus<DirectusSingle<BatchHeaderRow>>(url, { headers: directusHeaders() });
    return json.data ?? null;
}

export async function getDetails(headerId: number) {
    const detailFields = [
        "request_id",
        "header_id",
        "product_id",
        "product_id.product_id",
        "product_id.product_code",
        "product_id.product_name",
        "product_id.barcode",
        "product_id.unit_of_measurement.unit_id",
        "product_id.unit_of_measurement.unit_name",
        "product_id.unit_of_measurement.unit_shortcut",
        "price_type_id",
        "price_type_id.price_type_id",
        "price_type_id.price_type_name",
        "current_price",
        "proposed_price",
        "status",
        "effective_at",
        "application_status",
        "application_lock_id",
        "application_started_at",
        "application_attempts",
        "application_error",
        "applied_at",
        "applied_by",
        "applied_by.user_id",
        "applied_by.user_fname",
        "applied_by.user_mname",
        "applied_by.user_lname",
        "applied_by.suffix_name",
        "applied_by.nickname",
        "applied_by.user_email",
        "requested_by",
        "requested_by.user_id",
        "requested_by.user_fname",
        "requested_by.user_mname",
        "requested_by.user_lname",
        "requested_by.suffix_name",
        "requested_by.nickname",
        "requested_by.user_email",
        "requested_at",
        "rejected_by",
        "rejected_by.user_id",
        "rejected_by.user_fname",
        "rejected_by.user_mname",
        "rejected_by.user_lname",
        "rejected_by.suffix_name",
        "rejected_by.nickname",
        "rejected_by.user_email",
        "rejected_at",
        "reject_reason",
    ].join(",");

    return fetchAllPagesLocal<BatchDetailRow>(DETAILS, () => {
        const params = new URLSearchParams();
        params.set("fields", detailFields);
        params.set("filter[header_id][_eq]", String(headerId));
        params.set("sort", "request_id");
        return params;
    });
}

export async function cancelPendingBatch(
    headerId: number,
    userId: number,
    reason: string,
    detailCollections: string[] = [DETAILS],
) {
    const header = await getHeader(headerId);
    if (!header) return;

    const status = String(header.status ?? "");
    if (status !== "PENDING") return;

    await fetchDirectus(`${mustBase()}/items/${HEADERS}/${headerId}`, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({
            status: "CANCELLED",
            reject_reason: reason,
            rejected_by: userId,
            rejected_at: nowManila(),
        }),
    });

    await Promise.all(
        Array.from(new Set(detailCollections.filter(Boolean))).map(async (collection) => {
            const params = new URLSearchParams();
            params.set("limit", "-1");
            params.set("fields", "request_id");
            params.set("filter[header_id][_eq]", String(headerId));
            const rows = await fetchDirectus<DirectusList<{ request_id?: number | string | null }>>(
                `${mustBase()}/items/${collection}?${params.toString()}`,
                { headers: directusHeaders() },
            );

            await Promise.all(
                (rows.data ?? [])
                    .map((line) => pickId(line.request_id))
                    .filter((lineId): lineId is number => Boolean(lineId))
                    .map((lineId) =>
                        fetchDirectus(`${mustBase()}/items/${collection}/${lineId}`, {
                            method: "PATCH",
                            headers: directusHeaders(),
                            body: JSON.stringify({ status: "CANCELLED" }),
                        }),
                    ),
            );
        }),
    );
}

export async function rejectPriceChangeBatch(headerId: number, userId: number, rejectReason: string) {
    const header = await getHeader(headerId);
    if (!header) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    if (String(header.status ?? "") !== "PENDING") {
        return NextResponse.json({ error: "Only PENDING batches can be rejected." }, { status: 400 });
    }

    const normalizedReason = rejectReason.trim();
    const rejectedAt = nowManila();
    const rejectionPatch = {
        status: "REJECTED",
        rejected_by: userId,
        rejected_at: rejectedAt,
        reject_reason: normalizedReason,
    };

    const details = await getDetails(headerId);
    await fetchDirectus(`${mustBase()}/items/${HEADERS}/${headerId}`, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify(rejectionPatch),
    });

    await Promise.all(
        details
            .map((line) => pickId(line.request_id))
            .filter((lineId): lineId is number => Boolean(lineId))
            .map((lineId) =>
                fetchDirectus(`${mustBase()}/items/${DETAILS}/${lineId}`, {
                    method: "PATCH",
                    headers: directusHeaders(),
                    body: JSON.stringify(rejectionPatch),
                }),
            ),
    );

    const persistedHeader = await getHeader(headerId);
    const persistedDetails = await getDetails(headerId);
    const hasPersistedRejection = (row: {
        status?: unknown;
        rejected_by?: unknown;
        rejected_at?: unknown;
        reject_reason?: unknown;
    }) =>
        String(row.status ?? "").toUpperCase() === "REJECTED" &&
        readAuditUserId(row.rejected_by) === userId &&
        Boolean(row.rejected_at) &&
        String(row.reject_reason ?? "") === normalizedReason;

    if (
        !persistedHeader ||
        !hasPersistedRejection(persistedHeader) ||
        persistedDetails.length !== details.length ||
        persistedDetails.some((detail) => !hasPersistedRejection(detail))
    ) {
        throw new Error("Directus did not persist batch rejection metadata.");
    }

    return NextResponse.json({ ok: true, header_id: headerId, rejected: details.length });
}

export async function applyApprovedBatch(headerId: number, userId: number, effectiveAt?: string | null) {
    const header = await getHeader(headerId);
    if (!header) {
        return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const status = String(header.status ?? "");
    if (status !== "PENDING") {
        return NextResponse.json({ error: "Only PENDING batches can be approved." }, { status: 400 });
    }

    const details = await getDetails(headerId);
    if (details.length === 0) {
        return NextResponse.json({ error: "Batch has no detail lines." }, { status: 400 });
    }

    const normalizedDetails = details.map((line) => ({
        requestId: pickId(line.request_id) ?? 0,
        productId: normalizeProductId(line),
        priceTypeId: normalizePriceTypeId(line),
        currentPrice: line.current_price,
        proposedPrice: Number(line.proposed_price),
    }));

    for (const line of normalizedDetails) {
        if (!line.productId || !line.priceTypeId || !isValidPriceValue(line.proposedPrice)) {
            return NextResponse.json({ error: "Batch contains an invalid detail line." }, { status: 400 });
        }
    }

    const conflicts = await findPriceSnapshotConflicts(
        normalizedDetails.map((line) => ({
            request_id: line.requestId,
            product_id: line.productId,
            price_type_id: line.priceTypeId,
            current_price: line.currentPrice,
        })),
    );
    if (conflicts.length > 0) {
        return NextResponse.json(
            {
                error: "Batch contains prices that changed after submission.",
                code: "price_snapshot_conflict",
                conflicts,
            },
            { status: 409 },
        );
    }

    const {
        executeClaimedApplication,
        fallbackApplicationStatus,
        postCommitApplicationNotice,
        refreshBatchApplicationStatus,
        stageBatchApproval,
    } =
        await import("../_applicationEngine");
    const staged = await stageBatchApproval({ detailCollection: DETAILS, headerId, userId, effectiveAt });
    if (!staged) {
        return NextResponse.json({ error: "Batch approval was already claimed or is no longer pending." }, { status: 409 });
    }

    let applied = 0;
    let failed = 0;
    let warning: string | null = null;
    let retryable = false;
    if (!staged.scheduled) {
        try {
            const { applyProposedPrice } = await import("../price-change-requests/_actions");
            const stagedDetails = await getDetails(headerId);
            for (const row of stagedDetails) {
                const outcome = await executeClaimedApplication({
                    collection: DETAILS,
                    row,
                    userId,
                    claimFields: ["current_price"],
                    apply: async (claimed) => {
                        const productId = normalizeProductId(claimed);
                        const priceTypeId = normalizePriceTypeId(claimed);
                        if (!productId || !priceTypeId) {
                            throw new Error("Batch contains an invalid detail line.");
                        }
                        const proposedPrice = assertValidPriceValue(claimed.proposed_price, "proposed_price");
                        await applyProposedPrice({
                            userId,
                            createdBy: readAuditUserId(claimed.requested_by),
                            productId,
                            priceTypeId,
                            currentPrice: claimed.current_price,
                            proposedPrice,
                        });
                    },
                });
                if (outcome.state === "applied") applied += 1;
                if (outcome.state === "failed") failed += 1;
            }
        } catch (error: unknown) {
            const notice = postCommitApplicationNotice(error, "pricing application");
            warning = notice.warning;
            retryable = notice.retryable;
        }
    }

    let applicationStatus: string | null = null;
    try {
        applicationStatus = await refreshBatchApplicationStatus({ detailCollection: DETAILS, headerId, userId });
    } catch (error: unknown) {
        const notice = postCommitApplicationNotice(error, "application status reconciliation");
        warning = warning ?? notice.warning;
        retryable = notice.retryable;
    }
    if (failed > 0) {
        warning = warning ?? "Approval was saved, but one or more pricing lines failed to apply. Retry application from the batch details.";
        retryable = true;
    }
    if (applied > 0) {
        try {
            invalidateGroupIndexCacheOnCatalogChange();
        } catch (error: unknown) {
            const notice = postCommitApplicationNotice(error, "pricing cache refresh");
            warning = warning ?? notice.warning;
            retryable = notice.retryable;
        }
    }

    const affected = normalizedDetails.length;

    return NextResponse.json({
        ok: true,
        committed: true,
        header_id: headerId,
        affected,
        applied,
        failed,
        scheduled: staged.scheduled,
        application_status: applicationStatus ?? fallbackApplicationStatus({ scheduled: staged.scheduled, applied, failed, affected }),
        effective_at: staged.effectiveAt,
        warning,
        retryable,
    }, { status: failed > 0 || retryable ? 202 : 200 });
}

type DirectusProductRow = {
    product_id?: number | string | null;
    parent_id?: number | string | null;
};

export async function getSupplierNameListsByProductId(productIds: number[]): Promise<Map<number, string[]>> {
    const uniqueIds = Array.from(new Set(productIds.filter((id) => Number.isFinite(id) && id > 0)));
    if (uniqueIds.length === 0) return new Map();

    const parentMap = new Map<number, number | null>();
    const groupIds = new Set<number>();
    for (let i = 0; i < uniqueIds.length; i += 200) {
        const chunk = uniqueIds.slice(i, i + 200);
        const p = new URLSearchParams();
        p.set("limit", "-1");
        p.set("fields", "product_id,parent_id");
        p.set("filter[product_id][_in]", chunk.join(","));
        const url = `${mustBase()}/items/${PRODUCTS}?${p.toString()}`;
        const json = await fetchDirectus<DirectusList<DirectusProductRow>>(url, { headers: directusHeaders() });
        for (const row of json.data ?? []) {
            const pid = pickId(row.product_id);
            const parentId = pickId(row.parent_id);
            if (!pid) continue;
            parentMap.set(pid, parentId);
            groupIds.add(parentId ?? pid);
        }
    }

    for (const id of uniqueIds) {
        if (!parentMap.has(id)) parentMap.set(id, null);
        groupIds.add(parentMap.get(id) ?? id);
    }

    const productIdsByGroupId = new Map<number, Set<number>>();
    for (const groupId of groupIds) {
        productIdsByGroupId.set(groupId, new Set([groupId]));
    }
    for (const id of uniqueIds) {
        const groupId = parentMap.get(id) ?? id;
        const set = productIdsByGroupId.get(groupId) ?? new Set([groupId]);
        set.add(id);
        productIdsByGroupId.set(groupId, set);
    }

    const groupIdList = Array.from(groupIds);
    for (let i = 0; i < groupIdList.length; i += 200) {
        const chunk = groupIdList.slice(i, i + 200);
        const p = new URLSearchParams();
        p.set("limit", "-1");
        p.set("fields", "product_id,parent_id");
        p.set("filter[parent_id][_in]", chunk.join(","));
        const url = `${mustBase()}/items/${PRODUCTS}?${p.toString()}`;
        const json = await fetchDirectus<DirectusList<DirectusProductRow>>(url, { headers: directusHeaders() });
        for (const row of json.data ?? []) {
            const pid = pickId(row.product_id);
            const parentId = pickId(row.parent_id);
            if (!pid || !parentId) continue;
            const set = productIdsByGroupId.get(parentId) ?? new Set([parentId]);
            set.add(pid);
            productIdsByGroupId.set(parentId, set);
        }
    }

    const allProductIds = Array.from(
        new Set([
            ...uniqueIds,
            ...groupIdList,
            ...Array.from(productIdsByGroupId.values()).flatMap((ids) => Array.from(ids)),
        ]),
    );

    const supplierLabels = new Map<number, Set<string>>();
    for (let i = 0; i < allProductIds.length; i += 200) {
        const chunk = allProductIds.slice(i, i + 200);
        const p = new URLSearchParams();
        p.set("limit", "-1");
        p.set(
            "fields",
            "product_id,supplier_id,supplier_id.id,supplier_id.supplier_name,supplier_id.supplier_shortcut,supplier_id.isActive,supplier_id.nonBuy",
        );
        p.set("filter[product_id][_in]", chunk.join(","));
        p.set("filter[supplier_id][isActive][_eq]", "1");
        p.set("filter[supplier_id][nonBuy][_eq]", "0");
        const url = `${mustBase()}/items/product_per_supplier?${p.toString()}`;
        const json = await fetchDirectus<DirectusList<Record<string, unknown>>>(url, { headers: directusHeaders() });

        for (const row of json.data ?? []) {
            const pid = pickId(row.product_id);
            if (!pid) continue;
            const supplier = row.supplier_id;
            if (!isRecord(supplier)) continue;
            const shortcut = String(supplier.supplier_shortcut ?? "").trim();
            const name = String(supplier.supplier_name ?? "").trim();
            const label = shortcut && name ? `${shortcut} - ${name}` : name || shortcut || `Supplier #${String(supplier.id ?? "")}`;
            const set = supplierLabels.get(pid) ?? new Set<string>();
            set.add(label);
            supplierLabels.set(pid, set);
        }
    }

    const groupSupplierLabels = new Map<number, Set<string>>();
    for (const [groupId, ids] of productIdsByGroupId) {
        const labels = new Set<string>();
        for (const id of ids) {
            for (const label of supplierLabels.get(id) ?? []) {
                labels.add(label);
            }
        }
        if (labels.size > 0) groupSupplierLabels.set(groupId, labels);
    }

    const collapse = (set: Set<string> | undefined): string[] | null => {
        if (!set || set.size === 0) return null;
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    };

    const resolve = (productId: number): string[] | null => {
        const groupId = parentMap.get(productId) ?? productId;
        return collapse(groupSupplierLabels.get(groupId))
            ?? collapse(supplierLabels.get(productId))
            ?? collapse(supplierLabels.get(groupId));
    };

    const result = new Map<number, string[]>();
    for (const id of uniqueIds) {
        const labels = resolve(id);
        if (labels) result.set(id, labels);
    }
    return result;
}

export async function getSupplierNamesByProductId(productIds: number[]): Promise<Map<number, string>> {
    const supplierLists = await getSupplierNameListsByProductId(productIds);
    const result = new Map<number, string>();
    for (const [productId, supplierNames] of supplierLists) {
        if (supplierNames.length > 0) result.set(productId, supplierNames.join(", "));
    }
    return result;
}

type DirectusUserRow = DirectusUserRelation;

const USER_LOOKUP_FIELDS = [
    "user_id",
    "user_fname",
    "user_mname",
    "user_lname",
    "suffix_name",
    "nickname",
    "user_email",
].join(",");

function formatUserDisplayName(user: DirectusUserRow): string {
    const fullName = [
        user.user_fname,
        user.user_mname,
        user.user_lname,
        user.suffix_name,
    ]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    if (fullName) return fullName;

    const nickname = String(user.nickname ?? "").trim();
    if (nickname) return nickname;

    const email = String(user.user_email ?? "").trim();
    if (email) return email;

    return "";
}

export function normalizeStoredUserId(value: unknown): number | null {
    if (isRecord(value)) {
        return pickId(value.user_id) ?? pickId(value.id);
    }
    return pickId(value);
}

function userNameFromRelationValue(value: unknown): string | null {
    if (!isRecord(value)) return null;
    const displayName = formatUserDisplayName(value as DirectusUserRow);
    return displayName || null;
}

async function fetchUsersByLookupField(
    field: "user_id" | "id",
    ids: number[],
    into: Map<number, string>,
    remaining: Set<number>,
): Promise<void> {
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const params = new URLSearchParams();
        params.set("limit", String(Math.max(100, chunk.length)));
        params.set("fields", USER_LOOKUP_FIELDS);
        params.set(`filter[${field}][_in]`, chunk.join(","));

        const url = `${mustBase()}/items/user?${params.toString()}`;
        const json = await fetchDirectus<DirectusList<DirectusUserRow>>(url, { headers: directusHeaders() });

        for (const user of json.data ?? []) {
            const lookupId = field === "user_id" ? Number(user.user_id) : Number(user.id);
            if (!Number.isFinite(lookupId) || lookupId <= 0 || !remaining.has(lookupId)) continue;

            const displayName = formatUserDisplayName(user);
            if (!displayName) continue;

            into.set(lookupId, displayName);
            remaining.delete(lookupId);
        }
    }
}

export async function fetchUserNamesById(
    userIds: Array<number | string | null | undefined>,
): Promise<Map<number, string>> {
    const ids = Array.from(
        new Set(
            userIds
                .map((value) => normalizeStoredUserId(value))
                .filter((value): value is number => value !== null),
        ),
    );
    const userNames = new Map<number, string>();
    if (ids.length === 0) return userNames;

    const remaining = new Set(ids);

    // Query by user_id only; the "id" field is not accessible to the Directus token.
    // If this lookup fails, return whatever names were already resolved — partial
    // success is better than wiping results on a fallback failure.
    try {
        await fetchUsersByLookupField("user_id", ids, userNames, remaining);
    } catch {
        // Return partial results if the batch lookup fails.
        return userNames;
    }

    return userNames;
}

export function resolveUserDisplayName(
    userId: number | string | null | undefined,
    namesById: Map<number, string>,
): string | null {
    const id = normalizeStoredUserId(userId);
    if (id === null) return null;
    return namesById.get(id) ?? null;
}

export async function resolveBatchDecisionUserNames(header: {
    requested_by?: number | string | DirectusUserRelation | null;
    approved_by?: number | string | DirectusUserRelation | null;
    rejected_by?: number | string | DirectusUserRelation | null;
}): Promise<{
    requested_by_name: string | null;
    approved_by_name: string | null;
    rejected_by_name: string | null;
}> {
    const requestedFromRelation = userNameFromRelationValue(header.requested_by);
    const approvedFromRelation = userNameFromRelationValue(header.approved_by);
    const rejectedFromRelation = userNameFromRelationValue(header.rejected_by);

    const namesById = await fetchUserNamesById([
        normalizeStoredUserId(header.requested_by),
        normalizeStoredUserId(header.approved_by),
        normalizeStoredUserId(header.rejected_by),
    ]);

    return {
        requested_by_name:
            requestedFromRelation ??
            resolveUserDisplayName(normalizeStoredUserId(header.requested_by), namesById),
        approved_by_name:
            approvedFromRelation ??
            resolveUserDisplayName(normalizeStoredUserId(header.approved_by), namesById),
        rejected_by_name:
            rejectedFromRelation ??
            resolveUserDisplayName(normalizeStoredUserId(header.rejected_by), namesById),
    };
}
