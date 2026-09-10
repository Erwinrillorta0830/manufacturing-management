import { z } from "zod";

/**
 * Product Per Supplier Schema - From items/products_per_supplier collection
 * Links suppliers to products with optional discount type
 */
export const ProductPerSupplierSchema = z.object({
  id: z.number().optional(),
  supplier_id: z.number().int().positive("Supplier ID is required"),
  product_id: z.number().int().positive("Product ID is required"),
  discount_type: z.number().nullable().optional(), // References discount_type.id
});

/**
 * Form schema for adding/updating product to supplier
 */
export const ProductPerSupplierFormSchema = z.object({
  supplier_id: z.number().int().positive("Supplier ID is required"),
  product_id: z.number().int().positive("Product ID is required"),
  discount_type: z.number().nullable().optional(),
});

/**
 * Extended type with product details for display
 */
export interface ProductPerSupplierWithDetails {
  id: number;
  supplier_id: number;
  product_id: number;
  discount_type: number | null;
  product_name: string;
  product_code: string | null;
  short_description: string | null;
  unit_of_measurement?: string | number | null;
  discount_type_name?: string | null;
}

/**
 * TypeScript types inferred from Zod schemas
 */
export type ProductPerSupplier = z.infer<typeof ProductPerSupplierSchema>;
export type ProductPerSupplierFormValues = z.infer<
  typeof ProductPerSupplierFormSchema
>;

/**
 * API Response types
 */
export interface ProductsPerSupplierResponse {
  data: ProductPerSupplier[];
}

export interface ProductPerSupplierResponse {
  data: ProductPerSupplier;
}
