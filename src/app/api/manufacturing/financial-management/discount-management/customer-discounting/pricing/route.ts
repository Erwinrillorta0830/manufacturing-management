// src/app/api/fm/accounting/discount-management/customer-discounting/pricing/route.ts
import { NextRequest, NextResponse } from "next/server";
import { asNumber, asString, jsonError } from "../_utils";
import {
  CustomerDiscountPricingError,
  parsePriceTier,
  resolveCustomerDiscountPrice,
} from "./service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Converts domain pricing errors into the route's public error response shape.
 */
function errorResponse(error: unknown) {
  if (error instanceof CustomerDiscountPricingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return jsonError(error);
}

/**
 * Safely treats arbitrary JSON as an object payload.
 */
function recordBody(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/**
 * Resolves customer pricing from query parameters for read-only consumers.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerCode = asString(searchParams.get("customer_code") ?? searchParams.get("customerCode"));
    const productId = asNumber(searchParams.get("product_id") ?? searchParams.get("productId"));
    const supplierId = asNumber(searchParams.get("supplier_id") ?? searchParams.get("supplierId"));
    const basePrice = asNumber(searchParams.get("base_price") ?? searchParams.get("basePrice"));
    const priceTier = parsePriceTier(searchParams.get("price_tier") ?? searchParams.get("priceTier"));

    if (!customerCode || !productId) {
      return NextResponse.json({ error: "customer_code and product_id are required" }, { status: 400 });
    }

    const result = await resolveCustomerDiscountPrice({
      customerCode,
      productId,
      supplierId,
      basePrice,
      priceTier,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Resolves customer pricing from a JSON payload for forms and product pickers.
 */
export async function POST(request: NextRequest) {
  try {
    const body = recordBody(await request.json().catch(() => ({})));
    const customerCode = asString(body.customerCode ?? body.customer_code);
    const productId = asNumber(body.productId ?? body.product_id);
    const supplierId = asNumber(body.supplierId ?? body.supplier_id);
    const basePrice = asNumber(body.basePrice ?? body.base_price);
    const priceTier = parsePriceTier(body.priceTier ?? body.price_tier);

    if (!customerCode || !productId) {
      return NextResponse.json({ error: "customerCode and productId are required" }, { status: 400 });
    }

    const result = await resolveCustomerDiscountPrice({
      customerCode,
      productId,
      supplierId,
      basePrice,
      priceTier,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
