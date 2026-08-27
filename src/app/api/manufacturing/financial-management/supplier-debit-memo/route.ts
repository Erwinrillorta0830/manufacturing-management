// src/app/api/fm/accounting/supplier-debit-memo/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRECTUS_URL        = process.env.NEXT_PUBLIC_API_BASE_URL;
const DIRECTUS_TOKEN      = process.env.DIRECTUS_STATIC_TOKEN;
const COOKIE_NAME         = 'vos_access_token';

// ─── GET /api/fm/accounting/supplier-debit-memo ───────────────────────────────
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

  // ── Suppliers dropdown ──────────────────────────────────────────────────────
  if (action === 'suppliers') {
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/suppliers?fields=id,supplier_name,supplier_shortcut,supplier_type&filter[isActive][_eq]=1&limit=-1&sort=supplier_name`,
        {
          method : 'GET',
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          cache  : 'no-store',
        }
      );
      if (!res.ok) return NextResponse.json({ ok: false, status: res.status }, { status: res.status });
      return NextResponse.json(await res.json());
    } catch (err: unknown) {
      console.error('[SDM Suppliers]', err instanceof Error ? err.message : String(err));
      return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
    }
  }

  // ── COA dropdown ────────────────────────────────────────────────────────────
  if (action === 'chart-of-accounts') {
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/chart_of_accounts?fields=coa_id,gl_code,account_title&filter[account_title][_nnull]=true&limit=-1&sort=gl_code`,
        {
          method : 'GET',
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          cache  : 'no-store',
        }
      );
      if (!res.ok) return NextResponse.json({ ok: false, status: res.status }, { status: res.status });
      return NextResponse.json(await res.json());
    } catch (err: unknown) {
      console.error('[SDM COA]', err instanceof Error ? err.message : String(err));
      return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
    }
  }

  // ── Debit Memo list → type=2 ────────────────────────────────────────────────
  try {
    const filter: Record<string, Record<string, unknown>> = { type: { _eq: 2 } };

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

    if (search) {
      (filter as Record<string, unknown>)['_or'] = [
        { memo_number: { _contains: search } },
        { reason:      { _contains: search } },
        { status:      { _contains: search } },
      ];
    }

    const query = new URLSearchParams();
    query.set('filter', JSON.stringify(filter));
    query.set('limit', '-1');
    query.set('sort', '-created_at');
    query.set('meta', 'filter_count');

    const res = await fetch(
      `${DIRECTUS_URL}/items/suppliers_memo?${query}`,
      {
        method : 'GET',
        headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
        cache  : 'no-store',
      }
    );

    if (!res.ok) {
      console.error('[SDM] Directus error:', res.status, res.statusText);
      return NextResponse.json({ ok: false, status: res.status }, { status: res.status });
    }

    const json = await res.json();
    return NextResponse.json({
      data:  json.data  ?? [],
      total: json.meta?.filter_count ?? json.data?.length ?? 0,
    });
  } catch (err: unknown) {
    console.error('[SDM]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
  }
}

// ─── POST /api/fm/accounting/supplier-debit-memo ──────────────────────────────
// Inserts directly into Directus suppliers_memo with type=2, status=Available
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

    if (!supplier_id || !chart_of_account || !date || !amount) {
      return NextResponse.json(
        { ok: false, message: 'Missing required fields: supplier_id, chart_of_account, date, amount.' },
        { status: 400 }
      );
    }

    // Generate memo_number: get last SDM memo and increment
    const lastRes = await fetch(
      `${DIRECTUS_URL}/items/suppliers_memo?filter[type][_eq]=2&sort=-id&limit=1&fields=memo_number`,
      { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }, cache: 'no-store' }
    );
    const lastJson = await lastRes.json();
    const lastMemo = lastJson.data?.[0]?.memo_number ?? 'SDM-000';
    const lastNum  = parseInt(lastMemo.replace(/\D+/g, ''), 10) || 0;
    const memoNum  = `SDM-${String(lastNum + 1).padStart(3, '0')}`;

    const payload = {
      memo_number:      memoNum,
      type:             2,
      status:           'Available',
      supplier_id:      Number(supplier_id),
      chart_of_account: Number(chart_of_account),
      date,
      amount:           Number(amount),
      reason:           reason || null,
      encoder_id:       encoder_id || null,
    };

    const res = await fetch(`${DIRECTUS_URL}/items/suppliers_memo`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      body:    JSON.stringify(payload),
      cache:   'no-store',
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error('[SDM Create] Directus error:', res.status, errJson);
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
    console.error('[SDM Create]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Gateway Error' }, { status: 502 });
  }
}