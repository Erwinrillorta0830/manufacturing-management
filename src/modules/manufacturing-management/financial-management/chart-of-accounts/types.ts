// src/modules/financial-management/chart-of-accounts/types.ts
export type DirectusListResponse<T> = {
  data: T[];
  meta?: {
    filter_count?: number;
    total_count?: number;
  };
  paging?: {
    page: number;
    pageSize: number;
  };
};

export type DirectusSingleResponse<T> = {
  data: T;
};

export type COARow = {
  coa_id: number;
  account_title: string;
  gl_code: string | null;
  account_type: number | null;
  balance_type: number | null;
  bsis_code: number | null;
  memo_type: number | null;
  description: string | null;
  added_by: number | string | null;
  date_added: string | null;

  // optional fields based on your API sample
  is_payment?: unknown;
  isPayment?: unknown;
};

export type AccountTypeRow = {
  id: number;
  account_name: string;
  description?: string | null;
};

export type BalanceTypeRow = {
  id: number;
  balance_name: string;
  description?: string | null;
};

export type BSISTypeRow = {
  id: number;
  bsis_code: string; // "BS" | "IS"
  bsis_name?: string | null;
};

export type COAListParams = {
  q: string;
  page: number;
  pageSize: number;
};

export type COACreatePayload = {
  account_title: string;
  bsis_code: number;
  account_type: number;
  balance_type: number;
  gl_code?: string | null;
  description?: string | null;

  // keep optional (Directus can auto-set)
  added_by?: number | null;
  date_added?: string | null;

  memo_type?: number | null;
};

// ✅ NEW: Extras for Edit Account (multiple inputs)
export type FindingRow = {
  id: number;
  finding_name: string;
  coa_id: number;
};

export type PaymentMethodRow = {
  method_id: number;
  method_name: string;
  description: string | null;
  isActive: number | null;
  coa_id: number;
};

export type UserRow = {
  user_id: number;
  user_fname: string;
  user_mname?: string | null;
  user_lname: string;
  user_email?: string | null;
  user_image?: string | null;

  // Aliases for more flexible mapping without any-casting
  id?: number;
  first_name?: string;
  last_name?: string;
  firstname?: string;
  lastname?: string;
};


export type COAUpdatePayload = Partial<COACreatePayload>;
