// src/modules/financial-management/accounting/discount-management/customer-discounting/index.ts
/**
 * Barrel exports for the customer discounting module entrypoint and shared types.
 */
export { default } from "./CustomerDiscountingModule";
export type {
  CustomerDiscountingCategory,
  CustomerDiscountingCustomer,
  CustomerDiscountingModuleData,
  CustomerDiscountPricingResult,
  CustomerDiscountingProduct,
  CustomerDiscountingRules,
  CustomerDiscountingSupplier,
  DiscountOption,
  ProductRule,
  SupplierCategoryRule,
} from "./types";
