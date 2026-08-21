"use client";

import type { DiscountTypeRow, LineDiscountRow, DiscountTypeUpsert } from "../type";

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok || (data && data.success === false)) {
    const msg = String(data?.message || `Request failed (${res.status})`);
    throw new Error(msg);
  }

  return data as T;
}

export async function listDiscountTypes(): Promise<DiscountTypeRow[]> {
  const res = await http<{ success: boolean; data: DiscountTypeRow[] }>("/api/manufacturing/financial-management/discount-management/discount/discount-type");
  return res.data ?? [];
}

export async function listLineDiscounts(): Promise<LineDiscountRow[]> {
  const res = await http<{ success: boolean; data: LineDiscountRow[] }>(
    "/api/manufacturing/financial-management/discount-management/discount/discount-type?resource=line-discounts",
  );
  return res.data ?? [];
}

export async function createDiscountType(payload: DiscountTypeUpsert): Promise<void> {
  // ✅ MUST include line_ids so API can write line_per_discount_type rows
  await http("/api/manufacturing/financial-management/discount-management/discount/discount-type", {
    method: "POST",
    body: JSON.stringify({
      discount_type: payload.discount_type,
      line_ids: payload.line_ids ?? [],
    }),
  });
}

export async function updateDiscountType(payload: DiscountTypeUpsert): Promise<void> {
  await http("/api/manufacturing/financial-management/discount-management/discount/discount-type", {
    method: "PUT",
    body: JSON.stringify({
      id: payload.id,
      discount_type: payload.discount_type,
      line_ids: payload.line_ids ?? [],
    }),
  });
}

export async function deleteDiscountType(id: number): Promise<void> {
  await http(`/api/manufacturing/financial-management/discount-management/discount/discount-type?id=${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}
