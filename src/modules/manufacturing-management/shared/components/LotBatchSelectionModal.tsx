'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  Boxes,
  Tag,
  Gauge,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MMLot,
  MMInventoryLot,
  QAStatus,
  LotAllocationGroup,
  BatchRowAllocation,
  LotStoredProductSummary,
} from '../types/lot-tracking.types';
import {
  fetchLotsByBranch,
  fetchInventoryLots,
  fetchBatchOnhand,
  resolveProductClassification,
  isBadStockLot,
  MMBatchOnhand,
} from '../services/lot-tracking.service';
import { SearchableSelect } from './SearchableSelect';
import { BatchCombobox } from './BatchCombobox';

// Helper to safely extract lot ID from varied models (Directus object, Spring Boot DTO, etc.)
export const getLotId = (item: unknown): number => {
  if (!item || typeof item !== 'object') return 0;
  const rec = item as Record<string, unknown>;
  if (typeof rec.lot_id === 'object' && rec.lot_id !== null) {
    const nested = rec.lot_id as Record<string, unknown>;
    return Number(nested.lot_id || nested.id || 0);
  }
  return Number(rec.lot_id || rec.mmLotId || rec.mm_lot_id || rec.lotId || 0);
};

// Helper to safely extract product ID from varied models
export const getProductId = (item: unknown): number => {
  if (!item || typeof item !== 'object') return 0;
  const rec = item as Record<string, unknown>;
  if (typeof rec.product_id === 'object' && rec.product_id !== null) {
    const nested = rec.product_id as Record<string, unknown>;
    return Number(nested.product_id || nested.id || 0);
  }
  return Number(rec.product_id || rec.productId || 0);
};

export type ProductClassification = 'RM' | 'PKG' | 'FG' | 'OTHER';

export interface LotBatchSelectionResult {
  lot_id: number;
  lot_name?: string;
  inventory_lot_id?: number;
  batch_no: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  unit_cost?: number;
  qa_status: QAStatus;
  lot_allocations?: LotAllocationGroup[];
  total_quantity?: number;
}

export interface FormSiblingAllocation {
  product_id?: number | null;
  product_name?: string | null;
  product_code?: string | null;
  product_type?: unknown;
  product_category?: unknown;
  category_name?: string | null;
  quantity?: number | null;
  lot_id?: number | null;
  lot_name?: string | null;
  lot_allocations?: LotAllocationGroup[];
  batch_no?: string | null;
  batches?: Array<{ quantity?: number | null; batch_no?: string | null; manufacturing_date?: string | null; expiry_date?: string | null; qa_status?: QAStatus | null }>;
}



interface LotBatchSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId?: number;
  productId?: number;
  productName?: string;
  productCode?: string;
  productUomId?: number | null;
  productUomName?: string;
  productType?: unknown;
  productCategory?: unknown;
  categoryName?: string;
  requestedQuantity?: number;
  adjustmentType?: 'IN' | 'OUT';
  mode?: 'SELECT_EXISTING' | 'CREATE_OR_ASSIGN';
  initialValues?: Partial<LotBatchSelectionResult>;
  initialLotAllocations?: LotAllocationGroup[];
  existingFormAllocations?: FormSiblingAllocation[];
  onConfirm: (result: LotBatchSelectionResult) => void;
}

export function LotBatchSelectionModal({
  open,
  onOpenChange,
  branchId,
  productId,
  productName,
  productCode,
  productUomId,
  productUomName = 'units',
  productType,
  productCategory,
  categoryName,
  requestedQuantity = 0,
  adjustmentType = 'IN',
  initialValues,
  initialLotAllocations,
  existingFormAllocations,
  onConfirm,
}: LotBatchSelectionModalProps) {
  const [lots, setLots] = useState<MMLot[]>([]);
  const [loading, setLoading] = useState(false);

  // Maps for tracking lot capacities and available onhand quantities across entire branch
  const [lotBatchCountMap, setLotBatchCountMap] = useState<Map<number, number>>(new Map());
  const [lotStockQtyMap, setLotStockQtyMap] = useState<Map<number, number>>(new Map());
  const [lotStoredSummaryMap, setLotStoredSummaryMap] = useState<Map<number, LotStoredProductSummary>>(new Map());

  // Raw branch on-hand batch records to track negative batch balances & deficit offsets
  const [branchOnhandList, setBranchOnhandList] = useState<MMBatchOnhand[]>([]);
  // Raw branch registered inventory lot batches
  const [branchInvLotsList, setBranchInvLotsList] = useState<MMInventoryLot[]>([]);
  // Batch metadata lookup map (for auto-resolving mfg and expiry dates by batch_no)
  const [batchMetaLookup, setBatchMetaLookup] = useState<
    Map<
      string,
      {
        mfgDate?: string;
        expDate?: string;
        qaStatus?: QAStatus;
        unitCost?: number;
        inventoryLotId?: number;
      }
    >
  >(new Map());

  // Multi-Lot Allocation Groups State
  const [lotGroups, setLotGroups] = useState<LotAllocationGroup[]>([]);

  // Toolbar Dates (stored locally until user explicitly clicks 'Apply to all')
  const [toolbarDates, setToolbarDates] = useState<Record<number, { mfg: string; exp: string }>>({});

  // Current item classification
  const currentItemClassification = useMemo(() => {
    return resolveProductClassification(productType, productCategory || categoryName, productCode, productName);
  }, [productType, productCategory, categoryName, productCode, productName]);

  // Helper to look up an existing on-hand record for a specific lot and batch number (strictly matching same product, netting across conditions)
  const getExistingBatchOnhand = useCallback(
    (lotId: number, batchNo: string) => {
      if (!lotId || !batchNo || !batchNo.trim()) return undefined;
      const cleanBatch = batchNo.trim().toLowerCase();
      const matched = branchOnhandList.filter((bo) => {
        const matchLot = getLotId(bo) === Number(lotId);
        const matchBatch = String(bo.batchNo || '').trim().toLowerCase() === cleanBatch;
        const matchProd = productId ? getProductId(bo) === Number(productId) : true;
        return matchLot && matchBatch && matchProd;
      });
      if (matched.length === 0) return undefined;

      const first = matched[0];
      const netQty = matched.reduce((sum, m) => sum + Number(m.onhandQuantity || 0), 0);
      const withExp = matched.find((m) => m.expirationDate) || first;
      const withMfg = matched.find((m) => m.manufacturingDate) || first;
      const withInv = matched.find((m) => m.inventoryLotId) || first;

      return {
        ...first,
        inventoryLotId: withInv.inventoryLotId,
        manufacturingDate: withMfg.manufacturingDate,
        expirationDate: withExp.expirationDate,
        onhandQuantity: netQty,
      };
    },
    [branchOnhandList, productId]
  );

  // Single Consolidated Reconciled Deficit Batches across all lots in this modal
  const reconciledBatches = useMemo(() => {
    const list: Array<{
      lotId: number;
      lotName: string;
      batchNo: string;
      allocatedQty: number;
      existingDeficitQty: number;
      deficitAbs: number;
      netBalance: number;
      status: 'fully_balanced' | 'partially_balanced' | 'over_balanced';
    }> = [];

    lotGroups.forEach((group) => {
      // Group by unique batch_no within the lot to prevent duplicate counting across split rows
      const batchMap = new Map<string, number>();
      (group.batches || []).forEach((b) => {
        const clean = String(b.batch_no || '').trim();
        if (!clean) return;
        const current = batchMap.get(clean) || 0;
        batchMap.set(clean, current + Number(b.quantity || 0));
      });

      batchMap.forEach((totalAllocQty, batchNo) => {
        if (totalAllocQty <= 0) return; // Only count if actually allocating quantity!
        const onhand = getExistingBatchOnhand(Number(group.lot_id), batchNo);
        if (onhand && Number(onhand.onhandQuantity) < 0) {
          const existingDeficit = Number(onhand.onhandQuantity);
          const deficitAbs = Math.abs(existingDeficit);
          const net = existingDeficit + totalAllocQty;
          const status =
            totalAllocQty === deficitAbs
              ? 'fully_balanced'
              : totalAllocQty < deficitAbs
              ? 'partially_balanced'
              : 'over_balanced';

          list.push({
            lotId: Number(group.lot_id),
            lotName: group.lot_name || `Lot #${group.lot_id}`,
            batchNo,
            allocatedQty: totalAllocQty,
            existingDeficitQty: existingDeficit,
            deficitAbs,
            netBalance: net,
            status,
          });
        }
      });
    });

    return list;
  }, [lotGroups, getExistingBatchOnhand]);

  // Strict UOM matching helper to ensure storage lot has the exact same unit as the item (or is unrestricted)
  const isLotMatchingUom = useCallback(
    (l?: MMLot | null) => {
      if (!l) return false;
      const lUomId = l.unit_id ? Number(l.unit_id) : null;
      const lUomName = l.unit_name ? String(l.unit_name).trim().toLowerCase() : null;
      const targetId = productUomId ? Number(productUomId) : null;
      const targetName = productUomName ? String(productUomName).trim().toLowerCase() : null;

      // 0. If lot has no UOM assigned (unrestricted lot), it can store any product
      if (!lUomId && !lUomName) {
        return true;
      }

      // 1. If both have numeric IDs, compare numeric IDs
      if (lUomId && targetId) {
        return lUomId === targetId;
      }
      // 2. If both have names and target name is not generic placeholder 'units', compare names
      if (lUomName && targetName && targetName !== 'units') {
        return lUomName === targetName;
      }
      // 3. Exact string match if target is named 'units' and lot is also named 'units'
      if (lUomName && targetName && lUomName === targetName) {
        return true;
      }
      // 4. If target has specific unit (by ID or named non-units) and lot does not match, reject
      if (targetId || (targetName && targetName !== 'units')) {
        return false;
      }
      return true;
    },
    [productUomId, productUomName]
  );

  // Check lot compatibility based on stored products and product types
  const checkLotCompatibility = useCallback(
    (lotId: number, currentClassification = currentItemClassification) => {
      const summary = lotStoredSummaryMap.get(Number(lotId));
      const lotStockQty = lotStockQtyMap.get(Number(lotId)) || 0;

      const isActuallyEmpty =
        !summary ||
        summary.is_empty ||
        ((summary.total_stored_quantity ?? 0) === 0 &&
          lotStockQty === 0 &&
          (summary.stored_products?.length ?? 0) === 0 &&
          (summary.active_batch_count ?? 0) === 0);

      if (isActuallyEmpty) {
        return {
          isCompatible: true,
          isEmpty: true,
          reason: 'Empty lot (0 on-hand quantity - available for all product types)',
          storedClassification: undefined,
          storedLabel: 'Empty Lot',
          storedSummary: summary,
        };
      }

      // If current item classification is OTHER (general/fallback), allow allocation
      if (currentClassification.code === 'OTHER') {
        return {
          isCompatible: true,
          isEmpty: false,
          reason: `Compatible with ${summary.primary_classification_label || 'General Stock'}`,
          storedClassification: summary.primary_classification,
          storedLabel: summary.primary_classification_label || 'General Stock',
          storedSummary: summary,
        };
      }

      // If the lot already stores ANY product with the same classification or the exact productId -> COMPATIBLE!
      const hasMatchingType =
        summary.stored_products.some(
          (p) => p.classification === currentClassification.code || (productId && p.product_id === productId)
        ) || summary.primary_classification === currentClassification.code;

      if (hasMatchingType) {
        return {
          isCompatible: true,
          isEmpty: false,
          reason: `Matching Product Type (${summary.primary_classification_label || currentClassification.label})`,
          storedClassification: currentClassification.code,
          storedLabel: summary.primary_classification_label || currentClassification.label,
          storedSummary: summary,
        };
      }

      const onlyOther = summary.stored_products.every((p) => p.classification === 'OTHER');
      if (onlyOther) {
        return {
          isCompatible: true,
          isEmpty: false,
          reason: `Compatible with General Stock`,
          storedClassification: 'OTHER',
          storedLabel: 'General Stock',
          storedSummary: summary,
        };
      }

      const conflictingNames = summary.stored_products
        .filter((p) => p.classification !== currentClassification.code && p.classification !== 'OTHER')
        .map((p) => p.product_name || p.product_code || `Product #${p.product_id}`)
        .slice(0, 3)
        .join(', ');

      return {
        isCompatible: false,
        isEmpty: false,
        reason: `Stores ${summary.primary_classification_label || 'different product type'}${conflictingNames ? ` (${conflictingNames})` : ''}`,
        storedClassification: summary.primary_classification,
        storedLabel: summary.primary_classification_label || 'Incompatible',
        conflictingNames,
        storedSummary: summary,
      };
    },
    [lotStoredSummaryMap, lotStockQtyMap, currentItemClassification, productId]
  );

  // Check if there are any active compatible storage lots available for the current product
  const hasAnyCompatibleLot = useMemo(() => {
    if (!lots || lots.length === 0) return false;
    return lots.some((l) => {
      if (l.status && l.status !== 'ACTIVE') return false;
      if (!isLotMatchingUom(l)) return false;
      const lComp = checkLotCompatibility(Number(l.lot_id));
      return lComp.isCompatible;
    });
  }, [lots, isLotMatchingUom, checkLotCompatibility]);

  // Initialize clean state and load lots whenever modal opens or product changes
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setLotGroups([]);
        setToolbarDates({});
        setBranchOnhandList([]);
      });
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [lotsData, branchInvLotsData, branchOnhandData, productInvLotsData] = await Promise.all([
          fetchLotsByBranch(branchId),
          fetchInventoryLots({ branchId }),
          fetchBatchOnhand({ branchId }),
          productId ? fetchInventoryLots({ productId }) : Promise.resolve([]),
        ]);

        if (!isMounted) return;

        setLots(lotsData || []);
        setBranchOnhandList(branchOnhandData || []);
        setBranchInvLotsList(branchInvLotsData || []);

        // Build comprehensive batch metadata lookup map (batch_no -> dates, qa_status, etc.)
        const batchMetaMap = new Map<
          string,
          {
            mfgDate?: string;
            expDate?: string;
            qaStatus?: QAStatus;
            unitCost?: number;
            inventoryLotId?: number;
          }
        >();

        const allRelevantInvLots = [...(branchInvLotsData || []), ...(productInvLotsData || [])];
        allRelevantInvLots.forEach((ib) => {
          const bNo = String(ib.batch_no || '').trim();
          if (bNo) {
            const key = bNo.toLowerCase();
            const existing = batchMetaMap.get(key);
            const mfg = ib.manufacturing_date ? String(ib.manufacturing_date).substring(0, 10) : undefined;
            const exp = ib.expiry_date ? String(ib.expiry_date).substring(0, 10) : undefined;
            const qa = (ib.qa_status as QAStatus) || undefined;
            const cost = ib.unit_cost !== undefined ? Number(ib.unit_cost) : undefined;
            const invId = ib.inventory_lot_id !== undefined ? Number(ib.inventory_lot_id) : undefined;

            batchMetaMap.set(key, {
              mfgDate: mfg || existing?.mfgDate,
              expDate: exp || existing?.expDate,
              qaStatus: qa || existing?.qaStatus,
              unitCost: cost !== undefined ? cost : existing?.unitCost,
              inventoryLotId: invId !== undefined ? invId : existing?.inventoryLotId,
            });
          }
        });

        (branchOnhandData || []).forEach((bo) => {
          const bNo = String(bo.batchNo || '').trim();
          if (bNo) {
            const key = bNo.toLowerCase();
            const existing = batchMetaMap.get(key);
            const mfg = bo.manufacturingDate ? String(bo.manufacturingDate).substring(0, 10) : undefined;
            const exp = bo.expirationDate ? String(bo.expirationDate).substring(0, 10) : undefined;
            const qa = (bo.inventoryCondition as QAStatus) || undefined;
            const invId = bo.inventoryLotId !== undefined && bo.inventoryLotId !== null ? Number(bo.inventoryLotId) : undefined;

            batchMetaMap.set(key, {
              mfgDate: mfg || existing?.mfgDate,
              expDate: exp || existing?.expDate,
              qaStatus: qa || existing?.qaStatus,
              unitCost: existing?.unitCost,
              inventoryLotId: invId !== undefined ? invId : existing?.inventoryLotId,
            });
          }
        });

        setBatchMetaLookup(batchMetaMap);

        // Count existing active batches and current stock per lot across the whole branch
        const bCountMap = new Map<number, number>();
        const sQtyMap = new Map<number, number>();

        (lotsData || []).forEach((lot) => {
          const lId = Number(lot.lot_id);
          const onhandForLot = (branchOnhandData || []).filter((bo) => getLotId(bo) === lId);
          const invLotsForLot = (branchInvLotsData || []).filter((ib) => getLotId(ib) === lId);

          bCountMap.set(lId, invLotsForLot.length);

          let lotStock = 0;
          let hasOnhandData = false;
          if (onhandForLot.length > 0) {
            lotStock = onhandForLot.reduce((sum, bo) => sum + Number(bo.onhandQuantity || 0), 0);
            hasOnhandData = true;
          }

          if (!hasOnhandData && invLotsForLot.length > 0) {
            lotStock = invLotsForLot.reduce((sum, ib) => sum + Number(ib.available_quantity || 0), 0);
          }

          sQtyMap.set(lId, lotStock);
        });

        // Also incorporate allocations already configured in the current form table for sibling products
        if (existingFormAllocations && existingFormAllocations.length > 0) {
          existingFormAllocations.forEach((sibling) => {
            if (sibling.lot_allocations && sibling.lot_allocations.length > 0) {
              sibling.lot_allocations.forEach((grp) => {
                const sLotId = Number(grp.lot_id);
                if (sLotId > 0) {
                  const batches = grp.batches || [];
                  const grpQty = batches.reduce((sum: number, b) => sum + Number(b?.quantity || 0), 0) || Number(grp.allocated_quantity || 0);
                  const grpBchCount = batches.length || 1;
                  if (grpQty > 0 || grpBchCount > 0) {
                    sQtyMap.set(sLotId, (sQtyMap.get(sLotId) || 0) + grpQty);
                    bCountMap.set(sLotId, (bCountMap.get(sLotId) || 0) + grpBchCount);
                  }
                }
              });
            } else if (sibling.lot_id && Number(sibling.lot_id) > 0) {
              const sLotId = Number(sibling.lot_id);
              const itemQty = Number(sibling.quantity || 0);
              const itemBchCount = (sibling.batches || []).length || 1;
              if (itemQty > 0 || itemBchCount > 0) {
                sQtyMap.set(sLotId, (sQtyMap.get(sLotId) || 0) + itemQty);
                bCountMap.set(sLotId, (bCountMap.get(sLotId) || 0) + itemBchCount);
              }
            }
          });
        }

        setLotBatchCountMap(bCountMap);
        setLotStockQtyMap(sQtyMap);

        // Pre-build metadata lookup map from Directus inventory lots
        const productMetaMap = new Map<number, { name?: string; code?: string; type?: unknown; cat?: unknown }>();
        (branchInvLotsData || []).forEach((ib) => {
          const pId = getProductId(ib);
          if (pId > 0) {
            const existing = productMetaMap.get(pId) || {};
            const prodObj = typeof ib.product_id === 'object' && ib.product_id !== null ? (ib.product_id as Record<string, unknown>) : null;
            if (!existing.type && (ib.product_type || prodObj?.product_type)) {
              existing.type = ib.product_type || prodObj?.product_type;
            }
            const rawCat = ib.category_name || (ib as unknown as { product_category?: unknown }).product_category || prodObj?.product_category;
            if (!existing.cat && rawCat) {
              existing.cat = typeof rawCat === 'object' && rawCat !== null ? ((rawCat as { category_name?: string }).category_name || (rawCat as { name?: string }).name) : rawCat;
            }
            if (!existing.name && (ib.product_name || prodObj?.product_name)) {
              existing.name = ib.product_name || (prodObj?.product_name as string);
            }
            if (!existing.code && (ib.product_code || prodObj?.product_code)) {
              existing.code = ib.product_code || (prodObj?.product_code as string);
            }
            productMetaMap.set(pId, existing);
          }
        });

        // Build Lot Stored Products Map for Product Type Validation
        const storedMap = new Map<number, LotStoredProductSummary>();
        (lotsData || []).forEach((lot) => {
          const lId = Number(lot.lot_id);
          const onhandForLot = (branchOnhandData || []).filter(
            (bo) => getLotId(bo) === lId
          );
          const invLotsForLot = (branchInvLotsData || []).filter((ib) => getLotId(ib) === lId);

          const productQtyMap = new Map<
            number,
            {
              qty: number;
              warehouseQty: number;
              draftQty: number;
              name?: string | null;
              code?: string | null;
              type?: unknown;
              cat?: string | null;
            }
          >();

          onhandForLot.forEach((bo) => {
            const pId = getProductId(bo);
            const addQty = Number(bo.onhandQuantity || 0);
            if (pId > 0 && Math.abs(addQty) > 0) {
              const meta = productMetaMap.get(pId);
              const existing = productQtyMap.get(pId) || {
                qty: 0,
                warehouseQty: 0,
                draftQty: 0,
                name: bo.productName || meta?.name,
                code: bo.productCode || meta?.code,
                type: bo.productTypeId || bo.productTypeName || meta?.type,
                cat: meta?.cat ? (typeof meta.cat === 'object' ? (meta.cat as { category_name?: string }).category_name : String(meta.cat)) : null,
              };
              existing.qty += addQty;
              existing.warehouseQty += addQty;
              if (!existing.name && (bo.productName || meta?.name)) existing.name = bo.productName || meta?.name;
              if (!existing.code && (bo.productCode || meta?.code)) existing.code = bo.productCode || meta?.code;
              if (!existing.type && (bo.productTypeId || bo.productTypeName || meta?.type)) {
                existing.type = bo.productTypeId || bo.productTypeName || meta?.type;
              }
              productQtyMap.set(pId, existing);
            }
          });

          invLotsForLot.forEach((ib) => {
            const pId = getProductId(ib);
            const prodObj = typeof ib.product_id === 'object' && ib.product_id !== null ? (ib.product_id as Record<string, unknown>) : null;
            const ibQty = Number(ib.available_quantity || 0);
            if (pId > 0) {
              const meta = productMetaMap.get(pId);
              const existing = productQtyMap.get(pId) || {
                qty: 0,
                warehouseQty: 0,
                draftQty: 0,
                name: ib.product_name || (prodObj?.product_name as string) || meta?.name,
                code: ib.product_code || (prodObj?.product_code as string) || meta?.code,
                type: ib.product_type || prodObj?.product_type || meta?.type,
                cat: ib.category_name || (typeof prodObj?.product_category === 'object' ? (prodObj.product_category as { category_name?: string })?.category_name : String(prodObj?.product_category || '')) || (meta?.cat ? String(meta.cat) : null),
              };
              existing.qty += ibQty;
              existing.warehouseQty += ibQty;
              if (!existing.name && (ib.product_name || prodObj?.product_name)) existing.name = ib.product_name || (prodObj?.product_name as string);
              if (!existing.code && (ib.product_code || prodObj?.product_code)) existing.code = ib.product_code || (prodObj?.product_code as string);
              if (!existing.type && (ib.product_type || prodObj?.product_type)) existing.type = ib.product_type || prodObj?.product_type;
              productQtyMap.set(pId, existing);
            }
          });

          // Include sibling items allocated to this lot in the current form session
          if (existingFormAllocations && existingFormAllocations.length > 0) {
            existingFormAllocations.forEach((sibling) => {
              const pId = Number(sibling.product_id || 0);
              if (pId <= 0) return;

              let allocatedToThisLot = 0;
              if (sibling.lot_allocations && sibling.lot_allocations.length > 0) {
                sibling.lot_allocations.forEach((grp) => {
                  if (Number(grp.lot_id) === lId) {
                    const batches = grp.batches || [];
                    allocatedToThisLot +=
                      batches.reduce((sum: number, b) => sum + Number(b?.quantity || 0), 0) ||
                      Number(grp.allocated_quantity || 0);
                  }
                });
              } else if (Number(sibling.lot_id) === lId) {
                allocatedToThisLot += Number(sibling.quantity || 0);
              }

              if (allocatedToThisLot > 0) {
                const sCat =
                  sibling.category_name ||
                  (typeof sibling.product_category === 'object'
                    ? (sibling.product_category as { category_name?: string })?.category_name
                    : String(sibling.product_category || ''));

                const existing = productQtyMap.get(pId) || {
                  qty: 0,
                  warehouseQty: 0,
                  draftQty: 0,
                  name: sibling.product_name,
                  code: sibling.product_code,
                  type: sibling.product_type,
                  cat: sCat,
                };
                existing.qty += allocatedToThisLot;
                existing.draftQty += allocatedToThisLot;
                if (!existing.name && sibling.product_name) existing.name = sibling.product_name;
                if (!existing.code && sibling.product_code) existing.code = sibling.product_code;
                if (!existing.type && sibling.product_type) existing.type = sibling.product_type;
                if (!existing.cat && sCat) existing.cat = sCat;
                productQtyMap.set(pId, existing);
              }
            });
          }

          const storedProductSummaryMap = new Map<
            string,
            {
              product_id: number;
              product_name?: string;
              product_code?: string;
              product_type?: unknown;
              category_name?: string;
              classification: ProductClassification;
              classification_label: string;
              onhand_quantity: number;
              warehouse_quantity: number;
              draft_quantity: number;
              is_draft: boolean;
            }
          >();

          let totalQty = 0;
          let totalWarehouseQty = 0;
          let totalDraftQty = 0;
          let primaryLabel = '';
          let primaryClass: ProductClassification | undefined = undefined;

          productQtyMap.forEach((info, pId) => {
            totalQty += info.qty;
            totalWarehouseQty += info.warehouseQty;
            totalDraftQty += info.draftQty;
            const c = resolveProductClassification(info.type, info.cat || undefined, info.code || undefined, info.name || undefined);
            if (!primaryLabel) {
              primaryLabel = c.label;
              primaryClass = c.code;
            }
            const key = info.code || info.name || String(pId);
            const existing = storedProductSummaryMap.get(key);
            if (existing) {
              existing.onhand_quantity += info.qty;
              existing.warehouse_quantity += info.warehouseQty;
              existing.draft_quantity += info.draftQty;
              existing.is_draft = existing.warehouse_quantity === 0 && existing.draft_quantity > 0;
            } else {
              storedProductSummaryMap.set(key, {
                product_id: pId,
                product_name: info.name || undefined,
                product_code: info.code || undefined,
                product_type: info.type,
                category_name: info.cat || undefined,
                classification: c.code,
                classification_label: c.label,
                onhand_quantity: info.qty,
                warehouse_quantity: info.warehouseQty,
                draft_quantity: info.draftQty,
                is_draft: info.warehouseQty === 0 && info.draftQty > 0,
              });
            }
          });

          const storedItems = Array.from(storedProductSummaryMap.values());
          const lotStockQty = sQtyMap.get(lId) || 0;
          const batchCount = bCountMap.get(lId) || 0;
          // Lot is NOT empty if it has physical stock OR registered batches in this lot
          const hasBatchesWithQty =
            storedItems.some((p) => Math.abs(p.onhand_quantity) > 0.000001 || Math.abs(p.draft_quantity) > 0.000001) ||
            Math.abs(lotStockQty) > 0.000001;
          const hasRegisteredBatches = batchCount > 0 || storedItems.length > 0;
          const isEmpty = !hasBatchesWithQty && !hasRegisteredBatches;
          const isDraftOnly = !isEmpty && totalWarehouseQty === 0 && totalDraftQty > 0;

          const distinctLabels = Array.from(
            new Set(storedItems.map((p) => p.classification_label).filter(Boolean))
          );
          const combinedLabel = distinctLabels.length > 0 ? distinctLabels.join(' & ') : (primaryLabel || 'General Stock');

          storedMap.set(lId, {
            lot_id: lId,
            lot_name: lot.lot_name,
            total_stored_quantity: isEmpty ? 0 : totalQty,
            warehouse_stock_quantity: isEmpty ? 0 : totalWarehouseQty,
            draft_allocated_quantity: isEmpty ? 0 : totalDraftQty,
            is_draft_allocation: isDraftOnly,
            active_batch_count: isEmpty ? 0 : batchCount,
            stored_products: storedItems,
            primary_classification: primaryClass,
            primary_classification_label: isEmpty
              ? (primaryLabel ? `Empty Lot (${primaryLabel})` : 'Empty Lot')
              : combinedLabel,
            is_empty: isEmpty,
          });
        });

        setLotStoredSummaryMap(storedMap);

        console.log("[LotBatchSelectionModal] Modal opening with initialLotAllocations:", initialLotAllocations, "initialValues:", initialValues, "productName:", productName);

        // 1. If item already has structured lot allocations, restore them cleanly
        if (initialLotAllocations && initialLotAllocations.length > 0) {
          const targetClass = resolveProductClassification(productType, productCategory || categoryName, productCode, productName);
          const preferBad = initialValues?.qa_status && initialValues.qa_status !== 'GOOD';

          const compatibleLot = (lotsData || []).find((l) => {
            if (l.status && l.status !== 'ACTIVE') return false;
            if (!isLotMatchingUom(l)) return false;
            const lotIsBad = isBadStockLot(l);
            if (preferBad && !lotIsBad) return false;
            if (!preferBad && lotIsBad) return false;
            const stored = storedMap.get(Number(l.lot_id));
            if (!stored || stored.is_empty) return true;
            if (targetClass.code === 'OTHER') return true;
            return stored.stored_products.some((p) => p.classification === targetClass.code) || stored.primary_classification === targetClass.code;
          }) || (lotsData || []).find((l) => {
            if (l.status && l.status !== 'ACTIVE') return false;
            if (!isLotMatchingUom(l)) return false;
            const lotIsBad = isBadStockLot(l);
            if (preferBad && !lotIsBad) return false;
            if (!preferBad && lotIsBad) return false;
            return true;
          }) || (lotsData || []).find((l) => {
            if (l.status && l.status !== 'ACTIVE') return false;
            if (!isLotMatchingUom(l)) return false;
            return true;
          }) || (initialValues?.lot_id ? (lotsData || []).find((l) => Number(l.lot_id) === Number(initialValues.lot_id) && isLotMatchingUom(l)) : undefined);

          const hydrated = initialLotAllocations.map((g) => {
            let matchedLot = (lotsData || []).find((l) => Number(l.lot_id) === Number(g.lot_id));
            if (matchedLot && !isLotMatchingUom(matchedLot)) {
              matchedLot = undefined;
            }
            if (!matchedLot && compatibleLot) {
              matchedLot = compatibleLot;
            }
            const lId = Number(matchedLot?.lot_id || (isLotMatchingUom({ lot_id: g.lot_id, unit_id: g.unit_id, unit_name: g.unit_name } as MMLot) ? g.lot_id : 0));
            const isLotBad = matchedLot ? isBadStockLot(matchedLot) : false;

            return {
              ...g,
              lot_id: lId,
              lot_name: matchedLot?.lot_name || g.lot_name || `Lot #${lId}`,
              max_batch_capacity: matchedLot?.max_batch_capacity || g.max_batch_capacity || 10,
              unit_id: matchedLot?.unit_id !== undefined ? matchedLot.unit_id : g.unit_id,
              unit_name: matchedLot?.unit_name || g.unit_name,
              is_bad_stock: isLotBad,
              active_batch_count: bCountMap.get(lId) || 0,
              current_stock_quantity: sQtyMap.get(lId) || 0,
              batches: (g.batches || []).map((b) => {
                const bKey = String(b.batch_no || '').trim().toLowerCase();
                const lookedUp = bKey ? batchMetaMap.get(bKey) : undefined;
                const mfg = b.manufacturing_date
                  ? String(b.manufacturing_date).substring(0, 10)
                  : (lookedUp?.mfgDate || '');
                const exp = b.expiry_date
                  ? String(b.expiry_date).substring(0, 10)
                  : (lookedUp?.expDate || '');

                return {
                  ...b,
                  inventory_lot_id: b.inventory_lot_id ?? lookedUp?.inventoryLotId,
                  unit_cost: b.unit_cost ?? lookedUp?.unitCost,
                  manufacturing_date: mfg,
                  expiry_date: exp,
                  quantity: Number(b.quantity ?? 0),
                  qa_status: (b.qa_status && b.qa_status !== 'GOOD')
                    ? b.qa_status
                    : (isLotBad ? ('EXPIRED' as QAStatus) : (b.qa_status || lookedUp?.qaStatus || 'GOOD')),
                };
              }),
            };
          });

          // Merge groups that share the same lot_id (e.g. source lots remapped to the same destination lot)
          const mergedGroupMap = new Map<number, LotAllocationGroup>();
          for (const grp of hydrated) {
            if (!mergedGroupMap.has(grp.lot_id)) {
              mergedGroupMap.set(grp.lot_id, {
                ...grp,
                allocated_quantity: 0,
                batches: [],
              });
            }
            const existing = mergedGroupMap.get(grp.lot_id)!;
            for (const b of grp.batches) {
              existing.batches.push(b);
              existing.allocated_quantity += Number(b.quantity || 0);
            }
          }

          const finalGroups = Array.from(mergedGroupMap.values());
          setLotGroups(finalGroups);

          // Populate toolbar dates from the first batch
          const firstBatch = finalGroups[0]?.batches?.[0];
          if (firstBatch?.manufacturing_date || firstBatch?.expiry_date) {
            setToolbarDates({
              0: {
                mfg: firstBatch.manufacturing_date ? String(firstBatch.manufacturing_date).substring(0, 10) : '',
                exp: firstBatch.expiry_date ? String(firstBatch.expiry_date).substring(0, 10) : '',
              },
            });
          }
          return;
        }

        // 2. If legacy initialValues provided (single lot & batch)
        if (initialValues?.lot_id && initialValues?.batch_no) {
          const lId = Number(initialValues.lot_id);
          const matchedLot = (lotsData || []).find((l) => Number(l.lot_id) === lId);
          const initialQty = (initialValues as { quantity?: number; total_quantity?: number })?.quantity ?? initialValues.total_quantity ?? 0;
          const initKey = String(initialValues.batch_no || '').trim().toLowerCase();
          const initLookedUp = initKey ? batchMetaMap.get(initKey) : undefined;
          const initMfg = initialValues.manufacturing_date
            ? String(initialValues.manufacturing_date).substring(0, 10)
            : (initLookedUp?.mfgDate || '');
          const initExp = initialValues.expiry_date
            ? String(initialValues.expiry_date).substring(0, 10)
            : (initLookedUp?.expDate || '');

          const rawBatchNo = String(initialValues.batch_no || '');
          const splitBatches = rawBatchNo.split(',').map(s => s.trim()).filter(Boolean);
          const batchCount = splitBatches.length || 1;
          const perBatchQty = Math.max(1, Math.floor(initialQty / batchCount));

          const batchesList = (splitBatches.length > 1 ? splitBatches : [rawBatchNo]).map((bName, idx) => {
            const bKey = bName.toLowerCase();
            const lookedUp = bKey ? batchMetaMap.get(bKey) : undefined;
            const isLast = idx === (splitBatches.length > 1 ? splitBatches.length - 1 : 0);
            const bQty = isLast ? Math.max(0, initialQty - perBatchQty * (batchCount - 1)) : perBatchQty;
            return {
              inventory_lot_id: initialValues.inventory_lot_id ?? lookedUp?.inventoryLotId,
              batch_no: bName,
              manufacturing_date: lookedUp?.mfgDate || initMfg,
              expiry_date: lookedUp?.expDate || initExp,
              quantity: bQty,
              unit_cost: initialValues.unit_cost ?? lookedUp?.unitCost,
              qa_status: initialValues.qa_status || lookedUp?.qaStatus || 'GOOD',
            };
          });

          setLotGroups([
            {
              lot_id: lId,
              lot_name: matchedLot?.lot_name || initialValues.lot_name || `Lot #${lId}`,
              max_batch_capacity: matchedLot?.max_batch_capacity || 10,
              unit_id: matchedLot?.unit_id ?? null,
              unit_name: matchedLot?.unit_name ?? null,
              allocated_quantity: initialQty,
              active_batch_count: bCountMap.get(lId) || 0,
              current_stock_quantity: sQtyMap.get(lId) || 0,
              batches: batchesList,
            },
          ]);
          if (initMfg || initExp) {
            setToolbarDates({
              0: {
                mfg: initMfg,
                exp: initExp,
              },
            });
          }
          return;
        }

        // 3. Fresh clean initialization for new product:
        // Prioritize finding an active, UOM-matching, and product-type compatible lot (matching bad stock preference)
        const targetClass = resolveProductClassification(productType, productCategory || categoryName, productCode, productName);
        const preferBad = initialValues?.qa_status && initialValues.qa_status !== 'GOOD';

        const compatibleLot = (lotsData || []).find((l) => {
          if (l.status && l.status !== 'ACTIVE') return false;
          if (!isLotMatchingUom(l)) return false;
          const lotIsBad = isBadStockLot(l);
          if (preferBad && !lotIsBad) return false;
          if (!preferBad && lotIsBad) return false;
          const stored = storedMap.get(Number(l.lot_id));
          if (!stored || stored.is_empty) return true;
          if (targetClass.code === 'OTHER') return true;
          return stored.stored_products.some((p) => p.classification === targetClass.code) || stored.primary_classification === targetClass.code;
        }) || (lotsData || []).find((l) => {
          if (l.status && l.status !== 'ACTIVE') return false;
          if (!isLotMatchingUom(l)) return false;
          const lotIsBad = isBadStockLot(l);
          if (preferBad && !lotIsBad) return false;
          if (!preferBad && lotIsBad) return false;
          return true;
        }) || (lotsData || []).find((l) => {
          if (l.status && l.status !== 'ACTIVE') return false;
          if (!isLotMatchingUom(l)) return false;
          return true;
        }) || (initialValues?.lot_id ? (lotsData || []).find((l) => Number(l.lot_id) === Number(initialValues.lot_id) && isLotMatchingUom(l)) : undefined);

        if (compatibleLot) {
          const lId = Number(compatibleLot.lot_id);
          const isLotBad = isBadStockLot(compatibleLot);
          const defaultQA: QAStatus = isLotBad
            ? (initialValues?.qa_status && initialValues.qa_status !== 'GOOD' ? initialValues.qa_status : 'EXPIRED')
            : (initialValues?.qa_status || 'GOOD');
          const initialQty = (initialValues as { quantity?: number; total_quantity?: number })?.quantity ?? initialValues?.total_quantity ?? (requestedQuantity || 0);
          const cleanKey = String(initialValues?.batch_no || '').trim().toLowerCase();
          const cleanLookedUp = cleanKey ? batchMetaMap.get(cleanKey) : undefined;
          const cleanMfg = initialValues?.manufacturing_date
            ? String(initialValues.manufacturing_date).substring(0, 10)
            : (cleanLookedUp?.mfgDate || '');
          const cleanExp = initialValues?.expiry_date
            ? String(initialValues.expiry_date).substring(0, 10)
            : (cleanLookedUp?.expDate || '');

          const rawBatchNo = String(initialValues?.batch_no || '');
          const splitBatches = rawBatchNo.split(',').map(s => s.trim()).filter(Boolean);
          const batchCount = splitBatches.length || 1;
          const perBatchQty = Math.max(1, Math.floor(initialQty / batchCount));

          const batchesList = (splitBatches.length > 1 ? splitBatches : [rawBatchNo]).map((bName, idx) => {
            const bKey = bName.toLowerCase();
            const lookedUp = bKey ? batchMetaMap.get(bKey) : undefined;
            const isLast = idx === (splitBatches.length > 1 ? splitBatches.length - 1 : 0);
            const bQty = isLast ? Math.max(0, initialQty - perBatchQty * (batchCount - 1)) : perBatchQty;
            return {
              inventory_lot_id: initialValues?.inventory_lot_id ?? lookedUp?.inventoryLotId,
              batch_no: bName,
              manufacturing_date: lookedUp?.mfgDate || cleanMfg,
              expiry_date: lookedUp?.expDate || cleanExp,
              quantity: bQty,
              unit_cost: initialValues?.unit_cost ?? lookedUp?.unitCost,
              qa_status: lookedUp?.qaStatus || defaultQA,
            };
          });

          setLotGroups([
            {
              lot_id: lId,
              lot_name: compatibleLot.lot_name,
              max_batch_capacity: compatibleLot.max_batch_capacity || 10,
              unit_id: compatibleLot.unit_id ?? null,
              unit_name: compatibleLot.unit_name ?? null,
              allocated_quantity: initialQty,
              active_batch_count: bCountMap.get(lId) || 0,
              current_stock_quantity: sQtyMap.get(lId) || 0,
              batches: batchesList,
            },
          ]);
          if (cleanMfg || cleanExp) {
            setToolbarDates({
              0: {
                mfg: cleanMfg,
                exp: cleanExp,
              },
            });
          }
        } else {
          setLotGroups([]);
        }
      } catch (err) {
        console.error('Failed to load lot data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [open, branchId, productId, requestedQuantity, productUomId, productType, productCategory, categoryName, productCode, productName, initialLotAllocations, initialValues, existingFormAllocations, isLotMatchingUom]);

  // Compute total allocated quantity across all lots & batches
  const totalAllocated = useMemo(() => {
    return lotGroups.reduce((lotSum, group) => {
      const batchSum = (group.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0);
      return lotSum + batchSum;
    }, 0);
  }, [lotGroups]);

  // Add a new storage lot allocation group (supports splitting across multiple lots)
  const handleAddLotGroup = () => {
    const usedLotIds = new Set(lotGroups.map((g) => Number(g.lot_id)));

    // Prioritize selecting an active, UOM-matching, and product-type compatible lot (and matching bad stock state)
    const currentIsBad = lotGroups.some((g) => (g.batches || []).some((b) => b.qa_status && b.qa_status !== 'GOOD'));

    const nextLot =
      lots.find((l) => {
        if (usedLotIds.has(Number(l.lot_id))) return false;
        if (l.status && l.status !== 'ACTIVE') return false;
        if (!isLotMatchingUom(l)) return false;
        const lotIsBad = isBadStockLot(l);
        if (currentIsBad && !lotIsBad) return false;
        if (!currentIsBad && lotIsBad) return false;
        const comp = checkLotCompatibility(Number(l.lot_id));
        return comp.isCompatible;
      }) ||
      lots.find((l) => {
        if (usedLotIds.has(Number(l.lot_id))) return false;
        if (l.status && l.status !== 'ACTIVE') return false;
        if (!isLotMatchingUom(l)) return false;
        const lotIsBad = isBadStockLot(l);
        if (currentIsBad && !lotIsBad) return false;
        if (!currentIsBad && lotIsBad) return false;
        return true;
      }) ||
      lots.find((l) => !usedLotIds.has(Number(l.lot_id)) && isLotMatchingUom(l));

    if (!nextLot) return;

    const lId = Number(nextLot.lot_id);
    const isNextLotBad = isBadStockLot(nextLot);
    const defaultQA: QAStatus = isNextLotBad ? 'DAMAGED' : 'GOOD';

    // Calculate unallocated quantity remaining for multi-lot split
    const currentAllocated = lotGroups.reduce((sum, g) => sum + (g.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0), 0);
    const targetTotal = requestedQuantity || ((initialValues as { quantity?: number; total_quantity?: number })?.quantity ?? initialValues?.total_quantity ?? 0);
    const remainingQty = targetTotal > currentAllocated ? targetTotal - currentAllocated : 0;

    // Inherit source batch info & dates from first group or initialValues
    const firstGroup = lotGroups[0];
    const sourceBatch = firstGroup?.batches?.[0];
    const defaultBatchNo = initialValues?.batch_no || sourceBatch?.batch_no || '';
    const defaultMfg = toolbarDates[0]?.mfg || sourceBatch?.manufacturing_date || (initialValues?.manufacturing_date ? String(initialValues.manufacturing_date).substring(0, 10) : '');
    const defaultExp = toolbarDates[0]?.exp || sourceBatch?.expiry_date || (initialValues?.expiry_date ? String(initialValues.expiry_date).substring(0, 10) : '');

    const newGroupIndex = lotGroups.length;
    if (defaultMfg || defaultExp) {
      setToolbarDates((prev) => ({
        ...prev,
        [newGroupIndex]: {
          mfg: defaultMfg,
          exp: defaultExp,
        },
      }));
    }

    const newGroup: LotAllocationGroup = {
      lot_id: lId,
      lot_name: nextLot.lot_name,
      max_batch_capacity: nextLot.max_batch_capacity || 10,
      unit_id: nextLot.unit_id ?? null,
      unit_name: nextLot.unit_name ?? null,
      allocated_quantity: remainingQty,
      active_batch_count: lotBatchCountMap.get(lId) || 0,
      current_stock_quantity: lotStockQtyMap.get(lId) || 0,
      batches: [
        {
          batch_no: defaultBatchNo,
          manufacturing_date: defaultMfg,
          expiry_date: defaultExp,
          quantity: remainingQty,
          qa_status: defaultQA,
        },
      ],
    };

    setLotGroups([...lotGroups, newGroup]);
  };

  // Remove a storage lot allocation group
  const handleRemoveLotGroup = (index: number) => {
    setLotGroups(lotGroups.filter((_, i) => i !== index));
  };

  // Change selected lot inside a group - PRESERVES batch numbers, dates, and quantities
  const handleChangeLot = (groupIndex: number, newLotIdStr: string) => {
    const newLotId = Number(newLotIdStr);
    const matchedLot = lots.find((l) => Number(l.lot_id) === newLotId);
    if (!matchedLot) return;

    const newLotIsBad = isBadStockLot(matchedLot);

    setLotGroups(
      lotGroups.map((g, i) => {
        if (i === groupIndex) {
          const defaultQA: QAStatus = newLotIsBad ? 'DAMAGED' : 'GOOD';
          const preservedBatches = (g.batches && g.batches.length > 0)
            ? g.batches.map((b) => ({
                ...b,
                qa_status: newLotIsBad
                  ? (b.qa_status && b.qa_status !== 'GOOD' ? b.qa_status : ('EXPIRED' as QAStatus))
                  : (b.qa_status === 'EXPIRED' ? 'GOOD' : (b.qa_status || 'GOOD')),
              }))
            : [
                {
                  batch_no: initialValues?.batch_no || '',
                  manufacturing_date: toolbarDates[groupIndex]?.mfg || (initialValues?.manufacturing_date ? String(initialValues.manufacturing_date).substring(0, 10) : ''),
                  expiry_date: toolbarDates[groupIndex]?.exp || (initialValues?.expiry_date ? String(initialValues.expiry_date).substring(0, 10) : ''),
                  quantity: g.allocated_quantity || (requestedQuantity || 0),
                  qa_status: defaultQA,
                },
              ];

          return {
            ...g,
            lot_id: newLotId,
            lot_name: matchedLot.lot_name,
            max_batch_capacity: matchedLot.max_batch_capacity || 10,
            unit_id: matchedLot.unit_id ?? null,
            unit_name: matchedLot.unit_name ?? null,
            active_batch_count: lotBatchCountMap.get(newLotId) || 0,
            current_stock_quantity: lotStockQtyMap.get(newLotId) || 0,
            batches: preservedBatches,
          };
        }
        return g;
      })
    );
  };

  // Add a new batch split under a specific lot - inherits dates automatically
  const handleAddBatch = (groupIndex: number) => {
    setLotGroups(
      lotGroups.map((g, i) => {
        if (i === groupIndex) {
          const groupLot = lots.find((l) => Number(l.lot_id) === Number(g.lot_id));
          const isLotBad = isBadStockLot(groupLot);
          const defaultQA: QAStatus = isLotBad ? 'DAMAGED' : 'GOOD';

          const prevBatch = g.batches?.[g.batches.length - 1] || g.batches?.[0];
          const defaultMfg = toolbarDates[groupIndex]?.mfg || prevBatch?.manufacturing_date || (initialValues?.manufacturing_date ? String(initialValues.manufacturing_date).substring(0, 10) : '');
          const defaultExp = toolbarDates[groupIndex]?.exp || prevBatch?.expiry_date || (initialValues?.expiry_date ? String(initialValues.expiry_date).substring(0, 10) : '');

          const newBatch: BatchRowAllocation = {
            batch_no: '',
            manufacturing_date: defaultMfg,
            expiry_date: defaultExp,
            quantity: 0,
            qa_status: defaultQA,
          };
          return {
            ...g,
            batches: [...(g.batches || []), newBatch],
          };
        }
        return g;
      })
    );
  };

  // Remove a batch split under a specific lot
  const handleRemoveBatch = (groupIndex: number, batchIndex: number) => {
    setLotGroups(
      lotGroups.map((g, i) => {
        if (i === groupIndex) {
          const updatedBatches = g.batches.filter((_, bIdx) => bIdx !== batchIndex);
          return {
            ...g,
            batches: updatedBatches,
          };
        }
        return g;
      })
    );
  };

  // Capacity-Aware Auto-Reallocate across all storage lot groups
  const handleReallocateLots = () => {
    const targetTotal =
      requestedQuantity ||
      ((initialValues as { quantity?: number; total_quantity?: number })?.quantity ??
        initialValues?.total_quantity ??
        totalAllocated ??
        0);
    if (lotGroups.length === 0 || targetTotal <= 0) return;

    // Check if any lot group has no storage lot selected
    const unselectedLotIndexes = lotGroups
      .map((g, idx) => (!g.lot_id || Number(g.lot_id) === 0 ? idx + 1 : null))
      .filter((val): val is number => val !== null);

    if (unselectedLotIndexes.length > 0) {
      toast.error(
        `Please select a storage lot / bay first for Lot #${unselectedLotIndexes.join(', #')}`
      );
      return;
    }

    // 1. Build stream of batch allocations to distribute
    const allBatches: BatchRowAllocation[] = [];
    lotGroups.forEach((g) => {
      (g.batches || []).forEach((b) => {
        if (b.quantity > 0 || (allBatches.length === 0 && b.batch_no)) {
          allBatches.push({ ...b });
        }
      });
    });

    const stream: {
      batchNo: string;
      quantity: number;
      mfgDate?: string | null;
      expDate?: string | null;
      qaStatus: QAStatus;
      unitCost?: number;
      inventoryLotId?: number;
    }[] = [];

    if (allBatches.length > 0) {
      const sumBatchQty = allBatches.reduce((s, b) => s + Number(b.quantity || 0), 0);
      let remTarget = targetTotal;
      allBatches.forEach((b, idx) => {
        if (remTarget <= 0) return;
        let splitQty = 0;
        if (idx === allBatches.length - 1) {
          splitQty = remTarget;
        } else if (sumBatchQty > 0) {
          splitQty = Math.min(remTarget, Math.round((Number(b.quantity || 0) / sumBatchQty) * targetTotal));
        } else {
          splitQty = Math.min(remTarget, Math.round(targetTotal / allBatches.length));
        }
        remTarget -= splitQty;
        stream.push({
          batchNo: b.batch_no || initialValues?.batch_no || '',
          quantity: splitQty,
          mfgDate: b.manufacturing_date || (initialValues?.manufacturing_date ? String(initialValues.manufacturing_date).substring(0, 10) : ''),
          expDate: b.expiry_date || (initialValues?.expiry_date ? String(initialValues.expiry_date).substring(0, 10) : ''),
          qaStatus: b.qa_status || 'GOOD',
          unitCost: b.unit_cost,
          inventoryLotId: b.inventory_lot_id,
        });
      });
      if (remTarget > 0 && stream.length > 0) {
        stream[stream.length - 1].quantity += remTarget;
      }
    } else {
      stream.push({
        batchNo: initialValues?.batch_no || '',
        quantity: targetTotal,
        mfgDate: initialValues?.manufacturing_date ? String(initialValues.manufacturing_date).substring(0, 10) : '',
        expDate: initialValues?.expiry_date ? String(initialValues.expiry_date).substring(0, 10) : '',
        qaStatus: (initialValues?.qa_status as QAStatus) || 'GOOD',
        unitCost: initialValues?.unit_cost,
        inventoryLotId: initialValues?.inventory_lot_id,
      });
    }

    const remainingStream = stream.map((s) => ({ ...s }));

    // 2. Distribute across lotGroups respecting each lot's available space
    const updatedGroups = lotGroups.map((g, gIdx) => {
      const isLastGroup = gIdx === lotGroups.length - 1;
      const matchedLot = lots.find((l) => Number(l.lot_id) === Number(g.lot_id));
      const maxCap = Number(matchedLot?.max_batch_capacity ?? g.max_batch_capacity ?? 0);
      const curStock = Math.max(0, Number(lotStockQtyMap.get(Number(g.lot_id)) ?? g.current_stock_quantity ?? 0));
      const availableSpace = maxCap > 0 ? Math.max(0, maxCap - curStock) : Infinity;

      let spaceForThisLot = availableSpace;
      const lotBatches: BatchRowAllocation[] = [];
      let totalLotAllocated = 0;

      const existingBatchNos = (g.batches || []).map((b) => b.batch_no);
      const isLotBad = matchedLot ? isBadStockLot(matchedLot) : false;

      while (remainingStream.length > 0 && (spaceForThisLot > 0 || isLastGroup)) {
        const currentItem = remainingStream[0];
        if (currentItem.quantity <= 0) {
          remainingStream.shift();
          continue;
        }

        const canTake = isLastGroup
          ? currentItem.quantity
          : Math.min(spaceForThisLot, currentItem.quantity);

        if (canTake <= 0) break;

        const bIdx = lotBatches.length;
        const targetQA: QAStatus = isLotBad
          ? (currentItem.qaStatus !== 'GOOD' ? currentItem.qaStatus : ('EXPIRED' as QAStatus))
          : currentItem.qaStatus;

        lotBatches.push({
          inventory_lot_id: currentItem.inventoryLotId,
          batch_no: existingBatchNos[bIdx] || currentItem.batchNo || '',
          quantity: canTake,
          manufacturing_date: currentItem.mfgDate || '',
          expiry_date: currentItem.expDate || '',
          unit_cost: currentItem.unitCost,
          qa_status: targetQA,
        });

        totalLotAllocated += canTake;
        if (spaceForThisLot !== Infinity) {
          spaceForThisLot -= canTake;
        }
        currentItem.quantity -= canTake;

        if (currentItem.quantity <= 0) {
          remainingStream.shift();
        }
      }

      if (lotBatches.length === 0) {
        const fallbackQA: QAStatus = isLotBad ? 'DAMAGED' : 'GOOD';
        lotBatches.push({
          batch_no: existingBatchNos[0] || initialValues?.batch_no || '',
          quantity: 0,
          manufacturing_date: toolbarDates[gIdx]?.mfg || (initialValues?.manufacturing_date ? String(initialValues.manufacturing_date).substring(0, 10) : ''),
          expiry_date: toolbarDates[gIdx]?.exp || (initialValues?.expiry_date ? String(initialValues.expiry_date).substring(0, 10) : ''),
          qa_status: fallbackQA,
        });
      }

      return {
        ...g,
        lot_name: matchedLot?.lot_name || g.lot_name,
        max_batch_capacity: maxCap,
        current_stock_quantity: curStock,
        allocated_quantity: totalLotAllocated,
        batches: lotBatches,
      };
    });

    setLotGroups(updatedGroups);

    const hasOverage = updatedGroups.some((g) => {
      const matchedLot = lots.find((l) => Number(l.lot_id) === Number(g.lot_id));
      const cap = Number(matchedLot?.max_batch_capacity ?? g.max_batch_capacity ?? 0);
      const cur = Math.max(0, Number(lotStockQtyMap.get(Number(g.lot_id)) ?? g.current_stock_quantity ?? 0));
      return cap > 0 && (cur + g.allocated_quantity) > cap;
    });

    if (hasOverage) {
      toast.info('Reallocated across lots. Some bays remain over capacity; consider assigning another storage lot.');
    } else {
      toast.success('Successfully reallocated across storage lots within capacity limits!');
    }
  };

  // Update a batch field
  const handleUpdateBatchField = (
    groupIndex: number,
    batchIndex: number,
    field: keyof BatchRowAllocation,
    value: unknown
  ) => {
    setLotGroups(
      lotGroups.map((g, i) => {
        if (i === groupIndex) {
          const updatedBatches = g.batches.map((b, bIdx) => {
            if (bIdx === batchIndex) {
              const updated = { ...b, [field]: value };
              if (field === 'batch_no' && typeof value === 'string' && value.trim()) {
                const bKey = value.trim().toLowerCase();
                const lookedUp = batchMetaLookup.get(bKey);
                if (lookedUp) {
                  if (!updated.manufacturing_date && lookedUp.mfgDate) {
                    updated.manufacturing_date = lookedUp.mfgDate;
                  }
                  if (!updated.expiry_date && lookedUp.expDate) {
                    updated.expiry_date = lookedUp.expDate;
                  }
                  if (!updated.inventory_lot_id && lookedUp.inventoryLotId) {
                    updated.inventory_lot_id = lookedUp.inventoryLotId;
                  }
                  if (lookedUp.unitCost !== undefined && updated.unit_cost === undefined) {
                    updated.unit_cost = lookedUp.unitCost;
                  }
                }
              }
              return updated;
            }
            return b;
          });
          return { ...g, batches: updatedBatches };
        }
        return g;
      })
    );
  };

  // Select batch from combobox with optional metadata (dates, QA status)
  const handleSelectBatchWithMeta = (
    groupIndex: number,
    batchIndex: number,
    batchNo: string,
    meta?: {
      inventoryLotId?: number;
      mfgDate?: string | null;
      expDate?: string | null;
      qaStatus?: QAStatus;
      onhandQuantity?: number;
    }
  ) => {
    setLotGroups(
      lotGroups.map((g, i) => {
        if (i === groupIndex) {
          const groupLot = lots.find((l) => Number(l.lot_id) === Number(g.lot_id));
          const isLotBad = isBadStockLot(groupLot);

          const cleanBatch = batchNo.trim().toLowerCase();
          const lookedUp = cleanBatch ? batchMetaLookup.get(cleanBatch) : undefined;

          // If inventoryLotId is not in meta, check lookup or branchOnhandList for this lot and batchNo
          let resolvedInvLotId = meta?.inventoryLotId || lookedUp?.inventoryLotId;
          if (resolvedInvLotId === undefined && cleanBatch) {
            const matchedOnhand =
              branchOnhandList.find(
                (bo) =>
                  Number(bo.mmLotId) === Number(g.lot_id) &&
                  String(bo.batchNo || '').trim().toLowerCase() === cleanBatch
              ) ||
              branchOnhandList.find(
                (bo) => String(bo.batchNo || '').trim().toLowerCase() === cleanBatch
              );
            if (matchedOnhand?.inventoryLotId) {
              resolvedInvLotId = Number(matchedOnhand.inventoryLotId);
            }
          }

          const resolvedMfg = meta?.mfgDate || lookedUp?.mfgDate;
          const resolvedExp = meta?.expDate || lookedUp?.expDate;
          const resolvedQA = meta?.qaStatus || lookedUp?.qaStatus;
          const resolvedCost = lookedUp?.unitCost;

          const updatedBatches = g.batches.map((b, bIdx) => {
            if (bIdx === batchIndex) {
              const targetQA: QAStatus = isLotBad
                ? (resolvedQA && resolvedQA !== 'GOOD' ? resolvedQA : 'DAMAGED')
                : (resolvedQA || 'GOOD');

              return {
                ...b,
                batch_no: batchNo,
                inventory_lot_id: resolvedInvLotId || b.inventory_lot_id,
                unit_cost: resolvedCost !== undefined ? resolvedCost : b.unit_cost,
                ...(resolvedMfg ? { manufacturing_date: resolvedMfg } : {}),
                ...(resolvedExp ? { expiry_date: resolvedExp } : {}),
                qa_status: targetQA,
              };
            }
            return b;
          });
          return { ...g, batches: updatedBatches };
        }
        return g;
      })
    );
  };

  // Atomically Apply Mfg Date and Expiry Date to all batches across this lot group
  const handleApplyDatesToAll = (groupIndex: number, mfgDate?: string, expDate?: string) => {
    setLotGroups((prevGroups) =>
      prevGroups.map((g, i) => {
        if (i === groupIndex) {
          return {
            ...g,
            batches: (g.batches || []).map((b) => ({
              ...b,
              ...(mfgDate ? { manufacturing_date: mfgDate } : {}),
              ...(expDate ? { expiry_date: expDate } : {}),
            })),
          };
        }
        return g;
      })
    );
  };

  // Comprehensive Validation for Current Quantity, Allocating Quantity, Capacities, UOM, and Product Type
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (lotGroups.length === 0) {
      errors.push('At least one storage lot must be assigned.');
      return errors;
    }

    // 1. Total Allocating Quantity Check (Must be greater than 0)
    if (totalAllocated <= 0) {
      errors.push('Total allocating quantity must be greater than 0.');
    }

    lotGroups.forEach((g, gIdx) => {
      // 2. Product Type Compatibility Check
      const comp = checkLotCompatibility(Number(g.lot_id));
      if (!comp.isCompatible) {
        const storedInfo = lotStoredSummaryMap.get(Number(g.lot_id));
        const storedLabel = storedInfo?.primary_classification_label || 'different';
        const sourceNote = storedInfo?.is_draft_allocation ? ' in current draft' : ' in warehouse';

        errors.push(
          `Lot #${gIdx + 1} (${g.lot_name}): Product Type Conflict (${storedLabel}${sourceNote}, allocating ${currentItemClassification.label}).`
        );
      }

      // 3. UOM Integrity Check
      const lotObj = lots.find((l) => Number(l.lot_id) === Number(g.lot_id));
      if (!isLotMatchingUom(lotObj || ({ lot_id: g.lot_id, unit_id: g.unit_id, unit_name: g.unit_name } as MMLot))) {
        errors.push(
          `Lot #${gIdx + 1} (${g.lot_name}): UOM Mismatch! Lot requires UOM #${g.unit_id}${
            g.unit_name ? ` (${g.unit_name})` : ''
          }, but product is ${productUomName}.`
        );
      }

      // 3.5 Bad Stock vs Standard Storage Lot Check
      const lotIsBad = isBadStockLot(lotObj);

      (g.batches || []).forEach((b, bIdx) => {
        const batchIsBad = b.qa_status && b.qa_status !== 'GOOD';
        if (batchIsBad && !lotIsBad) {
          errors.push(
            `Lot #${gIdx + 1} (${g.lot_name}), Batch #${bIdx + 1} (${b.batch_no || 'Unassigned'}): Bad stock (${b.qa_status}) shouldn't be allocated here! Standard storage lots cannot store damaged/quarantine stock. Please allocate to a Bad Stock or Quarantine lot.`
          );
        } else if (!batchIsBad && lotIsBad) {
          errors.push(
            `Lot #${gIdx + 1} (${g.lot_name}), Batch #${bIdx + 1} (${b.batch_no || 'Unassigned'}): GOOD stock shouldn't be allocated here! Bad Stock / Quarantine storage lots only accept damaged or quarantined stock.`
          );
        }
      });

      // 4. Current Quantity vs Allocating Quantity vs Max Capacity Check
      const currentStockQty = g.current_stock_quantity || 0;
      const allocatingQty = (g.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0);
      const projectedTotalStock = currentStockQty + allocatingQty;
      const maxCap = g.max_batch_capacity || 0;
      const availableSpace = Math.max(0, maxCap - currentStockQty);

      if (maxCap > 0) {
        if (currentStockQty >= maxCap && allocatingQty > 0) {
          errors.push(
            `Lot #${gIdx + 1} (${g.lot_name}): Lot is already FULL at capacity (${currentStockQty.toLocaleString()} / ${maxCap.toLocaleString()} ${productUomName}). No additional quantity can be allocated to this lot.`
          );
        } else if (projectedTotalStock > maxCap) {
          const overage = projectedTotalStock - maxCap;
          errors.push(
            `Lot #${gIdx + 1} (${g.lot_name}): Allocating ${allocatingQty.toLocaleString()} ${productUomName} exceeds available capacity! Current stock is ${currentStockQty.toLocaleString()} ${productUomName}, Max capacity is ${maxCap.toLocaleString()} ${productUomName}, so only ${availableSpace.toLocaleString()} ${productUomName} space remains (exceeded by ${overage.toLocaleString()} ${productUomName}).`
          );
        }
      }

      // 5. Stock OUT Validation: Cannot deduct more than available in lot
      if (adjustmentType === 'OUT' && allocatingQty > currentStockQty) {
        errors.push(
          `Lot #${gIdx + 1} (${g.lot_name}): Cannot deduct ${allocatingQty.toLocaleString()} ${productUomName} for Stock OUT. Only ${currentStockQty.toLocaleString()} ${productUomName} currently available in this lot.`
        );
      }

      // 6. Batch Row Level Validations
      if (!g.batches || g.batches.length === 0) {
        errors.push(`Lot #${gIdx + 1} (${g.lot_name}): Must contain at least 1 batch split.`);
      } else {
        const seenBatchesInGroup = new Set<string>();
        g.batches.forEach((b, bIdx) => {
          const bQty = Number(b.quantity || 0);
          const cleanBatchNo = String(b.batch_no || '').trim().toLowerCase();
          if (!b.batch_no || cleanBatchNo === '') {
            errors.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Batch number is required.`);
          } else if (seenBatchesInGroup.has(cleanBatchNo)) {
            errors.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Batch "${b.batch_no}" is already selected in another row in this lot. Each batch row must be unique.`);
          } else {
            seenBatchesInGroup.add(cleanBatchNo);
          }
          if (bQty <= 0) {
            errors.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Quantity must be greater than 0.`);
          }
          if (!b.manufacturing_date) {
            errors.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Manufacturing date is required.`);
          }
          if (!b.expiry_date) {
            errors.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Expiration date is required.`);
          }
          if (b.manufacturing_date && b.expiry_date) {
            const mTime = new Date(b.manufacturing_date).getTime();
            const eTime = new Date(b.expiry_date).getTime();
            if (!isNaN(mTime) && !isNaN(eTime) && eTime < mTime) {
              errors.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Expiration Date cannot be earlier than Manufacturing Date.`);
            }
          }
        });
      }
    });

    return errors;
  }, [lotGroups, totalAllocated, productUomName, adjustmentType, checkLotCompatibility, lotStoredSummaryMap, currentItemClassification, lots, isLotMatchingUom]);

  const isValid = validationErrors.length === 0;

  const handleConfirm = () => {
    if (!isValid || lotGroups.length === 0) return;

    const firstGroup = lotGroups[0];
    const firstBatch = firstGroup.batches[0];

    const result: LotBatchSelectionResult = {
      lot_id: firstGroup.lot_id,
      lot_name: firstGroup.lot_name,
      inventory_lot_id: firstBatch?.inventory_lot_id,
      batch_no: firstBatch?.batch_no || '',
      manufacturing_date: firstBatch?.manufacturing_date || null,
      expiry_date: firstBatch?.expiry_date || null,
      unit_cost: firstBatch?.unit_cost,
      qa_status: firstBatch?.qa_status || 'GOOD',
      lot_allocations: lotGroups,
      total_quantity: totalAllocated,
    };

    onConfirm(result);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-6xl !w-[96vw] h-[92vh] max-h-[920px] p-0 flex flex-col bg-background shadow-2xl border-border overflow-hidden">
        {/* HEADER */}
        <DialogHeader className="p-5 border-b border-border bg-card shrink-0 flex flex-row items-center justify-between">
          
          <div className="space-y-1">
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" />
              Multi-Lot & Multi-Batch Allocation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>PRODUCT: <strong className="text-foreground">{productName || 'Selected Item'}</strong></span>
              {productCode && <Badge variant="outline" className="text-[10px] font-mono">{productCode}</Badge>}
              <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                UOM: {productUomName}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/40">
                Type: {currentItemClassification.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/40">
                Mode: Stock {adjustmentType}
              </Badge>
            </DialogDescription>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Target Quantity</div>
              <div className="text-base font-mono font-black text-primary">
                {(requestedQuantity !== undefined && requestedQuantity !== null ? requestedQuantity : totalAllocated).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{productUomName}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/5">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Loading storage lots, on-hand balances & capacity metrics...</p>
            </div>
          ) : (
            <>
              {/* UNIFIED ALLOCATION & RECONCILIATION SUMMARY TRACKER */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                  totalAllocated > 0
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-base shrink-0 ${
                      totalAllocated > 0 ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                    }`}
                  >
                    {totalAllocated > 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider flex items-center gap-2 flex-wrap">
                      <span>{totalAllocated > 0 ? 'Quantity Balanced & Ready' : 'No Quantity Allocated'}</span>
                      {totalAllocated > 0 && reconciledBatches.length > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30 font-bold gap-1 py-0">
                       
                          <span>{reconciledBatches.length} Deficit Reconciled</span>
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs opacity-90 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>
                        Total Allocating: <strong className="font-mono font-black">{totalAllocated.toLocaleString()}</strong> {productUomName} across {lotGroups.length} lot(s).
                      </span>
                      {totalAllocated > 0 && reconciledBatches.length === 1 && (
                        <span className="text-sky-800 dark:text-sky-300 font-medium">
                          (Offsets {reconciledBatches[0].existingDeficitQty} deficit on &ldquo;{reconciledBatches[0].batchNo}&rdquo; to net {reconciledBatches[0].netBalance})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {lotGroups.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleReallocateLots}
                      className="h-8 text-xs font-bold gap-1.5 shrink-0 bg-background border-border shadow-xs hover:bg-muted cursor-pointer text-foreground"
                      title="Reallocate target quantity across lots according to each lot's capacity"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-primary" />
                      Reallocate across Lots
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddLotGroup}
                    className="h-8 text-xs font-bold gap-1.5 shrink-0 bg-background border-border shadow-xs hover:bg-muted cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Assign Another Lot
                  </Button>
                </div>
              </div>

              {/* NO QUALIFIED STORAGE LOTS BANNER */}
              {!hasAnyCompatibleLot && lots.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-300">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      No active storage lots match <strong>{currentItemClassification.label}</strong> with UOM <strong>{productUomName}</strong>. You can register a new storage lot in the Lot Registry.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/mm/inventory-warehousing/lot-registry', '_blank')}
                    className="shrink-0 h-7 gap-1 text-xs font-bold bg-background border-amber-500/40 hover:bg-amber-500/10 text-amber-900 dark:text-amber-200"
                  >
                    <span>Lot Registry</span>
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* LOT ALLOCATION GROUPS */}
              {lotGroups.map((group, gIdx) => {
                const groupLot = lots.find((l) => Number(l.lot_id) === Number(group.lot_id));
                const lotUomId = groupLot?.unit_id ?? group.unit_id;
                const lotUomName = groupLot?.unit_name ?? group.unit_name;
                const isUomMatch = isLotMatchingUom(groupLot || (group.lot_id ? { lot_id: group.lot_id, unit_id: group.unit_id, unit_name: group.unit_name } as MMLot : null));
                const isUomNull = lotUomId === null || lotUomId === undefined;

                // Product type compatibility analysis
                const groupStoredSummary = lotStoredSummaryMap.get(Number(group.lot_id));
                const groupComp = checkLotCompatibility(Number(group.lot_id));
                const isTypeMatch = groupComp.isCompatible;

                // Negative batch deficit calculations for this lot group
                // Deduplicate by unique batch number to prevent deficit multiplication across split rows
                const groupBatchMap = new Map<string, { deficit: number; allocated: number }>();
                (group.batches || []).forEach((b) => {
                  const bNo = String(b.batch_no || '').trim();
                  if (!bNo) return;
                  const onhand = getExistingBatchOnhand(Number(group.lot_id), bNo);
                  if (onhand && Number(onhand.onhandQuantity) < 0) {
                    const existingDeficit = Number(onhand.onhandQuantity);
                    const prev = groupBatchMap.get(bNo.toLowerCase()) || { deficit: existingDeficit, allocated: 0 };
                    groupBatchMap.set(bNo.toLowerCase(), {
                      deficit: existingDeficit,
                      allocated: prev.allocated + Number(b.quantity || 0),
                    });
                  }
                });

                const groupDeficits = Array.from(groupBatchMap.values()).map((val) => ({
                  deficit: val.deficit,
                  allocated: val.allocated,
                  net: val.deficit + val.allocated,
                }));

                const groupQtyTotal = (group.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0);
                const hasDeficitBatchesSelected = groupDeficits.length > 0;
                const lotTotalDeficit = groupDeficits.reduce((sum, d) => sum + d.deficit, 0); // e.g. -23
                const absDeficit = Math.abs(lotTotalDeficit); // 23
                const offsettingDeficitQty = Math.min(absDeficit, groupQtyTotal); // 23
                const remainingDeficitQty = Math.max(0, absDeficit - groupQtyTotal); // 0
                const netNewStockQty = Math.max(0, groupQtyTotal - absDeficit); // 0
                const lotNetDeficit = lotTotalDeficit + groupQtyTotal;
                // Only consider active reconciliation if allocating quantity > 0 and deficit exists
                const lotHasDeficitReconciliation = hasDeficitBatchesSelected && absDeficit > 0 && groupQtyTotal > 0;

                // Live Quantity-Based Capacity calculation metrics
                const activeBatchCount = group.active_batch_count || 0;
                const currentStockQty = group.current_stock_quantity || 0;
                const newBatchesInModal = group.batches.length;
                // Projected total stock reflects true physical occupancy (accounts for deficit offset)
                const projectedTotalStock = currentStockQty + netNewStockQty;
                const maxCap = group.max_batch_capacity || 0;

                const isGroupBadStock = isBadStockLot(groupLot);
                const hasBadStockConflict = isGroupBadStock
                  ? (group.batches || []).some((b) => b.qa_status === 'GOOD')
                  : (group.batches || []).some((b) => b.qa_status && b.qa_status !== 'GOOD');

                const availableSpace = maxCap > 0 ? Math.max(0, maxCap - projectedTotalStock) : 0;
                const isCapacityExceeded = maxCap > 0 && projectedTotalStock > maxCap;
                const isNearCapacity = maxCap > 0 && projectedTotalStock >= maxCap * 0.8 && !isCapacityExceeded;

                const currentStockPct = maxCap > 0 ? Math.min(100, Math.max(0, Math.round((currentStockQty / maxCap) * 100))) : 0;
                const allocatingPct = maxCap > 0 ? Math.min(100, Math.max(0, Math.round((groupQtyTotal / maxCap) * 100))) : 0;
                const netAddedPct = maxCap > 0 ? Math.min(100 - currentStockPct, Math.max(0, Math.round((netNewStockQty / maxCap) * 100))) : 0;
                const projectedUtilizationPct = maxCap > 0 ? Math.min(100, Math.max(0, Math.round((projectedTotalStock / maxCap) * 100))) : 0;

                // Deficit offset percentage for the negative zone (0 to 100%)
                const deficitOffsetPct = absDeficit > 0 ? Math.min(100, Math.round((offsettingDeficitQty / absDeficit) * 100)) : 0;

                // Proportional Deficit Zone width scaled directly to the selected batch deficit quantity
                const rawDeficitZonePct = maxCap > 0 ? (absDeficit / maxCap) * 100 : 5;
                // Scale directly with deficit quantity (min 1.5% for tiny deficits, max 40%)
                const deficitZonePct = Math.min(40, Math.max(1.5, Number(rawDeficitZonePct.toFixed(2))));
                const positiveZonePct = Number((100 - deficitZonePct).toFixed(2));

                return (
                  <div
                    key={`lot-group-${gIdx}`}
                    className={`bg-card rounded-2xl border transition-all shadow-sm ${hasBadStockConflict
                      ? 'border-red-600 dark:border-red-700 ring-2 ring-red-500/30'
                      : !isTypeMatch
                        ? 'border-red-500 dark:border-red-800 ring-1 ring-red-500/20'
                        : !isUomMatch
                          ? 'border-rose-400 dark:border-rose-800'
                          : isCapacityExceeded
                            ? 'border-red-500 dark:border-red-700 ring-1 ring-red-500/20'
                            : isNearCapacity
                              ? 'border-amber-400 dark:border-amber-700'
                              : 'border-border'
                      }`}
                  >
                    {/* LOT HEADER & CONTROLS */}
                    <div className="p-4 border-b border-border bg-muted/20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 rounded-t-2xl">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 w-full lg:w-auto">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-md bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0">
                            #{gIdx + 1}
                          </span>
                          <div className="w-80">
                            {(() => {
                              const groupIsBad = (group.batches || []).some((b) => b.qa_status && b.qa_status !== 'GOOD');
                              const optionsLots = lots.filter((l) => {
                                if (l.status && l.status !== 'ACTIVE') return false;
                                if (!isLotMatchingUom(l)) return false;
                                const lotIsBad = isBadStockLot(l);
                                if (groupIsBad && !lotIsBad) return false;
                                if (!groupIsBad && lotIsBad) return false;
                                return true;
                              });

                              return (
                                <>
                                  <SearchableSelect
                                    options={optionsLots.map((l) => {
                                      const lComp = checkLotCompatibility(Number(l.lot_id));
                                      const lStored = lotStoredSummaryMap.get(Number(l.lot_id));
                                      const lotIsBad = isBadStockLot(l);
                                      const lStockQty = lotStockQtyMap.get(Number(l.lot_id)) || 0;
                                      const isLotEmpty = !lStored || lStored.is_empty || ((lStored.total_stored_quantity ?? 0) === 0 && lStockQty === 0 && (lStored.stored_products?.length ?? 0) === 0 && (lStored.active_batch_count ?? 0) === 0);

                                      const isMultipleStored = Boolean(
                                        lStored?.primary_classification_label?.includes('&') ||
                                        (lStored?.stored_products && lStored.stored_products.length > 1)
                                      );

                                      let tag = '';
                                      let tagClassName = '';

                                      if (!lComp.isCompatible) {
                                        tag = lStored?.is_draft_allocation
                                          ? `[Type Mismatch: Form Draft (${lComp.storedLabel})]`
                                          : `[Type Mismatch: Warehouse (${lComp.storedLabel})]`;
                                        tagClassName = 'text-rose-600 dark:text-rose-400 font-semibold';
                                      } else if (lotIsBad) {
                                        tag = '[Bad Stock / Quarantine]';
                                        tagClassName = 'text-amber-600 dark:text-amber-400 font-semibold';
                                      } else if (!isLotEmpty && isMultipleStored) {
                                        tag = lStored?.is_draft_allocation
                                          ? `[Compatible: Form Draft (${lStored.primary_classification_label})]`
                                          : `[Compatible: ${lStored?.primary_classification_label || 'Mixed Stock'}]`;
                                        tagClassName = 'text-sky-600 dark:text-sky-400 font-semibold';
                                      } else if (!isLotEmpty && lStored && lStored.primary_classification_label && lStored.primary_classification_label !== 'Empty Lot') {
                                        tag = lStored.is_draft_allocation
                                          ? `[Compatible: Form Draft (${lStored.primary_classification_label})]`
                                          : `[Compatible: ${lStored.primary_classification_label}]`;
                                        tagClassName = 'text-emerald-600 dark:text-emerald-400 font-semibold';
                                      } else {
                                        tag = '[Empty Lot]';
                                        tagClassName = 'text-emerald-600 dark:text-emerald-400 font-semibold';
                                      }

                                      const lotCapStr = l.max_batch_capacity ? ` (Cap: ${l.max_batch_capacity.toLocaleString()} ${l.unit_name || productUomName})` : '';
                                      return {
                                        value: String(l.lot_id),
                                        label: `${l.lot_name}${lotCapStr}`,
                                        title: `${l.lot_name}${lotCapStr}${tag ? ` ${tag}` : ''}`,
                                        tag,
                                        tagClassName,
                                      };
                                    })}
                                    value={String(group.lot_id)}
                                    onValueChange={(val) => handleChangeLot(gIdx, val)}
                                    placeholder="Select Storage Lot / Bay..."
                                    searchPlaceholder="Search lot name..."
                                    triggerTitle={groupLot ? `${groupLot.lot_name}${groupLot.max_batch_capacity ? ` (Cap: ${groupLot.max_batch_capacity.toLocaleString()} ${groupLot.unit_name || productUomName})` : ''}` : undefined}
                                    popoverClassName="w-[540px] max-w-[90vw]"
                                    emptyMessage={
                                      <div className="py-4 px-2 flex flex-col items-center justify-center gap-2 text-center">
                                        <p className="text-xs text-muted-foreground">
                                          No qualified storage lots found for this UOM and product type.
                                        </p>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => window.open('/mm/inventory-warehousing/lot-registry', '_blank')}
                                          className="h-7 text-[11px] gap-1 font-semibold"
                                        >
                                          <span>Go to Lot Registry</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    }
                                    className="h-9 text-xs font-bold"
                                  />
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* UOM BADGE, PRODUCT TYPE BADGE & CAPACITY BADGE */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isUomNull ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">
                              UOM: Unrestricted
                            </Badge>
                          ) : isUomMatch ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                              UOM: {lotUomName || productUomName} (Matched)
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              UOM Mismatch: Lot is {lotUomName || `#${lotUomId}`}, Item is {productUomName}
                            </Badge>
                          )}

                          {/* PRODUCT TYPE BADGE */}
                          {groupStoredSummary?.is_empty || ((groupStoredSummary?.total_stored_quantity ?? 0) === 0 && currentStockQty === 0 && (groupStoredSummary?.stored_products?.length ?? 0) === 0 && (groupStoredSummary?.active_batch_count ?? 0) === 0) ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">
                              Type: Unassigned (Empty Lot)
                            </Badge>
                          ) : isTypeMatch ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                              Type: Matched ({groupStoredSummary?.primary_classification_label || currentItemClassification.label})
                              {groupStoredSummary?.is_draft_allocation ? ' [Form Draft]' : ''}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] flex items-center gap-1 font-bold">
                              <AlertTriangle className="w-3 h-3" />
                              {groupStoredSummary?.is_draft_allocation
                                ? `Type Mismatch: Form Draft (${groupComp.storedLabel})`
                                : `Type Mismatch: Stores ${groupComp.storedLabel}`}
                            </Badge>
                          )}

                          {/* BAD STOCK STATUS BADGE */}
                          {isGroupBadStock ? (
                            <Badge variant="outline" className={`text-[10px] font-bold flex items-center gap-1 ${
                              hasBadStockConflict
                                ? 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40 animate-pulse'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40'
                            }`}>
                              <AlertTriangle className="w-3 h-3" />
                              {hasBadStockConflict
                                ? "Bad Stock Lot: GOOD stock shouldn't be allocated here"
                                : "Bad Stock Lot (Damaged / Quarantined / Expired)"}
                            </Badge>
                          ) : hasBadStockConflict ? (
                            <Badge variant="destructive" className="text-[10px] flex items-center gap-1 font-bold animate-pulse shadow-sm">
                              <AlertTriangle className="w-3 h-3" />
                              Standard Lot: Bad stock shouldn&apos;t be allocated here
                            </Badge>
                          ) : null}

                          <Badge
                            variant={isCapacityExceeded ? 'destructive' : 'secondary'}
                            className={`text-[10px] font-mono font-bold flex items-center gap-1 ${isNearCapacity ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30' : ''
                              }`}
                          >
                            <Gauge className="w-3 h-3" />
                            {projectedTotalStock.toLocaleString()} / {maxCap > 0 ? `${maxCap.toLocaleString()} ${productUomName}` : '∞'} ({projectedUtilizationPct}%)
                          </Badge>
                        </div>
                      </div>

                      {/* LOT TOTAL & REMOVE */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 w-full lg:w-auto shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            {lotHasDeficitReconciliation ? 'Reconciling in this Lot' : 'Allocating in this Lot'}
                          </span>
                          <span className="text-sm font-mono font-black text-foreground">{groupQtyTotal.toLocaleString()} {productUomName}</span>
                        </div>

                        {lotGroups.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLotGroup(gIdx)}
                            className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                            title="Remove Lot Group"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* STORED PRODUCTS SUMMARY INFO BAR */}
                    {groupStoredSummary && !groupStoredSummary.is_empty && (
                      <div className="px-4 py-2 bg-muted/15 border-b border-border/50 text-[11px] flex flex-wrap items-center justify-between gap-2">
                        <span className="text-muted-foreground flex items-center gap-1.5 font-medium flex-wrap">
                          <span className="font-semibold text-foreground">
                            {groupStoredSummary.is_draft_allocation
                              ? 'Allocated in Current Form Draft:'
                              : groupStoredSummary.draft_allocated_quantity && groupStoredSummary.draft_allocated_quantity > 0
                                ? 'Warehouse Stock & Form Draft:'
                                : 'Stored Content:'}
                          </span>
                          <span>
                            {groupStoredSummary.stored_products
                              .slice(0, 2)
                              .map((p) => {
                                const draftTag = p.is_draft ? ' (in current draft)' : '';
                                return `${p.product_name || p.product_code || 'Product'} (${p.onhand_quantity.toLocaleString()} ${lotUomName || productUomName})${draftTag}`;
                              })
                              .join(', ')}
                            {groupStoredSummary.stored_products.length > 2
                              ? ` (+${groupStoredSummary.stored_products.length - 2} more)`
                              : ''}
                          </span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          {groupStoredSummary.is_draft_allocation && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                              Current Draft
                            </span>
                          )}
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-background border border-border/60 text-muted-foreground">
                            Storage Type: <strong className="text-foreground">{groupStoredSummary.primary_classification_label}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* LIVE 4-METRIC CAPACITY & ALLOCATION ANALYSIS PANEL */}
                    <div className="px-4 py-3 bg-muted/10 border-b border-border/60 space-y-2.5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        {/* 1. Current Quantity in Lot */}
                        <div className="p-2.5 bg-background rounded-lg border border-border/60 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">1. Current Stock in Lot</span>
                          <div className={`text-xs font-mono font-bold mt-0.5 ${currentStockQty < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                            {currentStockQty.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{productUomName}</span>
                            {currentStockQty < 0 && (
                              <span className="ml-1 text-[10px] font-semibold text-rose-500">(Deficit)</span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {groupStoredSummary?.is_draft_allocation
                              ? `(Draft Form: ${groupStoredSummary.draft_allocated_quantity?.toLocaleString()} ${productUomName})`
                              : groupStoredSummary?.draft_allocated_quantity && groupStoredSummary.draft_allocated_quantity > 0
                                ? `(${groupStoredSummary.warehouse_stock_quantity?.toLocaleString()} whse + ${groupStoredSummary.draft_allocated_quantity?.toLocaleString()} draft)`
                                : `${currentStockPct}% of max (${activeBatchCount} bch)`}
                          </span>
                        </div>

                        {/* 2. Allocating Quantity */}
                        <div className={`p-2.5 rounded-lg border shadow-2xs ${lotHasDeficitReconciliation ? 'bg-sky-500/10 border-sky-500/30' : 'bg-primary/5 border-primary/20'}`}>
                          <span className={`text-[10px] uppercase font-bold block ${lotHasDeficitReconciliation ? 'text-sky-800 dark:text-sky-300' : 'text-primary'}`}>
                            2. Allocating Now
                          </span>
                          <div className={`text-xs font-mono font-black mt-0.5 ${lotHasDeficitReconciliation ? 'text-sky-900 dark:text-sky-200' : 'text-primary'}`}>
                            {lotHasDeficitReconciliation ? (
                              <span className="flex items-center gap-1">
                                <span className="text-rose-600 dark:text-rose-400 font-bold">{lotTotalDeficit}</span>
                                <span className="text-muted-foreground">→</span>
                                <span>+{groupQtyTotal.toLocaleString()}</span>
                              </span>
                            ) : (
                              `+${groupQtyTotal.toLocaleString()}`
                            )}{' '}
                            <span className="text-[10px] font-normal text-muted-foreground">{productUomName}</span>
                          </div>
                          <span className={`text-[10px] block truncate ${lotHasDeficitReconciliation ? 'text-sky-700 dark:text-sky-300 font-medium' : 'text-primary/80'}`}>
                            {lotHasDeficitReconciliation
                              ? lotNetDeficit === 0
                                ? `Balances ${lotTotalDeficit} deficit to 0 (${newBatchesInModal} bch)`
                                : lotNetDeficit > 0
                                ? `Clears ${lotTotalDeficit} deficit (+${lotNetDeficit} new)`
                                : `Offsets ${groupQtyTotal} of ${lotTotalDeficit} deficit`
                              : hasDeficitBatchesSelected
                              ? `Selected batch has ${lotTotalDeficit} deficit (Enter quantity)`
                              : `+${allocatingPct}% of capacity (${newBatchesInModal} bch)`}
                          </span>
                        </div>

                        {/* 3. Available Space Remaining */}
                        <div className="p-2.5 bg-background rounded-lg border border-border/60 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">3. Available Space</span>
                          <div className={`text-xs font-mono font-bold mt-0.5 ${availableSpace <= 0 ? 'text-red-500 font-black' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {availableSpace.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{productUomName}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">Free room before full</span>
                        </div>

                        {/* 4. Projected Total */}
                        <div className={`p-2.5 rounded-lg border shadow-2xs ${isCapacityExceeded ? 'bg-red-500/10 border-red-500/30' : 'bg-background border-border/60'}`}>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">4. Projected Total</span>
                          <div className={`text-xs font-mono font-bold mt-0.5 ${isCapacityExceeded ? 'text-red-600 font-black' : 'text-foreground'}`}>
                            {projectedTotalStock.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">/ {maxCap.toLocaleString()}</span>
                          </div>
                          <span className={`text-[10px] ${isCapacityExceeded ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}>
                            {projectedUtilizationPct}% occupancy
                            {lotHasDeficitReconciliation && netNewStockQty === 0 && (
                              <span className="ml-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">(0% net space used)</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* BI-DIRECTIONAL ZERO-ANCHOR OR STANDARD PROGRESS BAR WITH SMOOTH MOTION */}
                      <div className="space-y-1.5">
                        <div className="w-full bg-muted/40 rounded-full h-3 overflow-hidden border border-border/60 flex items-center shadow-2xs">
                          <AnimatePresence initial={true}>
                            {hasDeficitBatchesSelected && absDeficit > 0 && (
                              /* NEGATIVE / DEFICIT ZONE (Sized proportionally to selected batch deficit quantity) */
                              <motion.div
                                key={`deficit-zone-${group.lot_id}`}
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: `${deficitZonePct}%`, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 220, damping: 24 }}
                                className="h-full bg-rose-500/10 border-r border-slate-400 dark:border-slate-600 flex items-center justify-end relative overflow-hidden shrink-0"
                                title={`Selected Batch Deficit: -${absDeficit} ${productUomName} | Offsetting: +${offsettingDeficitQty} (${deficitOffsetPct}%) | Remaining: -${remainingDeficitQty}`}
                              >
                                {/* Remaining Unresolved Deficit Bar */}
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${100 - deficitOffsetPct}%` }}
                                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                                  className="h-full bg-rose-500/25 border-r border-rose-500/40"
                                />
                                {/* Offsetting Healed Deficit Segment (Sky Blue) - only renders when actively offsetting */}
                                {deficitOffsetPct > 0 && (
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${deficitOffsetPct}%` }}
                                    transition={{ type: "spring", stiffness: 220, damping: 24 }}
                                    className="h-full bg-sky-500 flex items-center justify-center text-[9px] font-mono font-black text-white px-1 shadow-sm overflow-hidden"
                                  >
                                    {deficitOffsetPct >= 35 && `+${offsettingDeficitQty}`}
                                  </motion.div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* ZERO ORIGIN DIVIDER (Only visible if deficit exists) */}
                          {hasDeficitBatchesSelected && absDeficit > 0 && (
                            <motion.div
                              initial={{ opacity: 0, scaleY: 0 }}
                              animate={{ opacity: 1, scaleY: 1 }}
                              exit={{ opacity: 0, scaleY: 0 }}
                              transition={{ duration: 0.2 }}
                              className="w-0.5 h-full bg-slate-500 dark:bg-slate-400 shrink-0 relative z-10"
                            />
                          )}

                          {/* POSITIVE CAPACITY ZONE */}
                          <motion.div
                            initial={false}
                            animate={{ width: hasDeficitBatchesSelected && absDeficit > 0 ? `${positiveZonePct}%` : '100%' }}
                            transition={{ type: "spring", stiffness: 220, damping: 24 }}
                            className="h-full flex items-center relative overflow-hidden bg-muted/30"
                            title={`Positive Capacity: ${currentStockQty} / ${maxCap} ${productUomName} (${currentStockPct}%)`}
                          >
                            {/* Segment 1: Current Positive Stock */}
                            <motion.div
                              initial={false}
                              animate={{ width: `${Math.min(100, currentStockPct)}%` }}
                              transition={{ type: "spring", stiffness: 220, damping: 24 }}
                              className="h-full bg-slate-500/60 dark:bg-slate-400/60"
                              title={`Current Stock: ${currentStockQty} ${productUomName} (${currentStockPct}%)`}
                            />
                            {/* Segment 2: Net Allocating Stock (Only expands if netNewStockQty > 0) */}
                            <motion.div
                              initial={false}
                              animate={{ width: `${Math.min(100 - currentStockPct, hasDeficitBatchesSelected && absDeficit > 0 ? netAddedPct : allocatingPct)}%` }}
                              transition={{ type: "spring", stiffness: 220, damping: 24 }}
                              className={`h-full ${isCapacityExceeded
                                ? 'bg-red-600'
                                : isNearCapacity
                                  ? 'bg-amber-500'
                                  : 'bg-primary'
                                }`}
                              title={hasDeficitBatchesSelected && absDeficit > 0
                                ? (netNewStockQty > 0
                                  ? `Net Physical Addition: +${netNewStockQty} ${productUomName} (+${netAddedPct}%)`
                                  : '0% Net Positive Occupancy (Allocated quantity fully offsets existing deficit)')
                                : `Allocating: +${groupQtyTotal} ${productUomName} (+${allocatingPct}%)`
                              }
                            />
                          </motion.div>
                        </div>

                        {/* LEGEND & METRIC FOOTER */}
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-0.5">
                          {hasDeficitBatchesSelected && absDeficit > 0 ? (
                            <>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block shrink-0" />
                                <span>
                                  Deficit: <strong className="text-foreground">-{absDeficit} → -{remainingDeficitQty}</strong>{' '}
                                  <span className="text-sky-700 dark:text-sky-300 font-semibold">(+{offsettingDeficitQty} offset)</span>
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block shrink-0" /> Current ({currentStockQty} {productUomName})
                                </span>
                                {netNewStockQty > 0 ? (
                                  <span className="flex items-center gap-1 text-primary font-bold">
                                    <span className="w-2 h-2 rounded-full bg-primary inline-block shrink-0" /> Net Added (+{netNewStockQty} {productUomName} • {netAddedPct}%)
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    • 0% Net Occupancy Added
                                  </span>
                                )}
                              </span>
                              <span>Max: {maxCap.toLocaleString()} {productUomName}</span>
                            </>
                          ) : (
                            <>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block shrink-0" /> Current ({currentStockQty} {productUomName})
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-primary inline-block shrink-0" /> Allocating (+{groupQtyTotal} {productUomName})
                              </span>
                              <span>Max: {maxCap.toLocaleString()} {productUomName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* WARNING ALERTS */}
                    {/* {(!isTypeMatch || !isUomMatch || isCapacityExceeded || isNearCapacity) && (
                      <div className="p-2.5 mx-4 mt-3 rounded-lg text-xs space-y-1.5 bg-muted/30 border border-border">
                        {!isTypeMatch && (
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>
                              <strong>Product Type Conflict:</strong>{' '}
                              {groupStoredSummary?.is_draft_allocation ? (
                                <>
                                  This lot is allocated for <strong>{groupStoredSummary?.primary_classification_label}</strong> items in the current form draft (not yet saved to warehouse). Cannot allocate <strong>{currentItemClassification.label}</strong> items into the same lot.
                                </>
                              ) : (
                                <>
                                  This lot contains <strong>{groupStoredSummary?.primary_classification_label}</strong> warehouse stock. Cannot allocate <strong>{currentItemClassification.label}</strong> items here.
                                </>
                              )}
                            </span>
                          </div>
                        )}
                        {!isUomMatch && (
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>This lot is reserved for UOM {lotUomName || `#${lotUomId}`}. Please select a compatible lot ({productUomName}).</span>
                          </div>
                        )}
                        {(!isTypeMatch || !isUomMatch) && (
                          <div className="pt-1 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => window.open('/mm/inventory-warehousing/lot-registry', '_blank')}
                              className="h-6 px-2 text-[11px] font-bold gap-1 bg-background hover:bg-muted text-foreground border-border shadow-2xs"
                            >
                              <span>Open Lot Registry</span>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                        {isCapacityExceeded && (
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Lot capacity exceeded ({projectedTotalStock.toLocaleString()} / {maxCap.toLocaleString()} {productUomName}).</span>
                          </div>
                        )}
                        {isNearCapacity && (
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Notice: Lot will reach {projectedUtilizationPct}% capacity ({projectedTotalStock.toLocaleString()} / {maxCap.toLocaleString()} {productUomName}).</span>
                          </div>
                        )}
                      </div>
                    )} */}

                    {/* BATCHES SUB-TABLE */}
                    <div className="p-4 space-y-3">
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-2 border-b border-border/50">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 shrink-0">
                          <Tag className="w-3.5 h-3.5 text-primary" /> Batches to Allocate in this Lot
                        </span>

                        {/* Bulk Auto-fill Toolbar Outside the Input Cards */}
                        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end">
                          <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border border-border/70">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Mfg:</span>
                              <Input
                                type="date"
                                value={
                                  toolbarDates[gIdx]?.mfg ??
                                  (group.batches[0]?.manufacturing_date ? String(group.batches[0].manufacturing_date).substring(0, 10) : '')
                                }
                                onChange={(e) => {
                                  const current = toolbarDates[gIdx] || {
                                    mfg: group.batches[0]?.manufacturing_date ? String(group.batches[0].manufacturing_date).substring(0, 10) : '',
                                    exp: group.batches[0]?.expiry_date ? String(group.batches[0].expiry_date).substring(0, 10) : '',
                                  };
                                  setToolbarDates({ ...toolbarDates, [gIdx]: { ...current, mfg: e.target.value } });
                                }}
                                className="h-7 text-xs w-36 bg-background px-2 py-0"
                                title="Select manufacturing date to apply"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Exp:</span>
                              <Input
                                type="date"
                                value={
                                  toolbarDates[gIdx]?.exp ??
                                  (group.batches[0]?.expiry_date ? String(group.batches[0].expiry_date).substring(0, 10) : '')
                                }
                                onChange={(e) => {
                                  const current = toolbarDates[gIdx] || {
                                    mfg: group.batches[0]?.manufacturing_date ? String(group.batches[0].manufacturing_date).substring(0, 10) : '',
                                    exp: group.batches[0]?.expiry_date ? String(group.batches[0].expiry_date).substring(0, 10) : '',
                                  };
                                  setToolbarDates({ ...toolbarDates, [gIdx]: { ...current, exp: e.target.value } });
                                }}
                                className="h-7 text-xs w-36 bg-background px-2 py-0"
                                title="Select expiration date to apply"
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const currentMfg =
                                  toolbarDates[gIdx]?.mfg ??
                                  (group.batches[0]?.manufacturing_date ? String(group.batches[0].manufacturing_date).substring(0, 10) : '');
                                const currentExp =
                                  toolbarDates[gIdx]?.exp ??
                                  (group.batches[0]?.expiry_date ? String(group.batches[0].expiry_date).substring(0, 10) : '');

                                handleApplyDatesToAll(gIdx, currentMfg, currentExp);
                              }}
                              className="h-7 text-xs font-bold px-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 cursor-pointer"
                              title="Apply selected dates to all batches in this lot"
                            >
                              Apply to all
                            </Button>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddBatch(gIdx)}
                            className="h-8 text-xs font-bold text-primary hover:bg-primary/10 gap-1 px-3 shrink-0 border border-primary/20"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Batch Split
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {group.batches.map((batch, bIdx) => {
                          const existingOnhand = getExistingBatchOnhand(Number(group.lot_id), batch.batch_no);
                          const isDeficit = existingOnhand && Number(existingOnhand.onhandQuantity) < 0;

                          return (
                            <div
                              key={`lot-${gIdx}-batch-${bIdx}`}
                              className={`p-3.5 rounded-xl border bg-background flex flex-col md:flex-row items-stretch md:items-center gap-3.5 shadow-xs transition-all ${
                                isDeficit ? 'border-sky-500/50 dark:border-sky-500/40 ring-1 ring-sky-500/20' : 'border-border/80'
                              }`}
                            >
                              {/* Batch Number */}
                              <div
                                className="flex-1 min-w-[260px] md:min-w-[280px]"
                                title={batch.batch_no ? `Batch Number: ${batch.batch_no}` : "Select or type batch number"}
                              >
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  Batch Number *
                                </Label>
                                <BatchCombobox
                                  value={batch.batch_no}
                                  existingBatches={(() => {
                                    // 1. Batches with on-hand balances in this lot
                                    const onhandBatches = branchOnhandList.filter((bo) => {
                                      const matchLot = getLotId(bo) === Number(group.lot_id);
                                      const matchProd = productId ? getProductId(bo) === Number(productId) : true;
                                      return matchLot && matchProd && bo.batchNo;
                                    });

                                    // 2. Registered batches from mm_inventory_lots for this lot and product
                                    const invLotBatches: MMBatchOnhand[] = (branchInvLotsList || [])
                                      .filter((ib) => {
                                        const matchLot = getLotId(ib) === Number(group.lot_id);
                                        const matchProd = productId ? getProductId(ib) === Number(productId) : true;
                                        return matchLot && matchProd && ib.batch_no;
                                      })
                                      .map((ib) => ({
                                        branchId: Number(ib.branch_id || branchId || 0),
                                        inventoryLotId: Number(ib.inventory_lot_id || 0),
                                        mmLotId: Number(group.lot_id),
                                        productId: getProductId(ib),
                                        productCode: ib.product_code,
                                        productName: ib.product_name,
                                        batchNo: String(ib.batch_no),
                                        manufacturingDate: ib.manufacturing_date || null,
                                        expirationDate: ib.expiry_date || null,
                                        inventoryCondition: ib.qa_status || "GOOD",
                                        totalQuantityIn: 0,
                                        totalQuantityOut: 0,
                                        onhandQuantity: Number(ib.available_quantity || 0),
                                      }));

                                    // Aggregate on-hand balances across conditions for each unique batchNo in this lot
                                    const onhandMap = new Map<string, MMBatchOnhand>();
                                    onhandBatches.forEach((bo) => {
                                      const bKey = String(bo.batchNo || '').trim().toLowerCase();
                                      if (!bKey) return;
                                      const qty = Number(bo.onhandQuantity || 0);
                                      const existing = onhandMap.get(bKey);
                                      if (existing) {
                                        existing.onhandQuantity = (Number(existing.onhandQuantity) || 0) + qty;
                                        if (!existing.expirationDate && bo.expirationDate) existing.expirationDate = bo.expirationDate;
                                        if (!existing.manufacturingDate && bo.manufacturingDate) existing.manufacturingDate = bo.manufacturingDate;
                                        if (!existing.inventoryLotId && bo.inventoryLotId) existing.inventoryLotId = bo.inventoryLotId;
                                      } else {
                                        onhandMap.set(bKey, { ...bo, onhandQuantity: qty });
                                      }
                                    });

                                    // Merge by unique batchNo: registered Directus batches enriched with netted movement balances
                                    const batchMap = new Map<string, MMBatchOnhand>();
                                    invLotBatches.forEach((b) => {
                                      const bKey = String(b.batchNo || '').trim().toLowerCase();
                                      if (bKey) batchMap.set(bKey, { ...b });
                                    });
                                    onhandMap.forEach((b, bKey) => {
                                      batchMap.set(bKey, b);
                                    });
                                    return Array.from(batchMap.values()).filter(
                                      (b) => Number(b.onhandQuantity || 0) !== 0
                                    );
                                  })()}
                                  disabledBatchNumbers={(group.batches || [])
                                    .filter((_, idx) => idx !== bIdx)
                                    .map((b) => b.batch_no)
                                    .filter(Boolean)}
                                  productUomName={productUomName}
                                  placeholder="Search or select batch..."
                                  onSelectBatch={(selectedBatchNo, meta) => {
                                    handleSelectBatchWithMeta(gIdx, bIdx, selectedBatchNo, meta);
                                  }}
                                  title={batch.batch_no || "Search or select batch..."}
                                  className="h-9 text-xs"
                                />
                              </div>

                              {/* Quantity */}
                              <div className="w-32 shrink-0">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  Quantity *
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={batch.quantity === 0 || batch.quantity === undefined || batch.quantity === null ? '' : batch.quantity}
                                  placeholder="0"
                                  onFocus={(e) => e.target.select()}
                                  onClick={(e) => (e.target as HTMLInputElement).select()}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      handleUpdateBatchField(gIdx, bIdx, 'quantity', 0);
                                      return;
                                    }
                                    const val = parseInt(raw, 10);
                                    handleUpdateBatchField(gIdx, bIdx, 'quantity', isNaN(val) ? 0 : Math.max(0, val));
                                  }}
                                  onBlur={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (isNaN(val) || val < 0) {
                                      handleUpdateBatchField(gIdx, bIdx, 'quantity', 0);
                                    }
                                  }}
                                  className="h-9 text-xs font-mono font-bold text-center"
                                />
                              </div>

                              {/* Manufacturing Date */}
                              <div className="w-44 shrink-0">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  Mfg Date *
                                </Label>
                                <Input
                                  type="date"
                                  value={batch.manufacturing_date ? batch.manufacturing_date.substring(0, 10) : ''}
                                  onChange={(e) => handleUpdateBatchField(gIdx, bIdx, 'manufacturing_date', e.target.value)}
                                  className="h-9 text-xs"
                                />
                              </div>

                              {/* Expiry Date */}
                              <div className="w-44 shrink-0">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  Expiry Date *
                                </Label>
                                <Input
                                  type="date"
                                  value={batch.expiry_date ? batch.expiry_date.substring(0, 10) : ''}
                                  onChange={(e) => handleUpdateBatchField(gIdx, bIdx, 'expiry_date', e.target.value)}
                                  className="h-9 text-xs"
                                />
                              </div>

                              {/* QA Status */}
                              <div className="w-44 shrink-0">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  QA Status *
                                </Label>
                                <Select
                                  value={batch.qa_status}
                                  onValueChange={(val) => handleUpdateBatchField(gIdx, bIdx, 'qa_status', val as QAStatus)}
                                >
                                  <SelectTrigger
                                    className={`h-9 text-xs font-semibold ${
                                      (!isGroupBadStock && batch.qa_status !== 'GOOD') || (isGroupBadStock && batch.qa_status === 'GOOD')
                                        ? 'border-destructive ring-1 ring-destructive/40 text-destructive bg-destructive/5'
                                        : ''
                                    }`}
                                  >
                                    <SelectValue placeholder="Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GOOD" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> GOOD
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="DAMAGED" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                                        <span className="w-2 h-2 rounded-full bg-rose-500" /> DAMAGED
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="QUARANTINED" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" /> QUARANTINED
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="EXPIRED" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-purple-600 dark:text-purple-400">
                                        <span className="w-2 h-2 rounded-full bg-purple-500" /> EXPIRED
                                      </span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {!isGroupBadStock && batch.qa_status !== 'GOOD' && (
                                  <span className="text-[10px] text-destructive font-bold flex items-center gap-1 mt-1 leading-tight">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Bad stock shouldn&apos;t be allocated here
                                  </span>
                                )}
                                {isGroupBadStock && batch.qa_status === 'GOOD' && (
                                  <span className="text-[10px] text-destructive font-bold flex items-center gap-1 mt-1 leading-tight">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Good stock shouldn&apos;t be allocated here
                                  </span>
                                )}
                              </div>

                              {/* Remove Batch Split */}
                              <div className="shrink-0 flex items-end pt-5 md:pt-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled={group.batches.length <= 1}
                                  onClick={() => handleRemoveBatch(gIdx, bIdx)}
                                  className="h-9 w-9 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg disabled:opacity-30"
                                  title="Remove Batch"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* FOOTER & ACTIONS */}
        <DialogFooter className="p-4 border-t border-border bg-card shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground text-left flex-1">
            {validationErrors.length > 0 ? (
              <span className="text-red-500 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Please resolve the highlighted lot issues above.
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Allocations ready to apply.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={!isValid || loading}
              className="text-xs font-bold h-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Apply Lot & Batch Allocations
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
