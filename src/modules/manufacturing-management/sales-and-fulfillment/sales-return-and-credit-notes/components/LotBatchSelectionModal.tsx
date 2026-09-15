'use client';

// =============================================================================
// Sales Return Module — Multi-Lot & Multi-Batch Allocation Modal
// 1-to-1 Duplicate / Component Bridge for SR Module
// =============================================================================

export {
  LotBatchSelectionModal,
  getLotId,
  getProductId,
  type ProductClassification,
  type LotBatchSelectionResult,
  type FormSiblingAllocation,
} from '@/modules/manufacturing-management/shared/components/LotBatchSelectionModal';

export { LotBatchSelectionModal as default } from '@/modules/manufacturing-management/shared/components/LotBatchSelectionModal';
