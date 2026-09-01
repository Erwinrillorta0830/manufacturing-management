import { cookies } from "next/headers";

const SPRING_REQUEST_TIMEOUT_MS = 20_000;

export interface MmInventoryMovement {
    [key: string]: unknown;
    movementKey?: string | null;
    movementId?: number | null;
    transactionTypeId?: number | null;
    versionId?: number | null;
    transactionType?: string | null;
    movementDirection?: string | null;
    sourceModule?: string | null;
    referenceId?: number | null;
    referenceDetailId?: number | null;
    referenceNo?: string | null;
    transactionDate?: string | null;
    postedAt?: string | null;
    postedBy?: number | null;
    branchId?: number | null;
    inventoryLotId?: number | null;
    mmLotId?: number | null;
    lotId?: number | null;
    productId?: number | null;
    productCode?: string | null;
    productName?: string | null;
    productTypeId?: number | null;
    productTypeName?: string | null;
    unitId?: number | null;
    batchNo?: string | null;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    inventoryCondition?: string | null;
    quantityIn?: number | null;
    quantityOut?: number | null;
    unitCost?: number | null;
    differenceCost?: number | null;
    remarks?: string | null;
    stockType?: string | null;
    sourceStatus?: string | null;
}

export interface MmInventoryMovementFilters {
    transactionType?: string | null;
    movementDirection?: string | null;
    sourceModule?: string | null;
    branch?: number | null;
    product?: number | null;
    productType?: number | null;
    lot?: number | null;
    mmLot?: number | null;
    inventoryLot?: number | null;
    unit?: number | null;
    batchNo?: string | null;
    referenceNo?: string | null;
    referenceId?: number | null;
    movementId?: number | null;
    transactionTypeId?: number | null;
    stockType?: string | null;
    inventoryCondition?: string | null;
    transactionDateFrom?: string | null;
    transactionDateTo?: string | null;
    postedDateFrom?: string | null;
    postedDateTo?: string | null;
}

export interface NormalizedMmInventoryMovement extends MmInventoryMovement {
    quantity: number;
    movement_id: number | null;
    transaction_type_id: number | null;
    version_id: number | null;
    source_document_id: number | null;
    source_document_no: string | null;
    product_id: number | null;
    branch_id: number | null;
    inventory_lot_id: number | null;
    mm_lot_id: number | null;
    lot_id: number | null;
    batch_no: string | null;
    expiry_date: string | null;
    manufacturing_date: string | null;
    created_at: string | null;
    created_by: number | null;
    quantity_in: number;
    quantity_out: number;
    remarks: string | null;
    id?: number | null;
}

export class MmInventoryMovementError extends Error {
    constructor(
        message: string,
        readonly status: number = 502,
        readonly cause?: unknown
    ) {
        super(message);
        this.name = "MmInventoryMovementError";
    }
}

function numericValue(value: unknown, keys: string[] = []): number | null {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = Number(record[key]);
            if (Number.isSafeInteger(nested) && nested > 0) return nested;
        }
        return null;
    }

    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function numericOrZero(value: unknown): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function textValue(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
}

function appendPositiveInteger(params: URLSearchParams, name: string, value: number | null | undefined) {
    if (value === null || value === undefined) return;
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric) && numeric > 0) params.set(name, String(numeric));
}

function appendText(params: URLSearchParams, name: string, value: string | null | undefined) {
    const text = textValue(value);
    if (text && text.toUpperCase() !== "ALL") params.set(name, text);
}

function appendFilters(params: URLSearchParams, filters: MmInventoryMovementFilters) {
    appendText(params, "transactionType", filters.transactionType);
    appendText(params, "movementDirection", filters.movementDirection);
    appendText(params, "sourceModule", filters.sourceModule);
    appendPositiveInteger(params, "branch", filters.branch);
    appendPositiveInteger(params, "product", filters.product);
    appendPositiveInteger(params, "productType", filters.productType);
    appendPositiveInteger(params, "lot", filters.lot);
    appendPositiveInteger(params, "mmLot", filters.mmLot);
    appendPositiveInteger(params, "inventoryLot", filters.inventoryLot);
    appendPositiveInteger(params, "unit", filters.unit);
    appendText(params, "batchNo", filters.batchNo);
    appendText(params, "referenceNo", filters.referenceNo);
    appendPositiveInteger(params, "referenceId", filters.referenceId);
    appendPositiveInteger(params, "movementId", filters.movementId);
    appendPositiveInteger(params, "transactionTypeId", filters.transactionTypeId);
    appendText(params, "stockType", filters.stockType);
    appendText(params, "inventoryCondition", filters.inventoryCondition);
    appendText(params, "transactionDateFrom", filters.transactionDateFrom);
    appendText(params, "transactionDateTo", filters.transactionDateTo);
    appendText(params, "postedDateFrom", filters.postedDateFrom);
    appendText(params, "postedDateTo", filters.postedDateTo);
}

async function getSpringAuth(explicitToken?: string): Promise<{ token: string; cookieHeader: string | null }> {
    let token = explicitToken?.trim() || "";
    const cookiePairs: string[] = [];

    try {
        const cookieStore = await cookies();
        for (const cookieName of ["springboot_token", "vos_access_token", "token"]) {
            const value = cookieStore.get(cookieName)?.value?.trim();
            if (value) {
                cookiePairs.push(`${cookieName}=${value}`);
                if (!token) token = value;
            }
        }
    } catch {
        // The explicit token is useful for non-request server callers and tests.
    }

    if (!token) {
        throw new MmInventoryMovementError(
            "An authenticated session is required to read inventory movements.",
            401
        );
    }

    return { token, cookieHeader: cookiePairs.length > 0 ? cookiePairs.join("; ") : null };
}

function normalizeMovement(raw: MmInventoryMovement): NormalizedMmInventoryMovement {
    const movementId = numericValue(raw.movementId);
    const transactionTypeId = numericValue(raw.transactionTypeId);
    const versionId = numericValue(raw.versionId);
    const referenceId = numericValue(raw.referenceId);
    const referenceDetailId = numericValue(raw.referenceDetailId);
    const branchId = numericValue(raw.branchId);
    const inventoryLotId = numericValue(raw.inventoryLotId);
    const mmLotId = numericValue(raw.mmLotId);
    const lotId = numericValue(raw.lotId);
    const productId = numericValue(raw.productId);
    const productTypeId = numericValue(raw.productTypeId);
    const unitId = numericValue(raw.unitId);
    const postedBy = numericValue(raw.postedBy);
    const quantityIn = numericOrZero(raw.quantityIn);
    const quantityOut = numericOrZero(raw.quantityOut);
    const batchNo = textValue(raw.batchNo);
    const sourceDocumentNo = textValue(raw.referenceNo);
    const createdAt = textValue(raw.transactionDate) || textValue(raw.postedAt);
    const manufacturingDate = textValue(raw.manufacturingDate);
    const expiryDate = textValue(raw.expirationDate);
    const remarks = textValue(raw.remarks);

    return {
        ...raw,
        movementId,
        transactionTypeId,
        versionId,
        referenceId,
        referenceDetailId,
        branchId,
        inventoryLotId,
        mmLotId,
        lotId,
        productId,
        productTypeId,
        unitId,
        postedBy,
        quantityIn,
        quantityOut,
        batchNo,
        referenceNo: sourceDocumentNo,
        manufacturingDate,
        expirationDate: expiryDate,
        remarks,
        quantity: quantityIn - quantityOut,
        movement_id: movementId,
        transaction_type_id: transactionTypeId,
        version_id: versionId,
        source_document_id: referenceId,
        source_document_no: sourceDocumentNo,
        product_id: productId,
        branch_id: branchId,
        inventory_lot_id: inventoryLotId,
        mm_lot_id: mmLotId,
        lot_id: lotId,
        batch_no: batchNo,
        expiry_date: expiryDate,
        manufacturing_date: manufacturingDate,
        created_at: createdAt,
        created_by: postedBy,
        quantity_in: quantityIn,
        quantity_out: quantityOut,
        id: movementId
    };
}

function parseMovementPayload(payload: unknown): MmInventoryMovement[] {
    const list: unknown[] | null = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)
            ? (payload as { data: unknown[] }).data
            : null;

    if (!list) {
        throw new MmInventoryMovementError(
            "Spring inventory movements returned an invalid response payload.",
            502
        );
    }

    return list.filter((row: unknown): row is MmInventoryMovement => Boolean(row && typeof row === "object"));
}

export async function fetchMmInventoryMovements(
    filters: MmInventoryMovementFilters = {},
    explicitToken?: string
): Promise<NormalizedMmInventoryMovement[]> {
    const springBaseUrl = process.env.SPRING_API_BASE_URL?.trim().replace(/\/+$/, "");
    if (!springBaseUrl) {
        throw new MmInventoryMovementError(
            "SPRING_API_BASE_URL is not configured; inventory movements cannot be loaded.",
            503
        );
    }

    const { token, cookieHeader } = await getSpringAuth(explicitToken);
    const params = new URLSearchParams();
    appendFilters(params, filters);
    const hasServerFilter = params.size > 0;
    const endpoint = hasServerFilter ? "/api/mm-inventory-movements/filter" : "/api/mm-inventory-movements/all";
    const targetUrl = `${springBaseUrl}${endpoint}${hasServerFilter ? `?${params.toString()}` : ""}`;
    const requestHeaders: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
    };
    if (cookieHeader) requestHeaders.Cookie = cookieHeader;

    let response: Response;
    let responseText = "";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SPRING_REQUEST_TIMEOUT_MS);
    try {
        response = await fetch(targetUrl, {
            headers: requestHeaders,
            cache: "no-store",
            signal: controller.signal
        });
        responseText = await response.text();
    } catch (error) {
        throw new MmInventoryMovementError(
            "The Spring inventory movement service could not be reached.",
            503,
            error
        );
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const detail = responseText.trim().slice(0, 500);
        throw new MmInventoryMovementError(
            `Spring inventory movement request failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
            response.status >= 400 && response.status < 600 ? response.status : 502
        );
    }

    let payload: unknown;
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
        throw new MmInventoryMovementError(
            "Spring inventory movement service returned invalid JSON.",
            502,
            error
        );
    }

    return parseMovementPayload(payload).map(normalizeMovement);
}

export function movementErrorStatus(error: unknown): number {
    if (error instanceof MmInventoryMovementError) return error.status;
    return 502;
}
