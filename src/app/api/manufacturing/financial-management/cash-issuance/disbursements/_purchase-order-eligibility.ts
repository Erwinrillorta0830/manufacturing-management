const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

type DirectusPurchaseOrder = {
    purchase_order_id?: unknown;
    purchase_order_no?: unknown;
    supplier_name?: unknown;
};

type DirectusReceiving = {
    purchase_order_id?: unknown;
    receipt_no?: string | null;
    receipt_date?: string | null;
    total_amount?: string | number | null;
    received_quantity?: string | number | null;
    unit_price?: string | number | null;
    isPosted?: unknown;
    is_posted_amounts?: unknown;
    is_reverted?: unknown;
    product_id?: { product_id?: unknown; id?: unknown } | number | string | null;
    purchase_order_product_id?: { purchase_order_product_id?: unknown; id?: unknown } | number | string | null;
};

type DirectusDisbursement = {
    id?: unknown;
};

type DirectusPayableReference = {
    reference_no?: unknown;
};

export const ACTIVE_DISBURSEMENT_STATUSES = [
    "Draft",
    "Submitted",
    "Returned for Revision",
    "Approved",
    "Partially Released",
    "Released",
    "Posted",
] as const;

export type PurchaseOrderReference = {
    poNo: string;
    receiptNo: string;
};

function asNumber(value: unknown): number | undefined {
    if (value == null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function asString(value: unknown): string {
    return value == null ? "" : String(value).trim();
}

function directusHeaders(): HeadersInit {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
    if (!DIRECTUS_TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");
    return { Authorization: `Bearer ${DIRECTUS_TOKEN}` };
}

export function parsePurchaseOrderReference(value: unknown): PurchaseOrderReference | null {
    const raw = asString(value);
    const separatorIndex = raw.indexOf("/");
    if (separatorIndex <= 0) return null;

    const poNo = raw.slice(0, separatorIndex).trim();
    const receiptNo = raw.slice(separatorIndex + 1).trim();
    return poNo && receiptNo ? { poNo, receiptNo } : null;
}

export function purchaseOrderReferenceKey(value: unknown): string | null {
    const parsed = parsePurchaseOrderReference(value);
    if (!parsed) return null;

    return purchaseOrderReferenceKeyFromParts(parsed.poNo, parsed.receiptNo);
}

export function purchaseOrderReferenceKeyFromParts(poNo: unknown, receiptNo: unknown): string {
    return `${asString(poNo).toUpperCase()}::${asString(receiptNo).toUpperCase()}`;
}

export function isPurchaseOrderReferenceTagged(
    reference: unknown,
    taggedReferenceKeys: ReadonlySet<string>,
): boolean {
    const key = purchaseOrderReferenceKey(reference);
    return key !== null && taggedReferenceKeys.has(key);
}

/**
 * Returns PO references already used by another active TR for the supplier.
 * A reference is considered tagged when any payable line uses it; the line
 * amount is deliberately ignored so tax-split lines cannot leave a remainder
 * that makes the PO selectable again.
 */
export async function findTaggedPurchaseOrderReferences(
    references: unknown[],
    supplierId?: number,
    excludeDisbursementId?: number,
): Promise<string[]> {
    const parsedReferences = references
        .map((reference) => ({ raw: asString(reference), key: purchaseOrderReferenceKey(reference) }))
        .filter((entry): entry is { raw: string; key: string } => entry.key !== null);

    if (parsedReferences.length === 0) return [];

    const disbursementQuery = new URLSearchParams({
        "filter[status][_in]": ACTIVE_DISBURSEMENT_STATUSES.join(","),
        fields: "id",
        limit: "-1",
    });
    if (supplierId !== undefined) {
        disbursementQuery.set("filter[payee][_eq]", String(supplierId));
    }

    const disbursementResponse = await fetch(`${DIRECTUS_URL}/items/disbursement?${disbursementQuery.toString()}`, {
        headers: directusHeaders(),
        cache: "no-store",
    });
    if (!disbursementResponse.ok) {
        throw new Error(`Unable to verify existing TR purchase-order tags (${disbursementResponse.status}).`);
    }

    const disbursementRows = (await disbursementResponse.json()).data as DirectusDisbursement[] | undefined;
    const disbursementIds = (disbursementRows || [])
        .map((row) => asNumber(row.id))
        .filter((id): id is number => id !== undefined && id !== excludeDisbursementId);

    if (disbursementIds.length === 0) return [];

    const payableQuery = new URLSearchParams({
        "filter[disbursement_id][_in]": disbursementIds.join(","),
        fields: "reference_no",
        limit: "-1",
    });
    const payableResponse = await fetch(`${DIRECTUS_URL}/items/disbursement_payables?${payableQuery.toString()}`, {
        headers: directusHeaders(),
        cache: "no-store",
    });
    if (!payableResponse.ok) {
        throw new Error(`Unable to verify existing TR payable references (${payableResponse.status}).`);
    }

    const payableRows = (await payableResponse.json()).data as DirectusPayableReference[] | undefined;
    const taggedReferenceKeys = new Set(
        (payableRows || [])
            .map((row) => purchaseOrderReferenceKey(row.reference_no))
            .filter((key): key is string => key !== null),
    );

    return [...new Set(
        parsedReferences
            .filter((entry) => taggedReferenceKeys.has(entry.key))
            .map((entry) => entry.raw),
    )];
}

export function isPostedReceivingAmount(row: DirectusReceiving): boolean {
    return asNumber(row.isPosted) === 1
        && asNumber(row.is_posted_amounts) === 1
        && asNumber(row.is_reverted) !== 1;
}

function isActiveReceiving(row: DirectusReceiving): boolean {
    return asNumber(row.is_reverted) !== 1;
}

function isCwoReference(receiptNo: string): boolean {
    return receiptNo.toUpperCase() === "ADVANCE-CWO";
}

function receivingReceiptKey(row: DirectusReceiving): string {
    return asString(row.receipt_no) || "NO-RECEIPT";
}

function isFullyPostedReceipt(rows: DirectusReceiving[], receiptNo: string): boolean {
    const receiptRows = rows.filter((row) => receivingReceiptKey(row) === receiptNo);
    return receiptRows.length > 0 && receiptRows.every(isPostedReceivingAmount);
}

/**
 * Returns PO references that are known purchase-order references but are not
 * backed by fully inventory-posted and amount-posted receiving rows.
 * Unknown references are ignored because payable lines can also contain memo
 * or manually entered references.
 */
export async function findUnpostedPurchaseOrderReferences(
    references: unknown[],
    supplierId?: number,
): Promise<string[]> {
    const parsedReferences = references
        .map((reference) => ({ raw: asString(reference), parsed: parsePurchaseOrderReference(reference) }))
        .filter((entry): entry is { raw: string; parsed: PurchaseOrderReference } => entry.parsed !== null);

    if (parsedReferences.length === 0) return [];

    const uniquePoNumbers = [...new Set(parsedReferences.map((entry) => entry.parsed.poNo))];
    const poQuery = new URLSearchParams({
        "filter[purchase_order_no][_in]": uniquePoNumbers.join(","),
        fields: "purchase_order_id,purchase_order_no,supplier_name",
        limit: "-1",
    });
    const poResponse = await fetch(`${DIRECTUS_URL}/items/purchase_order?${poQuery.toString()}`, {
        headers: directusHeaders(),
        cache: "no-store",
    });
    if (!poResponse.ok) throw new Error(`Unable to verify purchase-order posting status (${poResponse.status}).`);

    const poRows = (await poResponse.json()).data as DirectusPurchaseOrder[] | undefined;
    const poByNumber = new Map<string, DirectusPurchaseOrder>();
    for (const row of poRows || []) {
        const poNo = asString(row.purchase_order_no);
        if (poNo) poByNumber.set(poNo, row);
    }

    const knownPoRows = [...poByNumber.values()];
    if (knownPoRows.length === 0) return [];

    const poIds = knownPoRows
        .map((row) => asNumber(row.purchase_order_id))
        .filter((id): id is number => id !== undefined);
    if (poIds.length === 0) return [];

    const receivingQuery = new URLSearchParams({
        "filter[purchase_order_id][_in]": poIds.join(","),
        fields: "purchase_order_id,receipt_no,isPosted,is_posted_amounts,is_reverted",
        limit: "-1",
    });
    const receivingResponse = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?${receivingQuery.toString()}`, {
        headers: directusHeaders(),
        cache: "no-store",
    });
    if (!receivingResponse.ok) throw new Error(`Unable to verify receiving amount posting status (${receivingResponse.status}).`);

    const receivingRows = (await receivingResponse.json()).data as DirectusReceiving[] | undefined;
    const rowsByPoId = new Map<number, DirectusReceiving[]>();
    for (const row of receivingRows || []) {
        const poId = asNumber(row.purchase_order_id);
        if (poId === undefined) continue;
        const rows = rowsByPoId.get(poId) || [];
        rows.push(row);
        rowsByPoId.set(poId, rows);
    }

    const invalid: string[] = [];
    for (const entry of parsedReferences) {
        const po = poByNumber.get(entry.parsed.poNo);
        if (!po) continue;

        const poSupplierId = asNumber(po.supplier_name);
        if (supplierId !== undefined && poSupplierId !== undefined && poSupplierId !== supplierId) {
            invalid.push(entry.raw);
            continue;
        }

        const poId = asNumber(po.purchase_order_id);
        const rows = poId === undefined ? [] : (rowsByPoId.get(poId) || []);
        const activeRows = rows.filter(isActiveReceiving);

        const eligible = isCwoReference(entry.parsed.receiptNo)
            ? activeRows.length > 0 && activeRows.every(isPostedReceivingAmount)
            : isFullyPostedReceipt(activeRows, entry.parsed.receiptNo);

        if (!eligible) invalid.push(entry.raw);
    }

    return [...new Set(invalid)];
}

export function postedReceivingRowsByPurchaseOrder<T extends DirectusReceiving>(rows: T[]): Map<number, T[]> {
    const rowsByPoAndReceipt = new Map<number, Map<string, T[]>>();

    for (const row of rows) {
        if (asNumber(row.is_reverted) === 1) continue;
        const poId = asNumber(row.purchase_order_id);
        if (poId === undefined) continue;

        const rowsByReceipt = rowsByPoAndReceipt.get(poId) || new Map<string, T[]>();
        const receiptRows = rowsByReceipt.get(receivingReceiptKey(row)) || [];
        receiptRows.push(row);
        rowsByReceipt.set(receivingReceiptKey(row), receiptRows);
        rowsByPoAndReceipt.set(poId, rowsByReceipt);
    }

    const result = new Map<number, T[]>();
    for (const [poId, rowsByReceipt] of rowsByPoAndReceipt) {
        const fullyPostedRows = [...rowsByReceipt.values()]
            .filter((receiptRows) => receiptRows.length > 0 && receiptRows.every(isPostedReceivingAmount))
            .flat();
        if (fullyPostedRows.length > 0) result.set(poId, fullyPostedRows);
    }
    return result;
}

export function activeReceivingRowsByPurchaseOrder<T extends DirectusReceiving>(rows: T[]): Map<number, T[]> {
    const result = new Map<number, T[]>();
    for (const row of rows) {
        if (!isActiveReceiving(row)) continue;
        const poId = asNumber(row.purchase_order_id);
        if (poId === undefined) continue;
        const current = result.get(poId) || [];
        current.push(row);
        result.set(poId, current);
    }
    return result;
}

export function isFullyPostedPurchaseOrder<T extends DirectusReceiving>(rows: T[]): boolean {
    return rows.length > 0 && rows.every(isPostedReceivingAmount);
}
