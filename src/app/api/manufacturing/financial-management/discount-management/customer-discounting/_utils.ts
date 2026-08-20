// src/app/api/fm/accounting/discount-management/customer-discounting/_utils.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
export const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

export type DirectusList<T> = { data?: T[]; meta?: { filter_count?: number | string } };
export type DirectusItem<T> = { data?: T };

/**
 * Error wrapper that preserves the upstream Directus status and response body
 * so BFF routes can return actionable diagnostics without losing context.
 */
export class DirectusRequestError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "DirectusRequestError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Normalizes thrown errors into the JSON shape used by customer discounting API routes.
 */
export function jsonError(error: unknown, fallback = "Internal Server Error") {
  if (error instanceof DirectusRequestError) {
    return NextResponse.json(
      { error: error.message, details: error.body },
      { status: error.status || 500 },
    );
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

/**
 * Builds the authenticated Directus headers shared by all customer discounting BFF calls.
 */
export function directusHeaders(initHeaders?: HeadersInit): HeadersInit {
  if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  if (!DIRECTUS_TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    ...(initHeaders instanceof Headers ? Object.fromEntries(initHeaders.entries()) : initHeaders ?? {}),
  };
}

/**
 * Executes a Directus request through the server-side static token and parses JSON responses.
 */
export async function directusFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${DIRECTUS_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: directusHeaders(init?.headers),
  });
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new DirectusRequestError(`Directus request failed (${res.status})`, res.status, text);
  }

  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/**
 * Converts Directus scalar or relation id values into a finite number.
 */
export function asNumber(value: unknown): number | null {
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

/**
 * Converts optional Directus values into trimmed display-safe strings.
 */
export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/**
 * Extracts a relation id from either a scalar id or a Directus relation object.
 */
export function relationId(value: unknown, fallbackKey?: string): number | null {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return asNumber(record.id ?? (fallbackKey ? record[fallbackKey] : undefined));
  }

  return asNumber(value);
}

/**
 * Maps a Directus discount_type relation into the shared UI option shape.
 */
export function discountLabel(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = asNumber(record.id);
  if (!id) return null;

  return {
    id,
    discountType: asString(record.discount_type),
    totalPercent: asNumber(record.total_percent) ?? 0,
  };
}

/**
 * Adds the common soft-delete filter used by rule tables that expose deleted_at.
 */
export function addSoftDeleteFilters(params: URLSearchParams) {
  params.set("filter[deleted_at][_null]", "true");
}

/**
 * Detects environments where product_per_customer does not expose deleted_at.
 */
export function isDeletedAtAccessError(error: unknown) {
  if (!(error instanceof DirectusRequestError)) return false;

  const message = `${error.message} ${error.body}`.toLowerCase();
  return (error.status === 400 || error.status === 403) && message.includes("deleted_at");
}

/**
 * Builds the base active customer query for module-level customer lookups.
 */
export function activeCustomerParams() {
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("sort", "customer_name");
  params.set(
    "fields",
    [
      "id",
      "customer_code",
      "customer_name",
      "store_name",
      "store_type",
      "store_type.id",
      "store_type.store_type",
      "isActive",
      "discount_type",
      "discount_type.id",
      "discount_type.discount_type",
      "discount_type.total_percent",
    ].join(","),
  );
  params.set("filter[isActive][_eq]", "1");
  return params;
}

/**
 * Builds the store type lookup query used by customer discounting filters.
 */
export function storeTypeParams() {
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("sort", "store_type");
  params.set("fields", "id,store_type");
  return params;
}

/**
 * Builds the discount type lookup query shared by module and form data loaders.
 */
export function discountTypeParams() {
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("sort", "discount_type");
  params.set("fields", "id,discount_type,total_percent");
  return params;
}

/**
 * Builds the trade supplier lookup query, optionally scoped by Directus search text.
 */
export function tradeSupplierParams(q?: string) {
  const params = new URLSearchParams();
  params.set("limit", q ? "30" : "-1");
  params.set("sort", "supplier_name");
  params.set("fields", "id,supplier_name,supplier_shortcut,supplier_type,isActive");
  params.set("filter[isActive][_eq]", "1");
  params.set("filter[supplier_type][_eq]", "TRADE");
  if (q) params.set("search", q);
  return params;
}

/**
 * Builds the category lookup query used by supplier/category discount rules.
 */
export function categoryParams() {
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("sort", "category_name");
  params.set("fields", "category_id,category_name");
  return params;
}

/**
 * Adds the parent-product filter used when child/UOM variants should inherit rules.
 */
export function addParentProductFilter(params: URLSearchParams, index: number) {
  params.set(`filter[_and][${index}][_or][0][parent_id][_null]`, "true");
  params.set(`filter[_and][${index}][_or][1][parent_id][_eq]`, "0");
}

/**
 * Adds the parent-product filter through a product relation.
 */
export function addRelatedParentProductFilter(params: URLSearchParams, index: number) {
  params.set(`filter[_and][${index}][_or][0][product_id][parent_id][_null]`, "true");
  params.set(`filter[_and][${index}][_or][1][product_id][parent_id][_eq]`, "0");
}

/**
 * Reads a relation display field from a Directus object relation.
 */
export function relationName(value: unknown, fieldName: string) {
  return value && typeof value === "object"
    ? asString((value as Record<string, unknown>)[fieldName])
    : "";
}
