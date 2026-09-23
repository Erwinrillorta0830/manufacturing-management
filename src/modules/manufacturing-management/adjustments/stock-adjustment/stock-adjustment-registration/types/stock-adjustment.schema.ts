export * from "./stock-adjustment-manual.schema";

import {
  StockAdjustmentManualHeader,
  StockAdjustmentManualItem,
  StockAdjustmentManualDetail,
  StockAdjustmentManualProduct,
  StockAdjustmentManualType,
  StockAdjustmentManualFormValues,
  StockAdjustmentManualHeaderSchema,
  StockAdjustmentManualItemSchema,
  StockAdjustmentManualDetailSchema,
  StockAdjustmentManualFormSchema,
  StockAdjustmentManualTypeSchema,
  StockAdjustmentManualProductSchema,
} from "./stock-adjustment-manual.schema";

export type StockAdjustmentHeader = StockAdjustmentManualHeader;
export type StockAdjustmentItem = StockAdjustmentManualItem;
export type StockAdjustmentDetail = StockAdjustmentManualDetail;
export type StockAdjustmentProduct = StockAdjustmentManualProduct;
export type StockAdjustmentType = StockAdjustmentManualType;
export type StockAdjustmentFormValues = StockAdjustmentManualFormValues;

export const StockAdjustmentHeaderSchema = StockAdjustmentManualHeaderSchema;
export const StockAdjustmentItemSchema = StockAdjustmentManualItemSchema;
export const StockAdjustmentDetailSchema = StockAdjustmentManualDetailSchema;
export const StockAdjustmentFormSchema = StockAdjustmentManualFormSchema;
export const StockAdjustmentTypeSchema = StockAdjustmentManualTypeSchema;
export const StockAdjustmentProductSchema = StockAdjustmentManualProductSchema;
