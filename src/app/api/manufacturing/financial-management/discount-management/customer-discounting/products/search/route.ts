// src/app/api/fm/accounting/discount-management/customer-discounting/products/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { addParentProductFilter, asNumber, asString, directusFetch, DirectusList, jsonError } from "../../_utils";
import { CustomerDiscountPricingError, parsePriceTier, resolveCustomerDiscountPrice } from "../../pricing/service";

type ProductRow = {
  product_id?: unknown;
  product_code?: unknown;
  barcode?: unknown;
  product_name?: unknown;
  parent_id?: unknown;
  product_category?: unknown;
  unit_of_measurement?: unknown;
  price_per_unit?: unknown;
  priceA?: unknown;
  priceB?: unknown;
  priceC?: unknown;
  priceD?: unknown;
  priceE?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Extracts the product category id from scalar or relational Directus responses.
 */
function categoryId(value: unknown) {
  if (value && typeof value === "object") {
    return asNumber((value as Record<string, unknown>).category_id);
  }
  return asNumber(value);
}

/**
 * Extracts the product category display name from a Directus relation object.
 */
function categoryName(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).category_name)
    : "";
}

/**
 * Extracts the unit id from scalar or relational Directus responses.
 */
function unitId(value: unknown) {
  if (value && typeof value === "object") {
    return asNumber((value as Record<string, unknown>).unit_id);
  }
  return asNumber(value);
}

/**
 * Extracts the unit display name from a Directus relation object.
 */
function unitName(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).unit_name)
    : "";
}

/**
 * Extracts the unit shortcut used in compact product picker labels.
 */
function unitShortcut(value: unknown) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>).unit_shortcut)
    : "";
}

/**
 * Searches products and optionally includes resolved customer pricing data.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = asString(searchParams.get("q"));
    const customerCode = asString(searchParams.get("customer_code") ?? searchParams.get("customerCode"));
    const supplierId = asNumber(searchParams.get("supplier_id") ?? searchParams.get("supplierId"));
    const priceTier = parsePriceTier(searchParams.get("price_tier") ?? searchParams.get("priceTier"));

    if (!q) return NextResponse.json({ data: [] });

    const params = new URLSearchParams();
    let filterIndex = 0;
    params.set("limit", "30");
    params.set("sort", "product_name");
    params.set(
      "fields",
      [
        "product_id",
        "product_code",
        "barcode",
        "product_name",
        "parent_id",
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
    addParentProductFilter(params, filterIndex);
    filterIndex += 1;
    params.set(`filter[_and][${filterIndex}][isActive][_eq]`, "1");
    filterIndex += 1;
    params.set(`filter[_and][${filterIndex}][_or][0][product_name][_contains]`, q);
    params.set(`filter[_and][${filterIndex}][_or][1][product_code][_contains]`, q);
    params.set(`filter[_and][${filterIndex}][_or][2][barcode][_contains]`, q);

    const res = await directusFetch<DirectusList<ProductRow>>(`/items/products?${params.toString()}`);
    const products = (res.data ?? [])
      .map((row) => ({
        productId: asNumber(row.product_id) ?? 0,
        productCode: asString(row.product_code),
        barcode: asString(row.barcode),
        productName: asString(row.product_name),
        categoryId: categoryId(row.product_category),
        categoryName: categoryName(row.product_category),
        unitId: unitId(row.unit_of_measurement),
        unitName: unitName(row.unit_of_measurement),
        unitShortcut: unitShortcut(row.unit_of_measurement),
        pricePerUnit: asNumber(row.price_per_unit),
        priceA: asNumber(row.priceA),
        priceB: asNumber(row.priceB),
        priceC: asNumber(row.priceC),
        priceD: asNumber(row.priceD),
        priceE: asNumber(row.priceE),
      }))
      .filter((row) => row.productId > 0 && row.productName);

    const data = customerCode
      ? await Promise.all(
          products.map(async (product) => ({
            ...product,
            pricing: await resolveCustomerDiscountPrice({
              customerCode,
              productId: product.productId,
              supplierId,
              priceTier,
            }),
          })),
        )
      : products;

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CustomerDiscountPricingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return jsonError(error);
  }
}
