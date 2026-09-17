// utils/index.ts — Pure utility functions for Accounts Payable module.

import type {
  RawAPRow, APRecord, APStatus, AgingBucket,
  SupplierEntry, StatusEntry, APMetrics,
  APCategory, APCategoryBreakdown,
} from '../types';

export const COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

export const STATUS_COLORS: Record<APStatus, string> = {
  'Paid':                     '#10b981',
  'Unpaid':                   '#94a3b8',
  'Partially Paid':           '#f59e0b',
  'Overdue':                  '#dc2626',
  'Unpaid | Overdue':         '#ef4444',
  'Partially Paid | Overdue': '#f97316',
};

/**
 * Brand color set for the Trade vs Non-Trade split. Teal/blue
 * for Trade (operational, "money out for goods") and amber for
 * Non-Trade (overhead, expenses, payroll, etc.).
 */
export const CATEGORY_GRADIENT: Record<APCategory, { from: string; to: string; ring: string; chip: string }> = {
  'Trade':     { from: '#0ea5e9', to: '#6366f1', ring: 'rgba(14,165,233,0.35)',  chip: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  'Non-Trade': { from: '#f59e0b', to: '#ef4444', ring: 'rgba(245,158,11,0.35)',  chip: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
};

export const formatPeso = (v: number): string =>
  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (d?: string | null): string => {
  if (!d) return '—';
  const date = new Date(d);
  return isNaN(date.getTime())
    ? d
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * Computes how many days overdue a record is based on its due date.
 *
 * Returns:
 *   null     — no valid due date; cannot determine overdue state
 *   negative — due in the future; not yet overdue
 *   0        — due exactly today; overdue (0 days aged)
 *   positive — past due; N days overdue
 *
 * Uses Math.floor so same-day always yields 0, never 1.
 */
function computeAgingDays(dueDateStr: string | null | undefined): number | null {
  if (!dueDateStr || dueDateStr === '—') return null;

  const due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Resolve the AP category for a raw row. The BFF sends
 * `apCategory` pre-computed from the transaction_type name, but
 * we fall back to the heuristic here so the function also works
 * in tests / Storybook / etc.
 */
function resolveCategory(row: RawAPRow): APCategory {
  if (row.apCategory === 'Trade' || row.apCategory === 'Non-Trade') {
    return row.apCategory;
  }
  const name = (row.transactionTypeName || '').toLowerCase();
  return name.includes('trade') ? 'Trade' : 'Non-Trade';
}

export function transformAPRows(raw: RawAPRow[]): APRecord[] {
  return raw.map((row, i) => {
    const amountPayable      = Number(row.totalPayable       ?? 0);
    const amountPaid         = Number(row.totalPaid          ?? 0);
    const outstandingBalance = Number(row.outstandingBalance ?? Math.max(0, amountPayable - amountPaid));
    const division           = String(row.divisionName       ?? '—');
    const invoiceDate        = String(row.transactionDate    ?? '');
    const dueDate            = String(row.dueDate            ?? '');

    // null = no due date | negative = future | 0 = today | positive = past due
    const aging = computeAgingDays(dueDate);

    // Overdue only when: valid due date + today or past + has outstanding balance
    const isOverdue = aging !== null && aging >= 0 && outstandingBalance > 0;

    let status: APStatus;

    if (amountPaid >= amountPayable && amountPayable > 0) {
      status = 'Paid';
    } else if (amountPaid === 0) {
      status = isOverdue ? 'Unpaid | Overdue' : 'Unpaid';
    } else {
      status = isOverdue ? 'Partially Paid | Overdue' : 'Partially Paid';
    }

    return {
      id:                 String(row.disbursementId ?? `AP-${i + 1}`),
      refNo:              String(row.docNo          ?? `AP-${i + 1}`),
      supplier:           String(row.supplierName   ?? '—'),
      invoiceNo:          String(row.referenceNo    ?? row.docNo ?? '—'),
      division,
      invoiceDate,
      dueDate,
      amountPayable,
      amountPaid,
      outstandingBalance,
      aging,
      status,
      apCategory:         resolveCategory(row),
      transactionTypeName: row.transactionTypeName ?? null,
    };
  });
}

export function buildAgingBuckets(records: APRecord[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { range: '0–30 Days',  amount: 0 },
    { range: '31–60 Days', amount: 0 },
    { range: '61–90 Days', amount: 0 },
    { range: '91+ Days',   amount: 0 },
  ];

  records.forEach((r) => {
    if (r.outstandingBalance <= 0) return;
    if (r.aging === null || r.aging < 0) return;

    if      (r.aging <= 30) buckets[0].amount += r.outstandingBalance;
    else if (r.aging <= 60) buckets[1].amount += r.outstandingBalance;
    else if (r.aging <= 90) buckets[2].amount += r.outstandingBalance;
    else                    buckets[3].amount += r.outstandingBalance;
  });

  return buckets;
}

export function buildSupplierData(records: APRecord[]): SupplierEntry[] {
  const map: Record<string, number> = {};
  records.forEach((r) => {
    map[r.supplier] = (map[r.supplier] ?? 0) + r.outstandingBalance;
  });
  return Object.entries(map)
    .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function buildStatusData(records: APRecord[]): StatusEntry[] {
  const map: Record<string, number> = {};
  records.forEach((r) => {
    map[r.status] = (map[r.status] ?? 0) + 1;
  });
  return (Object.entries(map) as [APStatus, number][])
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] ?? '#94a3b8' }));
}

export function deriveMetrics(records: APRecord[]): APMetrics {
  return {
    totalPayable:     records.reduce((s, r) => s + r.amountPayable,      0),
    totalPaid:        records.reduce((s, r) => s + r.amountPaid,         0),
    totalOutstanding: records.reduce((s, r) => s + r.outstandingBalance, 0),
    overdueCount:     records.filter((r) =>
      r.status === 'Overdue' ||
      r.status === 'Unpaid | Overdue' ||
      r.status === 'Partially Paid | Overdue'
    ).length,
    totalRecords: records.length,
  };
}

/**
 * Build a side-by-side Trade vs Non-Trade summary used by the
 * KPI strip and the tab labels. Returns both categories even
 * when one is empty so the layout doesn't shift around.
 */
export function buildCategoryBreakdown(records: APRecord[]): APCategoryBreakdown[] {
  const categories: APCategory[] = ['Trade', 'Non-Trade'];
  return categories.map(category => {
    const subset = records.filter(r => r.apCategory === category);
    const m = deriveMetrics(subset);
    return {
      category,
      totalRecords:     m.totalRecords,
      totalPayable:     m.totalPayable,
      totalPaid:        m.totalPaid,
      totalOutstanding: m.totalOutstanding,
      overdueCount:     m.overdueCount,
      paidPct:          m.totalPayable > 0 ? (m.totalPaid / m.totalPayable) * 100 : 0,
    };
  });
}

export function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  if (current > 3) pages.push('ellipsis');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('ellipsis');
  pages.push(total);
  return pages;
}
