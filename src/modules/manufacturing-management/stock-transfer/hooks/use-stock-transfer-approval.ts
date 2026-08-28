import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useStockTransferBase } from './use-stock-transfer-base';
import { stockTransferLifecycleService } from '../services/stock-transfer.lifecycle';
import type { OrderGroup, OrderGroupItem, ProductRow } from '../types/stock-transfer.types';

const APPROVAL_STATUSES = ['Requested'];

/**
 * Hook for managing the "Stock Transfer Approval" phase.
 */
export function useStockTransferApproval() {
  const base = useStockTransferBase({ statuses: APPROVAL_STATUSES });
  
  const [allocatedQtys, setAllocatedQtys] = useState<Record<number, number>>({});
  const [availableQtys, setAvailableQtys] = useState<Record<number, number>>({});
  const [fetchingAvailable, setFetchingAvailable] = useState(false);

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
    } catch (e) {
      console.warn('Error audio failed:', e);
    }
  };

  // Fetch available quantities when a group is selected
  useEffect(() => {
    if (!base.selectedGroup) return;

    const fetchAvailable = async () => {
      setFetchingAvailable(true);
      try {
        const group = base.selectedGroup!;
        const sourceBranchId = group.sourceBranch;
        
        const newAvailable: Record<number, number> = {};
        const newAllocated: Record<number, number> = {};

        // Query authoritative /api/manufacturing/product-onhand directly for each item
        const invMap = new Map<number, number>();

        await Promise.all(
          group.items.map(async (item: OrderGroupItem) => {
            const product = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as ProductRow) : null;
            const pId = Number(product?.product_id || item.product_id || 0);
            if (!pId) return;

            const sp = new URLSearchParams();
            if (sourceBranchId) sp.set('branch', String(sourceBranchId));
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
            invMap.set(pId, totalOnhand);
          })
        );

        // Directly use the live on-hand balance from Spring Boot
        group.items.forEach((item: OrderGroupItem) => {
          const product = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as ProductRow) : null;
          const pId = Number(product?.product_id || item.product_id || 0);
          
          const realAvailable = invMap.get(pId) ?? 0;

          newAvailable[item.id] = realAvailable;
          
          // Strict Enforcement: Allocation cannot exceed available stock.
          newAllocated[item.id] = Math.min(Number(item.ordered_quantity || 0), realAvailable);
        });

        setAvailableQtys(newAvailable);
        setAllocatedQtys(newAllocated);
      } catch (err) {
        console.error('Failed to fetch available quantities:', err);
        toast.error("Inventory Error", {
          description: (err as Error).message || "Failed to fetch available stock"
        });
      } finally {
        setFetchingAvailable(false);
      }
    };

    fetchAvailable();
  }, [base.selectedGroup, base.getBranchName, base]);

  const updateAllocatedQty = (itemId: number, qty: number, maxAllowed: number) => {
    const boundedQty = Math.max(0, Math.min(isNaN(qty) ? 0 : qty, maxAllowed));
    setAllocatedQtys(prev => ({ ...prev, [itemId]: boundedQty }));
  };

  const updateStatus = async (orderNo: string, status: 'approved' | 'rejected') => {
    const group = base.baseOrderGroups.find((g: OrderGroup) => g.orderNo === orderNo);
    if (!group) return;

    base.setProcessing(true);
    try {
      const finalStatus = status === 'approved' ? 'For Picking' : 'Rejected';
      
      if (status === 'approved') {
        let totalAllocated = 0;
        for (const item of group.items) {
          const allocated = allocatedQtys[item.id] ?? item.ordered_quantity ?? 0;
          const available = availableQtys[item.id] || 0;
          const maxAllowed = Math.min(item.ordered_quantity || 0, available);
          totalAllocated += allocated;

          if (allocated > maxAllowed) {
            toast.error(`Invalid Allocation`, {
              description: `Allocated quantity for ${(item.product_id as ProductRow)?.product_name || 'item'} exceeds ordered quantity or available stock.`
            });
            base.setProcessing(false);
            return;
          }
        }

        if (totalAllocated === 0) {
          toast.error(`Approval Blocked`, {
            description: `You cannot approve a transfer with zero total allocated quantity.`
          });
          base.setProcessing(false);
          return;
        }
      }

      const itemsPayload = group.items.map((item: OrderGroupItem) => {
        const payload: { id: number; status: string; allocated_quantity?: number } = {
          id: item.id,
          status: finalStatus
        };
        if (status === 'approved') {
          payload.allocated_quantity = allocatedQtys[item.id] ?? item.ordered_quantity ?? 0;
        }
        return payload;
      });

      await stockTransferLifecycleService.submitStatusUpdate({ 
        items: itemsPayload, 
        status: finalStatus 
      });

      toast.success(`Order ${orderNo} successfully ${status}.`);
      base.setSelectedOrderNo(null);
      await base.refresh(); 
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong while updating status.';
      console.error('Status update failed:', err);
      playErrorSound();
      toast.error(message);
    } finally {
      base.setProcessing(false);
    }
  };

  return {
    ...base,
    orderGroups: base.baseOrderGroups,
    updateStatus,
    allocatedQtys,
    availableQtys,
    fetchingAvailable,
    updateAllocatedQty,
  };
}
