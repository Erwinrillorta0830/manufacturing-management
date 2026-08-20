// src/app/api/fm/line-discount/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

const COLLECTION = "line_discount";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getAuthHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (STATIC_TOKEN) headers.Authorization = `Bearer ${STATIC_TOKEN}`;
  return headers;
}

async function directus<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data?: T; rawText?: string }> {
  if (!DIRECTUS_URL) {
    return { ok: false, status: 500, rawText: "NEXT_PUBLIC_API_BASE_URL is not set" };
  }

  const base = DIRECTUS_URL.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const j = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data: j };
  }

  const t = await res.text();
  return { ok: res.ok, status: res.status, rawText: t };
}

function normalizeError(payload: unknown, fallback = "Request failed.") {
  // Directus typical: { errors: [{ message, extensions... }] }
  const p = payload as Record<string, unknown>;
  const errors = p?.errors as Array<Record<string, unknown>> | undefined;
  const msg =
    errors?.[0]?.message ||
    (p?.error as Record<string, unknown>)?.message ||
    p?.message ||
    fallback;
  return String(msg);
}

/**
 * GET /api/fm/line-discount?limit=-1
 * returns: { data: [...] }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ?? "-1";

  const qs = new URLSearchParams();
  qs.set("limit", limit);
  qs.set("sort", "line_discount"); // stable UI ordering

  const upstream = await directus<unknown>(`/items/${COLLECTION}?${qs.toString()}`, {
    method: "GET",
  });

  if (!upstream.ok) {
    const err = normalizeError(upstream.data, upstream.rawText || "Failed to fetch line discounts.");
    return json({ error: err }, upstream.status);
  }

  // upstream.data is typically { data: [...] }
  return json(upstream.data ?? { data: [] }, 200);
}

/**
 * POST /api/fm/line-discount
 * body: { line_discount, percentage, description }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.line_discount || body?.percentage === undefined || body?.percentage === null) {
    return json({ error: "Code and Percentage are required." }, 400);
  }

  const upstream = await directus<unknown>(`/items/${COLLECTION}`, {
    method: "POST",
    body: JSON.stringify({
      line_discount: String(body.line_discount).trim(),
      percentage: body.percentage,
      description: body.description ?? null,
      // status is not used in UI; let Directus defaults apply
    }),
  });

  if (!upstream.ok) {
    const err = normalizeError(upstream.data, upstream.rawText || "Failed to create line discount.");
    return json({ error: err }, upstream.status);
  }

  return json(upstream.data, 201);
}

/**
 * PATCH /api/fm/line-discount?id=123
 * body: { line_discount, percentage, description }
 */
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return json({ error: "Missing id." }, 400);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Missing body." }, 400);

  const upstream = await directus<unknown>(`/items/${COLLECTION}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(body.line_discount !== undefined ? { line_discount: String(body.line_discount).trim() } : {}),
      ...(body.percentage !== undefined ? { percentage: body.percentage } : {}),
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
    }),
  });

  if (!upstream.ok) {
    const err = normalizeError(upstream.data, upstream.rawText || "Failed to update line discount.");
    return json({ error: err }, upstream.status);
  }

  return json(upstream.data, 200);
}

/**
 * DELETE /api/fm/line-discount?id=123
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return json({ error: "Missing id." }, 400);

  const upstream = await directus<unknown>(`/items/${COLLECTION}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!upstream.ok) {
    const err = normalizeError(upstream.data, upstream.rawText || "Failed to delete line discount.");
    return json({ error: err }, upstream.status);
  }

  // Directus delete returns 204 or json depending config; normalize
  return json({ ok: true }, 200);
}
