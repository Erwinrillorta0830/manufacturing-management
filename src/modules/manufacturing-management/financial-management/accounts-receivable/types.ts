// types.ts
// All TypeScript interfaces and types for the Accounts Receivable module.

export interface RawInvoiceRow {
  // ✅ Actual field names confirmed from API response
  invoiceId?: number;
  invoiceNo?: string;
  orderId?: string;
  customerName?: string;
  customerCode?: string;
  invoiceDate?: string;
  calculatedDueDate?: string;
  netReceivable?: number;
  totalPaid?: number;
  outstandingBalance?: number;
  daysOverdue?: number;
  branch?: string;
  salesman?: string;
  division?: string;
  isPosted?: number;
  grossAmount?: number;
  discountAmount?: number;
  returnAmount?: number;
  unfulfilledAmount?: number;
  appliedCreditMemos?: number;
  appliedDebitMemos?: number;
  unpostedCollectionAmount?: number;
  salesType?: number | null;       // FK → operation.id
  dispatchDate?: string | null;
  paymentStatus?: string | null;
  transactionStatus?: string | null;
  cluster?: string;
  salesmanCode?: string | null;
  supplierCode?: string | null;
  // Fallback aliases
  id?: string;
  invoice_number?: string;
  customer?: string;
  client?: string;
  branchName?: string;
  salesmanName?: string;
  [key: string]: unknown;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  orderId: string;
  customer: string;
  customerCode: string;
  invoiceDate: string;
  due: string;
  netReceivable: number;
  totalPaid: number;
  outstanding: number;
  overdue: number | null;
  branch: string;
  salesman: string;
  division: string;
  status: 'Paid' | 'Overdue' | 'Due';
  grossAmount: number;
  discountAmount: number;
  returnAmount: number;
  unfulfilledAmount: number;
  appliedCreditMemos: number;
  appliedDebitMemos: number;
  unpostedCollectionAmount: number;
  isPosted: boolean;
  salesType: number | null;          // FK → operation.id
  deliveryDate: string;
  arStatus: 'Due' | 'Overdue' | '—';
  salesmanCode: string;
  supplierCode: string;
  paymentStatus: string;
  transactionStatus: string;
  cluster: string;
}

export interface AgingBucket {
  range: string;
  amount: number;
}

export interface NamedAmount {
  name: string;
  amount: number;
}

export interface NamedValue {
  name: string;
  value: number;
}

export interface SalesmanARData {
  name: string;
  value: number;
  unposted?: number;
}

export interface ARMetrics {
  totalReceivable: number;
  totalOutstanding: number;
  totalUnposted: number;
  realOutstanding: number;
  overdueInvoices: Invoice[];
  overdueCount?: number;
  avgOverdue: number;
  unpostedAllocationsActive?: number;
  unpostedAllocationsPaid?: number;
  unpostedUnallocated?: number;
  totalPendingCancellation?: number;
}

export interface OperationBreakdown {
  id: number | null;
  name: string;
  code: string | null;
  totalOutstanding: number;
  count: number;
}

export interface ARFilterOptions {
  customers: string[];
  clusters: string[];
  salesmen: string[];
  divisions: string[];
  operations: { value: string; label: string }[];
}

export interface ARMetricsSummary {
  totalReceivable: number;
  totalOutstanding: number;
  totalUnposted: number;
  realOutstanding: number;
  avgOverdue: number;
  overdueCount: number;
  invoiceCount: number;
  totalPendingCancellation: number;
  unpostedAllocationsActive?: number;
  unpostedAllocationsPaid?: number;
  unpostedUnallocated?: number;
}

export interface ARTableFilters {
  dateFrom?: string;
  dateTo?: string;
  customer?: string;
  cluster?: string;
  salesman?: string;
  division?: string;
  operation?: string;
  agingRange?: string;
  search?: string;
}

export interface ARTableSort {
  sortKey: keyof Invoice | null;
  sortOrder: 'asc' | 'desc' | null;
}

export interface CustomerGroup {
  customerName: string;
  customerCode: string;
  netReceivable: number;
  totalPaid: number;
  outstanding: number;
  maxOverdue: number | null;
  invoices: RawInvoiceRow[];
}

export interface ARApiResponse {
  rows: RawInvoiceRow[];
  operationData: OperationBreakdown[];
  agingData?: AgingBucket[];
  salesmanData?: SalesmanARData[];
  metrics?: ARMetricsSummary;
  filterOptions?: ARFilterOptions;
  totalUnpostedPool?: number;
  unpostedAllocationsActive?: number;
  unpostedAllocationsPaid?: number;
  unpostedUnallocated?: number;
  salesmanUnposted?: Record<string, number>;
}

export interface ARSummaryResponse {
  view: 'summary';
  metrics: ARMetricsSummary;
  agingData: AgingBucket[];
  salesmanData: SalesmanARData[];
  operationData: OperationBreakdown[];
  filterOptions: ARFilterOptions;
  totalInvoices: number;
  filteredCount: number;
  totalUnpostedPool: number;
  unpostedAllocationsActive: number;
  unpostedAllocationsPaid: number;
  unpostedUnallocated: number;
  salesmanUnposted: Record<string, number>;
}

export interface ARTableResponse {
  view: 'table';
  customerGroups: CustomerGroup[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalGroups: number;
  totalInvoices: number;
  filteredCount: number;
  sortKey?: keyof Invoice | null;
  sortOrder?: 'asc' | 'desc' | null;
  truncated?: boolean;
}
