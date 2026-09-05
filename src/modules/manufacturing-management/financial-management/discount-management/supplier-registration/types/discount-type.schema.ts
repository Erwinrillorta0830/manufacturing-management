import { z } from "zod";

/**
 * Discount Type Schema - From items/discount_type collection
 */
export const DiscountTypeSchema = z.object({
  id: z.number(),
  discount_type: z.string(),
  total_percent: z.string().nullable().optional(),
});

export type DiscountType = z.infer<typeof DiscountTypeSchema>;

/**
 * API Response types
 */
export interface DiscountTypesResponse {
  data: DiscountType[];
}

export interface DiscountTypeResponse {
  data: DiscountType;
}
