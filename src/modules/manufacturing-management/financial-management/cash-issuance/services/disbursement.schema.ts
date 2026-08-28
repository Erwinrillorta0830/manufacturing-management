import { z } from "zod";

export const PayableInputSchema = z.object({
    id: z.number().optional(),
    divisionId: z.number().optional(),
    referenceNo: z.string().optional(),
    date: z.string().optional(),
    coaId: z.number().optional(),
    amount: z.number().optional(),
    remarks: z.string().optional(),
});

export const PaymentInputSchema = z.object({
    id: z.number().optional(),
    coaId: z.number().optional(),
    bankId: z.number().optional(),
    checkNo: z.string().optional(),
    date: z.string().optional(),
    amount: z.number().optional(),
    remarks: z.string().optional(),
    releasedDate: z.string().optional(),
    releasedBy: z.string().optional(),
});

export const DisbursementPayloadSchema = z.object({
    transactionTypeId: z.number().optional(),
    payeeId: z.number().optional(),
    remarks: z.string().optional(),
    totalAmount: z.number().optional(),
    transactionDate: z.string().optional(),
    departmentId: z.number().optional(),
    fundSourceId: z.number().optional(),
    supportingDocumentsUrl: z.string().optional(),
    payables: z.array(PayableInputSchema).optional(),
    payments: z.array(PaymentInputSchema).optional(),
    // Used by update logic
    scope: z.string().optional(),
    rejectReason: z.string().optional(),
});

export type DisbursementPayload = z.infer<typeof DisbursementPayloadSchema>;
