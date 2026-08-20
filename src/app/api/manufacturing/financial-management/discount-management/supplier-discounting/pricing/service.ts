// src/app/api/fm/accounting/discount-management/supplier-discounting/pricing/service.ts
import {
  asNumber,
  directusFetch,
  discountLabel,
  DirectusList,
  relationId,
} from "../_utils";

type RuleRow = {
  id?: unknown;
  discount_type?: unknown;
};

type ProductRow = {
  product_id?: unknown;
  parent_id?: unknown;
  cost_per_unit?: unknown;
  price_per_unit?: unknown;
};

export type SupplierDiscountPricingInput = {
  supplierId: number;
  productId: number;
  baseCost?: number | null;
};

export class SupplierDiscountPricingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SupplierDiscountPricingError";
    this.status = status;
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function applyDiscount(baseCost: number | null, discount: ReturnType<typeof discountLabel>) {
  if (baseCost === null || !discount) return baseCost;
  return roundMoney(baseCost * (1 - discount.totalPercent / 100));
}

async function fetchProduct(productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "product_id,parent_id,cost_per_unit,price_per_unit");
  params.set("filter[product_id][_eq]", String(productId));

  const res = await directusFetch<DirectusList<ProductRow>>(`/items/products?${params.toString()}`);
  const row = res.data?.[0];
  if (!row) throw new SupplierDiscountPricingError("Product was not found", 404);
  return row;
}

async function fetchRule(supplierId: number, productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "id,discount_type,discount_type.id,discount_type.discount_type,discount_type.total_percent");
  params.set("filter[supplier_id][_eq]", String(supplierId));
  params.set("filter[product_id][_eq]", String(productId));

  const res = await directusFetch<DirectusList<RuleRow>>(`/items/product_per_supplier?${params.toString()}`);
  return res.data?.[0] ?? null;
}

export async function resolveSupplierDiscountPrice(input: SupplierDiscountPricingInput) {
  if (!input.supplierId) throw new SupplierDiscountPricingError("supplierId is required");
  if (!input.productId) throw new SupplierDiscountPricingError("productId is required");

  const product = await fetchProduct(input.productId);
  const productId = relationId(product.product_id, "product_id") ?? input.productId;
  const parentId = relationId(product.parent_id, "product_id");
  const discountProductId = parentId && parentId > 0 ? parentId : productId;
  const rule = await fetchRule(input.supplierId, discountProductId);
  const discount = discountLabel(rule?.discount_type);
  const baseCost = input.baseCost ?? asNumber(product.cost_per_unit) ?? asNumber(product.price_per_unit);

  return {
    supplierId: input.supplierId,
    productId,
    discountProductId,
    isParentProduct: discountProductId === productId,
    baseCost,
    finalCost: applyDiscount(baseCost, discount),
    ruleId: asNumber(rule?.id),
    discount,
  };
}

export function recordBody(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function parsePricingInput(source: Record<string, unknown>): SupplierDiscountPricingInput {
  return {
    supplierId: asNumber(source.supplierId ?? source.supplier_id) ?? 0,
    productId: asNumber(source.productId ?? source.product_id) ?? 0,
    baseCost: asNumber(source.baseCost ?? source.base_cost),
  };
}

export function pricingErrorResponse(error: unknown) {
  if (error instanceof SupplierDiscountPricingError) {
    return {
      body: { error: error.message },
      status: error.status,
    };
  }

  return {
    body: { error: error instanceof Error ? error.message : "Internal Server Error" },
    status: 500,
  };
}
