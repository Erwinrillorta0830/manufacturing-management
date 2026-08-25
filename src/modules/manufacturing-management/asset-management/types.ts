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

export const unitOptionSchema = z.object({
  unit_id: z.number(),
  unit_name: z.string(),
  unit_shortcut: z.string().optional().nullable(),
});

// --- 2. Form Schema (Client-side form values) ---

export const assetFormSchema = z
  .object({
    item_name: z.string().trim().min(1, "Item name is required"),
    item_type: z.string().trim().min(1, "Item type is required"),
    item_classification: z.string().trim().min(1, "Classification is required"),
    asset_type: z.enum(["Administrative", "Production"]),
    depreciation_method: z.enum(["Straight Line", "Units of Production"]),
    barcode: z.string().optional().nullable().or(z.literal("")),
    rfid_code: z.string().optional().nullable().or(z.literal("")),
    serial: z.string().optional().nullable().or(z.literal("")),
    is_active_warning: z.number().optional().nullable(),
    condition: z.enum(["Good", "Bad", "Under Maintenance", "Discontinued"]),
    quantity: z.number().min(1, "Quantity must be at least 1"),
    cost_per_item: z.number().min(0.01, "Acquisition cost is required"),
    acquisition_cost: z.number().min(0).optional().nullable(),
    residual_value: z.number().min(0, "Residual value must be 0 or positive").optional().nullable(),
    life_span: z.number().min(0).optional().nullable(),
    useful_life_months: z.number().min(0).optional().nullable(),
    maximum_unit_produced_capacity: z.number().min(0).optional().nullable(),
    production_unit_id: z.number().optional().nullable(),
    date_acquired: z.union([z.date(), z.string()]),
    depreciation_start_date: z.union([z.date(), z.string()]).optional().nullable(),
    department: z.number().min(1, "Department is required"),
    employee: z.number().nullable().optional(),
    item_image: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.depreciation_method === "Units of Production") {
      if (!data.maximum_unit_produced_capacity || data.maximum_unit_produced_capacity <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Max lifetime capacity is required",
          path: ["maximum_unit_produced_capacity"],
        });
      }
      if (!data.production_unit_id || data.production_unit_id <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production unit (UoM) is required",
          path: ["production_unit_id"],
        });
      }
    } else if (data.depreciation_method === "Straight Line") {
      if (!data.useful_life_months || data.useful_life_months <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Useful life (months) is required",
          path: ["useful_life_months"],
        });
      }
    }
  });

// --- 3. API Submission Schema ---

export const assetSubmissionSchema = z.object({
  item_name: z.string(),
  item_type: z.union([z.string(), z.number()]),
  item_classification: z.union([z.string(), z.number()]),
  asset_type: z.string().optional(),
  depreciation_method: z.string().optional(),
  barcode: z.string().optional().nullable(),
  rfid_code: z.string().optional().nullable(),
  serial: z.string().optional().nullable(),
  is_active_warning: z.number(),
  condition: z.enum(["Good", "Bad", "Under Maintenance", "Discontinued"]),
  quantity: z.number(),
  cost_per_item: z.number(),
  acquisition_cost: z.number().optional().nullable(),
  residual_value: z.number().optional(),
  life_span: z.number(),
  useful_life_months: z.number().optional().nullable(),
  maximum_unit_produced_capacity: z.number().optional().nullable(),
  production_unit_id: z.number().optional().nullable(),
  date_acquired: z.date(),
  depreciation_start_date: z.date().optional().nullable(),
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

  // Depreciation & Capacity Fields
  asset_type: z.string().optional().nullable(),
  depreciation_method: z.string().optional().nullable(),
  acquisition_cost: z.number().optional().nullable(),
  residual_value: z.number().optional().nullable(),
  useful_life_months: z.number().optional().nullable(),
  maximum_unit_produced_capacity: z.number().optional().nullable(),
  production_unit_id: z.number().optional().nullable(),
  production_unit: z.string().optional().nullable(),
  production_unit_shortcut: z.string().optional().nullable(),
  depreciation_start_date: z.string().optional().nullable(),
  actual_units_produced: z.number().optional().nullable(),
  remaining_production_capacity: z.number().optional().nullable(),
  production_depreciation: z.number().optional().nullable(),

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
export type UnitOption = z.infer<typeof unitOptionSchema>;

export interface SpringBootAssetDepreciation {
  assetId: number;
  itemId: number;
  itemName: string;
  assetType: string;
  depreciationMethod: string;
  serial?: string | null;
  barcode?: string | null;
  rfidCode?: string | null;
  department?: number | null;
  employee?: number | null;
  dateAcquired?: string | null;
  depreciationStartDate?: string | null;
  acquisitionCost?: number | null;
  residualValue?: number | null;
  depreciableAmount?: number | null;
  maximumUnitProducedCapacity?: number | null;
  productionUnitId?: number | null;
  productionUnit?: string | null;
  productionUnitShortcut?: string | null;
  jobOrderId?: number | null;
  jobOrderNo?: string | null;
  productId?: number | null;
  productName?: string | null;
  productionUnits?: number | null;
  remainingProductionCapacity?: number | null;
  depreciationPerUnit?: number | null;
  productionDepreciation?: number | null;
  productionCapacityUsedPercent?: number | null;
  firstProductionDate?: string | null;
  lastProductionDate?: string | null;
}

export interface AssetDepreciationSummary {
  asset_id: number;
  item_id: number;
  asset_type: string;
  depreciation_method: string;
  serial: string | null;
  barcode: string | null;
  rfid_code: string | null;
  acquisition_cost: number;
  residual_value: number;
  maximum_unit_produced_capacity: number;
  production_unit_id: number | null;
  production_unit: string | null;
  production_unit_shortcut: string | null;
  total_production_units: number;
  remaining_production_capacity: number;
  depreciation_per_unit: number;
  accumulated_production_depreciation: number;
  current_book_value: number;
}

export interface AssetDepreciationDetail {
  yield_id: number;
  asset_id: number;
  job_order_id: number;
  job_order_no: string;
  work_center_id: number;
  work_center_name: string;
  product_id: number;
  product_name: string;
  actual_setup_hours: number | null;
  actual_run_hours: number | null;
  actual_total_hours: number | null;
  production_quantity: number;
  production_unit_shortcut: string | null;
  depreciation_per_unit: number;
  depreciation_amount: number;
  shift_name: string | null;
  qa_status: string | null;
  production_date: string;
}

