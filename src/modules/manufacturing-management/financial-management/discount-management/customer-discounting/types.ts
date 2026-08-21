// src/modules/financial-management/accounting/discount-management/customer-discounting/types.ts
/**
 * Normalized discount_type relation used across customer discounting screens.
 */
export type DiscountOption = {
  id: number;
  discountType: string;
  totalPercent: number;
};

/**
 * Customer row displayed by the server-paginated dashboard.
 */
export type CustomerDiscountingCustomer = {
  id: number;
  customerCode: string;
  customerName: string;
  storeName: string;
  storeTypeId: number | null;
  storeTypeName: string;
  globalDiscount: DiscountOption | null;
};

/**
 * Store type option used by the customer list filter.
 */
export type CustomerDiscountingStoreType = {
  id: number;
  storeType: string;
};

/**
 * Trade supplier option used by supplier/category discount rules.
 */
export type CustomerDiscountingSupplier = {
  id: number;
  supplierName: string;
  supplierShortcut: string;
};

/**
 * Product category option used by supplier/category discount rules.
 */
export type CustomerDiscountingCategory = {
  categoryId: number;
  categoryName: string;
};

/**
 * Product search result, including UOM and optional resolved pricing context.
 */
export type CustomerDiscountingProduct = {
  productId: number;
  productCode: string;
  barcode: string;
  productName: string;
  categoryId: number | null;
  categoryName: string;
  unitId: number | null;
  unitName: string;
  unitShortcut: string;
  pricePerUnit: number | null;
  priceA: number | null;
  priceB: number | null;
  priceC: number | null;
  priceD: number | null;
  priceE: number | null;
  pricing?: CustomerDiscountPricingResult | null;
};

/**
 * Supplier/category rule returned for a selected customer.
 */
export type SupplierCategoryRule = {
  id: number;
  customerCode: string;
  supplierId: number | null;
  supplierName: string;
  categoryId: number | null;
  categoryName: string;
  discount: DiscountOption | null;
};

/**
 * Product-specific rule returned for a selected customer.
 */
export type ProductRule = {
  id: number;
  customerCode: string;
  productId: number | null;
  productName: string;
  productCode: string;
  barcode: string;
  categoryId: number | null;
  categoryName: string;
  unitId: number | null;
  unitName: string;
  unitShortcut: string;
  discount: DiscountOption | null;
  unitPrice: number | null;
};

/**
 * Server-loaded module payload used to hydrate the client page.
 */
export type CustomerDiscountingModuleData = {
  customers: CustomerDiscountingCustomer[];
  discountTypes: DiscountOption[];
  storeTypes: CustomerDiscountingStoreType[];
  suppliers: CustomerDiscountingSupplier[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    search: string;
    storeTypeId: number | null;
  };
};

/**
 * Complete rule set shown inside the customer configuration sheet.
 */
export type CustomerDiscountingRules = {
  supplierCategoryRules: SupplierCategoryRule[];
  productRules: ProductRule[];
};

/**
 * Pricing hierarchy response describing the applied discount tier and final price.
 */
export type CustomerDiscountPricingResult = {
  customer: {
    id: number;
    customerCode: string;
    customerName: string;
    globalDiscount: DiscountOption | null;
  };
  product: {
    productId: number;
    productCode: string;
    barcode: string;
    productName: string;
    categoryId: number | null;
    categoryName: string;
    unitId: number | null;
    unitName: string;
    unitShortcut: string;
  };
  supplierId: number | null;
  priceTier: "manual" | "price_per_unit" | "priceA" | "priceB" | "priceC" | "priceD" | "priceE";
  basePrice: number | null;
  appliedTier: "product" | "supplier_category" | "global" | "base";
  ruleId: number | null;
  discount: DiscountOption | null;
  unitPrice: number | null;
  finalPrice: number | null;
};
