'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Gauge 
} from 'lucide-react';
import {
  MMLot,
  QAStatus,
  LotAllocationGroup,
  BatchRowAllocation,
} from '../types/lot-tracking.types';
import { fetchLotsByBranch, fetchInventoryLots, fetchBatchOnhand } from '../services/lot-tracking.service';
import { SearchableSelect } from './SearchableSelect';

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

interface LotBatchSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId?: number;
  productId?: number;
  productName?: string;
  productCode?: string;
  productUomId?: number | null;
  productUomName?: string;
  requestedQuantity?: number;
  adjustmentType?: 'IN' | 'OUT';
  mode?: 'SELECT_EXISTING' | 'CREATE_OR_ASSIGN';
  initialValues?: Partial<LotBatchSelectionResult>;
  initialLotAllocations?: LotAllocationGroup[];
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
  requestedQuantity = 1,
  adjustmentType = 'IN',
  initialValues,
  initialLotAllocations,
  onConfirm,
}: LotBatchSelectionModalProps) {
  const [lots, setLots] = useState<MMLot[]>([]);
  const [loading, setLoading] = useState(false);

  // Maps for tracking lot capacities and available onhand quantities across entire branch
  const [lotBatchCountMap, setLotBatchCountMap] = useState<Map<number, number>>(new Map());
  const [lotStockQtyMap, setLotStockQtyMap] = useState<Map<number, number>>(new Map());

  // Multi-Lot Allocation Groups State
  const [lotGroups, setLotGroups] = useState<LotAllocationGroup[]>([]);

  // Toolbar Dates (stored locally until user explicitly clicks 'Apply to all')
  const [toolbarDates, setToolbarDates] = useState<Record<number, { mfg: string; exp: string }>>({});

  // Initialize clean state and load lots whenever modal opens or product changes
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setLotGroups([]);
        setToolbarDates({});
      });
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [lotsData, branchInvLotsData, branchOnhandData] = await Promise.all([
          fetchLotsByBranch(branchId),
          fetchInventoryLots({ branchId }),
          fetchBatchOnhand({ branchId }),
        ]);

        if (!isMounted) return;

        setLots(lotsData || []);

        // Count existing active batches and current stock per lot across the whole branch
        const bCountMap = new Map<number, number>();
        const sQtyMap = new Map<number, number>();

        (branchOnhandData || []).forEach((bo) => {
          const lId = Number(bo.lotId);
          if (lId > 0) {
            sQtyMap.set(lId, (sQtyMap.get(lId) || 0) + Number(bo.onhandQuantity || 0));
          }
        });

        (branchInvLotsData || []).forEach((ib) => {
          const lId = Number(ib.lot_id);
          if (lId > 0) {
            bCountMap.set(lId, (bCountMap.get(lId) || 0) + 1);
            if (!sQtyMap.has(lId)) {
              sQtyMap.set(lId, (sQtyMap.get(lId) || 0) + Number(ib.available_quantity || 0));
            }
          }
        });

        setLotBatchCountMap(bCountMap);
        setLotStockQtyMap(sQtyMap);

        // 1. If item already has structured lot allocations, restore them cleanly
        if (initialLotAllocations && initialLotAllocations.length > 0) {
          const hydrated = initialLotAllocations.map((g) => {
            const matchedLot = (lotsData || []).find((l) => Number(l.lot_id) === Number(g.lot_id));
            const lId = Number(g.lot_id);
            return {
              ...g,
              lot_name: matchedLot?.lot_name || g.lot_name || `Lot #${g.lot_id}`,
              max_batch_capacity: matchedLot?.max_batch_capacity || g.max_batch_capacity || 10,
              unit_id: matchedLot?.unit_id !== undefined ? matchedLot.unit_id : g.unit_id,
              unit_name: matchedLot?.unit_name || g.unit_name,
              active_batch_count: bCountMap.get(lId) || 0,
              current_stock_quantity: sQtyMap.get(lId) || 0,
              batches: (g.batches || []).map((b) => ({
                ...b,
                quantity: Number(b.quantity || 1),
                qa_status: b.qa_status || 'GOOD',
              })),
            };
          });
          setLotGroups(hydrated);
          return;
        }

        // 2. If legacy initialValues provided (single lot & batch)
        if (initialValues?.lot_id && initialValues?.batch_no) {
          const lId = Number(initialValues.lot_id);
          const matchedLot = (lotsData || []).find((l) => Number(l.lot_id) === lId);
          setLotGroups([
            {
              lot_id: lId,
              lot_name: matchedLot?.lot_name || initialValues.lot_name || `Lot #${lId}`,
              max_batch_capacity: matchedLot?.max_batch_capacity || 10,
              unit_id: matchedLot?.unit_id ?? null,
              unit_name: matchedLot?.unit_name ?? null,
              allocated_quantity: requestedQuantity,
              active_batch_count: bCountMap.get(lId) || 0,
              current_stock_quantity: sQtyMap.get(lId) || 0,
              batches: [
                {
                  inventory_lot_id: initialValues.inventory_lot_id,
                  batch_no: initialValues.batch_no || '',
                  manufacturing_date: initialValues.manufacturing_date || '',
                  expiry_date: initialValues.expiry_date || '',
                  quantity: requestedQuantity,
                  unit_cost: initialValues.unit_cost,
                  qa_status: initialValues.qa_status || 'GOOD',
                },
              ],
            },
          ]);
          return;
        }

        // 3. Fresh clean initialization for new product
        // Find first compatible active lot
        const compatibleLot = (lotsData || []).find((l) => {
          if (l.status && l.status !== 'ACTIVE') return false;
          if (l.unit_id && productUomId && Number(l.unit_id) !== Number(productUomId)) return false;
          return true;
        }) || lotsData?.[0];

        if (compatibleLot) {
          const lId = Number(compatibleLot.lot_id);
          setLotGroups([
            {
              lot_id: lId,
              lot_name: compatibleLot.lot_name,
              max_batch_capacity: compatibleLot.max_batch_capacity || 10,
              unit_id: compatibleLot.unit_id ?? null,
              unit_name: compatibleLot.unit_name ?? null,
              allocated_quantity: requestedQuantity,
              active_batch_count: bCountMap.get(lId) || 0,
              current_stock_quantity: sQtyMap.get(lId) || 0,
              batches: [
                {
                  batch_no: '',
                  manufacturing_date: '',
                  expiry_date: '',
                  quantity: requestedQuantity,
                  qa_status: 'GOOD',
                },
              ],
            },
          ]);
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
  }, [open, branchId, productId, requestedQuantity, productUomId, initialLotAllocations, initialValues]);

  // Compute total allocated quantity across all lots & batches
  const totalAllocated = useMemo(() => {
    return lotGroups.reduce((lotSum, group) => {
      const batchSum = (group.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0);
      return lotSum + batchSum;
    }, 0);
  }, [lotGroups]);

  const quantityDifference = requestedQuantity - totalAllocated;
  const isQuantityBalanced = totalAllocated === requestedQuantity;

  // Add a new storage lot allocation group
  const handleAddLotGroup = () => {
    const usedLotIds = new Set(lotGroups.map((g) => Number(g.lot_id)));
    const nextLot = lots.find((l) => !usedLotIds.has(Number(l.lot_id))) || lots[0];

    if (!nextLot) return;

    const remainingQty = Math.max(1, quantityDifference);
    const lId = Number(nextLot.lot_id);

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
          batch_no: '',
          manufacturing_date: '',
          expiry_date: '',
          quantity: remainingQty,
          qa_status: 'GOOD',
        },
      ],
    };

    setLotGroups([...lotGroups, newGroup]);
  };

  // Remove a storage lot allocation group
  const handleRemoveLotGroup = (index: number) => {
    setLotGroups(lotGroups.filter((_, i) => i !== index));
  };

  // Change selected lot inside a group
  const handleChangeLot = (groupIndex: number, newLotIdStr: string) => {
    const newLotId = Number(newLotIdStr);
    const matchedLot = lots.find((l) => Number(l.lot_id) === newLotId);
    if (!matchedLot) return;

    setLotGroups(
      lotGroups.map((g, i) => {
        if (i === groupIndex) {
          return {
            ...g,
            lot_id: newLotId,
            lot_name: matchedLot.lot_name,
            max_batch_capacity: matchedLot.max_batch_capacity || 10,
            unit_id: matchedLot.unit_id ?? null,
            unit_name: matchedLot.unit_name ?? null,
            active_batch_count: lotBatchCountMap.get(newLotId) || 0,
            current_stock_quantity: lotStockQtyMap.get(newLotId) || 0,
          };
        }
        return g;
      })
    );
  };

  // Add a new batch split under a specific lot
  const handleAddBatch = (groupIndex: number) => {
    setLotGroups(
      lotGroups.map((g, i) => {
        if (i === groupIndex) {
          const newBatch: BatchRowAllocation = {
            batch_no: '',
            manufacturing_date: '',
            expiry_date: '',
            quantity: 1,
            qa_status: 'GOOD',
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
              return { ...b, [field]: value };
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

  // Comprehensive Validation for Current Quantity, Allocating Quantity, Capacities, and UOM
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (lotGroups.length === 0) {
      errors.push('At least one storage lot must be assigned.');
      return errors;
    }

    // 1. Target Requested Quantity vs Total Allocating Quantity Check
    if (totalAllocated !== requestedQuantity) {
      if (totalAllocated < requestedQuantity) {
        errors.push(
          `Under-allocated! Allocating ${totalAllocated.toLocaleString()} ${productUomName} total, but requested target is ${requestedQuantity.toLocaleString()} ${productUomName} (short by ${(requestedQuantity - totalAllocated).toLocaleString()} ${productUomName}).`
        );
      } else {
        errors.push(
          `Over-allocated! Allocating ${totalAllocated.toLocaleString()} ${productUomName} total, exceeding requested target of ${requestedQuantity.toLocaleString()} ${productUomName} (excess of ${(totalAllocated - requestedQuantity).toLocaleString()} ${productUomName}).`
        );
      }
    }

    lotGroups.forEach((g, gIdx) => {
      // 2. UOM Integrity Check
      if (g.unit_id && productUomId && Number(g.unit_id) !== Number(productUomId)) {
        errors.push(
          `Lot #${gIdx + 1} (${g.lot_name}): UOM Mismatch! Lot requires UOM #${g.unit_id}${g.unit_name ? ` (${g.unit_name})` : ''
          }, but product is ${productUomName}.`
        );
      }

      // 3. Current Quantity vs Allocating Quantity vs Max Capacity Check
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

      // 4. Stock OUT Validation: Cannot deduct more than available in lot
      if (adjustmentType === 'OUT' && allocatingQty > currentStockQty) {
        errors.push(
          `Lot #${gIdx + 1} (${g.lot_name}): Cannot deduct ${allocatingQty.toLocaleString()} ${productUomName} for Stock OUT. Only ${currentStockQty.toLocaleString()} ${productUomName} currently available in this lot.`
        );
      }

      // 5. Batch Row Level Validations
      if (!g.batches || g.batches.length === 0) {
        errors.push(`Lot #${gIdx + 1} (${g.lot_name}): Must contain at least 1 batch split.`);
      } else {
        g.batches.forEach((b, bIdx) => {
          const bQty = Number(b.quantity || 0);
          if (!b.batch_no || String(b.batch_no).trim() === '') {
            errors.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Batch number is required.`);
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
        });
      }
    });

    return errors;
  }, [lotGroups, totalAllocated, requestedQuantity, productUomId, productUomName, adjustmentType]);

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
            <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2">
              <span>PRODUCT: <strong className="text-foreground">{productName || 'Selected Item'}</strong></span>
              {productCode && <Badge variant="outline" className="text-[10px] font-mono">{productCode}</Badge>}
              <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                UOM: {productUomName}
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
                {requestedQuantity.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{productUomName}</span>
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
              {/* ALLOCATION SUMMARY TRACKER BAR */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${isQuantityBalanced
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : quantityDifference > 0
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base ${isQuantityBalanced
                      ? 'bg-emerald-500 text-white'
                      : quantityDifference > 0
                        ? 'bg-amber-500 text-white'
                        : 'bg-rose-500 text-white'
                      }`}
                  >
                    {isQuantityBalanced ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider">
                      {isQuantityBalanced
                        ? 'Quantity Balanced & Ready'
                        : quantityDifference > 0
                          ? `Under-Allocated: ${quantityDifference.toLocaleString()} ${productUomName} Remaining`
                          : `Over-Allocated: ${Math.abs(quantityDifference).toLocaleString()} ${productUomName} Excess`}
                    </div>
                    <div className="text-xs opacity-80 mt-0.5">
                      Total Allocating: <strong className="font-mono font-black">{totalAllocated.toLocaleString()}</strong> / Target:{' '}
                      <strong className="font-mono font-black">{requestedQuantity.toLocaleString()}</strong> {productUomName} across {lotGroups.length} lot(s).
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddLotGroup}
                  className="h-9 text-xs font-bold gap-1.5 shrink-0 bg-background border-border shadow-sm hover:bg-muted"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Assign Another Storage Lot
                </Button>
              </div>

              {/* LOT ALLOCATION GROUPS */}
              {lotGroups.map((group, gIdx) => {
                const groupLot = lots.find((l) => Number(l.lot_id) === Number(group.lot_id));
                const lotUomId = groupLot?.unit_id ?? group.unit_id;
                const lotUomName = groupLot?.unit_name ?? group.unit_name;
                const isUomMatch = !lotUomId || (productUomId && Number(lotUomId) === Number(productUomId));
                const isUomNull = lotUomId === null || lotUomId === undefined;

                // Live Quantity-Based Capacity calculation metrics
                const activeBatchCount = group.active_batch_count || 0;
                const currentStockQty = group.current_stock_quantity || 0;
                const newBatchesInModal = group.batches.length;
                const groupQtyTotal = (group.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0);
                const projectedTotalStock = currentStockQty + groupQtyTotal;
                const maxCap = group.max_batch_capacity || 0;

                const availableSpace = Math.max(0, maxCap - currentStockQty);
                const isCapacityExceeded = maxCap > 0 && projectedTotalStock > maxCap;
                const isNearCapacity = maxCap > 0 && projectedTotalStock >= maxCap * 0.8 && !isCapacityExceeded;

                const currentStockPct = maxCap > 0 ? Math.min(100, Math.round((currentStockQty / maxCap) * 100)) : 0;
                const allocatingPct = maxCap > 0 ? Math.min(100, Math.round((groupQtyTotal / maxCap) * 100)) : 0;
                const projectedUtilizationPct = maxCap > 0 ? Math.min(100, Math.round((projectedTotalStock / maxCap) * 100)) : 0;
                const overage = projectedTotalStock - maxCap;

                return (
                  <div
                    key={`lot-group-${gIdx}`}
                    className={`bg-card rounded-2xl border transition-all shadow-sm ${!isUomMatch
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
                            <SearchableSelect
                              options={lots.map((l) => {
                                const isMatch = !l.unit_id || (productUomId && Number(l.unit_id) === Number(productUomId));
                                return {
                                  value: String(l.lot_id),
                                  label: `${l.lot_name}${l.max_batch_capacity ? ` (Cap: ${l.max_batch_capacity.toLocaleString()} ${l.unit_name || productUomName})` : ''}${!isMatch ? ' [UOM Mismatch]' : ''}`,
                                };
                              })}
                              value={String(group.lot_id)}
                              onValueChange={(val) => handleChangeLot(gIdx, val)}
                              placeholder="Select Storage Lot / Bay..."
                              searchPlaceholder="Search lot name..."
                              emptyMessage="No storage lots found."
                              className="h-9 text-xs font-bold"
                            />
                          </div>
                        </div>

                        {/* UOM BADGE & CAPACITY BADGE */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isUomNull ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">
                              UOM: Unrestricted / Generic
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
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Allocating in this Lot</span>
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

                    {/* LIVE 4-METRIC CAPACITY & ALLOCATION ANALYSIS PANEL */}
                    <div className="px-4 py-3 bg-muted/10 border-b border-border/60 space-y-2.5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        {/* 1. Current Quantity in Lot */}
                        <div className="p-2.5 bg-background rounded-lg border border-border/60 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">1. Current Stock in Lot</span>
                          <div className="text-xs font-mono font-bold text-foreground mt-0.5">
                            {currentStockQty.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{productUomName}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{currentStockPct}% of max ({activeBatchCount} bch)</span>
                        </div>

                        {/* 2. Allocating Quantity */}
                        <div className="p-2.5 bg-primary/5 rounded-lg border border-primary/20 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-primary block">2. Allocating Now</span>
                          <div className="text-xs font-mono font-black text-primary mt-0.5">
                            +{groupQtyTotal.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{productUomName}</span>
                          </div>
                          <span className="text-[10px] text-primary/80">+{allocatingPct}% of capacity ({newBatchesInModal} bch)</span>
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
                          </span>
                        </div>
                      </div>

                      {/* STACKED DUAL PROGRESS BAR */}
                      <div className="space-y-1">
                        <div className="w-full bg-muted/60 rounded-full h-2.5 overflow-hidden border border-border/40 flex">
                          {/* Segment 1: Current Stock */}
                          <div
                            className="h-full bg-slate-500/60 dark:bg-slate-400/60 transition-all duration-300"
                            style={{ width: `${Math.min(100, currentStockPct)}%` }}
                            title={`Current Stock: ${currentStockQty} ${productUomName} (${currentStockPct}%)`}
                          />
                          {/* Segment 2: Allocating Stock */}
                          <div
                            className={`h-full transition-all duration-300 ${isCapacityExceeded
                              ? 'bg-red-600'
                              : isNearCapacity
                                ? 'bg-amber-500'
                                : 'bg-primary'
                              }`}
                            style={{ width: `${Math.min(100 - currentStockPct, allocatingPct)}%` }}
                            title={`Allocating: +${groupQtyTotal} ${productUomName} (+${allocatingPct}%)`}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-0.5">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Current ({currentStockQty} {productUomName})
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-primary inline-block" /> Allocating (+{groupQtyTotal} {productUomName})
                          </span>
                          <span>Max: {maxCap.toLocaleString()} {productUomName}</span>
                        </div>
                      </div>
                    </div>

                    {/* WARNING ALERTS */}
                    {(!isUomMatch || isCapacityExceeded || isNearCapacity) && (
                      <div className="p-3 mx-4 mt-3 rounded-lg text-xs space-y-1.5 bg-muted/30 border border-border">
                        {!isUomMatch && (
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>This storage lot is reserved for UOM {lotUomName || `#${lotUomId}`}. Please select a compatible lot matching product UOM ({productUomName}).</span>
                          </div>
                        )}
                        {isCapacityExceeded && (
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Storage lot max capacity exceeded! Max limit is {maxCap.toLocaleString()} ${productUomName}. Current stock is {currentStockQty.toLocaleString()} ${productUomName}, and allocating {groupQtyTotal.toLocaleString()} ${productUomName} reaches {projectedTotalStock.toLocaleString()} ${productUomName} (+{overage.toLocaleString()} ${productUomName} excess). Please reduce quantity or split into another storage lot.</span>
                          </div>
                        )}
                        {isNearCapacity && (
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Notice: This storage lot will be at {projectedUtilizationPct}% capacity ({projectedTotalStock.toLocaleString()} / {maxCap.toLocaleString()} {productUomName}).</span>
                          </div>
                        )}
                      </div>
                    )}

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
                          return (
                            <div
                              key={`lot-${gIdx}-batch-${bIdx}`}
                              className="p-3.5 rounded-xl border border-border/80 bg-background flex flex-col md:flex-row items-stretch md:items-center gap-3.5 shadow-xs"
                            >
                              {/* Batch Number */}
                              <div className="flex-1 min-w-[200px]">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  Batch Number *
                                </Label>
                                <Input
                                  value={batch.batch_no}
                                  onChange={(e) => handleUpdateBatchField(gIdx, bIdx, 'batch_no', e.target.value)}
                                  placeholder="e.g. BATCH-2026-001"
                                  className="h-9 text-xs font-medium"
                                />
                              </div>

                              {/* Quantity */}
                              <div className="w-32 shrink-0">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  Quantity *
                                </Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={batch.quantity === 0 || batch.quantity === undefined ? '' : batch.quantity}
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
                                    if (isNaN(val) || val < 1) {
                                      handleUpdateBatchField(gIdx, bIdx, 'quantity', 1);
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
                              <div className="w-36 shrink-0">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                                  QA Status *
                                </Label>
                                <Select
                                  value={batch.qa_status}
                                  onValueChange={(val) => handleUpdateBatchField(gIdx, bIdx, 'qa_status', val as QAStatus)}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GOOD" className="text-xs">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> GOOD
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="DAMAGED" className="text-xs">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-rose-500" /> DAMAGED
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="QUARANTINED" className="text-xs">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" /> QUARANTINED
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="EXPIRED" className="text-xs">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-red-600" /> EXPIRED
                                      </span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
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

        {/* FOOTER & VALIDATION SUMMARY */}
        <DialogFooter className="p-4 border-t border-border bg-card shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground text-left flex-1">
            {validationErrors.length > 0 ? (
              <span className="text-red-500 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {validationErrors[0]}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                All storage lots, capacities ({requestedQuantity.toLocaleString()} {productUomName}), and batch splits are valid.
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
