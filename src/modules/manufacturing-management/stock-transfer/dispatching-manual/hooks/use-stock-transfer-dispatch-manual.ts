'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStockTransferBase } from '../../shared/hooks/use-stock-transfer-base';
import { stockTransferLifecycleService } from '../../services/stock-transfer.lifecycle';
import { toast } from 'sonner';
import type { OrderGroup, OrderGroupItem, ProductRow } from '../../types/stock-transfer.types';

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

  const updateScannedQty = useCallback((id: number, qty: number, maxQty: number) => {
    setScannedQtys(prev => {
      const validQty = Math.max(0, Math.min(qty, maxQty));
      return { ...prev, [id]: validQty };
    });
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

        return {
          ...st,
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
  }, [base.baseOrderGroups, scannedQtys, scannedInventory]);

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
      await stockTransferLifecycleService.submitManualDispatch(
        group.items.map((i: OrderGroupItem) => i.id),
        'For Loading'
      );

      toast.success(`Order ${orderNo} successfully dispatched manually.`);
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
          items: group.items.map((i: OrderGroupItem) => ({ 
            id: i.id, 
            status: 'Picked',
            picked_quantity: scannedQtys[i.id] ?? i.picked_quantity ?? 0 
          })),
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
    markAsPicked,
  };
}
