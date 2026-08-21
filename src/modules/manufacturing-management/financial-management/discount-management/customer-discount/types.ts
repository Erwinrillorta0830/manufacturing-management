export interface StoreType {
  id: number;
  store_type: string;
}

export interface CustomerClassification {
  id: number;
  classification_name: string;
}

export interface PaymentTerm {
  id: number;
  payment_name: string;
  payment_days: number;
}

export interface Customer {
  id: number;
  customer_code: string;
  customer_name: string;
  type: 'Regular' | 'Employee';
  store_type: number | StoreType;
  classification: number | CustomerClassification;
  payment_term: number | PaymentTerm;
  isActive: number;
}

export interface Supplier {
  id: number;
  supplier_name: string;
}

export interface Category {
  category_id: number;
  category_name: string;
}

export interface DiscountType {
  id: number;
  discount_type: string;
  total_percent: number;
}

export interface CustomerDiscount {
  id: number;
  customer_code: string;
  discount_type: number | DiscountType;
  supplier_id: number | Supplier;
  category_id: number | Category;
  created_by?: number | null;
  updated_by?: number | null;
  deleted_by?: number | null;
}

export interface CustomerDiscountModuleData {
  customers: Customer[];
  storeTypes: StoreType[];
  classifications: CustomerClassification[];
  paymentTerms: PaymentTerm[];
  suppliers: Supplier[];
  categories: Category[];
  discountTypes: DiscountType[];
}
