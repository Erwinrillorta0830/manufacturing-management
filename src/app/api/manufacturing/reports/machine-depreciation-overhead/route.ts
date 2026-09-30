import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE_URL = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "") || "";

// ─── types ──────────────────────────────────────────────────────────────────

interface SpringBootAssetDepreciation {
  assetId?: number;
  asset_id?: number;
  itemId?: number;
  item_id?: number;
  itemName?: string;
  item_name?: string;
  assetType?: string;
  asset_type?: string;
  depreciationMethod?: string;
  depreciation_method?: string;
  serial?: string | null;
  barcode?: string | null;
  department?: number | { department_id?: number; department_name?: string } | null;
  employee?: number | null;
  dateAcquired?: string;
  date_acquired?: string;
  depreciationStartDate?: string;
  depreciation_start_date?: string;
  acquisitionCost?: number;
  acquisition_cost?: number;
  residualValue?: number;
  residual_value?: number;
  depreciableAmount?: number;
  depreciable_amount?: number;
  maximumUnitProducedCapacity?: number;
  maximum_unit_produced_capacity?: number;
  productionUnitId?: number;
  production_unit_id?: number;
  productionUnit?: string;
  production_unit?: string;
  productionUnitShortcut?: string;
  production_unit_shortcut?: string;
  jobOrderId?: number;
  job_order_id?: number;
  jobOrderNo?: string;
  job_order_no?: string;
  productId?: number;
  product_id?: number;
  productName?: string;
  product_name?: string;
  productionUnits?: number;
  production_units?: number;
  remainingProductionCapacity?: number;
  remaining_production_capacity?: number;
  depreciationPerUnit?: number;
  depreciation_per_unit?: number;
  productionDepreciation?: number;
  production_depreciation?: number;
  productionCapacityUsedPercent?: number;
  production_capacity_used_percent?: number;
  firstProductionDate?: string;
  first_production_date?: string;
  lastProductionDate?: string;
  last_production_date?: string;
}

interface CanonicalAsset {
  id: number;
  department: number | null;
  asset_type: string | null;
}

interface CanonicalJobOrder {
  job_order_id: number;
  job_order_no: string;
  branch_id: number | null;
  product_id: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface CanonicalWorkCenter {
  work_center_id: number;
  work_center_name: string | null;
  asset_id: number | null;
  department_id: number | null;
}

// ─── normalized UOP record ──────────────────────────────────────────────────

interface UopRecord {
  assetId: number;
  machineName: string;
  serial: string | null;
  acquisitionCost: number;
  residualValue: number;
  depreciableAmount: number;
  productionUnits: number;
  uom: string;
  depreciationPerUnit: number;
  productionDepreciation: number;
  maximumUnitProducedCapacity: number;
  remainingProductionCapacity: number;
  productionCapacityUsedPercent: number;
  jobOrderId: number | null;
  jobOrderNo: string | null;
  productName: string | null;
  departmentId: number | null;
  productionDate: string | null;
}

// ─── accessor helpers ────────────────────────────────────────────────────────

function isUopRecord(item: SpringBootAssetDepreciation): boolean {
  const method = String(item.depreciationMethod ?? item.depreciation_method ?? "").toLowerCase();
  return method.includes("unit");
}

function normalizeUopRecord(item: SpringBootAssetDepreciation): UopRecord {
  const assetId = Number(item.assetId ?? item.asset_id ?? 0);
  const machineName = String(item.itemName ?? item.item_name ?? "UOP Machine");
  const serial = item.serial ?? null;
  const acq = Number(item.acquisitionCost ?? item.acquisition_cost ?? 0);
  const res = Number(item.residualValue ?? item.residual_value ?? 0);
  const depBase = Number(item.depreciableAmount ?? item.depreciable_amount) || Math.max(0, acq - res);
  const units = Number(item.productionUnits ?? item.production_units ?? 0);
  const uom = String(
    item.productionUnitShortcut ??
    item.production_unit_shortcut ??
    item.productionUnit ??
    item.production_unit ??
    "units"
  );
  const rate = Number(item.depreciationPerUnit ?? item.depreciation_per_unit ?? 0);
  const dep = Number(item.productionDepreciation ?? item.production_depreciation ?? 0);
  const maxCap = Number(item.maximumUnitProducedCapacity ?? item.maximum_unit_produced_capacity ?? 0);
  const remCap = Number(item.remainingProductionCapacity ?? item.remaining_production_capacity ?? Math.max(0, maxCap - units));
  const usedPct =
    Number(item.productionCapacityUsedPercent ?? item.production_capacity_used_percent) ||
    (maxCap > 0 ? (units / maxCap) * 100 : 0);

  const rawJoId = Number(item.jobOrderId ?? item.job_order_id);
  const jobOrderId = !isNaN(rawJoId) && rawJoId > 0 ? rawJoId : null;
  const jobOrderNo = item.jobOrderNo ?? item.job_order_no ?? null;
  const productName = item.productName ?? item.product_name ?? null;

  let departmentId: number | null = null;
  if (typeof item.department === "object" && item.department !== null) {
    departmentId = Number(item.department.department_id) || null;
  } else if (typeof item.department === "number") {
    departmentId = item.department;
  }

  const productionDate =
    item.lastProductionDate ??
    item.last_production_date ??
    item.firstProductionDate ??
    item.first_production_date ??
    item.depreciationStartDate ??
    item.depreciation_start_date ??
    null;

  return {
    assetId,
    machineName,
    serial,
    acquisitionCost: acq,
    residualValue: res,
    depreciableAmount: depBase,
    productionUnits: units,
    uom,
    depreciationPerUnit: rate,
    productionDepreciation: dep,
    maximumUnitProducedCapacity: maxCap,
    remainingProductionCapacity: remCap,
    productionCapacityUsedPercent: usedPct,
    jobOrderId,
    jobOrderNo,
    productName,
    departmentId,
    productionDate,
  };
}

// ─── cross-UOM compatibility helper ──────────────────────────────────────────

interface UomEvaluation {
  isSingleUom: boolean;
  totalOutput: number | null;
  displayUom: string;
}

function evaluateUom(records: { productionUnits: number; uom: string }[]): UomEvaluation {
  const active = records.filter((r) => r.productionUnits > 0);
  const distinctUoms = Array.from(new Set(active.map((r) => r.uom.trim().toLowerCase())));

  if (distinctUoms.length === 1) {
    const singleUom = active[0]?.uom || "units";
    const sumOutput = active.reduce((s, r) => s + r.productionUnits, 0);
    return { isSingleUom: true, totalOutput: sumOutput, displayUom: singleUom };
  }
  if (distinctUoms.length > 1) {
    return { isSingleUom: false, totalOutput: null, displayUom: "Multiple UOMs" };
  }
  return { isSingleUom: true, totalOutput: 0, displayUom: "units" };
}

// ─── date helpers ────────────────────────────────────────────────────────────

function monthRange(from: string, to: string): string[] {
  const start = new Date(from + "-01");
  const end = new Date(to + "-01");
  const result: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    result.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`
    );
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

function isDateInRange(dateStr: string | null | undefined, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= from && d <= to;
}

// ─── Spring Boot view fetcher (Strict: no silent fallback) ────────────────────

async function fetchSpringBootUopRecords(
  searchParams?: URLSearchParams
): Promise<UopRecord[]> {
  if (!SPRING_API_BASE_URL) {
    throw new Error("Spring Boot API base URL is not configured (SPRING_API_BASE_URL).");
  }

  const cookieStore = await cookies();
  const springToken =
    cookieStore.get("springboot_token")?.value ||
    cookieStore.get("vos_access_token")?.value;

  const queryStr = searchParams && searchParams.toString() ? `?${searchParams.toString()}` : "";
  const res = await fetch(`${SPRING_API_BASE_URL}/api/asset-depreciation${queryStr}`, {
    headers: {
      ...(springToken ? { Authorization: `Bearer ${springToken}` } : {}),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch Spring Boot /api/asset-depreciation (HTTP ${res.status}): ${errText || res.statusText}`
    );
  }

  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    throw new Error("Spring Boot /api/asset-depreciation returned invalid or non-array data.");
  }

  // Strict UOP filtering at ingestion: exclude Straight-Line or non-UOP records
  const rawList = data as SpringBootAssetDepreciation[];
  return rawList.filter(isUopRecord).map(normalizeUopRecord);
}

// ─── Directus canonical table fetcher ─────────────────────────────────────────

async function fetchAll<T>(path: string): Promise<T[]> {
  const url = `${DIRECTUS_URL}${path}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Directus query failed: ${path} (HTTP ${res.status})`);
  const body = await res.json();
  return (body.data ?? []) as T[];
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "overview";
  const dateFrom = searchParams.get("dateFrom") ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const dateTo = searchParams.get("dateTo") ?? new Date().toISOString().slice(0, 10);
  const branchId = searchParams.get("branchId") ?? "";
  const departmentId = searchParams.get("departmentId") ?? "";
  const assetId = searchParams.get("assetId") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? "20"));

  try {
    if (type === "filters") {
      return NextResponse.json({ data: await handleFilters() });
    }
    if (type === "overview") {
      return NextResponse.json({
        data: await handleOverview(dateFrom, dateTo, branchId, departmentId, assetId),
      });
    }
    if (type === "machines") {
      return NextResponse.json({
        data: await handleMachines(dateFrom, dateTo, branchId, departmentId, assetId),
      });
    }
    if (type === "job-orders") {
      return NextResponse.json({
        data: await handleJobOrders(dateFrom, dateTo, branchId, departmentId, assetId),
      });
    }
    if (type === "details") {
      return NextResponse.json({
        data: await handleDetails(dateFrom, dateTo, branchId, departmentId, assetId, page, pageSize),
      });
    }
    return NextResponse.json({ error: "Unknown type requested" }, { status: 400 });
  } catch (err) {
    console.error("[Machine Depreciation Overhead - Spring Boot API Error]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load depreciation data from Spring Boot." },
      { status: 503 }
    );
  }
}

// ─── type=filters ────────────────────────────────────────────────────────────

async function handleFilters() {
  const [branches, departments, uopRecords] = await Promise.all([
    fetchAll<{ id: number; branch_name: string }>("/items/branches?limit=-1&fields=id,branch_name"),
    fetchAll<{ department_id: number; department_name: string }>("/items/department?limit=-1&fields=department_id,department_name"),
    fetchSpringBootUopRecords(),
  ]);

  const machineMap = new Map<number, string>();
  for (const r of uopRecords) {
    if (r.assetId > 0 && !machineMap.has(r.assetId)) {
      machineMap.set(r.assetId, r.machineName);
    }
  }

  return {
    branches: branches.map((b) => ({ id: b.id, name: b.branch_name })),
    departments: departments.map((d) => ({ id: d.department_id, name: d.department_name })),
    machines: Array.from(machineMap.entries()).map(([assetId, name]) => ({ assetId, name })),
  };
}

// ─── type=overview ───────────────────────────────────────────────────────────

async function handleOverview(
  dateFrom: string,
  dateTo: string,
  _branchId: string,
  departmentId: string,
  assetId: string
) {
  const months = monthRange(dateFrom.slice(0, 7), dateTo.slice(0, 7));

  // 1. Authoritative UOP Records strictly ingested from Spring Boot
  const [uopRecords, canonicalAssets] = await Promise.all([
    fetchSpringBootUopRecords(),
    fetchAll<CanonicalAsset>(
      "/items/assets_and_equipment?limit=-1&fields=id,department,asset_type"
    ),
  ]);

  const canonicalMap = new Map<number, CanonicalAsset>();
  for (const ca of canonicalAssets) {
    canonicalMap.set(ca.id, ca);
  }

  // Filter in scope (Production assets, department, assetId)
  const inScopeRecords = uopRecords.filter((r) => {
    const ca = canonicalMap.get(r.assetId);
    const aType = ca?.asset_type || "Production";
    if (aType.toLowerCase() !== "production") return false;

    if (assetId && r.assetId !== Number(assetId)) return false;

    if (departmentId) {
      const dept = r.departmentId ?? ca?.department;
      if (dept !== Number(departmentId)) return false;
    }

    return true;
  });

  // ── Double-Counting Prevention: Separate Asset Dataset vs Job Order Dataset ──

  // A. Asset-Level Dataset: Semantic aggregation per unique assetId
  interface AssetSummary {
    assetId: number;
    machineName: string;
    productionUnits: number;
    productionDepreciation: number;
    depreciationPerUnit: number;
    uom: string;
  }
  const assetMap = new Map<number, AssetSummary>();

  for (const r of inScopeRecords) {
    const existing = assetMap.get(r.assetId);
    if (existing) {
      existing.productionUnits += r.productionUnits;
      existing.productionDepreciation += r.productionDepreciation;
    } else {
      assetMap.set(r.assetId, {
        assetId: r.assetId,
        machineName: r.machineName,
        productionUnits: r.productionUnits,
        productionDepreciation: r.productionDepreciation,
        depreciationPerUnit: r.depreciationPerUnit,
        uom: r.uom,
      });
    }
  }
  const assetSummaries = Array.from(assetMap.values());

  // B. Job-Order-Level Dataset: Records specifically tied to job orders (jobOrderId > 0)
  const jobOrderRecords = inScopeRecords.filter((r) => r.jobOrderId !== null && r.jobOrderId > 0);

  // 1. UOP Machine Depreciation (Total depreciation generated by UOP equipment in scope)
  const uopMachineDepreciation = assetSummaries.reduce(
    (sum, a) => sum + a.productionDepreciation,
    0
  );

  // 2. Depreciation Attributed to Job Orders
  const attributedToJobs = jobOrderRecords.reduce(
    (sum, r) => sum + r.productionDepreciation,
    0
  );

  // 3. Attribution Difference (BI Reconciliation: UOP Machine Depr - Job Order Attributed)
  const attributionDifference = uopMachineDepreciation - attributedToJobs;

  // 4. UOP Production Output & UOM Safeguard (Overview-scoped)
  const uomEval = evaluateUom(assetSummaries.map((a) => ({ productionUnits: a.productionUnits, uom: a.uom })));
  const uopProductionOutput = uomEval.totalOutput;
  const outputUom = uomEval.displayUom;

  let avgUopDepreciationPerUnit: number | null = null;
  let rateUom = "Multiple UOMs";
  if (uomEval.isSingleUom && uopProductionOutput !== null && uopProductionOutput > 0) {
    avgUopDepreciationPerUnit = uopMachineDepreciation / uopProductionOutput;
    rateUom = `₱${avgUopDepreciationPerUnit.toFixed(2)} / ${outputUom}`;
  } else if (uomEval.isSingleUom && uopProductionOutput === 0) {
    rateUom = "—";
  }

  // 5. Machines with Production Output Count
  const machinesWithOutputCount = assetSummaries.filter((a) => a.productionUnits > 0).length;

  // 6. Monthly UOP Depreciation Trend (Actual historical values)
  const monthlyTrend = months.map((ym) => {
    const dep = inScopeRecords.reduce((sum, r) => {
      if (!r.productionDate || r.productionDate.slice(0, 7) === ym) {
        return sum + r.productionDepreciation / Math.max(1, months.length);
      }
      return sum;
    }, 0);
    return {
      month: new Date(ym + "-01").toLocaleString("en-US", { month: "short", year: "numeric" }),
      depreciation: dep,
    };
  });

  // 7. Depreciation by Machine (Asset-level aggregation)
  const byMachine = assetSummaries.map((a) => ({
    machineName: a.machineName,
    assetId: a.assetId,
    depreciation: a.productionDepreciation,
  }));

  // 8. Observational Relationship Chart: Output vs Depreciation per UOP machine (no forecast line)
  const uopOutputVsDepreciation = assetSummaries.map((a) => ({
    machineName: a.machineName,
    assetId: a.assetId,
    productionOutput: a.productionUnits,
    depreciation: a.productionDepreciation,
    uom: a.uom,
    ratePerUnit: a.depreciationPerUnit,
  }));

  return {
    kpis: {
      uopMachineDepreciation,
      uopProductionOutput,
      outputUom,
      avgUopDepreciationPerUnit,
      rateUom,
      attributedToJobs,
      attributionDifference,
      machinesWithOutputCount,
    },
    monthlyTrend,
    byMachine,
    uopOutputVsDepreciation,
  };
}

// ─── type=machines ───────────────────────────────────────────────────────────

async function handleMachines(
  _dateFrom: string,
  _dateTo: string,
  _branchId: string,
  departmentId: string,
  assetId: string
) {
  const [uopRecords, canonicalAssets, workCenters] = await Promise.all([
    fetchSpringBootUopRecords(),
    fetchAll<CanonicalAsset>(
      "/items/assets_and_equipment?limit=-1&fields=id,department,asset_type"
    ),
    fetchAll<CanonicalWorkCenter>(
      "/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name,asset_id,department_id"
    ),
  ]);

  const canonicalMap = new Map<number, CanonicalAsset>();
  for (const ca of canonicalAssets) {
    canonicalMap.set(ca.id, ca);
  }

  const wcByAsset = new Map<number, CanonicalWorkCenter>();
  for (const wc of workCenters) {
    if (wc.asset_id != null && !wcByAsset.has(wc.asset_id)) {
      wcByAsset.set(wc.asset_id, wc);
    }
  }

  // Asset-level Semantic Aggregations:
  // productionUnits: SUM
  // productionDepreciation: SUM
  // maximumUnitProducedCapacity: MAX authoritative
  // remainingProductionCapacity: MIN/authoritative
  // productionCapacityUsedPercent: Latest/authoritative
  // depreciationPerUnit: authoritative
  interface MachineAgg {
    assetId: number;
    machineName: string;
    serial: string | null;
    depreciableBase: number;
    lifetimeCapacity: number;
    productionOutput: number;
    uom: string;
    ratePerUnit: number;
    periodDepreciation: number;
    capacityUsedPercent: number;
    workCenterName: string | null;
  }
  const aggMap = new Map<number, MachineAgg>();

  for (const r of uopRecords) {
    const ca = canonicalMap.get(r.assetId);
    const aType = ca?.asset_type || "Production";
    if (aType.toLowerCase() !== "production") continue;

    if (assetId && r.assetId !== Number(assetId)) continue;
    if (departmentId) {
      const dept = r.departmentId ?? ca?.department;
      if (dept !== Number(departmentId)) continue;
    }

    const wc = wcByAsset.get(r.assetId);
    const existing = aggMap.get(r.assetId);

    if (existing) {
      existing.productionOutput += r.productionUnits;
      existing.periodDepreciation += r.productionDepreciation;
      existing.lifetimeCapacity = Math.max(existing.lifetimeCapacity, r.maximumUnitProducedCapacity);
      existing.capacityUsedPercent = Math.max(existing.capacityUsedPercent, r.productionCapacityUsedPercent);
    } else {
      aggMap.set(r.assetId, {
        assetId: r.assetId,
        machineName: r.machineName,
        serial: r.serial,
        depreciableBase: r.depreciableAmount,
        lifetimeCapacity: r.maximumUnitProducedCapacity,
        productionOutput: r.productionUnits,
        uom: r.uom,
        ratePerUnit: r.depreciationPerUnit,
        periodDepreciation: r.productionDepreciation,
        capacityUsedPercent: r.productionCapacityUsedPercent,
        workCenterName: wc?.work_center_name ?? null,
      });
    }
  }

  const rows = Array.from(aggMap.values());
  return { rows };
}

// ─── type=job-orders ─────────────────────────────────────────────────────────

async function handleJobOrders(
  dateFrom: string,
  dateTo: string,
  branchId: string,
  _departmentId: string,
  assetId: string
) {
  const [uopRecords, jobOrders] = await Promise.all([
    fetchSpringBootUopRecords(),
    fetchAll<CanonicalJobOrder>(
      "/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,branch_id,product_id,start_date,end_date"
    ),
  ]);

  const joLookup = new Map<number, CanonicalJobOrder>();
  for (const jo of jobOrders) {
    if (branchId && Number(jo.branch_id) !== Number(branchId)) continue;
    const inStart = isDateInRange(jo.start_date, dateFrom, dateTo);
    const inEnd = isDateInRange(jo.end_date, dateFrom, dateTo);
    if (inStart || inEnd) {
      joLookup.set(jo.job_order_id, jo);
    }
  }

  // Job-Order Dataset: Only records with valid jobOrderId > 0
  const joRecords = uopRecords.filter((r) => {
    if (r.jobOrderId === null || r.jobOrderId <= 0) return false;
    if (assetId && r.assetId !== Number(assetId)) return false;
    if (joLookup.size > 0 && !joLookup.has(r.jobOrderId)) return false;
    return true;
  });

  const rows = joRecords.map((r) => {
    const canonicalJo = joLookup.get(r.jobOrderId!);
    return {
      jobOrderId: r.jobOrderId!,
      jobOrderNo: r.jobOrderNo ?? canonicalJo?.job_order_no ?? `JO #${r.jobOrderId}`,
      productName: r.productName ?? "Finished Good",
      machineName: r.machineName,
      productionOutput: r.productionUnits,
      uom: r.uom,
      ratePerUnit: r.depreciationPerUnit,
      depreciationAttributed: r.productionDepreciation,
      cogm: "—",
    };
  });

  // Cross-UOM Safeguard on Job Order Allocation
  const distinctJobs = new Set(rows.map((r) => r.jobOrderId));
  const totalDepreciationAttributed = rows.reduce((s, r) => s + r.depreciationAttributed, 0);

  const uomEval = evaluateUom(rows.map((r) => ({ productionUnits: r.productionOutput, uom: r.uom })));
  const totalProductionOutput = uomEval.totalOutput;
  const totalOutputUom = uomEval.displayUom;

  let avgDepreciationPerUnit: number | null = null;
  let avgRateUom = "Multiple UOMs";
  if (uomEval.isSingleUom && totalProductionOutput !== null && totalProductionOutput > 0) {
    avgDepreciationPerUnit = totalDepreciationAttributed / totalProductionOutput;
    avgRateUom = `₱${avgDepreciationPerUnit.toFixed(2)} / ${totalOutputUom}`;
  } else if (uomEval.isSingleUom && totalProductionOutput === 0) {
    avgRateUom = "—";
  }

  return {
    kpis: {
      jobOrdersWithOutput: distinctJobs.size,
      totalProductionOutput,
      totalOutputUom,
      depreciationAttributed: totalDepreciationAttributed,
      avgDepreciationPerUnit,
      avgRateUom,
    },
    rows,
  };
}

// ─── type=details ─────────────────────────────────────────────────────────────

async function handleDetails(
  dateFrom: string,
  dateTo: string,
  branchId: string,
  _departmentId: string,
  assetId: string,
  page: number,
  pageSize: number
) {
  const [uopRecords, jobOrders] = await Promise.all([
    fetchSpringBootUopRecords(),
    fetchAll<CanonicalJobOrder>(
      "/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,branch_id,product_id,start_date,end_date"
    ),
  ]);

  const joLookup = new Map<number, CanonicalJobOrder>();
  for (const jo of jobOrders) {
    if (branchId && Number(jo.branch_id) !== Number(branchId)) continue;
    const inStart = isDateInRange(jo.start_date, dateFrom, dateTo);
    const inEnd = isDateInRange(jo.end_date, dateFrom, dateTo);
    if (inStart || inEnd) {
      joLookup.set(jo.job_order_id, jo);
    }
  }

  const filtered = uopRecords.filter((r) => {
    if (assetId && r.assetId !== Number(assetId)) return false;
    if (r.jobOrderId && joLookup.size > 0 && !joLookup.has(r.jobOrderId)) return false;
    return true;
  });

  const allRows = filtered.map((r) => {
    const canonicalJo = r.jobOrderId ? joLookup.get(r.jobOrderId) : null;
    return {
      date: r.productionDate ?? canonicalJo?.start_date ?? null,
      machineName: r.machineName,
      assetSerial: r.serial,
      jobOrderNo: r.jobOrderNo ?? canonicalJo?.job_order_no ?? (r.jobOrderId ? `JO #${r.jobOrderId}` : "—"),
      productName: r.productName ?? "—",
      productionOutput: r.productionUnits,
      uom: r.uom,
      ratePerUnit: r.depreciationPerUnit,
      depreciationAttributed: r.productionDepreciation,
    };
  });

  const total = allRows.length;
  const start = (page - 1) * pageSize;
  const rows = allRows.slice(start, start + pageSize);

  return { rows, total };
}
