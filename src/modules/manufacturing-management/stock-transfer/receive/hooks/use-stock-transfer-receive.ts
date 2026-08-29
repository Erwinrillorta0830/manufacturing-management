'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import type { MMLot, MMInventoryLot, LotStoredProductSummary, ProductClassification } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';
import { toast } from 'sonner';
import type { OrderGroup, OrderGroupItem, ProductRow, ScanLog, CurrentUser } from '../../types/stock-transfer.types';

const LOCAL_STORAGE_KEY_RECEIVE = 'scm_receive_scans_v1';

/**
 * Hook for managing the "Stock Transfer Receive" phase (RFID Verification at Target).
 */
export function useStockTransferReceive({ currentUser }: { currentUser?: CurrentUser } = {}) {
  const base = useStockTransferBase({ 
    statuses: ['For Loading', 'In Transit', 'Dispatched', 'DISPATCHED'] 
  });

  const storageKey = currentUser?.email 
    ? `${LOCAL_STORAGE_KEY_RECEIVE}_user_${currentUser.email}`
    : LOCAL_STORAGE_KEY_RECEIVE;

  const manualStorageKey = currentUser?.email
    ? `scm_receive_manual_v1_user_${currentUser.email}`
    : 'scm_receive_manual_v1';

  const [targetLots, setTargetLots] = useState<MMLot[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawBranchOnhand, setRawBranchOnhand] = useState<any[]>([]);
  const [rawBranchInvLots, setRawBranchInvLots] = useState<MMInventoryLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [destinationLotIds, setDestinationLotIds] = useState<Record<number, number>>({});
  const [destinationBatchNos, setDestinationBatchNos] = useState<Record<number, string>>({});

  const [receivedItemsState, setReceivedItemsState] = useState<Record<string, ScanLog[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [manualQtysState, setManualQtysState] = useState<Record<string, Record<number, number>>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(manualStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [isThrottled, setIsThrottled] = useState(false);
  const recentLocks = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const successScansOnly: Record<string, ScanLog[]> = {};
      Object.entries(receivedItemsState).forEach(([orderNo, scans]) => {
        successScansOnly[orderNo] = scans.filter(s => s.status === 'SUCCESS');
      });
      localStorage.setItem(storageKey, JSON.stringify(successScansOnly));
    }
  }, [receivedItemsState, storageKey]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(manualStorageKey, JSON.stringify(manualQtysState));
    }
  }, [manualQtysState, manualStorageKey]);

  // Garbage-collect orphaned localStorage entries for canceled/rejected orders
  useEffect(() => {
    if (!base.baseOrderGroups || base.baseOrderGroups.length === 0) return;

    const validOrderNumbers = new Set(base.baseOrderGroups.map(g => g.orderNo));

    queueMicrotask(() => {
      setReceivedItemsState(prevState => {
        let hasPurged = false;
        const cleanState = { ...prevState };

        Object.keys(cleanState).forEach(cachedOrderNo => {
          if (!validOrderNumbers.has(cachedOrderNo)) {
            delete cleanState[cachedOrderNo];
            hasPurged = true;
          }
        });

        return hasPurged ? cleanState : prevState;
      });
    });

    queueMicrotask(() => {
      setManualQtysState(prevState => {
        let hasPurged = false;
        const cleanState = { ...prevState };

        Object.keys(cleanState).forEach(cachedOrderNo => {
          if (!validOrderNumbers.has(cachedOrderNo)) {
            delete cleanState[cachedOrderNo];
            hasPurged = true;
          }
        });

        return hasPurged ? cleanState : prevState;
      });
    });
  }, [base.baseOrderGroups]);

  // Enrich items — match received scans to the correct line item via dispatched_rfids
  const orderGroups = useMemo(() => {
    return base.baseOrderGroups.map((group: OrderGroup) => {
      const scanLogs = receivedItemsState[group.orderNo] || [];
      const successScans = scanLogs.filter(s => s.status === 'SUCCESS');

      // Track distributed scans per product for items without dispatched_rfids
      const distributedPerProduct = new Map<number, number>();

      const enrichedItems = group.items.map((st: OrderGroupItem) => {
        const product = st.product_id as ProductRow;
        const pid = (product?.product_id || st.product_id) as number;

        const uom = typeof product?.unit_of_measurement === 'object' ? product.unit_of_measurement : null;
        const unitName = (uom?.unit_name || '').toLowerCase();
        const unitId = Number(uom?.unit_id || 0);

        // Mark as loose pack if unit is pieces, tie, pcs, or loose (these don't need RFID scanning)
        const isLoosePack = unitName.includes('loose') || unitName.includes('pieces') || unitName.includes('pcs') || unitName.includes('tie') || unitId === 4;

        const manualQty = (manualQtysState[group.orderNo] || {})[pid] || 0;
        const dispatchedTags = (st as OrderGroupItem).dispatched_rfids || [];

        let itemRfids: string[];
        if (dispatchedTags.length > 0) {
          // Match received scans against this item's specific dispatched RFIDs
          const dispatchedSet = new Set(dispatchedTags.map(t => String(t).trim()));
          itemRfids = successScans
            .filter(s => s.productId === pid && dispatchedSet.has(String(s.rfid).trim()))
            .map(s => s.rfid);
        } else {
          // Fallback: distribute scans by capacity for items without dispatch tags
          const productScans = successScans.filter(s => s.productId === pid);
          const alreadyDistributed = distributedPerProduct.get(pid) || 0;
          const targetQty = Math.max(0, st.picked_quantity ?? st.allocated_quantity ?? 0);
          const canAssign = Math.max(0, Math.min(targetQty, productScans.length - alreadyDistributed));
          itemRfids = productScans.slice(alreadyDistributed, alreadyDistributed + canAssign).map(s => s.rfid);
          distributedPerProduct.set(pid, alreadyDistributed + itemRfids.length);
        }

        return {
          ...st,
          receivedQty: isLoosePack ? manualQty : itemRfids.length,
          receivedRfids: itemRfids,
          dispatched_rfids: dispatchedTags,
          isLoosePack
        };
      });

      return {
        ...group,
        items: enrichedItems
      };
    });
  }, [base.baseOrderGroups, receivedItemsState, manualQtysState]);

  const selectedGroup = useMemo(() => {
    if (!base.selectedOrderNo) return null;
    return orderGroups.find((g: OrderGroup) => g.orderNo === base.selectedOrderNo) || null;
  }, [base.selectedOrderNo, orderGroups]);

  const updateDestinationLot = useCallback((itemId: number, lotId: number) => {
    setDestinationLotIds(prev => ({ ...prev, [itemId]: lotId }));
  }, []);

  const updateDestinationBatchNo = useCallback((itemId: number, batchNo: string) => {
    setDestinationBatchNos(prev => ({ ...prev, [itemId]: batchNo }));
  }, []);

  // Active table draft allocations
  const activeTableDraftAllocations = useMemo(() => {
    if (!selectedGroup?.items) return [];
    return selectedGroup.items.map((item) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as any) : ({} as any);
      const assignedLotId = destinationLotIds[item.id];
      return {
        lot_id: Number(assignedLotId || 0),
        product_id: Number(product.product_id || item.product_id || 0),
        product_name: product.product_name,
        product_code: product.product_code,
        product_type: product.product_type,
        category_name: product.product_category,
        allocated_quantity: item.receivedQty || item.ordered_quantity || 0,
      };
    });
  }, [selectedGroup, destinationLotIds]);

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
          const activeLots = (lots || []).filter((l: MMLot) => Number(l.branch_id) === destBranchId && (l.status === 'ACTIVE' || !l.status));
          setTargetLots(activeLots);
          if (activeLots.length > 0) {
            const tempMap = buildLotStoredProductSummaryMap(onhand || [], activeLots, undefined, invLots || []);
            setDestinationLotIds(prev => {
              const updated = { ...prev };
              selectedGroup.items.forEach(item => {
                const currentLotId = updated[item.id];
                const isValid = activeLots.some((l: MMLot) => l.lot_id === currentLotId);
                if (!currentLotId || !isValid) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const p = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as any) : ({} as any);
                  const itemClass = resolveProductClassification(p.product_type, p.product_category, p.product_code, p.product_name);
                  const matchedLot = activeLots.find((l: MMLot) => {
                    const stored = tempMap.get(Number(l.lot_id));
                    return checkLotProductTypeCompatibility(stored, itemClass).isCompatible;
                  }) || activeLots[0];
                  updated[item.id] = matchedLot.lot_id;
                }
              });
              return updated;
            });
          }
        }
      })
      .catch(err => {
        console.warn('[StockTransfer] Error loading destination lots in RFID receive:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingLots(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedGroup?.targetBranch]);

  const receiveOrder = async (orderNo: string) => {
    const group = orderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
    if (!group) return;

    // Validate product type compatibility for all destination lots
    for (const item of group.items) {
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
      }
    }

    base.setProcessing(true);
    try {
      const rfidsPayload = group.items.flatMap((item: OrderGroupItem) => 
        item.receivedRfids.map((rfid: string) => ({ 
          stock_transfer_id: item.id, 
          rfid_tag: rfid,
          scan_type: 'RECEIVE'
        }))
      );

      const itemsPayload = group.items.map((i: OrderGroupItem) => ({
        id: i.id,
        status: 'Received',
        received_quantity: i.receivedQty || 0,
        destination_lot_id: destinationLotIds[i.id] || null,
        destination_batch_no: destinationBatchNos[i.id] || i.batch_no || `TRF-${group.orderNo}-${i.id}`,
      }));

      await stockTransferLifecycleService.submitStatusUpdate({ 
        items: itemsPayload, 
        status: 'Received',
        rfids: rfidsPayload,
        scanType: 'RECEIVE',
      });

      toast.success(`Order ${orderNo} successfully received!`);
      base.setSelectedOrderNo(null);
      setReceivedItemsState(prev => {
        const next = { ...prev };
        delete next[orderNo];
        return next;
      });
      setManualQtysState(prev => {
        const next = { ...prev };
        delete next[orderNo];
        return next;
      });
      await base.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong while receiving.';
      console.error('Receive failed:', err);
      playErrorSound();
      if (message.includes('Unauthorized') || message.includes('401')) {
        toast.error('Session Expired', { description: 'Please log in again to continue.' });
      } else {
        toast.error(message);
      }
    } finally {
      base.setProcessing(false);
    }
  };

  const playSuccessSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); 
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) { console.warn('Audio feedback failed:', e); }
  };

  const playErrorSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.4);
    } catch (e) { console.warn('Error audio failed:', e); }
  };

  const handleScanRFID = async (rfid: string) => {
    if (!base.selectedOrderNo || !selectedGroup) {
      toast.error("Please select a dispatched order first before scanning");
      return;
    }

    const pushError = (msg: string, type: string = 'Error') => {
      playErrorSound();
      const newError: ScanLog = {
        rfid,
        timestamp: Date.now(),
        status: 'ERROR',
        errorType: type,
        productName: msg
      };
      setReceivedItemsState(prev => ({
        ...prev,
        [base.selectedOrderNo!]: [newError, ...(prev[base.selectedOrderNo!] || [])]
      }));
    };

    // Basic validation: Ignore very short strings (accidental noise)
    if (rfid.length < 8) return;

    // Spam prevention: Ignore the same tag if processed within the last 10 seconds
    const now = Date.now();
    const lastTime = recentLocks.current.get(rfid) || 0;
    if (now - lastTime < 10000) {
      setIsThrottled(true);
      setTimeout(() => setIsThrottled(false), 2000);
      return;
    }
    recentLocks.current.set(rfid, now);
    
    try {
      const match = await stockTransferLifecycleService.lookupRfid(rfid);
      const productId = match.productId;

      // Find all line items for this product
      const matchingItems = selectedGroup.items.filter(i => {
        const itemProduct = i.product_id as ProductRow;
        const itemPid = Number(itemProduct?.product_id || i.product_id);
        return itemPid === productId;
      });

      if (matchingItems.length === 0) {
        pushError(`Product is not part of this order!`, 'Mismatch');
        return;
      }

      // Find the specific line item whose dispatched_rfids contains this RFID
      const rfidStr = String(rfid).trim();
      let itemInOrder = matchingItems.find(i => {
        const tags = (i.dispatched_rfids || []).map(t => String(t).trim());
        return tags.includes(rfidStr);
      });

      if (!itemInOrder) {
        // If any matching item has dispatched_rfids, reject — the tag doesn't belong here
        const hasDispatchedTags = matchingItems.some(i => (i.dispatched_rfids || []).length > 0);
        if (hasDispatchedTags) {
          pushError("Tag was not part of original dispatch.", "Mismatch");
          return;
        }
        // Fallback: if no items have dispatch tags, find first with remaining capacity
        itemInOrder = matchingItems.find(i => {
          const tQty = i.picked_quantity ?? i.allocated_quantity ?? 0;
          return (i.receivedQty || 0) < tQty;
        });
        if (!itemInOrder) {
          pushError(`Already Complete for ${match.productName}`, "Over-scan");
          return;
        }
      }

      const currentScans = receivedItemsState[base.selectedOrderNo!] || [];
      if (currentScans.some(s => s.status === 'SUCCESS' && s.rfid === rfid)) {
        pushError("Already Scanned", "Duplicate");
        return;
      }

      const targetQty = itemInOrder.picked_quantity ?? itemInOrder.allocated_quantity ?? 0;
      if (itemInOrder.receivedQty >= targetQty) {
        pushError(`Already Complete for ${match.productName}`, "Over-scan");
        return;
      }
      
      const newScan: ScanLog = {
        rfid,
        productId,
        productName: match.productName,
        timestamp: Date.now(),
        status: 'SUCCESS'
      };

      setReceivedItemsState(prev => ({
        ...prev,
        [base.selectedOrderNo!]: [newScan, ...(prev[base.selectedOrderNo!] || [])]
      }));
      
      playSuccessSound();
    } catch {
      pushError('Tag not found in inventory', 'Not Found');
    }
  };

  const verifyAll = useCallback(() => {
    if (!base.selectedOrderNo || !selectedGroup) return;
    
    setReceivedItemsState(prev => {
      const dispatchLogs: ScanLog[] = selectedGroup.items.flatMap(item => {
        const product = item.product_id as ProductRow;
        const itemPid = Number(product?.product_id || item.product_id);
        return (item.dispatched_rfids || []).map(rfid => ({
          rfid,
          productId: itemPid,
          productName: product?.product_name || `Item ${itemPid}`,
          timestamp: Date.now(),
          status: 'SUCCESS' as const,
        }));
      });
      return { ...prev, [base.selectedOrderNo!]: dispatchLogs };
    });
    
    toast.success("All items verified as received.");
  }, [base.selectedOrderNo, selectedGroup]);

  const updateManualQty = (productId: number, qty: number) => {
    if (!base.selectedOrderNo) return;
    setManualQtysState(prev => {
      const orderManual = prev[base.selectedOrderNo!] || {};
      return {
        ...prev,
        [base.selectedOrderNo!]: {
          ...orderManual,
          [productId]: qty
        }
      };
    });
  };

  return {
    ...base,
    orderGroups,
    selectedGroup,
    receiveOrder,
    handleScanRFID,
    verifyAll,
    updateManualQty,
    destinationLotIds,
    updateDestinationLot,
    destinationBatchNos,
    updateDestinationBatchNo,
    targetLots,
    loadingLots,
    lotStoredSummaryMap,
    getItemClassification,
    getLotCompatibility,
    recentScans: (base.selectedOrderNo ? receivedItemsState[base.selectedOrderNo] : []) || [],
    isThrottled,
    clearHistory: () => {
      if (base.selectedOrderNo) {
        setReceivedItemsState(prev => ({ ...prev, [base.selectedOrderNo!]: [] }));
      }
    }
  };
}
