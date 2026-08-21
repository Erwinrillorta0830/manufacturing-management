// src/app/api/fm/accounting/discount-management/customer-discounting/pricing/service.ts
import {
  addSoftDeleteFilters,
  asNumber,
  asString,
  directusFetch,
  discountLabel,
  DirectusList,
  isDeletedAtAccessError,
  relationId,
} from "../_utils";

const priceTierFields = ["price_per_unit", "priceA", "priceB", "priceC", "priceD", "priceE"] as const;

/**
 * Supported product price columns that can be used as the base price.
 */
export type CustomerDiscountPriceTier = typeof priceTierFields[number];

/**
 * Discount hierarchy tier that produced the resolved price.
 */
export type AppliedDiscountTier = "product" | "supplier_category" | "global" | "base";

type DiscountOption = {
  id: number;
  discountType: string;
  totalPercent: number;
};

type CustomerRow = {
  id?: unknown;
  customer_code?: unknown;
  customer_name?: unknown;
  discount_type?: unknown;
};

type ProductRow = {
  product_id?: unknown;
  parent_id?: unknown;
  product_code?: unknown;
  barcode?: unknown;
  product_name?: unknown;
  product_category?: unknown;
  unit_of_measurement?: unknown;
  price_per_unit?: unknown;
  priceA?: unknown;
  priceB?: unknown;
  priceC?: unknown;
  priceD?: unknown;
  priceE?: unknown;
};

type ProductRuleRow = {
  id?: unknown;
  unit_price?: unknown;
  discount_type?: unknown;
};

type SupplierCategoryRuleRow = {
  id?: unknown;
  supplier_id?: unknown;
  category_id?: unknown;
  discount_type?: unknown;
};

type ProductSupplierRow = {
  supplier_id?: unknown;
};

/**
 * Request contract for resolving a customer-specific product price.
 */
export type CustomerDiscountPriceInput = {
  customerCode: string;
  productId: number;
  supplierId?: number | null;
  priceTier?: CustomerDiscountPriceTier | null;
  basePrice?: number | null;
};

/**
 * Response contract that explains which discount tier produced the final price.
 */
export type CustomerDiscountPriceResult = {
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
  priceTier: CustomerDiscountPriceTier | "manual";
  basePrice: number | null;
  appliedTier: AppliedDiscountTier;
  ruleId: number | null;
  discount: DiscountOption | null;
  unitPrice: number | null;
  finalPrice: number | null;
};

/**
 * Domain error used when pricing input is invalid or required records are missing.
 */
export class CustomerDiscountPricingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomerDiscountPricingError";
    this.status = status;
  }
}

/**
 * Validates caller-provided price tier names against the product price columns.
 */
export function parsePriceTier(value: unknown): CustomerDiscountPriceTier | null {
  const tier = asString(value);
  return priceTierFields.includes(tier as CustomerDiscountPriceTier)
    ? tier as CustomerDiscountPriceTier
    : null;
}

function categoryName(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).category_name)
    : "";
}

function unitName(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).unit_name)
    : "";
}

function unitShortcut(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).unit_shortcut)
    : "";
}

/**
 * Chooses the requested product base price, falling back through configured price tiers.
 */
function selectedBasePrice(product: ProductRow, priceTier: CustomerDiscountPriceTier | null, basePrice: number | null) {
  if (basePrice !== null) return { priceTier: "manual" as const, basePrice };

  const orderedTiers = priceTier
    ? [priceTier, ...priceTierFields.filter((tier) => tier !== priceTier)]
    : priceTierFields;

  for (const tier of orderedTiers) {
    const price = asNumber(product[tier]);
    if (price !== null) return { priceTier: tier, basePrice: price };
  }

  return { priceTier: priceTier ?? "price_per_unit", basePrice: null };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Applies a percent discount and rounds the result to currency precision.
 */
function applyDiscount(basePrice: number | null, discount: DiscountOption | null) {
  if (basePrice === null || !discount) return null;
  return roundMoney(basePrice * (1 - discount.totalPercent / 100));
}

/**
 * Loads the customer and global discount used by the hierarchy fallback tier.
 */
async function fetchCustomer(customerCode: string) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "id,customer_code,customer_name,discount_type,discount_type.id,discount_type.discount_type,discount_type.total_percent");
  params.set("filter[customer_code][_eq]", customerCode);

  const res = await directusFetch<DirectusList<CustomerRow>>(`/items/customer?${params.toString()}`);
  const row = res.data?.[0];
  if (!row) throw new CustomerDiscountPricingError("Customer was not found", 404);

  return {
    id: asNumber(row.id) ?? 0,
    customerCode: asString(row.customer_code),
    customerName: asString(row.customer_name),
    globalDiscount: discountLabel(row.discount_type),
  };
}

/**
 * Loads product pricing/category/UOM fields needed by the resolver.
 */
async function fetchProduct(productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set(
    "fields",
    [
      "product_id",
      "parent_id",
      "product_code",
      "barcode",
      "product_name",
      "product_category",
      "product_category.category_id",
      "product_category.category_name",
      "unit_of_measurement",
      "unit_of_measurement.unit_id",
      "unit_of_measurement.unit_name",
      "unit_of_measurement.unit_shortcut",
      "price_per_unit",
      "priceA",
      "priceB",
      "priceC",
      "priceD",
      "priceE",
    ].join(","),
  );
  params.set("filter[product_id][_eq]", String(productId));

  const res = await directusFetch<DirectusList<ProductRow>>(`/items/products?${params.toString()}`);
  const row = res.data?.[0];
  if (!row) throw new CustomerDiscountPricingError("Product was not found", 404);

  return row;
}

/**
 * Loads the most recent active product-specific rule for the customer/product pair.
 */
async function fetchProductRule(customerCode: string, productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("sort", "-id");
  params.set("fields", "id,unit_price,discount_type,discount_type.id,discount_type.discount_type,discount_type.total_percent");
  params.set("filter[customer_code][_eq]", customerCode);
  params.set("filter[product_id][_eq]", String(productId));

  const paramsWithSoftDelete = new URLSearchParams(params);
  addSoftDeleteFilters(paramsWithSoftDelete);

  let res: DirectusList<ProductRuleRow>;
  try {
    res = await directusFetch<DirectusList<ProductRuleRow>>(
      `/items/product_per_customer?${paramsWithSoftDelete.toString()}`,
    );
  } catch (error) {
    if (!isDeletedAtAccessError(error)) throw error;
    res = await directusFetch<DirectusList<ProductRuleRow>>(`/items/product_per_customer?${params.toString()}`);
  }

  return res.data?.[0] ?? null;
}

/**
 * Finds suppliers linked to the product when the caller did not provide one.
 */
async function fetchProductSupplierIds(productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "supplier_id,supplier_id.id");
  params.set("filter[product_id][_eq]", String(productId));

  const res = await directusFetch<DirectusList<ProductSupplierRow>>(`/items/product_per_supplier?${params.toString()}`);
  return Array.from(
    new Set(
      (res.data ?? [])
        .map((row) => relationId(row.supplier_id))
        .filter((id): id is number => id !== null && id > 0),
    ),
  );
}

/**
 * Loads the most specific supplier/category rule that matches the product context.
 */
async function fetchSupplierCategoryRule(customerCode: string, supplierIds: number[], categoryId: number | null) {
  if (!categoryId || supplierIds.length === 0) return null;

  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("sort", "-id");
  params.set(
    "fields",
    "id,supplier_id,category_id,discount_type,discount_type.id,discount_type.discount_type,discount_type.total_percent",
  );
  params.set("filter[customer_code][_eq]", customerCode);
  params.set("filter[category_id][_eq]", String(categoryId));
  params.set("filter[supplier_id][_in]", supplierIds.join(","));
  addSoftDeleteFilters(params);

  const res = await directusFetch<DirectusList<SupplierCategoryRuleRow>>(
    `/items/supplier_category_discount_per_customer?${params.toString()}`,
  );
  return res.data?.[0] ?? null;
}

/**
 * Resolves product-level overrides, preferring explicit unit price over discount percent.
 */
function resolveProductRule(args: {
  customer: CustomerDiscountPriceResult["customer"];
  product: CustomerDiscountPriceResult["product"];
  productRule: ProductRuleRow;
  supplierId: number | null;
  priceTier: CustomerDiscountPriceResult["priceTier"];
  basePrice: number | null;
}): CustomerDiscountPriceResult | null {
  const unitPrice = asNumber(args.productRule.unit_price);
  const discount = discountLabel(args.productRule.discount_type);

  if (unitPrice !== null) {
    return {
      customer: args.customer,
      product: args.product,
      supplierId: args.supplierId,
      priceTier: args.priceTier,
      basePrice: args.basePrice,
      appliedTier: "product",
      ruleId: asNumber(args.productRule.id),
      discount,
      unitPrice,
      finalPrice: roundMoney(unitPrice),
    };
  }

  if (!discount) return null;

  return {
    customer: args.customer,
    product: args.product,
    supplierId: args.supplierId,
    priceTier: args.priceTier,
    basePrice: args.basePrice,
    appliedTier: "product",
    ruleId: asNumber(args.productRule.id),
    discount,
    unitPrice: null,
    finalPrice: applyDiscount(args.basePrice, discount),
  };
}

/**
 * Applies the customer discount hierarchy: product, supplier/category, global, then base price.
 */
export async function resolveCustomerDiscountPrice(input: CustomerDiscountPriceInput): Promise<CustomerDiscountPriceResult> {
  const customerCode = asString(input.customerCode);
  if (!customerCode) throw new CustomerDiscountPricingError("customerCode is required");
  if (!input.productId) throw new CustomerDiscountPricingError("productId is required");

  const [customer, productRow] = await Promise.all([
    fetchCustomer(customerCode),
    fetchProduct(input.productId),
  ]);

  const productId = asNumber(productRow.product_id) ?? input.productId;
  const parentProductId = relationId(productRow.parent_id, "product_id") ?? productId;
  const productRule = await fetchProductRule(customerCode, parentProductId);
  const product = {
    productId,
    productCode: asString(productRow.product_code),
    barcode: asString(productRow.barcode),
    productName: asString(productRow.product_name),
    categoryId: relationId(productRow.product_category, "category_id"),
    categoryName: categoryName(productRow.product_category),
    unitId: relationId(productRow.unit_of_measurement, "unit_id"),
    unitName: unitName(productRow.unit_of_measurement),
    unitShortcut: unitShortcut(productRow.unit_of_measurement),
  };
  const base = selectedBasePrice(productRow, input.priceTier ?? null, input.basePrice ?? null);
  const initialSupplierId = input.supplierId ?? null;

  if (productRule) {
    const resolved = resolveProductRule({
      customer,
      product,
      productRule,
      supplierId: initialSupplierId,
      priceTier: base.priceTier,
      basePrice: base.basePrice,
    });
    if (resolved) return resolved;
  }

  const supplierIds = initialSupplierId ? [initialSupplierId] : await fetchProductSupplierIds(parentProductId);
  const supplierCategoryRule = await fetchSupplierCategoryRule(customerCode, supplierIds, product.categoryId);
  const supplierCategoryDiscount = discountLabel(supplierCategoryRule?.discount_type);

  if (supplierCategoryRule && supplierCategoryDiscount) {
    return {
      customer,
      product,
      supplierId: relationId(supplierCategoryRule.supplier_id) ?? supplierIds[0] ?? null,
      priceTier: base.priceTier,
      basePrice: base.basePrice,
      appliedTier: "supplier_category",
      ruleId: asNumber(supplierCategoryRule.id),
      discount: supplierCategoryDiscount,
      unitPrice: null,
      finalPrice: applyDiscount(base.basePrice, supplierCategoryDiscount),
    };
  }

  if (customer.globalDiscount) {
    return {
      customer,
      product,
      supplierId: initialSupplierId,
      priceTier: base.priceTier,
      basePrice: base.basePrice,
      appliedTier: "global",
      ruleId: null,
      discount: customer.globalDiscount,
      unitPrice: null,
      finalPrice: applyDiscount(base.basePrice, customer.globalDiscount),
    };
  }

  return {
    customer,
    product,
    supplierId: initialSupplierId,
    priceTier: base.priceTier,
    basePrice: base.basePrice,
    appliedTier: "base",
    ruleId: null,
    discount: null,
    unitPrice: null,
    finalPrice: base.basePrice,
  };
}
