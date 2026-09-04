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
import type { MMLot, MMInventoryLot } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';
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
            .filter((l: MMLot) => Number(l.branch_id) === destBranchId && (l.status === 'ACTIVE' || !l.status))
            .map((l: MMLot) => ({
              ...l,
              current_stock_quantity: sQtyMap.get(Number(l.lot_id)) ?? l.current_stock_quantity ?? 0,
            }));
          setTargetLots(activeLots);
          if (activeLots.length > 0) {
            const tempMap = buildLotStoredProductSummaryMap(onhand || [], activeLots, undefined, invLots || []);
            // Pre-assign destination lot (auto-fill target bad stock lot if target is bad branch, or match source lot in target branch)
            const targetBranchObj = typeof (selectedGroup?.items?.[0]?.target_branch_id) === 'object' ? (selectedGroup?.items?.[0]?.target_branch_id as any) : null;
            const targetBranchName = selectedGroup?.targetBranchName || targetBranchObj?.branch_name || targetBranchObj?.name || '';
            const isTargetBadBranch = isBadStockLot(undefined, { branch_name: targetBranchName });

            setDestinationLotIds(prev => {
              const updated = { ...prev };
              selectedGroup.items.forEach(item => {
                const currentLotId = updated[item.id];
                const isValid = activeLots.some((l: MMLot) => l.lot_id === currentLotId);
                if (!currentLotId || !isValid) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const itemAny = item as any;
                  const sourceLotId = itemAny.source_lot_id || itemAny.lot_id || itemAny.lot_allocations?.[0]?.lot_id;
                  const sourceLotName = itemAny.source_lot_name || itemAny.lot_name || itemAny.lot_allocations?.[0]?.lot_name;
                  const itemIsBad = (item.qa_status && item.qa_status !== 'GOOD') || (item.inventory_condition && item.inventory_condition !== 'GOOD') || isTargetBadBranch;

                  // 1. If target branch is bad stock branch or item is bad stock, auto-fill bad stock lot in target branch
                  if (isTargetBadBranch || itemIsBad) {
                    const badStockLot = activeLots.find((l: MMLot) => isBadStockLot(l)) || activeLots[0];
                    if (badStockLot) {
                      updated[item.id] = badStockLot.lot_id;
                      return;
                    }
                  }

                  // 2. Otherwise for standard target branch, match exact source lot if present in target branch
                  if (sourceLotId || sourceLotName) {
                    const matchedTargetLot = activeLots.find((l: MMLot) => {
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
        console.warn('[StockTransfer] Error loading destination lots in RFID receive:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingLots(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedGroup?.targetBranch, selectedGroup?.items]);

  const receiveOrder = async (orderNo: string) => {
    const group = orderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
    if (!group) return;

    // Validate that every line item has a destination lot selected
    for (const item of group.items) {
      const assignedLotId = destinationLotIds[item.id];
      if (!assignedLotId || Number(assignedLotId) <= 0) {
        const prodName = (typeof item.product_id === 'object' && (item.product_id as ProductRow)?.product_name) || `Product #${item.product_id}`;
        toast.error("Destination Storage Lot Required", {
          description: `Please select a destination storage lot for "${prodName}" before receiving.`
        });
        return;
      }
    }

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

        // Lot Capacity Validation (current_stock + received_qty <= max_batch_capacity)
        const currentStock = Number(lot?.current_stock_quantity || 0);
        const maxCap = Number(lot?.max_batch_capacity || 0);
        const rcvQty = Number(item.receivedQty || item.received_quantity || 0);
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
