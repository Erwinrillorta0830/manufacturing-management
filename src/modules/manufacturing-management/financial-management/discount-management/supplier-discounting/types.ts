// src/modules/financial-management/accounting/discount-management/supplier-discounting/types.ts
export type SupplierDiscountOption = {
  id: number;
  discountType: string;
  totalPercent: number;
};

export type SupplierDiscountSupplier = {
  id: number;
  supplierName: string;
  supplierShortcut: string;
};

export type SupplierDiscountCategory = {
  categoryId: number;
  categoryName: string;
};

export type SupplierDiscountBrand = {
  brandId: number;
  brandName: string;
};

export type SupplierDiscountFilterState = "all" | "none" | "any" | "specific";

export type SupplierDiscountProduct = {
  ruleId: number | null;
  productId: number;
  productCode: string;
  barcode: string;
  productName: string;
  categoryId: number | null;
  categoryName: string;
  brandId: number | null;
  brandName: string;
  parentId: number | null;
  costPerUnit: number | null;
  pricePerUnit: number | null;
  discount: SupplierDiscountOption | null;
};

export type SupplierDiscountRule = {
  id: number;
  supplierId: number | null;
  supplierName: string;
  productId: number | null;
  productCode: string;
  productName: string;
  barcode: string;
  categoryId: number | null;
  categoryName: string;
  brandId: number | null;
  brandName: string;
  discount: SupplierDiscountOption | null;
};

export type SupplierDiscountModuleData = {
  suppliers: SupplierDiscountSupplier[];
  categories: SupplierDiscountCategory[];
  brands: SupplierDiscountBrand[];
  discountTypes: SupplierDiscountOption[];
};

export type SupplierDiscountProductPage = {
  products: SupplierDiscountProduct[];
  filterOptions: {
    supplierId: number | null;
    categories: SupplierDiscountCategory[];
    brands: SupplierDiscountBrand[];
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    search: string;
  };
  emptyStateMessage: string | null;
};

export type SupplierDiscountPreflightResult = {
  newLinks: number[];
  existingLinks: Array<{
    id: number;
    productId: number;
  }>;
};

export type SupplierDiscountBulkResult = {
  created: number;
  updated: number;
  failed: Array<{
    productId: number;
    productName: string;
    reason: string;
  }>;
};

export type SupplierDiscountPricingResult = {
  supplierId: number;
  productId: number;
  discountProductId: number;
  isParentProduct: boolean;
  baseCost: number | null;
  finalCost: number | null;
  ruleId: number | null;
  discount: SupplierDiscountOption | null;
};
