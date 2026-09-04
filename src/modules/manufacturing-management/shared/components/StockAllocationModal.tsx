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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Layers,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  RotateCcw,
  ShieldAlert,
  Info,
} from 'lucide-react';
import {
  MMInventoryLot,
  StockAllocationPlan,
  BatchAllocationResult,
  AllocationStrategy,
  QAStatus,
} from '../types/lot-tracking.types';
import { fetchBatchOnhand, fetchLotsByBranch, isBadStockLot } from '../services/lot-tracking.service';
import { allocateStockSync } from '../services/stock-allocation.engine';

export interface StockAllocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  productName?: string;
  branchId: number;
  targetBranchId?: number | null;
  targetBranchName?: string;
  isTargetBadStock?: boolean;
  requestedQuantity: number;
  uomName?: string;
  initialAllocations?: BatchAllocationResult[];
  onConfirm: (plan: StockAllocationPlan) => void;
}

export function StockAllocationModal({
  open,
  onOpenChange,
  productId,
  productName,
  branchId,
  targetBranchId: _targetBranchId,
  targetBranchName,
  isTargetBadStock,
  requestedQuantity,
  uomName = 'units',
  initialAllocations,
  onConfirm,
}: StockAllocationModalProps) {
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<MMInventoryLot[]>([]);
  const [strategy, setStrategy] = useState<AllocationStrategy>('FEFO');
  const [allowExpiredOverride, setAllowExpiredOverride] = useState(false);
  const [manualAllocations, setManualAllocations] = useState<Record<number, number>>({});
  const [isManualMode, setIsManualMode] = useState(false);

  const isTargetBranchBadStock = useMemo(() => {
    if (isTargetBadStock !== undefined) return isTargetBadStock;
    if (targetBranchName) return isBadStockLot(undefined, { branch_name: targetBranchName });
    return false;
  }, [isTargetBadStock, targetBranchName]);

  // Auto-toggle expired stock override if target branch is designated as bad stock
  useEffect(() => {
    if (open && isTargetBranchBadStock) {
      setAllowExpiredOverride(true);
    }
  }, [open, isTargetBranchBadStock]);

  // Load batches when modal opens
  useEffect(() => {
    if (!open || !productId || !branchId) return;

    let isMounted = true;

    const loadBatches = async () => {
      setLoading(true);
      try {
        // Spring Boot /api/mm-batch-onhand is authoritative source for live quantities
        // Also fetch mm_lots from Directus to resolve exact lot names for each lot_id
        const [onhandData, branchLots] = await Promise.all([
          fetchBatchOnhand({ branchId, productId }),
          fetchLotsByBranch(branchId).catch(() => []),
        ]);

        if (isMounted) {
          const lotMap = new Map<number, string>();
          (branchLots || []).forEach((l) => {
            if (l.lot_id && l.lot_name) {
              lotMap.set(l.lot_id, l.lot_name);
            }
          });

          // Group and aggregate onhand quantities by batchNo for the selected branch
          const batchMap = new Map<string, {
            inventoryLotId: number;
            lotId: number;
            branchId: number;
            productId: number;
            batchNo: string;
            manufacturingDate: string | null;
            expirationDate: string | null;
            inventoryCondition: QAStatus;
            netOnhand: number;
            lotName?: string;
            productName?: string;
            productCode?: string;
          }>();

          for (const oh of onhandData) {
            if (Number(oh.branchId) !== Number(branchId)) continue;
            const key = oh.batchNo || `lot-${oh.inventoryLotId || oh.lotId}`;
            const existing = batchMap.get(key);
            const qty = Number(oh.onhandQuantity || 0);

            const lotIdNum = Number(oh.lotId || 0);
            const resolvedLotName = (lotIdNum > 0 ? lotMap.get(lotIdNum) : undefined) || oh.lotName;
            const cleanLotName = resolvedLotName
              ? resolvedLotName.replace(/^lot\s*[:#-]?\s*/i, '').trim()
              : (lotIdNum > 0 ? `${lotIdNum}` : '');

            if (existing) {
              existing.netOnhand += qty;
              if (!existing.expirationDate && oh.expirationDate) {
                existing.expirationDate = oh.expirationDate;
              }
              if (!existing.manufacturingDate && oh.manufacturingDate) {
                existing.manufacturingDate = oh.manufacturingDate;
              }
              if (oh.inventoryLotId && Number(oh.inventoryLotId) > 0) {
                existing.inventoryLotId = Number(oh.inventoryLotId);
              }
            } else {
              batchMap.set(key, {
                inventoryLotId: Number(oh.inventoryLotId || oh.lotId || 1),
                lotId: lotIdNum,
                branchId: Number(oh.branchId),
                productId: Number(oh.productId || productId),
                batchNo: oh.batchNo,
                manufacturingDate: oh.manufacturingDate || null,
                expirationDate: oh.expirationDate || null,
                inventoryCondition: (oh.inventoryCondition as QAStatus) || 'GOOD',
                netOnhand: qty,
                lotName: cleanLotName ? `Lot ${cleanLotName}` : undefined,
                productName: oh.productName || productName,
                productCode: oh.productCode,
              });
            }
          }

          const liveBatches: MMInventoryLot[] = Array.from(batchMap.values())
            .filter((b) => b.netOnhand > 0)
            .map((b) => ({
              inventory_lot_id: b.inventoryLotId,
              lot_id: b.lotId,
              branch_id: b.branchId,
              product_id: b.productId,
              batch_no: b.batchNo,
              manufacturing_date: b.manufacturingDate,
              expiry_date: b.expirationDate,
              unit_cost: 0,
              qa_status: b.inventoryCondition,
              status: 'ACTIVE',
              available_quantity: b.netOnhand,
              lot_name: b.lotName,
              product_name: b.productName,
              product_code: b.productCode,
            }));

          setBatches(liveBatches);

          // Restore previously applied manual allocation if available
          if (initialAllocations && initialAllocations.length > 0) {
            const manualMap: Record<number, number> = {};
            let hasValidAlloc = false;
            initialAllocations.forEach((a) => {
              const matched = liveBatches.find(
                (b) =>
                  (a.inventory_lot_id && b.inventory_lot_id === a.inventory_lot_id) ||
                  (a.batch_no && b.batch_no === a.batch_no)
              );
              const lotKey = matched?.inventory_lot_id || a.inventory_lot_id;
              if (lotKey && Number(a.allocated_quantity) > 0) {
                manualMap[lotKey] = Number(a.allocated_quantity);
                hasValidAlloc = true;
              }
            });

            if (hasValidAlloc) {
              setManualAllocations(manualMap);
              setIsManualMode(true);
              setStrategy('MANUAL');
            } else {
              setIsManualMode(false);
              setManualAllocations({});
              setStrategy('FEFO');
            }
          } else {
            setIsManualMode(false);
            setManualAllocations({});
            setStrategy('FEFO');
          }
        }
      } catch (err) {
        console.error('[StockAllocationModal] Error loading inventory lots:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadBatches();

    return () => {
      isMounted = false;
    };
  }, [open, productId, branchId, productName, initialAllocations]);

  // Calculate automatic plan based on strategy
  const autoPlan = useMemo(() => {
    if (!batches.length) return null;
    return allocateStockSync(batches, requestedQuantity, {
      strategy,
      includeExpired: allowExpiredOverride,
      includeNonGoodQA: true, // Show all batches even if bad stock
    });
  }, [batches, requestedQuantity, strategy, allowExpiredOverride]);

  // Build active allocations (either manual edits or automatic plan)
  const currentPlan: StockAllocationPlan = useMemo(() => {
    if (!autoPlan) {
      return {
        productId,
        productName,
        branchId,
        requestedQuantity,
        totalAllocated: 0,
        shortage: requestedQuantity,
        isFullyAllocated: false,
        strategy,
        allocations: [],
        unallocatedBatches: [],
        ineligibleBatches: [],
      };
    }

    if (!isManualMode) {
      return autoPlan;
    }

    // Manual allocation calculation
    let totalAlloc = 0;
    const manualAllocList: BatchAllocationResult[] = [];
    const manualUnallocList: BatchAllocationResult[] = [];

    const seenLotIds = new Set<number>();
    const allCandidateBatches: BatchAllocationResult[] = [];
    [...autoPlan.allocations, ...autoPlan.unallocatedBatches].forEach((batch) => {
      if (!seenLotIds.has(batch.inventory_lot_id)) {
        seenLotIds.add(batch.inventory_lot_id);
        const originalBatch = batches.find((b) => b.inventory_lot_id === batch.inventory_lot_id);
        allCandidateBatches.push({
          ...batch,
          available_quantity: originalBatch?.available_quantity ?? batch.available_quantity,
        });
      }
    });

    allCandidateBatches.forEach((batch) => {
      const userQty = Number(manualAllocations[batch.inventory_lot_id] ?? 0);
      const safeQty = Math.max(0, Math.min(batch.available_quantity, userQty));

      if (safeQty > 0) {
        totalAlloc += safeQty;
        manualAllocList.push({
          ...batch,
          allocated_quantity: safeQty,
        });
      } else {
        manualUnallocList.push({
          ...batch,
          allocated_quantity: 0,
        });
      }
    });

    const shortage = Math.max(0, requestedQuantity - totalAlloc);
    const excessQuantity = Math.max(0, totalAlloc - requestedQuantity);
    const isOverAllocated = totalAlloc > requestedQuantity;

    return {
      productId,
      productName,
      branchId,
      requestedQuantity,
      totalAllocated: totalAlloc,
      shortage,
      excessQuantity,
      isOverAllocated,
      isFullyAllocated: totalAlloc === requestedQuantity,
      strategy: 'MANUAL',
      allocations: manualAllocList,
      unallocatedBatches: manualUnallocList,
      ineligibleBatches: autoPlan.ineligibleBatches,
    };
  }, [autoPlan, isManualMode, manualAllocations, batches, productId, productName, branchId, requestedQuantity, strategy]);

  const handleManualQtyChange = (inventoryLotId: number, maxAvailable: number, val: string) => {
    const num = val === '' ? 0 : Number(val);
    if (isNaN(num)) return;
    const clamped = Math.max(0, Math.min(maxAvailable, num));

    setIsManualMode(true);
    setManualAllocations((prev) => {
      const base = !isManualMode && autoPlan
        ? autoPlan.allocations.reduce<Record<number, number>>((acc, a) => {
            acc[a.inventory_lot_id] = a.allocated_quantity;
            return acc;
          }, {})
        : { ...prev };

      return {
        ...base,
        [inventoryLotId]: clamped,
      };
    });
  };

  const handleResetToAutoFEFO = () => {
    setIsManualMode(false);
    setStrategy('FEFO');
    setManualAllocations({});
  };

  const handleConfirm = () => {
    onConfirm(currentPlan);
    onOpenChange(false);
  };

  // Combine eligible and unallocated batches for full display
  const displayBatches = useMemo(() => {
    const list = [...currentPlan.allocations, ...currentPlan.unallocatedBatches];
    // Deduplicate by inventory_lot_id
    const seen = new Set<number>();
    return list.filter((b) => {
      if (seen.has(b.inventory_lot_id)) return false;
      seen.add(b.inventory_lot_id);
      return true;
    });
  }, [currentPlan]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl w-[92vw] max-w-[95vw] p-0 overflow-hidden bg-card border-border shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Stock Allocation Engine
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {productName ? `${productName} — ` : ''}Allocates inventory according to expiration priority.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={isManualMode ? 'secondary' : 'default'}
                className="text-xs font-mono px-2.5 py-0.5"
              >
                {isManualMode ? 'MANUAL OVERRIDE' : `AUTO — ${strategy}`}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Analyzing batch inventory & FEFO order...</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Top Stats Bar */}
            <div className="grid grid-cols-3 gap-3 bg-muted/30 p-3.5 rounded-xl border border-border">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Requested Quantity
                </p>
                <p className="text-base font-black text-foreground mt-0.5">
                  {requestedQuantity.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">{uomName}</span>
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Allocation Status
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {currentPlan.totalAllocated === requestedQuantity ? (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Fully Allocated
                    </span>
                  ) : currentPlan.totalAllocated > requestedQuantity ? (
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Over-Allocated (+{currentPlan.totalAllocated - requestedQuantity} {uomName})
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Shortage: {currentPlan.shortage} {uomName}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Allocation Strategy
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Select
                    value={isManualMode ? 'MANUAL' : strategy}
                    onValueChange={(val) => {
                      if (val === 'MANUAL') {
                        setIsManualMode(true);
                        if (autoPlan) {
                          setManualAllocations(
                            autoPlan.allocations.reduce<Record<number, number>>((acc, a) => {
                              acc[a.inventory_lot_id] = a.allocated_quantity;
                              return acc;
                            }, {})
                          );
                        }
                      } else {
                        setIsManualMode(false);
                        setStrategy(val as AllocationStrategy);
                        setManualAllocations({});
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FEFO" className="text-xs">
                        FEFO (First Expired First Out)
                      </SelectItem>
                      <SelectItem value="FIFO" className="text-xs">
                        FIFO (First In First Out)
                      </SelectItem>
                      <SelectItem value="MANUAL" className="text-xs">
                        Manual Override
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Over-Allocation Warning Banner */}
            {currentPlan.totalAllocated > requestedQuantity && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      Over-Allocation Warning: Total Allocated ({currentPlan.totalAllocated} {uomName}) Exceeds Requested ({requestedQuantity} {uomName})
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      You have allocated <strong className="text-amber-700 dark:text-amber-400">+{currentPlan.totalAllocated - requestedQuantity} {uomName} excess</strong>. Please reduce batch quantities or reset to exact FEFO allocation.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleResetToAutoFEFO}
                  className="h-7 text-xs text-primary hover:text-primary gap-1 shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to Exact
                </Button>
              </div>
            )}

            {/* Manual Mode Banner */}
            {isManualMode && currentPlan.totalAllocated <= requestedQuantity && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      Manual Allocation Active
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      You are manually specifying quantities per batch instead of the FEFO recommendation.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleResetToAutoFEFO}
                  className="h-7 text-xs text-primary hover:text-primary gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to FEFO
                </Button>
              </div>
            )}

            {/* Batch Allocation List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" /> Eligible Batches ({displayBatches.length})
                </Label>
                <label className="text-[11px] text-muted-foreground flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={allowExpiredOverride}
                    onChange={(e) => setAllowExpiredOverride(e.target.checked)}
                    className="rounded border-border w-3.5 h-3.5 text-primary"
                  />
                  <span>Show expired stock (Override)</span>
                </label>
              </div>

              <ScrollArea className="h-[420px] max-h-[55vh] rounded-xl border border-border bg-muted/10 p-3">
                {displayBatches.length === 0 ? (
                  <div className="text-center py-10 text-xs text-muted-foreground italic">
                    No active stock batches found for this product.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {displayBatches.map((batch, index) => {
                      const allocatedQty = isManualMode
                        ? Number(manualAllocations[batch.inventory_lot_id] ?? 0)
                        : (currentPlan.allocations.find((a) => a.inventory_lot_id === batch.inventory_lot_id)?.allocated_quantity ?? 0);

                      const isAllocated = allocatedQty > 0;
                      const days = batch.days_until_expiry;
                      const isExpired = batch.is_expired;

                      return (
                        <div
                          key={batch.inventory_lot_id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isAllocated
                              ? 'border-primary/50 bg-primary/5 shadow-sm'
                              : 'border-border/60 bg-card hover:border-border'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            {/* Left: Batch Info */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground text-xs">
                                  {batch.batch_no}
                                </span>

                                <Badge
                                  className={`text-[10px] py-0 h-4 ${
                                    index === 0
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300'
                                      : index === 1
                                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-300'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  PRIORITY {index + 1}
                                </Badge>

                                <Badge
                                  variant={
                                    batch.qa_status === 'GOOD'
                                      ? 'outline'
                                      : batch.qa_status === 'DAMAGED'
                                      ? 'destructive'
                                      : 'secondary'
                                  }
                                  className="text-[10px] px-1.5 py-0 h-4"
                                >
                                  {batch.qa_status}
                                </Badge>

                                {isExpired && (
                                  <Badge variant="destructive" className="text-[10px] py-0 h-4">
                                    Expired
                                  </Badge>
                                )}
                              </div>

                              <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                                <span>Lot: <strong className="text-foreground/80">{(() => {
                                  const raw = batch.lot_name || (batch.lot_id ? `${batch.lot_id}` : '');
                                  const clean = raw.replace(/^lot\s*[:#-]?\s*/i, '').trim();
                                  return clean && clean !== 'null' && clean !== 'undefined' ? `Lot ${clean}` : '—';
                                })()}</strong></span>
                                <span>Available: <strong className="text-foreground">{batch.available_quantity}</strong> {uomName}</span>
                                {batch.expiry_date && (
                                  <span className={`flex items-center gap-1 font-mono ${days !== null && days <= 30 ? (days < 0 ? 'text-destructive font-bold' : 'text-amber-600 font-bold') : ''}`}>
                                    <Calendar className="w-3 h-3" />
                                    Exp: {batch.expiry_date.substring(0, 10)} {days !== null ? `(${days < 0 ? `Expired ${Math.abs(days)}d ago` : `in ${days}d`})` : ''}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right: Allocation Quantity Input */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                Allocate ({uomName})
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  min={0}
                                  max={batch.available_quantity}
                                  value={allocatedQty === 0 ? '' : allocatedQty}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleManualQtyChange(
                                      batch.inventory_lot_id,
                                      batch.available_quantity,
                                      e.target.value
                                    )
                                  }
                                  className={`w-24 h-8 text-xs font-bold text-right ${
                                    isAllocated
                                      ? 'border-primary text-primary focus-visible:ring-primary'
                                      : 'text-muted-foreground'
                                  }`}
                                />
                                {isAllocated && (
                                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Ineligible / Blocked Batches Notice if any */}
            {currentPlan.ineligibleBatches.length > 0 && !allowExpiredOverride && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  {currentPlan.ineligibleBatches.length} batch(es) excluded by policy (Expired / Non-GOOD QA).
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border bg-muted/10 flex items-center justify-between">
          <div className="text-xs text-muted-foreground font-semibold flex items-center gap-2">
            <span>
              Allocated:{" "}
              <strong
                className={
                  currentPlan.totalAllocated > requestedQuantity
                    ? "text-amber-600 dark:text-amber-400 font-bold"
                    : currentPlan.totalAllocated === requestedQuantity && currentPlan.totalAllocated > 0
                    ? "text-emerald-600 dark:text-emerald-400 font-bold"
                    : "text-foreground font-bold"
                }
              >
                {currentPlan.totalAllocated}
              </strong>{" "}
              / {requestedQuantity} {uomName}
            </span>
            {currentPlan.totalAllocated > requestedQuantity && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-3 h-3" /> +{currentPlan.totalAllocated - requestedQuantity} {uomName} Excess
              </span>
            )}
            {currentPlan.totalAllocated < requestedQuantity && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
                <AlertTriangle className="w-3 h-3" /> -{requestedQuantity - currentPlan.totalAllocated} {uomName} Shortage
              </span>
            )}
            {currentPlan.isFullyAllocated && currentPlan.totalAllocated === requestedQuantity && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Fully Allocated
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={loading}
              className="text-xs gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Apply Allocation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
