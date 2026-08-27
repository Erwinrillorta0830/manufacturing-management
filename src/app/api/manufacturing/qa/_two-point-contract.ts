import { z } from "zod";

const positiveInteger = z.number().int().positive();
const nonnegativeQuantity = z.number().finite().nonnegative();
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const twoPointQAInspectionRequestSchema = z.object({
    action: z.enum(["two-point-inspection", "2-point-inspection"]),
    job_order_id: positiveInteger.optional(),
    job_order_no: z.string().trim().min(1).max(100).optional(),
    product_id: positiveInteger,
    branch_id: positiveInteger,
    inspected_quantity: z.number().finite().positive(),
    passed_quantity: nonnegativeQuantity,
    rejected_quantity: nonnegativeQuantity,
    rejection_reason_id: positiveInteger.nullable().optional(),
    lot_number: z.string().trim().max(100).optional(),
    manufacturing_date: optionalDate,
    expiry_date: optionalDate,
    unit_cost: z.number().finite().nonnegative().optional().default(0),
    remarks: z.string().max(2000).optional().default(""),
    user_id: positiveInteger.optional()
}).strict().superRefine((payload, context) => {
    if (!payload.job_order_id && !payload.job_order_no) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["job_order_id"],
            message: "Either job_order_id or job_order_no is required."
        });
    }

    if (Math.abs((payload.passed_quantity + payload.rejected_quantity) - payload.inspected_quantity) > 0.001) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["inspected_quantity"],
            message: "Passed and rejected quantities must equal inspected quantity."
        });
    }

    if (payload.rejected_quantity > 0 && !payload.rejection_reason_id) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["rejection_reason_id"],
            message: "Rejection reason is required when rejected quantity is greater than zero."
        });
    }
});

export type TwoPointQAInspectionRequest = z.infer<typeof twoPointQAInspectionRequestSchema>;
