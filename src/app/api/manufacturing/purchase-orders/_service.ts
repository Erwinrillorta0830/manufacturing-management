import { INVENTORY_STATUS, PAYMENT_STATUS } from "../procurement/_domain";
import { procurementDirectusFetch } from "../procurement/_directus";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";

import {
    buildPurchaseOrderProductPayload,
    calculatePurchaseOrderTotals,
    selectPurchaseOrderApprovalRule,
    type PurchaseOrderApprovalRule
} from "./_domain";
import type { z } from "zod";
import type { purchaseOrderCreateSchema } from "./_schemas";
import { assertMrpProductJobOrderPairs } from "./_mrp-validation";
import { PurchaseOrderFxRateError, resolvePurchaseOrderFxRate } from "./_fx-rate";
import { compareDecimals, normalizeDecimal, type DecimalInput } from "@/modules/manufacturing-management/decimal";
import { normalizeProductRelationId } from "@/modules/manufacturing-management/procurement/product-relation";

type PurchaseOrderDraft = z.infer<typeof purchaseOrderCreateSchema>;

export class PurchaseOrderDraftError extends Error {
    constructor(message: string, public readonly status = 400, public readonly details?: unknown) {
        super(message);
    }
}

type DirectusCategoryReference = number | string | { category_id?: number | string; id?: number | string } | null;
type DirectusParentReference = number | string | {
    product_id?: number | string;
    id?: number | string;
    product_category?: DirectusCategoryReference;
} | null;

interface DirectusProduct {
    product_id: number | string;
    parent_id?: DirectusParentReference;
    product_category?: DirectusCategoryReference;
}

interface DirectusPurchaseOrder {
    purchase_order_id: number;
    purchase_order_no: string;
}

function relationId(value: unknown): number | null {
    return normalizeProductRelationId(value);
}

function categoryId(value: unknown): number | null {
    if (value && typeof value === "object" && "category_id" in value) {
        const category = value as { category_id?: unknown };
        return normalizeProductRelationId(category.category_id);
    }
    return normalizeProductRelationId(value);
}

function approvalRule(row: Record<string, unknown>): PurchaseOrderApprovalRule {
    return {
        ruleId: Number(row.rule_id),
        priority: Number(row.priority || 0),
        minimumTotalPhp: normalizeDecimal(String(row.minimum_total_php ?? 0)),
        maximumTotalPhp: row.maximum_total_php == null ? null : normalizeDecimal(String(row.maximum_total_php)),
        currencyCode: typeof row.currency_code === "string" ? row.currency_code : null,
        importScope: row.import_scope === "Domestic" || row.import_scope === "Import" ? row.import_scope : "Any",
        productCategoryId: row.product_category_id == null
            ? null
            : Number(typeof row.product_category_id === "object"
                ? (row.product_category_id as { category_id?: number }).category_id
                : row.product_category_id) || null,
        requiresFinance: row.requires_finance === true || Number(row.requires_finance) === 1,
        allowSelfApproval: row.allow_self_approval === true || Number(row.allow_self_approval) === 1,
        effectiveFrom: typeof row.effective_from === "string" ? row.effective_from : null,
        effectiveTo: typeof row.effective_to === "string" ? row.effective_to : null,
        isActive: row.is_active === true || Number(row.is_active) === 1
    };
}

async function directusData<T>(path: string, message: string): Promise<T> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) throw new PurchaseOrderDraftError(message, 503);
    return (await response.json()).data as T;
}

function assertExpectedTotals(order: PurchaseOrderDraft, totals: ReturnType<typeof calculatePurchaseOrderTotals>) {
    const expected = order.expectedTotals;
    const actual = {
        grossPhp: totals.grossPhp,
        discountPhp: totals.discountPhp,
        vatPhp: totals.vatPhp,
        withholdingPhp: totals.withholdingPhp,
        netPhp: totals.netPhp,
        netForeign: totals.netForeign
    };
    const mismatches = Object.entries(actual).filter(([field, value]) =>
        compareDecimals(value, expected[field as keyof typeof expected]) !== 0
    );
    if (mismatches.length) {
        throw new PurchaseOrderDraftError("Purchase-order totals changed during validation. Review the calculated totals and submit again.", 409, actual);
    }
}

async function validateDraft(order: PurchaseOrderDraft) {
    const productIds = [...new Set(order.lines.map(line => line.productId))];
    const jobOrderIds = [...new Set(order.lines.flatMap(line => line.jobOrderId ? [line.jobOrderId] : []))];
    const branchIdNum = Number(order.branchId);

    const [supplier, products, mappings, branchRows, jobOrders, paymentTerm] = await Promise.all([
        directusData<Record<string, unknown>>(
            `/items/suppliers/${order.supplierId}?fields=id,isActive,nonBuy`,
            "Unable to validate the supplier."
        ),
        directusData<DirectusProduct[]>(
            `/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,parent_id.product_id,parent_id.product_category.category_id,product_category.category_id&limit=${productIds.length}`,
            "Unable to validate purchase-order products."
        ),
        directusData<Array<{ product_id: number | string | { product_id?: number | string; id?: number | string } }>>(
            `/items/product_per_supplier?filter[supplier_id][_eq]=${order.supplierId}&fields=product_id.product_id&limit=-1`,
            "Unable to validate supplier product mappings."
        ),
        directusData<Array<Record<string, unknown>>>(
            `/items/branches?filter[id][_eq]=${branchIdNum}&limit=1`,
            "Unable to validate the branch."
        ),
        jobOrderIds.length
            ? directusData<Array<{ job_order_id: number }>>(
                `/items/manufacturing_job_orders?filter[job_order_id][_in]=${jobOrderIds.join(",")}&fields=job_order_id&limit=${jobOrderIds.length}`,
                "Unable to validate job orders."
            )
            : Promise.resolve([]),
        directusData<Record<string, unknown>>(
            `/items/payment_terms/${order.paymentTermsId}?fields=id,payment_name,payment_days,payment_description`,
            "Unable to validate payment terms."
        )
    ]);

    const branch = branchRows && branchRows.length > 0 ? branchRows[0] : null;

    if (!(supplier.isActive === true || Number(supplier.isActive) === 1) || supplier.nonBuy === true || Number(supplier.nonBuy) === 1) {
        throw new PurchaseOrderDraftError("The selected supplier is not purchasing eligible.");
    }

    if (!branch) {
        throw new PurchaseOrderDraftError(`The selected branch (#${order.branchId}) was not found.`);
    }

    if (!paymentTerm?.id) {
        throw new PurchaseOrderDraftError("The selected payment terms were not found.");
    }

    const isBranchActive = (b: Record<string, unknown> | null | undefined): boolean => {
        if (!b) return false;
        const val = b.isActive ?? b.is_active ?? b.status;
        if (val === undefined || val === null) return true;
        if (typeof val === "string") {
            const lower = val.toLowerCase().trim();
            if (lower === "0" || lower === "false" || lower === "inactive" || lower === "disabled") return false;
            return true;
        }
        if (typeof val === "number") return val !== 0;
        if (typeof val === "boolean") return val;
        return true;
    };

    if (!isBranchActive(branch)) {
        throw new PurchaseOrderDraftError("The selected branch is inactive.");
    }
    const productsById = new Map(products.map(product => [Number(product.product_id), product]));
    const missingProductIds = productIds.filter(productId => !productsById.has(productId));
    if (missingProductIds.length > 0) {
        throw new PurchaseOrderDraftError("One or more selected products do not exist.", 400, { missingProductIds });
    }
    if (jobOrders.length !== jobOrderIds.length) throw new PurchaseOrderDraftError("One or more selected job orders do not exist.");
    await assertMrpProductJobOrderPairs(order.lines);

    const mappedIds = new Set(mappings
        .map(mapping => normalizeProductRelationId(mapping.product_id))
        .filter((id): id is number => id !== null));
    for (const [lineIndex, line] of order.lines.entries()) {
        const product = productsById.get(line.productId);
        const actualParentId = relationId(product?.parent_id) ?? line.productId;
        if (!mappedIds.has(line.productId) && !mappedIds.has(actualParentId)) {
            throw new PurchaseOrderDraftError(`Product ${line.productId} is not mapped to the selected supplier.`, 400, {
                lineIndex,
                productId: line.productId,
                canonicalParentProductId: actualParentId,
                supplierId: order.supplierId
            });
        }
    }

    return [...new Set(order.lines.flatMap(line => {
        const child = productsById.get(line.productId);
        const parent = child?.parent_id && typeof child.parent_id === "object" ? child.parent_id : null;
        const value = categoryId(child?.product_category) || categoryId(parent?.product_category);
        return value ? [value] : [];
    }))];
}

async function selectRuleForDraft(order: PurchaseOrderDraft, totalPhp: DecimalInput, productCategoryIds: number[]) {
    const rows = await directusData<Record<string, unknown>[]>(
        "/items/purchase_order_approval_rules?filter[is_active][_eq]=1&fields=*&sort=-priority&limit=-1",
        "Unable to load purchase-order approval rules."
    );
    const selected = selectPurchaseOrderApprovalRule(rows.map(approvalRule), {
        totalPhp,
        currencyCode: order.currencyCode,
        isImport: order.currencyCode !== "PHP",
        productCategoryIds,
        businessDate: await getTodayDateString()
    });
    if (!selected) throw new PurchaseOrderDraftError("No active approval rule matches this purchase order.", 409);
    return selected;
}

function nextSequence(rows: Array<{ purchase_order_no?: string }>, year: number): number {
    const prefix = `PO-${year}-`;
    return rows.reduce((maximum, row) => {
        const value = row.purchase_order_no || "";
        const sequence = value.startsWith(prefix) ? Number(value.slice(prefix.length)) : 0;
        return Number.isSafeInteger(sequence) ? Math.max(maximum, sequence) : maximum;
    }, 0) + 1;
}

async function reservePurchaseOrderNumber(year: number, payload: Record<string, unknown>): Promise<DirectusPurchaseOrder> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const rows = await directusData<Array<{ purchase_order_no?: string }>>(
            `/items/purchase_order?filter[purchase_order_no][_starts_with]=PO-${year}-&fields=purchase_order_no&sort=-purchase_order_no&limit=1`,
            "Unable to generate a purchase-order number."
        );
        const sequence = nextSequence(rows, year);
        const purchaseOrderNo = `PO-${year}-${String(sequence).padStart(6, "0")}`;
        const response = await procurementDirectusFetch("/items/purchase_order", {
            method: "POST",
            body: JSON.stringify({ ...payload, purchase_order_no: purchaseOrderNo })
        });
        if (response.ok) return (await response.json()).data as DirectusPurchaseOrder;
        const body = await response.json().catch(() => null);
        const duplicate = response.status === 409
            || body?.errors?.some((error: { extensions?: { code?: string }; message?: string }) =>
                error.extensions?.code === "RECORD_NOT_UNIQUE"
                || /unique|duplicate/i.test(error.message || "")
            );
        if (!duplicate) throw new PurchaseOrderDraftError(
            body?.errors?.[0]?.message || `Failed to create the purchase-order header (${response.status}).`,
            response.status >= 500 ? 503 : 400
        );
    }
    throw new PurchaseOrderDraftError("A unique purchase-order number could not be generated. Try again.", 409);
}

async function deleteCreatedOrder(poId: number, lineIds: number[]) {
    const failures: string[] = [];
    for (const lineId of [...lineIds].reverse()) {
        const response = await procurementDirectusFetch(`/items/purchase_order_products/${lineId}`, { method: "DELETE" }).catch(() => null);
        if (!response?.ok) failures.push(`purchase_order_products/${lineId}`);
    }
    const headerResponse = await procurementDirectusFetch(`/items/purchase_order/${poId}`, { method: "DELETE" }).catch(() => null);
    if (!headerResponse?.ok) failures.push(`purchase_order/${poId}`);
    return failures;
}

export async function createPurchaseOrderDraft(order: PurchaseOrderDraft, actorId: number) {
    let authoritativeFxRate;
    try {
        authoritativeFxRate = await resolvePurchaseOrderFxRate(order.currencyCode);
    } catch (error) {
        if (error instanceof PurchaseOrderFxRateError) {
            throw new PurchaseOrderDraftError(error.message, error.status, {
                code: error.code,
                ...(error.details && typeof error.details === "object" ? error.details : {})
            });
        }
        throw error;
    }
    if (compareDecimals(order.exchangeRate, authoritativeFxRate.exchangeRate) !== 0) {
        throw new PurchaseOrderDraftError(
            `The ${order.currencyCode} exchange rate changed. Reload the current rate and submit again.`,
            409,
            {
                code: "FX_RATE_STALE",
                currencyCode: authoritativeFxRate.currencyCode,
                expectedExchangeRate: authoritativeFxRate.exchangeRate,
                providedExchangeRate: order.exchangeRate
            }
        );
    }
    const exchangeRate = authoritativeFxRate.exchangeRate;
    const productCategoryIds = await validateDraft(order);
    const totals = calculatePurchaseOrderTotals(order.lines, exchangeRate);
    assertExpectedTotals(order, totals);
    const selectedRule = await selectRuleForDraft(order, totals.netPhp, productCategoryIds);
    const now = new Date();
    const header = await reservePurchaseOrderNumber(now.getFullYear(), {
        reference: order.externalReference || null,
        remark: "Purchase order created in For Approval status.",
        supplier_name: order.supplierId,
        receiving_type: 1,
        payment_type: order.paymentTypeId,
        price_type: order.priceType,
        date_encoded: now.toISOString(),
        date: await getTodayDateString(),
        time: now.toTimeString().split(" ")[0],
        datetime: now.toISOString().replace("Z", "").replace("T", " "),
        gross_amount: totals.grossPhp,
        total_amount: totals.netPhp,
        inventory_status: INVENTORY_STATUS.REQUESTED,
        payment_status: PAYMENT_STATUS.PENDING,
        payment_terms: order.paymentTermsId,
        branch_id: order.branchId,
        is_posted: 0,
        encoder_id: actorId,
        currency_code: authoritativeFxRate.currencyCode,
        exchange_rate: exchangeRate,
        total_foreign_currency: totals.netForeign,
        is_import: order.currencyCode === "PHP" ? 0 : 1,
        workflow_revision: 0
        ,approval_rule_id: selectedRule.ruleId
         ,approval_requires_finance: 1
        ,approval_allow_self_approval: 1
    });

    const createdLineIds: number[] = [];
    try {
        for (let index = 0; index < order.lines.length; index += 1) {
            const line = order.lines[index];
            const amount = totals.lines[index];
            const response = await procurementDirectusFetch("/items/purchase_order_products", {
                method: "POST",
                body: JSON.stringify(buildPurchaseOrderProductPayload({
                    purchaseOrderId: header.purchase_order_id,
                    productId: line.productId,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    discountPercent: line.discountPercent,
                    vatPercent: line.vatPercent,
                    withholdingPercent: line.withholdingPercent,
                    exchangeRate: exchangeRate,
                    branchId: order.branchId,
                    purchaseIntent: line.purchaseIntent,
                    jobOrderId: line.jobOrderId,
                    received: 0
                }, amount))
            });
            if (!response.ok) throw new Error(`Line ${index + 1} could not be created (${response.status}).`);
            createdLineIds.push(Number((await response.json()).data.purchase_order_product_id));
        }
    } catch (error) {
        const failures = await deleteCreatedOrder(header.purchase_order_id, createdLineIds);
        if (failures.length) {
            console.error("Purchase-order compensation requires intervention.", { poId: header.purchase_order_id, failures, error });
            throw new PurchaseOrderDraftError("Purchase-order creation failed and automatic cleanup was incomplete.", 503, {
                cleanupRequired: true,
                purchaseOrderId: header.purchase_order_id,
                purchaseOrderNo: header.purchase_order_no,
                failedOperations: failures
            });
        }
        throw new PurchaseOrderDraftError((error as Error).message || "Purchase-order lines could not be created.", 503);
    }

    return {
        success: true,
        purchaseOrderId: header.purchase_order_id,
        purchaseOrderNo: header.purchase_order_no,
        status: "For Approval",
        currencyCode: authoritativeFxRate.currencyCode,
        exchangeRate,
        totals: {
            grossPhp: totals.grossPhp,
            discountPhp: totals.discountPhp,
            vatPhp: totals.vatPhp,
            withholdingPhp: totals.withholdingPhp,
            netPhp: totals.netPhp,
            netForeign: totals.netForeign
        }
    };
}

export async function fetchPurchaseOrderCatalog() {
    const [suppliers, branches, jobOrders, paymentTerms] = await Promise.all([
        directusData<unknown[]>("/items/suppliers?filter[isActive][_eq]=1&filter[nonBuy][_eq]=0&fields=id,supplier_name,is_foreign,currency,country&sort=supplier_name&limit=-1", "Unable to load eligible suppliers."),
        directusData<unknown[]>("/items/branches?filter[isActive][_eq]=1&fields=id,branch_name,branch_code&sort=branch_name&limit=200", "Unable to load branches."),
        directusData<unknown[]>("/items/manufacturing_job_orders?fields=job_order_id,job_order_no,status&sort=-job_order_id&limit=250", "Unable to load job orders."),
        directusData<unknown[]>("/items/payment_terms?fields=id,payment_name,payment_days,payment_description&sort=payment_name&limit=-1", "Unable to load payment terms.")
    ]);
    const paymentTypes = [
        { id: 1, name: "Advance Payment" },
        { id: 2, name: "Partial Payment" },
        { id: 3, name: "Full Payment" },
        { id: 4, name: "Refund" },
        { id: 5, name: "Installment" }
    ];
    return { suppliers, branches, paymentTypes, paymentTerms, jobOrders };
}

