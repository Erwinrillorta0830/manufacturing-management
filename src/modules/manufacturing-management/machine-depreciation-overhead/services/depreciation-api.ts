import type {
  MachineDepreciationFilters,
  OverviewData,
  MachineRow,
  JobOrderAllocationData,
  DetailRow,
  FilterOptions,
} from "../types";

const BASE = "/api/manufacturing/reports/machine-depreciation-overhead";

async function readData<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error || `Request failed (HTTP ${res.status})`);
  if (!payload?.data) throw new Error("Invalid response from server");
  return payload.data as T;
}

function buildParams(filters: MachineDepreciationFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  if (filters.assetId) params.set("assetId", filters.assetId);
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v);
  }
  return params.toString();
}

export async function fetchDepreciationOverview(
  filters: MachineDepreciationFilters,
  signal?: AbortSignal
): Promise<OverviewData> {
  const qs = buildParams(filters, { type: "overview" });
  const res = await fetch(`${BASE}?${qs}`, { signal });
  return readData<OverviewData>(res);
}

export async function fetchDepreciationMachines(
  filters: MachineDepreciationFilters,
  signal?: AbortSignal
): Promise<{ rows: MachineRow[] }> {
  const qs = buildParams(filters, { type: "machines" });
  const res = await fetch(`${BASE}?${qs}`, { signal });
  return readData<{ rows: MachineRow[] }>(res);
}

export async function fetchDepreciationJobOrders(
  filters: MachineDepreciationFilters,
  signal?: AbortSignal
): Promise<JobOrderAllocationData> {
  const qs = buildParams(filters, { type: "job-orders" });
  const res = await fetch(`${BASE}?${qs}`, { signal });
  return readData<JobOrderAllocationData>(res);
}

export async function fetchDepreciationDetails(
  filters: MachineDepreciationFilters,
  page: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<{ rows: DetailRow[]; total: number }> {
  const qs = buildParams(filters, {
    type: "details",
    page: String(page),
    pageSize: String(pageSize),
  });
  const res = await fetch(`${BASE}?${qs}`, { signal });
  return readData<{ rows: DetailRow[]; total: number }>(res);
}

export async function fetchDepreciationFilters(signal?: AbortSignal): Promise<FilterOptions> {
  const res = await fetch(`${BASE}?type=filters`, { signal });
  return readData<FilterOptions>(res);
}
