'use client';

import { useState, useCallback, useEffect } from 'react';
import { stockTransferLifecycleService } from '../../services/stock-transfer.lifecycle';
import type { 
  StockTransferRow, 
  BranchRow, 
  ScannedItem,
  EnrichedProduct
} from '../../types/stock-transfer.types';
import type { StockAllocationPlan } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';
import { allocateStock } from '@/modules/manufacturing-management/shared/services/stock-allocation.engine';
import { toast } from 'sonner';

interface UseStockTransferRequestReturn {
  stockTransfers: StockTransferRow[];
  branches: BranchRow[];
  loading: boolean;
  confirming: boolean;
  sourceBranch: string;
  setSourceBranch: (v: string) => void;
  targetBranch: string;
  setTargetBranch: (v: string) => void;
  leadDate: string;
  setLeadDate: (v: string) => void;
  scannedItems: ScannedItem[];
  handleAddProduct: (product: EnrichedProduct) => void;
  updateQty: (rfid: string, qty: number) => void;
  updateAllocation: (rfid: string, plan: StockAllocationPlan) => void;
  removeItem: (rfid: string) => void;
  reset: () => void;
  confirmTransfer: () => Promise<void>;
  isTransferConfirmed: boolean;
  orderNo: string;
  status: string;
}

/**
 * Automatically allocates live FEFO batches for a given scanned item.
 */
async function autoAllocateItem(
  item: ScannedItem,
  branchId: string,
  qty: number
): Promise<ScannedItem> {
  const total = parseFloat((item.unitPrice * qty).toFixed(2));
  if (!branchId || Number(branchId) <= 0) {
    return { ...item, unitQty: qty, totalAmount: total };
  }
  try {
    const plan = await allocateStock({
      productId: item.productId,
      branchId: Number(branchId),
      requestedQuantity: qty,
    });
    if (plan.allocations && plan.allocations.length > 0) {
      const primary = plan.allocations[0];
      return {
        ...item,
        unitQty: qty,
        totalAmount: total,
        batch_no: primary.batch_no || null,
        lot_id: primary.lot_id ?? item.lot_id,
        inventory_lot_id: primary.inventory_lot_id ?? item.inventory_lot_id,
        manufacturing_date: primary.manufacturing_date ?? item.manufacturing_date,
        expiry_date: primary.expiry_date ?? item.expiry_date,
        qa_status: primary.qa_status ?? item.qa_status,
        allocations: plan.allocations,
        allocation_plan: plan,
      };
    }
  } catch (err) {
    console.warn('[useStockTransferRequest] Auto-FEFO allocation warning:', err);
  }
  return { ...item, unitQty: qty, totalAmount: total };
}

/**
 * Hook for managing the "Stock Transfer Request" phase (Creation).
 */
export function useStockTransferRequest(): UseStockTransferRequestReturn {
  const [stockTransfers, setStockTransfers] = useState<StockTransferRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [leadDate, setLeadDate] = useState('');
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [isTransferConfirmed, setIsTransferConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [transferStatus, setTransferStatus] = useState('');
  const [orderNo, setOrderNo] = useState('');

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await stockTransferLifecycleService.fetchTransfers();
        if (isMounted) {
          setStockTransfers(res.stockTransfers ?? []);
          setBranches(res.branches ?? []);
        }
      } catch (err) {
        console.error('useStockTransferRequest fetch error:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSetSourceBranch = useCallback((newBranch: string) => {
    setSourceBranch(newBranch);
    if (!newBranch || Number(newBranch) <= 0) return;

    // Automatically re-run FEFO allocation for all existing items against the new branch
    setScannedItems((prev) => {
      if (prev.length === 0) return prev;
      Promise.all(
        prev.map((item) => autoAllocateItem(item, newBranch, item.unitQty || 1))
      ).then((updated) => {
        setScannedItems(updated);
      });
      return prev;
    });
  }, []);

  const updateQty = useCallback((rfid: string, qty: number) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.rfid !== rfid) return item;
        const total = parseFloat((item.unitPrice * qty).toFixed(2));
        return { ...item, unitQty: qty, totalAmount: total };
      })
    );

    if (sourceBranch && Number(sourceBranch) > 0) {
      setScannedItems((prev) => {
        const targetItem = prev.find((it) => it.rfid === rfid);
        if (targetItem) {
          autoAllocateItem(targetItem, sourceBranch, qty).then((allocatedItem) => {
            setScannedItems((current) =>
              current.map((it) => (it.rfid === rfid ? allocatedItem : it))
            );
          });
        }
        return prev;
      });
    }
  }, [sourceBranch]);

  const handleAddProduct = useCallback((product: EnrichedProduct) => {
    const productId = product.product_id;
    
    // If product already in list, just increment quantity
    const existing = scannedItems.find((item) => item.productId === productId);
    if (existing) {
      updateQty(existing.rfid, (existing.unitQty || 1) + 1);
      return;
    }

    // Generate a unique row key for the added item
    const rfid = `item-${productId}-${Date.now().toString().slice(-4)}`;
    
    let extractedUnit = 'unit';
    let unitId = 0;
    if (typeof product.unit_of_measurement === 'object' && product.unit_of_measurement !== null) {
      extractedUnit = product.unit_of_measurement.unit_name || 'unit';
      unitId = product.unit_of_measurement.unit_id || 0;
    } else if (product.unit_of_measurement) {
      unitId = Number(product.unit_of_measurement);
    }

    const price = product.price_per_unit || product.cost_per_unit || 0;

    let extractedBrand = 'N/A';
    if (typeof product.product_brand === 'object' && product.product_brand !== null) {
      extractedBrand = product.product_brand.brand_name || 'N/A';
    }

    const newItem: ScannedItem = {
      rfid,
      productId,
      productName: product.description || product.product_name,
      description: product.barcode || product.product_code || '',
      brandName: extractedBrand,
      unit: extractedUnit,
      unitId,
      qtyAvailable: Number(product.qtyAvailable || 0), 
      unitQty: 1, 
      unitPrice: price,
      totalAmount: price,
      productImage: product.product_image || null,
    };
    
    setScannedItems((prev) => [newItem, ...prev]);

    // Automatically trigger FEFO allocation in background
    if (sourceBranch && Number(sourceBranch) > 0) {
      autoAllocateItem(newItem, sourceBranch, 1).then((allocatedItem) => {
        setScannedItems((prev) =>
          prev.map((it) => (it.rfid === rfid ? allocatedItem : it))
        );
      });
    }
  }, [scannedItems, updateQty, sourceBranch]);

  const removeItem = useCallback((rfid: string) => {
    setScannedItems((prev) => prev.filter((item) => item.rfid !== rfid));
  }, []);

  const reset = useCallback(() => {
    setSourceBranch('');
    setTargetBranch('');
    setLeadDate('');
    setScannedItems([]);
    setIsTransferConfirmed(false);
    setTransferStatus('');
    setOrderNo('');
  }, []);

  const confirmTransfer = useCallback(async () => {
    setConfirming(true);
    try {
      // Ensure all items have FEFO allocations populated before submitting
      const itemsToSubmit = await Promise.all(
        scannedItems.map(async (item) => {
          if (item.allocations && item.allocations.length > 0) return item;
          if (!sourceBranch || Number(sourceBranch) <= 0) return item;
          return await autoAllocateItem(item, sourceBranch, item.unitQty || 1);
        })
      );

      const res = await stockTransferLifecycleService.submitTransferRequest({ 
        sourceBranch, 
        targetBranch, 
        leadDate, 
        scannedItems: itemsToSubmit,
      });

      setIsTransferConfirmed(true);
      if (res.orderNo) {
        setOrderNo(res.orderNo);
        setTransferStatus(`For Approval (Order: ${res.orderNo})`);
      } else {
        setTransferStatus('For Approval');
      }
      toast.success('Transfer request submitted successfully!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      console.error('confirmTransfer error:', err);

      if (message.includes('Unauthorized') || message.includes('401')) {
        toast.error('Session Expired', {
          description: 'Please log in again to continue.',
        });
      } else {
        toast.error('Submission failed', { description: message });
      }
    } finally {
      setConfirming(false);
    }
  }, [sourceBranch, targetBranch, leadDate, scannedItems]);

  const updateAllocation = useCallback((rfid: string, plan: StockAllocationPlan) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.rfid !== rfid) return item;
        const primary = plan.allocations[0];
        return {
          ...item,
          batch_no: primary?.batch_no || null,
          lot_id: primary?.lot_id ?? item.lot_id,
          inventory_lot_id: primary?.inventory_lot_id ?? item.inventory_lot_id,
          manufacturing_date: primary?.manufacturing_date ?? item.manufacturing_date,
          expiry_date: primary?.expiry_date ?? item.expiry_date,
          qa_status: primary?.qa_status ?? item.qa_status,
          allocations: plan.allocations,
          allocation_plan: plan,
        };
      })
    );
  }, []);

  return {
    stockTransfers,
    branches,
    loading,
    confirming,
    sourceBranch,
    setSourceBranch: handleSetSourceBranch,
    targetBranch,
    setTargetBranch,
    leadDate,
    setLeadDate,
    scannedItems,
    handleAddProduct,
    updateQty,
    updateAllocation,
    removeItem,
    reset,
    confirmTransfer,
    isTransferConfirmed,
    orderNo,
    status: transferStatus,
  };
}
