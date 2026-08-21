// src/modules/financial-management/line-discount/providers/fetchProvider.ts
import type { LineDiscountRow, LineDiscountUpsert } from "../type";

type ListResponse<T> = { data: T[] };

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { error: text || "Invalid response." };
  }
}

function errMsg(payload: unknown, fallback: string) {
  const p = payload as Record<string, unknown>;
  return (typeof p?.error === "string" ? p.error : null)
    || (typeof p?.message === "string" ? p.message : null)
    || fallback;
}

export async function listLineDiscounts(): Promise<LineDiscountRow[]> {
  const res = await fetch("/api/manufacturing/financial-management/discount-management/discount/line-discount?limit=-1", { cache: "no-store" });
  const payload = await safeJson(res);

  if (!res.ok) throw new Error(errMsg(payload, "Failed to load line discounts."));
  return (payload as ListResponse<LineDiscountRow>)?.data ?? [];
}

export async function createLineDiscount(input: LineDiscountUpsert): Promise<LineDiscountRow> {
  const res = await fetch("/api/manufacturing/financial-management/discount-management/discount/line-discount", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(payload, "Failed to create line discount."));

  // Directus returns { data: {...} }
  return payload?.data as LineDiscountRow;
}

export async function updateLineDiscount(
  id: number,
  input: LineDiscountUpsert,
): Promise<LineDiscountRow> {
  const res = await fetch(`/api/manufacturing/financial-management/discount-management/discount/line-discount?id=${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(payload, "Failed to update line discount."));
  return payload?.data as LineDiscountRow;
}

export async function deleteLineDiscount(id: number): Promise<void> {
  const res = await fetch(`/api/manufacturing/financial-management/discount-management/discount/line-discount?id=${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });

  const payload = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(payload, "Failed to delete line discount."));
}
