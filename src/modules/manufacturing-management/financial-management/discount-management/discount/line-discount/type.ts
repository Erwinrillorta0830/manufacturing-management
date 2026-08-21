import { z } from "zod";

export const lineDiscountRowSchema = z.object({
  id: z.number().int(),
  line_discount: z.string().trim().min(1),
  percentage: z.union([z.string(), z.number()]),
  description: z.string().nullable(),
});

export const lineDiscountUpsertSchema = z.object({
  line_discount: z.string().trim().min(1, "Code is required."),
  percentage: z.coerce
    .number()
    .min(0, "Must be at least 0.00")
    .max(99.99, "Must be at most 99.99"),
  description: z.string().trim().nullable().optional(),
});

export type LineDiscountRow = z.infer<typeof lineDiscountRowSchema>;
export type LineDiscountUpsert = z.infer<typeof lineDiscountUpsertSchema>;
