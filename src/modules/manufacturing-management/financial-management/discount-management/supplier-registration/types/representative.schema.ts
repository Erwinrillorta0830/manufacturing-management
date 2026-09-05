import { z } from "zod";

/**
 * Philippine phone number regex patterns
 * Supports: 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX
 */
const PHONE_REGEX = /^(\+?63|0)?9\d{9}$/;

/**
 * Supplier Representative Schema - Zod validation
 */
export const RepresentativeSchema = z.object({
  id: z.number().optional(),
  supplier_id: z.number().int().positive("Supplier ID is required"),
  first_name: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(100, "First name is too long"),
  last_name: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(100, "Last name is too long"),
  middle_name: z
    .string()
    .max(100, "Middle name is too long")
    .nullable()
    .optional(),
  suffix: z.string().max(10, "Suffix is too long").nullable().optional(),
  email: z
    .string()
    .email("Invalid email address")
    .min(5, "Email is required")
    .max(255, "Email is too long"),
  contact_number: z
    .string()
    .regex(
      PHONE_REGEX,
      "Invalid Philippine phone number format (e.g., 09171234567)",
    )
    .min(10, "Contact number is required")
    .max(13, "Contact number is too long"),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
});

/**
 * Form schema for creating/updating representatives
 * Omits auto-generated fields
 */
export const RepresentativeFormSchema = RepresentativeSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

/**
 * Schema for adding representative without supplier_id
 * (supplier_id will be injected from context)
 */
export const AddRepresentativeFormSchema = RepresentativeFormSchema.omit({
  supplier_id: true,
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type Representative = z.infer<typeof RepresentativeSchema>;
export type RepresentativeFormValues = z.infer<typeof RepresentativeFormSchema>;
export type AddRepresentativeFormValues = z.infer<
  typeof AddRepresentativeFormSchema
>;

/**
 * API Response types
 */
export interface RepresentativesResponse {
  data: Representative[];
}

export interface RepresentativeResponse {
  data: Representative;
}
