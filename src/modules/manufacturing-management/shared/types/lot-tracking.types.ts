export type QAStatus = 'GOOD' | 'DAMAGED' | 'QUARANTINED' | 'EXPIRED';
export type LotStatus = 'ACTIVE' | 'CLOSED' | 'INACTIVE';

export interface MMLot {
  lot_id: number;
  lot_name: string;
  branch_id: number;
  unit_id?: number | null;
  max_batch_capacity: number;
  description?: string | null;
  status: LotStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number | null;
  // UI helpers
  branch_name?: string;
  branch_code?: string;
  unit_name?: string;
  current_stock_quantity?: number;
  is_bad_stock?: boolean;
  branch_is_bad_stock?: boolean;
  is_quarantine?: boolean;
}

export interface MMInventoryLot {
  inventory_lot_id: number;
  lot_id: number;
  branch_id: number;
  product_id: number;
  batch_no: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  unit_cost: number;
  qa_status: QAStatus;
  status: LotStatus;
  source_type?: string | null;
  source_reference?: string | null;
  remarks?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number | null;
  // UI helpers
  lot_name?: string;
  lot_code?: string;
  branch_name?: string;
  branch_code?: string;
  zone_id?: number | null;
  slot_id?: number | null;
  warehouse_zone?: string;
  warehouse_slot?: string;
  product_name?: string;
  product_code?: string;
  product_type?: unknown;
  product_category?: unknown;
  category_name?: string;
  unit_name?: string;
  available_quantity?: number;
}

export type ProductClassification = 'RM' | 'PKG' | 'FG' | 'OTHER';

export interface LotStoredProductSummary {
  lot_id: number;
  lot_name: string;
  total_stored_quantity: number;
  warehouse_stock_quantity?: number;
  draft_allocated_quantity?: number;
  is_draft_allocation?: boolean;
  active_batch_count: number;
  stored_products: Array<{
    product_id: number;
    product_name?: string;
    product_code?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product_type?: any;
    category_name?: string;
    classification: ProductClassification;
    classification_label: string;
    onhand_quantity: number;
    warehouse_quantity?: number;
    draft_quantity?: number;
    is_draft?: boolean;
  }>;
  primary_classification?: ProductClassification;
  primary_classification_label?: string;
  is_empty: boolean;
  is_bad_stock?: boolean;
}

export interface CreateInventoryLotPayload {
  lot_id: number;
  branch_id: number;
  product_id: number;
  batch_no: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  unit_cost?: number;
  qa_status?: QAStatus;
  status?: LotStatus;
  source_type?: string | null;
  source_reference?: string | null;
  remarks?: string | null;
  created_by?: number;
}

// ─── FEFO Stock Allocation Engine Types ─────────────────────────

export type AllocationStrategy = 'FEFO' | 'FIFO' | 'LEFO' | 'MANUAL';

export interface BatchAllocationResult {
  inventory_lot_id: number;
  lot_id: number;
  lot_name?: string;
  lot_code?: string;
  branch_name?: string;
  branch_code?: string;
  batch_no: string;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
  unit_cost: number;
  qa_status: QAStatus;
  status: LotStatus;
  available_quantity: number;
  allocated_quantity: number;
  priority_index: number;
  priority_label: string;
  days_until_expiry: number | null;
  is_expired: boolean;
  is_eligible: boolean;
  ineligibility_reason?: string;
}

export interface StockAllocationPlan {
  productId: number;
  productName?: string;
  branchId: number;
  requestedQuantity: number;
  totalAllocated: number;
  shortage: number;
  excessQuantity?: number;
  isOverAllocated?: boolean;
  isFullyAllocated: boolean;
  strategy: AllocationStrategy;
  allocations: BatchAllocationResult[];
  unallocatedBatches: BatchAllocationResult[];
  ineligibleBatches: BatchAllocationResult[];
}

export interface AllocateStockOptions {
  strategy?: AllocationStrategy;
  includeExpired?: boolean;
  includeNonGoodQA?: boolean;
  allowPartial?: boolean;
  token?: string;
}

// ─── Multi-Lot & Multi-Batch Cardinality Types ─────────────────────

export interface BatchRowAllocation {
  inventory_lot_id?: number;
  batch_no: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  quantity: number;
  unit_cost?: number;
  qa_status: QAStatus;
  is_existing?: boolean;
}

export interface LotAllocationGroup {
  lot_id: number;
  lot_name: string;
  max_batch_capacity: number;
  unit_id?: number | null;
  unit_name?: string | null;
  allocated_quantity: number;
  active_batch_count?: number;
  current_stock_quantity?: number;
  batches: BatchRowAllocation[];
}

export interface MultiLotBatchResult {
  total_quantity: number;
  lot_allocations: LotAllocationGroup[];
}


