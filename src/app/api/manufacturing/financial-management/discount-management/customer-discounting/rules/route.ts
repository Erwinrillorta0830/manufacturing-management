// src/app/api/fm/accounting/discount-management/customer-discounting/rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addSoftDeleteFilters,
  addRelatedParentProductFilter,
  asNumber,
  asString,
  directusFetch,
  discountLabel,
  DirectusList,
  isDeletedAtAccessError,
  jsonError,
  relationId,
} from "../_utils";

type SupplierCategoryRuleRow = {
  id?: unknown;
  customer_code?: unknown;
  supplier_id?: unknown;
  category_id?: unknown;
  discount_type?: unknown;
};

type ProductRuleRow = {
  id?: unknown;
  customer_code?: unknown;
  product_id?: unknown;
  discount_type?: unknown;
  unit_price?: unknown;
  deleted_at?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reads the supplier label from a Directus supplier relation.
 */
function supplierName(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).supplier_name)
    : "";
}

/**
 * Reads the category label from a Directus category relation.
 */
function categoryName(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).category_name)
    : "";
}

/**
 * Reads the product name from a Directus product relation.
 */
function productName(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).product_name)
    : "";
}

/**
 * Reads the product code from a Directus product relation.
 */
function productCode(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).product_code)
    : "";
}

/**
 * Reads the product barcode from a Directus product relation.
 */
function productBarcode(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).barcode)
    : "";
}

/**
 * Reads the product category id from a nested product relation.
 */
function productCategoryId(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return relationId((value as Record<string, unknown>).product_category, "category_id");
}

/**
 * Reads the product category name from a nested product relation.
 */
function productCategoryName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const category = (value as Record<string, unknown>).product_category;
  return category && typeof category === "object"
    ? asString((category as Record<string, unknown>).category_name)
    : "";
}

/**
 * Reads the product UOM id from a nested product relation.
 */
function productUnitId(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return relationId((value as Record<string, unknown>).unit_of_measurement, "unit_id");
}

/**
 * Reads the product UOM name from a nested product relation.
 */
function productUnitName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const unit = (value as Record<string, unknown>).unit_of_measurement;
  return unit && typeof unit === "object"
    ? asString((unit as Record<string, unknown>).unit_name)
    : "";
}

/**
 * Reads the product UOM shortcut from a nested product relation.
 */
function productUnitShortcut(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const unit = (value as Record<string, unknown>).unit_of_measurement;
  return unit && typeof unit === "object"
    ? asString((unit as Record<string, unknown>).unit_shortcut)
    : "";
}

/**
 * Fetches supplier/category rules while tolerating Directus environments without deleted_at access.
 */
async function fetchSupplierCategoryRules(params: URLSearchParams) {
  try {
    return await directusFetch<DirectusList<SupplierCategoryRuleRow>>(
      `/items/supplier_category_discount_per_customer?${params.toString()}`,
    );
  } catch (error) {
    if (!isDeletedAtAccessError(error)) throw error;

    const paramsWithoutSoftDelete = new URLSearchParams(params);
    paramsWithoutSoftDelete.delete("filter[deleted_at][_null]");

    return directusFetch<DirectusList<SupplierCategoryRuleRow>>(
      `/items/supplier_category_discount_per_customer?${paramsWithoutSoftDelete.toString()}`,
    );
  }
}

/**
 * Fetches product rules while tolerating Directus environments without deleted_at access.
 */
async function fetchProductRules(params: URLSearchParams) {
  const paramsWithSoftDelete = new URLSearchParams(params);
  addSoftDeleteFilters(paramsWithSoftDelete);

  try {
    return await directusFetch<DirectusList<ProductRuleRow>>(
      `/items/product_per_customer?${paramsWithSoftDelete.toString()}`,
    );
  } catch (error) {
    if (!isDeletedAtAccessError(error)) throw error;

    return directusFetch<DirectusList<ProductRuleRow>>(
      `/items/product_per_customer?${params.toString()}`,
    );
  }
}

/**
 * Returns all supplier/category and product rules for a selected customer.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerCode = asString(searchParams.get("customer_code"));

    if (!customerCode) {
      return NextResponse.json({ error: "customer_code is required" }, { status: 400 });
    }

    const supplierParams = new URLSearchParams();
    supplierParams.set("limit", "-1");
    supplierParams.set("sort", "-id");
    supplierParams.set(
      "fields",
      [
        "id",
        "customer_code",
        "supplier_id",
        "supplier_id.id",
        "supplier_id.supplier_name",
        "category_id",
        "category_id.category_id",
        "category_id.category_name",
        "discount_type",
        "discount_type.id",
        "discount_type.discount_type",
        "discount_type.total_percent",
      ].join(","),
    );
    supplierParams.set("filter[customer_code][_eq]", customerCode);
    addSoftDeleteFilters(supplierParams);

    const productParams = new URLSearchParams();
    productParams.set("limit", "-1");
    productParams.set("sort", "-id");
    productParams.set(
      "fields",
      [
        "id",
        "customer_code",
        "unit_price",
        "product_id",
        "product_id.product_id",
        "product_id.product_name",
        "product_id.product_code",
        "product_id.barcode",
        "product_id.product_category",
        "product_id.product_category.category_id",
        "product_id.product_category.category_name",
        "product_id.unit_of_measurement",
        "product_id.unit_of_measurement.unit_id",
        "product_id.unit_of_measurement.unit_name",
        "product_id.unit_of_measurement.unit_shortcut",
        "discount_type",
        "discount_type.id",
        "discount_type.discount_type",
        "discount_type.total_percent",
      ].join(","),
    );
    productParams.set("filter[_and][0][customer_code][_eq]", customerCode);
    addRelatedParentProductFilter(productParams, 1);

    const [supplierRulesRes, productRulesRes] = await Promise.all([
      fetchSupplierCategoryRules(supplierParams),
      fetchProductRules(productParams),
    ]);

    const supplierCategoryRules = (supplierRulesRes.data ?? []).map((row) => ({
      id: asNumber(row.id) ?? 0,
      customerCode: asString(row.customer_code),
      supplierId: relationId(row.supplier_id),
      supplierName: supplierName(row.supplier_id),
      categoryId: relationId(row.category_id, "category_id"),
      categoryName: categoryName(row.category_id),
      discount: discountLabel(row.discount_type),
    })).filter((row) => row.id > 0);

    const productRules = (productRulesRes.data ?? []).map((row) => ({
      id: asNumber(row.id) ?? 0,
      customerCode: asString(row.customer_code),
      productId: relationId(row.product_id, "product_id"),
      productName: productName(row.product_id),
      productCode: productCode(row.product_id),
      barcode: productBarcode(row.product_id),
      categoryId: productCategoryId(row.product_id),
      categoryName: productCategoryName(row.product_id),
      unitId: productUnitId(row.product_id),
      unitName: productUnitName(row.product_id),
      unitShortcut: productUnitShortcut(row.product_id),
      discount: discountLabel(row.discount_type),
      unitPrice: asNumber(row.unit_price),
    })).filter((row) => row.id > 0);

    return NextResponse.json({ supplierCategoryRules, productRules });
  } catch (error) {
    return jsonError(error);
  }
}
