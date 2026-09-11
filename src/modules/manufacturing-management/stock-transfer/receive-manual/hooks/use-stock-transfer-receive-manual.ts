'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useStockTransferBase } from '../../shared/hooks/use-stock-transfer-base';
import { stockTransferLifecycleService } from '../../services/stock-transfer.lifecycle';
import {
  fetchLotsByBranch,
  fetchBatchOnhand,
  fetchInventoryLots,
  resolveProductClassification,
  buildLotStoredProductSummaryMap,
  checkLotProductTypeCompatibility,
  isBadStockLot,
} from '@/modules/manufacturing-management/shared/services/lot-tracking.service';
import type { MMLot, MMInventoryLot, LotAllocationGroup } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';
import { toast } from 'sonner';
import type { OrderGroup, OrderGroupItem, ProductRow, BranchRow } from '../../types/stock-transfer.types';

function normalizeRouteBranch(branch: number | null | undefined): number | null {
  if (branch === null || branch === undefined || branch === 0) return null;
  const parsed = Number(branch);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Hook for managing the "Stock Transfer Receive" phase (Manual Entry with Target Lot/Batch selection).
 */
export function useStockTransferReceiveManual() {
  const base = useStockTransferBase({ 
    statuses: ['For Loading', 'In Transit', 'Dispatched', 'DISPATCHED'] 
  });

  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});
  const [destinationLotIds, setDestinationLotIds] = useState<Record<number, number>>({});
  const [destinationBatchNos, setDestinationBatchNos] = useState<Record<number, string>>({});
  const [itemLotAllocations, setItemLotAllocations] = useState<Record<number, LotAllocationGroup[]>>({});
  const [reviewedAllocations, setReviewedAllocations] = useState<Record<number, boolean>>({});
  const [targetLots, setTargetLots] = useState<MMLot[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawBranchOnhand, setRawBranchOnhand] = useState<any[]>([]);
  const [rawBranchInvLots, setRawBranchInvLots] = useState<MMInventoryLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [remarks, setRemarks] = useState('');

  const markAllocationReviewed = useCallback((itemId: number) => {
    setReviewedAllocations(prev => ({ ...prev, [itemId]: true }));
  }, []);

  const updateReceivedQty = useCallback((id: number, qty: number, maxQty: number) => {
    setReceivedQtys(prev => {
      const validQty = Math.max(0, Math.min(qty, maxQty));
      return { ...prev, [id]: validQty };
    });
  }, []);

  const updateDestinationLot = useCallback((itemId: number, lotId: number) => {
    setDestinationLotIds(prev => ({ ...prev, [itemId]: lotId }));
    setReviewedAllocations(prev => ({ ...prev, [itemId]: true }));
  }, []);

  const updateDestinationBatchNo = useCallback((itemId: number, batchNo: string) => {
    setDestinationBatchNos(prev => ({ ...prev, [itemId]: batchNo }));
    setReviewedAllocations(prev => ({ ...prev, [itemId]: true }));
  }, []);

  const updateItemLotAllocations = useCallback((itemId: number, allocations: LotAllocationGroup[]) => {
    setItemLotAllocations(prev => ({ ...prev, [itemId]: allocations }));
    setReviewedAllocations(prev => ({ ...prev, [itemId]: true }));
    const totalAllocated = allocations.reduce(
      (sum, g) => sum + (g.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0),
      0
    );
    setReceivedQtys(prev => ({ ...prev, [itemId]: totalAllocated }));
    if (allocations.length > 0) {
      setDestinationLotIds(prev => ({ ...prev, [itemId]: Number(allocations[0].lot_id) }));
      if (allocations[0].batches && allocations[0].batches.length > 0) {
        setDestinationBatchNos(prev => ({ ...prev, [itemId]: allocations[0].batches[0].batch_no }));
      }
    }
  }, []);

  const addSelectedFiles = useCallback((files: File[]) => {
    setSelectedFiles(prev => {
      const combined = [...prev, ...files];
      if (combined.length > 20) {
        toast.error('Limit exceeded', {
          description: 'You can upload a maximum of 20 attachments.'
        });
        return combined.slice(0, 20);
      }
      return combined;
    });
  }, []);

  const removeSelectedFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const orderGroups = useMemo(() => {
    return base.baseOrderGroups.map((group: OrderGroup) => {
      const sourceBranch = normalizeRouteBranch(group.sourceBranch);
      const targetBranch = normalizeRouteBranch(group.targetBranch);

      const enrichedItems = group.items.map((st: OrderGroupItem) => {
        const allocs = itemLotAllocations[st.id];
        const batchTotalQty = (allocs && allocs.length > 0)
          ? allocs.reduce((sum, g) => sum + (g.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0), 0)
          : undefined;
        const isDispatched = ['Dispatched', 'DISPATCHED', 'For Loading', 'FOR_LOADING', 'In Transit', 'IN_TRANSIT'].includes(st.status);
        const dispatchedVal = st.dispatched_quantity ?? st.picked_quantity ?? st.scanned_quantity;
        const defaultQty = batchTotalQty !== undefined
          ? batchTotalQty
          : Math.max(0, dispatchedVal ?? (isDispatched ? 0 : st.allocated_quantity) ?? 0);

        return {
          ...st,
          receivedQty: receivedQtys[st.id] ?? defaultQty,
          lot_allocations: allocs ?? st.lot_allocations,
          source_lot_allocations: st.lot_allocations,
        };
      });

      return {
        ...group,
        sourceBranch,
        targetBranch,
        items: enrichedItems
      };
    });
  }, [base.baseOrderGroups, receivedQtys, itemLotAllocations]);

  const selectedGroup = useMemo(() => {
    if (!base.selectedOrderNo) return null;
    return orderGroups.find((g: OrderGroup) => g.orderNo === base.selectedOrderNo) || null;
  }, [base.selectedOrderNo, orderGroups]);

  // Active table draft allocations (multi-lot aware)
  const activeTableDraftAllocations = useMemo(() => {
    if (!selectedGroup?.items) return [];
    const list: {
      lot_id: number;
      product_id: number;
      product_name?: string;
      product_code?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product_type?: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category_name?: any;
      allocated_quantity: number;
    }[] = [];

    selectedGroup.items.forEach((item) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as any) : ({} as any);
      const allocs = itemLotAllocations[item.id];
      if (allocs && allocs.length > 0) {
        allocs.forEach((g) => {
          const gQty = (g.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0);
          list.push({
            lot_id: Number(g.lot_id),
            product_id: Number(product.product_id || item.product_id || 0),
            product_name: product.product_name,
            product_code: product.product_code,
            product_type: product.product_type,
            category_name: product.product_category,
            allocated_quantity: gQty,
          });
        });
      } else {
        const assignedLotId = destinationLotIds[item.id];
        list.push({
          lot_id: Number(assignedLotId || 0),
          product_id: Number(product.product_id || item.product_id || 0),
          product_name: product.product_name,
          product_code: product.product_code,
          product_type: product.product_type,
          category_name: product.product_category,
          allocated_quantity: receivedQtys[item.id] ?? item.ordered_quantity ?? 0,
        });
      }
    });

    return list;
  }, [selectedGroup, destinationLotIds, receivedQtys, itemLotAllocations]);

  // Map of Stored Products & Classifications per Lot in Destination Branch
  const lotStoredSummaryMap = useMemo(() => {
    return buildLotStoredProductSummaryMap(rawBranchOnhand, targetLots, activeTableDraftAllocations, rawBranchInvLots);
  }, [rawBranchOnhand, targetLots, activeTableDraftAllocations, rawBranchInvLots]);

  const getItemClassification = useCallback((item: OrderGroupItem) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const product = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as any) : ({} as any);
    return resolveProductClassification(
      product.product_type,
      product.product_category,
      product.product_code,
      product.product_name
    );
  }, []);

  const getLotCompatibility = useCallback((item: OrderGroupItem, lotId: number) => {
    const targetClass = getItemClassification(item);
    const stored = lotStoredSummaryMap.get(Number(lotId));
    return checkLotProductTypeCompatibility(stored, targetClass);
  }, [getItemClassification, lotStoredSummaryMap]);

  // Load destination branch lots & batch onhand when selected order group changes
  useEffect(() => {
    let isMounted = true;

    if (!selectedGroup?.targetBranch) {
      queueMicrotask(() => {
        if (isMounted) {
          setTargetLots([]);
          setRawBranchOnhand([]);
          setRawBranchInvLots([]);
        }
      });
      return;
    }

    const destBranchId = Number(selectedGroup.targetBranch);

    queueMicrotask(() => {
      if (isMounted) setLoadingLots(true);
    });

    Promise.all([
      fetchLotsByBranch(destBranchId),
      fetchBatchOnhand({ branchId: destBranchId }),
      fetchInventoryLots({ branchId: destBranchId }),
    ])
      .then(([lots, onhand, invLots]) => {
        if (isMounted) {
          setRawBranchOnhand(onhand || []);
          setRawBranchInvLots(invLots || []);
          const sQtyMap = new Map<number, number>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (onhand || []).forEach((bo: any) => {
            const lId = Number(bo.mmLotId || bo.mm_lot_id || 0);
            if (lId > 0) {
              sQtyMap.set(lId, (sQtyMap.get(lId) || 0) + Number(bo.onhandQuantity || 0));
            }
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (invLots || []).forEach((ib: any) => {
            const lId = Number(ib.lot_id);
            if (lId > 0 && !sQtyMap.has(lId)) {
              sQtyMap.set(lId, Number(ib.available_quantity || 0));
            }
          });

          const activeLots = (lots || [])
            .filter(l => {
              const status = String(l.status || '').toUpperCase();
              const isStatusAllowed = !l.status || status === 'ACTIVE' || status === 'QUARANTINE' || status === 'QUARANTINED' || status === 'HOLD';
              const matchesBranch = !destBranchId || Number(l.branch_id) === destBranchId;
              return matchesBranch && isStatusAllowed;
            })
            .map(l => ({
              ...l,
              current_stock_quantity: sQtyMap.get(Number(l.lot_id)) ?? l.current_stock_quantity ?? 0,
            }));
          setTargetLots(activeLots);
          if (activeLots.length > 0) {
            const currentBaseGroup = base.baseOrderGroups.find(g => g.orderNo === base.selectedOrderNo);
            const rawItems = currentBaseGroup?.items || [];

            // Pre-assign destination lot (auto-fill target bad stock lot if target is bad branch)
            const targetBranchObj = typeof (currentBaseGroup?.items?.[0]?.target_branch_id) === 'object' && currentBaseGroup?.items?.[0]?.target_branch_id !== null ? (currentBaseGroup.items[0].target_branch_id as BranchRow) : null;
            const targetBranchName = currentBaseGroup?.targetBranchName || targetBranchObj?.branch_name || targetBranchObj?.name || '';
            const isTargetBadBranch = isBadStockLot(undefined, { branch_name: targetBranchName });

            setDestinationLotIds(prev => {
              const updated = { ...prev };
              rawItems.forEach(item => {
                const currentLotId = updated[item.id];
                const isValid = activeLots.some(l => l.lot_id === currentLotId);
                if (!currentLotId || !isValid) {
                  const itemIsBad = (item.qa_status && item.qa_status !== 'GOOD') || (item.inventory_condition && item.inventory_condition !== 'GOOD') || isTargetBadBranch;

                  // 1. If target branch is bad stock branch or item is bad stock, auto-fill bad stock lot in target branch
                  if (isTargetBadBranch || itemIsBad) {
                    const badStockLot = activeLots.find(l => isBadStockLot(l)) || activeLots[0];
                    if (badStockLot) {
                      updated[item.id] = badStockLot.lot_id;
                      return;
                    }
                  }

                  // Do not auto-fill source lot for regular target branch by default
                  delete updated[item.id];
                }
              });
              return updated;
            });
          }
        }
      })
      .catch(err => {
        console.warn('[StockTransfer] Error loading destination lots:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingLots(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedGroup?.targetBranch, base.selectedOrderNo, base.baseOrderGroups]);

  // Reset allocation review state and draft lot allocations when selected order changes
  useEffect(() => {
    setReviewedAllocations({});
    setItemLotAllocations({});
    setReceivedQtys({});
    setDestinationLotIds({});
    setDestinationBatchNos({});
  }, [base.selectedOrderNo]);

  const receiveOrder = async (orderNo: string) => {
    const group = orderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
    if (!group) return;

    if (selectedFiles.length === 0) {
      toast.error('Attachment is required.', {
        description: 'Please upload at least one file to finalize this manual deposit.'
      });
      return;
    }

    // Validate that every line item has been reviewed (applied lot & batch allocation)
    for (const item of group.items) {
      const allocs = itemLotAllocations[item.id];
      const isDispatchedStatus = ['Dispatched', 'DISPATCHED', 'For Loading', 'FOR_LOADING', 'In Transit', 'IN_TRANSIT'].includes(item.status);
      const rawDispatched = item.dispatched_quantity ?? item.picked_quantity ?? item.scanned_quantity;
      const dispatchedQty = Math.max(0, rawDispatched ?? (isDispatchedStatus ? 0 : item.allocated_quantity) ?? 0);
      const itBatchTotal = (allocs && allocs.length > 0)
        ? allocs.reduce((s, g) => s + (g.batches || []).reduce((bS, b) => bS + Number(b.quantity || 0), 0), 0)
        : undefined;
      const effectiveQty = itBatchTotal !== undefined ? itBatchTotal : (receivedQtys[item.id] ?? dispatchedQty);

      if (dispatchedQty === 0 || effectiveQty === 0) {
        continue;
      }

      if (!reviewedAllocations[item.id]) {
        const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
        toast.error("Lot & Batch Allocation Review Required", {
          description: `Please review and apply lot & batch allocations for "${prodName}" before finalizing manual deposit.`
        });
        return;
      }
    }

    // Validate that every line item has a destination lot selected
    for (const item of group.items) {
      const allocs = itemLotAllocations[item.id];
      const isDispatchedStatus = ['Dispatched', 'DISPATCHED', 'For Loading', 'FOR_LOADING', 'In Transit', 'IN_TRANSIT'].includes(item.status);
      const rawDispatched = item.dispatched_quantity ?? item.picked_quantity ?? item.scanned_quantity;
      const dispatchedQty = Math.max(0, rawDispatched ?? (isDispatchedStatus ? 0 : item.allocated_quantity) ?? 0);
      const itBatchTotal = (allocs && allocs.length > 0)
        ? allocs.reduce((s, g) => s + (g.batches || []).reduce((bS, b) => bS + Number(b.quantity || 0), 0), 0)
        : undefined;
      const effectiveQty = itBatchTotal !== undefined ? itBatchTotal : (receivedQtys[item.id] ?? dispatchedQty);

      if (dispatchedQty === 0 || effectiveQty === 0) {
        continue;
      }

      const assignedLotId = destinationLotIds[item.id];
      const hasAllocatedLot = (allocs && allocs.length > 0 && allocs.some(a => Number(a.lot_id) > 0)) || Number(assignedLotId || 0) > 0;
      if (!hasAllocatedLot) {
        const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
        toast.error("Destination Storage Lot Required", {
          description: `Please select a destination storage lot for "${prodName}" before finalizing manual deposit.`
        });
        return;
      }
    }

    // Validate product type compatibility for all destination lots
    const targetBranchObj = typeof (group.items?.[0]?.target_branch_id) === 'object' && group.items?.[0]?.target_branch_id !== null ? (group.items[0].target_branch_id as BranchRow) : null;
    const targetBranchName = group.targetBranchName || targetBranchObj?.branch_name || targetBranchObj?.name || '';
    const isTargetBadBranch = isBadStockLot(undefined, { branch_name: targetBranchName });

    for (const item of group.items) {
      const allocs = itemLotAllocations[item.id];
      const isDispatchedStatus = ['Dispatched', 'DISPATCHED', 'For Loading', 'FOR_LOADING', 'In Transit', 'IN_TRANSIT'].includes(item.status);
      const rawDispatched = item.dispatched_quantity ?? item.picked_quantity ?? item.scanned_quantity;
      const dispatchedQty = Math.max(0, rawDispatched ?? (isDispatchedStatus ? 0 : item.allocated_quantity) ?? 0);
      const itBatchTotal = (allocs && allocs.length > 0)
        ? allocs.reduce((s, g) => s + (g.batches || []).reduce((bS, b) => bS + Number(b.quantity || 0), 0), 0)
        : undefined;
      const effectiveQty = itBatchTotal !== undefined ? itBatchTotal : (receivedQtys[item.id] ?? dispatchedQty);

      if (dispatchedQty === 0 || effectiveQty === 0) {
        continue;
      }

      if (allocs && allocs.length > 0) {
        for (const g of allocs) {
          const lot = targetLots.find((l) => Number(l.lot_id) === Number(g.lot_id));
          const lotObj = lot || {
            lot_id: g.lot_id,
            lot_name: g.lot_name || `Lot #${g.lot_id}`,
            is_bad_stock: g.is_bad_stock,
            max_batch_capacity: g.max_batch_capacity,
            unit_id: g.unit_id,
            unit_name: g.unit_name,
          };
          const lotDisplayName = lot?.lot_name || g.lot_name || `Lot #${g.lot_id}`;
          const compat = getLotCompatibility(item, g.lot_id);
          if (compat.isTypeMismatch) {
            const itemClass = getItemClassification(item);
            const stored = lotStoredSummaryMap.get(Number(g.lot_id));
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Destination Storage Lot Conflict", {
              description: `Storage lot "${lotDisplayName}" currently stores ${stored?.is_draft_allocation ? "items in current form draft" : "warehouse stock"} of type "${stored?.primary_classification_label || "Other"}", which is incompatible with "${prodName}" (${itemClass.label}). Please choose a matching or empty storage lot.`
            });
            return;
          }

          const lotIsBad = isTargetBadBranch || Boolean(g.is_bad_stock) || isBadStockLot(lot || (lotObj as unknown as MMLot), { branch_name: targetBranchName });
          const hasBadBatches = (g.batches || []).some((b: { qa_status?: string | null }) => b.qa_status && b.qa_status !== 'GOOD');
          if (hasBadBatches && !lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Bad Stock Storage Lot Conflict", {
              description: `Cannot allocate bad/damaged stock of "${prodName}" into standard storage lot "${lotDisplayName}". Bad stock must be allocated to a Bad Stock or Quarantine lot.`
            });
            return;
          }
          if (!hasBadBatches && lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Storage Lot Conflict", {
              description: `Cannot allocate GOOD stock of "${prodName}" into Bad Stock / Quarantine storage lot "${lotDisplayName}".`
            });
            return;
          }

          // Lot Capacity Validation (current_stock + allocated_quantity <= max_batch_capacity)
          const currentStock = Number(lot?.current_stock_quantity || 0);
          const maxCap = Number(lot?.max_batch_capacity || g.max_batch_capacity || 0);
          const allocQty = (g.batches || []).reduce((sum: number, b: { quantity?: number | null }) => sum + Number(b.quantity || 0), 0);
          if (maxCap > 0 && (currentStock + allocQty) > maxCap) {
            const overage = (currentStock + allocQty) - maxCap;
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Destination Lot Capacity Exceeded", {
              description: `Storage lot "${lotDisplayName}" has current stock of ${currentStock} and max capacity of ${maxCap}. Allocating ${allocQty} of "${prodName}" exceeds lot capacity by ${overage}. Please choose a lot with sufficient capacity.`
            });
            return;
          }
        }
      } else {
        const assignedLotId = destinationLotIds[item.id];
        if (assignedLotId) {
          const lot = targetLots.find(l => Number(l.lot_id) === Number(assignedLotId));
          const lotDisplayName = lot?.lot_name || `Lot #${assignedLotId}`;
          const compat = getLotCompatibility(item, assignedLotId);
          if (compat.isTypeMismatch) {
            const itemClass = getItemClassification(item);
            const stored = lotStoredSummaryMap.get(Number(assignedLotId));
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Destination Storage Lot Conflict", {
              description: `Storage lot "${lotDisplayName}" currently stores ${stored?.is_draft_allocation ? "items in current form draft" : "warehouse stock"} of type "${stored?.primary_classification_label || "Other"}", which is incompatible with "${prodName}" (${itemClass.label}). Please choose a matching or empty storage lot.`
            });
            return;
          }

          // UOM Validation
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const productObj = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as any) : {};
          const productUom = typeof productObj.unit_of_measurement === 'object' ? productObj.unit_of_measurement : null;
          const itemUnitId = Number(productUom?.unit_id || productObj.unit_id || 0);
          const lotUnitId = Number(lot?.unit_id || 0);
          if (lotUnitId > 0 && itemUnitId > 0 && lotUnitId !== itemUnitId) {
            const prodName = productObj.product_name || `Product #${item.product_id}`;
            const itemUomName = productUom?.unit_name || 'units';
            toast.error("Destination Storage Lot UOM Conflict", {
              description: `Storage lot "${lotDisplayName}" is configured for unit "${lot?.unit_name || 'units'}", which is incompatible with product "${prodName}" UOM (${itemUomName}). Please select a lot matching the product's unit.`
            });
            return;
          }

          const lotIsBad = isTargetBadBranch || isBadStockLot(lot, { branch_name: targetBranchName });
          const itemIsBad = (item.qa_status && item.qa_status !== 'GOOD') || (item.inventory_condition && item.inventory_condition !== 'GOOD');
          if (itemIsBad && !lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Bad Stock Storage Lot Conflict", {
              description: `Item "${prodName}" is bad/damaged stock (${item.qa_status || item.inventory_condition}) and cannot be placed into standard storage lot "${lotDisplayName}". Bad stock must be placed into a Bad Stock or Quarantine lot.`
            });
            return;
          }
          if (!itemIsBad && lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Storage Lot Conflict", {
              description: `Item "${prodName}" is GOOD stock and cannot be placed into Bad Stock / Quarantine storage lot "${lotDisplayName}".`
            });
            return;
          }

          // Lot Capacity Validation (current_stock + received_quantity <= max_batch_capacity)
          const currentStock = Number(lot?.current_stock_quantity || 0);
          const maxCap = Number(lot?.max_batch_capacity || 0);
          const rcvQty = Number(item.receivedQty || item.received_quantity || item.allocated_quantity || 0);
          if (maxCap > 0 && (currentStock + rcvQty) > maxCap) {
            const overage = (currentStock + rcvQty) - maxCap;
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Destination Lot Capacity Exceeded", {
              description: `Storage lot "${lotDisplayName}" has current stock of ${currentStock} and max capacity of ${maxCap}. Receiving ${rcvQty} of "${prodName}" exceeds lot capacity by ${overage}. Please choose a lot with sufficient capacity.`
            });
            return;
          }
        }
      }
    }

    base.setProcessing(true);
    setIsUploading(true);

    try {
      // 1. Upload files concurrently
      const uploadPromises = selectedFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/scm/warehouse-management/stock-transfer/receive-manual/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to upload "${file.name}".`);
        }

        const result = await res.json();
        const directusFileId = result.data?.id || result.id;
        if (!directusFileId) {
          throw new Error(`Upload succeeded for "${file.name}" but no file ID was returned.`);
        }
        return directusFileId as string;
      });

      const directusFileIds = await Promise.all(uploadPromises);

      // 2. Submit status update with attachments, remarks, and structured multi-lot allocations
      await stockTransferLifecycleService.submitStatusUpdate({
        items: group.items.map((i: OrderGroupItem) => {
          const effectiveAllocs = itemLotAllocations[i.id];

          return {
            id: i.id,
            status: 'Received',
            received_quantity: i.receivedQty || 0,
            destination_lot_id: destinationLotIds[i.id] || null,
            destination_batch_no: destinationBatchNos[i.id] || i.batch_no || i.lot_allocations?.[0]?.batches?.[0]?.batch_no || undefined,
            lot_allocations: effectiveAllocs,
            remarks: remarks.trim() || undefined,
          };
        }),
        status: 'Received',
        remarks: remarks.trim() || undefined,
        attachments: directusFileIds
      });

      toast.success(`Order ${orderNo} successfully received into destination inventory.`);
      setSelectedFiles([]);
      setRemarks('');
      setItemLotAllocations({});
      base.setSelectedOrderNo(null);
      await base.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong while receiving.';
      if (msg.includes('Unauthorized') || msg.includes('401')) {
        toast.error('Session Expired', { description: 'Please log in again to continue.' });
      } else {
        toast.error(msg);
      }
    } finally {
      base.setProcessing(false);
      setIsUploading(false);
    }
  };

  return {
    ...base,
    orderGroups,
    selectedGroup,
    receiveOrder,
    receivedQtys,
    updateReceivedQty,
    destinationLotIds,
    updateDestinationLot,
    destinationBatchNos,
    updateDestinationBatchNo,
    itemLotAllocations,
    updateItemLotAllocations,
    reviewedAllocations,
    markAllocationReviewed,
    targetLots,
    loadingLots,
    lotStoredSummaryMap,
    getItemClassification,
    getLotCompatibility,
    selectedFiles,
    isUploading,
    addSelectedFiles,
    removeSelectedFile,
    remarks,
    setRemarks,
  };
}
