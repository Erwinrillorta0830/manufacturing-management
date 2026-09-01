//src/modules/financial-management/chart-of-accounts/providers/fetchProvider.ts
import type {
  AccountTypeRow,
  BalanceTypeRow,
  BSISTypeRow,
  COACreatePayload,
  COAListParams,
  COARow,
  COAUpdatePayload,
  DirectusListResponse,
  DirectusSingleResponse,
  FindingRow,
  PaymentMethodRow,
  UserRow,
} from "../types";

const API = "/api/manufacturing/financial-management/chart-of-accounts";

async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function errMsg(data: unknown): string {
  if (!data) return "Request failed";
  if (typeof data === "string") return data;
  const d = data as Record<string, unknown>;
  const errors = d?.errors as Array<Record<string, unknown>> | undefined;
  const msg = errors?.[0]?.message || d?.message || d?.error || "Request failed";
  return String(msg);
}

export async function listCOA(params: COAListParams): Promise<DirectusListResponse<COARow>> {
  const sp = new URLSearchParams();
  sp.set("resource", "chart_of_accounts");
  if (params.glCode) sp.set("glCode", params.glCode);
  if (params.accountTitle) sp.set("accountTitle", params.accountTitle);
  if (params.accountType) sp.set("accountType", params.accountType);
  if (params.balanceType) sp.set("balanceType", params.balanceType);
  sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize));

  const res = await fetch(`${API}?${sp.toString()}`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as DirectusListResponse<COARow>;
}

export async function listAccountTitles(): Promise<string[]> {
  const res = await fetch(`${API}?resource=account_titles`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data?.data ?? []).map((x: any) => x.account_title).filter(Boolean);
}

export async function createCOA(payload: COACreatePayload): Promise<DirectusSingleResponse<COARow>> {
  const sp = new URLSearchParams();
  sp.set("resource", "chart_of_accounts");

  const res = await fetch(`${API}?${sp.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as DirectusSingleResponse<COARow>;
}

export async function updateCOA(
  id: number,
  payload: COAUpdatePayload,
): Promise<DirectusSingleResponse<COARow>> {
  const res = await fetch(`${API}?resource=chart_of_accounts`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, payload }),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as DirectusSingleResponse<COARow>;
}

export async function deleteCOA(id: number): Promise<void> {
  const sp = new URLSearchParams();
  sp.set("resource", "chart_of_accounts");
  sp.set("id", String(id));

  const res = await fetch(`${API}?${sp.toString()}`, { method: "DELETE" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
}

/** Lookups */
export async function listAccountTypes(): Promise<AccountTypeRow[]> {
  const res = await fetch(`${API}?resource=account_types`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data?.data ?? []) as AccountTypeRow[];
}

export async function listBalanceTypes(): Promise<BalanceTypeRow[]> {
  const res = await fetch(`${API}?resource=balance_type`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data?.data ?? []) as BalanceTypeRow[];
}

export async function listBSISTypes(): Promise<BSISTypeRow[]> {
  const res = await fetch(`${API}?resource=bsis_types`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data?.data ?? []) as BSISTypeRow[];
}

// ─────────────────────────────────────────────
// ✅ NEW: Findings (general_findings) - CRUD helpers
// ─────────────────────────────────────────────
export async function listGeneralFindings(): Promise<FindingRow[]> {
  const res = await fetch(`${API}?resource=general_findings`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data?.data ?? []) as FindingRow[];
}

export async function createFinding(payload: {
  finding_name: string;
  coa_id: number;
}): Promise<DirectusSingleResponse<FindingRow>> {
  const res = await fetch(`${API}?resource=general_findings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as DirectusSingleResponse<FindingRow>;
}

// Optional: if you later want real delete instead of UI-only remove
export async function deleteFinding(id: number): Promise<void> {
  const sp = new URLSearchParams();
  sp.set("resource", "general_findings");
  sp.set("id", String(id));

  const res = await fetch(`${API}?${sp.toString()}`, { method: "DELETE" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
}

// ─────────────────────────────────────────────
// ✅ NEW: Payment Methods (payment_methods) - CRUD helpers
// ─────────────────────────────────────────────
export async function listPaymentMethods(): Promise<PaymentMethodRow[]> {
  const res = await fetch(`${API}?resource=payment_methods`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data?.data ?? []) as PaymentMethodRow[];
}

export async function createPaymentMethod(payload: {
  method_name: string;
  description: string | null;
  isActive: number;
  coa_id: number;
}): Promise<DirectusSingleResponse<PaymentMethodRow>> {
  const res = await fetch(`${API}?resource=payment_methods`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as DirectusSingleResponse<PaymentMethodRow>;
}

// Optional: if you later want real delete instead of UI-only remove
export async function deletePaymentMethod(method_id: number): Promise<void> {
  const sp = new URLSearchParams();
  sp.set("resource", "payment_methods");
  sp.set("id", String(method_id));

  const res = await fetch(`${API}?${sp.toString()}`, { method: "DELETE" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
}

export async function listUsers(): Promise<UserRow[]> {
  const res = await fetch(`${API}?resource=user&limit=-1`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data?.data ?? []) as UserRow[];
}
