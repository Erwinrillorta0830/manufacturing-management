"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar, Sparkles, AlertTriangle, Check, Layers } from "lucide-react";
import { RowQuantityInput } from "./RowQuantityInput";
import {
  checkBatchEligibility,
  sortBatchesByStrategy,
  resolveProductClassification,
} from "../services/lot-allocation.engine";
import {
  fetchLotProductsWithStock,
  type MMInventoryLot,
  type LotProductWithBatches,
} from "../services/lot-tracking.service";
import type { LotTransferFormLine } from "../types";
import { toast } from "sonner";

interface LotBatchSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  productTypeId?: number | null;
  productTypeName?: string;
  sourceLotId: number;
  sourceLotName?: string;
  targetLotId: number;
  targetLotName?: string;
  targetMaxCapacity?: number;
  targetCurrentStock?: number;
  targetUomName?: string;
  existingLines: LotTransferFormLine[];
  onAddLine: (line: LotTransferFormLine) => void;
}

export const LotBatchSelectionModal: React.FC<LotBatchSelectionModalProps> = ({
  open,
  onOpenChange,
  branchId,
  productTypeId,
  productTypeName,
  sourceLotId,
  sourceLotName,
  targetLotId,
  targetLotName,
  targetMaxCapacity,
  targetCurrentStock = 0,
  targetUomName,
  existingLines,
  onAddLine,
}) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<LotProductWithBatches[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<MMInventoryLot | null>(null);

  // Target Lot Capacity Calculations
  const hasCapacityLimit = typeof targetMaxCapacity === "number" && targetMaxCapacity > 0;
  const currentOccupied = Number(targetCurrentStock) || 0;
  const alreadyAllocated = useMemo(() => {
    return existingLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [existingLines]);

  const projectedOccupancy = currentOccupied + alreadyAllocated;
  const remainingTargetCapacity = hasCapacityLimit
    ? Math.max(0, targetMaxCapacity - projectedOccupancy)
    : Infinity;
  const isTargetLotFull = hasCapacityLimit && remainingTargetCapacity <= 0;

  const maxAllowedQty = useMemo(() => {
    const batchAvailable = selectedBatch?.available_quantity || 0;
    if (!hasCapacityLimit) return batchAvailable;
    return Math.min(batchAvailable, remainingTargetCapacity);
  }, [selectedBatch, hasCapacityLimit, remainingTargetCapacity]);

  // Line input state
  const [transferQty, setTransferQty] = useState<number>(0);
  const [targetBatchNo, setTargetBatchNo] = useState<string>("");
  const [lineRemarks, setLineRemarks] = useState<string>("");

  // Load products & active positive batches available in this lot
  useEffect(() => {
    if (open && sourceLotId > 0) {
      setLoading(true);
      fetchLotProductsWithStock(sourceLotId)
        .then((res: LotProductWithBatches[]) => {
          setProducts(res);
        })
        .finally(() => setLoading(false));
    } else {
      setProducts([]);
      setSelectedProductId(null);
      setSelectedBatch(null);
    }
  }, [open, sourceLotId]);

  // Filter products strictly matching the required product type
  const matchingProducts = useMemo(() => {
    if (!productTypeId && !productTypeName) return products;
    return products.filter((p) => {
      if (productTypeId && p.productTypeId && p.productTypeId === productTypeId) return true;
      const pClass = resolveProductClassification(p.productTypeName, p.productCategoryName);
      const selClass = resolveProductClassification(productTypeName, productTypeName);
      return pClass.code === selClass.code;
    });
  }, [products, productTypeId, productTypeName]);

  // Synchronize selected product when matchingProducts changes
  useEffect(() => {
    if (matchingProducts.length > 0) {
      if (!selectedProductId || !matchingProducts.some((p) => p.productId === selectedProductId)) {
        const firstAvailable = matchingProducts.find((p) =>
          p.batches.some(
            (b) => !existingLines.some((l) => l.sourceInventoryLotId === b.inventory_lot_id)
          )
        );
        setSelectedProductId(firstAvailable ? firstAvailable.productId : matchingProducts[0].productId);
      }
    } else {
      setSelectedProductId(null);
    }
  }, [matchingProducts, selectedProductId, existingLines]);

  const selectedProduct = matchingProducts.find((p) => p.productId === selectedProductId);
  const availableBatches = useMemo(() => selectedProduct?.batches || [], [selectedProduct]);

  const classification = resolveProductClassification(
    selectedProduct?.productTypeName || productTypeName,
    selectedProduct?.productCategoryName
  );

  const targetIsBadStock = useMemo(() => {
    const name = String(targetLotName || "").toLowerCase();
    return name.includes("bad") || name.includes("quarantine") || name.includes("damage") || name.includes("reject");
  }, [targetLotName]);

  // Evaluate & sort batches (strictly positive quantity)
  const evaluatedBatches = useMemo(() => {
    const candidates = availableBatches
      .filter((b) => Number(b.available_quantity || 0) > 0)
      .map((b) => ({
        inventory_lot_id: b.inventory_lot_id,
        lot_id: b.lot_id,
        branch_id: b.branch_id,
        product_id: b.product_id,
        batch_no: b.batch_no,
        manufacturing_date: b.manufacturing_date,
        expiry_date: b.expiry_date,
        unit_cost:
          b.unit_cost !== null && b.unit_cost !== undefined
            ? Number(b.unit_cost)
            : (b as unknown as { unitCost?: number }).unitCost !== null && (b as unknown as { unitCost?: number }).unitCost !== undefined
            ? Number((b as unknown as { unitCost?: number }).unitCost)
            : null,
        qa_status: b.qa_status,
        available_quantity: Number(b.available_quantity || 0),
      }));

    const sorted = sortBatchesByStrategy(candidates, classification.strategy);

    return sorted.map((candidate, idx) => {
      const eligibility = checkBatchEligibility(candidate, new Date(), { targetIsBadStock });
      const isAlreadyAdded = existingLines.some(
        (l) => l.sourceInventoryLotId === candidate.inventory_lot_id
      );
      const isRecommended = idx === 0 && eligibility.isEligible && !isAlreadyAdded;

      return {
        ...candidate,
        eligibility,
        isAlreadyAdded,
        isRecommended,
      };
    });
  }, [availableBatches, classification.strategy, existingLines, targetIsBadStock]);

  const formatDefaultTargetBatchNo = (batchNo: string | null | undefined): string => {
    const clean = String(batchNo ?? "").trim();
    if (!clean) return "";
    return clean.endsWith("-LT") ? clean : `${clean}-LT`;
  };

  // Synchronize selected batch when selected product or evaluated batches change
  useEffect(() => {
    if (selectedProduct && evaluatedBatches.length > 0) {
      const unaddedEligible = evaluatedBatches.find((b) => !b.isAlreadyAdded && b.eligibility.isEligible);
      const fallbackUnadded = evaluatedBatches.find((b) => !b.isAlreadyAdded);
      const chosen = unaddedEligible || fallbackUnadded || null;

      if (chosen) {
        const found = availableBatches.find((b) => b.inventory_lot_id === chosen.inventory_lot_id) || null;
        setSelectedBatch(found);
        setTargetBatchNo(found ? formatDefaultTargetBatchNo(found.batch_no) : "");
        setTransferQty(0);
      } else {
        setSelectedBatch(null);
        setTargetBatchNo("");
        setTransferQty(0);
      }
    } else {
      setSelectedBatch(null);
      setTargetBatchNo("");
      setTransferQty(0);
    }
  }, [selectedProductId, selectedProduct, evaluatedBatches, availableBatches]);

  const handleSelectBatch = (candidate: typeof evaluatedBatches[0]) => {
    if (candidate.isAlreadyAdded) {
      toast.warning(`Batch ${candidate.batch_no} is already added to this transfer.`);
      return;
    }
    const found = availableBatches.find((b) => b.inventory_lot_id === candidate.inventory_lot_id);
    if (found) {
      setSelectedBatch(found);
      setTargetBatchNo(formatDefaultTargetBatchNo(found.batch_no));
      setTransferQty(0);
    }
  };

  const handleConfirmAdd = () => {
    if (!selectedProduct || !selectedBatch) {
      toast.error("Please select a valid product and batch.");
      return;
    }

    if (transferQty <= 0) {
      toast.error("Transfer quantity must be greater than zero.");
      return;
    }

    const available = selectedBatch.available_quantity || 0;
    if (transferQty > available) {
      toast.error(
        `Quantity (${transferQty}) exceeds available stock (${available}) for batch ${selectedBatch.batch_no}.`
      );
      return;
    }

    if (hasCapacityLimit && transferQty > remainingTargetCapacity) {
      toast.error(
        `Quantity (${transferQty}) exceeds destination lot remaining capacity of ${remainingTargetCapacity.toLocaleString()} ${targetUomName || ""}.`
      );
      return;
    }

    if (!targetBatchNo.trim()) {
      toast.error("Target batch number cannot be empty.");
      return;
    }

    const nextLineNo = existingLines.length + 1;
    const newLine: LotTransferFormLine = {
      lineNo: nextLineNo,
      productId: selectedProduct.productId,
      productName: selectedProduct.productName,
      productCode: selectedProduct.productCode,
      productDescription: selectedProduct.productDescription,
      uomName: selectedProduct.uomName,
      productTypeId: selectedProduct.productTypeId ?? productTypeId ?? null,
      productTypeName: selectedProduct.productTypeName ?? productTypeName,
      productClassification: classification.code,
      sourceInventoryLotId: selectedBatch.inventory_lot_id,
      sourceBatchNo: selectedBatch.batch_no,
      sourceOnHand: available,
      sourceExpiryDate: selectedBatch.expiry_date,
      sourceManufacturingDate: selectedBatch.manufacturing_date,
      sourceUnitCost:
        selectedBatch.unit_cost !== null && selectedBatch.unit_cost !== undefined && !isNaN(Number(selectedBatch.unit_cost))
          ? Number(selectedBatch.unit_cost)
          : null,
      targetBatchNo: targetBatchNo.trim(),
      quantity: transferQty,
      lineRemarks: lineRemarks.trim() || undefined,
    };

    onAddLine(newLine);
    toast.success(`Batch ${selectedBatch.batch_no} added to transfer!`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl sm:max-w-5xl w-[94vw] h-[88vh] max-h-[880px] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0 pb-3 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Layers className="w-5 h-5 text-primary" />
                Select Batch to Transfer
              </DialogTitle>
              {productTypeName && (
                <Badge variant="secondary" className="text-xs font-semibold">
                  {productTypeName}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={`text-xs font-semibold gap-1 ${
                  classification.strategy === "FEFO"
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                    : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                }`}
              >
                {classification.strategy === "FEFO" ? (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    FEFO (Nearest Expiry First)
                  </>
                ) : (
                  <>
                    <Calendar className="w-3 h-3 text-blue-500" />
                    FIFO (Earliest Inward First)
                  </>
                )}
              </Badge>
            </div>
            <DialogDescription className="text-xs">
              Transfer stock from <strong className="text-foreground">{sourceLotName || `Lot #${sourceLotId}`}</strong> to{" "}
              <strong className="text-foreground">{targetLotName || `Lot #${targetLotId}`}</strong>.
              Scoped to <strong className="text-foreground">{productTypeName || "selected product classification"}</strong>.
            </DialogDescription>
          </div>

          {hasCapacityLimit && (
            <div className="border rounded-lg px-3 py-1.5 bg-muted/20 shrink-0 text-right sm:text-right">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                Destination Lot Capacity
              </div>
              <div className="text-xs font-mono font-bold flex items-center gap-1.5 justify-end">
                <span className={isTargetLotFull ? "text-destructive" : "text-foreground"}>
                  {projectedOccupancy.toLocaleString()} / {targetMaxCapacity.toLocaleString()} {targetUomName || ""}
                </span>
                <Badge
                  variant={isTargetLotFull ? "destructive" : "secondary"}
                  className="text-[9px] px-1.5 py-0 font-medium"
                >
                  {isTargetLotFull ? "Full" : `${remainingTargetCapacity.toLocaleString()} space left`}
                </Badge>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
          {/* Target Lot Full Warning */}
          {hasCapacityLimit && isTargetLotFull && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Destination storage lot <strong>{targetLotName || `Lot #${targetLotId}`}</strong> has reached maximum capacity ({projectedOccupancy.toLocaleString()} / {targetMaxCapacity.toLocaleString()} {targetUomName || ""}). Cannot allocate additional quantity.
              </span>
            </div>
          )}
          {/* Product selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Product
              </label>
              {productTypeName && (
                <span className="text-[11px] text-muted-foreground">
                  Showing <strong>{productTypeName}</strong> only ({matchingProducts.length} {matchingProducts.length === 1 ? "product" : "products"})
                </span>
              )}
            </div>
            {loading && products.length === 0 ? (
              <div className="h-14 w-full bg-muted/60 animate-pulse rounded-md" />
            ) : matchingProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground p-8 border rounded-lg bg-muted/20 text-center space-y-1.5">
                <p className="font-semibold text-foreground">
                  {products.length === 0
                    ? "No Stock Available in Source Lot"
                    : `No ${productTypeName || "Compatible"} Stock Available`}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {products.length === 0
                    ? `Storage lot "${sourceLotName || `#${sourceLotId}`}" currently has no active products with positive inventory to transfer.`
                    : `Storage lot "${sourceLotName || `#${sourceLotId}`}" contains inventory, but none belongs to "${productTypeName || "the selected product classification"}".`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-0.5">
                {matchingProducts.map((p) => {
                  const isSelected = p.productId === selectedProductId;
                  const totalQty = p.batches.reduce((sum, b) => sum + (Number(b.available_quantity) || 0), 0);
                  const unaddedCount = p.batches.filter(
                    (b) => !existingLines.some((l) => l.sourceInventoryLotId === b.inventory_lot_id)
                  ).length;
                  const isAllAdded = unaddedCount === 0;

                  return (
                    <button
                      key={p.productId}
                      type="button"
                      disabled={isAllAdded}
                      onClick={() => setSelectedProductId(p.productId)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        isAllAdded
                          ? "opacity-50 bg-muted/40 border-dashed cursor-not-allowed"
                          : isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="text-sm font-semibold leading-tight truncate text-foreground">
                          {p.productDescription || p.productName}
                        </div>
                        {isAllAdded && (
                          <Badge variant="secondary" className="text-[10px] shrink-0 font-normal">
                            All Added
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground truncate">
                        {p.productDescription && p.productName && (
                          <span className="font-medium text-muted-foreground/90">{p.productName}</span>
                        )}
                        {p.productCode && (
                          <span>• Code: {p.productCode}</span>
                        )}
                        <span>• UOM: {p.uomName || "-"}</span>
                      </div>
                      <div className="mt-1.5 text-[11px] font-mono text-muted-foreground/80 flex items-center justify-between border-t pt-1">
                        <span>{p.batches.length} {p.batches.length === 1 ? "batch" : "batches"}</span>
                        <span className="font-semibold text-foreground">{totalQty.toLocaleString()} {p.uomName || ""}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {products.length > 0 && (
            <>
              {/* Batches Table with FEFO/FIFO badges */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Available Batches in Source Lot
                  </label>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span>Rule:</span>
                    <span className="font-semibold text-primary">{classification.strategy}</span>
                    <span>({classification.label})</span>
                  </div>
                </div>

                {loading && availableBatches.length === 0 ? (
                  <div className="h-32 bg-muted/50 animate-pulse rounded-md" />
                ) : evaluatedBatches.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-6 border rounded-md bg-muted/20 text-center">
                    All batches for this product have already been added to the transfer.
                  </div>
                ) : (
                  <div className="border rounded-md divide-y min-h-[160px] max-h-[260px] overflow-y-auto">
                    {evaluatedBatches.map((b) => {
                      const isSelected = selectedBatch?.inventory_lot_id === b.inventory_lot_id;
                      const isBlocked = !b.eligibility.isEligible || b.isAlreadyAdded;

                      return (
                        <div
                          key={b.inventory_lot_id}
                          onClick={() => !isBlocked && handleSelectBatch(b)}
                          className={`p-3.5 flex items-center justify-between text-sm transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-primary/10 border-l-4 border-l-primary"
                              : isBlocked
                              ? "opacity-50 cursor-not-allowed bg-muted/30"
                              : "hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-foreground">{b.batch_no}</span>
                              {b.isRecommended && (
                                <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1 text-[10px] px-2 py-0.5">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {classification.strategy} Priority
                                </Badge>
                              )}
                              {b.isAlreadyAdded && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Already Added
                                </Badge>
                              )}
                              {b.eligibility.isEligible && (b.qa_status === "DAMAGED" || b.qa_status === "QUARANTINED" || b.eligibility.isExpired) && (
                                <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/20 text-[10px] px-1.5 py-0 font-medium">
                                  Quarantine Relocation
                                </Badge>
                              )}
                              {!b.eligibility.isEligible && (
                                <Badge variant="destructive" className="gap-1 text-[10px] px-2 py-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {b.eligibility.reason || "Ineligible"}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {b.expiry_date && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Calendar className="w-3 h-3" />
                                  Exp: {b.expiry_date}
                                  {b.eligibility.daysUntilExpiry !== null && (
                                    <span className={b.eligibility.daysUntilExpiry < 30 ? "text-amber-600 font-semibold" : ""}>
                                      ({b.eligibility.daysUntilExpiry} days left)
                                    </span>
                                  )}
                                </span>
                              )}
                              {b.manufacturing_date && (
                                <span className="font-mono">Mfg: {b.manufacturing_date}</span>
                              )}
                              <span>QA: {b.qa_status || "GOOD"}</span>
                            </div>
                          </div>

                          <div className="text-right pl-4 shrink-0">
                            <div className="font-mono font-bold text-foreground text-base">
                              {b.available_quantity.toLocaleString()} {selectedProduct?.uomName || ""}
                            </div>
                            <div className="text-xs text-muted-foreground">Available</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Allocation input details */}
              {selectedBatch && (
                <div className="p-4 border rounded-lg bg-card space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold border-b pb-2">
                    <span className="text-foreground">Configure Line Item</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      Selected Batch: <strong className="text-foreground">{selectedBatch.batch_no}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">
                          Transfer Quantity
                        </label>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          Max: <strong className="text-foreground">{maxAllowedQty.toLocaleString()} {selectedProduct?.uomName || ""}</strong>
                          {hasCapacityLimit && remainingTargetCapacity < (selectedBatch.available_quantity || 0) && (
                            <span className="text-amber-600 font-semibold ml-1">
                              (lot limit: {remainingTargetCapacity.toLocaleString()})
                            </span>
                          )}
                        </span>
                      </div>
                      <RowQuantityInput
                        value={transferQty}
                        onChange={setTransferQty}
                        max={maxAllowedQty}
                        min={0.0001}
                        placeholder="Enter quantity"
                        disabled={isTargetLotFull}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Target Batch Number
                      </label>
                      <Input
                        value={targetBatchNo}
                        onChange={(e) => setTargetBatchNo(e.target.value)}
                        placeholder="Destination batch #"
                        className="h-8 font-mono text-sm"
                        disabled={isTargetLotFull}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Line Remarks (Optional)
                    </label>
                    <Input
                      value={lineRemarks}
                      onChange={(e) => setLineRemarks(e.target.value)}
                      placeholder="e.g. Relocating near packaging line"
                      className="h-8 text-sm"
                      disabled={isTargetLotFull}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="pt-3 border-t shrink-0 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmAdd}
            disabled={
              !selectedBatch ||
              Number(selectedBatch.available_quantity || 0) <= 0 ||
              transferQty <= 0 ||
              transferQty > maxAllowedQty ||
              !targetBatchNo.trim() ||
              isTargetLotFull
            }
            className="gap-1.5"
          >
            <Check className="w-4 h-4" />
            Add to Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
