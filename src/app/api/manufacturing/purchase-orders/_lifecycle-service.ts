import { INVENTORY_STATUS, todayInManila } from "../procurement/_domain";
import { procurementDirectusFetch } from "../procurement/_directus";
import {
    buildPurchaseOrderProductPayload,
    calculatePurchaseOrderTotals,
    PurchaseOrderDiscountError,
    selectPurchaseOrderApprovalRule,
    type PurchaseOrderApprovalRule
} from "./_domain";
import type { z } from "zod";
import type { purchaseOrderCancellationSchema, purchaseOrderRevisionSchema } from "./_schemas";
import type { AuthorizedPurchaseOrderUser } from "./_auth";
import { assertMrpProductJobOrderPairs } from "./_mrp-validation";
import { fetchCurrentPurchaseOrderRejectionStage } from "./_rejection-guard";
import { PurchaseOrderPaymentModeError, validatePurchaseOrderPaymentMode } from "./_payment-modes";
import {
    assertEnteredPricesForMissingPriceControl,
    PurchaseOrderPriceTypeError,
    resolvePurchaseOrderPriceType
} from "./_price-type";
import { compareDecimals, normalizeDecimal, type DecimalInput } from "@/modules/manufacturing-management/decimal";
import {
    buildPurchaseOrderRevisionSnapshot,
    type PurchaseOrderRevisionSnapshot
} from "@/modules/manufacturing-management/purchase-order/revision-snapshot";
import {
    validatePurchaseOrderCategoryTypes,
    type PurchaseOrderCategoryType
} from "../procurement/_category-type";
import {
    ProductWeightValidationError,
    resolveProductWeightBreakdown
} from "@/modules/manufacturing-management/procurement/packaging-weight";

type RevisionCommand = z.infer<typeof purchaseOrderRevisionSchema>;
type CancellationCommand = z.infer<typeof purchaseOrderCancellationSchema>;

export class PurchaseOrderLifecycleError extends Error {
    constructor(message: string, public readonly status = 400, public readonly details?: unknown) {
        super(message);
    }
}

interface PurchaseOrderRecord {
    [key: string]: unknown;
    purchase_order_id: number;
    purchase_order_no?: string | null;
    reference?: string | null;
    remark?: string | null;
    supplier_name?: unknown;
    branch_id?: number | null;
    payment_type?: number | null;
    payment_mode?: number | null;
    payment_terms?: number | null;
    delivery_terms?: string | null;
    price_type?: string | null;
    currency_code?: string | null;
    exchange_rate?: number | string | null;
    total_foreign_currency?: number | string | null;
    gross_amount?: number | string | null;
    total_amount?: number | string | null;
    inventory_status: number;
    date_received?: string | null;
    lead_time_receiving?: string | null;
    approver_id?: number | null;
    date_approved?: string | null;
    finance_id?: number | null;
    date_financed?: string | null;
    workflow_revision?: number | null;
    approval_rule_id?: number | null;
    approval_requires_finance?: boolean | number | null;
    approval_allow_self_approval?: boolean | number | null;
    is_import?: boolean | number | null;
}

interface PurchaseOrderLineRecord {
    purchase_order_product_id: number;
    [key: string]: unknown;
}

function asBoolean(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

function relationId(value: unknown, key: string): number | null {
    if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
    if (!value || typeof value !== "object") return null;
    const parsed = Number((value as Record<string, unknown>)[key]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapApprovalRule(row: Record<string, unknown>): PurchaseOrderApprovalRule {
    return {
        ruleId: Number(row.rule_id),
        priority: Number(row.priority || 0),
        minimumTotalPhp: normalizeDecimal(String(row.minimum_total_php ?? 0)),
        maximumTotalPhp: row.maximum_total_php == null ? null : normalizeDecimal(String(row.maximum_total_php)),
        currencyCode: typeof row.currency_code === "string" ? row.currency_code : null,
        importScope: row.import_scope === "Domestic" || row.import_scope === "Import" ? row.import_scope : "Any",
        productCategoryId: relationId(row.product_category_id, "category_id"),
        requiresFinance: asBoolean(row.requires_finance),
        allowSelfApproval: asBoolean(row.allow_self_approval),
        effectiveFrom: typeof row.effective_from === "string" ? row.effective_from : null,
        effectiveTo: typeof row.effective_to === "string" ? row.effective_to : null,
        isActive: asBoolean(row.is_active)
    };
}

async function directusData<T>(path: string, message: string): Promise<T> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) throw new PurchaseOrderLifecycleError(message, response.status >= 500 ? 503 : response.status);
    return (await response.json()).data as T;
}

async function loadOrder(id: number): Promise<PurchaseOrderRecord> {
    return directusData<PurchaseOrderRecord>(
        `/items/purchase_order/${id}?fields=*`,
        "Purchase order was not found."
    );
}

async function loadLines(id: number): Promise<PurchaseOrderLineRecord[]> {
    return directusData<PurchaseOrderLineRecord[]>(
        `/items/purchase_order_products?filter[purchase_order_id][_eq]=${id}&fields=*&limit=-1`,
        "Unable to load purchase-order lines."
    );
}

async function loadCategoryIds(productIds: number[]): Promise<number[]> {
    const rows = await directusData<Array<{
        product_id?: number;
        parent_id?: { product_id?: number; product_category?: { category_id?: number } } | null;
        product_category?: { category_id?: number } | null;
    }>>(
        `/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,parent_id.product_id,parent_id.product_category.category_id,product_category.category_id&limit=-1`,
        "Unable to validate revised purchase-order products."
    );
    if (rows.length !== new Set(productIds).size) {
        throw new PurchaseOrderLifecycleError("One or more revised purchase-order products do not exist.", 400);
    }
    return [...new Set(rows.flatMap(row => {
        const category = Number(row.product_category?.category_id || row.parent_id?.product_category?.category_id || 0);
        return category > 0 ? [category] : [];
    }))];
}

async function validateRevisionProductWeights(
    productIds: number[],
    categoryTypes: ReadonlyMap<number, PurchaseOrderCategoryType>
) {
    const rows = await directusData<Array<Record<string, unknown>>>(
        `/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,weight,product_weight,net_weight,outer_carton_weight,pallet_weight,weight_unit_id.*&limit=-1`,
        "Unable to validate revised product weights."
    );
    const products = new Map(rows.map(row => [Number(row.product_id), row]));
    for (const productId of productIds) {
        const product = products.get(productId);
        if (!product) throw new PurchaseOrderLifecycleError(`Product ${productId} was not found while validating the revision.`, 400);
        try {
            resolveProductWeightBreakdown(product, {
                requireComplete: categoryTypes.get(productId) === "PACKAGING"
            });
        } catch (error) {
            if (error instanceof ProductWeightValidationError) {
                throw new PurchaseOrderLifecycleError(`Product ${productId}: ${error.message}`, error.status);
            }
            throw error;
        }
    }
}

async function validateRevisionReferences(command: RevisionCommand) {
    const productIds = command.lineItems.map(line => Number(line.product_id));
    const jobOrderIds = command.lineItems
        .filter(line => line.purchase_intent === "MRP_Demand")
        .map(line => Number(line.job_order_id));
    for (const line of command.lineItems) {
        const intent = line.purchase_intent || "Buffer_Stock";
        const jobOrderId = Number(line.job_order_id || 0);
        if (intent !== "MRP_Demand" && intent !== "Buffer_Stock") {
            throw new PurchaseOrderLifecycleError("Purchase intent must be MRP demand or Buffer stock.", 400);
        }
        if (intent === "MRP_Demand" && (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0)) {
            throw new PurchaseOrderLifecycleError("MRP demand requires a valid job order.", 400);
        }
        if (intent === "Buffer_Stock" && line.job_order_id) {
            throw new PurchaseOrderLifecycleError("Buffer stock cannot be linked to a job order.", 400);
        }
    }
    const branchIdNum = Number(command.shipmentData.branch_id);

    const [supplier, branchRows, paymentTerm] = await Promise.all([
        directusData<Record<string, unknown>>(
            `/items/suppliers/${command.shipmentData.supplier_id}?fields=id,isActive,nonBuy`,
            "Unable to validate the revised supplier."
        ),
        directusData<Array<Record<string, unknown>>>(
            `/items/branches?filter[id][_eq]=${branchIdNum}&limit=1`,
            "Unable to validate the revised branch."
        ),
        command.shipmentData.payment_terms == null
            ? Promise.resolve<Record<string, unknown> | null>(null)
            : directusData<Record<string, unknown>>(
                `/items/payment_terms/${command.shipmentData.payment_terms}?fields=id,payment_name,payment_days,payment_description`,
                "Unable to validate the revised payment terms."
            )
    ]);

    const branch = branchRows && branchRows.length > 0 ? branchRows[0] : null;

    if (!asBoolean(supplier.isActive) || asBoolean(supplier.nonBuy)) {
        throw new PurchaseOrderLifecycleError("The revised supplier is not purchasing eligible.", 400);
    }

    if (!branch) {
        throw new PurchaseOrderLifecycleError(`The revised branch (#${command.shipmentData.branch_id}) was not found.`, 400);
    }

    if (command.shipmentData.payment_terms != null && !paymentTerm?.id) {
        throw new PurchaseOrderLifecycleError("The revised payment terms were not found.", 400);
    }

    try {
        await validatePurchaseOrderPaymentMode(command.shipmentData.payment_mode);
    } catch (error) {
        if (error instanceof PurchaseOrderPaymentModeError) {
            throw new PurchaseOrderLifecycleError(error.message, error.status);
        }
        throw error;
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
        throw new PurchaseOrderLifecycleError("The revised branch is inactive.", 400);
    }
    const categoryTypes = await validatePurchaseOrderCategoryTypes(command.lineItems.map(line => ({
        productId: Number(line.product_id),
        categoryType: line.category_type
    })));
    await validateRevisionProductWeights(productIds, categoryTypes);
    await loadCategoryIds(productIds);
    const distinctJobOrderIds = [...new Set(jobOrderIds)];
    if (distinctJobOrderIds.length > 0) {
        const rows = await directusData<Array<{ job_order_id: number }>>(
            `/items/manufacturing_job_orders?filter[job_order_id][_in]=${distinctJobOrderIds.join(",")}&fields=job_order_id&limit=${distinctJobOrderIds.length}`,
            "Unable to validate revised job orders."
        );
        if (rows.length !== distinctJobOrderIds.length) {
            throw new PurchaseOrderLifecycleError("One or more revised job orders do not exist.", 400);
        }
    }
    await assertMrpProductJobOrderPairs(command.lineItems);
}

async function resolveApprovalRule(totalPhp: DecimalInput, currencyCode: string, productIds: number[]) {
    const [categoryIds, rows] = await Promise.all([
        loadCategoryIds(productIds),
        directusData<Record<string, unknown>[]>(
            "/items/purchase_order_approval_rules?filter[is_active][_eq]=1&fields=*&sort=-priority&limit=-1",
            "Unable to load purchase-order approval rules."
        )
    ]);
    const selected = selectPurchaseOrderApprovalRule(rows.map(mapApprovalRule), {
        totalPhp,
        currencyCode,
        isImport: currencyCode !== "PHP",
        productCategoryIds: categoryIds,
        businessDate: todayInManila()
    });
    if (!selected) throw new PurchaseOrderLifecycleError("No active approval rule matches this revised purchase order.", 409);
    return selected;
}

function legacyLineAmounts(line: RevisionCommand["lineItems"][number], exchangeRate: DecimalInput) {
    return {
        quantity: Number(line.quantity_ordered),
        unitPrice: line.base_unit_cost_php,
        discountMode: line.discount_mode || "Percentage",
        discountPercent: Number(line.discount_percent || 0),
        discountAmount: line.discount_amount || 0,
        vatPercent: Number(line.vat_percent || 0),
        withholdingPercent: Number(line.withholding_percent || 0),
        exchangeRate
    };
}

function linePayload(
    purchaseOrderId: number,
    line: RevisionCommand["lineItems"][number],
    amount: ReturnType<typeof calculatePurchaseOrderTotals>["lines"][number],
    exchangeRate: DecimalInput
) {
    return buildPurchaseOrderProductPayload({
        purchaseOrderId,
        productId: Number(line.product_id),
        categoryType: line.category_type,
        quantity: Number(line.quantity_ordered),
        unitPrice: line.base_unit_cost_php,
        discountMode: line.discount_mode || "Percentage",
        discountPercent: Number(line.discount_percent || 0),
        discountAmount: line.discount_amount || 0,
        vatPercent: Number(line.vat_percent || 0),
        withholdingPercent: Number(line.withholding_percent || 0),
        exchangeRate,
        purchaseIntent: line.purchase_intent === "MRP_Demand" ? "MRP_Demand" : "Buffer_Stock",
        jobOrderId: line.job_order_id ? Number(line.job_order_id) : null
    }, amount);
}

async function conditionalPatch(id: number, expectedRevision: number, data: Record<string, unknown>, status?: number) {
    const filter: Record<string, unknown> = {
        purchase_order_id: { _eq: id },
        workflow_revision: { _eq: expectedRevision }
    };
    if (status !== undefined) filter.inventory_status = { _eq: status };
    const response = await procurementDirectusFetch("/items/purchase_order", {
        method: "PATCH",
        body: JSON.stringify({ query: { filter, limit: 1 }, data })
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new PurchaseOrderLifecycleError(body?.errors?.[0]?.message || "Unable to update the purchase-order workflow.", 503);
    }
    const rows = ((await response.json()).data || []) as PurchaseOrderRecord[];
    return rows.length === 1;
}

function rollbackHeader(order: PurchaseOrderRecord) {
    return {
        reference: order.reference || null,
        remark: order.remark || null,
        supplier_name: order.supplier_name || null,
        branch_id: order.branch_id || null,
        payment_type: order.payment_type || null,
        payment_mode: order.payment_mode || null,
        payment_terms: order.payment_terms || null,
        delivery_terms: order.delivery_terms || null,
        price_type: order.price_type || null,
        currency_code: order.currency_code || "PHP",
        exchange_rate: order.exchange_rate || 1,
        total_foreign_currency: order.total_foreign_currency || 0,
        gross_amount: order.gross_amount || 0,
        total_amount: order.total_amount || 0,
        inventory_status: order.inventory_status,
        date_received: order.date_received || null,
        lead_time_receiving: order.lead_time_receiving || null,
        approver_id: order.approver_id || null,
        date_approved: order.date_approved || null,
        finance_id: order.finance_id || null,
        date_financed: order.date_financed || null,
        workflow_revision: Number(order.workflow_revision || 0),
        approval_rule_id: order.approval_rule_id || null,
        approval_requires_finance: order.approval_requires_finance ?? null,
        approval_allow_self_approval: order.approval_allow_self_approval ?? null,
        is_import: order.is_import ?? null
    };
}

async function createLine(payload: Record<string, unknown>): Promise<number> {
    const response = await procurementDirectusFetch("/items/purchase_order_products", {
        method: "POST",
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new PurchaseOrderLifecycleError("A revised purchase-order line could not be created.", 503);
    return Number((await response.json()).data?.purchase_order_product_id);
}

async function deleteLine(id: number) {
    const response = await procurementDirectusFetch(`/items/purchase_order_products/${id}`, { method: "DELETE" });
    if (!response.ok) throw new PurchaseOrderLifecycleError(`Purchase-order line ${id} could not be removed during revision.`, 503);
}

async function restoreLine(line: PurchaseOrderLineRecord, purchaseOrderId: number) {
    const payload = Object.fromEntries(
        Object.entries(line).filter(([key]) => key !== "purchase_order_product_id")
    );
    await createLine({ ...payload, purchase_order_id: purchaseOrderId });
}

async function assertRevisionSnapshotStorage() {
    const response = await procurementDirectusFetch(
        "/items/purchase_order_approval_history?fields=history_id,revision_snapshot&limit=1"
    );
    if (!response.ok) {
        throw new PurchaseOrderLifecycleError(
            "Purchase-order revision snapshots are not available. Apply the revision snapshot database and Directus setup first.",
            503
        );
    }
}

async function writeHistory(
    id: number,
    action: "Resubmitted" | "Cancelled",
    actor: AuthorizedPurchaseOrderUser,
    remarks: string,
    fromStatus: number,
    toStatus: number,
    revision: number,
    nextRevision: number,
    revisionSnapshot?: PurchaseOrderRevisionSnapshot | null
) {
    const response = await procurementDirectusFetch("/items/purchase_order_approval_history", {
        method: "POST",
        body: JSON.stringify({
            purchase_order_id: id,
            action,
            approval_stage: "System",
            actor_id: actor.userId,
            actor_role_id: actor.roleId,
            remarks,
            from_inventory_status: fromStatus,
            to_inventory_status: toStatus,
            revision_before: revision,
            revision_after: nextRevision,
            revision_snapshot: action === "Resubmitted" ? revisionSnapshot || null : null,
            created_at: new Date().toISOString()
        })
    });
    if (!response.ok) throw new PurchaseOrderLifecycleError("Purchase-order workflow history could not be recorded.", 503);
}

async function rollbackRevision(
    id: number,
    nextRevision: number,
    order: PurchaseOrderRecord,
    oldLines: PurchaseOrderLineRecord[],
    deletedLineIds: number[],
    createdLineIds: number[]
) {
    const failures: string[] = [];
    for (const lineId of [...createdLineIds].reverse()) {
        try { await deleteLine(lineId); } catch { failures.push(`purchase_order_products/${lineId}`); }
    }
    const deleted = new Set(deletedLineIds);
    for (const line of oldLines) {
        if (!deleted.has(line.purchase_order_product_id)) continue;
        try { await restoreLine(line, id); } catch { failures.push(`restore purchase_order_products/${line.purchase_order_product_id}`); }
    }
    try {
        const restored = await conditionalPatch(id, nextRevision, rollbackHeader(order));
        if (!restored) failures.push(`purchase_order/${id}`);
    } catch {
        failures.push(`purchase_order/${id}`);
    }
    return failures;
}

const revisionLocks = new Map<number, Promise<void>>();

async function withRevisionLock<T>(purchaseOrderId: number, operation: () => Promise<T>): Promise<T> {
    const previous = revisionLocks.get(purchaseOrderId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
        release = resolve;
    });
    const queued = previous.then(() => current);
    revisionLocks.set(purchaseOrderId, queued);

    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (revisionLocks.get(purchaseOrderId) === queued) revisionLocks.delete(purchaseOrderId);
    }
}

async function reviseRejectedPurchaseOrderUnlocked(id: number, command: RevisionCommand, actor: AuthorizedPurchaseOrderUser) {
    const order = await loadOrder(id);
    const revision = Number(order.workflow_revision || 0);
    if (Number(order.inventory_status) !== INVENTORY_STATUS.REJECTED) {
        throw new PurchaseOrderLifecycleError("Only Rejected purchase orders can be revised through this action.", 409);
    }
    if (revision !== command.workflowRevision) {
        throw new PurchaseOrderLifecycleError("This purchase order changed. Reload it before revising it.", 409);
    }
    const rejectionStage = await fetchCurrentPurchaseOrderRejectionStage(
        id,
        order.inventory_status,
        revision
    );
    if (rejectionStage !== "Finance") {
        throw new PurchaseOrderLifecycleError("Purchase orders can only be revised after a formal Finance rejection.", 409);
    }

    const exchangeRate = command.shipmentData.exchange_rate;
    const currencyCode = String(command.shipmentData.currency_code || "PHP").toUpperCase();
    if (currencyCode !== "PHP" && currencyCode !== "USD") {
        throw new PurchaseOrderLifecycleError("Currency must be PHP or USD.", 400);
    }
    const currentCurrencyCode = String(order.currency_code || "PHP").toUpperCase();
    const currentExchangeRate = order.exchange_rate || 1;
    if (currencyCode !== currentCurrencyCode || compareDecimals(exchangeRate, currentExchangeRate) !== 0) {
        throw new PurchaseOrderLifecycleError("Currency and exchange rate are locked after purchase-order submission.", 409);
    }
    await validateRevisionReferences(command);
    const deliveryTerms = command.shipmentData.delivery_terms?.trim() || order.delivery_terms?.trim() || "";
    if (!deliveryTerms) {
        throw new PurchaseOrderLifecycleError("Delivery Terms are required for purchase-order revisions.", 400);
    }
    let resolvedPriceType;
    try {
        resolvedPriceType = await resolvePurchaseOrderPriceType(command.lineItems.map(line => Number(line.product_id)));
        assertEnteredPricesForMissingPriceControl(
            command.lineItems.map(line => ({
                productId: Number(line.product_id),
                unitPrice: line.base_unit_cost_php
            })),
            resolvedPriceType.missingProductIds
        );
    } catch (error) {
        if (error instanceof PurchaseOrderPriceTypeError) {
            throw new PurchaseOrderLifecycleError(error.message, error.status, {
                code: error.code,
                ...(error.details && typeof error.details === "object" ? error.details : {})
            });
        }
        throw error;
    }
    let totals: ReturnType<typeof calculatePurchaseOrderTotals>;
    try {
        totals = calculatePurchaseOrderTotals(command.lineItems.map(line => legacyLineAmounts(line, exchangeRate)), exchangeRate);
    } catch (error) {
        if (error instanceof PurchaseOrderDiscountError) {
            throw new PurchaseOrderLifecycleError(error.message, 400, {
                code: error.code,
                ...(error.details || {})
            });
        }
        throw error;
    }
    const rule = await resolveApprovalRule(totals.netPhp, currencyCode, command.lineItems.map(line => Number(line.product_id)));
    const oldLines = await loadLines(id);
    let revisionSnapshot: PurchaseOrderRevisionSnapshot;
    try {
        revisionSnapshot = buildPurchaseOrderRevisionSnapshot(
            id,
            revision,
            order,
            oldLines,
            new Date().toISOString()
        );
    } catch {
        throw new PurchaseOrderLifecycleError("The prior purchase-order version could not be captured for audit.", 503);
    }
    await assertRevisionSnapshotStorage();
    const nextRevision = revision + 1;
    const headerPayload = {
        reference: command.shipmentData.reference_number,
        remark: command.shipmentData.remark === "" ? null : command.shipmentData.remark || null,
        supplier_name: Number(command.shipmentData.supplier_id),
        branch_id: command.shipmentData.branch_id,
        payment_type: command.shipmentData.payment_type || null,
        payment_mode: command.shipmentData.payment_mode,
        payment_terms: command.shipmentData.payment_terms ?? order.payment_terms ?? null,
        delivery_terms: deliveryTerms,
        price_type: resolvedPriceType.priceTypeName,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        total_foreign_currency: totals.netForeign,
        gross_amount: totals.grossPhp,
        total_amount: totals.netPhp,
        inventory_status: INVENTORY_STATUS.REQUESTED,
        date_received: command.shipmentData.date_received || null,
        lead_time_receiving: null,
        approver_id: null,
        date_approved: null,
        finance_id: null,
        date_financed: null,
        workflow_revision: nextRevision,
        approval_rule_id: rule.ruleId,
        approval_requires_finance: 1,
        approval_allow_self_approval: 1,
        is_import: currencyCode === "PHP" ? 0 : 1
    };
    const updated = await conditionalPatch(id, revision, headerPayload, INVENTORY_STATUS.REJECTED);
    if (!updated) throw new PurchaseOrderLifecycleError("Another action changed this purchase order. Reload and try again.", 409);

    const deletedLineIds: number[] = [];
    const createdLineIds: number[] = [];
    try {
        for (const line of oldLines) {
            await deleteLine(line.purchase_order_product_id);
            deletedLineIds.push(line.purchase_order_product_id);
        }
        for (let index = 0; index < command.lineItems.length; index += 1) {
            createdLineIds.push(await createLine(linePayload(id, command.lineItems[index], totals.lines[index], exchangeRate)));
        }
        await writeHistory(
            id,
            "Resubmitted",
            actor,
            command.remarks || "Purchase order revised and resubmitted after rejection.",
            INVENTORY_STATUS.REJECTED,
            INVENTORY_STATUS.REQUESTED,
            revision,
            nextRevision,
            revisionSnapshot
        );
    } catch (error) {
        const failures = await rollbackRevision(id, nextRevision, order, oldLines, deletedLineIds, createdLineIds);
        if (failures.length) {
            throw new PurchaseOrderLifecycleError("Purchase-order revision failed and automatic cleanup was incomplete.", 503, {
                cleanupRequired: true,
                purchaseOrderId: id,
                failedOperations: failures
            });
        }
        throw error;
    }

    return {
        success: true,
        purchaseOrderId: id,
        status: "For Approval",
        workflowRevision: nextRevision
    };
}

export async function reviseRejectedPurchaseOrder(id: number, command: RevisionCommand, actor: AuthorizedPurchaseOrderUser) {
    return withRevisionLock(id, () => reviseRejectedPurchaseOrderUnlocked(id, command, actor));
}

export async function cancelRejectedPurchaseOrder(id: number, command: CancellationCommand, actor: AuthorizedPurchaseOrderUser) {
    const order = await loadOrder(id);
    const revision = Number(order.workflow_revision || 0);
    if (Number(order.inventory_status) !== INVENTORY_STATUS.REJECTED) {
        throw new PurchaseOrderLifecycleError("Only Rejected purchase orders can be cancelled through this action.", 409);
    }
    if (revision !== command.workflowRevision) {
        throw new PurchaseOrderLifecycleError("This purchase order changed. Reload it before cancelling it.", 409);
    }
    const rejectionStage = await fetchCurrentPurchaseOrderRejectionStage(
        id,
        order.inventory_status,
        revision
    );
    if (rejectionStage !== "Finance") {
        throw new PurchaseOrderLifecycleError("Purchase orders can only be cancelled after a formal Finance rejection.", 409);
    }

    const nextRevision = revision + 1;
    const reason = command.remarks || "Purchase order cancelled after rejection.";
    const updated = await conditionalPatch(id, revision, {
        inventory_status: INVENTORY_STATUS.CANCELLED,
        workflow_revision: nextRevision
    }, INVENTORY_STATUS.REJECTED);
    if (!updated) throw new PurchaseOrderLifecycleError("Another action changed this purchase order. Reload and try again.", 409);

    try {
        await writeHistory(id, "Cancelled", actor, reason, INVENTORY_STATUS.REJECTED, INVENTORY_STATUS.CANCELLED, revision, nextRevision);
    } catch (error) {
        const rolledBack = await conditionalPatch(id, nextRevision, rollbackHeader(order)).catch(() => false);
        if (!rolledBack) {
            throw new PurchaseOrderLifecycleError("Cancellation history failed and automatic rollback was incomplete.", 503, {
                cleanupRequired: true,
                purchaseOrderId: id,
                workflowRevision: nextRevision
            });
        }
        throw error;
    }

    return { success: true, purchaseOrderId: id, status: "Cancelled", workflowRevision: nextRevision };
}
