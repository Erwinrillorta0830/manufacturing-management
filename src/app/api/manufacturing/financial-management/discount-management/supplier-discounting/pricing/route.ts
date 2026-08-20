import { NextRequest, NextResponse } from "next/server";
import {
  parsePricingInput,
  pricingErrorResponse,
  recordBody,
  resolveSupplierDiscountPrice,
} from "./service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolves supplier-side discounted costing for query-string based consumers.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await resolveSupplierDiscountPrice(parsePricingInput(Object.fromEntries(searchParams)));
    return NextResponse.json(result);
  } catch (error) {
    const { body, status } = pricingErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Resolves supplier-side discounted costing for order and quote integrations.
 */
export async function POST(request: NextRequest) {
  try {
    const body = recordBody(await request.json().catch(() => ({})));
    const result = await resolveSupplierDiscountPrice(parsePricingInput(body));
    return NextResponse.json(result);
  } catch (error) {
    const { body, status } = pricingErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
