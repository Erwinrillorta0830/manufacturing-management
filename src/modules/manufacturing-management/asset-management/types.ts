import { z } from "zod";

// --- 1. Base Schemas ---

export const departmentSchema = z.object({
  department_id: z.number(),
  department_name: z.string(),
});

export const userSchema = z.object({
  user_id: z.number(),
  user_fname: z.string(),
  user_mname: z.string().optional().nullable(),
  user_lname: z.string(),
});

export const itemTypeSchema = z.object({
  id: z.number(),
  type_name: z.string(),
});

export const itemClassificationSchema = z.object({
  id: z.number(),
  classification_name: z.string(),
});

// --- 2. Form Schema (Client-side form values) ---

export const assetFormSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  item_type: z.string().min(1, "Item type is required"),
  item_classification: z.string().min(1, "Classification is required"),
  barcode: z.string().optional().nullable().or(z.literal("")),
  rfid_code: z.string().optional().nullable().or(z.literal("")),
  serial: z.string().optional().nullable().or(z.literal("")),
  is_active_warning: z.number(),
  condition: z.enum(["Good", "Bad", "Under Maintenance", "Discontinued"]),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  cost_per_item: z.number().min(0, "Cost must be positive"),
  life_span: z.number().min(1, "Life span must be at least 1 year"),
  date_acquired: z.date(),
  department: z.number().min(1, "Department is required"),
  employee: z.number().nullable(),
  item_image: z.any().optional(),
});

// --- 3. API Submission Schema ---

export const assetSubmissionSchema = z.object({
  item_name: z.string(),
  item_type: z.union([z.string(), z.number()]),
  item_classification: z.union([z.string(), z.number()]),
  barcode: z.string().optional().nullable(),
  rfid_code: z.string().optional().nullable(),
  serial: z.string().optional().nullable(),
  is_active_warning: z.number(),
  condition: z.enum(["Good", "Bad", "Under Maintenance", "Discontinued"]),
  quantity: z.number(),
  cost_per_item: z.number(),
  life_span: z.number(),
  date_acquired: z.date(),
  department: z.number(),
  employee: z.number().optional().nullable(),
  encoder: z.number(),
});

// --- 4. Table Schema (For API GET responses) ---

export const assetTableDataSchema = z.object({
  id: z.number(),
  barcode: z.string().nullable(),
  rfid_code: z.string().nullable(),
  serial: z.string().nullable(),
  is_active_warning: z.number(),
  condition: z.enum(["Good", "Bad", "Under Maintenance", "Discontinued"]),
  quantity: z.number(),
  cost_per_item: z.number(),
  total: z.number(),
  date_acquired: z.string(),
  life_span: z.number(),

  // Virtual fields from the JOINs
  item_name: z.string(),
  item_image: z.string().nullable(),
  item_type_name: z.string(),
  classification_name: z.string(),
  department_name: z.string(),
  assigned_to_name: z.string(),

  // Raw IDs
  item_id: z.number(),
  department: z.number().nullable(),
  employee: z.number().nullable(),
  encoder: z.number().nullable(),

  // Audit Fields
  created_by: z.number().nullable().optional(),
  created_by_name: z.string().optional(),
  updated_by: z.number().nullable().optional(),
  updated_by_name: z.string().optional(),
  created_at: z.string().nullable().optional(),
  date_created: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  date_updated: z.string().nullable().optional(),
});

// --- 5. Exported Types ---

export type Department = z.infer<typeof departmentSchema>;
export type User = z.infer<typeof userSchema>;
export type AssetFormValues = z.infer<typeof assetFormSchema>;
export type AssetSubmissionData = z.infer<typeof assetSubmissionSchema>;
export type AssetTableData = z.infer<typeof assetTableDataSchema>;
export type ItemType = z.infer<typeof itemTypeSchema>;
export type ItemClassification = z.infer<typeof itemClassificationSchema>;
