import { z } from "zod";

/**
 * Stock Adjustment Type (IN/OUT)
 */
export const StockAdjustmentManualTypeSchema = z.enum(["IN", "OUT"]);
export type StockAdjustmentManualType = z.infer<typeof StockAdjustmentManualTypeSchema>;


/**
 * Branch Data Schema
 */
export const BranchSchema = z.object({
  id: z.number(),
  branch_name: z.string().optional(),
  branch_code: z.string().optional(),
});
export type Branch = z.infer<typeof BranchSchema>;

/**
 * User Data Schema
 */
export const UserSchema = z.object({
  user_id: z.number(),
  user_fname: z.string().optional(),
  user_lname: z.string().optional(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * Stock Adjustment Item Schema
 */
export const StockAdjustmentManualItemSchema = z.object({
  id: z.number().optional(),
  stock_adjustment_id: z.number().optional(),
  product_id: z.number().min(1, "Product selection is required"),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  branch_id: z.any().optional(),
  remarks: z.string().optional(),
  doc_no: z.string().optional(),
  type: StockAdjustmentManualTypeSchema.optional(),
  created_at: z.string().optional(),
  created_by: z.any().optional(),
  // UI helper fields
  product_name: z.string().nullable().optional(),
  product_code: z.string().nullable().optional(),
  unit_name: z.string().nullable().optional(),
  unit_id: z.number().nullable().optional(),
  current_stock: z.number().nullable().optional(),
  cost_per_unit: z.number().nullable().optional(),
  brand_name: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  inferred_supplier_id: z.number().optional(),
  category_name: z.string().nullable().optional(),
  unit_order: z.number().nullable().optional(),
  db_id: z.number().optional(),
  rfid_tags: z.array(z.string()).optional(),
  rfid_count: z.number().optional(),
  has_rfid: z.boolean().optional(),
  updated_by: z.any().optional(),
  // Lot & Batch Tracking
  lot_id: z.number().nullable().optional(),
  lot_name: z.string().nullable().optional(),
  inventory_lot_id: z.number().nullable().optional(),
  batch_no: z.string().nullable().optional(),
  manufacturing_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  qa_status: z.enum(["GOOD", "DAMAGED", "QUARANTINED", "EXPIRED"]).optional(),
  inventory_condition: z.string().nullable().optional(),
  allocations: z.array(z.any()).optional(),
  allocation_plan: z.any().optional(),
  lot_allocations: z.array(z.any()).optional(),
});
export type StockAdjustmentManualItem = z.infer<typeof StockAdjustmentManualItemSchema>;

/**
 * Stock Adjustment Attachment Schema
 */
export const StockAdjustmentAttachmentSchema = z.object({
  id: z.number().optional(),
  stock_adjustment_id: z.number().optional(),
  attachment: z.any(), // UUID string or File object
  created_at: z.string().nullable().optional(),
  created_by: z.any().optional(),
  updated_at: z.string().nullable().optional(),
  updated_by: z.any().optional(),
});
export type StockAdjustmentAttachment = z.infer<typeof StockAdjustmentAttachmentSchema>;

/**
 * Stock Adjustment Header Schema
 */
export const StockAdjustmentManualHeaderSchema = z.object({
  id: z.number().optional(),
  doc_no: z.string().min(1, "Document number is required"),
  branch_id: z.any(), // Number or expanded object
  type: StockAdjustmentManualTypeSchema,
  amount: z.number().default(0),
  remarks: z.string().optional(),
  supplier_id: z.any().optional(), // Number or expanded object
  isPosted: z.boolean(),
  created_at: z.string().optional(),
  created_by: z.any().optional(),
  posted_by: z.any().optional(),
  postedAt: z.string().optional(),
  items: z.any().optional(), // Expanded items or count
  stock_adjustment_attachment: z.array(StockAdjustmentAttachmentSchema).optional(),
});
export type StockAdjustmentManualHeader = z.infer<typeof StockAdjustmentManualHeaderSchema>;

/**
 * Full Stock Adjustment (Header + Items + RFID)
 */
export const StockAdjustmentManualDetailSchema = StockAdjustmentManualHeaderSchema.extend({
  items: z.array(StockAdjustmentManualItemSchema).default([]),
});
export type StockAdjustmentManualDetail = z.infer<typeof StockAdjustmentManualDetailSchema>;

/**
 * Form values for Stock Adjustment Creation/Edit
 */
export const StockAdjustmentManualFormSchema = z
  .object({
    doc_no: z.string().min(1, "Document number is required"),
    branch_id: z.number().min(1, "Branch is required"),
    supplier_id: z.number().min(1, "Supplier is required"),
    type: StockAdjustmentManualTypeSchema,
    remarks: z.string().optional(),
    items: z.array(StockAdjustmentManualItemSchema).min(1, "At least one item is required"),
    isPosted: z.boolean(),
    postedAt: z.string().optional(),
    posted_by: z.any().optional(),
    stock_adjustment_attachment: z.array(StockAdjustmentAttachmentSchema).min(1, "At least one attachment is required"),
  })
  .superRefine((data, ctx) => {
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach((item, index) => {
        if (!item.lot_id || !item.batch_no || String(item.batch_no).trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Please assign Lot & Batch details for item #${index + 1} (${item.product_name || "Product"}).`,
            path: ["items", index, "batch_no"],
          });
        }
      });
    }
  });
export type StockAdjustmentManualFormValues = z.infer<typeof StockAdjustmentManualFormSchema>;

/**
 * API Response Schemas
 */
export const StockAdjustmentManualListResponseSchema = z.object({
  data: z.array(StockAdjustmentManualHeaderSchema),
  meta: z.object({
    total_count: z.number().optional(),
    filter_count: z.number().optional(),
  }).optional(),
});

export type ProductClassification = "RM" | "PKG" | "FG";
export type ProductTypeFilter = "ALL" | "RM" | "PKG" | "FG";

/**
 * Product Data Schema for UI dropdowns and selections
 */
export const StockAdjustmentManualProductSchema = z.object({
  id: z.number(),
  product_id: z.number().optional(),
  product_name: z.string(),
  product_code: z.string(),
  unit_name: z.string().optional(),
  cost_per_unit: z.number().optional(),
  price_per_unit: z.number().optional(),
  brand_name: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  unit_of_measurement: z.object({
    order: z.number(),
    unit_id: z.number().optional(),
  }).optional(),
  unit_id: z.number().optional(),
  current_stock: z.number().optional(),
  index: z.number().optional(),
  product_type: z.any().optional(),
  product_category: z.any().optional(),
  category_name: z.string().optional(),
  parent_id: z.any().optional(),
});
export type StockAdjustmentManualProduct = z.infer<typeof StockAdjustmentManualProductSchema>;

/**
 * Branch/Supplier types for selections
 */
export interface SelectionBranch {
  id: number;
  branch_name: string;
  branch_code?: string;
}

export interface SelectionSupplier {
  id: number;
  supplier_name: string;
  supplier_shortcut?: string;
}

