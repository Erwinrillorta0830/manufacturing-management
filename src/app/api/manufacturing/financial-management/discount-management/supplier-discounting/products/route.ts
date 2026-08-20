// src/app/api/fm/accounting/discount-management/supplier-discounting/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addParentProductFilter,
  addRelatedParentProductFilter,
  asNumber,
  asString,
  directusFetch,
  discountLabel,
  DirectusList,
  jsonError,
  relationId,
  relationName,
} from "../_utils";
import type { SupplierDiscountFilterState } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discounting/types";

type ProductRow = {
  product_id?: unknown;
  product_code?: unknown;
  barcode?: unknown;
  product_name?: unknown;
  parent_id?: unknown;
  product_category?: unknown;
  product_brand?: unknown;
  cost_per_unit?: unknown;
  price_per_unit?: unknown;
};

type ProductSupplierRow = {
  id?: unknown;
  product_id?: unknown;
  discount_type?: unknown;
};

type SupplierFilterOptionRow = {
  product_id?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePage(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizePageSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(100, Math.floor(parsed));
}

function normalizeDiscountState(value: unknown): SupplierDiscountFilterState {
  return value === "none" || value === "any" || value === "specific" ? value : "all";
}

function readProductQuery(searchParams: URLSearchParams) {
  const page = normalizePage(searchParams.get("page"));
  const pageSize = normalizePageSize(searchParams.get("page_size") ?? searchParams.get("pageSize"));
  const search = asString(searchParams.get("q") ?? searchParams.get("search"));
  const categoryId = asNumber(searchParams.get("category_id") ?? searchParams.get("categoryId"));
  const brandId = asNumber(searchParams.get("brand_id") ?? searchParams.get("brandId"));
  const supplierId = asNumber(searchParams.get("supplier_id") ?? searchParams.get("supplierId"));
  let discountState = normalizeDiscountState(searchParams.get("discount_state") ?? searchParams.get("discountState"));
  const discountTypeId = asNumber(searchParams.get("discount_type_id") ?? searchParams.get("discountTypeId"));
  if (discountState === "specific" && !discountTypeId) discountState = "all";
  return { page, pageSize, search, categoryId, brandId, supplierId, discountState, discountTypeId };
}

function productFields() {
  return [
    "product_id",
    "product_code",
    "barcode",
    "product_name",
    "parent_id",
    "product_category",
    "product_category.category_id",
    "product_category.category_name",
    "product_brand",
    "product_brand.brand_id",
    "product_brand.brand_name",
    "cost_per_unit",
    "price_per_unit",
  ].join(",");
}

function buildProductParams(query: ReturnType<typeof readProductQuery>) {
  const params = new URLSearchParams();
  const offset = (query.page - 1) * query.pageSize;
  let filterIndex = 0;

  params.set("limit", String(query.pageSize));
  params.set("offset", String(offset));
  params.set("meta", "filter_count");
  params.set("sort", "product_name,product_id");
  params.set("fields", productFields());

  addParentProductFilter(params, filterIndex);
  filterIndex += 1;
  params.set(`filter[_and][${filterIndex}][isActive][_eq]`, "1");
  filterIndex += 1;

  if (query.categoryId) {
    params.set(`filter[_and][${filterIndex}][product_category][_eq]`, String(query.categoryId));
    filterIndex += 1;
  }

  if (query.brandId) {
    params.set(`filter[_and][${filterIndex}][product_brand][_eq]`, String(query.brandId));
    filterIndex += 1;
  }

  if (query.search) {
    params.set(`filter[_and][${filterIndex}][_or][0][product_name][_contains]`, query.search);
    params.set(`filter[_and][${filterIndex}][_or][1][product_code][_contains]`, query.search);
    params.set(`filter[_and][${filterIndex}][_or][2][barcode][_contains]`, query.search);
  }

  return params;
}

function buildSupplierProductParams(query: ReturnType<typeof readProductQuery> & { supplierId: number }) {
  const params = new URLSearchParams();
  const offset = (query.page - 1) * query.pageSize;
  let filterIndex = 0;

  params.set("limit", String(query.pageSize));
  params.set("offset", String(offset));
  params.set("meta", "filter_count");
  params.set("sort", "product_id.product_name,product_id.product_id");
  params.set(
    "fields",
    [
      "id",
      "product_id",
      `product_id.${productFields().replaceAll(",", ",product_id.")}`,
      "discount_type",
      "discount_type.id",
      "discount_type.discount_type",
      "discount_type.total_percent",
    ].join(","),
  );
  params.set(`filter[_and][${filterIndex}][supplier_id][_eq]`, String(query.supplierId));
  filterIndex += 1;
  addRelatedParentProductFilter(params, filterIndex);
  filterIndex += 1;
  params.set(`filter[_and][${filterIndex}][product_id][isActive][_eq]`, "1");
  filterIndex += 1;

  if (query.categoryId) {
    params.set(`filter[_and][${filterIndex}][product_id][product_category][_eq]`, String(query.categoryId));
    filterIndex += 1;
  }

  if (query.brandId) {
    params.set(`filter[_and][${filterIndex}][product_id][product_brand][_eq]`, String(query.brandId));
    filterIndex += 1;
  }

  if (query.discountState === "none") {
    params.set(`filter[_and][${filterIndex}][discount_type][_null]`, "true");
    filterIndex += 1;
  } else if (query.discountState === "any") {
    params.set(`filter[_and][${filterIndex}][discount_type][_nnull]`, "true");
    filterIndex += 1;
  } else if (query.discountState === "specific" && query.discountTypeId) {
    params.set(`filter[_and][${filterIndex}][discount_type][_eq]`, String(query.discountTypeId));
    filterIndex += 1;
  }

  if (query.search) {
    params.set(`filter[_and][${filterIndex}][_or][0][product_id][product_name][_contains]`, query.search);
    params.set(`filter[_and][${filterIndex}][_or][1][product_id][product_code][_contains]`, query.search);
    params.set(`filter[_and][${filterIndex}][_or][2][product_id][barcode][_contains]`, query.search);
  }

  return params;
}

function buildSupplierFilterOptionParams(supplierId: number) {
  const params = new URLSearchParams();
  let filterIndex = 0;

  params.set("limit", "-1");
  params.set("sort", "product_id.product_category.category_name,product_id.product_brand.brand_name");
  params.set(
    "fields",
    [
      "product_id",
      "product_id.product_category",
      "product_id.product_category.category_id",
      "product_id.product_category.category_name",
      "product_id.product_brand",
      "product_id.product_brand.brand_id",
      "product_id.product_brand.brand_name",
    ].join(","),
  );
  params.set(`filter[_and][${filterIndex}][supplier_id][_eq]`, String(supplierId));
  filterIndex += 1;
  addRelatedParentProductFilter(params, filterIndex);
  filterIndex += 1;
  params.set(`filter[_and][${filterIndex}][product_id][isActive][_eq]`, "1");

  return params;
}

function normalizeProduct(
  row: ProductRow,
  discount: ReturnType<typeof discountLabel> = null,
  ruleId: number | null = null,
) {
  const productId = asNumber(row.product_id) ?? 0;
  return {
    ruleId,
    productId,
    productCode: asString(row.product_code),
    barcode: asString(row.barcode),
    productName: asString(row.product_name) || "N/A",
    parentId: relationId(row.parent_id, "product_id"),
    categoryId: relationId(row.product_category, "category_id"),
    categoryName: relationName(row.product_category, "category_name"),
    brandId: relationId(row.product_brand, "brand_id"),
    brandName: relationName(row.product_brand, "brand_name"),
    costPerUnit: asNumber(row.cost_per_unit),
    pricePerUnit: asNumber(row.price_per_unit),
    discount,
  };
}

function relationProduct(value: unknown): ProductRow {
  return value && typeof value === "object" ? value as ProductRow : {};
}

async function supplierFilterOptions(supplierId: number | null) {
  if (!supplierId) {
    return { supplierId: null, categories: [], brands: [] };
  }

  const res = await directusFetch<DirectusList<SupplierFilterOptionRow>>(
    `/items/product_per_supplier?${buildSupplierFilterOptionParams(supplierId).toString()}`,
  );
  const categories = new Map<number, string>();
  const brands = new Map<number, string>();

  for (const row of res.data ?? []) {
    const product = relationProduct(row.product_id);
    const categoryId = relationId(product.product_category, "category_id");
    const brandId = relationId(product.product_brand, "brand_id");

    if (categoryId) {
      categories.set(categoryId, relationName(product.product_category, "category_name") || `Category #${categoryId}`);
    }

    if (brandId) {
      brands.set(brandId, relationName(product.product_brand, "brand_name") || `Brand #${brandId}`);
    }
  }

  return {
    supplierId,
    categories: Array.from(categories, ([categoryId, categoryName]) => ({ categoryId, categoryName }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName)),
    brands: Array.from(brands, ([brandId, brandName]) => ({ brandId, brandName }))
      .sort((a, b) => a.brandName.localeCompare(b.brandName)),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = readProductQuery(searchParams);
    const [res, filterOptions] = await Promise.all([
      query.supplierId
        ? directusFetch<DirectusList<ProductSupplierRow>>(
            `/items/product_per_supplier?${buildSupplierProductParams({ ...query, supplierId: query.supplierId }).toString()}`,
          )
        : directusFetch<DirectusList<ProductRow>>(`/items/products?${buildProductParams(query).toString()}`),
      supplierFilterOptions(query.supplierId),
    ]);
    const total = asNumber(res.meta?.filter_count) ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const products = (res.data ?? [])
      .map((row) => query.supplierId
        ? normalizeProduct(
            relationProduct(row.product_id),
            discountLabel((row as ProductSupplierRow).discount_type),
            asNumber((row as ProductSupplierRow).id),
          )
        : normalizeProduct(row as ProductRow))
      .filter((row) => row.productId > 0);

    const emptyStateMessage =
      products.length === 0 && query.supplierId && query.discountState !== "all"
        ? "No parent products match the selected discount filter."
        : products.length === 0 && query.supplierId
        ? "No parent products found for this supplier."
        : products.length === 0 && query.search
        ? "No results found. Please select the parent product to apply discounts."
        : null;

    return NextResponse.json({
      products,
      filterOptions,
      pagination: {
        page: Math.min(query.page, totalPages),
        pageSize: query.pageSize,
        total,
        totalPages,
        search: query.search,
      },
      emptyStateMessage,
    });
  } catch (error) {
    return jsonError(error);
  }
}
