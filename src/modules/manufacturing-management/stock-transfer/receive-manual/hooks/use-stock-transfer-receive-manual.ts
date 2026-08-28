'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useStockTransferBase } from '../../shared/hooks/use-stock-transfer-base';
import { stockTransferLifecycleService } from '../../services/stock-transfer.lifecycle';
import { fetchLotsByBranch } from '@/modules/manufacturing-management/shared/services/lot-tracking.service';
import type { MMLot } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';
import { toast } from 'sonner';
import type { OrderGroup, OrderGroupItem } from '../../types/stock-transfer.types';

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
  const [targetLots, setTargetLots] = useState<MMLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

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
        return {
          ...st,
          receivedQty: receivedQtys[st.id] ?? 0, 
        };
      });

      return {
        ...group,
        items: enrichedItems
      };
    });
  }, [base.baseOrderGroups, receivedQtys]);

  const selectedGroup = useMemo(() => {
    if (!base.selectedOrderNo) return null;
    return orderGroups.find((g: OrderGroup) => g.orderNo === base.selectedOrderNo) || null;
  }, [base.selectedOrderNo, orderGroups]);

  // Load destination branch lots when selected order group changes
  useEffect(() => {
    let isMounted = true;

    if (!selectedGroup?.targetBranch) {
      queueMicrotask(() => {
        if (isMounted) setTargetLots([]);
      });
      return;
    }

    const destBranchId = Number(selectedGroup.targetBranch);

    queueMicrotask(() => {
      if (isMounted) setLoadingLots(true);
    });

    fetchLotsByBranch(destBranchId)
      .then(lots => {
        if (isMounted) {
          const activeLots = (lots || []).filter(
            l => Number(l.branch_id) === destBranchId && (l.status === 'ACTIVE' || !l.status)
          );
          setTargetLots(activeLots);
          // Pre-assign first available lot to items if not yet set or belonging to another branch
          setDestinationLotIds(prev => {
            const updated = { ...prev };
            selectedGroup.items.forEach(item => {
              const currentLotId = updated[item.id];
              const isValid = activeLots.some(l => l.lot_id === currentLotId);
              if (!currentLotId || !isValid) {
                updated[item.id] = activeLots.length > 0 ? activeLots[0].lot_id : 0;
              }
            });
            return updated;
          });
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
  }, [selectedGroup]);

  const receiveOrder = async (orderNo: string) => {
    const group = orderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
    if (!group) return;

    if (selectedFiles.length === 0) {
      toast.error('Attachment is required.', {
        description: 'Please upload at least one file to finalize this manual deposit.'
      });
      return;
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
        const directusFileId = result.data?.id;

        if (!directusFileId) {
          throw new Error(`Upload succeeded for "${file.name}" but no file ID was returned.`);
        }

        return directusFileId as string;
      });

      const directusFileIds = await Promise.all(uploadPromises);

      // 2. Submit status update with per-item destination lot and batch details
      await stockTransferLifecycleService.submitStatusUpdate({
        items: group.items.map((i: OrderGroupItem) => {
          const rqty = receivedQtys[i.id] ?? Math.max(0, i.scanned_quantity ?? i.picked_quantity ?? i.allocated_quantity ?? 0);
          return {
            id: i.id,
            status: 'Received',
            received_quantity: rqty,
            destination_lot_id: destinationLotIds[i.id] || null,
            destination_batch_no: destinationBatchNos[i.id] || i.batch_no || `TRF-${group.orderNo}-${i.id}`,
          };
        }),
        status: 'Received',
        attachments: directusFileIds
      });

      toast.success(`Order ${orderNo} successfully received into destination inventory.`);
      setSelectedFiles([]);
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
    targetLots,
    loadingLots,
    selectedFiles,
    isUploading,
    addSelectedFiles,
    removeSelectedFile,
  };
}
