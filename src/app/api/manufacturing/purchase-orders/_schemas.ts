import { z } from "zod";
import { compareDecimals, DecimalValue, isWithinDecimalCapacity } from "@/modules/manufacturing-management/decimal";

const MODULE_PATHS = {
    procurement: "/mm/incoming-shipments",
    plantApproval: "/mm/plant-approval",
    financeApproval: "/mm/finance-approval",
    receiving: "/mm/qa-receiving"
} as const;

const positiveId = z.coerce.number().int().positive();
const decimalValue = z.union([z.string().trim().min(1), z.number().finite()]).transform(value => String(value)).refine(value => {
    try {
        DecimalValue.from(value);
        return true;
    } catch {
        return false;
    }
}, "Must be a valid decimal value.");
const nonNegativeMoney = decimalValue
    .refine(value => DecimalValue.from(value).compare(0) >= 0, "Must be a non-negative amount.")
    .refine(value => isWithinDecimalCapacity(value), "Amount exceeds the supported 65-digit currency range.");
const positiveDecimal = decimalValue.refine(value => DecimalValue.from(value).compare(0) > 0, "Must be greater than zero.");
const percentage = z.coerce.number().finite().min(0).max(100);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const purchaseOrderStatusSchema = z.enum([
    "Ordered", "Approved", "Awaiting Payment", "Cancelled", "For Pickup", "En Route",
    "Receiving (QA)", "Partially Received", "Received", "Rejected"
]);

const initialPurchaseOrderStatusSchema = z.enum(["Ordered"]);

export const purchaseOrderListStatusSchema = z.enum([
    "Requested", "Ordered", "Approved", "Awaiting Payment", "Cancelled", "For Pickup", "En Route",
    "Receiving (QA)", "Partially Received", "Received", "Rejected"
]);

const receivingQueueStatusSchema = z.enum([
    "For Pickup", "Receiving (QA)", "Partially Received", "Received"
]);

export const purchaseOrderApprovalStageSchema = z.enum(["Plant", "Finance"]);

export const purchaseOrderLineSchema = z.object({
    product_id: positiveId,
    quantity_ordered: z.coerce.number().finite().positive(),
    base_unit_cost_php: nonNegativeMoney,
    discount_percent: z.coerce.number().finite().min(0).max(100).optional(),
    discount_type: positiveId.nullable().optional()
}).passthrough();

export const legacyPurchaseOrderCreateSchema = z.object({
    shipmentData: z.object({
        reference_number: z.string().trim().min(1).max(255),
        supplier_id: positiveId,
        exchange_rate: positiveDecimal,
        total_foreign_currency: nonNegativeMoney,
        total_php_value: nonNegativeMoney,
        status: initialPurchaseOrderStatusSchema.default("Ordered"),
        date_received: dateOnly.nullable().optional(),
        branch_id: positiveId,
        payment_type: positiveId.nullable().optional(),
        price_type: z.string().trim().min(1).max(50).nullable().optional()
    }).passthrough(),
    lineItems: z.array(purchaseOrderLineSchema).min(1)
});

export const legacyPurchaseOrderEditSchema = legacyPurchaseOrderCreateSchema.extend({
    shipmentId: positiveId
});

export const purchaseOrderRevisionSchema = legacyPurchaseOrderEditSchema.extend({
    workflowRevision: z.coerce.number().int().nonnegative(),
    remarks: z.string().trim().max(1000).optional()
});

export const purchaseOrderCancellationSchema = z.object({
    workflowRevision: z.coerce.number().int().nonnegative(),
    remarks: z.string().trim().max(1000).optional()
});

export const purchaseOrderExpectedTotalsSchema = z.object({
    grossPhp: nonNegativeMoney,
    discountPhp: nonNegativeMoney,
    vatPhp: nonNegativeMoney,
    withholdingPhp: nonNegativeMoney,
    netPhp: nonNegativeMoney,
    netForeign: nonNegativeMoney
});

export const purchaseOrderDraftLineSchema = z.object({
    productId: positiveId,
    parentProductId: positiveId,
    purchaseIntent: z.enum(["MRP_Demand", "Buffer_Stock"]),
    jobOrderId: positiveId.nullable(),
    quantity: z.coerce.number().int().positive(),
    unitPrice: nonNegativeMoney,
    discountPercent: percentage.default(0),
    vatPercent: percentage.default(0),
    withholdingPercent: percentage.default(0)
}).superRefine((line, context) => {
    if (line.purchaseIntent === "MRP_Demand" && line.jobOrderId === null) {
        context.addIssue({ code: "custom", path: ["jobOrderId"], message: "MRP demand requires a job order." });
    }
    if (line.purchaseIntent === "Buffer_Stock" && line.jobOrderId !== null) {
        context.addIssue({ code: "custom", path: ["jobOrderId"], message: "Buffer stock cannot be linked to a job order." });
    }
});

export const purchaseOrderCreateSchema = z.object({
    externalReference: z.string().trim().max(255).optional(),
    supplierId: positiveId,
    branchId: positiveId,
    paymentTypeId: positiveId,
    priceType: z.string().trim().min(1).max(50),
    currencyCode: z.enum(["PHP", "USD"]),
    exchangeRate: positiveDecimal,
    expectedTotals: purchaseOrderExpectedTotalsSchema,
    lines: z.array(purchaseOrderDraftLineSchema).min(1)
}).superRefine((order, context) => {
    if (order.currencyCode === "PHP" && compareDecimals(order.exchangeRate, 1) !== 0) {
        context.addIssue({ code: "custom", path: ["exchangeRate"], message: "PHP orders must use an exchange rate of 1." });
    }
    const productIds = order.lines.map(line => line.productId);
    if (new Set(productIds).size !== productIds.length) {
        context.addIssue({ code: "custom", path: ["lines"], message: "Duplicate product variants are not allowed." });
    }
});

export const purchaseOrderEditSchema = purchaseOrderCreateSchema.extend({
    workflowRevision: z.coerce.number().int().nonnegative()
});

export const purchaseOrderStatusUpdateSchema = z.object({
    shipmentId: positiveId,
    status: purchaseOrderStatusSchema,
    lead_time_receiving: dateOnly.nullable().optional()
});

export const purchaseOrderApprovalSchema = z.object({
    action: z.enum(["approve", "reject", "awaiting_payment", "cancel"]),
    workflowRevision: z.coerce.number().int().nonnegative(),
    expectedRuleId: positiveId.optional(),
    lead_time_receiving: dateOnly.nullable().optional(),
    remarks: z.string().trim().min(1).max(1000).optional()
}).superRefine((value, context) => {
    if ((value.action === "reject" || value.action === "cancel") && !value.remarks) {
        context.addIssue({ code: "custom", path: ["remarks"], message: "Remarks are required for rejection." });
    }
});

export const purchaseOrderListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(100).default(""),
    status: purchaseOrderListStatusSchema.optional(),
    queue: z.enum(["receiving"]).optional(),
    includeReceived: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
    sort: z.enum(["date_encoded", "purchase_order_no", "reference", "total_amount", "inventory_status"]).default("date_encoded"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    approvalStage: purchaseOrderApprovalStageSchema.optional()
}).superRefine((query, context) => {
    if (query.queue === "receiving" && query.status && !receivingQueueStatusSchema.safeParse(query.status).success) {
        context.addIssue({
            code: "custom",
            path: ["status"],
            message: "Receiving queue status must be For Pickup, Receiving (QA), Partially Received, or Received."
        });
    }
});

export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;

export function modulesForStatus(status: z.infer<typeof purchaseOrderStatusSchema>) {
    return status === "Receiving (QA)" || status === "Partially Received" || status === "Received" || status === "Rejected"
        ? [MODULE_PATHS.receiving]
        : [MODULE_PATHS.procurement, MODULE_PATHS.plantApproval, MODULE_PATHS.financeApproval];
}
