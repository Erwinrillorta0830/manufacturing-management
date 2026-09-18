import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
const DIRECTUS_STATIC_TOKEN = (process.env.DIRECTUS_STATIC_TOKEN || "").trim();
const COOKIE_NAME = "vos_access_token";

// ── Directus response types ────────────────────────────────────────────────
interface DirectusDisbursement {
  id: number;
  doc_no: string | null;
  transaction_type: number | null;
  payee: number | null;
  total_amount: number | null;
  paid_amount: number | null;
  transaction_date: string | null;
  division_id: number | null;
}

interface DirectusDisbursementPayable {
  disbursement_id: number | null;
  reference_no: string | null;
  date: string | null;
  amount: number | null;
}

interface DirectusDisbursementPayment {
  amount: number | null;
  disbursement_id: number | null;
}

interface DirectusSupplier   { id: number; supplier_name: string; }
interface DirectusDivision   { division_id: number; division_name: string; }

// The transaction_type table has a single text column named `transaction_type`
// (the same as the table name). Values are "Trade" / "Non-Trade".
interface DirectusTransType  { id: number; transaction_type: string | null; }

// ── Helpers ────────────────────────────────────────────────────────────────
function asNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

async function directusGet<T>(path: string): Promise<T> {
  if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  if (!DIRECTUS_STATIC_TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");

  const res = await fetch(`${DIRECTUS_URL}${path.startsWith("/") ? "" : "/"}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus error ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const json = await directusGet<{ data: T[] }>(path);
  return json.data || [];
}

async function fetchAllChunked<T>(
  basePath: string,
  idField: string,
  ids: (number | string)[],
  chunkSize = 300
): Promise<T[]> {
  if (ids.length === 0) return [];
  const separator = basePath.includes("?") ? "&" : "?";
  const chunks: (number | string)[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map(chunk =>
      fetchAll<T>(`${basePath}${separator}filter[${idField}][_in]=${chunk.join(",")}`)
    )
  );
  return results.flat();
}

/**
 * Classify a disbursement as Trade or Non-Trade based on the
 * transaction type's `transaction_type` name. We do an exact
 * (case-insensitive) comparison against "Trade" / "Non-Trade"
 * since those are the only two values seeded into the table.
 * Falls back to a substring check for future-proofing.
 */
function classifyApCategory(typeName: string | null | undefined): "Trade" | "Non-Trade" {
  const name = (typeName || "").trim().toLowerCase();
  if (name === "trade")            return "Trade";
  if (name === "non-trade")        return "Non-Trade";
  if (name.startsWith("trade"))    return "Trade";
  if (name.startsWith("non"))      return "Non-Trade";
  return "Non-Trade";
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // 1. Auth
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  // 2. Date filters
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate   = searchParams.get("endDate");

  // 3. Filter Directus query by date_created window
  const dateFilterParts: string[] = ["filter[is_deleted][_eq]=0"];
  if (startDate) dateFilterParts.push(`filter[date_created][_gte]=${encodeURIComponent(startDate)}`);
  if (endDate)   dateFilterParts.push(`filter[date_created][_lte]=${encodeURIComponent(endDate + "T23:59:59")}`);

  const DISBURSEMENT_FIELDS = [
    "id",
    "doc_no",
    "transaction_type",
    "payee",
    "total_amount",
    "paid_amount",
    "transaction_date",
    "division_id",
  ].join(",");

  try {
    const PAGE_SIZE = 500;
    const MAX_PAGES = 20; // safety cap = 10,000 rows
    const fetchDisbursementPage = async (page: number, includeCount = false) => {
      const params = new URLSearchParams();
      dateFilterParts.forEach(p => params.append(p.split("=")[0], p.split("=").slice(1).join("=")));
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((page - 1) * PAGE_SIZE));
      params.set("sort", "-date_created,-id");
      params.set("fields", DISBURSEMENT_FIELDS);
      if (includeCount) params.set("meta", "filter_count");

      return directusGet<{
        data?: DirectusDisbursement[];
        meta?: { filter_count?: number | string };
      }>(
        `/items/disbursement?${params.toString()}`
      );
    };

    const firstPage = await fetchDisbursementPage(1, true);
    const firstBatch = firstPage.data ?? [];
    const filterCount = asNumber(firstPage.meta?.filter_count, firstBatch.length);
    const pageCount = Math.min(MAX_PAGES, Math.max(1, Math.ceil(filterCount / PAGE_SIZE)));
    const remainingPages = pageCount > 1
      ? await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) =>
            fetchDisbursementPage(index + 2)
          )
        )
      : [];
    const allDisbursements = [
      ...firstBatch,
      ...remainingPages.flatMap((result) => result.data ?? []),
    ];

    if (allDisbursements.length === 0) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const disbIds        = allDisbursements.map(d => d.id);
    const supplierIds    = Array.from(new Set(allDisbursements.map(d => d.payee).filter((v): v is number => typeof v === "number")));
    const transTypeIds   = Array.from(new Set(allDisbursements.map(d => d.transaction_type).filter((v): v is number => typeof v === "number")));
    const divisionIds    = Array.from(new Set(
      allDisbursements.map(d => d.division_id)
        .filter((v): v is number => typeof v === "number")
    ));

    // Parallel lookups
    const [
      payables,
      payments,
      suppliers,
      divisions,
      transactionTypes,
    ] = await Promise.all([
      fetchAllChunked<DirectusDisbursementPayable>(
        `/items/disbursement_payables?limit=-1&fields=disbursement_id,reference_no,date,amount`,
        "disbursement_id",
        disbIds
      ).catch(() => [] as DirectusDisbursementPayable[]),
      fetchAllChunked<DirectusDisbursementPayment>(
        `/items/disbursement_payments?limit=-1&fields=disbursement_id,amount`,
        "disbursement_id",
        disbIds
      ).catch(() => [] as DirectusDisbursementPayment[]),
      fetchAllChunked<DirectusSupplier>(
        `/items/suppliers?limit=-1&fields=id,supplier_name`,
        "id",
        supplierIds
      ).catch(() => [] as DirectusSupplier[]),
      fetchAllChunked<DirectusDivision>(
        `/items/division?limit=-1&fields=division_id,division_name`,
        "division_id",
        divisionIds
      ).catch(() => [] as DirectusDivision[]),
      fetchAllChunked<DirectusTransType>(
        `/items/transaction_type?limit=-1&fields=id,transaction_type`,
        "id",
        transTypeIds
      ).catch(() => [] as DirectusTransType[]),
    ]);

    // Lookup maps
    const supplierMap   = new Map<number, string>(suppliers.map(s => [s.id, s.supplier_name]));
    const divisionMap   = new Map<number, string>(divisions.map(d => [d.division_id, d.division_name]));
    const transTypeMap  = new Map<number, DirectusTransType>(transactionTypes.map(t => [t.id, t]));

    // Aggregation maps
    const payableAggByDisb = new Map<number, { total: number; earliestDate: string | null; referenceNo: string | null }>();
    for (const p of payables) {
      if (typeof p.disbursement_id !== "number") continue;
      const amt = asNumber(p.amount);
      const cur = payableAggByDisb.get(p.disbursement_id) || { total: 0, earliestDate: null, referenceNo: null };
      cur.total += amt;
      if (p.date && (!cur.earliestDate || p.date < cur.earliestDate)) {
        cur.earliestDate = p.date;
      }
      if (p.reference_no && !cur.referenceNo) cur.referenceNo = p.reference_no;
      payableAggByDisb.set(p.disbursement_id, cur);
    }

    const paidAggByDisb = new Map<number, number>();
    for (const pm of payments) {
      if (typeof pm.disbursement_id !== "number") continue;
      paidAggByDisb.set(
        pm.disbursement_id,
        (paidAggByDisb.get(pm.disbursement_id) || 0) + asNumber(pm.amount)
      );
    }

    // Build the AP rows
    const rows = allDisbursements.map(d => {
      const supplierName = supplierMap.get(d.payee || -1) || (d.payee ? `Supplier #${d.payee}` : "\u2014");
      const divisionName = d.division_id ? divisionMap.get(d.division_id) || `Division #${d.division_id}` : null;
      const transType    = d.transaction_type ? transTypeMap.get(d.transaction_type) : undefined;
      const transTypeName = transType?.transaction_type || (d.transaction_type ? `Type #${d.transaction_type}` : null);

      const payablesRow = payableAggByDisb.get(d.id);
      const totalPayable = asNumber(d.total_amount) || payablesRow?.total || 0;
      const totalPaid    = asNumber(d.paid_amount) || paidAggByDisb.get(d.id) || 0;
      const outstandingBalance = Math.max(0, totalPayable - totalPaid);

      return {
        disbursementId: d.id,
        docNo: d.doc_no || `DISB-${d.id}`,
        supplierName,
        transactionTypeName: transTypeName,
        apCategory: classifyApCategory(transTypeName),
        transactionDate: d.transaction_date,
        dueDate: payablesRow?.earliestDate || d.transaction_date,
        referenceNo: payablesRow?.referenceNo || d.doc_no || "",
        divisionName,
        totalPayable,
        totalPaid,
        outstandingBalance,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (err: unknown) {
    console.error("[AP Directus API Error]:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load accounts payable",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
