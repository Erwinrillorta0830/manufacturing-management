// src/app/api/fm/chart-of-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DIRECTUS_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "";

const STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

/**
 * This single route supports multiple Directus resources via ?resource=
 * - chart_of_accounts (default)
 * - account_types
 * - balance_type
 * - bsis_types
 */
function getResource(req: NextRequest) {
  const r = req.nextUrl.searchParams.get("resource")?.trim();
  if (!r) return "chart_of_accounts";
  return r;
}

function json(resBody: unknown, init?: ResponseInit) {
  return NextResponse.json(resBody, init);
}

function authHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  // Static token (service token)
  if (STATIC_TOKEN) headers.Authorization = `Bearer ${STATIC_TOKEN}`;

  return headers;
}

async function directusFetch(path: string, init?: RequestInit) {
  if (!DIRECTUS_BASE) {
    return {
      ok: false,
      status: 500,
      json: { error: "NEXT_PUBLIC_API_BASE_URL is not set" },
    };
  }

  const url = `${DIRECTUS_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });

  let data: unknown = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json();
  else data = await res.text();

  return { ok: res.ok, status: res.status, json: data };
}

/**
 * Build Directus query for Chart of Accounts list:
 * - search by account_title or gl_code
 * - pagination by page/pageSize
 * - meta for total count
 */
function buildCOAListQuery(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const glCode = (sp.get("glCode") || "").trim();
  const accountTitle = (sp.get("accountTitle") || "").trim();
  const accountType = (sp.get("accountType") || "").trim();
  const balanceType = (sp.get("balanceType") || "").trim();

  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") || "20") || 20));

  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams();
  params.set("limit", String(pageSize));
  params.set("offset", String(offset));
  params.set("sort", "coa_id"); // stable
  params.set("meta", "filter_count,total_count");

  // fields: keep simple (IDs), UI maps IDs via lookups
  params.set(
    "fields",
    [
      "coa_id",
      "account_title",
      "gl_code",
      "account_type",
      "balance_type",
      "bsis_code",
      "memo_type",
      "description",
      "added_by.*",
      "date_added",
      "is_payment",
      "isPayment",
    ].join(",")
  );

  if (glCode) {
    params.set("filter[gl_code][_icontains]", glCode);
  }
  if (accountTitle) {
    params.set("filter[account_title][_eq]", accountTitle);
  }
  if (accountType) {
    params.set("filter[account_type][_eq]", accountType);
  }
  if (balanceType) {
    params.set("filter[balance_type][_eq]", balanceType);
  }

  return { page, pageSize, offset, params };
}

export async function GET(req: NextRequest) {
  try {
    const resource = getResource(req);

    // Lookups: return whole list
    if (resource !== "chart_of_accounts") {
      if (resource === "account_titles") {
        const res = await directusFetch(`/items/chart_of_accounts?limit=-1&fields=account_title`);
        if (!res.ok) return json(res.json, { status: res.status });
        const rows = (res.json as Record<string, unknown>)?.data as Array<{ account_title?: string }> || [];
        const unique = Array.from(new Set(rows.map((r) => r.account_title).filter(Boolean)));
        return json({ data: unique.map((title) => ({ account_title: title })) });
      }

      const res = await directusFetch(`/items/${resource}?limit=-1`);
      if (!res.ok) return json(res.json, { status: res.status });
      return json(res.json);
    }

    // COA list with pagination + search
    const { params, page, pageSize } = buildCOAListQuery(req);
    const res = await directusFetch(`/items/chart_of_accounts?${params.toString()}`);
    if (!res.ok) return json(res.json, { status: res.status });

    // add paging echo for convenience
    const payload = (res.json as Record<string, unknown>) || {};
    return json({
      ...payload,
      paging: { page, pageSize },
    });
  } catch (e: unknown) {
    return json(
      { error: "Server error", message: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const resource = getResource(req);
    const body = (await req.json()) as Record<string, unknown>;

    // Create COA item
    if (resource === "chart_of_accounts") {
      const res = await directusFetch(`/items/chart_of_accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return json(res.json, { status: res.status });
      return json(res.json);
    }

    // Create lookup item (optional)
    const res = await directusFetch(`/items/${resource}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return json(res.json, { status: res.status });
    return json(res.json);
  } catch (e: unknown) {
    return json(
      { error: "Server error", message: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const resource = getResource(req);
    const body = (await req.json()) as Record<string, unknown>;

    const id = String((body as Record<string, unknown>)?.id ?? "").trim();
    const payload = body?.payload ?? null;

    if (!id || !payload) {
      return json(
        { error: "Bad request", message: "Missing id or payload" },
        { status: 400 }
      );
    }

    const res = await directusFetch(`/items/${resource}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return json(res.json, { status: res.status });
    return json(res.json);
  } catch (e: unknown) {
    return json(
      { error: "Server error", message: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const resource = getResource(req);

    const sp = req.nextUrl.searchParams;
    const id = (sp.get("id") || "").trim();

    if (!id) {
      return json({ error: "Bad request", message: "Missing id" }, { status: 400 });
    }

    const res = await directusFetch(`/items/${resource}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    // Directus often returns 204 No Content
    if (!res.ok && res.status !== 204) return json(res.json, { status: res.status });

    return json({ ok: true });
  } catch (e: unknown) {
    return json(
      { error: "Server error", message: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
