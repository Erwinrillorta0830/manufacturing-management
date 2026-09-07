import { z } from "zod";

const SalesReturnItemSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  tempId: z.string().optional(),
  productId: z.number(),
  product_id: z.number().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  unit_id: z.number().optional(),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unitPrice: z.number().min(0, "Unit price cannot be negative"),
  agreedPrice: z.number().min(0, "Agreed price cannot be negative").optional().nullable(),
  priceVariance: z.number().optional().nullable(),
  grossAmount: z.number(),
  discountType: z.union([z.string(), z.number()]).optional().nullable(),
  discountAmount: z.number(),
  totalAmount: z.number(),
  lot_id: z.number().optional().nullable(),
  inventory_lot_id: z.number().optional().nullable(),
  batch: z.string().optional().nullable(),
  manufacturing_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  returnType: z.string().optional().nullable(),
  rfidTags: z.array(z.string()).optional(),
  unitMultiplier: z.number().optional(),
});

export const SubmitReturnSchema = z.object({
  appliedInvoiceId: z.number().optional().nullable(),
  items: z.array(SalesReturnItemSchema).min(1, "At least one item is required"),
  returnDate: z.string().optional().nullable(),
  invoiceNo: z.string().optional().nullable(),
  customer: z.string().optional().nullable(),
  customerCode: z.string().optional().nullable(),
  salesmanId: z.union([z.number(), z.string()]),
  totalAmount: z.number(),
  priceType: z.union([z.number(), z.string()]).optional().nullable(),
  branchId: z.union([z.number(), z.string()]).optional().nullable(),
  remarks: z.string().optional().nullable(),
  orderNo: z.string().optional().nullable(),
  isThirdParty: z.boolean().optional(),
});

export const UpdateReturnSchema = SubmitReturnSchema.extend({
  returnId: z.number(),
  returnNo: z.string(),
});

export const UpdateStatusSchema = z.object({
  id: z.number(),
  status: z.string(),
  isReceived: z.boolean().optional(),
  receivedAt: z.string().optional(),
});
