// src/app/api/fm/accounting/supplier-credit-memo/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Directus instance — same source as your working /items/suppliers_memo
const DIRECTUS_URL         = process.env.NEXT_PUBLIC_API_BASE_URL;
const DIRECTUS_TOKEN       = process.env.DIRECTUS_STATIC_TOKEN;
const COOKIE_NAME          = 'vos_access_token';

/**
 * Decode JWT payload (No Verify) and extract numeric userId from 'sub'.
 */
function decodeUserIdFromJwtCookie(req: NextRequest): number | null {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        const payloadPart = parts[1];
        const pad = "=".repeat((4 - (payloadPart.length % 4)) % 4);
        const b64 = (payloadPart + pad).replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr = Buffer.from(b64, "base64").toString("utf8");

        const payload = JSON.parse(jsonStr) as { sub?: string | number };
        const userId = Number(payload.sub);
        return Number.isFinite(userId) ? userId : null;
    } catch {
        return null;
    }
}

/**
 * Helper to get Philippine Standard Time (Asia/Manila) timestamps for database operations.
 * Returns formatted string: "YYYY-MM-DD HH:mm:ss"
 */
function getPhTimestamp(date?: Date | string | null): string {
    const d = date ? (typeof date === "string" ? new Date(date) : date) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    return validDate.toLocaleString("sv-SE", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).replace("T", " ");
}

// ─── GET /api/fm/accounting/supplier-credit-memo ──────────────────────────────
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token       = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { ok: false, message: 'Unauthorized: Missing access token' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') ?? '';

  // ── Suppliers dropdown → Directus /items/suppliers ──────────────────────────
  if (action === 'suppliers') {
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/suppliers?fields=id,supplier_name,supplier_shortcut,supplier_type&filter[isActive][_eq]=1&limit=-1&sort=supplier_name&meta=total_count`,
        {
          method : 'GET',
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          cache  : 'no-store',
        }
      );
      if (!res.ok) return NextResponse.json({ ok: false, status: res.status }, { status: res.status });
      const json = await res.json();
      // Directus returns { data: [...] } — pass through directly
      return NextResponse.json(json);
    } catch (err: unknown) {
      console.error('[SCM Suppliers]', err instanceof Error ? err.message : String(err));
      return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
    }
  }

  // ── COA dropdown → Directus /items/chart_of_accounts ───────────────────────
  if (action === 'chart-of-accounts') {
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/chart_of_accounts?fields=coa_id,gl_code,account_title&filter[account_type][account_name][_in]=Cost of Sales,Cost of Service,General and Administrative Expenses,Finance Cost,Other Income&limit=-1&sort=gl_code`,
        {
          method : 'GET',
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          cache  : 'no-store',
        }
      );
      if (!res.ok) return NextResponse.json({ ok: false, status: res.status }, { status: res.status });
      return NextResponse.json(await res.json());
    } catch (err: unknown) {
      console.error('[SCM COA]', err instanceof Error ? err.message : String(err));
      return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
    }
  }

  // ── Credit Memo list → Directus /items/suppliers_memo ──────────────────────
  // type=1 → credit memos only
  try {
    const filter: Record<string, Record<string, unknown>> = { type: { _eq: 1 } };

    const search        = searchParams.get('search');
    const supplier_id   = searchParams.get('supplier_id');
    const chart_of_acct = searchParams.get('chart_of_account');
    const status        = searchParams.get('status');
    const date_from     = searchParams.get('date_from');
    const date_to       = searchParams.get('date_to');

    if (supplier_id)   filter['supplier_id'] = { _eq: Number(supplier_id) };
    if (chart_of_acct) filter['chart_of_account'] = { _eq: Number(chart_of_acct) };
    if (status)        filter['status'] = { _eq: status };
    if (date_from || date_to) {
      filter['date'] = {};
      if (date_from) (filter['date'] as Record<string, string>)['_gte'] = date_from;
      if (date_to)   (filter['date'] as Record<string, string>)['_lte'] = date_to;
    }

    const query = new URLSearchParams();
    query.set('filter', JSON.stringify(filter));
    query.set('limit', '-1');
    query.set('sort', '-created_at');
    query.set('meta', 'filter_count');

    if (search) {
      // Directus search across multiple fields via _or filter
      (filter as Record<string, unknown>)['_or'] = [
        { memo_number: { _contains: search } },
        { reason:      { _contains: search } },
        { status:      { _contains: search } },
      ];
      query.set('filter', JSON.stringify(filter));
    }

    const res = await fetch(
      `${DIRECTUS_URL}/items/suppliers_memo?${query}`,
      {
        method : 'GET',
        headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
        cache  : 'no-store',
      }
    );

    if (!res.ok) {
      console.error('[SCM] Directus error:', res.status, res.statusText);
      return NextResponse.json({ ok: false, status: res.status }, { status: res.status });
    }

    const json = await res.json();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedData = (json.data ?? []).map((m: any) => {
      let created_at = m.created_at;
      if (created_at && typeof created_at === 'string') {
        if (!created_at.includes('T') && !created_at.includes('Z')) {
          created_at = created_at.replace(' ', 'T') + '+08:00';
        } else if (created_at.includes('T') && !created_at.endsWith('Z') && !created_at.includes('+')) {
          created_at = created_at + '+08:00';
        }
      }
      let updated_at = m.updated_at;
      if (updated_at && typeof updated_at === 'string') {
        if (!updated_at.includes('T') && !updated_at.includes('Z')) {
          updated_at = updated_at.replace(' ', 'T') + '+08:00';
        } else if (updated_at.includes('T') && !updated_at.endsWith('Z') && !updated_at.includes('+')) {
          updated_at = updated_at + '+08:00';
        }
      }
      return { ...m, created_at, updated_at };
    });

    // Directus returns { data: [...], meta: { total_count, filter_count } }
    return NextResponse.json({
      data:  mappedData,
      total: json.meta?.filter_count ?? json.data?.length ?? 0,
    });
  } catch (err: unknown) {
    console.error('[SCM]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
  }
}

// ─── POST /api/fm/accounting/supplier-credit-memo ─────────────────────────────
// Inserts directly into Directus suppliers_memo with type=1, status=Available
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token       = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { ok: false, message: 'Unauthorized: Missing access token' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { supplier_id, chart_of_account, date, amount, reason, encoder_id } = body;
    
    const userId = decodeUserIdFromJwtCookie(request);

    if (!supplier_id || !chart_of_account || !date || !amount) {
      return NextResponse.json(
        { ok: false, message: 'Missing required fields: supplier_id, chart_of_account, date, amount.' },
        { status: 400 }
      );
    }

    // Generate memo_number: get last SCM memo and increment
    const lastRes = await fetch(
      `${DIRECTUS_URL}/items/suppliers_memo?filter[type][_eq]=1&sort=-id&limit=1&fields=memo_number`,
      { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }, cache: 'no-store' }
    );
    const lastJson  = await lastRes.json();
    const lastMemo  = lastJson.data?.[0]?.memo_number ?? 'SCM-000';
    const lastNum   = parseInt(lastMemo.replace(/\D+/g, ''), 10) || 0;
    const memoNum   = `SCM-${String(lastNum + 1).padStart(3, '0')}`;

    const payload = {
      memo_number:      memoNum,
      type:             1,
      status:           'Available',
      supplier_id:      Number(supplier_id),
      chart_of_account: Number(chart_of_account),
      date,
      amount:           Number(amount),
      reason:           reason || null,
      encoder_id:       userId || encoder_id || null,
      created_at:       getPhTimestamp(),
      updated_at:       getPhTimestamp(),
    };

    const res = await fetch(`${DIRECTUS_URL}/items/suppliers_memo`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      body:    JSON.stringify(payload),
      cache:   'no-store',
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error('[SCM Create] Directus error:', res.status, errJson);
      return NextResponse.json(
        { ok: false, message: errJson?.errors?.[0]?.message ?? 'Failed to create memo.' },
        { status: res.status }
      );
    }

    const created = await res.json();
    return NextResponse.json(
      { ok: true, data: created.data, message: `Memo ${memoNum} created successfully.` },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('[SCM Create]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
  }
}