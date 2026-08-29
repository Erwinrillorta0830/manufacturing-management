import { cookies } from "next/headers";
import { z } from "zod";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const LOT_TRANSFER_COLLECTION = process.env.MANUFACTURING_LOT_TRANSFER_COLLECTION || "mm_lot_transfers";
export const LOT_TRANSFER_SOURCE_OUT_TYPE = "Lot Transfer Source OUT";
export const LOT_TRANSFER_TARGET_IN_TYPE = "Lot Transfer Target IN";
export const LOT_TRANSFER_EPSILON = 0.000001;

export const LOT_TRANSFER_STATUSES = ["Draft", "For Approval", "Approved", "Rejected"] as const;
export type LotTransferStatus = (typeof LOT_TRANSFER_STATUSES)[number];

type RecordValue = Record<string, unknown>;

export class LotTransferError extends Error {
    constructor(
        readonly statusCode: number,
        message: string,
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "LotTransferError";
    }
}

export interface LotTransferInput {
    branchId: number;
    productId: number;
    sourceLotId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetLotId: number;
    targetInventoryLotId: number;
    targetBatchNo: string;
    quantity: number;
    reason: string;
}

export interface LotTransferPatchInput {
    branchId?: number;
    productId?: number;
    sourceLotId?: number;
    sourceInventoryLotId?: number;
    sourceBatchNo?: string;
    targetLotId?: number;
    targetInventoryLotId?: number;
    targetBatchNo?: string;
    quantity?: number;
    reason?: string;
}

export interface LotTransferRecord {
    id: number;
    requestNo: string;
    status: LotTransferStatus;
    branchId: number;
    productId: number;
    sourceLotId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetLotId: number;
    targetInventoryLotId: number;
    targetBatchNo: string;
    quantity: number;
    reason: string;
    requestedBy: number | null;
    requestedByName: string | null;
    requestedAt: string | null;
    submittedAt: string | null;
    approvedBy: number | null;
    approvedByName: string | null;
    approvedAt: string | null;
    rejectedBy: number | null;
    rejectedByName: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    qaEvidence: string | null;
    effectiveExpiryDate: string | null;
    sourceUnitCost: number | null;
    targetUnitCost: number | null;
    sourceMovementId: number | null;
    targetMovementId: number | null;
    sourceBalanceBefore: number | null;
    sourceBalanceAfter: number | null;
    targetBalanceBefore: number | null;
    targetBalanceAfter: number | null;
    idempotencyKey: string | null;
    postingStartedAt: string | null;
    reconciliationRequired: boolean;
    postingError: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface ValidationCheck {
    key: string;
    label: string;
    passed: boolean;
    message: string;
}

export interface LotBalanceSnapshot {
    lotId: number;
    inventoryLotId: number;
    batchNo: string;
    onHandBefore: number;
    reservedQuantity: number;
    availableQuantity: number;
    onHandAfter: number;
    unitCost: number | null;
    expiryDate: string | null;
    manufacturingDate: string | null;
}

export interface LotTransferPreview {
    transferId: number;
    requestNo: string;
    canApprove: boolean;
    checks: ValidationCheck[];
    source: LotBalanceSnapshot;
    target: LotBalanceSnapshot;
    sourceLotCapacity: number | null;
    sourceLotOccupiedBefore: number;
    targetLotCapacity: number | null;
    targetLotOccupiedBefore: number;
    targetLotCapacityRemaining: number | null;
    effectiveExpiryDate: string | null;
    allergenProfiles: {
        source: string[] | null;
        target: string[] | null;
    };
    movementPreview: {
        sourceQuantity: number;
        targetQuantity: number;
        sourceLotId: number;
        sourceInventoryLotId: number;
        sourceBatchNo: string;
        targetLotId: number;
        targetInventoryLotId: number;
        targetBatchNo: string;
    };
}

const positiveInteger = z.coerce.number().int().positive();
const positiveQuantity = z.coerce.number().refine(
    (value) => Number.isFinite(value) && value > 0,
    "Quantity must be greater than zero."
);

const lotTransferInputSchema = z.object({
    branchId: positiveInteger,
    productId: positiveInteger,
    sourceLotId: positiveInteger,
    sourceInventoryLotId: positiveInteger,
    sourceBatchNo: z.string().trim().min(1).max(150),
    targetLotId: positiveInteger,
    targetInventoryLotId: positiveInteger,
    targetBatchNo: z.string().trim().min(1).max(150),
    quantity: positiveQuantity,
    reason: z.string().trim().min(1, "A transfer reason is required.").max(2000)
}).strict();

const lotTransferPatchSchema = lotTransferInputSchema.partial().strict();

const rejectionSchema = z.object({
    rejectionReason: z.string().trim().min(1, "A rejection reason is required.").max(2000),
    qaEvidence: z.string().trim().max(5000).optional()
}).strict();

const approvalSchema = z.object({
    idempotencyKey: z.string().trim().min(8).max(150)
}).strict();

export function parseLotTransferInput(body: unknown): LotTransferInput {
    const result = lotTransferInputSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "Invalid lot-transfer request.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parseLotTransferPatch(body: unknown): LotTransferPatchInput {
    const result = lotTransferPatchSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "Invalid lot-transfer update.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parseRejection(body: unknown): { rejectionReason: string; qaEvidence?: string } {
    const result = rejectionSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "A rejection reason is required.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

export function parseApproval(body: unknown): { idempotencyKey: string } {
    const result = approvalSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "A unique approval operation key is required.", result.error.flatten().fieldErrors);
    }
    return result.data;
}

function isRecord(value: unknown): value is RecordValue {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numeric(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumeric(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value).trim();
}

function nullableString(value: unknown): string | null {
    const result = stringValue(value);
    return result || null;
}

function relationId(value: unknown, preferredKeys: string[] = []): number {
    if (typeof value === "number" || typeof value === "string") return numeric(value);
    if (!isRecord(value)) return 0;
    for (const key of [...preferredKeys, "id"]) {
        const candidate = numeric(value[key]);
        if (candidate > 0) return candidate;
    }
    return 0;
}

function relationName(value: unknown, keys: string[]): string | null {
    if (!isRecord(value)) return null;
    for (const key of keys) {
        const name = nullableString(value[key]);
        if (name) return name;
    }
    return null;
}

function errorMessage(payload: unknown, fallback: string): string {
    if (!isRecord(payload)) return fallback;
    const errors = payload.errors;
    if (Array.isArray(errors)) {
        const first = errors.find(isRecord);
        const message = first ? nullableString(first.message) : null;
        if (message) return message;
    }
    return nullableString(payload.message) || nullableString(payload.error) || fallback;
}

function mapUpstreamStatus(status: number): number {
    if (status === 404) return 404;
    if (status === 409) return 409;
    if (status === 400) return 400;
    if (status === 403 || status === 401) return 503;
    return 502;
}

async function directusRequest(path: string, init: RequestInit = {}, action: string): Promise<unknown> {
    if (!DIRECTUS_URL) throw new LotTransferError(503, "Manufacturing Directus is not configured.");

    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, {
            ...init,
            headers: {
                ...headers,
                ...(init.headers || {})
            },
            cache: "no-store"
        });
    } catch (error) {
        throw new LotTransferError(503, `${action} could not reach Directus.`, {
            cause: error instanceof Error ? error.message : String(error)
        });
    }

    const text = await response.text().catch(() => "");
    let payload: unknown = {};
    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = { message: text };
    }

    if (!response.ok) {
        throw new LotTransferError(
            mapUpstreamStatus(response.status),
            `${action} failed: ${errorMessage(payload, `Directus returned ${response.status}`)}`,
            { upstreamStatus: response.status }
        );
    }
    return payload;
}

async function directusRows(path: string, action: string): Promise<RecordValue[]> {
    const payload = await directusRequest(path, {}, action);
    if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
    return payload.data.filter(isRecord);
}

async function directusItem(path: string, action: string): Promise<RecordValue> {
    const payload = await directusRequest(path, {}, action);
    if (!isRecord(payload) || !isRecord(payload.data)) {
        throw new LotTransferError(502, `${action} returned an invalid Directus response.`);
    }
    return payload.data;
}

async function mutateDirectus(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, action: string): Promise<RecordValue | null> {
    const payload = await directusRequest(path, {
        method,
        body: method === "DELETE" ? undefined : JSON.stringify(body)
    }, action);
    if (!isRecord(payload) || payload.data === undefined || payload.data === null) return null;
    return isRecord(payload.data) ? payload.data : null;
}

async function readById(collections: string[], id: number, action: string): Promise<RecordValue> {
    let notFound = true;
    for (const collection of collections) {
        try {
            return await directusItem(`/items/${collection}/${encodeURIComponent(String(id))}?fields=*`, action);
        } catch (error) {
            if (error instanceof LotTransferError && error.statusCode === 404) continue;
            notFound = false;
            throw error;
        }
    }
    if (notFound) throw new LotTransferError(404, `${action} was not found.`);
    throw new LotTransferError(404, `${action} was not found.`);
}

interface InventoryLotLookup {
    row: RecordValue;
    collection: string;
}

async function readInventoryLot(id: number, action: string): Promise<InventoryLotLookup> {
    const queryPaths = [
        { collection: "mm_inventory_lots", path: `/items/mm_inventory_lots?filter[inventory_lot_id][_eq]=${id}&limit=1&fields=*` },
        { collection: "mm_inventory_lots", path: `/items/mm_inventory_lots?filter[id][_eq]=${id}&limit=1&fields=*` },
        { collection: "inventory_lots", path: `/items/inventory_lots?filter[inventory_lot_id][_eq]=${id}&limit=1&fields=*` },
        { collection: "inventory_lots", path: `/items/inventory_lots?filter[id][_eq]=${id}&limit=1&fields=*` }
    ];

    let lastError: unknown = null;
    for (const query of queryPaths) {
        try {
            const rows = await directusRows(query.path, action);
            if (rows[0]) return { row: rows[0], collection: query.collection };
        } catch (error) {
            lastError = error;
            if (!(error instanceof LotTransferError) || ![400, 404].includes(error.statusCode)) throw error;
        }
    }
    if (lastError instanceof LotTransferError && lastError.statusCode === 503) throw lastError;
    throw new LotTransferError(404, `${action} was not found.`);
}

async function readProduct(id: number): Promise<RecordValue> {
    const expandedPath = `/items/products/${encodeURIComponent(String(id))}?fields=*,allergens.*,product_allergens.*`;
    try {
        return await directusItem(expandedPath, "Product lookup");
    } catch (error) {
        if (!(error instanceof LotTransferError) || error.statusCode !== 400) throw error;
        return directusItem(`/items/products/${encodeURIComponent(String(id))}?fields=*`, "Product lookup");
    }
}

function firstValue(row: RecordValue, keys: string[]): unknown {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return undefined;
}

function rowId(row: RecordValue, keys: string[]): number {
    return relationId(firstValue(row, keys), keys);
}

function inventoryLotId(row: RecordValue): number {
    return rowId(row, ["inventory_lot_id", "id"]);
}

function lotId(row: RecordValue): number {
    return relationId(row.lot_id, ["lot_id"]) || numeric(row.lot_id);
}

function productId(row: RecordValue): number {
    return relationId(row.product_id, ["product_id"]) || numeric(row.product_id);
}

function branchId(row: RecordValue): number {
    return relationId(row.branch_id, ["branch_id"]) || numeric(row.branch_id);
}

function unitId(row: RecordValue): number {
    return relationId(firstValue(row, ["unit_id", "uom_id", "unit_of_measurement"]), ["unit_id", "uom_id", "id"]);
}

function normalizeStatus(value: unknown): string {
    return stringValue(value).toUpperCase().replace(/[_-]+/g, " ");
}

function dateValue(row: RecordValue, keys: string[]): string | null {
    return nullableString(firstValue(row, keys));
}

function dateOnly(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function validDate(value: string | null): boolean {
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

function earliestDate(...values: Array<string | null>): string | null {
    const dates = values.map(dateOnly).filter((value): value is string => Boolean(value));
    if (dates.length === 0) return null;
    return dates.sort()[0];
}

function extractAllergenToken(value: unknown): string[] {
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

function allergenProfile(row: RecordValue): { available: boolean; values: string[] } {
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

function profilesEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function movementQuantity(row: RecordValue): number {
    const value = Number(row.quantity);
    return Number.isFinite(value) ? value : 0;
}

function sumMovementQuantities(rows: RecordValue[]): number {
    return rows.reduce((sum, row) => sum + movementQuantity(row), 0);
}

function movementFilter(filters: Record<string, unknown>): string {
    const params = new URLSearchParams({
        filter: JSON.stringify(filters),
        fields: "movement_id,product_id,branch_id,lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id,source_document_id,source_document_no",
        limit: "-1"
    });
    return params.toString();
}

function excludeExactTransferMovement(rows: RecordValue[], excludeTransfer?: { id: number; requestNo: string }): RecordValue[] {
    if (!excludeTransfer) return rows;
    return rows.filter((row) => !(numeric(row.source_document_id) === excludeTransfer.id && stringValue(row.source_document_no) === excludeTransfer.requestNo));
}

async function movementsForBatch(input: { productId: number; branchId: number; lotId: number; batchNo: string }, excludeTransfer?: { id: number; requestNo: string }): Promise<RecordValue[]> {
    const filters: Record<string, unknown>[] = [
        { product_id: { _eq: input.productId } },
        { branch_id: { _eq: input.branchId } },
        { lot_id: { _eq: input.lotId } },
        { batch_no: { _eq: input.batchNo } }
    ];
    const rows = await directusRows(
        `/items/inventory_movements?${movementFilter({
            _and: filters
        })}`,
        "Source inventory movement lookup"
    );
    return excludeExactTransferMovement(rows, excludeTransfer);
}

async function movementsForLot(input: { productId: number; branchId: number; lotId: number }, excludeTransfer?: { id: number; requestNo: string }): Promise<RecordValue[]> {
    const filters: Record<string, unknown>[] = [
        { product_id: { _eq: input.productId } },
        { branch_id: { _eq: input.branchId } },
        { lot_id: { _eq: input.lotId } }
    ];
    const rows = await directusRows(
        `/items/inventory_movements?${movementFilter({
            _and: filters
        })}`,
        "Lot inventory movement lookup"
    );
    return excludeExactTransferMovement(rows, excludeTransfer);
}

async function reservedQuantityForInventoryLot(inventoryLotIdValue: number): Promise<number> {
    const params = new URLSearchParams({
        "filter[status][_eq]": "Reserved",
        "filter[inventory_lot_id][_eq]": String(inventoryLotIdValue),
        fields: "quantity",
        limit: "-1"
    });
    try {
        const rows = await directusRows(`/items/sales_invoice_reservation?${params.toString()}`, "Inventory reservation lookup");
        return Math.max(0, rows.reduce((sum, row) => sum + Math.max(0, numeric(row.quantity)), 0));
    } catch (error) {
        if (error instanceof LotTransferError && error.statusCode === 404) return 0;
        throw error;
    }
}

async function resolveMovementType(typeName: string, direction: "IN" | "OUT"): Promise<number> {
    const params = new URLSearchParams({
        "filter[type_name][_eq]": typeName,
        "filter[direction][_eq]": direction,
        fields: "transaction_type_id,type_name,direction",
        limit: "-1"
    });
    const rows = await directusRows(`/items/inventory_transaction_types?${params.toString()}`, "Inventory transaction type lookup");
    const ids = [...new Set(rows.map((row) => relationId(row.transaction_type_id, ["transaction_type_id"]) || numeric(row.transaction_type_id)).filter((id) => id > 0))];
    if (ids.length !== 1) {
        throw new LotTransferError(503, `${typeName} (${direction}) is not configured uniquely.`, { matches: ids.length });
    }
    return ids[0];
}

function transferId(row: RecordValue): number {
    return rowId(row, ["lot_transfer_id", "id"]);
}

function mapTransferRow(row: RecordValue): LotTransferRecord {
    const statusValue = stringValue(row.status);
    const status = (LOT_TRANSFER_STATUSES as readonly string[]).includes(statusValue)
        ? statusValue as LotTransferStatus
        : "Draft";
    const requestedByValue = row.requested_by;
    const approvedByValue = row.approved_by;
    const rejectedByValue = row.rejected_by;

    return {
        id: transferId(row),
        requestNo: stringValue(row.request_no) || `LTR-${transferId(row)}`,
        status,
        branchId: numeric(row.branch_id),
        productId: numeric(row.product_id),
        sourceLotId: numeric(row.source_lot_id),
        sourceInventoryLotId: numeric(row.source_inventory_lot_id),
        sourceBatchNo: stringValue(row.source_batch_no),
        targetLotId: numeric(row.target_lot_id),
        targetInventoryLotId: numeric(row.target_inventory_lot_id),
        targetBatchNo: stringValue(row.target_batch_no),
        quantity: numeric(row.quantity),
        reason: stringValue(row.reason),
        requestedBy: relationId(requestedByValue, ["user_id"]),
        requestedByName: relationName(requestedByValue, ["name", "user_name", "user_fname", "email"]),
        requestedAt: nullableString(row.requested_at),
        submittedAt: nullableString(row.submitted_at),
        approvedBy: relationId(approvedByValue, ["user_id"]),
        approvedByName: relationName(approvedByValue, ["name", "user_name", "user_fname", "email"]),
        approvedAt: nullableString(row.approved_at),
        rejectedBy: relationId(rejectedByValue, ["user_id"]),
        rejectedByName: relationName(rejectedByValue, ["name", "user_name", "user_fname", "email"]),
        rejectedAt: nullableString(row.rejected_at),
        rejectionReason: nullableString(row.rejection_reason),
        qaEvidence: nullableString(row.qa_evidence),
        effectiveExpiryDate: nullableString(row.effective_expiry_date),
        sourceUnitCost: nullableNumeric(row.source_unit_cost),
        targetUnitCost: nullableNumeric(row.target_unit_cost),
        sourceMovementId: nullableNumeric(row.source_movement_id),
        targetMovementId: nullableNumeric(row.target_movement_id),
        sourceBalanceBefore: nullableNumeric(row.source_balance_before),
        sourceBalanceAfter: nullableNumeric(row.source_balance_after),
        targetBalanceBefore: nullableNumeric(row.target_balance_before),
        targetBalanceAfter: nullableNumeric(row.target_balance_after),
        idempotencyKey: nullableString(row.idempotency_key),
        postingStartedAt: nullableString(row.posting_started_at),
        reconciliationRequired: row.reconciliation_required === true || numeric(row.reconciliation_required) === 1,
        postingError: nullableString(row.posting_error),
        createdAt: nullableString(row.created_at),
        updatedAt: nullableString(row.updated_at)
    };
}

function transferPayload(input: LotTransferInput, actorUserId: number | null, requestNo: string): RecordValue {
    return {
        request_no: requestNo,
        status: "Draft",
        branch_id: input.branchId,
        product_id: input.productId,
        source_lot_id: input.sourceLotId,
        source_inventory_lot_id: input.sourceInventoryLotId,
        source_batch_no: input.sourceBatchNo,
        target_lot_id: input.targetLotId,
        target_inventory_lot_id: input.targetInventoryLotId,
        target_batch_no: input.targetBatchNo,
        quantity: input.quantity,
        reason: input.reason,
        requested_by: actorUserId,
        requested_at: new Date().toISOString(),
        reconciliation_required: false
    };
}

function patchPayload(input: LotTransferPatchInput): RecordValue {
    const result: RecordValue = {};
    const mappings: Array<[keyof LotTransferPatchInput, string]> = [
        ["branchId", "branch_id"],
        ["productId", "product_id"],
        ["sourceLotId", "source_lot_id"],
        ["sourceInventoryLotId", "source_inventory_lot_id"],
        ["sourceBatchNo", "source_batch_no"],
        ["targetLotId", "target_lot_id"],
        ["targetInventoryLotId", "target_inventory_lot_id"],
        ["targetBatchNo", "target_batch_no"],
        ["quantity", "quantity"],
        ["reason", "reason"]
    ];
    for (const [key, mappedKey] of mappings) {
        if (input[key] !== undefined) result[mappedKey] = input[key];
    }
    result.updated_at = new Date().toISOString();
    return result;
}

function generateRequestNo(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `LTR-${stamp}-${suffix}`;
}

export async function getSessionUserId(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (!token) return null;
        const parts = token.split(".");
        if (parts.length < 2) return null;
        let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (encoded.length % 4) encoded += "=";
        const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as RecordValue;
        for (const key of ["id", "user_id", "userId", "sub"]) {
            const id = numeric(payload[key]);
            if (id > 0) return id;
        }
    } catch {
        // Requests without a numeric Spring user ID remain attributable as System.
    }
    return null;
}

export async function listLotTransfers(options: {
    status?: string | null;
    branchId?: number | null;
    search?: string | null;
    limit?: number;
    offset?: number;
}): Promise<{ data: LotTransferRecord[]; totalCount: number }> {
    const params = new URLSearchParams({
        fields: "*",
        limit: String(Math.min(500, Math.max(1, options.limit || 200))),
        offset: String(Math.max(0, options.offset || 0)),
        meta: "filter_count",
        sort: "-requested_at,-lot_transfer_id"
    });
    if (options.status && (LOT_TRANSFER_STATUSES as readonly string[]).includes(options.status)) {
        params.set("filter[status][_eq]", options.status);
    }
    if (options.branchId && options.branchId > 0) params.set("filter[branch_id][_eq]", String(options.branchId));
    if (options.search?.trim()) params.set("search", options.search.trim());

    const payload = await directusRequest(`/items/${LOT_TRANSFER_COLLECTION}?${params.toString()}`, {}, "Lot-transfer list lookup");
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new LotTransferError(502, "Lot-transfer list returned an invalid Directus response.");
    }
    const meta = isRecord(payload.meta) ? numeric(payload.meta.filter_count) : payload.data.length;
    return {
        data: payload.data.filter(isRecord).map(mapTransferRow),
        totalCount: meta || payload.data.length
    };
}

export async function getLotTransfer(id: number): Promise<LotTransferRecord> {
    const row = await directusItem(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}?fields=*`, "Lot-transfer lookup");
    return mapTransferRow(row);
}

export async function createLotTransfer(input: LotTransferInput, actorUserId: number | null): Promise<LotTransferRecord> {
    if (input.sourceInventoryLotId === input.targetInventoryLotId) {
        throw new LotTransferError(400, "Source and target inventory lots must be different.");
    }
    const requestNo = generateRequestNo();
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}`,
        "POST",
        transferPayload(input, actorUserId, requestNo),
        "Lot-transfer Draft creation"
    );
    if (!row) throw new LotTransferError(502, "Directus did not return the created lot-transfer request.");
    return mapTransferRow(row);
}

export async function updateLotTransfer(id: number, input: LotTransferPatchInput): Promise<LotTransferRecord> {
    const current = await getLotTransfer(id);
    if (current.status !== "Draft") {
        throw new LotTransferError(409, "Only Draft lot-transfer requests can be edited.");
    }
    const merged = {
        branchId: input.branchId ?? current.branchId,
        productId: input.productId ?? current.productId,
        sourceLotId: input.sourceLotId ?? current.sourceLotId,
        sourceInventoryLotId: input.sourceInventoryLotId ?? current.sourceInventoryLotId,
        sourceBatchNo: input.sourceBatchNo ?? current.sourceBatchNo,
        targetLotId: input.targetLotId ?? current.targetLotId,
        targetInventoryLotId: input.targetInventoryLotId ?? current.targetInventoryLotId,
        targetBatchNo: input.targetBatchNo ?? current.targetBatchNo,
        quantity: input.quantity ?? current.quantity,
        reason: input.reason ?? current.reason
    };
    const normalized = parseLotTransferInput(merged);
    if (normalized.sourceInventoryLotId === normalized.targetInventoryLotId) {
        throw new LotTransferError(400, "Source and target inventory lots must be different.");
    }
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
        "PATCH",
        patchPayload(input),
        "Lot-transfer Draft update"
    );
    if (!row) return getLotTransfer(id);
    return mapTransferRow(row);
}

interface TransferContext {
    record: LotTransferRecord;
    branch: RecordValue;
    sourceLot: RecordValue;
    targetLot: RecordValue;
    sourceInventoryLot: RecordValue;
    targetInventoryLot: RecordValue;
    sourceInventoryLotCollection: string;
    targetInventoryLotCollection: string;
    sourceProduct: RecordValue;
    targetProduct: RecordValue;
    sourceAllergens: { available: boolean; values: string[] };
    targetAllergens: { available: boolean; values: string[] };
    sourceMovements: RecordValue[];
    targetBatchMovements: RecordValue[];
    sourceLotMovements: RecordValue[];
    targetLotMovements: RecordValue[];
    sourceReservedQuantity: number;
    targetReservedQuantity: number;
}

async function loadTransferContext(record: LotTransferRecord, excludeTransferMovements = false): Promise<TransferContext> {
    const [branch, sourceLot, targetLot, sourceInventoryLotLookup, targetInventoryLotLookup, sourceProduct, targetProduct] = await Promise.all([
        readById(["branches"], record.branchId, "Branch lookup"),
        readById(["mm_lots", "lots"], record.sourceLotId, "Source lot lookup"),
        readById(["mm_lots", "lots"], record.targetLotId, "Target lot lookup"),
        readInventoryLot(record.sourceInventoryLotId, "Source inventory lot lookup"),
        readInventoryLot(record.targetInventoryLotId, "Target inventory lot lookup"),
        readProduct(record.productId),
        readProduct(record.productId)
    ]);
    const sourceInventoryLot = sourceInventoryLotLookup.row;
    const targetInventoryLot = targetInventoryLotLookup.row;

    const excludedTransfer = excludeTransferMovements ? { id: record.id, requestNo: record.requestNo } : undefined;
    const [sourceMovements, targetBatchMovements, sourceLotMovements, targetLotMovements, sourceReservedQuantity, targetReservedQuantity] = await Promise.all([
        movementsForBatch({ productId: record.productId, branchId: record.branchId, lotId: record.sourceLotId, batchNo: record.sourceBatchNo }, excludedTransfer),
        movementsForBatch({ productId: record.productId, branchId: record.branchId, lotId: record.targetLotId, batchNo: record.targetBatchNo }, excludedTransfer),
        movementsForLot({ productId: record.productId, branchId: record.branchId, lotId: record.sourceLotId }, excludedTransfer),
        movementsForLot({ productId: record.productId, branchId: record.branchId, lotId: record.targetLotId }, excludedTransfer),
        reservedQuantityForInventoryLot(record.sourceInventoryLotId),
        reservedQuantityForInventoryLot(record.targetInventoryLotId)
    ]);

    return {
        record,
        branch,
        sourceLot,
        targetLot,
        sourceInventoryLot,
        targetInventoryLot,
        sourceInventoryLotCollection: sourceInventoryLotLookup.collection,
        targetInventoryLotCollection: targetInventoryLotLookup.collection,
        sourceProduct,
        targetProduct,
        sourceAllergens: allergenProfile(sourceProduct),
        targetAllergens: allergenProfile(targetProduct),
        sourceMovements,
        targetBatchMovements,
        sourceLotMovements,
        targetLotMovements,
        sourceReservedQuantity,
        targetReservedQuantity
    };
}

function check(key: string, label: string, passed: boolean, message: string): ValidationCheck {
    return { key, label, passed, message };
}

function snapshot(input: {
    lotId: number;
    inventoryLotId: number;
    batchNo: string;
    onHandBefore: number;
    reservedQuantity: number;
    unitCost: number | null;
    expiryDate: string | null;
    manufacturingDate: string | null;
    quantityDelta: number;
}): LotBalanceSnapshot {
    return {
        lotId: input.lotId,
        inventoryLotId: input.inventoryLotId,
        batchNo: input.batchNo,
        onHandBefore: Math.max(0, input.onHandBefore),
        reservedQuantity: Math.max(0, input.reservedQuantity),
        availableQuantity: Math.max(0, input.onHandBefore - input.reservedQuantity),
        onHandAfter: Math.max(0, input.onHandBefore + input.quantityDelta),
        unitCost: input.unitCost,
        expiryDate: input.expiryDate,
        manufacturingDate: input.manufacturingDate
    };
}

export async function buildLotTransferPreview(record: LotTransferRecord, options: { excludeTransferMovements?: boolean } = {}): Promise<LotTransferPreview> {
    const context = await loadTransferContext(record, options.excludeTransferMovements === true);
    const sourceInventoryLotIdValue = inventoryLotId(context.sourceInventoryLot);
    const targetInventoryLotIdValue = inventoryLotId(context.targetInventoryLot);
    const sourceLotIdValue = lotId(context.sourceInventoryLot);
    const targetLotIdValue = lotId(context.targetInventoryLot);
    const sourceProductIdValue = productId(context.sourceInventoryLot);
    const targetProductIdValue = productId(context.targetInventoryLot);
    const sourceBranchIdValue = branchId(context.sourceInventoryLot) || branchId(context.sourceLot);
    const targetBranchIdValue = branchId(context.targetInventoryLot) || branchId(context.targetLot);
    const sourceLotBranchId = branchId(context.sourceLot);
    const targetLotBranchId = branchId(context.targetLot);
    const sourceQuantityBefore = sumMovementQuantities(context.sourceMovements);
    const targetQuantityBefore = sumMovementQuantities(context.targetBatchMovements);
    const sourceLotOccupiedBefore = Math.max(0, sumMovementQuantities(context.sourceLotMovements));
    const targetLotOccupiedBefore = Math.max(0, sumMovementQuantities(context.targetLotMovements));
    const sourceReserved = Math.max(numeric(context.sourceInventoryLot.reserved_quantity), context.sourceReservedQuantity);
    const targetReserved = Math.max(numeric(context.targetInventoryLot.reserved_quantity), context.targetReservedQuantity);
    const sourceExpiry = dateValue(context.sourceInventoryLot, ["expiry_date", "expiration_date", "expiryDate"]);
    const targetExpiry = dateValue(context.targetInventoryLot, ["expiry_date", "expiration_date", "expiryDate"]);
    const sourceMfg = dateValue(context.sourceInventoryLot, ["manufacturing_date", "manufacturingDate"]);
    const targetMfg = dateValue(context.targetInventoryLot, ["manufacturing_date", "manufacturingDate"]);
    const sourceUnitCost = nullableNumeric(firstValue(context.sourceInventoryLot, ["unit_cost", "cost_per_unit", "final_landed_unit_cost"]));
    const targetUnitCost = nullableNumeric(firstValue(context.targetInventoryLot, ["unit_cost", "cost_per_unit", "final_landed_unit_cost"]));
    const sourceCapacity = nullableNumeric(firstValue(context.sourceLot, ["max_batch_capacity", "capacity"]));
    const targetCapacity = nullableNumeric(firstValue(context.targetLot, ["max_batch_capacity", "capacity"]));
    const isSameLot = record.sourceLotId === record.targetLotId;
    const targetOccupiedForCapacity = Math.max(0, targetLotOccupiedBefore - (isSameLot ? record.quantity : 0));
    const targetCapacityRemaining = targetCapacity === null ? null : Math.max(0, targetCapacity - targetOccupiedForCapacity);
    const effectiveExpiry = earliestDate(sourceExpiry, targetExpiry);
    const today = new Date().toISOString().slice(0, 10);
    const checks: ValidationCheck[] = [
        check("branch", "Same branch", record.branchId > 0 && sourceBranchIdValue === record.branchId && targetBranchIdValue === record.branchId && sourceLotBranchId === record.branchId && targetLotBranchId === record.branchId, "Source and target records must belong to the requested branch."),
        check("product", "Same product", record.productId > 0 && sourceProductIdValue === record.productId && targetProductIdValue === record.productId, "Source and target batches must belong to the requested product."),
        check("identity", "Exact lot and batch identity", sourceInventoryLotIdValue === record.sourceInventoryLotId && targetInventoryLotIdValue === record.targetInventoryLotId && sourceLotIdValue === record.sourceLotId && targetLotIdValue === record.targetLotId && stringValue(context.sourceInventoryLot.batch_no).toLowerCase() === record.sourceBatchNo.toLowerCase() && stringValue(context.targetInventoryLot.batch_no).toLowerCase() === record.targetBatchNo.toLowerCase(), "The stored lot, inventory-lot, and batch references must match the request."),
        check("active", "Active stock records", normalizeStatus(context.sourceLot.status) === "ACTIVE" && normalizeStatus(context.targetLot.status) === "ACTIVE" && normalizeStatus(context.sourceInventoryLot.status) === "ACTIVE" && normalizeStatus(context.targetInventoryLot.status) === "ACTIVE", "Source and target lots/batches must be active."),
        check("qa", "QA-eligible source", ["GOOD", "PASSED", "PASS", "APPROVED"].includes(normalizeStatus(context.sourceInventoryLot.qa_status)), "Source stock must have a releasable QA status."),
        check("quantity", "Positive quantity", Number.isFinite(record.quantity) && record.quantity > 0, "Transfer quantity must be greater than zero."),
        check("source-availability", "Source availability", Math.max(0, sourceQuantityBefore - sourceReserved) + LOT_TRANSFER_EPSILON >= record.quantity, `Available source quantity is ${Math.max(0, sourceQuantityBefore - sourceReserved)}.`),
        check("target-capacity", "Target capacity", targetCapacityRemaining === null || targetCapacityRemaining + LOT_TRANSFER_EPSILON >= record.quantity, targetCapacityRemaining === null ? "Target lot has no configured capacity limit." : `Remaining target lot capacity is ${targetCapacityRemaining}.`),
        check("uom", "Unit compatibility", unitId(context.sourceInventoryLot) === 0 || unitId(context.targetInventoryLot) === 0 || unitId(context.sourceInventoryLot) === unitId(context.targetInventoryLot), "Source and target batches must use compatible units."),
        check("allergen", "Allergen profile match", context.sourceAllergens.available && context.targetAllergens.available && profilesEqual(context.sourceAllergens.values, context.targetAllergens.values), context.sourceAllergens.available && context.targetAllergens.available ? "Source and target allergen profiles match." : "Allergen profiles are unavailable; QA approval is blocked."),
        check("dates", "Valid manufacturing and expiry dates", validDate(sourceMfg) && validDate(targetMfg) && validDate(sourceExpiry) && validDate(targetExpiry) && (!effectiveExpiry || dateOnly(effectiveExpiry)! >= today) && (!sourceMfg || !sourceExpiry || dateOnly(sourceMfg)! <= dateOnly(sourceExpiry)!) && (!targetMfg || !targetExpiry || dateOnly(targetMfg)! <= dateOnly(targetExpiry)!), "Manufacturing and expiry values must be valid, chronological, and not expired."),
        check("different-batch", "Different source and target", record.sourceInventoryLotId !== record.targetInventoryLotId || record.sourceBatchNo.toLowerCase() !== record.targetBatchNo.toLowerCase(), "Source and target must not be the same inventory batch.")
    ];

    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: checks.every((item) => item.passed),
        checks,
        source: snapshot({
            lotId: record.sourceLotId,
            inventoryLotId: record.sourceInventoryLotId,
            batchNo: record.sourceBatchNo,
            onHandBefore: sourceQuantityBefore,
            reservedQuantity: sourceReserved,
            unitCost: sourceUnitCost,
            expiryDate: sourceExpiry,
            manufacturingDate: sourceMfg,
            quantityDelta: -record.quantity
        }),
        target: snapshot({
            lotId: record.targetLotId,
            inventoryLotId: record.targetInventoryLotId,
            batchNo: record.targetBatchNo,
            onHandBefore: targetQuantityBefore,
            reservedQuantity: targetReserved,
            unitCost: targetUnitCost ?? sourceUnitCost,
            expiryDate: targetExpiry,
            manufacturingDate: targetMfg,
            quantityDelta: record.quantity
        }),
        sourceLotCapacity: sourceCapacity,
        sourceLotOccupiedBefore,
        targetLotCapacity: targetCapacity,
        targetLotOccupiedBefore,
        targetLotCapacityRemaining: targetCapacityRemaining,
        effectiveExpiryDate: effectiveExpiry,
        allergenProfiles: {
            source: context.sourceAllergens.available ? context.sourceAllergens.values : null,
            target: context.targetAllergens.available ? context.targetAllergens.values : null
        },
        movementPreview: {
            sourceQuantity: -record.quantity,
            targetQuantity: record.quantity,
            sourceLotId: record.sourceLotId,
            sourceInventoryLotId: record.sourceInventoryLotId,
            sourceBatchNo: record.sourceBatchNo,
            targetLotId: record.targetLotId,
            targetInventoryLotId: record.targetInventoryLotId,
            targetBatchNo: record.targetBatchNo
        }
    };
}

export async function submitLotTransfer(id: number): Promise<LotTransferRecord> {
    const record = await getLotTransfer(id);
    if (record.status !== "Draft") throw new LotTransferError(409, `Only Draft requests can be submitted. Current status: ${record.status}.`);
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
        "PATCH",
        { status: "For Approval", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        "Lot-transfer submission"
    );
    return row ? mapTransferRow(row) : getLotTransfer(id);
}

async function createInventoryMovement(payload: RecordValue): Promise<number> {
    const row = await mutateDirectus("/items/inventory_movements", "POST", payload, "Lot-transfer inventory movement creation");
    const id = row ? relationId(row.movement_id, ["movement_id"]) || relationId(row.id, ["id"]) : 0;
    if (!id) throw new LotTransferError(503, "Directus did not return the created inventory movement ID.");
    return id;
}

async function deleteInventoryMovement(id: number): Promise<void> {
    await mutateDirectus(`/items/inventory_movements/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer movement compensation");
}

async function verifyInventoryMovements(ids: number[]): Promise<RecordValue[]> {
    const params = new URLSearchParams({
        "filter[movement_id][_in]": ids.join(","),
        fields: "movement_id,source_document_id,source_document_no,product_id,branch_id,lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id",
        limit: "-1"
    });
    return directusRows(`/items/inventory_movements?${params.toString()}`, "Lot-transfer movement verification");
}

async function findTransferMovements(transferIdValue: number, requestNo: string): Promise<RecordValue[]> {
    const params = new URLSearchParams({
        "filter[source_document_id][_eq]": String(transferIdValue),
        "filter[source_document_no][_eq]": requestNo,
        fields: "movement_id,source_document_id,source_document_no,product_id,branch_id,lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id",
        limit: "-1"
    });
    return directusRows(`/items/inventory_movements?${params.toString()}`, "Existing lot-transfer movement lookup");
}

function isTransferMovement(row: RecordValue, record: LotTransferRecord, side: "source" | "target"): boolean {
    const expectedQuantity = side === "source" ? -record.quantity : record.quantity;
    return numeric(row.product_id) === record.productId
        && numeric(row.branch_id) === record.branchId
        && numeric(row.lot_id) === (side === "source" ? record.sourceLotId : record.targetLotId)
        && stringValue(row.batch_no).toLowerCase() === (side === "source" ? record.sourceBatchNo : record.targetBatchNo).toLowerCase()
        && Math.abs(movementQuantity(row) - expectedQuantity) <= LOT_TRANSFER_EPSILON;
}

function movementId(row: RecordValue): number {
    return relationId(row.movement_id, ["movement_id"]) || relationId(row.id, ["id"]);
}

interface TargetExpiryUpdate {
    collection: string;
    id: number;
    previousExpiry: string | null;
    nextExpiry: string;
}

async function planTargetExpiryUpdate(record: LotTransferRecord, effectiveExpiry: string | null): Promise<TargetExpiryUpdate | null> {
    if (!effectiveExpiry) return null;
    const lookup = await readInventoryLot(record.targetInventoryLotId, "Target inventory-lot expiry lookup");
    const currentExpiry = dateValue(lookup.row, ["expiry_date", "expiration_date", "expiryDate"]);
    const nextExpiry = dateOnly(effectiveExpiry);
    if (!nextExpiry || dateOnly(currentExpiry) === nextExpiry) return null;
    const id = inventoryLotId(lookup.row);
    if (!id) throw new LotTransferError(503, "The target inventory lot has no durable ID for expiry inheritance.");
    return {
        collection: lookup.collection,
        id,
        previousExpiry: currentExpiry,
        nextExpiry
    };
}

async function applyTargetExpiryUpdate(update: TargetExpiryUpdate): Promise<void> {
    await mutateDirectus(
        `/items/${update.collection}/${encodeURIComponent(String(update.id))}`,
        "PATCH",
        { expiry_date: update.nextExpiry },
        "Target inventory-lot expiry inheritance"
    );
    const verified = await directusItem(
        `/items/${update.collection}/${encodeURIComponent(String(update.id))}?fields=*`,
        "Target inventory-lot expiry verification"
    );
    if (dateOnly(dateValue(verified, ["expiry_date", "expiration_date", "expiryDate"])) !== update.nextExpiry) {
        throw new LotTransferError(503, "The inherited target expiry date could not be verified after update.");
    }
}

async function restoreTargetExpiryUpdate(update: TargetExpiryUpdate): Promise<void> {
    await mutateDirectus(
        `/items/${update.collection}/${encodeURIComponent(String(update.id))}`,
        "PATCH",
        { expiry_date: update.previousExpiry },
        "Target inventory-lot expiry compensation"
    );
    const verified = await directusItem(
        `/items/${update.collection}/${encodeURIComponent(String(update.id))}?fields=*`,
        "Target inventory-lot expiry compensation verification"
    );
    if (dateOnly(dateValue(verified, ["expiry_date", "expiration_date", "expiryDate"])) !== dateOnly(update.previousExpiry)) {
        throw new LotTransferError(503, "The target inventory-lot expiry compensation could not be verified.");
    }
}

function storedApprovedPreview(record: LotTransferRecord): LotTransferPreview {
    const sourceBefore = record.sourceBalanceBefore ?? 0;
    const targetBefore = record.targetBalanceBefore ?? 0;
    const sourceAfter = record.sourceBalanceAfter ?? sourceBefore - record.quantity;
    const targetAfter = record.targetBalanceAfter ?? targetBefore + record.quantity;
    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: true,
        checks: [check("posted", "Approved movement pair", true, "The approved source OUT and target IN references are stored on the audit record.")],
        source: {
            ...snapshot({
                lotId: record.sourceLotId,
                inventoryLotId: record.sourceInventoryLotId,
                batchNo: record.sourceBatchNo,
                onHandBefore: sourceBefore,
                reservedQuantity: 0,
                unitCost: record.sourceUnitCost,
                expiryDate: record.effectiveExpiryDate,
                manufacturingDate: null,
                quantityDelta: 0
            }),
            onHandAfter: sourceAfter
        },
        target: {
            ...snapshot({
                lotId: record.targetLotId,
                inventoryLotId: record.targetInventoryLotId,
                batchNo: record.targetBatchNo,
                onHandBefore: targetBefore,
                reservedQuantity: 0,
                unitCost: record.targetUnitCost,
                expiryDate: record.effectiveExpiryDate,
                manufacturingDate: null,
                quantityDelta: 0
            }),
            onHandAfter: targetAfter
        },
        sourceLotCapacity: null,
        sourceLotOccupiedBefore: sourceBefore,
        targetLotCapacity: null,
        targetLotOccupiedBefore: targetBefore,
        targetLotCapacityRemaining: null,
        effectiveExpiryDate: record.effectiveExpiryDate,
        allergenProfiles: { source: null, target: null },
        movementPreview: {
            sourceQuantity: -record.quantity,
            targetQuantity: record.quantity,
            sourceLotId: record.sourceLotId,
            sourceInventoryLotId: record.sourceInventoryLotId,
            sourceBatchNo: record.sourceBatchNo,
            targetLotId: record.targetLotId,
            targetInventoryLotId: record.targetInventoryLotId,
            targetBatchNo: record.targetBatchNo
        }
    };
}

export async function approveLotTransfer(id: number, idempotencyKey: string, actorUserId: number | null): Promise<{ record: LotTransferRecord; preview: LotTransferPreview; idempotent: boolean }> {
    const record = await getLotTransfer(id);
    if (record.status === "Approved") {
        return { record, preview: storedApprovedPreview(record), idempotent: true };
    }
    if (record.status !== "For Approval") {
        throw new LotTransferError(409, `Only For Approval requests can be approved. Current status: ${record.status}.`);
    }
    if (record.postingStartedAt && record.idempotencyKey && record.idempotencyKey !== idempotencyKey) {
        throw new LotTransferError(409, "Another approval operation is already in progress for this request.");
    }

    let claimOwned = false;
    let reconciliationRequired = false;
    const createdMovementIds: number[] = [];
    let sourceMovementId = 0;
    let targetMovementId = 0;
    let preview: LotTransferPreview | null = null;
    let targetExpiryUpdate: TargetExpiryUpdate | null = null;

    try {
        const startedAt = new Date().toISOString();
        await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
            "PATCH",
            { idempotency_key: idempotencyKey, posting_started_at: startedAt, posting_error: null, reconciliation_required: false, updated_at: startedAt },
            "Lot-transfer approval claim"
        );

        const claimedRecord = await getLotTransfer(id);
        if (claimedRecord.status === "Approved") {
            return { record: claimedRecord, preview: storedApprovedPreview(claimedRecord), idempotent: true };
        }
        if (claimedRecord.idempotencyKey !== idempotencyKey) {
            throw new LotTransferError(409, "Another approval operation is already in progress for this request.");
        }
        claimOwned = true;

        const existingMovements = await findTransferMovements(id, claimedRecord.requestNo);
        const sourceMatches = existingMovements.filter((row) => isTransferMovement(row, claimedRecord, "source"));
        const targetMatches = existingMovements.filter((row) => isTransferMovement(row, claimedRecord, "target"));
        if (sourceMatches.length > 1 || targetMatches.length > 1) {
            reconciliationRequired = true;
            throw new LotTransferError(503, "More than one movement exists for a lot-transfer side; reconciliation is required.");
        }

        if (sourceMatches.length === 1 && targetMatches.length === 1) {
            const sourceExistingId = movementId(sourceMatches[0]);
            const targetExistingId = movementId(targetMatches[0]);
            if (!sourceExistingId || !targetExistingId) {
                reconciliationRequired = true;
                throw new LotTransferError(503, "Existing lot-transfer movements have no durable IDs; reconciliation is required.");
            }
            preview = await buildLotTransferPreview(claimedRecord, { excludeTransferMovements: true });
            targetExpiryUpdate = await planTargetExpiryUpdate(claimedRecord, preview.effectiveExpiryDate);
            if (targetExpiryUpdate) await applyTargetExpiryUpdate(targetExpiryUpdate);
            const approvedAt = new Date().toISOString();
            const persisted = await mutateDirectus(
                `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
                "PATCH",
                {
                    status: "Approved",
                    approved_by: actorUserId || 1,
                    approved_at: approvedAt,
                    effective_expiry_date: preview.effectiveExpiryDate,
                    source_unit_cost: preview.source.unitCost,
                    target_unit_cost: preview.target.unitCost,
                    source_movement_id: sourceExistingId,
                    target_movement_id: targetExistingId,
                    source_balance_before: preview.source.onHandBefore,
                    source_balance_after: preview.source.onHandAfter,
                    target_balance_before: preview.target.onHandBefore,
                    target_balance_after: preview.target.onHandAfter,
                    posting_started_at: null,
                    reconciliation_required: false,
                    posting_error: null,
                    updated_at: approvedAt
                },
                "Lot-transfer recovered approval finalization"
            );
            const finalRecord = persisted ? mapTransferRow(persisted) : await getLotTransfer(id);
            if (finalRecord.status !== "Approved" || finalRecord.sourceMovementId !== sourceExistingId || finalRecord.targetMovementId !== targetExistingId) {
                reconciliationRequired = true;
                throw new LotTransferError(503, "Recovered lot-transfer movements could not be durably finalized.");
            }
            return { record: finalRecord, preview, idempotent: true };
        }

        if (existingMovements.length > 0) {
            reconciliationRequired = true;
            for (const existingMovement of existingMovements) {
                const existingId = movementId(existingMovement);
                if (existingId) await deleteInventoryMovement(existingId);
            }
            const remaining = await findTransferMovements(id, claimedRecord.requestNo);
            if (remaining.length > 0) throw new LotTransferError(503, "A partial lot-transfer movement could not be removed; reconciliation is required.");
            reconciliationRequired = false;
        }

        preview = await buildLotTransferPreview(claimedRecord);
        if (!preview.canApprove) {
            throw new LotTransferError(409, "The lot-transfer request failed the required QA checks.", {
                failedChecks: preview.checks.filter((item) => !item.passed)
            });
        }

        const sourceTypeId = await resolveMovementType(LOT_TRANSFER_SOURCE_OUT_TYPE, "OUT");
        const targetTypeId = await resolveMovementType(LOT_TRANSFER_TARGET_IN_TYPE, "IN");
        const actor = actorUserId || 1;
        const movementRemarks = `Lot transfer ${claimedRecord.requestNo}: ${claimedRecord.sourceBatchNo} -> ${claimedRecord.targetBatchNo}`.slice(0, 255);
        const common = {
            product_id: claimedRecord.productId,
            branch_id: claimedRecord.branchId,
            source_document_id: claimedRecord.id,
            source_document_no: claimedRecord.requestNo,
            version_id: null,
            created_by: actor,
            remarks: movementRemarks
        };
        const sourceMovementPayload = {
            ...common,
            lot_id: claimedRecord.sourceLotId,
            transaction_type_id: sourceTypeId,
            batch_no: claimedRecord.sourceBatchNo,
            expiry_date: preview.source.expiryDate,
            manufacturing_date: preview.source.manufacturingDate,
            quantity: -claimedRecord.quantity
        };
        const targetMovementPayload = {
            ...common,
            lot_id: claimedRecord.targetLotId,
            transaction_type_id: targetTypeId,
            batch_no: claimedRecord.targetBatchNo,
            expiry_date: preview.effectiveExpiryDate,
            manufacturing_date: preview.target.manufacturingDate,
            quantity: claimedRecord.quantity
        };
        sourceMovementId = await createInventoryMovement(sourceMovementPayload);
        createdMovementIds.push(sourceMovementId);
        targetMovementId = await createInventoryMovement(targetMovementPayload);
        createdMovementIds.push(targetMovementId);
        const verified = await verifyInventoryMovements([sourceMovementId, targetMovementId]);
        const verifiedIds = new Set(verified.map((row) => relationId(row.movement_id, ["movement_id"]) || relationId(row.id, ["id"])));
        if (!verifiedIds.has(sourceMovementId) || !verifiedIds.has(targetMovementId)) {
            throw new LotTransferError(503, "Paired lot-transfer movements could not be verified after insertion.");
        }

        targetExpiryUpdate = await planTargetExpiryUpdate(claimedRecord, preview.effectiveExpiryDate);
        if (targetExpiryUpdate) await applyTargetExpiryUpdate(targetExpiryUpdate);

        const approvedAt = new Date().toISOString();
        const persisted = await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
            "PATCH",
            {
                status: "Approved",
                approved_by: actor,
                approved_at: approvedAt,
                effective_expiry_date: preview.effectiveExpiryDate,
                source_unit_cost: preview.source.unitCost,
                target_unit_cost: preview.target.unitCost,
                source_movement_id: sourceMovementId,
                target_movement_id: targetMovementId,
                source_balance_before: preview.source.onHandBefore,
                source_balance_after: preview.source.onHandAfter,
                target_balance_before: preview.target.onHandBefore,
                target_balance_after: preview.target.onHandAfter,
                posting_started_at: null,
                idempotency_key: idempotencyKey,
                reconciliation_required: false,
                posting_error: null,
                updated_at: approvedAt
            },
            "Lot-transfer approval finalization"
        );
        const finalRecord = persisted ? mapTransferRow(persisted) : await getLotTransfer(id);
        if (finalRecord.status !== "Approved" || finalRecord.sourceMovementId !== sourceMovementId || finalRecord.targetMovementId !== targetMovementId) {
            throw new LotTransferError(503, "Lot-transfer approval was not durably finalized.");
        }
        return { record: finalRecord, preview, idempotent: false };
    } catch (error) {
        const compensationFailures: string[] = [];
        if (targetExpiryUpdate) {
            try {
                await restoreTargetExpiryUpdate(targetExpiryUpdate);
            } catch (compensationError) {
                compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
            }
        }
        for (const movementId of [...createdMovementIds].reverse()) {
            try {
                await deleteInventoryMovement(movementId);
            } catch (compensationError) {
                compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
            }
        }
        const errorText = error instanceof Error ? error.message : "Unknown lot-transfer approval failure";
        if (claimOwned) {
            await mutateDirectus(
                `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
                "PATCH",
                {
                    posting_started_at: null,
                    posting_error: errorText,
                    reconciliation_required: reconciliationRequired || compensationFailures.length > 0,
                    updated_at: new Date().toISOString()
                },
                "Lot-transfer approval failure audit"
            ).catch(() => undefined);
        }
        if (reconciliationRequired || compensationFailures.length > 0) {
            throw new LotTransferError(503, "Lot-transfer posting failed and requires reconciliation.", { compensationFailures });
        }
        throw error;
    }
}

export async function rejectLotTransfer(id: number, rejectionReason: string, qaEvidence: string | undefined, actorUserId: number | null): Promise<LotTransferRecord> {
    const record = await getLotTransfer(id);
    if (record.status !== "For Approval") {
        throw new LotTransferError(409, `Only For Approval requests can be rejected. Current status: ${record.status}.`);
    }
    const rejectedAt = new Date().toISOString();
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
        "PATCH",
        {
            status: "Rejected",
            rejected_by: actorUserId || 1,
            rejected_at: rejectedAt,
            rejection_reason: rejectionReason,
            qa_evidence: qaEvidence || null,
            posting_started_at: null,
            updated_at: rejectedAt
        },
        "Lot-transfer rejection"
    );
    return row ? mapTransferRow(row) : getLotTransfer(id);
}

export function failedPreviewChecks(preview: LotTransferPreview): ValidationCheck[] {
    return preview.checks.filter((item) => !item.passed);
}
