import { DIRECTUS_URL, headers, procurementDirectusFetch } from "../_directus";
import {
    assertLandedCostPostingEligible,
    assertLandedCostStatus,
    LandedCostEligibilityError
} from "../_landed-cost-eligibility";
import { ProductCategoryTypeValidationError, resolveProductCategoryTypes } from "../_category-type";
import {
    ProductWeightValidationError,
    resolveProductWeightBreakdown
} from "@/modules/manufacturing-management/procurement/packaging-weight";
import {
    calculateLandedCost,
    type LandedCostCalculationResult
} from "@/modules/manufacturing-management/procurement/landed-cost-calculation";
import { resolvePurchaseOrderLineId } from "../../qa-receiving/_receiving-history";

export const COMPUTATION_COLLECTION = "purchase_order_landed_cost_computations";
export const ATTACHMENT_COLLECTION = "purchase_order_landed_cost_attachments";
export const EXPENSE_COLLECTION = "purchase_order_landed_cost_expenses";

export const ALLOCATION_RULES = ["Value", "Weight", "Volume", "Hybrid"] as const;
export type AllocationRule = typeof ALLOCATION_RULES[number];
export type ComputationStatus = "DRAFT" | "FINALIZING" | "FINALIZED" | "FAILED";
export type AttachmentDocumentType = "CARRIER_INVOICE" | "FREIGHT_BILL" | "BROKER_ASSESSMENT_SHEET" | "OTHER";

export interface LandedCostExpenseInput {
    expense_id?: number;
    overhead_id?: number | null;
    chart_of_account_id?: number | null;
    expense_type?: string | null;
    amount_php: number;
}

export interface LandedCostAttachment {
    id: number;
    computation_id: number;
    directus_file_id: string;
    document_type: AttachmentDocumentType;
    file_name: string;
    mime_type: string | null;
    file_size: number | null;
    uploaded_by?: number | null;
    uploaded_at?: string | null;
}

interface DirectusRecord {
    [key: string]: unknown;
}

interface ReceivingRecord extends DirectusRecord {
    id?: number;
    purchase_order_receiving_id?: unknown;
    purchase_order_product_id?: unknown;
    purchase_order_line_id?: unknown;
    product_id?: unknown;
    received_quantity?: number | string | null;
    quantity_rejected?: number | string | null;
    is_replacement?: boolean | number | null;
    is_reverted?: boolean | number | null;
    allocated_expense_php?: number | string | null;
    final_landed_unit_cost?: number | string | null;
    is_posted_amounts?: number | boolean | null;
}

interface PurchaseOrderLine extends DirectusRecord {
    purchase_order_product_id?: number;
    product_id?: unknown;
    ordered_quantity?: number | string | null;
    unit_price?: number | string | null;
    unit_price_foreign?: number | string | null;
}

interface ProductRecord extends DirectusRecord {
    product_id?: number;
    product_name?: string;
    cost_per_unit?: number | string | null;
    estimated_unit_cost?: number | string | null;
    cbm_height?: number | string | null;
    cbm_width?: number | string | null;
    cbm_length?: number | string | null;
}

export interface LandedCostInputLine {
    key: number;
    productId: number;
    productName: string;
    categoryType: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOODS";
    quantity: number;
    baseUnitCostPhp: number;
    unitPriceForeign: number;
    lineGrossWeightKg: number;
    volume: number;
    receivingRows: ReceivingRecord[];
    product: ProductRecord;
}

export interface LandedCostInputSnapshot {
    purchaseOrder: DirectusRecord;
    lines: LandedCostInputLine[];
    products: Map<number, ProductRecord>;
    receivingRows: ReceivingRecord[];
    isForeign: boolean;
    currencyCode: string;
    exchangeRate: number;
}

export interface ComputationRecord extends DirectusRecord {
    id: number;
    purchase_order_id: number;
    allocation_rule: AllocationRule;
    status: ComputationStatus;
    fg_value_share?: number | string | null;
    fg_fee_pool?: number | string | null;
}

export class LandedCostDomainError extends Error {
    constructor(
        public readonly status: 400 | 404 | 409 | 413 | 422 | 500 | 503,
        public readonly code: string,
        message: string,
        public readonly details: Record<string, unknown> = {}
    ) {
        super(message);
        this.name = "LandedCostDomainError";
    }
}

function asPositiveId(value: unknown): number | null {
    const parsed = Number(value && typeof value === "object"
        ? (value as DirectusRecord).id
            ?? (value as DirectusRecord).value
            ?? (value as DirectusRecord).product_id
            ?? (value as DirectusRecord).coa_id
            ?? (value as DirectusRecord).purchase_order_product_id
            ?? (value as DirectusRecord).po_import_id
            ?? (value as DirectusRecord).expense_id
            ?? value
        : value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function receivingRecordId(receiving: ReceivingRecord): number | null {
    return asPositiveId(receiving.id ?? receiving.purchase_order_receiving_id ?? receiving.purchase_order_product_id);
}

function relationId(value: unknown, preferredKey: string): number | null {
    if (value && typeof value === "object") {
        const record = value as DirectusRecord;
        return asPositiveId(record[preferredKey] ?? record.id ?? record.value);
    }
    return asPositiveId(value);
}

function asNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface LandedCostCurrencyContract {
    currencyCode: string;
    isForeign: boolean;
    exchangeRate: number;
}

function hasNumericValue(value: unknown): boolean {
    return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

export function resolveLandedCostCurrency(purchaseOrder: DirectusRecord): LandedCostCurrencyContract {
    const rawCurrencyCode = String(purchaseOrder.currency_code ?? "").trim().toUpperCase();
    if (!rawCurrencyCode && Number(purchaseOrder.is_import) === 1) {
        throw new LandedCostDomainError(
            422,
            "FOREIGN_CURRENCY_REQUIRED",
            "This imported purchase order has no persisted invoice currency. Reconcile the purchase-order currency before calculating landed costs.",
            { purchaseOrderId: asPositiveId(purchaseOrder.purchase_order_id || purchaseOrder.id) }
        );
    }

    const currencyCode = rawCurrencyCode || "PHP";
    if (currencyCode === "PHP") return { currencyCode, isForeign: false, exchangeRate: 1 };

    const exchangeRate = Number(purchaseOrder.exchange_rate);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new LandedCostDomainError(
            422,
            "FOREIGN_EXCHANGE_RATE_REQUIRED",
            `A positive persisted PHP exchange rate is required for ${currencyCode} purchase orders before calculating landed costs.`,
            { purchaseOrderId: asPositiveId(purchaseOrder.purchase_order_id || purchaseOrder.id), currencyCode }
        );
    }
    return { currencyCode, isForeign: true, exchangeRate };
}

export function resolveTransactionUnitPrice(
    line: Pick<PurchaseOrderLine, "purchase_order_product_id" | "unit_price" | "unit_price_foreign">,
    currency: LandedCostCurrencyContract
): number {
    const lineId = asPositiveId(line.purchase_order_product_id);
    const rawPrice = currency.isForeign ? line.unit_price_foreign : line.unit_price;
    if (!hasNumericValue(rawPrice) || Number(rawPrice) < 0) {
        const priceField = currency.isForeign ? "unit_price_foreign" : "unit_price";
        throw new LandedCostDomainError(
            422,
            "UNIT_PRICE_CURRENCY_RECONCILIATION_REQUIRED",
            `Purchase-order line ${lineId || "unknown"} is missing a valid ${priceField} value for ${currency.currencyCode} currency reconciliation.`,
            { lineId, currencyCode: currency.currencyCode, field: priceField }
        );
    }
    return Number(rawPrice);
}

export function resolveBaseUnitCostPhp(
    line: Pick<PurchaseOrderLine, "purchase_order_product_id" | "unit_price" | "unit_price_foreign">,
    currency: LandedCostCurrencyContract
): number {
    const transactionUnitPrice = resolveTransactionUnitPrice(line, currency);
    return roundMoney(currency.isForeign ? transactionUnitPrice * currency.exchangeRate : transactionUnitPrice);
}

function isAllocationRule(value: unknown): value is AllocationRule {
    return typeof value === "string" && (ALLOCATION_RULES as readonly string[]).includes(value);
}

export function requireAllocationRule(value: unknown): AllocationRule {
    if (!isAllocationRule(value)) {
        throw new LandedCostDomainError(
            400,
            "ALLOCATION_RULE_REQUIRED",
            "Select an allocation rule before saving or finalizing landed costs."
        );
    }
    return value;
}

async function directusJson<T = DirectusRecord | DirectusRecord[]>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await procurementDirectusFetch(path, init);
    const text = await response.text();
    let payload: unknown = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = { error: text };
    }
    if (!response.ok) {
        const message = payload && typeof payload === "object" && typeof (payload as DirectusRecord).errors === "string"
            ? String((payload as DirectusRecord).errors)
            : `Directus request failed (${response.status}).`;
        const status = response.status >= 500
            ? 503
            : response.status === 413
                ? 413
                : response.status === 404
                    ? 404
                    : response.status === 409
                        ? 409
                        : 400;
        throw new LandedCostDomainError(status, "DIRECTUS_REQUEST_FAILED", message);
    }
    return ((payload as DirectusRecord)?.data ?? payload) as T;
}

async function listRows(collection: string, query: string): Promise<DirectusRecord[]> {
    const rows = await directusJson<DirectusRecord[]>(`/items/${collection}?${query}`);
    return Array.isArray(rows) ? rows : [];
}

async function findComputation(purchaseOrderId: number): Promise<ComputationRecord | null> {
    const rows = await listRows(
        COMPUTATION_COLLECTION,
        `filter[purchase_order_id][_eq]=${purchaseOrderId}&limit=1&sort=-id`
    );
    return (rows[0] as ComputationRecord | undefined) || null;
}

async function findComputationById(computationId: number): Promise<ComputationRecord> {
    try {
        return await directusJson<ComputationRecord>(`/items/${COMPUTATION_COLLECTION}/${computationId}`);
    } catch (error) {
        if (error instanceof LandedCostDomainError && error.status === 404) {
            throw new LandedCostDomainError(404, "COMPUTATION_NOT_FOUND", "Landed-cost computation was not found.");
        }
        throw error;
    }
}

function assertDraft(computation: ComputationRecord): void {
    if (computation.status === "FINALIZED") {
        throw new LandedCostDomainError(
            409,
            "LANDED_COST_FINALIZED",
            "Finalized landed costs and computation files are locked."
        );
    }
    if (computation.status === "FINALIZING") {
        throw new LandedCostDomainError(
            409,
            "LANDED_COST_FINALIZING",
            "This landed-cost computation is already being finalized."
        );
    }
}

export async function loadLandedCostSnapshot(purchaseOrderId: number): Promise<LandedCostInputSnapshot> {
    const purchaseOrder = await directusJson<DirectusRecord>(`/items/purchase_order/${purchaseOrderId}?fields=*`);
    const lineRows = await listRows(
        "purchase_order_products",
        `filter[purchase_order_id][_eq]=${purchaseOrderId}&fields=*,product_id.*&limit=-1`
    ) as PurchaseOrderLine[];
    const receivingRows = await listRows(
        "purchase_order_receiving",
        `filter[purchase_order_id][_eq]=${purchaseOrderId}&filter[is_reverted][_eq]=0&fields=*&limit=-1`
    ) as ReceivingRecord[];
    const activeReceivingRows = receivingRows.filter(row =>
        row.is_replacement !== true
        && Number(row.is_replacement) !== 1
        && row.is_reverted !== true
        && Number(row.is_reverted) !== 1
    );
    const productIds = lineRows.map(line => relationId(line.product_id, "product_id")).filter((id): id is number => id !== null);
    const categoryTypes = await resolveProductCategoryTypes(productIds);
    const products = new Map<number, ProductRecord>();
    for (const line of lineRows) {
        const productId = relationId(line.product_id, "product_id");
        if (!productId) continue;
        const relatedProduct = line.product_id && typeof line.product_id === "object"
            ? line.product_id as ProductRecord
            : null;
        products.set(productId, relatedProduct || {});
    }
    if (productIds.length > 0) {
        const fallbackProducts = await listRows(
            "products",
            `filter[product_id][_in]=${productIds.join(",")}&fields=*&limit=-1`
        ) as ProductRecord[];
        for (const product of fallbackProducts) {
            if (product.product_id) {
                const productId = Number(product.product_id);
                products.set(productId, { ...(products.get(productId) || {}), ...product });
            }
        }
    }

    const currency = resolveLandedCostCurrency(purchaseOrder);
    const lines: LandedCostInputLine[] = [];

    for (const line of lineRows) {
        const key = asPositiveId(line.purchase_order_product_id);
        const productId = relationId(line.product_id, "product_id");
        if (!key || !productId) continue;
        const categoryType = categoryTypes.get(productId);
        if (categoryType !== "RAW_MATERIAL" && categoryType !== "PACKAGING" && categoryType !== "FINISHED_GOODS") {
            throw new ProductCategoryTypeValidationError(
                400,
                "PRODUCT_CATEGORY_TYPE_REQUIRED",
                `Product ${productId} must have a RAW_MATERIAL, PACKAGING, or FINISHED_GOODS Category_Type in the product master.`,
                { productId, lineId: key }
            );
        }
        const product = products.get(productId) || {};
        const weight = resolveProductWeightBreakdown(product, { requireComplete: categoryType === "PACKAGING" });
        const lineReceipts = activeReceivingRows.filter(row => resolvePurchaseOrderLineId(row, lineRows) === key);
        const quantity = lineReceipts.reduce((sum, row) => Math.max(0, sum + asNumber(row.received_quantity) - asNumber(row.quantity_rejected)), 0);
        if (quantity <= 0) continue;
        const transactionUnitPrice = resolveTransactionUnitPrice(line, currency);
        const baseUnitCostPhp = resolveBaseUnitCostPhp(line, currency);
        lines.push({
            key,
            productId,
            productName: String(product.product_name || `Product #${productId}`),
            categoryType,
            quantity,
            baseUnitCostPhp,
            unitPriceForeign: transactionUnitPrice,
            lineGrossWeightKg: weight.grossWeightKg * quantity,
            volume: asNumber(product.cbm_height) * asNumber(product.cbm_width) * asNumber(product.cbm_length),
            receivingRows: lineReceipts,
            product
        });
    }

    if (lines.length === 0) {
        throw new LandedCostDomainError(409, "NO_ACCEPTED_RECEIPTS", "No accepted received quantities are available for landed-cost finalization.");
    }

    return {
        purchaseOrder,
        lines,
        products,
        receivingRows: activeReceivingRows,
        isForeign: currency.isForeign,
        currencyCode: currency.currencyCode,
        exchangeRate: currency.exchangeRate
    };
}

export async function getComputationAttachments(computationId: number): Promise<LandedCostAttachment[]> {
    const rows = await listRows(
        ATTACHMENT_COLLECTION,
        `filter[computation_id][_eq]=${computationId}&sort=id`
    );
    return rows as unknown as LandedCostAttachment[];
}

export async function assertAttachmentDraft(purchaseOrderId: number, computationId: number): Promise<ComputationRecord> {
    await assertLandedCostStatus(purchaseOrderId);
    const computation = await findComputationById(computationId);
    if (Number(computation.purchase_order_id) !== purchaseOrderId) {
        throw new LandedCostDomainError(409, "COMPUTATION_MISMATCH", "The landed-cost computation does not belong to this purchase order.");
    }
    assertDraft(computation);
    return computation;
}

function isAllowedAttachment(file: File): boolean {
    const filename = file.name.toLowerCase();
    const mime = file.type.toLowerCase();
    return (filename.endsWith(".pdf") && (!mime || mime === "application/pdf"))
        || (filename.endsWith(".xlsx") && (!mime || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mime === "application/octet-stream"));
}

export async function uploadLandedCostAttachment(input: {
    purchaseOrderId: number;
    computationId: number;
    documentType: AttachmentDocumentType;
    file: File;
    actorId?: number | null;
}) {
    await assertAttachmentDraft(input.purchaseOrderId, input.computationId);
    if (!isAllowedAttachment(input.file)) {
        throw new LandedCostDomainError(400, "ATTACHMENT_TYPE_INVALID", "Only PDF and XLSX computation files are accepted.");
    }
    if (input.file.size <= 0 || input.file.size > 25 * 1024 * 1024) {
        throw new LandedCostDomainError(413, "ATTACHMENT_SIZE_INVALID", "Computation files must be greater than 0 bytes and no larger than 25 MB.");
    }

    const formData = new FormData();
    formData.set("file", input.file, input.file.name);
    formData.set("title", input.file.name);
    const uploadResponse = await fetch(`${DIRECTUS_URL}/files`, {
        method: "POST",
        headers: { Authorization: headers.Authorization },
        body: formData
    });
    const uploadText = await uploadResponse.text();
    let uploadBody: unknown = null;
    try { uploadBody = uploadText ? JSON.parse(uploadText) : null; } catch { uploadBody = null; }
    if (!uploadResponse.ok) {
        const status = uploadResponse.status >= 500
            ? 503
            : uploadResponse.status === 413
                ? 413
                : uploadResponse.status === 404
                    ? 404
                    : uploadResponse.status === 409
                        ? 409
                        : 400;
        throw new LandedCostDomainError(status, "ATTACHMENT_UPLOAD_FAILED", "Directus rejected the computation file.");
    }
    const fileId = uploadBody && typeof uploadBody === "object"
        ? String(((uploadBody as DirectusRecord).data as DirectusRecord | undefined)?.id || "")
        : "";
    if (!fileId) throw new LandedCostDomainError(503, "ATTACHMENT_UPLOAD_INVALID", "Directus did not return a file identifier.");

    try {
        const metadata = await createRow(ATTACHMENT_COLLECTION, {
            computation_id: input.computationId,
            directus_file_id: fileId,
            document_type: input.documentType,
            file_name: input.file.name,
            mime_type: input.file.type || null,
            file_size: input.file.size,
            uploaded_by: input.actorId || null
        });
        return metadata as unknown as LandedCostAttachment;
    } catch (error) {
        await fetch(`${DIRECTUS_URL}/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            headers: { Authorization: headers.Authorization }
        }).catch(() => undefined);
        throw error;
    }
}

export async function deleteLandedCostAttachment(input: {
    purchaseOrderId: number;
    attachmentId: number;
}) {
    const attachment = await directusJson<LandedCostAttachment>(`/items/${ATTACHMENT_COLLECTION}/${input.attachmentId}`);
    await assertAttachmentDraft(input.purchaseOrderId, Number(attachment.computation_id));
    const fileId = String(attachment.directus_file_id || "");
    if (fileId) {
        const fileResponse = await fetch(`${DIRECTUS_URL}/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            headers: { Authorization: headers.Authorization }
        });
        if (!fileResponse.ok && fileResponse.status !== 404) {
            throw new LandedCostDomainError(503, "ATTACHMENT_DELETE_FAILED", "The computation file could not be removed from Directus.");
        }
    }
    await deleteRow(ATTACHMENT_COLLECTION, input.attachmentId);
}

export async function getComputationExpenses(computationId: number): Promise<LandedCostExpenseInput[]> {
    const rows = await listRows(
        EXPENSE_COLLECTION,
        `filter[computation_id][_eq]=${computationId}&sort=id`
    );
    return rows.map(row => ({
        expense_id: asPositiveId(row.id) || undefined,
        overhead_id: asPositiveId(row.overhead_id),
        chart_of_account_id: asPositiveId(row.chart_of_account_id),
        expense_type: row.expense_type ? String(row.expense_type) : "",
        amount_php: Math.max(0, asNumber(row.amount_php))
    }));
}

export async function getLandedCostComputation(purchaseOrderId: number) {
    const computation = await findComputation(purchaseOrderId);
    if (!computation) return { computation: null, attachments: [], expenses: [] };
    return {
        computation,
        attachments: await getComputationAttachments(computation.id),
        expenses: await getComputationExpenses(computation.id)
    };
}

const AUDIT_TOLERANCE = 0.011;

function withinAuditTolerance(actual: number, expected: number): boolean {
    return Math.abs(actual - expected) < AUDIT_TOLERANCE;
}

function auditProductId(value: unknown): number | null {
    return relationId(value, "product_id");
}

async function getActiveLandedCostSettings(): Promise<{ inventoryAccountId: number | null; varianceAccountId: number | null }> {
    const rows = await listRows("manufacturing_landed_cost_settings", "filter[is_active][_eq]=1&limit=1");
    const row = rows[0];
    return {
        inventoryAccountId: asPositiveId(row?.inventory_account_id),
        varianceAccountId: asPositiveId(row?.rounding_variance_account_id)
    };
}

export async function getLandedCostAudit(purchaseOrderId: number) {
    const computation = await findComputation(purchaseOrderId);
    if (!computation) {
        return {
            purchaseOrderId,
            computationId: null,
            auditStatus: "NOT_APPLICABLE" as const,
            computation: null,
            allocation: {
                totalAllocatedFee: 0,
                expectedFee: 0,
                matchesTotal: false,
                currency: {
                    currencyCode: "UNKNOWN",
                    exchangeRate: 0,
                    isForeign: false,
                    matches: false
                },
                lines: []
            },
            valuation: {
                rowCount: 0,
                totalQuantity: 0,
                totalDelta: 0,
                matches: false,
                rows: []
            },
            accountingVariance: {
                required: false,
                variance: 0,
                balanced: false,
                status: "NOT_APPLICABLE" as const,
                entry: null,
                lines: []
            },
            reasons: ["No landed-cost computation exists for this purchase order."]
        };
    }

    const [allocationRows, valuationRows, journalEntries, settings, purchaseOrder, purchaseOrderLines] = await Promise.all([
        listRows("purchase_order_landed_cost_allocations", `filter[computation_id][_eq]=${computation.id}&sort=id&limit=-1`),
        listRows("purchase_order_inventory_valuation_ledger", `filter[computation_id][_eq]=${computation.id}&sort=id&limit=-1`),
        listRows("purchase_order_landed_cost_journal_entries", `filter[computation_id][_eq]=${computation.id}&sort=-id&limit=-1`),
        getActiveLandedCostSettings(),
        directusJson<DirectusRecord>(`/items/purchase_order/${purchaseOrderId}?fields=purchase_order_id,currency_code,is_import,exchange_rate`),
        listRows("purchase_order_products", `filter[purchase_order_id][_eq]=${purchaseOrderId}&fields=purchase_order_product_id,unit_price,unit_price_foreign&limit=-1`)
    ]);

    const productIds = Array.from(new Set(
        valuationRows
            .map(row => auditProductId(row.product_id))
            .filter((id): id is number => id !== null)
    ));
    const productRows = productIds.length > 0
        ? await listRows("products", `filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,cost_per_unit,estimated_unit_cost&limit=-1`)
        : [];
    const products = new Map<number, DirectusRecord>();
    for (const product of productRows) {
        const productId = auditProductId(product.product_id);
        if (productId) products.set(productId, product);
    }

    const allocationLines = allocationRows.map(row => ({
        id: asPositiveId(row.id),
        purchaseOrderProductId: asPositiveId(row.purchase_order_product_id),
        receivingLineId: asPositiveId(row.receiving_line_id),
        productId: auditProductId(row.product_id),
        productName: (() => {
            const productId = auditProductId(row.product_id);
            return productId ? String(products.get(productId)?.product_name || `Product #${productId}`) : "Unknown product";
        })(),
        categoryType: row.category_type ? String(row.category_type) : null,
        receivedQuantity: asNumber(row.received_quantity),
        baseUnitCostPhp: asNumber(row.base_unit_cost_php),
        allocatedFee: asNumber(row.allocated_fee),
        addedUnitCost: asNumber(row.added_unit_cost),
        finalLandedUnitCost: asNumber(row.final_landed_unit_cost),
        roundingVariance: asNumber(row.rounding_variance),
        isRoundingRecipient: row.is_rounding_recipient === true || Number(row.is_rounding_recipient) === 1
    }));
    let currencyContract: LandedCostCurrencyContract | null = null;
    let currencyContractError: string | null = null;
    try {
        currencyContract = resolveLandedCostCurrency(purchaseOrder);
    } catch (error) {
        currencyContractError = error instanceof Error ? error.message : "The purchase-order currency contract could not be verified.";
    }
    const purchaseOrderLineById = new Map(
        (purchaseOrderLines as PurchaseOrderLine[])
            .map(line => [asPositiveId(line.purchase_order_product_id), line] as const)
            .filter(([lineId]) => lineId !== null)
    );
    const currencyAuditLines = allocationLines.map(line => {
        const sourceLine = line.purchaseOrderProductId ? purchaseOrderLineById.get(line.purchaseOrderProductId) : undefined;
        if (!currencyContract || !sourceLine) {
            return {
                ...line,
                expectedBaseUnitCostPhp: null,
                currencyConsistent: false,
                currencyReason: currencyContractError || "The allocation has no matching authoritative purchase-order line."
            };
        }
        try {
            const expectedBaseUnitCostPhp = resolveBaseUnitCostPhp(sourceLine, currencyContract);
            const currencyConsistent = withinAuditTolerance(line.baseUnitCostPhp, expectedBaseUnitCostPhp);
            return {
                ...line,
                expectedBaseUnitCostPhp,
                currencyConsistent,
                currencyReason: currencyConsistent
                    ? null
                    : `Persisted PHP base cost ${line.baseUnitCostPhp.toFixed(2)} does not match the authoritative ${currencyContract.currencyCode} price converted at ${currencyContract.exchangeRate}.`
            };
        } catch (error) {
            return {
                ...line,
                expectedBaseUnitCostPhp: null,
                currencyConsistent: false,
                currencyReason: error instanceof Error ? error.message : "The allocation currency source could not be verified."
            };
        }
    });
    const expectedFee = asNumber(computation.total_landed_fee);
    const totalAllocatedFee = roundMoney(allocationLines.reduce((sum, line) => sum + line.allocatedFee, 0));
    const allocationMatches = allocationLines.length > 0 && withinAuditTolerance(totalAllocatedFee, expectedFee);
    const currencyMatches = currencyAuditLines.length > 0
        && currencyContract !== null
        && currencyAuditLines.every(line => line.currencyConsistent);

    const valuationProductCounts = new Map<number, number>();
    const valuationAuditRows = valuationRows.map(row => {
        const productId = auditProductId(row.product_id);
        if (productId) valuationProductCounts.set(productId, (valuationProductCounts.get(productId) || 0) + 1);
        const quantity = asNumber(row.quantity);
        const unitCostBefore = asNumber(row.unit_cost_before);
        const unitCostAfter = asNumber(row.unit_cost_after);
        const valuationDelta = asNumber(row.valuation_delta);
        const expectedValuationDelta = roundMoney((unitCostAfter - unitCostBefore) * quantity);
        const currentCost = productId && products.has(productId)
            ? asNumber(products.get(productId)?.cost_per_unit)
            : null;
        return {
            id: asPositiveId(row.id),
            productId,
            productName: productId ? String(products.get(productId)?.product_name || `Product #${productId}`) : "Unknown product",
            quantity,
            unitCostBefore,
            unitCostAfter,
            valuationDelta,
            expectedValuationDelta,
            currentProductCost: currentCost,
            equationMatches: quantity > 0 && withinAuditTolerance(valuationDelta, expectedValuationDelta),
            matchesProductCost: currentCost !== null && withinAuditTolerance(currentCost, unitCostAfter)
        };
    });
    const expectedQuantity = allocationLines.reduce((sum, line) => sum + line.receivedQuantity, 0);
    const totalQuantity = valuationAuditRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalDelta = roundMoney(valuationAuditRows.reduce((sum, row) => sum + row.valuationDelta, 0));
    // The valuation ledger is the historical source of truth. Product master cost
    // may legitimately change when a later PO is finalized, so that drift is
    // reported separately instead of invalidating an older posting.
    const valuationMatches = valuationAuditRows.length > 0
        && withinAuditTolerance(totalQuantity, expectedQuantity)
        && valuationAuditRows.every(row => row.equationMatches && row.productId !== null)
        && Array.from(valuationProductCounts.values()).every(count => count === 1);
    const masterCostDriftCount = valuationAuditRows.filter(row => row.currentProductCost !== null && !row.matchesProductCost).length;

    const variance = asNumber(computation.rounding_variance);
    const accountingRequired = Math.abs(variance) > 0.000001;
    const selectedEntry = journalEntries[0];
    const selectedEntryId = asPositiveId(selectedEntry?.id);
    const journalLines = selectedEntryId
        ? await listRows("purchase_order_landed_cost_journal_lines", `filter[entry_id][_eq]=${selectedEntryId}&sort=id&limit=-1`)
        : [];
    const accountingLines = journalLines.map(row => ({
        id: asPositiveId(row.id),
        accountId: asPositiveId(row.account_id),
        lineCode: row.line_code ? String(row.line_code) : "",
        debit: asNumber(row.debit),
        credit: asNumber(row.credit),
        remarks: row.remarks ? String(row.remarks) : ""
    }));
    const debitTotal = roundMoney(accountingLines.reduce((sum, line) => sum + line.debit, 0));
    const creditTotal = roundMoney(accountingLines.reduce((sum, line) => sum + line.credit, 0));
    const expectedVarianceAmount = roundMoney(Math.abs(variance));
    const accountingBalanced = !accountingRequired
        ? journalEntries.length === 0
        : journalEntries.length === 1
            && String(selectedEntry?.status || "").toUpperCase() === "POSTED"
            && accountingLines.length === 2
            && withinAuditTolerance(asNumber(selectedEntry?.total_debit), expectedVarianceAmount)
            && withinAuditTolerance(asNumber(selectedEntry?.total_credit), expectedVarianceAmount)
            && withinAuditTolerance(debitTotal, creditTotal)
            && withinAuditTolerance(debitTotal, expectedVarianceAmount)
            && accountingLines.every(line => line.accountId === settings.inventoryAccountId || line.accountId === settings.varianceAccountId)
            && accountingLines.some(line => line.accountId === settings.inventoryAccountId)
            && accountingLines.some(line => line.accountId === settings.varianceAccountId);
    const accountingStatus = !accountingRequired && journalEntries.length === 0
        ? "NOT_APPLICABLE" as const
        : accountingBalanced
            ? "POSTED" as const
            : "NOT_VERIFIED" as const;

    const reasons: string[] = [];
    if (computation.status !== "FINALIZED") reasons.push(`Computation status is ${computation.status}, not FINALIZED.`);
    if (!allocationMatches) reasons.push("Persisted landed-cost allocations do not reconcile to the computation total fee.");
    if (!currencyMatches) reasons.push(currencyContractError || "Persisted landed-cost base costs do not reconcile to the purchase-order currency and exchange-rate contract.");
    if (!valuationMatches) reasons.push("Inventory valuation rows do not reconcile to the received allocation quantities and current product costs.");
    if (accountingStatus === "NOT_VERIFIED") {
        reasons.push(accountingRequired
            ? "The required rounding-variance journal is missing, unbalanced, or does not match the configured accounts."
            : "A rounding-variance journal exists even though the computation has no material variance.");
    }

    const auditStatus = computation.status === "FINALIZED"
        && allocationMatches
        && currencyMatches
        && valuationMatches
        && accountingStatus !== "NOT_VERIFIED"
        ? "VERIFIED" as const
        : "NOT_VERIFIED" as const;

    return {
        purchaseOrderId,
        computationId: computation.id,
        auditStatus,
        computation: {
            id: computation.id,
            purchaseOrderId: computation.purchase_order_id,
            allocationRule: computation.allocation_rule,
            status: computation.status,
            totalLandedFee: expectedFee,
            roundingVariance: variance,
            fgValueShare: asNumber(computation.fg_value_share),
            fgFeePool: asNumber(computation.fg_fee_pool),
            finalizationKey: computation.finalization_key ? String(computation.finalization_key) : null,
            finalizedAt: computation.finalized_at ? String(computation.finalized_at) : null
        },
        allocation: {
            totalAllocatedFee,
            expectedFee,
            matchesTotal: allocationMatches,
            currency: currencyContract ? {
                currencyCode: currencyContract.currencyCode,
                exchangeRate: currencyContract.exchangeRate,
                isForeign: currencyContract.isForeign,
                matches: currencyMatches
            } : {
                currencyCode: String(purchaseOrder.currency_code || "UNKNOWN").toUpperCase(),
                exchangeRate: asNumber(purchaseOrder.exchange_rate),
                isForeign: Number(purchaseOrder.is_import) === 1,
                matches: false
            },
            lines: currencyAuditLines
        },
        valuation: {
            rowCount: valuationAuditRows.length,
            totalQuantity,
            expectedQuantity,
            totalDelta,
            matches: valuationMatches,
            masterCostDriftCount,
            rows: valuationAuditRows
        },
        accountingVariance: {
            required: accountingRequired,
            variance,
            expectedAmount: expectedVarianceAmount,
            debitTotal,
            creditTotal,
            balanced: accountingBalanced,
            status: accountingStatus,
            entry: selectedEntryId ? {
                id: selectedEntryId,
                entryNo: selectedEntry?.entry_no ? String(selectedEntry.entry_no) : null,
                status: selectedEntry?.status ? String(selectedEntry.status) : null,
                totalDebit: asNumber(selectedEntry?.total_debit),
                totalCredit: asNumber(selectedEntry?.total_credit),
                postingDate: selectedEntry?.posting_date ? String(selectedEntry.posting_date) : null
            } : null,
            lines: accountingLines,
            configuredInventoryAccountId: settings.inventoryAccountId,
            configuredVarianceAccountId: settings.varianceAccountId
        },
        reasons
    };
}

export async function saveLandedCostDraft(input: {
    purchaseOrderId: number;
    allocationRule: unknown;
    expenses: LandedCostExpenseInput[];
    actorId?: number | null;
    sourceFlow?: string;
}) {
    await assertLandedCostStatus(input.purchaseOrderId);
    const allocationRule = requireAllocationRule(input.allocationRule);
    let computation = await findComputation(input.purchaseOrderId);
    if (computation) assertDraft(computation);

    if (!computation) {
        computation = await directusJson<ComputationRecord>(`/items/${COMPUTATION_COLLECTION}`, {
            method: "POST",
            body: JSON.stringify({
                purchase_order_id: input.purchaseOrderId,
                allocation_rule: allocationRule,
                status: "DRAFT",
                source_flow: input.sourceFlow || "MANUFACTURING_PROCUREMENT",
                created_by: input.actorId || null
            })
        });
    } else {
        computation = await directusJson<ComputationRecord>(`/items/${COMPUTATION_COLLECTION}/${computation.id}`, {
            method: "PATCH",
            body: JSON.stringify({ allocation_rule: allocationRule, status: "DRAFT", source_flow: input.sourceFlow || computation.source_flow || "MANUFACTURING_PROCUREMENT", failure_reason: null })
        });
    }

    const existingExpenses = await listRows(EXPENSE_COLLECTION, `filter[computation_id][_eq]=${computation.id}&limit=-1`);
    for (const expense of existingExpenses) {
        if (expense.id) await directusJson(`/items/${EXPENSE_COLLECTION}/${expense.id}`, { method: "DELETE" });
    }
    for (const expense of input.expenses) {
        const amount = Math.max(0, asNumber(expense.amount_php));
        if (amount <= 0 && !expense.overhead_id && !expense.chart_of_account_id) continue;
        await directusJson(`/items/${EXPENSE_COLLECTION}`, {
            method: "POST",
            body: JSON.stringify({
                computation_id: computation.id,
                overhead_id: expense.overhead_id || null,
                chart_of_account_id: expense.chart_of_account_id || null,
                expense_type: expense.expense_type || "",
                amount_php: amount
            })
        });
    }
    return getLandedCostComputation(input.purchaseOrderId);
}

async function loadSettings(): Promise<{ inventoryAccountId: number; varianceAccountId: number }> {
    const settingsRows = await listRows("manufacturing_landed_cost_settings", "filter[is_active][_eq]=1&limit=1");
    const row = settingsRows[0];
    const inventoryAccountId = asPositiveId(row?.inventory_account_id);
    const varianceAccountId = asPositiveId(row?.rounding_variance_account_id);
    if (!inventoryAccountId || !varianceAccountId) {
        throw new LandedCostDomainError(409, "LANDED_COST_ACCOUNTS_NOT_CONFIGURED", "Inventory and rounding-variance chart-of-account mappings are required before finalization.");
    }
    return { inventoryAccountId, varianceAccountId };
}

async function createRow(collection: string, payload: Record<string, unknown>): Promise<DirectusRecord> {
    return directusJson<DirectusRecord>(`/items/${collection}`, {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

async function deleteRow(collection: string, id: number): Promise<void> {
    await directusJson(`/items/${collection}/${id}`, { method: "DELETE" });
}

async function patchRow(collection: string, id: number, payload: Record<string, unknown>): Promise<DirectusRecord> {
    return directusJson<DirectusRecord>(`/items/${collection}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
}

function buildCalculation(snapshot: LandedCostInputSnapshot, rule: AllocationRule, expenses: LandedCostExpenseInput[]): LandedCostCalculationResult {
    const lines = snapshot.lines.map(line => ({
        key: line.key,
        category_type: line.categoryType,
        quantity: line.quantity,
        baseUnitCostPhp: line.baseUnitCostPhp,
        lineGrossWeightKg: line.lineGrossWeightKg,
        volume: line.volume
    }));
    const totalFee = expenses.reduce((sum, expense) => sum + Math.max(0, asNumber(expense.amount_php)), 0);
    return calculateLandedCost(lines, totalFee, rule);
}

export async function previewLandedCost(input: {
    purchaseOrderId: number;
    allocationRule: unknown;
    expenses: LandedCostExpenseInput[];
}) {
    const allocationRule = requireAllocationRule(input.allocationRule);
    const snapshot = await loadLandedCostSnapshot(input.purchaseOrderId);
    return {
        allocationRule,
        calculation: buildCalculation(snapshot, allocationRule, input.expenses),
        lines: snapshot.lines.map(line => ({
            key: line.key,
            productId: line.productId,
            productName: line.productName,
            categoryType: line.categoryType,
            quantity: line.quantity,
            baseUnitCostPhp: line.baseUnitCostPhp,
            unitPriceForeign: line.unitPriceForeign,
            lineGrossWeightKg: line.lineGrossWeightKg
        }))
    };
}

export async function finalizeLandedCost(input: {
    purchaseOrderId: number;
    computationId?: number | null;
    allocationRule?: unknown;
    expenses?: LandedCostExpenseInput[];
    actorId?: number | null;
    sourceFlow?: string;
}) {
    const existing = await findComputation(input.purchaseOrderId);
    if (existing?.status === "FINALIZED") return getLandedCostComputation(input.purchaseOrderId);
    await assertLandedCostPostingEligible(input.purchaseOrderId);

    const allocationRule = requireAllocationRule(input.allocationRule || existing?.allocation_rule);
    if (existing && input.computationId && existing.id !== input.computationId) {
        throw new LandedCostDomainError(409, "COMPUTATION_MISMATCH", "The selected landed-cost draft no longer matches this purchase order.");
    }
    const draft = await saveLandedCostDraft({
        purchaseOrderId: input.purchaseOrderId,
        allocationRule,
        expenses: input.expenses || (existing ? await getComputationExpenses(existing.id) : []),
        actorId: input.actorId,
        sourceFlow: input.sourceFlow
    });
    const computation = draft.computation as ComputationRecord;
    const snapshot = await loadLandedCostSnapshot(input.purchaseOrderId);
    const expenses = await getComputationExpenses(computation.id);
    const calculation = buildCalculation(snapshot, allocationRule, expenses);
    await loadSettings();

    const finalizationKey = `PO-${input.purchaseOrderId}-LC-${computation.id}`;
    if (computation.status === "FINALIZED") return draft;
    await patchRow(COMPUTATION_COLLECTION, computation.id, {
        status: "FINALIZING",
        finalization_key: finalizationKey,
        total_shipment_value: calculation.totalShipmentValue,
        total_landed_fee: calculation.totalLandedFee,
        rm_value_share: calculation.rmValueShare,
        pkg_value_share: calculation.pkgValueShare,
        rm_fee_pool: calculation.rmFeePool,
        pkg_fee_pool: calculation.pkgFeePool,
        fg_value_share: calculation.fgValueShare,
        fg_fee_pool: calculation.fgFeePool,
        rounding_variance: calculation.roundingVariance,
        rounding_recipient_line_id: calculation.roundingRecipientKey,
        failure_reason: null
    });

    const rollback: Array<() => Promise<void>> = [];
    const createdRows: Array<{ collection: string; id: number }> = [];
    const productBefore = new Map<number, { cost_per_unit: unknown; estimated_unit_cost: unknown }>();
    const receivingBefore = new Map<number, Record<string, unknown>>();
    const compatibilityExpenseRows: DirectusRecord[] = [];
    try {
        const existingAllocations = await listRows("purchase_order_landed_cost_allocations", `filter[computation_id][_eq]=${computation.id}&limit=-1`);
        for (const row of existingAllocations) {
            if (!row.id) continue;
            await deleteRow("purchase_order_landed_cost_allocations", Number(row.id));
            rollback.push(() => createRow("purchase_order_landed_cost_allocations", row).then(() => undefined));
        }
        for (const line of calculation.lines) {
            const source = snapshot.lines.find(candidate => candidate.key === line.key);
            if (!source) continue;
            const allocation = await createRow("purchase_order_landed_cost_allocations", {
                computation_id: computation.id,
                purchase_order_product_id: source.key,
                receiving_line_id: source.key,
                product_id: source.productId,
                category_type: source.categoryType,
                received_quantity: line.quantity,
                base_unit_cost_php: line.baseUnitCostPhp,
                commercial_value: line.commercialValue,
                value_share: line.valueShare,
                category_fee_pool: line.categoryFeePool,
                line_gross_weight_kg: line.lineGrossWeightKg,
                weight_share: line.weightShare,
                allocated_fee: line.allocatedExpense,
                rounding_variance: line.roundingVariance,
                added_unit_cost: line.addedUnitCost,
                final_landed_unit_cost: line.finalLandedUnitCost,
                is_rounding_recipient: line.key === calculation.roundingRecipientKey
            });
            const allocationId = asPositiveId(allocation.id);
            if (allocationId) {
                rollback.push(() => deleteRow("purchase_order_landed_cost_allocations", allocationId));
            }
        }

        const existingValuation = await listRows("purchase_order_inventory_valuation_ledger", `filter[computation_id][_eq]=${computation.id}&limit=-1`);
        for (const row of existingValuation) {
            if (!row.id) continue;
            await deleteRow("purchase_order_inventory_valuation_ledger", Number(row.id));
            rollback.push(() => createRow("purchase_order_inventory_valuation_ledger", row).then(() => undefined));
        }
        const productTotals = new Map<number, { quantity: number; cost: number }>();
        for (const line of calculation.lines) {
            const source = snapshot.lines.find(candidate => candidate.key === line.key);
            if (!source) continue;
            const current = productTotals.get(source.productId) || { quantity: 0, cost: 0 };
            productTotals.set(source.productId, {
                quantity: current.quantity + line.quantity,
                cost: current.cost + line.finalLandedUnitCost * line.quantity
            });
        }

        for (const [productId, total] of productTotals) {
            const product = snapshot.products.get(productId) || {};
            const beforeCost = asNumber(product.cost_per_unit);
            const afterCost = total.quantity > 0 ? roundMoney(total.cost / total.quantity) : beforeCost;
            productBefore.set(productId, {
                cost_per_unit: product.cost_per_unit,
                estimated_unit_cost: product.estimated_unit_cost
            });
            await patchRow("products", productId, {
                cost_per_unit: afterCost,
                estimated_unit_cost: afterCost
            });
            rollback.push(() => patchRow("products", productId, productBefore.get(productId) || {} ).then(() => undefined));

            const valuation = await createRow("purchase_order_inventory_valuation_ledger", {
                computation_id: computation.id,
                purchase_order_id: input.purchaseOrderId,
                purchase_order_product_id: calculation.lines.find(line => snapshot.lines.find(source => source.key === line.key)?.productId === productId)?.key,
                product_id: productId,
                quantity: total.quantity,
                unit_cost_before: beforeCost,
                unit_cost_after: afterCost,
                valuation_delta: roundMoney((afterCost - beforeCost) * total.quantity),
                posting_key: `${finalizationKey}-PRODUCT-${productId}`,
                posted_by: input.actorId || null
            });
            const valuationId = asPositiveId(valuation.id);
            if (valuationId) {
                rollback.push(() => deleteRow("purchase_order_inventory_valuation_ledger", valuationId));
            }
        }

        for (const line of calculation.lines) {
            const source = snapshot.lines.find(candidate => candidate.key === line.key);
            if (!source) continue;
            for (const receiving of source.receivingRows) {
                const receivingId = receivingRecordId(receiving);
                if (!receivingId) continue;
                receivingBefore.set(receivingId, {
                    allocated_expense_php: receiving.allocated_expense_php,
                    final_landed_unit_cost: receiving.final_landed_unit_cost,
                    is_posted_amounts: receiving.is_posted_amounts
                });
                await patchRow("purchase_order_receiving", receivingId, {
                    allocated_expense_php: line.addedUnitCost,
                    final_landed_unit_cost: line.finalLandedUnitCost,
                    is_posted_amounts: 1
                });
                rollback.push(() => patchRow("purchase_order_receiving", receivingId, receivingBefore.get(receivingId) || {}).then(() => undefined));
            }
        }

        const existingImports = await listRows("purchase_order_import", `filter[purchase_order_id][_eq]=${input.purchaseOrderId}&limit=-1`);
        const previousImportIds = existingImports
            .map(row => asPositiveId(row.id || row.po_import_id))
            .filter((id): id is number => id !== null);
        if (previousImportIds.length > 0) {
            const legacyImportAllocations = await listRows(
                "purchase_order_receiving_import_allocation",
                `filter[po_import_id][_in]=${previousImportIds.join(",")}&limit=-1`
            );
            for (const row of legacyImportAllocations) {
                if (!row.id) continue;
                await deleteRow("purchase_order_receiving_import_allocation", Number(row.id));
                rollback.push(() => createRow("purchase_order_receiving_import_allocation", row).then(() => undefined));
            }
        }
        for (const row of existingImports) {
            const importId = asPositiveId(row.id || row.po_import_id);
            if (!importId) continue;
            await deleteRow("purchase_order_import", importId);
            rollback.push(() => createRow("purchase_order_import", row).then(() => undefined));
        }
        const createdImportIds: number[] = [];
        for (const expense of expenses) {
            const importRow = await createRow("purchase_order_import", {
                purchase_order_id: input.purchaseOrderId,
                chart_of_account_id: expense.chart_of_account_id || null,
                amount: expense.amount_php,
                allocation_method: allocationRule === "Hybrid" ? "hybrid" : allocationRule.toLowerCase()
            });
            const importId = asPositiveId(importRow.id || importRow.po_import_id);
            if (importId) {
                createdImportIds.push(importId);
                createdRows.push({ collection: "purchase_order_import", id: importId });
                rollback.push(() => deleteRow("purchase_order_import", importId));
            }
        }
        if (createdImportIds.length > 0) {
            for (const line of calculation.lines) {
                const allocation = await createRow("purchase_order_receiving_import_allocation", {
                    po_import_id: createdImportIds[0],
                    purchase_order_product_id: line.key,
                    allocated_amount: line.allocatedExpense,
                    variance_adjustment: line.roundingVariance
                });
                const allocationId = asPositiveId(allocation.id);
                if (allocationId) {
                    createdRows.push({ collection: "purchase_order_receiving_import_allocation", id: allocationId });
                    rollback.push(() => deleteRow("purchase_order_receiving_import_allocation", allocationId));
                }
            }
        }

        const existingLegacyExpenses = await listRows("purchase_order_expenses", `filter[purchase_order_id][_eq]=${input.purchaseOrderId}&limit=-1`);
        for (const row of existingLegacyExpenses) {
            if (row.expense_id) {
                compatibilityExpenseRows.push(row);
                await deleteRow("purchase_order_expenses", Number(row.expense_id));
                rollback.push(() => createRow("purchase_order_expenses", row).then(() => undefined));
            }
        }
        for (const expense of expenses) {
            if (!expense.overhead_id) continue;
            const legacyExpense = await createRow("purchase_order_expenses", {
                purchase_order_id: input.purchaseOrderId,
                overhead_id: expense.overhead_id,
                expense_type: expense.expense_type || "",
                amount_php: expense.amount_php,
                allocation_method: allocationRule === "Hybrid" ? "Hybrid" : `By ${allocationRule}`,
                created_by: input.actorId || null
            });
            const legacyId = asPositiveId(legacyExpense.expense_id || legacyExpense.id);
            if (legacyId) {
                createdRows.push({ collection: "purchase_order_expenses", id: legacyId });
                rollback.push(() => deleteRow("purchase_order_expenses", legacyId));
            }
        }

        if (Math.abs(calculation.roundingVariance) > 0.000001) {
            const settings = await loadSettings();
            const entry = await createRow("purchase_order_landed_cost_journal_entries", {
                computation_id: computation.id,
                purchase_order_id: input.purchaseOrderId,
                entry_no: `LCV-${new Date().getUTCFullYear()}-${computation.id}`,
                status: "POSTED",
                total_debit: Math.abs(calculation.roundingVariance),
                total_credit: Math.abs(calculation.roundingVariance),
                posting_date: new Date().toISOString().slice(0, 10),
                posted_by: input.actorId || null
            });
            const entryId = asPositiveId(entry.id);
            if (entryId) {
                createdRows.push({ collection: "purchase_order_landed_cost_journal_entries", id: entryId });
                rollback.push(() => deleteRow("purchase_order_landed_cost_journal_entries", entryId));
                const positive = calculation.roundingVariance > 0;
                const journalLines = [
                    {
                        entry_id: entryId,
                        account_id: positive ? settings.inventoryAccountId : settings.varianceAccountId,
                        line_code: positive ? "INVENTORY" : "ROUNDING_VARIANCE",
                        debit: positive ? Math.abs(calculation.roundingVariance) : 0,
                        credit: positive ? 0 : Math.abs(calculation.roundingVariance),
                        remarks: `Landed-cost rounding residual for PO ${input.purchaseOrderId}.`
                    },
                    {
                        entry_id: entryId,
                        account_id: positive ? settings.varianceAccountId : settings.inventoryAccountId,
                        line_code: positive ? "ROUNDING_VARIANCE" : "INVENTORY",
                        debit: positive ? 0 : Math.abs(calculation.roundingVariance),
                        credit: positive ? Math.abs(calculation.roundingVariance) : 0,
                        remarks: `Landed-cost rounding residual for PO ${input.purchaseOrderId}.`
                    }
                ];
                for (const line of journalLines) {
                    const journalLine = await createRow("purchase_order_landed_cost_journal_lines", line);
                    const journalLineId = asPositiveId(journalLine.id);
                    if (journalLineId) {
                        createdRows.push({ collection: "purchase_order_landed_cost_journal_lines", id: journalLineId });
                        rollback.push(() => deleteRow("purchase_order_landed_cost_journal_lines", journalLineId));
                    }
                }
            }
        }

        await patchRow("purchase_order", input.purchaseOrderId, { is_posted_amounts: 1, is_posted: 1 });
        rollback.push(() => patchRow("purchase_order", input.purchaseOrderId, { is_posted_amounts: snapshot.purchaseOrder.is_posted_amounts, is_posted: snapshot.purchaseOrder.is_posted }).then(() => undefined));
        await patchRow(COMPUTATION_COLLECTION, computation.id, {
            status: "FINALIZED",
            finalized_by: input.actorId || null,
            finalized_at: new Date().toISOString(),
            failure_reason: null
        });
        return getLandedCostComputation(input.purchaseOrderId);
    } catch (error) {
        for (const undo of [...rollback].reverse()) await undo().catch(() => undefined);
        await patchRow(COMPUTATION_COLLECTION, computation.id, {
            status: "FAILED",
            failure_reason: error instanceof Error ? error.message : "Landed-cost finalization failed."
        }).catch(() => undefined);
        throw error;
    }
}

export function isLandedCostError(error: unknown): error is LandedCostDomainError | LandedCostEligibilityError | ProductCategoryTypeValidationError | ProductWeightValidationError {
    return error instanceof LandedCostDomainError
        || error instanceof LandedCostEligibilityError
        || error instanceof ProductCategoryTypeValidationError
        || error instanceof ProductWeightValidationError;
}
