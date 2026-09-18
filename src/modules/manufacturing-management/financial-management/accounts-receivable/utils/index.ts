// utils/index.ts
// Pure utility functions — no React, no side effects.

import type { RawInvoiceRow, Invoice, AgingBucket, NamedAmount, ARMetrics } from '../types';

export const formatPeso = (v: number): string =>
  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (d?: string): string => {
  if (!d) return '—';
  const date = new Date(d);
  return isNaN(date.getTime()) ? d : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const parseBit = (val: unknown): boolean => {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return obj.data[0] === 1;
    }
  }
  if (Buffer.isBuffer(val)) {
    return val[0] === 1;
  }
  return val === '1' || val === 'true' || val === 1;
};

export function computeDeliveryBasedDueDate(
  dispatchDate?: unknown,
  invoiceDate?: unknown,
  dueDate?: unknown,
  calculatedDueDate?: unknown
): string {
  if (calculatedDueDate) return String(calculatedDueDate);
  const dispStr = dispatchDate ? String(dispatchDate) : null;
  const dueStr = dueDate ? String(dueDate) : null;
  const invStr = invoiceDate ? String(invoiceDate) : null;
  if (dispStr) {
    let termDays = 0;
    if (dueStr && invStr) {
      const invD = new Date(invStr);
      const dueD = new Date(dueStr);
      if (!isNaN(invD.getTime()) && !isNaN(dueD.getTime())) {
        termDays = Math.max(0, Math.round((dueD.getTime() - invD.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }
    const delD = new Date(dispStr);
    if (!isNaN(delD.getTime())) {
      const newDue = new Date(delD.getTime());
      newDue.setDate(newDue.getDate() + termDays);
      return newDue.toISOString();
    }
  }
  return dueStr ? String(dueStr) : '';
}

export function transformInvoices(data: RawInvoiceRow[]): {
  invoices: Invoice[];
  agingData: AgingBucket[];
  salesmanMap: Record<string, number>;
  customerMap: Record<string, number>;
} {
  const agingData: AgingBucket[] = [
    { range: '0-30 Days',  amount: 0 },
    { range: '31-60 Days', amount: 0 },
    { range: '61-90 Days', amount: 0 },
    { range: '90+ Days',   amount: 0 },
  ];
  const salesmanMap: Record<string, number> = {};
  const customerMap: Record<string, number> = {};

  const invoices: Invoice[] = data.map((row) => {
    const netReceivable    = Number(row.netReceivable    ?? row.grossAmount ?? 0);
    const totalPaid        = Number(row.totalPaid        ?? 0);
    const outstanding      = Number(row.outstandingBalance ?? Math.max(0, netReceivable - totalPaid));
    const branch           = String(row.branch   ?? row.branchName   ?? 'Unknown');
    const salesman         = String(row.salesman ?? row.salesmanName ?? 'Unknown');
    const division         = String(row.division ?? '—');
    const due              = computeDeliveryBasedDueDate(row.dispatchDate, row.invoiceDate, row.dueDate ?? row.due, row.calculatedDueDate);
    const customer         = String(row.customerName ?? row.customer ?? row.client ?? '—');

    // The API sends daysOverdue: negative = future, 0 = today, positive = past due, null = no due date
    // Prefer server-computed value; fall back to client computation only if absent
    const agingRaw: number | null | undefined = row.daysOverdue as number | null | undefined;
    let aging: number | null = agingRaw !== undefined && agingRaw !== null
      ? Number(agingRaw)
      : null;

    if (aging === null && due) {
      const d = new Date(due);
      if (!isNaN(d.getTime())) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        aging = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    // Overdue: due date has passed (aging >= 0) and balance remains
    const isOverdue = aging !== null && aging >= 0 && outstanding > 0;

    const status: Invoice['status'] = isOverdue ? 'Overdue' : 'Due';

    // Bucket overdue invoices by days past due
    if (isOverdue && aging !== null) {
      if      (aging <= 30) agingData[0].amount += outstanding;
      else if (aging <= 60) agingData[1].amount += outstanding;
      else if (aging <= 90) agingData[2].amount += outstanding;
      else                  agingData[3].amount += outstanding;
    }

    salesmanMap[salesman] = (salesmanMap[salesman] || 0) + outstanding;
    customerMap[customer] = (customerMap[customer] || 0) + outstanding;

    const arStatus: Invoice['arStatus'] = isOverdue
      ? 'Overdue'
      : (row.dispatchDate ? 'Due' : '—');
    const paymentStatus = String(row.paymentStatus || 'Unpaid');
    const transactionStatus = String(row.transactionStatus || 'NULL');

    return {
      id:           String(row.invoiceId ?? row.id ?? row.invoiceNo ?? ''),
      invoiceNo:    String(row.invoiceNo ?? row.invoice_number ?? '—'),
      orderId:      String(row.orderId ?? '—'),
      customer,
      customerCode: String(row.customerCode ?? '—'),
      invoiceDate:  String(row.invoiceDate ?? ''),
      due,
      netReceivable,
      totalPaid,
      outstanding,
      overdue: aging,
      branch,
      salesman,
      division,
      status,
      grossAmount:        Number(row.grossAmount        ?? 0),
      discountAmount:     Number(row.discountAmount     ?? 0),
      returnAmount:       Number(row.returnAmount       ?? 0),
      unfulfilledAmount:  Number(row.unfulfilledAmount  ?? 0),
      appliedCreditMemos: Number(row.appliedCreditMemos ?? 0),
      appliedDebitMemos:  Number(row.appliedDebitMemos  ?? 0),
      unpostedCollectionAmount: Number(row.unpostedCollectionAmount ?? 0),
      isPosted:           parseBit(row.isPosted),
      salesType:          row.salesType != null ? Number(row.salesType) : null,
      deliveryDate:       row.dispatchDate ? String(row.dispatchDate) : '',
      arStatus,
      paymentStatus,
      transactionStatus,
      cluster:            String(row.cluster ?? 'Unassigned'),
      salesmanCode:       String(row.salesmanCode ?? '—'),
      supplierCode:       String(row.supplierCode ?? '—'),
    };
  });

  return { invoices, agingData, salesmanMap, customerMap };
}

export function deriveAgingData(invoices: Invoice[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { range: '0-30 Days',  amount: 0 },
    { range: '31-60 Days', amount: 0 },
    { range: '61-90 Days', amount: 0 },
    { range: '90+ Days',   amount: 0 },
  ];
  invoices.forEach((inv) => {
    if (inv.overdue === null || inv.overdue < 0 || inv.outstanding <= 0) return;
    if      (inv.overdue <= 30) buckets[0].amount += inv.outstanding;
    else if (inv.overdue <= 60) buckets[1].amount += inv.outstanding;
    else if (inv.overdue <= 90) buckets[2].amount += inv.outstanding;
    else                        buckets[3].amount += inv.outstanding;
  });
  return buckets;
}

/** Derives summary metrics directly from the invoice list — no branchMap needed. */
export function deriveMetrics(invoices: Invoice[]): ARMetrics {
  const totalReceivable  = invoices.reduce((sum, inv) => sum + inv.netReceivable, 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.outstanding,   0);
  const totalUnposted    = invoices.reduce((sum, inv) => sum + (inv.unpostedCollectionAmount || 0), 0);
  const realOutstanding  = Math.max(0, totalOutstanding - totalUnposted);

  const totalPendingCancellation = invoices
    .filter((inv) => inv.transactionStatus === 'Cancellation Requested')
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // Include due-today (overdue === 0) in overdue set
  const overdueInvoices = invoices.filter(
    (inv) => inv.overdue !== null && inv.overdue >= 0 && inv.outstanding > 0
  );
  const avgOverdue =
    overdueInvoices.length > 0
      ? Math.round(
          overdueInvoices.reduce((sum, inv) => sum + (inv.overdue ?? 0), 0) / overdueInvoices.length
        )
      : 0;

  return {
    totalReceivable,
    totalOutstanding,
    totalUnposted,
    realOutstanding,
    overdueInvoices,
    avgOverdue,
    totalPendingCancellation,
  };
}

export function mapToSortedArray(map: Record<string, number>, limit = 8): NamedAmount[] {
  return Object.entries(map)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  if (currentPage > 3) pages.push('ellipsis');
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function buildARQueryParams(
  filters: {
    dateFrom?: string;
    dateTo?: string;
    customer?: string;
    cluster?: string;
    salesman?: string;
    division?: string;
    operation?: string;
    agingRange?: string;
    search?: string;
  },
  sort?: import('../types').ARTableSort,
): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.customer) params.set('customer', filters.customer);
  if (filters.cluster) params.set('cluster', filters.cluster);
  if (filters.salesman) params.set('salesman', filters.salesman);
  if (filters.division) params.set('division', filters.division);
  if (filters.operation) params.set('operation', filters.operation);
  if (filters.agingRange) params.set('agingRange', filters.agingRange);
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (sort?.sortKey && sort?.sortOrder) {
    params.set('sortKey', sort.sortKey);
    params.set('sortOrder', sort.sortOrder);
  }
  return params.toString();
}

/** Map a server AR row into the client Invoice shape. */
export function mapARRowToInvoice(row: RawInvoiceRow): import('../types').Invoice {
  const netReceivable = Number(row.netReceivable ?? row.grossAmount ?? 0);
  const totalPaid = Number(row.totalPaid ?? 0);
  const outstanding = Number(row.outstandingBalance ?? Math.max(0, netReceivable - totalPaid));
  const due = computeDeliveryBasedDueDate(row.dispatchDate, row.invoiceDate, row.dueDate ?? row.due, row.calculatedDueDate);
  const agingRaw = row.daysOverdue as number | null | undefined;
  let aging: number | null = agingRaw !== undefined && agingRaw !== null ? Number(agingRaw) : null;
  if (aging === null && due) {
    const d = new Date(due);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      aging = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    }
  }
  const isOverdue = aging !== null && aging >= 0 && outstanding > 0;

  return {
    id: String(row.invoiceId ?? row.id ?? row.invoiceNo ?? ''),
    invoiceNo: String(row.invoiceNo ?? row.invoice_number ?? '—'),
    orderId: String(row.orderId ?? '—'),
    customer: String(row.customerName ?? row.customer ?? row.client ?? '—'),
    customerCode: String(row.customerCode ?? '—'),
    invoiceDate: String(row.invoiceDate ?? ''),
    due,
    netReceivable,
    totalPaid,
    outstanding,
    overdue: aging,
    branch: String(row.branch ?? row.branchName ?? 'Unknown'),
    salesman: String(row.salesman ?? row.salesmanName ?? 'Unknown'),
    division: String(row.division ?? '—'),
    status: isOverdue ? 'Overdue' : 'Due',
    grossAmount: Number(row.grossAmount ?? 0),
    discountAmount: Number(row.discountAmount ?? 0),
    returnAmount: Number(row.returnAmount ?? 0),
    unfulfilledAmount: Number(row.unfulfilledAmount ?? 0),
    appliedCreditMemos: Number(row.appliedCreditMemos ?? 0),
    appliedDebitMemos: Number(row.appliedDebitMemos ?? 0),
    unpostedCollectionAmount: Number(row.unpostedCollectionAmount ?? 0),
    isPosted: parseBit(row.isPosted),
    salesType: row.salesType != null ? Number(row.salesType) : null,
    deliveryDate: row.dispatchDate ? String(row.dispatchDate) : '',
    arStatus: isOverdue ? 'Overdue' : (row.dispatchDate ? 'Due' : '—'),
    paymentStatus: String(row.paymentStatus || 'Unpaid'),
    transactionStatus: String(row.transactionStatus || 'NULL'),
    cluster: String(row.cluster ?? 'Unassigned'),
    salesmanCode: String(row.salesmanCode ?? '—'),
    supplierCode: String(row.supplierCode ?? '—'),
  };
}

export * from './ai';
export * from './arTableSort';
export * from './arFilters';
export * from './arTableRequest';
