// src/modules/financial-management/accounting/supplier-credit-memo/types.ts

export type MemoStatus = "Available" | "Applied";

// Matches exact field names returned by Spring /items/suppliers_memo
export interface SupplierCreditMemo {
  id:               number;
  memo_number:      string;
  type:             number;
  supplier_id:      number;
  date:             string;       // "YYYY-MM-DD"
  amount:           string;       // decimal comes as string from Spring
  reason:           string | null;
  status:           string;
  chart_of_account: number;
  created_at:       string;
  updated_at:       string;
  encoder_id:       number | null;
}

export interface Supplier {
  id:                 number;
  supplier_name:      string;
  supplier_shortcut?: string | null;
}

export interface ChartOfAccount {
  coa_id:        number;
  gl_code:       string | null;
  account_title: string | null;
}

export interface CreateMemoPayload {
  supplier_id:      number;
  chart_of_account: number;
  date:             string;
  amount:           number;
  reason?:          string;
  encoder_id?:      number;
}

export interface MemoFilters {
  search:           string;
  supplier_id:      string;
  chart_of_account: string;
  status:           string;
  date_from?:       string;
  date_to?:         string;
}

// Spring wraps list responses in { data: [...] }
export interface SpringListResponse<T> {
  data: T[];
}