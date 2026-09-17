import type { Invoice, ARTableSort } from '../types';

export type ARTableSortKey = keyof Invoice;

/** Minimal row shape used for server and client sorting. */
export interface SortableRowBase {
  invoiceNo?: string;
  customerName?: string;
  customer?: string;
  outstandingBalance?: number;
  netReceivable?: number;
  totalPaid?: number;
  daysOverdue?: number | null;
  dispatchDate?: string | null;
  calculatedDueDate?: string | null;
  salesman?: string;
  division?: string;
  salesmanCode?: string | null;
  supplierCode?: string | null;
  invoiceDate?: string | null;
  paymentStatus?: string | null;
  transactionStatus?: string | null;
}

export type SortableRow = SortableRowBase | Invoice;

export const AR_TABLE_SORT_KEYS: ARTableSortKey[] = [
  'invoiceNo',
  'customer',
  'salesman',
  'division',
  'salesmanCode',
  'supplierCode',
  'invoiceDate',
  'deliveryDate',
  'due',
  'netReceivable',
  'totalPaid',
  'outstanding',
  'overdue',
  'arStatus',
  'paymentStatus',
  'transactionStatus',
];

const GROUP_AGGREGATE_KEYS: ARTableSortKey[] = [
  'customer',
  'netReceivable',
  'totalPaid',
  'outstanding',
  'overdue',
];

export interface SortableCustomerGroup<TInvoice extends SortableRow = SortableRow> {
  customerName: string;
  customerCode: string;
  netReceivable: number;
  totalPaid: number;
  outstanding: number;
  maxOverdue: number | null;
  invoices: TInvoice[];
}

function isInvoiceRow(row: SortableRow): row is Invoice {
  return 'outstanding' in row && !('outstandingBalance' in row);
}

function deriveArStatus(row: SortableRowBase): Invoice['arStatus'] {
  const aging = row.daysOverdue;
  const outstanding = Number(row.outstandingBalance ?? 0);
  const netReceivable = Number(row.netReceivable ?? 0);
  const totalPaid = Number(row.totalPaid ?? 0);
  const out = outstanding || Math.max(0, netReceivable - totalPaid);
  const isOverdue = aging !== null && aging !== undefined && aging >= 0 && out > 0;
  if (isOverdue) return 'Overdue';
  if (row.dispatchDate) return 'Due';
  return '—';
}

export function getSortValue(row: SortableRow, key: ARTableSortKey): string | number {
  if (isInvoiceRow(row)) {
    if (key === 'arStatus') return row.arStatus;
    const val = row[key];
    if (val == null) return '';
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val as string | number;
  }

  switch (key) {
    case 'customer':
      return row.customerName ?? row.customer ?? '';
    case 'outstanding':
      return Number(row.outstandingBalance ?? 0);
    case 'overdue':
      return row.daysOverdue ?? '';
    case 'deliveryDate':
      return row.dispatchDate ?? '';
    case 'due':
      return row.calculatedDueDate ?? '';
    case 'arStatus':
      return deriveArStatus(row as SortableRowBase);
    case 'invoiceNo':
      return row.invoiceNo ?? '';
    case 'salesman':
      return row.salesman ?? '';
    case 'division':
      return row.division ?? '';
    case 'salesmanCode':
      return row.salesmanCode ?? '';
    case 'supplierCode':
      return row.supplierCode ?? '';
    case 'invoiceDate':
      return row.invoiceDate ?? '';
    case 'netReceivable':
      return Number(row.netReceivable ?? 0);
    case 'totalPaid':
      return Number(row.totalPaid ?? 0);
    case 'paymentStatus':
      return row.paymentStatus ?? '';
    case 'transactionStatus':
      return row.transactionStatus ?? '';
    default:
      return '';
  }
}

export function compareSortValues(
  aVal: string | number,
  bVal: string | number,
  order: 'asc' | 'desc',
): number {
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    const compare = aVal.localeCompare(bVal);
    return order === 'asc' ? compare : -compare;
  }
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return order === 'asc' ? aVal - bVal : bVal - aVal;
  }
  return 0;
}

function sortInvoices<T extends SortableRow>(
  invoices: T[],
  sort: ARTableSort,
): T[] {
  if (!sort.sortKey || !sort.sortOrder) return invoices;
  const { sortKey, sortOrder } = sort;
  return [...invoices].sort((a, b) =>
    compareSortValues(getSortValue(a, sortKey), getSortValue(b, sortKey), sortOrder),
  );
}

function getGroupSortValue(group: SortableCustomerGroup, key: ARTableSortKey): string | number {
  if (key === 'customer') return group.customerName;
  if (key === 'netReceivable') return group.netReceivable;
  if (key === 'totalPaid') return group.totalPaid;
  if (key === 'outstanding') return group.outstanding;
  if (key === 'overdue') return group.maxOverdue ?? -1;
  const first = group.invoices[0];
  if (!first) return '';
  return getSortValue(first, key);
}

export function sortCustomerGroups<T extends SortableRow>(
  groups: SortableCustomerGroup<T>[],
  sort: ARTableSort,
): SortableCustomerGroup<T>[] {
  const withSortedChildren = groups.map((g) => ({
    ...g,
    invoices: sort.sortKey && sort.sortOrder ? sortInvoices(g.invoices, sort) : g.invoices,
  }));

  if (!sort.sortKey || !sort.sortOrder) {
    return [...withSortedChildren].sort((a, b) => a.customerName.localeCompare(b.customerName));
  }

  const { sortKey, sortOrder } = sort;

  return [...withSortedChildren].sort((a, b) => {
    if (GROUP_AGGREGATE_KEYS.includes(sortKey)) {
      return compareSortValues(
        getGroupSortValue(a, sortKey),
        getGroupSortValue(b, sortKey),
        sortOrder,
      );
    }
    const aChild = a.invoices[0];
    const bChild = b.invoices[0];
    if (!aChild || !bChild) return 0;
    return compareSortValues(
      getSortValue(aChild, sortKey),
      getSortValue(bChild, sortKey),
      sortOrder,
    );
  });
}

export function parseARTableSort(searchParams: URLSearchParams): ARTableSort {
  const sortKeyRaw = searchParams.get('sortKey');
  const sortOrderRaw = searchParams.get('sortOrder');
  const sortOrder = sortOrderRaw === 'asc' || sortOrderRaw === 'desc' ? sortOrderRaw : null;
  const sortKey =
    sortKeyRaw && AR_TABLE_SORT_KEYS.includes(sortKeyRaw as ARTableSortKey)
      ? (sortKeyRaw as ARTableSortKey)
      : null;
  if (!sortKey || !sortOrder) return { sortKey: null, sortOrder: null };
  return { sortKey, sortOrder };
}
