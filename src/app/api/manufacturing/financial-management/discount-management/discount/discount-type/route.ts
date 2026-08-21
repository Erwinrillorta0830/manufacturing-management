import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DIRECTUS_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

/* ============================================================
   Types
   ============================================================ */
type DirectusList<T> = { data: T[] };

type DiscountTypeItem = {
  id: number;
  discount_type: string;
  total_percent: string | null;
};

type LinePerDiscountTypeItem = {
  id: number;
  line_id: number;
  type_id: number;
};

type LineDiscountItem = {
  id: number;
  line_discount: string;
  description: string | null;
  percentage: string | number;
};

/* ============================================================
   High precision totals (PHP port using BigInt fixed-point)
   - multiplier: 20 decimals
   - percent:    16 decimals
   ============================================================ */
const SCALE = 40n;
const SCALE_FACTOR = 10n ** SCALE;

function clampBigInt(x: bigint, lo: bigint, hi: bigint) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function parseDecimalToBigInt(value: string, scale: bigint): bigint {
  const s = String(value ?? "").trim();
  if (!s) return 0n;

  const neg = s.startsWith("-");
  const raw = neg ? s.slice(1) : s;

  const [intPartRaw, fracRaw = ""] = raw.split(".");
  const intPart = intPartRaw.replace(/[^\d]/g, "") || "0";
  const frac = fracRaw.replace(/[^\d]/g, "");

  const wanted = Number(scale);
  const fracPadded = (frac + "0".repeat(wanted)).slice(0, wanted);

  const bi = BigInt(intPart) * (10n ** scale) + BigInt(fracPadded || "0");
  return neg ? -bi : bi;
}

function formatFixed(x: bigint, inScale: bigint, decimals: number): string {
  const neg = x < 0n;
  const abs = neg ? -x : x;

  const outScale = BigInt(decimals);

  if (inScale > outScale) {
    const diff = inScale - outScale;
    const div = 10n ** diff;

    const q = abs / div;
    const r = abs % div;
    const half = div / 2n;
    const rounded = r >= half ? q + 1n : q;

    const s = rounded.toString();
    const intLen = s.length - decimals;
    const intPart = intLen > 0 ? s.slice(0, intLen) : "0";
    const fracPart = intLen > 0 ? s.slice(intLen) : s.padStart(decimals, "0");
    return `${neg ? "-" : ""}${intPart}.${fracPart.padStart(decimals, "0")}`;
  }

  if (inScale < outScale) {
    const diff = outScale - inScale;
    const mul = 10n ** diff;
    const up = abs * mul;

    const s = up.toString();
    const intLen = s.length - decimals;
    const intPart = intLen > 0 ? s.slice(0, intLen) : "0";
    const fracPart = intLen > 0 ? s.slice(intLen) : s.padStart(decimals, "0");
    return `${neg ? "-" : ""}${intPart}.${fracPart.padStart(decimals, "0")}`;
  }

  const s = abs.toString();
  const intLen = s.length - decimals;
  const intPart = intLen > 0 ? s.slice(0, intLen) : "0";
  const fracPart = intLen > 0 ? s.slice(intLen) : s.padStart(decimals, "0");
  return `${neg ? "-" : ""}${intPart}.${fracPart.padStart(decimals, "0")}`;
}

function computeTotalsFromPercentages(percentages: Array<string | number>) {
  let mult = SCALE_FACTOR;

  for (const pRaw of percentages) {
    let pStr = String(pRaw ?? "0").trim();
    if (!pStr || !/^-?\d+(\.\d+)?$/.test(pStr)) pStr = "0";

    const pScaled = parseDecimalToBigInt(pStr, SCALE);
    const ratioScaled = pScaled / 100n;
    const oneMinusScaled = SCALE_FACTOR - ratioScaled;

    mult = (mult * oneMinusScaled) / SCALE_FACTOR;
  }

  mult = clampBigInt(mult, 0n, SCALE_FACTOR);

  const eff = SCALE_FACTOR - mult;
  const percentScaled = eff * 100n;

  return {
    multiplier: formatFixed(mult, SCALE, 20),
    percent: formatFixed(percentScaled, SCALE, 16),
  };
}

/* ============================================================
   Directus fetch
   ============================================================ */
function requireEnv() {
  if (!DIRECTUS_BASE) return "NEXT_PUBLIC_API_BASE_URL is not set";
  return null;
}

async function directusFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${DIRECTUS_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (DIRECTUS_TOKEN) headers.set("Authorization", `Bearer ${DIRECTUS_TOKEN}`);

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Directus error (${res.status})`);
  }
  return (await res.json()) as T;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

/* ============================================================
   Queries (use your exact endpoints)
   ============================================================ */
async function listLineDiscounts() {
  const res = await directusFetch<DirectusList<LineDiscountItem>>(
    `/items/line_discount?limit=-1`,
  );
  const rows = (res.data ?? []).slice();
  rows.sort((a, b) => Number(a.id) - Number(b.id));
  return rows;
}

async function listDiscountTypesJoined() {
  const [typesRes, linksRes, lines] = await Promise.all([
    directusFetch<DirectusList<DiscountTypeItem>>(`/items/discount_type?limit=-1`),
    directusFetch<DirectusList<LinePerDiscountTypeItem>>(`/items/line_per_discount_type?limit=-1`),
    listLineDiscounts(),
  ]);

  const lineMap = new Map<number, LineDiscountItem>();
  for (const l of lines) lineMap.set(Number(l.id), l);

  const linksByType = new Map<number, LinePerDiscountTypeItem[]>();
  for (const lk of linksRes.data ?? []) {
    const typeId = Number(lk.type_id);
    const arr = linksByType.get(typeId) ?? [];
    arr.push(lk);
    linksByType.set(typeId, arr);
  }

  const types = (typesRes.data ?? []).slice().sort((a, b) => Number(a.id) - Number(b.id));

  return types.map((t) => {
    const typeId = Number(t.id);
    const links = (linksByType.get(typeId) ?? []).slice().sort((a, b) => Number(a.id) - Number(b.id));

    const applied_lines = links.map((lk) => {
      const line = lineMap.get(Number(lk.line_id));
      return {
        link_id: Number(lk.id),
        line_id: Number(lk.line_id),
        code: line?.line_discount ?? `L${lk.line_id}`,
        percentage: String(line?.percentage ?? "0"),
      };
    });

    return {
      id: typeId,
      discount_type: t.discount_type,
      total_percent: t.total_percent ?? "0",
      applied_lines,
    };
  });
}

/* ============================================================
   ✅ The FIX: ensure we create rows in line_per_discount_type
   - id is AUTO-INCREMENT (do not send it)
   - type_id = discount_type.id
   - line_id = each selected line_discount.id
   ============================================================ */
async function deleteLinksForType(typeId: number) {
  // fetch only links for this type
  const res = await directusFetch<DirectusList<Pick<LinePerDiscountTypeItem, "id">>>(
    `/items/line_per_discount_type?limit=-1&fields=id&filter[type_id][_eq]=${encodeURIComponent(
      String(typeId),
    )}`,
  );

  const ids = (res.data ?? []).map((x) => Number(x.id)).filter((n) => Number.isFinite(n));
  for (const id of ids) {
    await directusFetch(`/items/line_per_discount_type/${id}`, { method: "DELETE" });
  }
}

async function createLinks(typeId: number, lineIds: number[]) {
  if (!lineIds.length) return;

  // Directus supports create-many by sending an array
  const payload = lineIds.map((lineId) => ({
    type_id: Number(typeId),
    line_id: Number(lineId),
    // ✅ do NOT include "id" -> auto increment
  }));

  await directusFetch(`/items/line_per_discount_type`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ============================================================
   Handlers
   ============================================================ */
export async function GET(req: NextRequest) {
  try {
    const envErr = requireEnv();
    if (envErr) return json({ success: false, message: envErr, data: null }, 500);

    const { searchParams } = new URL(req.url);
    const resource = (searchParams.get("resource") ?? "").trim();

    if (resource === "line-discounts") {
      const lines = await listLineDiscounts();
      return json({ success: true, message: "OK", data: lines });
    }

    const rows = await listDiscountTypesJoined();
    return json({ success: true, message: "OK", data: rows });
  } catch (e: unknown) {
    return json(
      {
        success: false,
        message: e instanceof Error ? e.message : "Server error",
        data: null,
      },
      500,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const envErr = requireEnv();
    if (envErr) return json({ success: false, message: envErr, data: null }, 500);

    const body = await req.json().catch(() => ({}));
    const discount_type = String(body?.discount_type ?? "").trim();
    const line_ids = Array.isArray(body?.line_ids) ? body.line_ids.map((x: unknown) => Number(x)) : [];

    if (!discount_type) {
      return json({ success: false, message: "Discount type is required.", data: null }, 400);
    }

    const lines = await listLineDiscounts();
    const lineMap = new Map<number, LineDiscountItem>();
    for (const l of lines) lineMap.set(Number(l.id), l);

    const percentages = line_ids.map((id: number) => String(lineMap.get(Number(id))?.percentage ?? "0"));
    const totals = computeTotalsFromPercentages(percentages);

    // Create discount_type first
    const created = await directusFetch<{ data: DiscountTypeItem }>(`/items/discount_type`, {
      method: "POST",
      body: JSON.stringify({
        discount_type,
        total_percent: totals.percent,
      }),
    });

    const typeId = Number(created?.data?.id);
    if (!typeId) throw new Error("Failed to create discount type.");

    // ✅ FIX: insert into line_per_discount_type
    await createLinks(typeId, line_ids);

    return json({ success: true, message: "Created.", data: { id: typeId } }, 201);
  } catch (e: unknown) {
    return json(
      {
        success: false,
        message: e instanceof Error ? e.message : "Server error",
        data: null,
      },
      500,
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const envErr = requireEnv();
    if (envErr) return json({ success: false, message: envErr, data: null }, 500);

    const body = await req.json().catch(() => ({}));
    const id = Number((body as Record<string, unknown>)?.id);
    const discount_type = String(body?.discount_type ?? "").trim();
    const line_ids = Array.isArray(body?.line_ids) ? body.line_ids.map((x: unknown) => Number(x)) : [];

    if (!id || Number.isNaN(id)) {
      return json({ success: false, message: "Invalid id.", data: null }, 400);
    }
    if (!discount_type) {
      return json({ success: false, message: "Discount type is required.", data: null }, 400);
    }

    const lines = await listLineDiscounts();
    const lineMap = new Map<number, LineDiscountItem>();
    for (const l of lines) lineMap.set(Number(l.id), l);

    const percentages = line_ids.map((x: number) => String(lineMap.get(Number(x))?.percentage ?? "0"));
    const totals = computeTotalsFromPercentages(percentages);

    // Update discount_type
    await directusFetch(`/items/discount_type/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        discount_type,
        total_percent: totals.percent,
      }),
    });

    // ✅ FIX: rewrite links in line_per_discount_type
    await deleteLinksForType(id);
    await createLinks(id, line_ids);

    return json({ success: true, message: "Updated.", data: { id } });
  } catch (e: unknown) {
    return json(
      {
        success: false,
        message: e instanceof Error ? e.message : "Server error",
        data: null,
      },
      500,
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const envErr = requireEnv();
    if (envErr) return json({ success: false, message: envErr, data: null }, 500);

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!id || Number.isNaN(id)) {
      return json({ success: false, message: "Invalid id.", data: null }, 400);
    }

    // delete links first
    await deleteLinksForType(id);
    await directusFetch(`/items/discount_type/${id}`, { method: "DELETE" });

    return json({ success: true, message: "Deleted.", data: { id } });
  } catch (e: unknown) {
    return json(
      {
        success: false,
        message: e instanceof Error ? e.message : "Server error",
        data: null,
      },
      500,
    );
  }
}
