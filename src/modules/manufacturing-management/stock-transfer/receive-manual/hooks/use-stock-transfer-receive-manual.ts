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
import type { OrderGroup, OrderGroupItem, ProductRow } from '../../types/stock-transfer.types';

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
  const [targetLots, setTargetLots] = useState<MMLot[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawBranchOnhand, setRawBranchOnhand] = useState<any[]>([]);
  const [rawBranchInvLots, setRawBranchInvLots] = useState<MMInventoryLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [remarks, setRemarks] = useState('');

  const updateReceivedQty = useCallback((id: number, qty: number, maxQty: number) => {
    setReceivedQtys(prev => {
      const validQty = Math.max(0, Math.min(qty, maxQty));
      return { ...prev, [id]: validQty };
    });
  }, []);

  const updateDestinationLot = useCallback((itemId: number, lotId: number) => {
    setDestinationLotIds(prev => ({ ...prev, [itemId]: lotId }));
  }, []);

  const updateDestinationBatchNo = useCallback((itemId: number, batchNo: string) => {
    setDestinationBatchNos(prev => ({ ...prev, [itemId]: batchNo }));
  }, []);

  const updateItemLotAllocations = useCallback((itemId: number, allocations: LotAllocationGroup[]) => {
    setItemLotAllocations(prev => ({ ...prev, [itemId]: allocations }));
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
      const enrichedItems = group.items.map((st: OrderGroupItem) => {
        const allocs = itemLotAllocations[st.id] ?? st.lot_allocations;
        const batchTotalQty = (allocs && allocs.length > 0)
          ? allocs.reduce((sum, g) => sum + (g.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0), 0)
          : undefined;
        const defaultQty = batchTotalQty !== undefined
          ? batchTotalQty
          : Math.max(0, st.scanned_quantity ?? st.picked_quantity ?? st.allocated_quantity ?? 0);

        return {
          ...st,
          receivedQty: receivedQtys[st.id] ?? defaultQty,
          lot_allocations: allocs,
        };
      });

      return {
        ...group,
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
            const lId = Number(bo.lotId);
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
            .filter(l => Number(l.branch_id) === destBranchId && (l.status === 'ACTIVE' || !l.status))
            .map(l => ({
              ...l,
              current_stock_quantity: sQtyMap.get(Number(l.lot_id)) ?? l.current_stock_quantity ?? 0,
            }));
          setTargetLots(activeLots);
          if (activeLots.length > 0) {
            const tempMap = buildLotStoredProductSummaryMap(onhand || [], activeLots, undefined, invLots || []);
            const currentBaseGroup = base.baseOrderGroups.find(g => g.orderNo === base.selectedOrderNo);
            const rawItems = currentBaseGroup?.items || [];

            // Pre-assign destination lot (auto-fill target bad stock lot if target is bad branch, or match source lot in target branch)
            const targetBranchObj = typeof (currentBaseGroup?.items?.[0]?.target_branch_id) === 'object' ? (currentBaseGroup?.items?.[0]?.target_branch_id as any) : null;
            const targetBranchName = currentBaseGroup?.targetBranchName || targetBranchObj?.branch_name || targetBranchObj?.name || '';
            const isTargetBadBranch = isBadStockLot(undefined, { branch_name: targetBranchName });

            setDestinationLotIds(prev => {
              const updated = { ...prev };
              rawItems.forEach(item => {
                const currentLotId = updated[item.id];
                const isValid = activeLots.some(l => l.lot_id === currentLotId);
                if (!currentLotId || !isValid) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const itemAny = item as any;
                  const sourceLotId = itemAny.source_lot_id || itemAny.lot_id || itemAny.lot_allocations?.[0]?.lot_id;
                  const sourceLotName = itemAny.source_lot_name || itemAny.lot_name || itemAny.lot_allocations?.[0]?.lot_name;
                  const itemIsBad = (item.qa_status && item.qa_status !== 'GOOD') || (item.inventory_condition && item.inventory_condition !== 'GOOD') || isTargetBadBranch;

                  // 1. If target branch is bad stock branch or item is bad stock, auto-fill bad stock lot in target branch
                  if (isTargetBadBranch || itemIsBad) {
                    const badStockLot = activeLots.find(l => isBadStockLot(l)) || activeLots[0];
                    if (badStockLot) {
                      updated[item.id] = badStockLot.lot_id;
                      return;
                    }
                  }

                  // 2. Otherwise for standard target branch, match exact source lot if present in target branch
                  if (sourceLotId || sourceLotName) {
                    const matchedTargetLot = activeLots.find(l => {
                      if (sourceLotId && Number(l.lot_id) === Number(sourceLotId)) return true;
                      if (sourceLotName && l.lot_name.trim().toLowerCase() === String(sourceLotName).trim().toLowerCase()) return true;
                      return false;
                    });

                    if (matchedTargetLot) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const p = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as any) : ({} as any);
                      const itemClass = resolveProductClassification(p.product_type, p.product_category, p.product_code, p.product_name);
                      const stored = tempMap.get(Number(matchedTargetLot.lot_id));
                      if (checkLotProductTypeCompatibility(stored, itemClass).isCompatible) {
                        updated[item.id] = matchedTargetLot.lot_id;
                        return;
                      }
                    }
                  }
                  // Do not auto-fill for regular target branch if no matching source lot exists
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
  }, [selectedGroup?.targetBranch, base.selectedOrderNo]);

  const receiveOrder = async (orderNo: string) => {
    const group = orderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
    if (!group) return;

    if (selectedFiles.length === 0) {
      toast.error('Attachment is required.', {
        description: 'Please upload at least one file to finalize this manual deposit.'
      });
      return;
    }

    // Validate that every line item has a destination lot selected
    for (const item of group.items) {
      const allocs = itemLotAllocations[item.id];
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
    for (const item of group.items) {
      const allocs = itemLotAllocations[item.id];
      if (allocs && allocs.length > 0) {
        for (const g of allocs) {
          const lot = targetLots.find((l) => Number(l.lot_id) === Number(g.lot_id));
          const compat = getLotCompatibility(item, g.lot_id);
          if (compat.isTypeMismatch) {
            const itemClass = getItemClassification(item);
            const stored = lotStoredSummaryMap.get(Number(g.lot_id));
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Destination Storage Lot Conflict", {
              description: `Storage lot "${lot?.lot_name || `Lot #${g.lot_id}`}" currently stores ${stored?.is_draft_allocation ? "items in current form draft" : "warehouse stock"} of type "${stored?.primary_classification_label || "Other"}", which is incompatible with "${prodName}" (${itemClass.label}). Please choose a matching or empty storage lot.`
            });
            return;
          }

          const lotIsBad = isBadStockLot(lot);
          const hasBadBatches = (g.batches || []).some((b: { qa_status?: string | null }) => b.qa_status && b.qa_status !== 'GOOD');
          if (hasBadBatches && !lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Bad Stock Storage Lot Conflict", {
              description: `Cannot allocate bad/damaged stock of "${prodName}" into standard storage lot "${lot?.lot_name}". Bad stock must be allocated to a Bad Stock or Quarantine lot.`
            });
            return;
          }
          if (!hasBadBatches && lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Storage Lot Conflict", {
              description: `Cannot allocate GOOD stock of "${prodName}" into Bad Stock / Quarantine storage lot "${lot?.lot_name}".`
            });
            return;
          }

          // Lot Capacity Validation (current_stock + allocated_quantity <= max_batch_capacity)
          const currentStock = Number(lot?.current_stock_quantity || 0);
          const maxCap = Number(lot?.max_batch_capacity || 0);
          const allocQty = (g.batches || []).reduce((sum: number, b: { quantity?: number | null }) => sum + Number(b.quantity || 0), 0);
          if (maxCap > 0 && (currentStock + allocQty) > maxCap) {
            const overage = (currentStock + allocQty) - maxCap;
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Destination Lot Capacity Exceeded", {
              description: `Storage lot "${lot?.lot_name || `Lot #${g.lot_id}`}" has current stock of ${currentStock} and max capacity of ${maxCap}. Allocating ${allocQty} of "${prodName}" exceeds lot capacity by ${overage}. Please choose a lot with sufficient capacity.`
            });
            return;
          }
        }
      } else {
        const assignedLotId = destinationLotIds[item.id];
        if (assignedLotId) {
          const lot = targetLots.find(l => Number(l.lot_id) === Number(assignedLotId));
          const compat = getLotCompatibility(item, assignedLotId);
          if (compat.isTypeMismatch) {
            const itemClass = getItemClassification(item);
            const stored = lotStoredSummaryMap.get(Number(assignedLotId));
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Destination Storage Lot Conflict", {
              description: `Storage lot "${lot?.lot_name || `Lot #${assignedLotId}`}" currently stores ${stored?.is_draft_allocation ? "items in current form draft" : "warehouse stock"} of type "${stored?.primary_classification_label || "Other"}", which is incompatible with "${prodName}" (${itemClass.label}). Please choose a matching or empty storage lot.`
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
              description: `Storage lot "${lot?.lot_name}" is configured for unit "${lot?.unit_name || 'units'}", which is incompatible with product "${prodName}" UOM (${itemUomName}). Please select a lot matching the product's unit.`
            });
            return;
          }

          const lotIsBad = isBadStockLot(lot);
          const itemIsBad = (item.qa_status && item.qa_status !== 'GOOD') || (item.inventory_condition && item.inventory_condition !== 'GOOD');
          if (itemIsBad && !lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Bad Stock Storage Lot Conflict", {
              description: `Item "${prodName}" is bad/damaged stock (${item.qa_status || item.inventory_condition}) and cannot be placed into standard storage lot "${lot?.lot_name}". Bad stock must be placed into a Bad Stock or Quarantine lot.`
            });
            return;
          }
          if (!itemIsBad && lotIsBad) {
            const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
            toast.error("Storage Lot Conflict", {
              description: `Item "${prodName}" is GOOD stock and cannot be placed into Bad Stock / Quarantine storage lot "${lot?.lot_name}".`
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
              description: `Storage lot "${lot?.lot_name || `Lot #${assignedLotId}`}" has current stock of ${currentStock} and max capacity of ${maxCap}. Receiving ${rcvQty} of "${prodName}" exceeds lot capacity by ${overage}. Please choose a lot with sufficient capacity.`
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
          const effectiveAllocs = itemLotAllocations[i.id] || (i.lot_allocations ? i.lot_allocations.map(g => ({
            ...g,
            lot_id: destinationLotIds[i.id] || g.lot_id,
          })) : undefined);

          return {
            id: i.id,
            status: 'Received',
            received_quantity: i.receivedQty || 0,
            destination_lot_id: destinationLotIds[i.id] || null,
            destination_batch_no: destinationBatchNos[i.id] || i.batch_no || i.lot_allocations?.[0]?.batches?.[0]?.batch_no || `TRF-${group.orderNo}-${i.id}`,
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
