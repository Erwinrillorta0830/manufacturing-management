import { procurementDirectusFetch } from "../procurement/_directus";
import {
    derivePurchaseOrderWorkflowStage,
    pendingPurchaseOrderApprovalStages,
    selectPurchaseOrderApprovalRule,
    type PurchaseOrderApprovalRule
} from "./_domain";
import { INVENTORY_STATUS, PAYMENT_STATUS } from "../procurement/_domain";
import type { ApprovalStage } from "./_domain";
import type { AuthorizedPurchaseOrderUser } from "./_auth";
import type { z } from "zod";
import type { purchaseOrderApprovalSchema } from "./_schemas";
import { normalizeDecimal } from "@/modules/manufacturing-management/decimal";

type ApprovalCommand = z.infer<typeof purchaseOrderApprovalSchema>;

export class PurchaseOrderApprovalError extends Error {
    constructor(message: string, public readonly status = 400, public readonly details?: unknown) {
        super(message);
    }
}

interface ApprovalOrder {
    purchase_order_id: number;
    purchase_order_no?: string | null;
    reference?: string | null;
    encoder_id?: number | null;
    approver_id?: number | null;
    finance_id?: number | null;
    date_approved?: string | null;
    date_financed?: string | null;
    lead_time_receiving?: string | null;
    inventory_status: number;
    payment_status?: number | null;
    total_amount?: number | string | null;
    gross_amount?: number | string | null;
    currency_code?: string | null;
    exchange_rate?: number | string | null;
    total_foreign_currency?: number | string | null;
    is_import?: boolean | number | null;
    workflow_revision?: number | null;
    approval_rule_id?: number | null;
    approval_requires_finance?: boolean | number | null;
    approval_allow_self_approval?: boolean | number | null;
    remark?: string | null;
}

interface ApprovalHistoryRow {
    history_id: number;
    action: string;
    approval_stage: "Plant" | "Finance" | "System";
    actor_id: number;
    actor_role_id?: number | null;
    remarks?: string | null;
    from_inventory_status?: number | null;
    to_inventory_status?: number | null;
    revision_before: number;
    revision_after: number;
    created_at: string;
}

const ORDER_FIELDS = [
    "purchase_order_id", "purchase_order_no", "reference", "encoder_id", "approver_id", "finance_id",
    "date_approved", "date_financed", "lead_time_receiving", "inventory_status", "payment_status", "total_amount", "gross_amount",
    "currency_code", "exchange_rate", "total_foreign_currency", "is_import",
    "workflow_revision", "approval_rule_id", "approval_requires_finance", "approval_allow_self_approval", "remark"
].join(",");

const approvalLocks = new Map<number, Promise<void>>();

async function withApprovalLock<T>(purchaseOrderId: number, operation: () => Promise<T>): Promise<T> {
    const previous = approvalLocks.get(purchaseOrderId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
        release = resolve;
    });
    const queued = previous.then(() => current);
    approvalLocks.set(purchaseOrderId, queued);

    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (approvalLocks.get(purchaseOrderId) === queued) approvalLocks.delete(purchaseOrderId);
    }
}

async function directusData<T>(path: string, message: string): Promise<T> {
    const response = await procurementDirectusFetch(path);
    if (!response.ok) throw new PurchaseOrderApprovalError(message, response.status >= 500 ? 503 : response.status);
    return (await response.json()).data as T;
}

function relationId(value: unknown, key: string): number | null {
    if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
    if (!value || typeof value !== "object") return null;
    const parsed = Number((value as Record<string, unknown>)[key]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asBoolean(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

function mapRule(row: Record<string, unknown>): PurchaseOrderApprovalRule & { ruleName: string } {
    return {
        ruleId: Number(row.rule_id),
        ruleName: String(row.rule_name || `Rule ${row.rule_id}`),
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

async function loadOrder(id: number): Promise<ApprovalOrder> {
    return directusData<ApprovalOrder>(
        `/items/purchase_order/${id}?fields=${ORDER_FIELDS}`,
        "Purchase order was not found."
    );
}

async function loadCategoryIds(id: number): Promise<number[]> {
    const rows = await directusData<Array<{ product_id?: { product_category?: unknown; parent_id?: { product_category?: unknown } } }>>(
        `/items/purchase_order_products?filter[purchase_order_id][_eq]=${id}&fields=product_id.product_category.category_id,product_id.parent_id.product_category.category_id&limit=-1`,
        "Unable to load purchase-order categories."
    );
    return [...new Set(rows.flatMap(row => {
        const product = row.product_id;
        const idValue = relationId(product?.product_category, "category_id")
            || relationId(product?.parent_id?.product_category, "category_id");
        return idValue ? [idValue] : [];
    }))];
}

async function loadRules(): Promise<Array<PurchaseOrderApprovalRule & { ruleName: string }>> {
    const rows = await directusData<Record<string, unknown>[]>(
        "/items/purchase_order_approval_rules?fields=*&sort=-priority&limit=-1",
        "Unable to load approval rules."
    );
    return rows.map(mapRule);
}

async function resolveRule(order: ApprovalOrder, categoryIds: number[]) {
    const rules = await loadRules();
    if (order.approval_rule_id) {
        const stored = rules.find(rule => rule.ruleId === Number(order.approval_rule_id));
        if (stored) return {
            ...stored,
            requiresFinance: asBoolean(order.approval_requires_finance),
            allowSelfApproval: asBoolean(order.approval_allow_self_approval),
            snapshot: true
        };
        throw new PurchaseOrderApprovalError("The purchase order references an unavailable approval rule.", 409);
    }
    const selected = selectPurchaseOrderApprovalRule(rules, {
        totalPhp: normalizeDecimal(order.total_amount || order.gross_amount || 0),
        currencyCode: order.currency_code || "PHP",
        isImport: asBoolean(order.is_import) || (order.currency_code || "PHP") !== "PHP",
        productCategoryIds: categoryIds,
        businessDate: new Date().toISOString().slice(0, 10)
    });
    if (!selected) throw new PurchaseOrderApprovalError("No active approval rule matches this purchase order.", 409);
    return { ...rules.find(rule => rule.ruleId === selected.ruleId)!, snapshot: false };
}

function approvalState(order: ApprovalOrder, requiresFinance: boolean) {
    return {
        inventoryStatus: Number(order.inventory_status),
        approverId: Number(order.approver_id) || null,
        financeId: Number(order.finance_id) || null,
        requiresFinance
    };
}

async function loadHistory(id: number): Promise<ApprovalHistoryRow[]> {
    return directusData<ApprovalHistoryRow[]>(
        `/items/purchase_order_approval_history?filter[purchase_order_id][_eq]=${id}&fields=history_id,action,approval_stage,actor_id,actor_role_id,remarks,from_inventory_status,to_inventory_status,revision_before,revision_after,created_at&sort=created_at,history_id&limit=-1`,
        "Unable to load approval history."
    );
}

export async function getPurchaseOrderApprovalDetail(id: number, requestedStage?: ApprovalStage) {
    const [order, categoryIds, history] = await Promise.all([loadOrder(id), loadCategoryIds(id), loadHistory(id)]);
    const rule = await resolveRule(order, categoryIds);
    const state = approvalState(order, rule.requiresFinance);
    const pendingStages = pendingPurchaseOrderApprovalStages(state);
    return {
        order,
        stage: requestedStage && pendingStages.includes(requestedStage)
            ? requestedStage
            : derivePurchaseOrderWorkflowStage(state),
        pendingStages,
        matchedRule: {
            ruleId: rule.ruleId,
            ruleName: rule.ruleName,
            requiresFinance: rule.requiresFinance,
            allowSelfApproval: true,
            snapshot: rule.snapshot
        },
        categoryIds,
        history
    };
}

async function conditionalPatch(filter: Record<string, unknown>, data: Record<string, unknown>): Promise<ApprovalOrder | null> {
    const params = new URLSearchParams({ fields: ORDER_FIELDS });
    const response = await procurementDirectusFetch(`/items/purchase_order?${params.toString()}`, {
        method: "PATCH",
        body: JSON.stringify({ query: { filter, limit: 1 }, data })
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new PurchaseOrderApprovalError(body?.errors?.[0]?.message || "Unable to update the purchase-order workflow.", 503);
    }
    const rows = ((await response.json()).data || []) as ApprovalOrder[];
    return rows.length === 1 ? rows[0] : null;
}

function rollbackPayload(order: ApprovalOrder) {
    return {
        inventory_status: order.inventory_status,
        payment_status: order.payment_status ?? null,
        approver_id: order.approver_id || null,
        finance_id: order.finance_id || null,
        date_approved: order.date_approved || null,
        date_financed: order.date_financed || null,
        lead_time_receiving: order.lead_time_receiving || null,
        approval_rule_id: order.approval_rule_id || null,
        approval_requires_finance: order.approval_requires_finance ?? null,
        approval_allow_self_approval: order.approval_allow_self_approval ?? null,
        remark: order.remark || null,
        workflow_revision: Number(order.workflow_revision || 0)
    };
}

async function submitPurchaseOrderApprovalUnlocked(
    id: number,
    command: ApprovalCommand,
    actor: AuthorizedPurchaseOrderUser,
    requestedStage: ApprovalStage
) {
    const order = await loadOrder(id);
    const revision = Number(order.workflow_revision || 0);
    if (revision !== command.workflowRevision) {
        throw new PurchaseOrderApprovalError("This purchase order changed. Reload it before submitting another action.", 409);
    }
    const categoryIds = await loadCategoryIds(id);
    const rule = await resolveRule(order, categoryIds);
    if (!rule.snapshot && command.expectedRuleId !== rule.ruleId) {
        throw new PurchaseOrderApprovalError("The matched approval rule changed. Reload the purchase order and review it again.", 409);
    }
    const state = approvalState(order, rule.requiresFinance);
    const pendingStages = pendingPurchaseOrderApprovalStages(state);
    if (!pendingStages.includes(requestedStage)) {
        throw new PurchaseOrderApprovalError(
            `This purchase order is not awaiting ${requestedStage} approval.`,
            409
        );
    }
    const stage = requestedStage;
    if (command.action === "approve" && stage === "Plant" && !command.lead_time_receiving) {
        throw new PurchaseOrderApprovalError("ETA is required for Plant approval.", 400);
    }
    if (stage === "Plant" && command.action !== "approve" && command.action !== "reject") {
        throw new PurchaseOrderApprovalError("Plant approval accepts only approve or reject.", 400);
    }
    if (stage === "Finance" && command.action !== "awaiting_payment" && command.action !== "cancel") {
        throw new PurchaseOrderApprovalError("Finance approval accepts only Awaiting Payment or Cancel.", 400);
    }

    const now = new Date().toISOString();
    const nextRevision = revision + 1;
    const targetStatus = command.action === "reject"
        ? INVENTORY_STATUS.REJECTED
        : command.action === "cancel"
            ? INVENTORY_STATUS.REJECTED
            : stage === "Plant"
                ? INVENTORY_STATUS.APPROVED
                : order.inventory_status;
    const targetPaymentStatus = command.action === "awaiting_payment"
        || (stage === "Plant" && !rule.requiresFinance)
        ? PAYMENT_STATUS.AWAITING_PAYMENT
        : order.payment_status ?? null;
    const update: Record<string, unknown> = {
        workflow_revision: nextRevision,
        inventory_status: targetStatus,
        approval_rule_id: rule.ruleId,
        approval_requires_finance: rule.requiresFinance ? 1 : 0,
        approval_allow_self_approval: 1
    };
    if (command.action === "reject") {
        update.remark = `REJECTED: ${command.remarks}`;
    } else if (command.action === "cancel") {
        update.remark = `CANCELLED BY FINANCE: ${command.remarks}`;
        update.payment_status = PAYMENT_STATUS.CANCELLED;
    } else if (stage === "Plant") {
        update.approver_id = actor.userId;
        update.date_approved = now;
        update.lead_time_receiving = command.lead_time_receiving;
        if (!rule.requiresFinance) update.payment_status = PAYMENT_STATUS.AWAITING_PAYMENT;
    } else {
        update.finance_id = actor.userId;
        update.date_financed = now;
        update.payment_status = PAYMENT_STATUS.AWAITING_PAYMENT;
    }

    const stageFilter = stage === "Plant"
        ? { approver_id: { _null: true } }
        : { finance_id: { _null: true } };
    const allowedStatuses = stage === "Plant"
        ? [INVENTORY_STATUS.REQUESTED]
        : [INVENTORY_STATUS.REQUESTED, INVENTORY_STATUS.APPROVED];
    const updated = await conditionalPatch({
        purchase_order_id: { _eq: id },
        inventory_status: { _in: allowedStatuses },
        workflow_revision: { _eq: revision },
        ...stageFilter
    }, update);
    if (!updated) {
        throw new PurchaseOrderApprovalError("Another approval action changed this purchase order. Reload and try again.", 409);
    }

    const action = command.action === "reject"
        ? "Rejected"
        : command.action === "cancel"
            ? "FinanceCancelled"
            : command.action === "awaiting_payment"
                ? "FinanceAwaitingPayment"
                : stage === "Plant"
                    ? "PlantApproved"
                    : "FinanceApproved";
    const historyResponse = await procurementDirectusFetch("/items/purchase_order_approval_history", {
        method: "POST",
        body: JSON.stringify({
            purchase_order_id: id,
            action,
            approval_stage: stage,
            actor_id: actor.userId,
            actor_role_id: actor.roleId,
            remarks: command.remarks || null,
            from_inventory_status: order.inventory_status,
            to_inventory_status: targetStatus,
            revision_before: revision,
            revision_after: nextRevision,
            created_at: now
        })
    });
    if (!historyResponse.ok) {
        const rolledBack = await conditionalPatch({
            purchase_order_id: { _eq: id },
            workflow_revision: { _eq: nextRevision }
        }, rollbackPayload(order)).catch(() => null);
        if (!rolledBack) {
            console.error("Purchase-order approval audit compensation requires intervention.", { id, revision, nextRevision, action });
        }
        throw new PurchaseOrderApprovalError(
            rolledBack
                ? "Approval history could not be recorded. The workflow change was rolled back."
                : "Approval history could not be recorded and automatic rollback failed.",
            503,
            { cleanupRequired: !rolledBack, purchaseOrderId: id, revision: nextRevision }
        );
    }

    return {
        success: true,
        action,
        stage,
        status: targetStatus === INVENTORY_STATUS.APPROVED && targetPaymentStatus === PAYMENT_STATUS.AWAITING_PAYMENT
            ? "Awaiting Payment"
            : targetStatus === INVENTORY_STATUS.APPROVED
                ? "Approved"
                : targetStatus === INVENTORY_STATUS.REJECTED
                    ? "Rejected"
                    : targetStatus === INVENTORY_STATUS.REJECTED
                        ? "Rejected"
                        : "Requested",
        workflowRevision: nextRevision
    };
}

export async function submitPurchaseOrderApproval(
    id: number,
    command: ApprovalCommand,
    actor: AuthorizedPurchaseOrderUser,
    requestedStage: ApprovalStage
) {
    return withApprovalLock(id, () => submitPurchaseOrderApprovalUnlocked(id, command, actor, requestedStage));
}
