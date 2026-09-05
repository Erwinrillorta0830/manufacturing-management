import { z } from "zod";

/**
 * Product Schema - From items/products collection
 */
export const ProductSchema = z.object({
  product_id: z.number(),
  product_name: z.string(),
  product_code: z.string().nullable().optional(),
  product_brand: z.number().nullable().optional(),
  product_category: z.number().nullable().optional(),
  price_per_unit: z.number().nullable().optional(),
  priceA: z.number().nullable().optional(),
  priceB: z.number().nullable().optional(),
  priceC: z.number().nullable().optional(),
  priceD: z.number().nullable().optional(),
  priceE: z.number().nullable().optional(),
  short_description: z.string().nullable().optional(),
  unit_of_measurement: z.union([z.number(), z.string()]).nullable().optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});

export type Product = z.infer<typeof ProductSchema>;

/**
 * API Response types
 */
export interface ProductsResponse {
  data: Product[];
}

export interface ProductResponse {
  data: Product;
}
