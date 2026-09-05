import { z } from "zod";

/**
 * Supplier Schema - Zod validation for supplier entity
 */
export const SupplierSchema = z.object({
  id: z.number().optional(),
  supplier_name: z
    .string()
    .min(2, "Supplier name must be at least 2 characters")
    .max(255, "Supplier name is too long"),
  supplier_shortcut: z
    .string()
    .min(1, "Supplier shortcut is required")
    .max(50, "Supplier shortcut is too long"),
  supplier_type: z.string().min(1, "Supplier type is required"),
  tin_number: z
    .string()
    .transform((val) => val.replace(/\D/g, "")) // Strip non-digits
    .refine((val) => val.length >= 9 && val.length <= 12, {
      message: "TIN must be 9-12 digits",
    }),
  contact_person: z.string().min(2, "Contact person name is required"),
  email_address: z
    .string()
    .email("Invalid email address")
    .or(z.literal("N/A"))
    .or(z.literal("")),
  phone_number: z
    .string()
    .transform((val) => val.replace(/\D/g, "")) // Strip non-digits
    .refine((val) => val.length <= 11, {
      message: "Phone number must be at most 11 digits",
    })
    .optional()
    .default(""),
  address: z.string().min(1, "Address is required"),
  brgy: z.string().min(1, "Barangay is required"),
  city: z.string().min(1, "City is required"),
  state_province: z.string().min(1, "Province is required"),
  postal_code: z.string().min(1, "Postal code is required"),
  country: z.string().default("Philippines"),
  payment_terms: z.string().min(1, "Payment terms are required"),
  delivery_terms: z.string().min(1, "Delivery terms are required"),
  date_added: z.string().or(z.date()).optional(),
  isActive: z.number().int().min(0).max(1).default(1),
  supplier_image: z.string().optional().default(""),
  bank_details: z.string().optional().default(""),
  notes_or_comments: z.string().optional().default(""),
  agreement_or_contract: z.string().optional().default(""),
  preferred_communication_method: z.string().optional().default(""),
  nonBuy: z.boolean().optional().default(true),
});

/**
 * Form schema for creating/updating suppliers
 * Only supplier_name, supplier_shortcut, and supplier_type are required
 * All other fields are optional
 */
export const SupplierFormSchema = z.object({
  supplier_name: z
    .string()
    .min(2, "Supplier name must be at least 2 characters")
    .max(255, "Supplier name is too long"),
  supplier_shortcut: z
    .string()
    .min(1, "Supplier shortcut is required")
    .max(50, "Supplier shortcut is too long"),
  supplier_type: z.string().min(1, "Supplier type is required"),
  tin_number: z
    .string()
    .transform((val) => val.replace(/\D/g, "")) // Strip non-digits
    .refine((val) => val.length >= 9 && val.length <= 12, {
      message: "TIN must be 9-12 digits",
    }),
  contact_person: z.string().min(2, "Contact person name is required"),
  email_address: z
    .string()
    .email("Invalid email address")
    .or(z.literal("N/A"))
    .or(z.literal(""))
    .optional()
    .default(""),
  phone_number: z
    .string()
    .transform((val) => val.replace(/\D/g, "")) // Strip non-digits
    .refine((val) => val.length <= 11, {
      message: "Phone number must be at most 11 digits",
    })
    .optional()
    .default(""),
  address: z.string().min(1, "Address is required"),
  brgy: z.string().min(1, "Barangay is required"),
  city: z.string().min(1, "City is required"),
  state_province: z.string().min(1, "Province is required"),
  postal_code: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required").default("Philippines"),
  payment_terms: z.string().min(1, "Payment terms are required"),
  delivery_terms: z.string().min(1, "Delivery terms are required"),
  isActive: z.number().int().min(0).max(1).default(1),
  supplier_image: z.string().optional().default(""),
  bank_details: z.string().optional().default(""),
  notes_or_comments: z.string().optional().default(""),
  agreement_or_contract: z.string().optional().default(""),
  preferred_communication_method: z.string().optional().default(""),
  nonBuy: z.boolean().optional().default(true),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type Supplier = z.infer<typeof SupplierSchema>;
export type SupplierFormValues = z.infer<typeof SupplierFormSchema>;

/**
 * API Response type
 */
export interface SuppliersResponse {
  data: Supplier[];
}
