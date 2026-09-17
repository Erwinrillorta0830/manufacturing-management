import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getCachedDiscountTypes,
  getCachedUnits,
  type DiscountTypeMaster,
  type UnitMaster,
} from './_masterCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
const DIRECTUS_STATIC_TOKEN = (process.env.DIRECTUS_STATIC_TOKEN || '').trim();
const COOKIE_NAME = 'vos_access_token';

interface SalesInvoiceHeader {
  invoice_id: number;
  order_id?: string | null;
  customer_code?: string | null;
  invoice_no?: string | null;
  invoice_date?: string | null;
  dispatch_date?: string | null;
  due_date?: string | null;
  payment_terms?: number | null;
  transaction_status?: string | null;
  payment_status?: string | null;
  total_amount?: number | null;
  gross_amount?: number | null;
  discount_amount?: number | null;
  net_amount?: number | null;
  remarks?: string | null;
  salesman_id?: { salesman_name?: string } | null;
  branch_id?: { branch_name?: string } | null;
}

interface ProductRow {
  product_id: number;
  product_name?: string | null;
  description?: string | null;
  product_brand?: number | null;
  product_category?: number | null;
}

interface SalesInvoiceDetail {
  detail_id: number;
  order_id: string;
  serial_no?: string | null;
  unit_price: number;
  quantity: number;
  discount_amount?: number | null;
  gross_amount?: number | null;
  total_amount: number;
  unit?: number | null;
  discount_type?: number | null;
  product_id?: {
    product_id: number;
    product_name?: string;
    description?: string | null;
    product_brand?: number | null;
    product_category?: number | null;
  } | number | null;
}

interface BrandMaster { brand_id: number; brand_name?: string; }
interface CategoryMaster { category_id: number; category_name?: string; }

interface SalesInvoicePayment {
  id: number;
  order_id: string;
  reference_no?: string | null;
  paid_amount: number;
  date_paid: string;
  coa_id?: { gl_code?: string; account_title?: string } | null;
  bank_id?: { bank_name?: string } | null;
}

interface CustomerMemoInvoice {
  id: number;
  invoice_id: number;
  amount: number;
  date_applied: string;
  memo_id?: { memo_number?: string; type?: number | null; reason?: string; status?: string } | null;
}

interface SalesInvoiceSalesReturn {
  id: number;
  invoice_no: number;
  linked_by?: number | null;
  amount: number;
  created_at?: string;
  updated_at?: string;
  return_no?: {
    return_number?: string;
    return_date?: string;
    remarks?: string;
    status?: string;
    total_amount?: number | null;
    discount_amount?: number | null;
    gross_amount?: number | null;
  } | null;
}

interface UnfulfilledSalesTransaction {
  id: number;
  sales_invoice_id: number;
  variance_amount?: number | null;
  date_created?: string | null;
  created_at?: string | null;
}

async function directusFetch<T>(url: string, init?: RequestInit): Promise<T> {
  if (!DIRECTUS_URL) throw new Error('DIRECTUS_URL is not configured.');
  if (!DIRECTUS_STATIC_TOKEN) throw new Error('DIRECTUS_STATIC_TOKEN is not configured.');

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus responded with status ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function fetchUnitsByIds(ids: number[]): Promise<UnitMaster[]> {
  if (ids.length === 0) return [];
  const url = `${DIRECTUS_URL}/items/units?filter[unit_id][_in]=${ids.join(',')}&fields=unit_id,unit_name,unit_shortcut,order,sku_code&limit=-1`;
  const res = await directusFetch<{ data: UnitMaster[] }>(url).catch(() => ({ data: [] }));
  return res.data || [];
}

async function fetchDiscountTypesByIds(ids: number[]): Promise<DiscountTypeMaster[]> {
  if (ids.length === 0) return [];
  const url = `${DIRECTUS_URL}/items/discount_type?filter[id][_in]=${ids.join(',')}&fields=id,discount_type,total_percent&limit=-1`;
  const res = await directusFetch<{ data: DiscountTypeMaster[] }>(url).catch(() => ({ data: [] }));
  return res.data || [];
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized: Missing access token' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const invoiceIdStr = searchParams.get('invoiceId');

  if (!invoiceIdStr) {
    return NextResponse.json({ ok: false, message: 'Bad Request: Missing invoiceId parameter' }, { status: 400 });
  }

  const invoiceId = parseInt(invoiceIdStr, 10);
  if (isNaN(invoiceId)) {
    return NextResponse.json({ ok: false, message: 'Bad Request: Invalid invoiceId parameter' }, { status: 400 });
  }

  try {
    const headerUrl = `${DIRECTUS_URL}/items/sales_invoice/${invoiceId}?fields=*,salesman_id.salesman_name,branch_id.branch_name`;
    const detailsUrl = `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${invoiceId}&fields=detail_id,order_id,serial_no,unit_price,quantity,discount_amount,gross_amount,total_amount,unit,discount_type,product_id.*&limit=-1`;
    const paymentsUrl = `${DIRECTUS_URL}/items/sales_invoice_payments?filter[invoice_id][_eq]=${invoiceId}&fields=*,coa_id.gl_code,coa_id.account_title,bank_id.bank_name&limit=-1`;
    const memosUrl = `${DIRECTUS_URL}/items/customer_memo_invoices?filter[invoice_id][_eq]=${invoiceId}&fields=*,memo_id.*&limit=-1`;
    const returnsUrl = `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoiceId}&fields=*,return_no.*&limit=-1`;
    const unfulfilledUrl = `${DIRECTUS_URL}/items/unfulfilled_sales_transaction?filter[sales_invoice_id][_eq]=${invoiceId}&fields=*&limit=-1`;

    const [headerRes, detailsRes, paymentsRes, memosRes, returnsRes, unfulfilledRes] = await Promise.all([
      directusFetch<{ data: SalesInvoiceHeader }>(headerUrl),
      directusFetch<{ data: SalesInvoiceDetail[] }>(detailsUrl),
      directusFetch<{ data: SalesInvoicePayment[] }>(paymentsUrl).catch(() => ({ data: [] })),
      directusFetch<{ data: CustomerMemoInvoice[] }>(memosUrl).catch(() => ({ data: [] })),
      directusFetch<{ data: SalesInvoiceSalesReturn[] }>(returnsUrl).catch(() => ({ data: [] })),
      directusFetch<{ data: UnfulfilledSalesTransaction[] }>(unfulfilledUrl).catch(() => ({ data: [] })),
    ]);

    const rawHeader = headerRes.data;
    if (!rawHeader) {
      return NextResponse.json({ ok: false, message: `Invoice with ID ${invoiceId} not found` }, { status: 404 });
    }

    let calculatedDueDate: string | undefined = rawHeader.due_date || undefined;
    if (rawHeader.dispatch_date) {
      let termDays = 0;
      if (rawHeader.due_date && rawHeader.invoice_date) {
        const invD = new Date(rawHeader.invoice_date);
        const dueD = new Date(rawHeader.due_date);
        if (!isNaN(invD.getTime()) && !isNaN(dueD.getTime())) {
          termDays = Math.max(0, Math.round((dueD.getTime() - invD.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }
      const delD = new Date(rawHeader.dispatch_date);
      if (!isNaN(delD.getTime())) {
        const newDueD = new Date(delD.getTime());
        newDueD.setDate(newDueD.getDate() + termDays);
        calculatedDueDate = newDueD.toISOString();
      }
    }

    const header = {
      invoice_id: rawHeader.invoice_id,
      order_id: rawHeader.order_id || undefined,
      customer_code: rawHeader.customer_code || undefined,
      invoice_no: rawHeader.invoice_no || undefined,
      invoice_date: rawHeader.invoice_date || undefined,
      dispatch_date: rawHeader.dispatch_date || undefined,
      due_date: calculatedDueDate,
      payment_terms: rawHeader.payment_terms !== null && rawHeader.payment_terms !== undefined ? Number(rawHeader.payment_terms) : undefined,
      transaction_status: rawHeader.transaction_status || undefined,
      payment_status: rawHeader.payment_status || undefined,
      total_amount: rawHeader.total_amount !== null && rawHeader.total_amount !== undefined ? Number(rawHeader.total_amount) : undefined,
      gross_amount: rawHeader.gross_amount !== null && rawHeader.gross_amount !== undefined ? Number(rawHeader.gross_amount) : undefined,
      discount_amount: rawHeader.discount_amount !== null && rawHeader.discount_amount !== undefined ? Number(rawHeader.discount_amount) : undefined,
      net_amount: rawHeader.net_amount !== null && rawHeader.net_amount !== undefined
        ? Number(rawHeader.net_amount)
        : (rawHeader.gross_amount != null && rawHeader.discount_amount != null
          ? Number(rawHeader.gross_amount) - Number(rawHeader.discount_amount)
          : undefined),
      remarks: rawHeader.remarks || undefined,
      salesman_id: rawHeader.salesman_id ? { salesman_name: rawHeader.salesman_id.salesman_name } : undefined,
      branch_id: rawHeader.branch_id ? { branch_name: rawHeader.branch_id.branch_name } : undefined,
    };

    const rawDetails = detailsRes.data || [];

    const productIds = Array.from(
      new Set(
        rawDetails
          .map((d) => (d.product_id && typeof d.product_id === 'object' ? d.product_id.product_id : d.product_id))
          .filter((id): id is number => typeof id === 'number')
      )
    );

    const unitIds = Array.from(
      new Set(rawDetails.map(d => d.unit).filter((id): id is number => typeof id === 'number'))
    );
    const discountTypeIds = Array.from(
      new Set(rawDetails.map(d => d.discount_type).filter((id): id is number => typeof id === 'number'))
    );

    const productsRes = productIds.length > 0
      ? await directusFetch<{ data: ProductRow[] }>(
          `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(',')}&fields=product_id,product_name,description,product_brand,product_category&limit=-1`
        ).catch(() => ({ data: [] }))
      : { data: [] };

    const productsList = productsRes.data || [];
    const productsMap = new Map(productsList.map((p) => [p.product_id, p]));

    const brandIds = Array.from(new Set(productsList.map(p => p.product_brand).filter((v): v is number => typeof v === 'number')));
    const categoryIds = Array.from(new Set(productsList.map(p => p.product_category).filter((v): v is number => typeof v === 'number')));

    const [unitsMap, discountTypesMap, brandsRes, categoriesRes] = await Promise.all([
      getCachedUnits(unitIds, fetchUnitsByIds),
      getCachedDiscountTypes(discountTypeIds, fetchDiscountTypesByIds),
      brandIds.length > 0
        ? directusFetch<{ data: BrandMaster[] }>(`${DIRECTUS_URL}/items/brand?filter[brand_id][_in]=${brandIds.join(',')}&fields=brand_id,brand_name&limit=-1`).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] as BrandMaster[] }),
      categoryIds.length > 0
        ? directusFetch<{ data: CategoryMaster[] }>(`${DIRECTUS_URL}/items/categories?filter[category_id][_in]=${categoryIds.join(',')}&fields=category_id,category_name&limit=-1`).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] as CategoryMaster[] }),
    ]);

    const brandMap = new Map((brandsRes.data || []).map(b => [b.brand_id, b.brand_name || '']));
    const categoryMap = new Map((categoriesRes.data || []).map(c => [c.category_id, c.category_name || '']));

    const rawPayments = paymentsRes.data || [];
    const rawMemos = memosRes.data || [];
    const rawReturns = returnsRes.data || [];
    const rawUnfulfilled = unfulfilledRes.data || [];

    const items = rawDetails.map((item) => {
      const unitDetailsRaw = item.unit ? unitsMap.get(Number(item.unit)) ?? null : null;
      const discountTypeDetailsRaw = item.discount_type ? discountTypesMap.get(Number(item.discount_type)) ?? null : null;
      const prodId = item.product_id && typeof item.product_id === 'object' ? item.product_id.product_id : Number(item.product_id);
      const prodDetails = productsMap.get(prodId);
      const brandName = prodDetails?.product_brand != null ? (brandMap.get(Number(prodDetails.product_brand)) || undefined) : undefined;
      const categoryName = prodDetails?.product_category != null ? (categoryMap.get(Number(prodDetails.product_category)) || undefined) : undefined;

      return {
        detail_id: item.detail_id,
        order_id: item.order_id,
        serial_no: item.serial_no || undefined,
        unit_price: Number(item.unit_price || 0),
        quantity: Number(item.quantity || 0),
        discount_amount: item.discount_amount != null ? Number(item.discount_amount) : undefined,
        gross_amount: item.gross_amount != null ? Number(item.gross_amount) : undefined,
        total_amount: Number(item.total_amount || 0),
        product_id: prodId ? {
          product_id: prodId,
          product_name: prodDetails?.product_name || undefined,
          description: prodDetails?.description || undefined,
          product_brand: brandName ? { brand_name: brandName } : undefined,
          product_category: categoryName ? { category_name: categoryName } : undefined,
        } : undefined,
        unit_details: unitDetailsRaw ? {
          unit_id: unitDetailsRaw.unit_id,
          unit_name: unitDetailsRaw.unit_name || undefined,
          unit_shortcut: unitDetailsRaw.unit_shortcut || undefined,
          order: unitDetailsRaw.order || undefined,
          sku_code: unitDetailsRaw.sku_code || undefined,
        } : null,
        discount_type_details: discountTypeDetailsRaw ? {
          id: discountTypeDetailsRaw.id,
          discount_type: discountTypeDetailsRaw.discount_type || undefined,
          total_percent: discountTypeDetailsRaw.total_percent || undefined,
        } : null,
      };
    });

    const payments = rawPayments.map((p) => ({
      id: p.id,
      order_id: p.order_id,
      reference_no: p.reference_no || undefined,
      paid_amount: Number(p.paid_amount || 0),
      date_paid: p.date_paid,
      coa_id: p.coa_id ? { gl_code: p.coa_id.gl_code || undefined, account_title: p.coa_id.account_title || undefined } : null,
      bank_id: p.bank_id ? { bank_name: p.bank_id.bank_name || undefined } : null,
    }));

    const memos = rawMemos.map((m) => ({
      id: m.id,
      invoice_id: m.invoice_id,
      amount: Number(m.amount || 0),
      date_applied: m.date_applied,
      memo_id: m.memo_id ? {
        memo_number: m.memo_id.memo_number || undefined,
        type: m.memo_id.type !== null && m.memo_id.type !== undefined ? Number(m.memo_id.type) : undefined,
        reason: m.memo_id.reason || undefined,
        status: m.memo_id.status || undefined,
      } : null,
    }));

    const returns = rawReturns.map((r) => ({
      id: r.id,
      invoice_no: r.invoice_no,
      linked_by: r.linked_by || undefined,
      amount: Number(r.amount || 0),
      created_at: r.created_at || undefined,
      updated_at: r.updated_at || undefined,
      return_no: r.return_no ? {
        return_number: r.return_no.return_number || undefined,
        return_date: r.return_no.return_date || undefined,
        remarks: r.return_no.remarks || undefined,
        status: r.return_no.status || undefined,
        total_amount: r.return_no.total_amount != null ? Number(r.return_no.total_amount) : undefined,
        discount_amount: r.return_no.discount_amount != null ? Number(r.return_no.discount_amount) : undefined,
        gross_amount: r.return_no.gross_amount != null ? Number(r.return_no.gross_amount) : undefined,
      } : null,
    }));

    const unfulfilled = rawUnfulfilled.map((u) => ({
      id: u.id,
      sales_invoice_id: u.sales_invoice_id,
      unfulfilled_amount: Number(u.variance_amount || 0),
      amount: Number(u.variance_amount || 0),
      total_amount: Number(u.variance_amount || 0),
      created_at: u.date_created || u.created_at || undefined,
    }));

    return NextResponse.json({
      ok: true,
      header,
      items,
      payments,
      memos,
      returns,
      unfulfilled,
    }, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (err: unknown) {
    console.error('[AR Invoice Details API Error]:', err);
    return NextResponse.json(
      { ok: false, message: 'Failed to retrieve invoice details', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
