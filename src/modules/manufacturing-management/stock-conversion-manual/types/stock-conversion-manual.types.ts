import type { LotAllocationGroup } from "@/modules/manufacturing-management/shared/types/lot-tracking.types";

export interface UnitTarget {
  unitId: number;
  name: string;
  conversionFactor?: number;
  targetProductId?: number;
}

export interface StockConversionProduct {
  productId: number;
  supplierId?: number;
  supplierName?: string;
  supplierShortcut?: string;
  brand: string;
  category: string;
  productCode: string;
  productName: string;
  productDescription: string;
  family?: string;
  conversionFactor?: number;
  currentUnit: string;
  currentUnitId: number;
  quantity: number;
  totalAmount: number;
  pricePerUnit: number;
  inventoryLoaded?: boolean;
  inventoryError?: boolean;
  availableUnits?: UnitTarget[];
}

export interface StockConversionPayload {
  productId: number;
  sourceUnitId: number;
  targetUnitId: number;
  targetProductId: number;
  quantityToConvert: number;
  convertedQuantity: number;
  branchId: number;
  userId: number;
  pricePerUnit: number;
  sourceFactor?: number;
  targetFactor?: number;
  // Multi-Lot & Multi-Batch Allocations
  sourceInventoryLotId?: number;
  sourceLotId?: number;
  sourceLotName?: string;
  sourceBatchNo?: string;
  sourceManufacturingDate?: string | null;
  sourceExpiryDate?: string | null;
  sourceAllocations?: Array<{
    inventory_lot_id?: number;
    lot_id?: number;
    batch_no?: string;
    allocated_quantity?: number;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    qa_status?: string;
    unit_cost?: number;
  }>;
  targetLotId?: number;
  targetLotName?: string;
  targetBatchNo?: string;
  targetManufacturingDate?: string | null;
  targetExpiryDate?: string | null;
  targetQaStatus?: 'GOOD' | 'DAMAGED' | 'QUARANTINED' | 'EXPIRED';
  targetAllocations?: LotAllocationGroup[];
}
