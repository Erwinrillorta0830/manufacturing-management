'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStockTransferBase } from '../../shared/hooks/use-stock-transfer-base';
import { stockTransferLifecycleService } from '../../services/stock-transfer.lifecycle';
import { toast } from 'sonner';
import type { OrderGroup, OrderGroupItem, ProductRow } from '../../types/stock-transfer.types';
import type { LotBatchSelectionResult } from '@/modules/manufacturing-management/shared/components/LotBatchSelectionModal';
import type { LotAllocationGroup, StockAllocationPlan } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';

/**
 * Hook for managing the "Stock Transfer Dispatch" phase (Manual Entry).
 */
export function useStockTransferDispatchManual() {
  const base = useStockTransferBase({ 
    statuses: ['For Picking', 'Picking', 'Picked'] 
  });

  const [fetchingAvailable, setFetchingAvailable] = useState(false);
  const [scannedInventory, setScannedInventory] = useState<Record<number, number>>({});
  const [scannedQtys, setScannedQtys] = useState<Record<number, number>>({});
  const [itemLots, setItemLots] = useState<Record<number, {
    lot_id?: number;
    lot_name?: string;
    inventory_lot_id?: number;
    batch_no?: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    lot_allocations?: LotAllocationGroup[];
  }>>({});

  const updateScannedQty = useCallback((id: number, qty: number, maxQty: number) => {
    setScannedQtys(prev => {
      const validQty = Math.max(0, Math.min(qty, maxQty));
      return { ...prev, [id]: validQty };
    });
  }, []);

  const updateItemLot = useCallback((itemId: number, lotData: LotBatchSelectionResult) => {
    setItemLots(prev => ({
      ...prev,
      [itemId]: {
        lot_id: lotData.lot_id,
        lot_name: lotData.lot_name,
        inventory_lot_id: lotData.inventory_lot_id,
        batch_no: lotData.batch_no,
        manufacturing_date: lotData.manufacturing_date,
        expiry_date: lotData.expiry_date,
        lot_allocations: lotData.lot_allocations,
      }
    }));
    if (lotData.total_quantity !== undefined && lotData.total_quantity > 0) {
      setScannedQtys(prev => ({
        ...prev,
        [itemId]: lotData.total_quantity!
      }));
    }
  }, []);

  /**
   * Apply a StockAllocationPlan (from StockAllocationModal) to an item.
   * Maps the first allocated batch's lot info into itemLots and sets
   * the scanned quantity to totalAllocated.
   */
  const updateItemAllocationPlan = useCallback((itemId: number, plan: StockAllocationPlan) => {
    const primaryAlloc = plan.allocations[0];
    const allBatchNos = plan.allocations.map((a) => a.batch_no).filter(Boolean).join(', ');

    const lotAllocGroups: LotAllocationGroup[] = plan.allocations.map((a) => ({
      lot_id: a.lot_id,
      lot_name: a.lot_name || `Lot #${a.lot_id}`,
      max_batch_capacity: a.available_quantity || 0,
      allocated_quantity: a.allocated_quantity,
      batches: [
        {
          inventory_lot_id: a.inventory_lot_id,
          batch_no: a.batch_no,
          manufacturing_date: a.manufacturing_date ?? null,
          expiry_date: a.expiry_date ?? null,
          quantity: a.allocated_quantity,
          unit_cost: a.unit_cost ?? 0,
          qa_status: a.qa_status,
          is_existing: true,
        },
      ],
    }));

    setItemLots(prev => ({
      ...prev,
      [itemId]: {
        lot_id: primaryAlloc?.lot_id,
        lot_name: primaryAlloc?.lot_name,
        inventory_lot_id: primaryAlloc?.inventory_lot_id,
        batch_no: allBatchNos,
        manufacturing_date: primaryAlloc?.manufacturing_date ?? null,
        expiry_date: primaryAlloc?.expiry_date ?? null,
        lot_allocations: lotAllocGroups,
      },
    }));

    if (plan.totalAllocated > 0) {
      setScannedQtys(prev => ({
        ...prev,
        [itemId]: plan.totalAllocated,
      }));
    }
  }, []);

  const orderGroups = useMemo(() => {
    return base.baseOrderGroups.map((group: OrderGroup) => {
      const enrichedItems = group.items.map((st: OrderGroupItem) => {
        const product = st.product_id as ProductRow;
        const pid = product?.product_id || st.product_id;
        
        const uom = typeof product?.unit_of_measurement === 'object' ? product.unit_of_measurement : null;
        const unitName = (uom?.unit_name || '').toLowerCase();
        const unitId = Number(uom?.unit_id || 0);
        const loosePack = unitName.includes('loose') || unitName.includes('pieces') || unitName.includes('pcs') || unitName.includes('tie') || unitId === 4;
        
        const rawAvailable = scannedInventory[pid as number] ?? (st as OrderGroupItem).qtyAvailable ?? 0;
        const pickedLot = itemLots[st.id];

        return {
          ...st,
          batch_no: pickedLot?.batch_no ?? st.batch_no,
          source_lot_id: pickedLot?.lot_id ?? st.source_lot_id,
          source_inventory_lot_id: pickedLot?.inventory_lot_id ?? st.source_inventory_lot_id,
          manufacturing_date: pickedLot?.manufacturing_date ?? st.manufacturing_date,
          expiry_date: pickedLot?.expiry_date ?? st.expiry_date,
          lot_allocations: pickedLot?.lot_allocations ?? st.lot_allocations,
          scannedQty: scannedQtys[st.id] ?? 0, 
          qtyAvailable: Math.max(0, rawAvailable),
          isLoosePack: loosePack,
        };
      });

      return {
        ...group,
        items: enrichedItems
      };
    });
  }, [base.baseOrderGroups, scannedQtys, scannedInventory, itemLots]);

  const selectedGroup = useMemo(() => {
    if (!base.selectedOrderNo) return null;
    return orderGroups.find((g: OrderGroup) => g.orderNo === base.selectedOrderNo) || null;
  }, [base.selectedOrderNo, orderGroups]);

  // Fetch initial inventory for selected order
  useEffect(() => {
    if (!base.selectedOrderNo || !selectedGroup) return;

    const fetchInitialInventory = async () => {
      setFetchingAvailable(true);
      try {
        const newAvailable: Record<number, number> = { ...scannedInventory };
        const sourceBranch = selectedGroup.sourceBranch!;

        // Fetch all uncached product inventories in a single request
        const itemsToFetch = selectedGroup.items.filter((item: OrderGroupItem) => {
          const product = item.product_id as ProductRow;
          const pid = product?.product_id || item.product_id;
          return pid && scannedInventory[pid as number] === undefined;
        });

        if (itemsToFetch.length > 0) {
          await Promise.all(
            itemsToFetch.map(async (item: OrderGroupItem) => {
              const product = item.product_id as ProductRow;
              const pId = Number(product?.product_id || item.product_id || 0);
              if (!pId) return;

              const sp = new URLSearchParams();
              if (sourceBranch) sp.set('branch', String(sourceBranch));
              sp.set('product', String(pId));

              const res = await fetch(`/api/manufacturing/product-onhand?${sp.toString()}`, { cache: 'no-store' });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(`Failed to fetch inventory for product ${pId} (HTTP ${res.status}): ${JSON.stringify(errData)}`);
              }

              const data = await res.json();
              const list = Array.isArray(data) ? data : (data.data || []);
              let totalOnhand = 0;
              list.forEach((oh: { productId: number; onhandQuantity?: number; runningInventory?: number }) => {
                if (Number(oh.productId) === pId) {
                  totalOnhand += Math.max(0, Number(oh.onhandQuantity ?? oh.runningInventory ?? 0));
                }
              });

              newAvailable[pId] = totalOnhand;
            })
          );
          
          setScannedInventory(newAvailable);
        }
      } catch (err) {
        console.error('Failed to fetch initial available quantities:', err);
        toast.error("Inventory Error", {
          description: (err as Error).message || "Failed to fetch available stock"
        });
      } finally {
        setFetchingAvailable(false);
      }
    };

    fetchInitialInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.selectedOrderNo]);

  const dispatchOrder = async (orderNo: string) => {
    const group = orderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
    if (!group) return;

    base.setProcessing(true);
    try {
      await stockTransferLifecycleService.submitStatusUpdate({
        items: group.items.map((i: OrderGroupItem) => {
          const pickedLot = itemLots[i.id];
          return {
            id: i.id,
            status: 'For Loading',
            dispatched_quantity: scannedQtys[i.id] ?? i.picked_quantity ?? i.allocated_quantity ?? 0,
            batch_no: pickedLot?.batch_no ?? i.batch_no,
            source_lot_id: pickedLot?.lot_id ?? i.source_lot_id,
            source_inventory_lot_id: pickedLot?.inventory_lot_id ?? i.source_inventory_lot_id,
            manufacturing_date: pickedLot?.manufacturing_date ?? i.manufacturing_date ?? null,
            expiration_date: pickedLot?.expiry_date ?? i.expiry_date ?? null,
            lot_allocations: pickedLot?.lot_allocations ?? i.lot_allocations,
          };
        }),
        status: 'For Loading'
      });

      toast.success(`Order ${orderNo} successfully dispatched.`);
      base.setSelectedOrderNo(null);
      await base.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong while dispatching.';
      if (msg.includes('Unauthorized') || msg.includes('401')) {
        toast.error('Session Expired', { description: 'Please log in again to continue.' });
      } else {
        toast.error(msg);
      }
    } finally {
      base.setProcessing(false);
    }
  };

  const markAsPicked = async (orderNo: string) => {
    base.setProcessing(true);
    try {
      const group = orderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
      if (group) {
        await stockTransferLifecycleService.submitStatusUpdate({
          items: group.items.map((i: OrderGroupItem) => {
            const pickedLot = itemLots[i.id];
            return { 
              id: i.id, 
              status: 'Picked',
              picked_quantity: scannedQtys[i.id] ?? i.picked_quantity ?? 0,
              batch_no: pickedLot?.batch_no ?? i.batch_no,
              source_lot_id: pickedLot?.lot_id ?? i.source_lot_id,
              source_inventory_lot_id: pickedLot?.inventory_lot_id ?? i.source_inventory_lot_id,
              manufacturing_date: pickedLot?.manufacturing_date ?? i.manufacturing_date ?? null,
              expiration_date: pickedLot?.expiry_date ?? i.expiry_date ?? null,
              lot_allocations: pickedLot?.lot_allocations ?? i.lot_allocations,
            };
          }),
          status: 'Picked'
        });
        toast.success(`Successfully marked as Done Picking.`);
        await base.refresh();
      }
    } catch {
      toast.error('Failed to update status to Picked');
    } finally {
      base.setProcessing(false);
    }
  };

  return {
    ...base,
    orderGroups,
    selectedGroup,
    dispatchOrder,
    fetchingAvailable,
    scannedQtys,
    updateScannedQty,
    updateItemLot,
    updateItemAllocationPlan,
    markAsPicked,
  };
}
