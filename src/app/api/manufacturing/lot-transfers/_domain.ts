import { cookies } from "next/headers";
import { z } from "zod";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const LOT_TRANSFER_COLLECTION = process.env.MANUFACTURING_LOT_TRANSFER_COLLECTION || "mm_lot_transfers";
export const LOT_TRANSFER_SOURCE_OUT_TYPE = "LOT_TRANSFER_OUT";
export const LOT_TRANSFER_TARGET_IN_TYPE = "LOT_TRANSFER_IN";
export const LOT_TRANSFER_EPSILON = 0.000001;
const MM_LOT_COLLECTION = "mm_lots";
const MM_INVENTORY_LOT_COLLECTION = "mm_inventory_lots";
const MM_LOT_CANONICAL_REFERENCE_CODE = "MM_LOT_CANONICAL_REFERENCE_REQUIRED";
const LOT_TRANSFER_SAME_LOT_CODE = "LOT_TRANSFER_SAME_LOT_NOT_ALLOWED";

export const LOT_TRANSFER_STATUSES = ["Draft", "Submitted", "Approved", "Posted", "Rejected"] as const;
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
    sourceLotId: number;
    targetLotId: number;
    reason: string;
    details: LotTransferDetailInput[];
}

export interface LotTransferDetailInput {
    detailId?: number;
    lineNo?: number;
    productId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetInventoryLotId: number;
    targetBatchNo: string;
    quantity: number;
    lineRemarks?: string;
}

export interface LotTransferPatchInput {
    branchId?: number;
    sourceLotId?: number;
    targetLotId?: number;
    reason?: string;
    details?: LotTransferDetailInput[];
    // Flat fields remain accepted temporarily for clients that have not migrated.
    productId?: number;
    sourceInventoryLotId?: number;
    sourceBatchNo?: string;
    targetInventoryLotId?: number;
    targetBatchNo?: string;
    quantity?: number;
}

export interface LotTransferDetail {
    detailId: number | null;
    lineNo: number;
    productId: number;
    sourceInventoryLotId: number;
    sourceBatchNo: string;
    targetInventoryLotId: number;
    targetBatchNo: string;
    quantity: number;
    lineRemarks: string;
    sourceManufacturingDate: string | null;
    sourceExpiryDate: string | null;
    targetManufacturingDate: string | null;
    targetExpiryDate: string | null;
    sourceUnitCost: number | null;
    targetUnitCost: number | null;
    sourceBalanceBefore: number | null;
    sourceBalanceAfter: number | null;
    targetBalanceBefore: number | null;
    targetBalanceAfter: number | null;
    sourceMovementId: number | null;
    targetMovementId: number | null;
    validationStatus: string | null;
    validationError: string | null;
    postingError: string | null;
    reconciliationRequired: boolean;
}

export interface LotTransferRecord {
    id: number;
    requestNo: string;
    status: LotTransferStatus;
    branchId: number;
    productId: number;
    unitId: number | null;
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
    transferDate: string | null;
    submittedBy: number | null;
    submittedAt: string | null;
    approvedBy: number | null;
    approvedByName: string | null;
    approvedAt: string | null;
    postedBy: number | null;
    postedByName: string | null;
    postedAt: string | null;
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
    reversalOfId: number | null;
    postingStartedAt: string | null;
    reconciliationRequired: boolean;
    postingError: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    details: LotTransferDetail[];
    lineCount: number;
    totalQuantity: number;
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
    legacyReservedQuantity: number;
    protectedAllocationQuantity: number;
    protectedAllocations: ProtectedAllocation[];
    protectedAllocationResolutionComplete: boolean;
    availableQuantity: number;
    onHandAfter: number;
    unitCost: number | null;
    expiryDate: string | null;
    manufacturingDate: string | null;
}

export type ProtectedAllocationSource =
    | "SALES_ORDER"
    | "SALES_INVOICE"
    | "JOB_ORDER_MATERIAL"
    | "STOCK_TRANSFER"
    | "LOT_TRANSFER";

export interface ProtectedAllocation {
    source: ProtectedAllocationSource;
    allocationId: number;
    quantity: number;
    status: string;
    reference: string | null;
}

export interface LotTransferPreview {
    transferId: number;
    requestNo: string;
    canApprove: boolean;
    canPost: boolean;
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
    linePreviews: LotTransferLinePreview[];
    totalQuantity: number;
}

export interface LotTransferLinePreview {
    detailId: number | null;
    lineNo: number;
    productId: number;
    quantity: number;
    lineRemarks: string;
    checks: ValidationCheck[];
    source: LotBalanceSnapshot;
    target: LotBalanceSnapshot;
    sourceLotCapacity: number | null;
    sourceLotOccupiedBefore: number;
    targetLotCapacity: number | null;
    targetLotOccupiedBefore: number;
    targetLotCapacityRemaining: number | null;
    effectiveExpiryDate: string | null;
    movementPreview: LotTransferPreview["movementPreview"];
}

const positiveInteger = z.coerce.number().int().positive();
const positiveQuantity = z.coerce.number().refine(
    (value) => Number.isFinite(value) && value > 0,
    "Quantity must be greater than zero."
);

const detailInputSchema = z.object({
    detailId: positiveInteger.optional(),
    lineNo: positiveInteger.optional(),
    productId: positiveInteger,
    sourceInventoryLotId: positiveInteger,
    sourceBatchNo: z.string().trim().min(1).max(150),
    targetInventoryLotId: positiveInteger,
    targetBatchNo: z.string().trim().min(1).max(150),
    quantity: positiveQuantity,
    lineRemarks: z.string().trim().max(2000).optional()
}).strict();

const canonicalLotTransferInputSchema = z.object({
    branchId: positiveInteger,
    sourceLotId: positiveInteger,
    targetLotId: positiveInteger,
    reason: z.string().trim().min(1, "A transfer reason is required.").max(2000),
    details: z.array(detailInputSchema).min(1, "At least one transfer detail line is required.")
}).strict();

const legacyLotTransferInputSchema = z.object({
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

const lotTransferInputSchema = z.union([canonicalLotTransferInputSchema, legacyLotTransferInputSchema]).transform((value) => {
    if ("details" in value) return value;
    return {
        branchId: value.branchId,
        sourceLotId: value.sourceLotId,
        targetLotId: value.targetLotId,
        reason: value.reason,
        details: [{
            productId: value.productId,
            sourceInventoryLotId: value.sourceInventoryLotId,
            sourceBatchNo: value.sourceBatchNo,
            targetInventoryLotId: value.targetInventoryLotId,
            targetBatchNo: value.targetBatchNo,
            quantity: value.quantity,
            lineRemarks: ""
        }]
    } satisfies LotTransferInput;
});

const lotTransferPatchSchema = z.object({
    branchId: positiveInteger.optional(),
    sourceLotId: positiveInteger.optional(),
    targetLotId: positiveInteger.optional(),
    reason: z.string().trim().min(1).max(2000).optional(),
    details: z.array(detailInputSchema).min(1).optional(),
    productId: positiveInteger.optional(),
    sourceInventoryLotId: positiveInteger.optional(),
    sourceBatchNo: z.string().trim().min(1).max(150).optional(),
    targetInventoryLotId: positiveInteger.optional(),
    targetBatchNo: z.string().trim().min(1).max(150).optional(),
    quantity: positiveQuantity.optional()
}).strict();

const rejectionSchema = z.object({
    rejectionReason: z.string().trim().min(1, "A rejection reason is required.").max(2000),
    qaEvidence: z.string().trim().max(5000).optional()
}).strict();

const postingSchema = z.object({
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

export function parsePosting(body: unknown): { idempotencyKey: string } {
    const result = postingSchema.safeParse(body);
    if (!result.success) {
        throw new LotTransferError(400, "A unique posting operation key is required.", result.error.flatten().fieldErrors);
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

function formatProtectedAllocationQuantity(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function nullableNumeric(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function positiveCapacity(value: unknown): number | null {
    const parsed = nullableNumeric(value);
    return parsed !== null && parsed > 0 ? parsed : null;
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

function canonicalReferenceError(action: string, collection: string, id: number): LotTransferError {
    return new LotTransferError(
        409,
        `${action} must reference a canonical Manufacturing Management record.`,
        { code: MM_LOT_CANONICAL_REFERENCE_CODE, collection, id }
    );
}

async function readMmLot(id: number, action: string): Promise<RecordValue> {
    const params = new URLSearchParams({
        "filter[lot_id][_eq]": String(id),
        limit: "1",
        fields: "*"
    });
    const rows = await directusRows(`/items/${MM_LOT_COLLECTION}?${params.toString()}`, action);
    if (rows[0]) return rows[0];
    throw canonicalReferenceError(action, MM_LOT_COLLECTION, id);
}

interface InventoryLotLookup {
    row: RecordValue;
    collection: string;
}

async function readInventoryLot(id: number, action: string): Promise<InventoryLotLookup> {
    const queryPaths = [
        `/items/${MM_INVENTORY_LOT_COLLECTION}?filter[inventory_lot_id][_eq]=${id}&limit=1&fields=*`,
        `/items/${MM_INVENTORY_LOT_COLLECTION}?filter[id][_eq]=${id}&limit=1&fields=*`
    ];

    let lastError: unknown = null;
    for (const path of queryPaths) {
        try {
            const rows = await directusRows(path, action);
            if (rows[0]) return { row: rows[0], collection: MM_INVENTORY_LOT_COLLECTION };
        } catch (error) {
            lastError = error;
            if (!(error instanceof LotTransferError) || ![400, 404].includes(error.statusCode)) throw error;
        }
    }
    if (lastError instanceof LotTransferError && lastError.statusCode === 503) throw lastError;
    throw canonicalReferenceError(action, MM_INVENTORY_LOT_COLLECTION, id);
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

interface CanonicalLotTransferReferences {
    sourceLotId: number;
    sourceInventoryLotId: number;
    targetLotId: number;
    targetInventoryLotId: number;
}

interface CanonicalLotTransferResolution {
    sourceLot: RecordValue;
    targetLot: RecordValue;
}

function assertDifferentLotIds(sourceLotId: number, targetLotId: number): void {
    if (sourceLotId === targetLotId) {
        throw new LotTransferError(
            400,
            "Source and destination lot IDs must be different.",
            { code: LOT_TRANSFER_SAME_LOT_CODE, sourceLotId, targetLotId }
        );
    }
}

async function assertCanonicalLotReferences(input: CanonicalLotTransferReferences): Promise<CanonicalLotTransferResolution> {
    const [sourceLot, targetLot, sourceInventoryLot, targetInventoryLot] = await Promise.all([
        readMmLot(input.sourceLotId, "Source lot lookup"),
        readMmLot(input.targetLotId, "Target lot lookup"),
        readInventoryLot(input.sourceInventoryLotId, "Source inventory lot lookup"),
        readInventoryLot(input.targetInventoryLotId, "Target inventory lot lookup")
    ]);

    const sourceInventoryLotId = lotId(sourceInventoryLot.row);
    const targetInventoryLotId = lotId(targetInventoryLot.row);
    if (sourceInventoryLotId !== input.sourceLotId || targetInventoryLotId !== input.targetLotId) {
        throw new LotTransferError(
            409,
            "Source and target inventory lots must reference their canonical Manufacturing Management lots.",
            {
                code: MM_LOT_CANONICAL_REFERENCE_CODE,
                sourceLotId: input.sourceLotId,
                sourceInventoryLotId: input.sourceInventoryLotId,
                resolvedSourceLotId: sourceInventoryLotId,
                targetLotId: input.targetLotId,
                targetInventoryLotId: input.targetInventoryLotId,
                resolvedTargetLotId: targetInventoryLotId,
                sourceLotExists: Boolean(sourceLot),
                targetLotExists: Boolean(targetLot)
            }
        );
    }
    return { sourceLot, targetLot };
}

function unitId(row: RecordValue): number | null {
    const resolved = relationId(firstValue(row, ["unit_id"]), ["unit_id", "id"]);
    return resolved > 0 ? resolved : null;
}

function requireMatchingTransferUnitId(resolution: CanonicalLotTransferResolution): number {
    const sourceUnitId = unitId(resolution.sourceLot);
    const targetUnitId = unitId(resolution.targetLot);
    if (sourceUnitId === null || targetUnitId === null || sourceUnitId !== targetUnitId) {
        throw new LotTransferError(
            409,
            "Source and destination lots must have the same valid UOM before a transfer can be saved.",
            { sourceUnitId, targetUnitId }
        );
    }
    return sourceUnitId;
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
        fields: "movement_id,product_id,branch_id,mm_lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id,source_document_id,source_document_no",
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
        { mm_lot_id: { _eq: input.lotId } },
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

async function movementsForLot(input: { branchId: number; lotId: number }, excludeTransfer?: { id: number; requestNo: string }): Promise<RecordValue[]> {
    const filters: Record<string, unknown>[] = [
        { branch_id: { _eq: input.branchId } },
        { mm_lot_id: { _eq: input.lotId } }
    ];
    const rows = await directusRows(
        `/items/inventory_movements?${movementFilter({
            _and: filters
        })}`,
        "Lot inventory movement lookup"
    );
    return excludeExactTransferMovement(rows, excludeTransfer);
}

const ACTIVE_JOB_ORDER_STATUSES = new Set([
    "PLANNED",
    "DRAFT",
    "RELEASED",
    "IN PROGRESS",
    "ONGOING",
    "PROCEED",
    "ON HOLD"
]);
const ACTIVE_STOCK_TRANSFER_STATUS_VALUES = [
    "REQUESTED",
    "FOR_PICKING",
    "PICKING",
    "PICKED",
    "FOR_LOADING"
];
const ACTIVE_STOCK_TRANSFER_STATUSES = new Set(ACTIVE_STOCK_TRANSFER_STATUS_VALUES.map((status) => normalizeStatus(status)));
const ACTIVE_LOT_TRANSFER_STATUS_VALUES = ["Submitted", "Approved"];

interface ProtectedAllocationLookup {
    branchId: number;
    productId: number;
    lotId: number;
    inventoryLotId: number;
    batchNo: string;
    legacyReservedQuantity: number;
    excludeLotTransferId?: number;
}

interface ProtectedAllocationSummary {
    legacyReservedQuantity: number;
    explicitQuantity: number;
    totalQuantity: number;
    allocations: ProtectedAllocation[];
    unresolved: string[];
}

function normalizedBatch(value: unknown): string {
    return stringValue(value).toLowerCase();
}

function activeStatus(value: unknown, statuses: Set<string>): boolean {
    return statuses.has(normalizeStatus(value));
}

function appendProtectedAllocation(
    allocations: ProtectedAllocation[],
    seen: Set<string>,
    input: ProtectedAllocation
): void {
    if (input.allocationId <= 0 || input.quantity <= 0) return;
    const key = `${input.source}:${input.allocationId}`;
    if (seen.has(key)) return;
    seen.add(key);
    allocations.push(input);
}

function jobOrderStatus(row: RecordValue, statusByMaterialId: Map<number, string>): string {
    const material = firstValue(row, ["jo_material_id"]);
    const jobOrder = isRecord(material) ? firstValue(material, ["job_order_id"]) : null;
    const nestedStatus = isRecord(jobOrder) ? firstValue(jobOrder, ["status"]) : null;
    const materialId = relationId(material, ["jo_material_id"]);
    return stringValue(
        nestedStatus || firstValue(row, ["job_order_status", "jo_material_id.job_order_id.status"]) || statusByMaterialId.get(materialId)
    );
}

async function jobOrderStatusesForReservations(rows: RecordValue[]): Promise<Map<number, string>> {
    const materialIds = [...new Set(rows.map((row) => relationId(firstValue(row, ["jo_material_id"]), ["jo_material_id"])).filter((id) => id > 0))];
    if (materialIds.length === 0) return new Map();

    const materials = await directusRows(
        `/items/manufacturing_job_order_materials?filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_material_id,job_order_id&limit=-1`,
        "Job-order material identity lookup"
    );
    const jobOrderIds = [...new Set(materials.map((row) => relationId(firstValue(row, ["job_order_id"]), ["job_order_id"])).filter((id) => id > 0))];
    if (jobOrderIds.length === 0) return new Map();

    const jobOrders = await directusRows(
        `/items/manufacturing_job_orders?filter[job_order_id][_in]=${jobOrderIds.join(",")}&fields=job_order_id,status&limit=-1`,
        "Job-order status lookup"
    );
    const statusByJobOrderId = new Map(
        jobOrders.map((row) => [relationId(firstValue(row, ["job_order_id"]), ["job_order_id"]), stringValue(row.status)])
    );
    return new Map(
        materials.map((row) => [
            relationId(firstValue(row, ["jo_material_id"]), ["jo_material_id"]),
            statusByJobOrderId.get(relationId(firstValue(row, ["job_order_id"]), ["job_order_id"])) || ""
        ])
    );
}

function stockTransferReference(row: RecordValue, header: RecordValue | undefined): string | null {
    return nullableString(
        firstValue(header || {}, ["order_no"]) ||
        firstValue(row, ["stock_transfer_id", "reference_no"])
    );
}

async function protectedAllocationsForInventoryLot(input: ProtectedAllocationLookup): Promise<ProtectedAllocationSummary> {
    const allocationRows: ProtectedAllocation[] = [];
    const seen = new Set<string>();
    const unresolved: string[] = [];
    const batchKey = normalizedBatch(input.batchNo);

    const reservationFilter = JSON.stringify({
        _and: [
            { inventory_lot_id: { _eq: input.inventoryLotId } },
            { status: { _in: ["Reserved", "Picked"] } }
        ]
    });
    const jobReservationFilter = JSON.stringify({
        _and: [
            { product_id: { _eq: input.productId } },
            { branch_id: { _eq: input.branchId } }
        ]
    });
    const stockDetailFilter = JSON.stringify({
        product_id: { _eq: input.productId }
    });
    const lotTransferFilter = JSON.stringify({
        _and: [
            { source_lot_id: { _eq: input.lotId } },
            { source_inventory_lot_id: { _eq: input.inventoryLotId } },
            { status: { _in: ACTIVE_LOT_TRANSFER_STATUS_VALUES } }
        ]
    });

    const [salesOrderRows, salesInvoiceRows, jobReservationRows, stockDetailRows, lotTransferRows] = await Promise.all([
        directusRows(
            `/items/sales_order_reservation?filter=${encodeURIComponent(reservationFilter)}&fields=reservation_id,reserved_quantity,picked_quantity,status,sales_order_detail_id&limit=-1`,
            "Sales-order protected allocation lookup"
        ),
        directusRows(
            `/items/sales_invoice_reservation?filter=${encodeURIComponent(reservationFilter)}&fields=id,quantity,status,sales_invoice_detail_id&limit=-1`,
            "Sales-invoice protected allocation lookup"
        ),
        directusRows(
            `/items/manufacturing_job_order_materials_reservations?filter=${encodeURIComponent(jobReservationFilter)}&fields=jo_materials_reservation_id,product_id,branch_id,mm_lot_id,batch_no,reserved_quantity,actual_used_quantity,jo_material_id&limit=-1`,
            "Job-order protected allocation lookup"
        ),
        directusRows(
            `/items/mm_stock_transfer_details?filter=${encodeURIComponent(stockDetailFilter)}&fields=id,stock_transfer_id,inventory_lot_id,lot_id,product_id,batch_no,allocated_quantity,picked_quantity,dispatched_quantity,received_quantity&limit=-1`,
            "Stock-transfer protected allocation lookup"
        ),
        directusRows(
            `/items/${LOT_TRANSFER_COLLECTION}?filter=${encodeURIComponent(lotTransferFilter)}&fields=lot_transfer_id,request_no,status,source_lot_id,source_inventory_lot_id,source_batch_no,quantity&limit=-1`,
            "Lot-transfer protected allocation lookup"
        )
    ]);
    const statusByMaterialId = await jobOrderStatusesForReservations(jobReservationRows);

    for (const row of salesOrderRows) {
        const allocationId = rowId(row, ["reservation_id", "id"]);
        const quantity = Math.max(numeric(row.reserved_quantity), numeric(row.picked_quantity));
        if (quantity > 0 && allocationId <= 0) {
            unresolved.push("A sales-order allocation has no resolvable reservation identity.");
            continue;
        }
        appendProtectedAllocation(allocationRows, seen, {
            source: "SALES_ORDER",
            allocationId,
            quantity,
            status: stringValue(row.status),
            reference: nullableString(firstValue(row, ["sales_order_detail_id"]))
        });
    }

    for (const row of salesInvoiceRows) {
        const allocationId = rowId(row, ["id"]);
        const quantity = Math.max(0, numeric(row.quantity));
        if (quantity > 0 && allocationId <= 0) {
            unresolved.push("A sales-invoice allocation has no resolvable reservation identity.");
            continue;
        }
        appendProtectedAllocation(allocationRows, seen, {
            source: "SALES_INVOICE",
            allocationId,
            quantity,
            status: stringValue(row.status),
            reference: nullableString(firstValue(row, ["sales_invoice_detail_id"]))
        });
    }

    for (const row of jobReservationRows) {
        const allocationId = rowId(row, ["jo_materials_reservation_id"]);
        const quantity = Math.max(0, numeric(row.reserved_quantity));
        const status = jobOrderStatus(row, statusByMaterialId);
        if (quantity <= 0) continue;
        if (allocationId <= 0) {
            unresolved.push("A job-order allocation has no resolvable reservation identity.");
            continue;
        }
        if (!status) {
            unresolved.push(`Job-order allocation ${allocationId} has no resolvable job-order status.`);
            continue;
        }
        if (!activeStatus(status, ACTIVE_JOB_ORDER_STATUSES)) continue;

        const rowLotId = relationId(firstValue(row, ["mm_lot_id"]), ["lot_id", "mm_lot_id"]);
        const rowBatch = normalizedBatch(row.batch_no);
        if (rowLotId !== input.lotId || rowBatch !== batchKey) {
            if (rowLotId <= 0 || !rowBatch) {
                unresolved.push(`Job-order allocation ${allocationId} has no exact lot/batch identity.`);
            }
            continue;
        }

        appendProtectedAllocation(allocationRows, seen, {
            source: "JOB_ORDER_MATERIAL",
            allocationId,
            quantity,
            status: status || "Active job order",
            reference: nullableString(firstValue(row, ["jo_material_id"]))
        });
    }

    const stockTransferIds = [...new Set(stockDetailRows.map((row) => rowId(row, ["stock_transfer_id"])).filter((id) => id > 0))];
    const stockTransferHeaders = stockTransferIds.length > 0
        ? await directusRows(
            `/items/mm_stock_transfer?filter[id][_in]=${stockTransferIds.join(",")}&fields=id,order_no,status,source_branch_id&limit=-1`,
            "Stock-transfer header lookup"
        )
        : [];
    const stockHeadersById = new Map(stockTransferHeaders.map((row) => [rowId(row, ["id"]), row]));

    for (const row of stockDetailRows) {
        const detailId = rowId(row, ["id"]);
        const transferId = rowId(row, ["stock_transfer_id"]);
        if (detailId <= 0 || transferId <= 0) {
            unresolved.push("A stock-transfer allocation has no resolvable detail or transfer identity.");
            continue;
        }
        const header = stockHeadersById.get(transferId);
        if (!header) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no resolvable transfer header.`);
            continue;
        }
        if (!stringValue(header.status)) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no resolvable transfer status.`);
            continue;
        }
        if (!activeStatus(header.status, ACTIVE_STOCK_TRANSFER_STATUSES)) continue;
        const headerBranchId = relationId(header.source_branch_id, ["branch_id", "id"]);
        if (headerBranchId <= 0) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no exact source branch identity.`);
            continue;
        }
        if (headerBranchId !== input.branchId) continue;

        const rowProductId = productId(row);
        const rowInventoryLotId = relationId(firstValue(row, ["inventory_lot_id"]), ["inventory_lot_id", "id"]);
        const rowLotId = relationId(firstValue(row, ["lot_id"]), ["lot_id", "id"]);
        const rowBatch = normalizedBatch(row.batch_no);
        const allocated = Math.max(numeric(row.allocated_quantity), numeric(row.picked_quantity));
        const alreadyDispatched = Math.max(numeric(row.dispatched_quantity), numeric(row.received_quantity));
        const quantity = Math.max(0, allocated - alreadyDispatched);
        if (rowProductId !== input.productId || quantity <= 0) continue;

        if (rowInventoryLotId <= 0 || rowLotId <= 0 || !rowBatch) {
            unresolved.push(`Stock-transfer allocation ${detailId} has no exact lot/batch identity.`);
            continue;
        }
        if (rowInventoryLotId !== input.inventoryLotId || rowLotId !== input.lotId || rowBatch !== batchKey) {
            continue;
        }

        appendProtectedAllocation(allocationRows, seen, {
            source: "STOCK_TRANSFER",
            allocationId: detailId,
            quantity,
            status: stringValue(header.status),
            reference: stockTransferReference(row, header)
        });
    }

    for (const row of lotTransferRows) {
        const allocationId = rowId(row, ["lot_transfer_id"]);
        if (allocationId === input.excludeLotTransferId) continue;
        const quantity = Math.max(0, numeric(row.quantity));
        if (quantity <= 0) continue;
        if (allocationId <= 0) {
            unresolved.push("A lot-transfer allocation has no resolvable request identity.");
            continue;
        }
        if (normalizedBatch(row.source_batch_no) !== batchKey) {
            unresolved.push(`Lot-transfer allocation ${allocationId} does not have the exact source batch identity.`);
            continue;
        }
        appendProtectedAllocation(allocationRows, seen, {
            source: "LOT_TRANSFER",
            allocationId,
            quantity,
            status: stringValue(row.status),
            reference: nullableString(firstValue(row, ["request_no"]))
        });
    }

    const explicitQuantity = allocationRows.reduce((sum, allocation) => sum + allocation.quantity, 0);
    const legacyReservedQuantity = Math.max(0, input.legacyReservedQuantity);
    return {
        legacyReservedQuantity,
        explicitQuantity,
        totalQuantity: Math.max(legacyReservedQuantity, explicitQuantity),
        allocations: allocationRows,
        unresolved
    };
}

async function resolveMovementType(typeName: string, direction: "IN" | "OUT"): Promise<number> {
    const params = new URLSearchParams({
        "filter[type_name][_eq]": typeName,
        "filter[direction][_eq]": direction,
        "filter[origin_table][_eq]": LOT_TRANSFER_COLLECTION,
        fields: "transaction_type_id,type_name,direction,origin_table",
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

const LOT_TRANSFER_DETAIL_COLLECTION = process.env.MANUFACTURING_LOT_TRANSFER_DETAIL_COLLECTION || "mm_lot_transfer_details";

function mapTransferDetail(row: RecordValue, fallbackLineNo: number): LotTransferDetail {
    const detailId = rowId(row, ["lot_transfer_detail_id", "id"]);
    return {
        detailId: detailId > 0 ? detailId : null,
        lineNo: numeric(row.line_no) > 0 ? numeric(row.line_no) : fallbackLineNo,
        productId: numeric(row.product_id),
        sourceInventoryLotId: numeric(row.source_inventory_lot_id),
        sourceBatchNo: stringValue(row.source_batch_no),
        targetInventoryLotId: numeric(row.target_inventory_lot_id),
        targetBatchNo: stringValue(row.target_batch_no),
        quantity: numeric(row.quantity),
        lineRemarks: stringValue(row.line_remarks),
        sourceManufacturingDate: nullableString(row.source_manufacturing_date),
        sourceExpiryDate: nullableString(row.source_expiry_date),
        targetManufacturingDate: nullableString(row.target_manufacturing_date),
        targetExpiryDate: nullableString(row.target_expiry_date),
        sourceUnitCost: nullableNumeric(row.source_unit_cost),
        targetUnitCost: nullableNumeric(row.target_unit_cost),
        sourceBalanceBefore: nullableNumeric(row.source_balance_before),
        sourceBalanceAfter: nullableNumeric(row.source_balance_after),
        targetBalanceBefore: nullableNumeric(row.target_balance_before),
        targetBalanceAfter: nullableNumeric(row.target_balance_after),
        sourceMovementId: nullableNumeric(row.source_movement_id),
        targetMovementId: nullableNumeric(row.target_movement_id),
        validationStatus: nullableString(row.validation_status),
        validationError: nullableString(row.validation_error),
        postingError: nullableString(row.posting_error),
        reconciliationRequired: row.reconciliation_required === true || numeric(row.reconciliation_required) === 1
    };
}

function mapTransferRow(row: RecordValue): LotTransferRecord {
    const statusValue = stringValue(row.status);
    const status = (LOT_TRANSFER_STATUSES as readonly string[]).includes(statusValue)
        ? statusValue as LotTransferStatus
        : "Draft";
    const requestedByValue = row.requested_by;
    const approvedByValue = row.approved_by;
    const postedByValue = row.posted_by;
    const rejectedByValue = row.rejected_by;

    return {
        id: transferId(row),
        requestNo: stringValue(row.request_no) || `LTR-${transferId(row)}`,
        status,
        branchId: numeric(row.branch_id),
        productId: numeric(row.product_id),
        unitId: relationId(row.unit_id, ["unit_id", "id"]) || null,
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
        transferDate: nullableString(row.transfer_date),
        submittedBy: relationId(row.submitted_by, ["user_id"]) || null,
        submittedAt: nullableString(row.submitted_at),
        approvedBy: relationId(approvedByValue, ["user_id"]),
        approvedByName: relationName(approvedByValue, ["name", "user_name", "user_fname", "email"]),
        approvedAt: nullableString(row.approved_at),
        postedBy: relationId(postedByValue, ["user_id"]),
        postedByName: relationName(postedByValue, ["name", "user_name", "user_fname", "email"]),
        postedAt: nullableString(row.posted_at),
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
        reversalOfId: relationId(row.reversal_of_id, ["lot_transfer_id", "id"]) || null,
        postingStartedAt: nullableString(row.posting_started_at),
        reconciliationRequired: row.reconciliation_required === true || numeric(row.reconciliation_required) === 1,
        postingError: nullableString(row.posting_error),
        createdAt: nullableString(row.created_at),
        updatedAt: nullableString(row.updated_at),
        details: [],
        lineCount: 0,
        totalQuantity: 0
    };
}

function legacyDetailFromRecord(record: LotTransferRecord): LotTransferDetail {
    return {
        detailId: null,
        lineNo: 1,
        productId: record.productId,
        sourceInventoryLotId: record.sourceInventoryLotId,
        sourceBatchNo: record.sourceBatchNo,
        targetInventoryLotId: record.targetInventoryLotId,
        targetBatchNo: record.targetBatchNo,
        quantity: record.quantity,
        lineRemarks: "",
        sourceManufacturingDate: null,
        sourceExpiryDate: record.effectiveExpiryDate,
        targetManufacturingDate: null,
        targetExpiryDate: record.effectiveExpiryDate,
        sourceUnitCost: record.sourceUnitCost,
        targetUnitCost: record.targetUnitCost,
        sourceBalanceBefore: record.sourceBalanceBefore,
        sourceBalanceAfter: record.sourceBalanceAfter,
        targetBalanceBefore: record.targetBalanceBefore,
        targetBalanceAfter: record.targetBalanceAfter,
        sourceMovementId: record.sourceMovementId,
        targetMovementId: record.targetMovementId,
        validationStatus: null,
        validationError: null,
        postingError: record.postingError,
        reconciliationRequired: record.reconciliationRequired
    };
}

function attachLegacySummary(record: LotTransferRecord, details: LotTransferDetail[]): LotTransferRecord {
    const normalizedDetails = details.length > 0 ? details : [legacyDetailFromRecord(record)];
    const first = normalizedDetails[0];
    const singleLine = normalizedDetails.length === 1 ? first : null;
    return {
        ...record,
        productId: record.productId || first.productId,
        sourceInventoryLotId: record.sourceInventoryLotId || first.sourceInventoryLotId,
        sourceBatchNo: record.sourceBatchNo || first.sourceBatchNo,
        targetInventoryLotId: record.targetInventoryLotId || first.targetInventoryLotId,
        targetBatchNo: record.targetBatchNo || first.targetBatchNo,
        quantity: normalizedDetails.reduce((sum, detail) => sum + detail.quantity, 0),
        sourceMovementId: record.sourceMovementId || singleLine?.sourceMovementId || null,
        targetMovementId: record.targetMovementId || singleLine?.targetMovementId || null,
        details: normalizedDetails,
        lineCount: normalizedDetails.length,
        totalQuantity: normalizedDetails.reduce((sum, detail) => sum + detail.quantity, 0)
    };
}

async function readTransferDetails(transferIdValue: number): Promise<LotTransferDetail[]> {
    const params = new URLSearchParams({
        "filter[lot_transfer_id][_eq]": String(transferIdValue),
        fields: "*",
        sort: "line_no,lot_transfer_detail_id",
        limit: "-1"
    });
    try {
        const rows = await directusRows(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}?${params.toString()}`, "Lot-transfer detail lookup");
        return rows.map((row, index) => mapTransferDetail(row, index + 1));
    } catch (error) {
        // A legacy environment may be read before the migration is applied. In that case,
        // the header remains readable as a synthetic one-line transfer.
        if (error instanceof LotTransferError && [400, 404].includes(error.statusCode)) return [];
        throw error;
    }
}

async function hydrateTransferRecord(record: LotTransferRecord): Promise<LotTransferRecord> {
    return attachLegacySummary(record, await readTransferDetails(record.id));
}

function normalizedDetails(input: LotTransferInput): LotTransferDetailInput[] {
    const lineNumbers = new Set<number>();
    const seen = new Set<string>();
    return input.details.map((detail, index) => {
        const normalized = {
            ...detail,
            lineNo: detail.lineNo || index + 1,
            lineRemarks: detail.lineRemarks?.trim() || ""
        };
        if (lineNumbers.has(normalized.lineNo)) {
            throw new LotTransferError(400, `Transfer detail line ${normalized.lineNo} is duplicated. Each line must have a unique line number.`);
        }
        lineNumbers.add(normalized.lineNo);
        const identity = `${normalized.sourceInventoryLotId}:${normalized.sourceBatchNo.toLowerCase()}->${normalized.targetInventoryLotId}:${normalized.targetBatchNo.toLowerCase()}`;
        if (seen.has(identity)) {
            throw new LotTransferError(400, `Transfer detail line ${normalized.lineNo} duplicates another source/target batch pair.`);
        }
        seen.add(identity);
        return normalized;
    });
}

function detailFromInput(detail: LotTransferDetailInput, index: number): LotTransferDetail {
    return {
        detailId: detail.detailId || null,
        lineNo: detail.lineNo || index + 1,
        productId: detail.productId,
        sourceInventoryLotId: detail.sourceInventoryLotId,
        sourceBatchNo: detail.sourceBatchNo,
        targetInventoryLotId: detail.targetInventoryLotId,
        targetBatchNo: detail.targetBatchNo,
        quantity: detail.quantity,
        lineRemarks: detail.lineRemarks || "",
        sourceManufacturingDate: null,
        sourceExpiryDate: null,
        targetManufacturingDate: null,
        targetExpiryDate: null,
        sourceUnitCost: null,
        targetUnitCost: null,
        sourceBalanceBefore: null,
        sourceBalanceAfter: null,
        targetBalanceBefore: null,
        targetBalanceAfter: null,
        sourceMovementId: null,
        targetMovementId: null,
        validationStatus: null,
        validationError: null,
        postingError: null,
        reconciliationRequired: false
    };
}

function transientRecordFromInput(input: LotTransferInput, transferUnitId: number | null = null): LotTransferRecord {
    const details = normalizedDetails(input).map(detailFromInput);
    const first = details[0];
    return {
        id: 0,
        requestNo: "DRAFT-PREFLIGHT",
        status: "Draft",
        branchId: input.branchId,
        productId: first.productId,
        unitId: transferUnitId,
        sourceLotId: input.sourceLotId,
        sourceInventoryLotId: first.sourceInventoryLotId,
        sourceBatchNo: first.sourceBatchNo,
        targetLotId: input.targetLotId,
        targetInventoryLotId: first.targetInventoryLotId,
        targetBatchNo: first.targetBatchNo,
        quantity: details.reduce((sum, detail) => sum + detail.quantity, 0),
        reason: input.reason,
        requestedBy: null,
        requestedByName: null,
        requestedAt: null,
        transferDate: null,
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        postedBy: null,
        postedByName: null,
        postedAt: null,
        rejectedBy: null,
        rejectedByName: null,
        rejectedAt: null,
        rejectionReason: null,
        qaEvidence: null,
        effectiveExpiryDate: null,
        sourceUnitCost: null,
        targetUnitCost: null,
        sourceMovementId: null,
        targetMovementId: null,
        sourceBalanceBefore: null,
        sourceBalanceAfter: null,
        targetBalanceBefore: null,
        targetBalanceAfter: null,
        idempotencyKey: null,
        reversalOfId: null,
        postingStartedAt: null,
        reconciliationRequired: false,
        postingError: null,
        createdAt: null,
        updatedAt: null,
        details,
        lineCount: details.length,
        totalQuantity: details.reduce((sum, detail) => sum + detail.quantity, 0)
    };
}

function manilaCalendarDate(value = new Date()): string {
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

function transferPayload(input: LotTransferInput, actorUserId: number | null, requestNo: string, transferUnitId: number | null): RecordValue {
    const details = normalizedDetails(input);
    const first = details[0];
    return {
        request_no: requestNo,
        status: "Draft",
        branch_id: input.branchId,
        product_id: details.every((detail) => detail.productId === first.productId) ? first.productId : null,
        unit_id: transferUnitId,
        source_lot_id: input.sourceLotId,
        source_inventory_lot_id: first.sourceInventoryLotId,
        source_batch_no: first.sourceBatchNo,
        target_lot_id: input.targetLotId,
        target_inventory_lot_id: first.targetInventoryLotId,
        target_batch_no: first.targetBatchNo,
        quantity: details.reduce((sum, detail) => sum + detail.quantity, 0),
        reason: input.reason,
        requested_by: actorUserId,
        requested_at: new Date().toISOString(),
        transfer_date: manilaCalendarDate(),
        reconciliation_required: false
    };
}

function patchPayload(input: LotTransferInput, actorUserId: number | null, requestNo: string, transferUnitId: number | null): RecordValue {
    const payload = transferPayload(input, actorUserId, requestNo, transferUnitId);
    delete payload.requested_by;
    delete payload.requested_at;
    delete payload.status;
    delete payload.request_no;
    delete payload.transfer_date;
    return payload;
}

function detailPayload(transferIdValue: number, detail: LotTransferDetailInput | LotTransferDetail, index: number): RecordValue {
    return {
        lot_transfer_id: transferIdValue,
        line_no: detail.lineNo || index + 1,
        product_id: detail.productId,
        source_inventory_lot_id: detail.sourceInventoryLotId,
        source_batch_no: detail.sourceBatchNo,
        target_inventory_lot_id: detail.targetInventoryLotId,
        target_batch_no: detail.targetBatchNo,
        quantity: detail.quantity,
        line_remarks: detail.lineRemarks || null,
        validation_status: null,
        validation_error: null,
        posting_error: null,
        reconciliation_required: false
    };
}

async function createTransferDetail(transferIdValue: number, detail: LotTransferDetailInput | LotTransferDetail, index: number): Promise<RecordValue> {
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_DETAIL_COLLECTION}`,
        "POST",
        detailPayload(transferIdValue, detail, index),
        "Lot-transfer detail creation"
    );
    if (!row) throw new LotTransferError(502, "Directus did not return the created lot-transfer detail.");
    return row;
}

async function deleteTransferDetail(id: number): Promise<void> {
    await mutateDirectus(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer detail deletion");
}

async function replaceTransferDetails(transferIdValue: number, details: LotTransferDetailInput[] | LotTransferDetail[], previousRows: RecordValue[] = []): Promise<void> {
    const existing = previousRows.length > 0 ? previousRows : await directusRows(
        `/items/${LOT_TRANSFER_DETAIL_COLLECTION}?filter[lot_transfer_id][_eq]=${transferIdValue}&fields=*&limit=-1`,
        "Existing lot-transfer detail lookup"
    );
    const createdIds: number[] = [];
    try {
        for (const row of existing) {
            const id = rowId(row, ["lot_transfer_detail_id", "id"]);
            if (id > 0) await deleteTransferDetail(id);
        }
        for (let index = 0; index < details.length; index += 1) {
            const row = await createTransferDetail(transferIdValue, details[index], index);
            const id = rowId(row, ["lot_transfer_detail_id", "id"]);
            if (id > 0) createdIds.push(id);
        }
    } catch (error) {
        for (const id of createdIds.reverse()) await deleteTransferDetail(id).catch(() => undefined);
        for (let index = 0; index < existing.length; index += 1) {
            await createTransferDetail(transferIdValue, {
                ...mapTransferDetail(existing[index], index + 1),
                lineNo: numeric(existing[index].line_no) || index + 1
            }, index).catch(() => undefined);
        }
        throw error;
    }
}

async function readRawTransferDetails(transferIdValue: number): Promise<RecordValue[]> {
    try {
        return await directusRows(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}?filter[lot_transfer_id][_eq]=${transferIdValue}&fields=*&sort=line_no&limit=-1`, "Lot-transfer detail lookup");
    } catch (error) {
        if (error instanceof LotTransferError && [400, 404].includes(error.statusCode)) return [];
        throw error;
    }
}

function generateRequestNo(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `LTR-${stamp}-${suffix}`;
}

export async function getSessionUserId(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value || cookieStore.get("springboot_token")?.value;
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

export async function getSessionUserBranchId(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value || cookieStore.get("springboot_token")?.value;
        if (!token) return null;
        const parts = token.split(".");
        if (parts.length < 2) return null;
        let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (encoded.length % 4) encoded += "=";
        const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as RecordValue;
        for (const key of ["branch_id", "branchId", "branch"]) {
            const id = numeric(payload[key]);
            if (id > 0) return id;
        }
    } catch {
        // Requests without a branch-scoped session may use the explicit report branch filter.
    }
    return null;
}

function requireSessionUserId(userId: number | null, action: string): number {
    if (!userId || userId <= 0) {
        throw new LotTransferError(401, `An authenticated user is required to ${action}.`);
    }
    return userId;
}

function validDateFilter(value: string, label: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new LotTransferError(400, `${label} filters must use YYYY-MM-DD.`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcMidnight = Date.UTC(year, month - 1, day);
    const canonicalDate = new Date(utcMidnight).toISOString().slice(0, 10);
    if (canonicalDate !== value) throw new LotTransferError(400, `${label} ${value} is invalid.`);
    return value;
}

function requestedDateBoundary(value: string, endExclusive = false): string {
    const canonicalDate = validDateFilter(value, "Requested date");
    const year = Number(canonicalDate.slice(0, 4));
    const month = Number(canonicalDate.slice(5, 7));
    const day = Number(canonicalDate.slice(8, 10));
    const utcMidnight = Date.UTC(year, month - 1, day);
    const boundary = utcMidnight + (endExclusive ? 24 * 60 * 60 * 1000 : 0) - (8 * 60 * 60 * 1000);
    return new Date(boundary).toISOString();
}

export async function listLotTransfers(options: {
    status?: string | string[] | null;
    branchId?: number | null;
    search?: string | null;
    requestedFrom?: string | null;
    requestedTo?: string | null;
    transferDateFrom?: string | null;
    transferDateTo?: string | null;
    productId?: number | null;
    sourceLotId?: number | null;
    targetLotId?: number | null;
    sourceBatchNo?: string | null;
    targetBatchNo?: string | null;
    requestedBy?: number | null;
    approvedBy?: number | null;
    postedBy?: number | null;
    limit?: number;
    offset?: number;
}): Promise<{ data: LotTransferRecord[]; totalCount: number }> {
    const lineFilterActive = Boolean(
        (options.productId && options.productId > 0)
        || options.sourceBatchNo?.trim()
        || options.targetBatchNo?.trim()
        || options.search?.trim()
    );
    const params = new URLSearchParams({
        fields: "*",
        limit: String(lineFilterActive ? 500 : Math.min(500, Math.max(1, options.limit || 200))),
        offset: String(lineFilterActive ? 0 : Math.max(0, options.offset || 0)),
        meta: "filter_count",
        sort: "-transfer_date,-requested_at,-lot_transfer_id"
    });
    const statuses = Array.isArray(options.status)
        ? options.status
        : options.status
            ? options.status.split(",").map((status) => status.trim()).filter(Boolean)
            : [];
    if (statuses.length > 0) {
        params.set("filter[status][_in]", statuses.join(","));
    }
    if (options.branchId && options.branchId > 0) params.set("filter[branch_id][_eq]", String(options.branchId));
    if (options.search?.trim() && !lineFilterActive) params.set("search", options.search.trim());
    if (options.requestedFrom) params.set("filter[requested_at][_gte]", requestedDateBoundary(options.requestedFrom));
    if (options.requestedTo) params.set("filter[requested_at][_lt]", requestedDateBoundary(options.requestedTo, true));
    if (options.requestedFrom && options.requestedTo && requestedDateBoundary(options.requestedFrom) > requestedDateBoundary(options.requestedTo, true)) {
        throw new LotTransferError(400, "Requested date range is invalid: the start date must be on or before the end date.");
    }
    const transferDateFrom = options.transferDateFrom ? validDateFilter(options.transferDateFrom, "Transfer date") : null;
    const transferDateTo = options.transferDateTo ? validDateFilter(options.transferDateTo, "Transfer date") : null;
    if (transferDateFrom && transferDateTo && transferDateFrom > transferDateTo) {
        throw new LotTransferError(400, "Transfer date range is invalid: the start date must be on or before the end date.");
    }
    if (transferDateFrom) params.set("filter[transfer_date][_gte]", transferDateFrom);
    if (transferDateTo) params.set("filter[transfer_date][_lte]", transferDateTo);
    if (options.productId && options.productId > 0 && !lineFilterActive) params.set("filter[product_id][_eq]", String(options.productId));
    if (options.sourceLotId && options.sourceLotId > 0) params.set("filter[source_lot_id][_eq]", String(options.sourceLotId));
    if (options.targetLotId && options.targetLotId > 0) params.set("filter[target_lot_id][_eq]", String(options.targetLotId));
    if (options.sourceBatchNo?.trim() && !lineFilterActive) params.set("filter[source_batch_no][_icontains]", options.sourceBatchNo.trim());
    if (options.targetBatchNo?.trim() && !lineFilterActive) params.set("filter[target_batch_no][_icontains]", options.targetBatchNo.trim());
    if (options.requestedBy && options.requestedBy > 0) params.set("filter[requested_by][_eq]", String(options.requestedBy));
    if (options.approvedBy && options.approvedBy > 0) params.set("filter[approved_by][_eq]", String(options.approvedBy));
    if (options.postedBy && options.postedBy > 0) params.set("filter[posted_by][_eq]", String(options.postedBy));

    const payload = await directusRequest(`/items/${LOT_TRANSFER_COLLECTION}?${params.toString()}`, {}, "Lot-transfer list lookup");
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new LotTransferError(502, "Lot-transfer list returned an invalid Directus response.");
    }
    const meta = isRecord(payload.meta) ? numeric(payload.meta.filter_count) : payload.data.length;
    const records = await Promise.all(payload.data.filter(isRecord).map(async (row) => hydrateTransferRecord(mapTransferRow(row))));
    const searchText = options.search?.trim().toLowerCase() || "";
    const filteredRecords = lineFilterActive
        ? records.filter((record) => {
            const detailMatches = record.details.some((detail) => {
                const productMatches = !options.productId || detail.productId === options.productId;
                const sourceBatchMatches = !options.sourceBatchNo?.trim() || detail.sourceBatchNo.toLowerCase().includes(options.sourceBatchNo.trim().toLowerCase());
                const targetBatchMatches = !options.targetBatchNo?.trim() || detail.targetBatchNo.toLowerCase().includes(options.targetBatchNo.trim().toLowerCase());
                return productMatches && sourceBatchMatches && targetBatchMatches;
            });
            const searchMatches = !searchText || [
                record.requestNo,
                record.reason,
                ...record.details.flatMap((detail) => [detail.sourceBatchNo, detail.targetBatchNo, String(detail.productId)])
            ].some((value) => value.toLowerCase().includes(searchText));
            return detailMatches && searchMatches;
        })
        : records;
    const pagedRecords = lineFilterActive
        ? filteredRecords.slice(Math.max(0, options.offset || 0), Math.max(0, options.offset || 0) + Math.min(500, Math.max(1, options.limit || 200)))
        : filteredRecords;
    return {
        data: pagedRecords,
        totalCount: lineFilterActive ? filteredRecords.length : meta || payload.data.length
    };
}

export async function getLotTransfer(id: number): Promise<LotTransferRecord> {
    const row = await directusItem(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}?fields=*`, "Lot-transfer lookup");
    return hydrateTransferRecord(mapTransferRow(row));
}

export async function createLotTransfer(input: LotTransferInput, actorUserId: number | null): Promise<LotTransferRecord> {
    assertDifferentLotIds(input.sourceLotId, input.targetLotId);
    const details = normalizedDetails(input);
    const canonicalReferences = await Promise.all(details.map(async (detail) => {
        if (detail.sourceInventoryLotId === detail.targetInventoryLotId) {
            throw new LotTransferError(400, `Detail line ${detail.lineNo} must use different source and target inventory lots.`);
        }
        const canonical = await assertCanonicalLotReferences({
            sourceLotId: input.sourceLotId,
            sourceInventoryLotId: detail.sourceInventoryLotId,
            targetLotId: input.targetLotId,
            targetInventoryLotId: detail.targetInventoryLotId
        });
        return requireMatchingTransferUnitId(canonical);
    }));
    const transferUnitId = canonicalReferences.every((unit) => unit === canonicalReferences[0]) ? canonicalReferences[0] : null;
    const requestNo = generateRequestNo();
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}`,
        "POST",
        transferPayload({ ...input, details }, actorUserId, requestNo, transferUnitId),
        "Lot-transfer Draft creation"
    );
    if (!row) throw new LotTransferError(502, "Directus did not return the created lot-transfer request.");
    const id = transferId(row);
    if (!id) throw new LotTransferError(502, "Directus did not return the created lot-transfer request ID.");
    try {
        await replaceTransferDetails(id, details);
    } catch (error) {
        await mutateDirectus(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer orphaned Draft compensation").catch(() => undefined);
        throw error;
    }
    return getLotTransfer(id);
}

export async function updateLotTransfer(id: number, input: LotTransferPatchInput): Promise<LotTransferRecord> {
    const current = await getLotTransfer(id);
    if (current.status !== "Draft") {
        throw new LotTransferError(409, "Only Draft lot-transfer requests can be edited.");
    }
    const currentDetails = current.details.length > 0 ? current.details : [legacyDetailFromRecord(current)];
    const fallbackDetails: LotTransferDetailInput[] = currentDetails.map((detail) => ({
        detailId: detail.detailId || undefined,
        lineNo: detail.lineNo,
        productId: detail.productId,
        sourceInventoryLotId: detail.sourceInventoryLotId,
        sourceBatchNo: detail.sourceBatchNo,
        targetInventoryLotId: detail.targetInventoryLotId,
        targetBatchNo: detail.targetBatchNo,
        quantity: detail.quantity,
        lineRemarks: detail.lineRemarks
    }));
    const normalized: LotTransferInput = {
        branchId: input.branchId ?? current.branchId,
        sourceLotId: input.sourceLotId ?? current.sourceLotId,
        targetLotId: input.targetLotId ?? current.targetLotId,
        reason: input.reason ?? current.reason,
        details: input.details || (input.productId || input.sourceInventoryLotId || input.sourceBatchNo || input.targetInventoryLotId || input.targetBatchNo || input.quantity
            ? [{
                ...fallbackDetails[0],
                productId: input.productId ?? fallbackDetails[0].productId,
                sourceInventoryLotId: input.sourceInventoryLotId ?? fallbackDetails[0].sourceInventoryLotId,
                sourceBatchNo: input.sourceBatchNo ?? fallbackDetails[0].sourceBatchNo,
                targetInventoryLotId: input.targetInventoryLotId ?? fallbackDetails[0].targetInventoryLotId,
                targetBatchNo: input.targetBatchNo ?? fallbackDetails[0].targetBatchNo,
                quantity: input.quantity ?? fallbackDetails[0].quantity
            }] : fallbackDetails)
    };
    assertDifferentLotIds(normalized.sourceLotId, normalized.targetLotId);
    const unitIds = await Promise.all(normalizedDetails(normalized).map(async (detail) => {
        if (detail.sourceInventoryLotId === detail.targetInventoryLotId) throw new LotTransferError(400, `Detail line ${detail.lineNo} must use different source and target inventory lots.`);
        return requireMatchingTransferUnitId(await assertCanonicalLotReferences({
            sourceLotId: normalized.sourceLotId,
            sourceInventoryLotId: detail.sourceInventoryLotId,
            targetLotId: normalized.targetLotId,
            targetInventoryLotId: detail.targetInventoryLotId
        }));
    }));
    const transferUnitId = unitIds.every((unit) => unit === unitIds[0]) ? unitIds[0] : null;
    const existingDetailRows = await readRawTransferDetails(id);
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
        "PATCH",
        { ...patchPayload(normalized, null, current.requestNo, transferUnitId), updated_at: new Date().toISOString() },
        "Lot-transfer Draft update"
    );
    try {
        await replaceTransferDetails(id, normalizedDetails(normalized), existingDetailRows);
    } catch (error) {
        // replaceTransferDetails restores the previous rows when a line insert fails;
        // restore the legacy header aliases as well so the Draft remains coherent.
        await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
            "PATCH",
            patchPayload({
                branchId: current.branchId,
                sourceLotId: current.sourceLotId,
                targetLotId: current.targetLotId,
                reason: current.reason,
                details: fallbackDetails
            }, null, current.requestNo, current.unitId),
            "Lot-transfer Draft header compensation"
        ).catch(() => undefined);
        throw error;
    }
    return row ? getLotTransfer(id) : getLotTransfer(id);
}

export async function deleteLotTransfer(id: number): Promise<void> {
    const current = await getLotTransfer(id);
    if (current.status !== "Draft") {
        throw new LotTransferError(409, "Only Draft lot-transfer requests can be deleted.");
    }
    const detailRows = await readRawTransferDetails(id);
    for (const row of detailRows) {
        const detailId = rowId(row, ["lot_transfer_detail_id", "id"]);
        if (detailId > 0) await deleteTransferDetail(detailId);
    }
    await mutateDirectus(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`, "DELETE", undefined, "Lot-transfer Draft deletion");
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
    sourceProtectedAllocations: ProtectedAllocationSummary;
    targetProtectedAllocations: ProtectedAllocationSummary;
}

async function loadTransferContext(record: LotTransferRecord, excludeTransferMovements = false): Promise<TransferContext> {
    const [branch, sourceLot, targetLot, sourceInventoryLotLookup, targetInventoryLotLookup, sourceProduct, targetProduct] = await Promise.all([
        readById(["branches"], record.branchId, "Branch lookup"),
        readMmLot(record.sourceLotId, "Source lot lookup"),
        readMmLot(record.targetLotId, "Target lot lookup"),
        readInventoryLot(record.sourceInventoryLotId, "Source inventory lot lookup"),
        readInventoryLot(record.targetInventoryLotId, "Target inventory lot lookup"),
        readProduct(record.productId),
        readProduct(record.productId)
    ]);
    const sourceInventoryLot = sourceInventoryLotLookup.row;
    const targetInventoryLot = targetInventoryLotLookup.row;

    const excludedTransfer = excludeTransferMovements ? { id: record.id, requestNo: record.requestNo } : undefined;
    const [sourceMovements, targetBatchMovements, sourceLotMovements, targetLotMovements, sourceProtectedAllocations, targetProtectedAllocations] = await Promise.all([
        movementsForBatch({ productId: record.productId, branchId: record.branchId, lotId: record.sourceLotId, batchNo: record.sourceBatchNo }, excludedTransfer),
        movementsForBatch({ productId: record.productId, branchId: record.branchId, lotId: record.targetLotId, batchNo: record.targetBatchNo }, excludedTransfer),
        movementsForLot({ branchId: record.branchId, lotId: record.sourceLotId }, excludedTransfer),
        movementsForLot({ branchId: record.branchId, lotId: record.targetLotId }, excludedTransfer),
        protectedAllocationsForInventoryLot({
            branchId: record.branchId,
            productId: record.productId,
            lotId: record.sourceLotId,
            inventoryLotId: record.sourceInventoryLotId,
            batchNo: record.sourceBatchNo,
            legacyReservedQuantity: numeric(sourceInventoryLot.reserved_quantity),
            excludeLotTransferId: record.id
        }),
        protectedAllocationsForInventoryLot({
            branchId: record.branchId,
            productId: record.productId,
            lotId: record.targetLotId,
            inventoryLotId: record.targetInventoryLotId,
            batchNo: record.targetBatchNo,
            legacyReservedQuantity: numeric(targetInventoryLot.reserved_quantity),
            excludeLotTransferId: record.id
        })
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
        sourceProtectedAllocations,
        targetProtectedAllocations
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
    legacyReservedQuantity: number;
    protectedAllocationQuantity: number;
    protectedAllocations: ProtectedAllocation[];
    protectedAllocationResolutionComplete: boolean;
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
        legacyReservedQuantity: Math.max(0, input.legacyReservedQuantity),
        protectedAllocationQuantity: Math.max(0, input.protectedAllocationQuantity),
        protectedAllocations: input.protectedAllocations,
        protectedAllocationResolutionComplete: input.protectedAllocationResolutionComplete,
        availableQuantity: Math.max(0, input.onHandBefore - input.reservedQuantity),
        onHandAfter: Math.max(0, input.onHandBefore + input.quantityDelta),
        unitCost: input.unitCost,
        expiryDate: input.expiryDate,
        manufacturingDate: input.manufacturingDate
    };
}

async function buildSingleLinePreview(record: LotTransferRecord, options: { excludeTransferMovements?: boolean } = {}): Promise<LotTransferPreview> {
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
    const sourceReserved = context.sourceProtectedAllocations.totalQuantity;
    const targetReserved = context.targetProtectedAllocations.totalQuantity;
    const sourceExpiry = dateValue(context.sourceInventoryLot, ["expiry_date", "expiration_date", "expiryDate"]);
    const targetExpiry = dateValue(context.targetInventoryLot, ["expiry_date", "expiration_date", "expiryDate"]);
    const sourceMfg = dateValue(context.sourceInventoryLot, ["manufacturing_date", "manufacturingDate"]);
    const targetMfg = dateValue(context.targetInventoryLot, ["manufacturing_date", "manufacturingDate"]);
    const sourceUnitCost = nullableNumeric(firstValue(context.sourceInventoryLot, ["unit_cost", "cost_per_unit", "final_landed_unit_cost"]));
    const targetUnitCost = nullableNumeric(firstValue(context.targetInventoryLot, ["unit_cost", "cost_per_unit", "final_landed_unit_cost"]));
    const sourceUnitId = unitId(context.sourceLot);
    const targetUnitId = unitId(context.targetLot);
    const sourceCapacity = nullableNumeric(firstValue(context.sourceLot, ["max_batch_capacity", "capacity"]));
    const targetCapacity = positiveCapacity(firstValue(context.targetLot, ["max_batch_capacity", "capacity"]));
    const targetOccupiedForCapacity = targetLotOccupiedBefore;
    const targetCapacityRemaining = targetCapacity === null ? null : Math.max(0, targetCapacity - targetOccupiedForCapacity);
    const targetCapacityConfigured = targetCapacity !== null;
    const effectiveExpiry = earliestDate(sourceExpiry, targetExpiry);
    const today = new Date().toISOString().slice(0, 10);
    const checks: ValidationCheck[] = [
        check("branch", "Same branch", record.branchId > 0 && sourceBranchIdValue === record.branchId && targetBranchIdValue === record.branchId && sourceLotBranchId === record.branchId && targetLotBranchId === record.branchId, "Source and target records must belong to the requested branch."),
        check("product", "Same product", record.productId > 0 && sourceProductIdValue === record.productId && targetProductIdValue === record.productId, "Source and target batches must belong to the requested product."),
        check("identity", "Exact lot and batch identity", sourceInventoryLotIdValue === record.sourceInventoryLotId && targetInventoryLotIdValue === record.targetInventoryLotId && sourceLotIdValue === record.sourceLotId && targetLotIdValue === record.targetLotId && stringValue(context.sourceInventoryLot.batch_no).toLowerCase() === record.sourceBatchNo.toLowerCase() && stringValue(context.targetInventoryLot.batch_no).toLowerCase() === record.targetBatchNo.toLowerCase(), "The stored lot, inventory-lot, and batch references must match the request."),
        check("active", "Active stock records", normalizeStatus(context.sourceLot.status) === "ACTIVE" && normalizeStatus(context.targetLot.status) === "ACTIVE" && normalizeStatus(context.sourceInventoryLot.status) === "ACTIVE" && normalizeStatus(context.targetInventoryLot.status) === "ACTIVE", "Source and target lots/batches must be active."),
        check("qa", "QA-eligible source", ["GOOD", "PASSED", "PASS", "APPROVED"].includes(normalizeStatus(context.sourceInventoryLot.qa_status)), "Source stock must have a releasable QA status."),
        check("quantity", "Positive quantity", Number.isFinite(record.quantity) && record.quantity > 0, "Transfer quantity must be greater than zero."),
        check(
            "protected-allocations",
            "Protected allocation integrity",
            context.sourceProtectedAllocations.unresolved.length === 0,
            context.sourceProtectedAllocations.unresolved.length === 0
                ? "All active protected allocations have an exact source identity."
                : `Protected allocation reconciliation is required: ${context.sourceProtectedAllocations.unresolved.join(" ")}`
        ),
        check("source-availability", "Source availability", Math.max(0, sourceQuantityBefore - sourceReserved) + LOT_TRANSFER_EPSILON >= record.quantity, `Available source quantity is ${Math.max(0, sourceQuantityBefore - sourceReserved)} after ${formatProtectedAllocationQuantity(sourceReserved)} of protected allocations.`),
        check("target-capacity", "Target capacity", targetCapacityConfigured && (targetCapacityRemaining ?? 0) + LOT_TRANSFER_EPSILON >= record.quantity, targetCapacityConfigured ? `Destination lot currently contains ${targetLotOccupiedBefore}; configured capacity is ${targetCapacity}; remaining capacity is ${targetCapacityRemaining}.` : "Destination lot capacity is not configured. Set a positive max_batch_capacity before transferring stock."),
        check(
            "uom",
            "Unit compatibility",
            sourceUnitId !== null && targetUnitId !== null && sourceUnitId === targetUnitId,
            sourceUnitId === null || targetUnitId === null
                ? `Source and destination lots must each have an explicit valid UOM. Missing: ${[sourceUnitId === null ? "source" : "", targetUnitId === null ? "destination" : ""].filter(Boolean).join(" and ")}.`
                : sourceUnitId === targetUnitId
                    ? "Source and destination lots use the same UOM."
                    : `Source UOM ${sourceUnitId} and destination UOM ${targetUnitId} are incompatible; UOM conversion is not supported.`
        ),
        check("allergen", "Allergen profile match", context.sourceAllergens.available && context.targetAllergens.available && profilesEqual(context.sourceAllergens.values, context.targetAllergens.values), context.sourceAllergens.available && context.targetAllergens.available ? "Source and target allergen profiles match." : "Allergen profiles are unavailable; QA approval is blocked."),
        check("dates", "Valid manufacturing and expiry dates", validDate(sourceMfg) && validDate(targetMfg) && validDate(sourceExpiry) && validDate(targetExpiry) && (!effectiveExpiry || dateOnly(effectiveExpiry)! >= today) && (!sourceMfg || !sourceExpiry || dateOnly(sourceMfg)! <= dateOnly(sourceExpiry)!) && (!targetMfg || !targetExpiry || dateOnly(targetMfg)! <= dateOnly(targetExpiry)!), "Manufacturing and expiry values must be valid, chronological, and not expired."),
        check("different-lot", "Different source and destination lots", record.sourceLotId !== record.targetLotId, "Source and destination lot IDs must be different."),
        check("different-batch", "Different source and target", record.sourceInventoryLotId !== record.targetInventoryLotId || record.sourceBatchNo.toLowerCase() !== record.targetBatchNo.toLowerCase(), "Source and target must not be the same inventory batch.")
    ];

    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: checks.every((item) => item.passed),
        canPost: checks.every((item) => item.passed),
        checks,
        source: snapshot({
            lotId: record.sourceLotId,
            inventoryLotId: record.sourceInventoryLotId,
            batchNo: record.sourceBatchNo,
            onHandBefore: sourceQuantityBefore,
            reservedQuantity: sourceReserved,
            legacyReservedQuantity: context.sourceProtectedAllocations.legacyReservedQuantity,
            protectedAllocationQuantity: context.sourceProtectedAllocations.explicitQuantity,
            protectedAllocations: context.sourceProtectedAllocations.allocations,
            protectedAllocationResolutionComplete: context.sourceProtectedAllocations.unresolved.length === 0,
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
            legacyReservedQuantity: context.targetProtectedAllocations.legacyReservedQuantity,
            protectedAllocationQuantity: context.targetProtectedAllocations.explicitQuantity,
            protectedAllocations: context.targetProtectedAllocations.allocations,
            protectedAllocationResolutionComplete: context.targetProtectedAllocations.unresolved.length === 0,
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
        },
        linePreviews: [],
        totalQuantity: record.quantity
    };
}

function recordForDetail(record: LotTransferRecord, detail: LotTransferDetail): LotTransferRecord {
    return {
        ...record,
        productId: detail.productId,
        sourceInventoryLotId: detail.sourceInventoryLotId,
        sourceBatchNo: detail.sourceBatchNo,
        targetInventoryLotId: detail.targetInventoryLotId,
        targetBatchNo: detail.targetBatchNo,
        quantity: detail.quantity,
        sourceMovementId: detail.sourceMovementId,
        targetMovementId: detail.targetMovementId,
        sourceUnitCost: detail.sourceUnitCost,
        targetUnitCost: detail.targetUnitCost,
        sourceBalanceBefore: detail.sourceBalanceBefore,
        sourceBalanceAfter: detail.sourceBalanceAfter,
        targetBalanceBefore: detail.targetBalanceBefore,
        targetBalanceAfter: detail.targetBalanceAfter
    };
}

function replaceCheck(checks: ValidationCheck[], key: string, passed: boolean, message: string): ValidationCheck[] {
    return checks.map((item) => item.key === key ? { ...item, passed, message } : item);
}

export async function buildLotTransferPreview(record: LotTransferRecord, options: { excludeTransferMovements?: boolean } = {}): Promise<LotTransferPreview> {
    const details = record.details.length > 0 ? record.details : [legacyDetailFromRecord(record)];
    const rawLines = await Promise.all(details.map(async (detail) => {
        const preview = await buildSingleLinePreview(recordForDetail(record, detail), options);
        return {
            detail,
            preview,
            line: {
                detailId: detail.detailId,
                lineNo: detail.lineNo,
                productId: detail.productId,
                quantity: detail.quantity,
                lineRemarks: detail.lineRemarks,
                checks: preview.checks,
                source: preview.source,
                target: preview.target,
                sourceLotCapacity: preview.sourceLotCapacity,
                sourceLotOccupiedBefore: preview.sourceLotOccupiedBefore,
                targetLotCapacity: preview.targetLotCapacity,
                targetLotOccupiedBefore: preview.targetLotOccupiedBefore,
                targetLotCapacityRemaining: preview.targetLotCapacityRemaining,
                effectiveExpiryDate: preview.effectiveExpiryDate,
                movementPreview: preview.movementPreview
            }
        };
    }));

    const sourceGroups = new Map<string, { quantity: number; available: number }>();
    const targetGroups = new Map<number, { quantity: number; capacity: number | null; remaining: number | null }>();
    for (const entry of rawLines) {
        const sourceKey = `${entry.detail.productId}:${record.sourceLotId}:${entry.detail.sourceInventoryLotId}:${entry.detail.sourceBatchNo.toLowerCase()}`;
        const sourceGroup = sourceGroups.get(sourceKey) || { quantity: 0, available: entry.preview.source.availableQuantity };
        sourceGroup.quantity += entry.detail.quantity;
        sourceGroups.set(sourceKey, sourceGroup);

        const targetGroup = targetGroups.get(record.targetLotId) || {
            quantity: 0,
            capacity: entry.preview.targetLotCapacity,
            remaining: entry.preview.targetLotCapacityRemaining
        };
        targetGroup.quantity += entry.detail.quantity;
        targetGroup.capacity = targetGroup.capacity ?? entry.preview.targetLotCapacity;
        targetGroup.remaining = targetGroup.remaining ?? entry.preview.targetLotCapacityRemaining;
        targetGroups.set(record.targetLotId, targetGroup);
    }

    const linePreviews = rawLines.map((entry) => {
        const sourceKey = `${entry.detail.productId}:${record.sourceLotId}:${entry.detail.sourceInventoryLotId}:${entry.detail.sourceBatchNo.toLowerCase()}`;
        const sourceGroup = sourceGroups.get(sourceKey)!;
        const targetGroup = targetGroups.get(record.targetLotId)!;
        const sourcePassed = sourceGroup.available + LOT_TRANSFER_EPSILON >= sourceGroup.quantity;
        const targetPassed = targetGroup.remaining !== null && targetGroup.remaining + LOT_TRANSFER_EPSILON >= targetGroup.quantity;
        const checks = replaceCheck(
            replaceCheck(
                entry.line.checks,
                "source-availability",
                sourcePassed,
                sourcePassed
                    ? `Source batch has ${formatProtectedAllocationQuantity(sourceGroup.available)} available for ${formatProtectedAllocationQuantity(sourceGroup.quantity)} across this transfer.`
                    : `Source batch has ${formatProtectedAllocationQuantity(sourceGroup.available)} available, but this transfer requires ${formatProtectedAllocationQuantity(sourceGroup.quantity)} across its detail lines.`
            ),
            "target-capacity",
            targetPassed,
            targetPassed
                ? `Destination lot has ${formatProtectedAllocationQuantity(targetGroup.remaining || 0)} capacity remaining for ${formatProtectedAllocationQuantity(targetGroup.quantity)} incoming across this transfer.`
                : targetGroup.capacity === null
                    ? "Destination lot capacity is not configured. Set a positive max_batch_capacity before transferring stock."
                    : `Destination lot has ${formatProtectedAllocationQuantity(targetGroup.remaining || 0)} capacity remaining, but this transfer requires ${formatProtectedAllocationQuantity(targetGroup.quantity)} across its detail lines.`
        );
        return { ...entry.line, checks };
    });

    const first = linePreviews[0];
    if (!first) throw new LotTransferError(400, "At least one transfer detail line is required.");
    const checks = linePreviews.flatMap((line) => line.checks.map((item) => ({
        ...item,
        key: `line-${line.lineNo}-${item.key}`,
        label: `Line ${line.lineNo}: ${item.label}`
    })));
    const totalQuantity = details.reduce((sum, detail) => sum + detail.quantity, 0);
    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: checks.every((item) => item.passed),
        canPost: checks.every((item) => item.passed),
        checks,
        source: first.source,
        target: first.target,
        sourceLotCapacity: first.sourceLotCapacity,
        sourceLotOccupiedBefore: first.sourceLotOccupiedBefore,
        targetLotCapacity: first.targetLotCapacity,
        targetLotOccupiedBefore: first.targetLotOccupiedBefore,
        targetLotCapacityRemaining: first.targetLotCapacityRemaining,
        effectiveExpiryDate: linePreviews.map((line) => line.effectiveExpiryDate).filter((value): value is string => Boolean(value)).sort()[0] || null,
        allergenProfiles: rawLines[0].preview.allergenProfiles,
        movementPreview: first.movementPreview,
        linePreviews,
        totalQuantity
    };
}

async function persistDetailValidation(preview: LotTransferPreview): Promise<void> {
    for (const line of preview.linePreviews) {
        if (!line.detailId) continue;
        const failed = line.checks.filter((item) => !item.passed).map((item) => `${item.label}: ${item.message}`);
        await mutateDirectus(
            `/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(line.detailId))}`,
            "PATCH",
            {
                validation_status: failed.length === 0 ? "PASSED" : "FAILED",
                validation_error: failed.length > 0 ? failed.join(" ").slice(0, 5000) : null,
                updated_at: new Date().toISOString()
            },
            "Lot-transfer detail validation audit"
        );
    }
}

export async function submitLotTransfer(id: number, actorUserId: number | null): Promise<LotTransferRecord> {
    const record = await getLotTransfer(id);
    if (record.status !== "Draft") throw new LotTransferError(409, `Only Draft requests can be submitted. Current status: ${record.status}.`);
    const submittedBy = requireSessionUserId(actorUserId, "submit a lot-transfer request");
    const preview = await buildLotTransferPreview(record);
    if (!preview.canApprove) {
        throw new LotTransferError(409, "The lot-transfer request failed the required submission checks.", {
            failedChecks: failedPreviewChecks(preview)
        });
    }
    await persistDetailValidation(preview);
    const row = await mutateDirectus(
        `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
        "PATCH",
        {
            status: "Submitted",
            submitted_by: submittedBy,
            submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        "Lot-transfer submission"
    );
    return row ? hydrateTransferRecord(mapTransferRow(row)) : getLotTransfer(id);
}

export async function previewLotTransferInput(input: LotTransferInput): Promise<LotTransferPreview> {
    assertDifferentLotIds(input.sourceLotId, input.targetLotId);
    const details = normalizedDetails(input);
    const unitIds = await Promise.all(details.map(async (detail) => requireMatchingTransferUnitId(await assertCanonicalLotReferences({
        sourceLotId: input.sourceLotId,
        sourceInventoryLotId: detail.sourceInventoryLotId,
        targetLotId: input.targetLotId,
        targetInventoryLotId: detail.targetInventoryLotId
    }))));
    const transferUnitId = unitIds.every((unit) => unit === unitIds[0]) ? unitIds[0] : null;
    return buildLotTransferPreview(transientRecordFromInput({ ...input, details }, transferUnitId));
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
        fields: "movement_id,source_document_id,source_document_detail_id,source_document_no,product_id,branch_id,mm_lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id",
        limit: "-1"
    });
    return directusRows(`/items/inventory_movements?${params.toString()}`, "Lot-transfer movement verification");
}

async function findTransferMovements(transferIdValue: number, requestNo: string): Promise<RecordValue[]> {
    const params = new URLSearchParams({
        "filter[source_document_id][_eq]": String(transferIdValue),
        "filter[source_document_no][_eq]": requestNo,
        fields: "movement_id,source_document_id,source_document_detail_id,source_document_no,product_id,branch_id,mm_lot_id,batch_no,quantity,expiry_date,manufacturing_date,transaction_type_id",
        limit: "-1"
    });
    return directusRows(`/items/inventory_movements?${params.toString()}`, "Existing lot-transfer movement lookup");
}

function isTransferMovement(row: RecordValue, record: LotTransferRecord, side: "source" | "target"): boolean {
    const expectedQuantity = side === "source" ? -record.quantity : record.quantity;
    return numeric(row.product_id) === record.productId
        && numeric(row.branch_id) === record.branchId
        && numeric(row.mm_lot_id) === (side === "source" ? record.sourceLotId : record.targetLotId)
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

function storedPostedPreview(record: LotTransferRecord): LotTransferPreview {
    const sourceBefore = record.sourceBalanceBefore ?? 0;
    const targetBefore = record.targetBalanceBefore ?? 0;
    const sourceAfter = record.sourceBalanceAfter ?? sourceBefore - record.quantity;
    const targetAfter = record.targetBalanceAfter ?? targetBefore + record.quantity;
    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: false,
        canPost: false,
        checks: [check("posted", "Posted movement pair", true, "The source OUT and target IN references are stored on the posted audit record.")],
        source: {
            ...snapshot({
                lotId: record.sourceLotId,
                inventoryLotId: record.sourceInventoryLotId,
                batchNo: record.sourceBatchNo,
                onHandBefore: sourceBefore,
                reservedQuantity: 0,
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
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
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
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
        },
        linePreviews: record.details.map((detail) => ({
            detailId: detail.detailId,
            lineNo: detail.lineNo,
            productId: detail.productId,
            quantity: detail.quantity,
            lineRemarks: detail.lineRemarks,
            checks: [check(`posted-${detail.lineNo}`, `Posted line ${detail.lineNo}`, true, "The line movement references are stored on the posted audit record.")],
            source: snapshot({
                lotId: record.sourceLotId,
                inventoryLotId: detail.sourceInventoryLotId,
                batchNo: detail.sourceBatchNo,
                onHandBefore: detail.sourceBalanceBefore ?? 0,
                reservedQuantity: 0,
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
                unitCost: detail.sourceUnitCost,
                expiryDate: detail.sourceExpiryDate,
                manufacturingDate: detail.sourceManufacturingDate,
                quantityDelta: 0
            }),
            target: snapshot({
                lotId: record.targetLotId,
                inventoryLotId: detail.targetInventoryLotId,
                batchNo: detail.targetBatchNo,
                onHandBefore: detail.targetBalanceBefore ?? 0,
                reservedQuantity: 0,
                legacyReservedQuantity: 0,
                protectedAllocationQuantity: 0,
                protectedAllocations: [],
                protectedAllocationResolutionComplete: true,
                unitCost: detail.targetUnitCost,
                expiryDate: detail.targetExpiryDate,
                manufacturingDate: detail.targetManufacturingDate,
                quantityDelta: 0
            }),
            sourceLotCapacity: null,
            sourceLotOccupiedBefore: detail.sourceBalanceBefore ?? 0,
            targetLotCapacity: null,
            targetLotOccupiedBefore: detail.targetBalanceBefore ?? 0,
            targetLotCapacityRemaining: null,
            effectiveExpiryDate: detail.targetExpiryDate || detail.sourceExpiryDate,
            movementPreview: {
                sourceQuantity: -detail.quantity,
                targetQuantity: detail.quantity,
                sourceLotId: record.sourceLotId,
                sourceInventoryLotId: detail.sourceInventoryLotId,
                sourceBatchNo: detail.sourceBatchNo,
                targetLotId: record.targetLotId,
                targetInventoryLotId: detail.targetInventoryLotId,
                targetBatchNo: detail.targetBatchNo
            }
        })),
        totalQuantity: record.totalQuantity || record.quantity
    };
}

export async function approveLotTransfer(id: number, actorUserId: number | null): Promise<{ record: LotTransferRecord; preview: LotTransferPreview; idempotent: boolean }> {
    const record = await getLotTransfer(id);
    if (record.status === "Posted") {
        throw new LotTransferError(409, "Posted lot-transfer requests cannot be approved again.");
    }
    if (record.status === "Approved") {
        return { record, preview: await buildLotTransferPreview(record), idempotent: true };
    }
    if (record.status !== "Submitted") {
        throw new LotTransferError(409, `Only Submitted requests can be approved. Current status: ${record.status}.`);
    }

    const preview = await buildLotTransferPreview(record);
    if (!preview.canApprove) {
        throw new LotTransferError(409, "The lot-transfer request failed the required QA checks.", {
            failedChecks: preview.checks.filter((item) => !item.passed)
        });
    }
    await persistDetailValidation(preview);

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
            source_movement_id: null,
            target_movement_id: null,
            source_balance_before: null,
            source_balance_after: null,
            target_balance_before: null,
            target_balance_after: null,
            idempotency_key: null,
            posting_started_at: null,
            reconciliation_required: false,
            posting_error: null,
            updated_at: approvedAt
        },
        "Lot-transfer approval"
    );
    const finalRecord = persisted ? await hydrateTransferRecord(mapTransferRow(persisted)) : await getLotTransfer(id);
    if (finalRecord.status !== "Approved" || finalRecord.sourceMovementId !== null || finalRecord.targetMovementId !== null) {
        throw new LotTransferError(503, "Lot-transfer approval was not durably finalized without posting inventory.");
    }
    return { record: finalRecord, preview, idempotent: false };
}

export async function postLotTransfer(id: number, idempotencyKey: string, actorUserId: number | null): Promise<{ record: LotTransferRecord; preview: LotTransferPreview; idempotent: boolean }> {
    const record = await getLotTransfer(id);
    if (record.status === "Posted") return { record, preview: storedPostedPreview(record), idempotent: true };
    if (record.status !== "Approved") throw new LotTransferError(409, `Only Approved requests can be posted. Current status: ${record.status}.`);
    if (record.postingStartedAt && record.idempotencyKey && record.idempotencyKey !== idempotencyKey) {
        throw new LotTransferError(409, "Another posting operation is already in progress for this request.");
    }

    let claimOwned = false;
    let reconciliationRequired = false;
    const createdMovementIds: number[] = [];
    const detailAuditIds: number[] = [];
    const targetExpiryUpdates: TargetExpiryUpdate[] = [];
    let preview: LotTransferPreview | null = null;

    try {
        const startedAt = new Date().toISOString();
        await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
            "PATCH",
            { idempotency_key: idempotencyKey, posting_started_at: startedAt, posting_error: null, reconciliation_required: false, updated_at: startedAt },
            "Lot-transfer posting claim"
        );
        const claimedRecord = await getLotTransfer(id);
        if (claimedRecord.status === "Posted") return { record: claimedRecord, preview: storedPostedPreview(claimedRecord), idempotent: true };
        if (claimedRecord.status !== "Approved" || claimedRecord.idempotencyKey !== idempotencyKey) {
            throw new LotTransferError(409, "Another posting operation is already in progress for this request.");
        }
        claimOwned = true;
        preview = await buildLotTransferPreview(claimedRecord, { excludeTransferMovements: true });
        if (!preview.canPost) {
            throw new LotTransferError(409, "The lot-transfer request failed the required posting checks.", {
                failedChecks: preview.checks.filter((item) => !item.passed)
            });
        }

        const details = claimedRecord.details.length > 0 ? claimedRecord.details : [legacyDetailFromRecord(claimedRecord)];
        const existingMovements = await findTransferMovements(id, claimedRecord.requestNo);
        const pairs: Array<{ detail: LotTransferDetail; sourceMovementId: number; targetMovementId: number }> = [];
        const matchedMovementIds = new Set<number>();
        for (const detail of details) {
            const lineRecord = recordForDetail(claimedRecord, detail);
            const lineRows = detail.detailId
                ? existingMovements.filter((row) => numeric(row.source_document_detail_id) === detail.detailId)
                : existingMovements.filter((row) => isTransferMovement(row, lineRecord, "source") || isTransferMovement(row, lineRecord, "target"));
            const sourceMatches = lineRows.filter((row) => isTransferMovement(row, lineRecord, "source"));
            const targetMatches = lineRows.filter((row) => isTransferMovement(row, lineRecord, "target"));
            if (sourceMatches.length > 1 || targetMatches.length > 1 || (lineRows.length > 0 && !(sourceMatches.length === 1 && targetMatches.length === 1))) {
                reconciliationRequired = true;
                throw new LotTransferError(503, `Transfer detail line ${detail.lineNo} has an incomplete or duplicate movement pair; reconciliation is required.`);
            }
            if (sourceMatches.length === 1 && targetMatches.length === 1) {
                const sourceMovementId = movementId(sourceMatches[0]);
                const targetMovementId = movementId(targetMatches[0]);
                if (!sourceMovementId || !targetMovementId) {
                    reconciliationRequired = true;
                    throw new LotTransferError(503, `Transfer detail line ${detail.lineNo} has movement records without durable IDs.`);
                }
                matchedMovementIds.add(sourceMovementId);
                matchedMovementIds.add(targetMovementId);
                pairs.push({ detail, sourceMovementId, targetMovementId });
            }
        }
        if (existingMovements.length > 0 && (pairs.length !== details.length || matchedMovementIds.size !== existingMovements.length)) {
            reconciliationRequired = true;
            throw new LotTransferError(503, "An incomplete or duplicate lot-transfer movement set exists; reconciliation is required.");
        }

        if (pairs.length === 0) {
            const sourceTypeId = await resolveMovementType(LOT_TRANSFER_SOURCE_OUT_TYPE, "OUT");
            const targetTypeId = await resolveMovementType(LOT_TRANSFER_TARGET_IN_TYPE, "IN");
            const actor = actorUserId || 1;
            for (const line of preview.linePreviews) {
                const detail = details.find((item) => item.detailId === line.detailId || item.lineNo === line.lineNo);
                if (!detail) throw new LotTransferError(503, `Validation result for detail line ${line.lineNo} is missing.`);
                const lineRecord = recordForDetail(claimedRecord, detail);
                const common = {
                    product_id: detail.productId,
                    branch_id: claimedRecord.branchId,
                    source_document_id: claimedRecord.id,
                    source_document_detail_id: detail.detailId,
                    source_document_no: claimedRecord.requestNo,
                    version_id: null,
                    created_by: actor,
                    remarks: `Lot transfer ${claimedRecord.requestNo} line ${detail.lineNo}: ${detail.sourceBatchNo} -> ${detail.targetBatchNo}`.slice(0, 255)
                };
                const sourceMovementId = await createInventoryMovement({
                    ...common,
                    mm_lot_id: claimedRecord.sourceLotId,
                    lot_id: null,
                    transaction_type_id: sourceTypeId,
                    batch_no: detail.sourceBatchNo,
                    expiry_date: line.source.expiryDate,
                    manufacturing_date: line.source.manufacturingDate,
                    quantity: -detail.quantity
                });
                createdMovementIds.push(sourceMovementId);
                const targetMovementId = await createInventoryMovement({
                    ...common,
                    mm_lot_id: claimedRecord.targetLotId,
                    lot_id: null,
                    transaction_type_id: targetTypeId,
                    batch_no: detail.targetBatchNo,
                    expiry_date: line.effectiveExpiryDate,
                    manufacturing_date: line.target.manufacturingDate,
                    quantity: detail.quantity
                });
                createdMovementIds.push(targetMovementId);
                pairs.push({ detail, sourceMovementId, targetMovementId });
                const expiryUpdate = await planTargetExpiryUpdate(lineRecord, line.effectiveExpiryDate);
                if (expiryUpdate) {
                    await applyTargetExpiryUpdate(expiryUpdate);
                    targetExpiryUpdates.push(expiryUpdate);
                }
            }
            const verified = await verifyInventoryMovements(createdMovementIds);
            const verifiedIds = new Set(verified.map((row) => movementId(row)));
            if (createdMovementIds.some((movementIdValue) => !verifiedIds.has(movementIdValue))) {
                throw new LotTransferError(503, "One or more lot-transfer movement pairs could not be verified after insertion.");
            }
        } else {
            for (const pair of pairs) {
                const line = preview.linePreviews.find((item) => item.detailId === pair.detail.detailId || item.lineNo === pair.detail.lineNo);
                const lineRecord = recordForDetail(claimedRecord, pair.detail);
                const expiryUpdate = await planTargetExpiryUpdate(lineRecord, line?.effectiveExpiryDate || null);
                if (expiryUpdate) {
                    await applyTargetExpiryUpdate(expiryUpdate);
                    targetExpiryUpdates.push(expiryUpdate);
                }
            }
        }

        for (const pair of pairs) {
            const line = preview.linePreviews.find((item) => item.detailId === pair.detail.detailId || item.lineNo === pair.detail.lineNo);
            if (!line || !pair.detail.detailId) continue;
            detailAuditIds.push(pair.detail.detailId);
            await mutateDirectus(
                `/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(pair.detail.detailId))}`,
                "PATCH",
                {
                    source_movement_id: pair.sourceMovementId,
                    target_movement_id: pair.targetMovementId,
                    source_unit_cost: line.source.unitCost,
                    target_unit_cost: line.target.unitCost,
                    source_balance_before: line.source.onHandBefore,
                    source_balance_after: line.source.onHandAfter,
                    target_balance_before: line.target.onHandBefore,
                    target_balance_after: line.target.onHandAfter,
                    source_manufacturing_date: line.source.manufacturingDate,
                    source_expiry_date: line.source.expiryDate,
                    target_manufacturing_date: line.target.manufacturingDate,
                    target_expiry_date: line.target.expiryDate,
                    validation_status: "PASSED",
                    validation_error: null,
                    posting_error: null,
                    reconciliation_required: false,
                    updated_at: new Date().toISOString()
                },
                "Lot-transfer detail posting audit"
            );
        }

        const postedAt = new Date().toISOString();
        const singleLine = pairs.length === 1 ? pairs[0] : null;
        const persisted = await mutateDirectus(
            `/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}`,
            "PATCH",
            {
                status: "Posted",
                posted_by: actorUserId || 1,
                posted_at: postedAt,
                effective_expiry_date: preview.effectiveExpiryDate,
                source_unit_cost: singleLine ? preview.source.unitCost : null,
                target_unit_cost: singleLine ? preview.target.unitCost : null,
                source_movement_id: singleLine?.sourceMovementId || null,
                target_movement_id: singleLine?.targetMovementId || null,
                source_balance_before: singleLine ? preview.source.onHandBefore : null,
                source_balance_after: singleLine ? preview.source.onHandAfter : null,
                target_balance_before: singleLine ? preview.target.onHandBefore : null,
                target_balance_after: singleLine ? preview.target.onHandAfter : null,
                posting_started_at: null,
                idempotency_key: idempotencyKey,
                reconciliation_required: false,
                posting_error: null,
                updated_at: postedAt
            },
            pairs.length === 1 ? "Lot-transfer posting finalization" : "Lot-transfer multi-line posting finalization"
        );
        const finalRecord = persisted ? await hydrateTransferRecord(mapTransferRow(persisted)) : await getLotTransfer(id);
        if (finalRecord.status !== "Posted" || finalRecord.details.some((detail) => detail.detailId && (!detail.sourceMovementId || !detail.targetMovementId))) {
            reconciliationRequired = true;
            throw new LotTransferError(503, "Lot-transfer posting was not durably finalized for every detail line.");
        }
        return { record: finalRecord, preview, idempotent: pairs.length > 0 && createdMovementIds.length === 0 };
    } catch (error) {
        const compensationFailures: string[] = [];
        for (const update of [...targetExpiryUpdates].reverse()) {
            try {
                await restoreTargetExpiryUpdate(update);
            } catch (compensationError) {
                compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
            }
        }
        for (const movementIdValue of [...createdMovementIds].reverse()) {
            try {
                await deleteInventoryMovement(movementIdValue);
            } catch (compensationError) {
                compensationFailures.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
            }
        }
        for (const detailId of detailAuditIds) {
            await mutateDirectus(`/items/${LOT_TRANSFER_DETAIL_COLLECTION}/${encodeURIComponent(String(detailId))}`, "PATCH", {
                source_movement_id: null,
                target_movement_id: null,
                posting_error: error instanceof Error ? error.message : "Unknown lot-transfer posting failure",
                reconciliation_required: reconciliationRequired || compensationFailures.length > 0,
                updated_at: new Date().toISOString()
            }, "Lot-transfer detail posting failure audit").catch(() => undefined);
        }
        const errorText = error instanceof Error ? error.message : "Unknown lot-transfer posting failure";
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
                "Lot-transfer posting failure audit"
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
    if (record.status !== "Submitted") {
        throw new LotTransferError(409, `Only Submitted requests can be rejected. Current status: ${record.status}.`);
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
    return row ? hydrateTransferRecord(mapTransferRow(row)) : getLotTransfer(id);
}

export function failedPreviewChecks(preview: LotTransferPreview): ValidationCheck[] {
    return preview.checks.filter((item) => !item.passed);
}
