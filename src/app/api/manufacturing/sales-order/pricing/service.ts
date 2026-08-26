// Removed NextResponse as it was unused
export const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
export const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

function directusHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${DIRECTUS_TOKEN}`,
  };
}

async function directusFetch<T>(path: string): Promise<T> {
  const url = `${DIRECTUS_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: directusHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Directus request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

type ProductRow = {
  product_id?: number | null;
  parent_id?: number | { product_id?: number } | null;
  product_category?: number | { category_id?: number } | null;
  cost_per_unit?: number | string | null;
  price_per_unit?: number | string | null;
};

type DiscountRuleRow = {
  id?: number;
  customer_code?: string;
  category_id?: number | { category_id?: number } | null;
  supplier_id?: number | { id?: number } | null;
  discount_type?: {
    id?: number;
    discount_type?: string;
    total_percent?: number | string;
  } | null;
};

export class SalesOrderPricingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SalesOrderPricingError";
    this.status = status;
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return asNumber(record.id ?? record.product_id ?? record.category_id);
  }
  return null;
}

export type SalesOrderPricingInput = {
  customerCode: string;
  productId: number;
  basePrice?: number | null;
};

async function fetchProduct(productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "product_id,parent_id,parent_id.product_id,product_category,product_category.category_id,cost_per_unit,price_per_unit");
  params.set("filter[product_id][_eq]", String(productId));

  const res = await directusFetch<{ data?: ProductRow[] }>(`/items/products?${params.toString()}`);
  const row = res.data?.[0];
  if (!row) throw new SalesOrderPricingError("Product was not found", 404);
  return row;
}

async function fetchCustomerDiscountRules(customerCode: string) {
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "id,customer_code,category_id,category_id.category_id,supplier_id,discount_type,discount_type.id,discount_type.discount_type,discount_type.total_percent");
  params.set("filter[customer_code][_eq]", customerCode);
  params.set("filter[deleted_at][_null]", "true");

  const res = await directusFetch<{ data?: DiscountRuleRow[] }>(`/items/supplier_category_discount_per_customer?${params.toString()}`);
  return res.data ?? [];
}

async function fetchProductSuppliers(productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "supplier_id,supplier_id.id");
  params.set("filter[product_id][_eq]", String(productId));

  const res = await directusFetch<{ data?: { supplier_id?: number | { id?: number } }[] }>(`/items/product_per_supplier?${params.toString()}`);
  return (res.data || []).map(r => asNumber(r.supplier_id)).filter((id): id is number => id !== null);
}

export async function resolveCustomerDiscountPrice(input: SalesOrderPricingInput) {
  if (!input.customerCode) throw new SalesOrderPricingError("customerCode is required");
  if (!input.productId) throw new SalesOrderPricingError("productId is required");

  const product = await fetchProduct(input.productId);
  
  // Resolve base price if not provided
  const basePrice = input.basePrice ?? asNumber(product.price_per_unit) ?? asNumber(product.cost_per_unit) ?? 0;
  
  // Find category ID of the product
  let categoryId = asNumber(product.product_category);

  // If no category ID is directly on the product (e.g. UOM variant), fetch parent's category.
  if (!categoryId && product.parent_id) {
    const parentId = asNumber(product.parent_id);
    if (parentId && parentId > 0) {
        try {
            const parent = await fetchProduct(parentId);
            categoryId = asNumber(parent.product_category);
        } catch {
            // Parent not found, ignore.
        }
    }
  }

  // Fetch product suppliers
  let supplierIds = await fetchProductSuppliers(input.productId);

  // If no suppliers are directly on the product (e.g. UOM variant), fetch parent's suppliers.
  if (supplierIds.length === 0 && product.parent_id) {
    const parentId = asNumber(product.parent_id);
    if (parentId && parentId > 0) {
        try {
            supplierIds = await fetchProductSuppliers(parentId);
        } catch {
            // Parent suppliers not found, ignore.
        }
    }
  }

  // Fetch active discount rules for the customer
  const rules = await fetchCustomerDiscountRules(input.customerCode);
  
  // Match the rule using Specificity Scoring:
  // - Matches BOTH Supplier & Category = Score 3 (Most Specific)
  // - Matches Supplier ONLY or Category ONLY = Score 2
  // - Global Blanket Discount (both null) = Score 1
  let matchedRule: DiscountRuleRow | null = null;
  let highestScore = 0;

  for (const rule of rules) {
      const ruleCat = asNumber(rule.category_id);
      const ruleSup = asNumber(rule.supplier_id);
      
      // 1. Evaluate Category Match
      if (ruleCat && ruleCat !== categoryId) {
          continue; // Rule requires a specific category, but it doesn't match this product.
      }
      
      // 2. Evaluate Supplier Match
      if (ruleSup) {
          if (!supplierIds.includes(ruleSup)) {
              continue; // Rule requires a specific supplier, but it doesn't match this product.
          }
      } else {
          // ruleSup is null. This means it is a Finished Goods discount.
          // It MUST ONLY apply to products that are Finished Goods (i.e. have no suppliers).
          if (supplierIds.length > 0) {
              continue; // Product is a raw material, so this Finished Goods discount doesn't apply.
          }
      }
      
      // 3. Rule is valid for this product! Calculate its specificity score.
      let score = 1; // Base score for global blanket rules
      if (ruleCat && ruleSup) score = 3;
      else if (ruleCat || ruleSup) score = 2;
      
      // 4. Keep the rule with the highest specificity
      if (score > highestScore) {
          highestScore = score;
          matchedRule = rule;
      }
  }

  // Calculate final price based on the matched rule
  let finalPrice = basePrice;
  let discount = null;

  if (matchedRule && matchedRule.discount_type) {
      const dt = matchedRule.discount_type;
      const totalPercent = asNumber(dt.total_percent) ?? 0;
      finalPrice = roundMoney(basePrice * (1 - totalPercent / 100));
      discount = {
          id: asNumber(dt.id),
          discountType: dt.discount_type,
          totalPercent: totalPercent
      };
  }

  return {
    customerCode: input.customerCode,
    productId: input.productId,
    categoryId,
    basePrice,
    finalPrice,
    ruleId: asNumber(matchedRule?.id),
    discount,
    debug: { product, rules, matchedRule }
  };
}
