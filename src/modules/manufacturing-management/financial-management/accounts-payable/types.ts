// types.ts — All TypeScript interfaces for the Accounts Payable module.

/**
 * Top-level AP classification. Driven by the `transaction_type`
 * master data — a disbursement is "Trade" when its transaction
 * type name contains the word "trade" (case-insensitive).
 */
export type APCategory = "Trade" | "Non-Trade";

/**
 * Raw row returned by the BFF route. It mirrors the columns we
 * send from the Directus-backed `route.ts` and gives the frontend
 * everything it needs to build KPIs, charts, and the table.
 */
export interface RawAPRow {
  disbursementId?:  number;
  docNo?:           string;
  supplierName?:    string;
  transactionTypeName?: string | null;
  apCategory?:          APCategory;
  transactionDate?: string;
  dueDate?:         string;
  referenceNo?:     string | null;
  divisionName?:    string | null;
  totalPayable?:    number;
  totalPaid?:       number;
  outstandingBalance?: number;
}

export type APStatus =
  | 'Paid'
  | 'Unpaid'
  | 'Partially Paid'
  | 'Overdue'
  | 'Unpaid | Overdue'
  | 'Partially Paid | Overdue';

export interface APRecord {
  id:                 string;
  refNo:              string;
  supplier:           string;
  invoiceNo:          string;
  division:           string;
  invoiceDate:        string;
  dueDate:            string;
  amountPayable:      number;
  amountPaid:         number;
  outstandingBalance: number;
  aging:              number | null; // null = no due date, negative = future, 0 = today, positive = past due
  status:             APStatus;
  apCategory:         APCategory;
  transactionTypeName?: string | null;
}

export interface AgingBucket {
  range:  string;
  amount: number;
}

export interface SupplierEntry {
  name:  string;
  value: number;
  color: string;
}

export interface StatusEntry {
  name:  string;
  value: number;
  color: string;
}

export interface APMetrics {
  totalPayable:     number;
  totalPaid:        number;
  totalOutstanding: number;
  overdueCount:     number;
  totalRecords:     number;
}

/**
 * Side-by-side comparison block used by the Trade vs Non-Trade
 * tab headers and the top-of-page split summary.
 */
export interface APCategoryBreakdown {
  category:      APCategory;
  totalRecords:  number;
  totalPayable:  number;
  totalPaid:     number;
  totalOutstanding: number;
  overdueCount:  number;
  paidPct:       number;
}
