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
import {
  Calendar,
  Sparkles,
  AlertTriangle,
  Check,
  Layers,
  Package,
  ArrowRight,
  Search,
  X,
  SlidersHorizontal,
  Boxes,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { RowQuantityInput } from "./RowQuantityInput";
import {
  checkBatchEligibility,
  sortBatchesByStrategy,
  resolveProductClassification,
} from "../services/lot-allocation.engine";
import {
  fetchLotProductsWithStock,
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
  const [products, setProducts] = useState<LotProductWithBatches[]>([]);
  const [loadedLotKey, setLoadedLotKey] = useState<string | null>(null);
  const currentLotKey = open && sourceLotId > 0 ? `${open}-${sourceLotId}` : null;
  const loading = Boolean(currentLotKey && loadedLotKey !== currentLotKey);

  // Search & filter state
  const [productSearch, setProductSearch] = useState<string>("");
  const [batchSearch, setBatchSearch] = useState<string>("");

  const [userSelectedProductId, setUserSelectedProductId] = useState<number | null>(null);
  const [userSelectedBatchId, setUserSelectedBatchId] = useState<number | null>(null);
  const [customTargetBatchNo, setCustomTargetBatchNo] = useState<string | null>(null);

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

  // Line input state
  const [transferQty, setTransferQty] = useState<number>(0);
  const [lineRemarks, setLineRemarks] = useState<string>("");

  // Load products & active positive batches available in this lot
  useEffect(() => {
    let active = true;
    if (open && sourceLotId > 0) {
      fetchLotProductsWithStock(sourceLotId)
        .then((res: LotProductWithBatches[]) => {
          if (active) {
            setProducts(res);
            setLoadedLotKey(`${open}-${sourceLotId}`);
          }
        })
        .catch(() => {
          if (active) {
            setProducts([]);
            setLoadedLotKey(`${open}-${sourceLotId}`);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [open, sourceLotId]);

  // Filter products strictly matching the required product type
  const matchingProducts = useMemo(() => {
    if (!productTypeId && !productTypeName) return products;
    return products.filter((p) => {
      if (productTypeId && p.productTypeId && Number(p.productTypeId) === Number(productTypeId)) return true;
      const pClass = resolveProductClassification(p.productTypeName || p.productTypeId, p.productCategoryName);
      const selClass = resolveProductClassification(productTypeName || productTypeId, productTypeName);
      return pClass.code === selClass.code;
    });
  }, [products, productTypeId, productTypeName]);

  // Filter products by user search query (name, description, code)
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return matchingProducts;
    return matchingProducts.filter((p) => {
      const name = (p.productName || "").toLowerCase();
      const desc = (p.productDescription || "").toLowerCase();
      const code = (p.productCode || "").toLowerCase();
      return name.includes(q) || desc.includes(q) || code.includes(q);
    });
  }, [matchingProducts, productSearch]);

  const selectedProductId = useMemo(() => {
    if (userSelectedProductId && matchingProducts.some((p) => p.productId === userSelectedProductId)) {
      return userSelectedProductId;
    }
    if (matchingProducts.length > 0) {
      const firstAvailable = matchingProducts.find((p) =>
        p.batches.some(
          (b) => !existingLines.some((l) => l.sourceInventoryLotId === b.inventory_lot_id)
        )
      );
      return firstAvailable ? firstAvailable.productId : matchingProducts[0].productId;
    }
    return null;
  }, [matchingProducts, userSelectedProductId, existingLines]);

  const selectedProduct = useMemo(() => {
    return matchingProducts.find((p) => p.productId === selectedProductId) || null;
  }, [matchingProducts, selectedProductId]);

  const availableBatches = useMemo(() => selectedProduct?.batches || [], [selectedProduct]);

  const classification = resolveProductClassification(
    selectedProduct?.productTypeName || selectedProduct?.productTypeId || productTypeName || productTypeId,
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
        created_at: b.created_at || undefined,
      }));

    const sorted = sortBatchesByStrategy(candidates, classification.strategy);

    return sorted.map((candidate, idx) => {
      const eligibility = checkBatchEligibility(candidate, new Date(), {
        targetIsBadStock,
        classificationCode: classification.code,
      });
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
  }, [availableBatches, classification.strategy, classification.code, existingLines, targetIsBadStock]);

  // Filter batches by search query
  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return evaluatedBatches;
    return evaluatedBatches.filter((b) => b.batch_no.toLowerCase().includes(q));
  }, [evaluatedBatches, batchSearch]);

  const formatDefaultTargetBatchNo = (batchNo: string | null | undefined): string => {
    const clean = String(batchNo ?? "").trim();
    if (!clean) return "";
    return clean.endsWith("-LT") ? clean : `${clean}-LT`;
  };

  const selectedBatch = useMemo(() => {
    if (!selectedProduct || evaluatedBatches.length === 0) return null;
    if (userSelectedBatchId) {
      const found = availableBatches.find((b) => b.inventory_lot_id === userSelectedBatchId);
      if (found) return found;
    }
    const unaddedEligible = evaluatedBatches.find((b) => !b.isAlreadyAdded && b.eligibility.isEligible);
    const fallbackUnadded = evaluatedBatches.find((b) => !b.isAlreadyAdded);
    const chosen = unaddedEligible || fallbackUnadded || null;
    if (chosen) {
      return availableBatches.find((b) => b.inventory_lot_id === chosen.inventory_lot_id) || null;
    }
    return null;
  }, [selectedProduct, evaluatedBatches, userSelectedBatchId, availableBatches]);

  const maxAllowedQty = useMemo(() => {
    const batchAvailable = selectedBatch?.available_quantity || 0;
    if (!hasCapacityLimit) return batchAvailable;
    return Math.min(batchAvailable, remainingTargetCapacity);
  }, [selectedBatch, hasCapacityLimit, remainingTargetCapacity]);

  const isDiscreteUnit = useMemo(() => {
    const uom = String(selectedProduct?.uomName || targetUomName || "").toLowerCase();
    return (
      uom.includes("pc") ||
      uom.includes("piece") ||
      uom.includes("bag") ||
      uom.includes("box") ||
      uom.includes("can") ||
      uom.includes("btl") ||
      uom.includes("bottle")
    );
  }, [selectedProduct?.uomName, targetUomName]);

  const minAllowedQty = isDiscreteUnit ? 1 : 0.0001;

  const targetBatchNo = customTargetBatchNo !== null
    ? customTargetBatchNo
    : selectedBatch
    ? formatDefaultTargetBatchNo(selectedBatch.batch_no)
    : "";

  const handleSelectProduct = (productId: number) => {
    setUserSelectedProductId(productId);
    setUserSelectedBatchId(null);
    setCustomTargetBatchNo(null);
    setTransferQty(0);
    setBatchSearch("");
  };

  const handleSelectBatch = (candidate: typeof evaluatedBatches[0]) => {
    if (candidate.isAlreadyAdded) {
      toast.warning(`Batch ${candidate.batch_no} is already added to this transfer.`);
      return;
    }
    const found = availableBatches.find((b) => b.inventory_lot_id === candidate.inventory_lot_id);
    if (found) {
      setUserSelectedBatchId(found.inventory_lot_id);
      setCustomTargetBatchNo(null);
      setTransferQty(0);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setUserSelectedProductId(null);
      setUserSelectedBatchId(null);
      setCustomTargetBatchNo(null);
      setTransferQty(0);
      setLineRemarks("");
      setProductSearch("");
      setBatchSearch("");
    }
    onOpenChange(isOpen);
  };

  const handleConfirmAdd = () => {
    if (!selectedProduct || !selectedBatch) {
      toast.error("Please select a valid product and batch.");
      return;
    }

    if (transferQty < minAllowedQty) {
      toast.error(`Transfer quantity must be at least ${minAllowedQty} ${selectedProduct.uomName || ""}.`);
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

    const isDuplicateTarget = existingLines.some(
      (l) => l.targetBatchNo.toLowerCase() === targetBatchNo.trim().toLowerCase()
    );
    if (isDuplicateTarget) {
      toast.error(`Target batch number "${targetBatchNo.trim()}" is already used in this transfer request.`);
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
    handleClose(false);
  };

  const isFefo = classification.strategy === "FEFO";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl sm:max-w-6xl w-[96vw] h-[92vh] max-h-[920px] flex flex-col p-0 overflow-hidden gap-0 shadow-2xl">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 py-3.5 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Layers className="w-4.5 h-4.5 text-primary" />
                </div>
                <DialogTitle className="text-lg font-bold">
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
                    isFefo
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                      : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                  }`}
                >
                  {isFefo ? (
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
              <DialogDescription className="text-xs flex items-center gap-1.5 text-muted-foreground">
                <span>Transfer from: <strong className="text-foreground">{sourceLotName || `Lot #${sourceLotId}`}</strong></span>
                <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                <span>To: <strong className="text-foreground">{targetLotName || `Lot #${targetLotId}`}</strong></span>
                {productTypeName && (
                  <>
                    <span className="text-muted-foreground/50">•</span>
                    <span>Classification: <strong className="text-foreground">{productTypeName}</strong></span>
                  </>
                )}
              </DialogDescription>
            </div>

            {hasCapacityLimit && (
              <div className={`border rounded-xl px-3.5 py-1.5 shrink-0 text-right ${
                isTargetLotFull ? "bg-destructive/10 border-destructive/30" : "bg-card border-border shadow-sm"
              }`}>
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
                  Destination Capacity
                </div>
                <div className="text-xs font-mono font-bold text-foreground">
                  {projectedOccupancy.toLocaleString()} / {targetMaxCapacity.toLocaleString()} {targetUomName || ""}
                </div>
                <Badge
                  variant={isTargetLotFull ? "destructive" : "secondary"}
                  className="text-[9px] px-1.5 py-0 font-medium"
                >
                  {isTargetLotFull ? "Full" : `${remainingTargetCapacity.toLocaleString()} space left`}
                </Badge>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* 2-COLUMN MASTER-DETAIL BODY */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* ─── LEFT COLUMN: PRODUCT MASTER LIST (~38% width) ─── */}
          <div className="w-full md:w-[360px] lg:w-[400px] shrink-0 border-r flex flex-col bg-muted/10 overflow-hidden">
            {/* Product Search & Count */}
            <div className="p-3 border-b space-y-2 bg-background/80 backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-primary" />
                  Products ({matchingProducts.length})
                </span>
                {matchingProducts.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {filteredProducts.length} of {matchingProducts.length}
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search product, SKU, code..."
                  className="h-8 pl-8 pr-7 text-xs bg-card"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch("")}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Product Cards List */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {loading && products.length === 0 ? (
                <div className="space-y-2 p-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-muted/60 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : matchingProducts.length === 0 ? (
                <div className="text-center p-8 text-xs text-muted-foreground space-y-1.5">
                  <Package className="w-7 h-7 mx-auto opacity-30" />
                  <p className="font-semibold text-foreground">No Stock Available</p>
                  <p className="max-w-[220px] mx-auto text-[11px]">
                    {products.length === 0
                      ? "Source lot currently has no positive inventory to transfer."
                      : `No products match classification "${productTypeName || "selected"}".`}
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center p-6 text-xs text-muted-foreground space-y-1">
                  <Search className="w-6 h-6 mx-auto opacity-30" />
                  <p className="font-medium text-foreground">No matching products</p>
                  <p className="text-[11px]">Try adjusting your search query.</p>
                </div>
              ) : (
                filteredProducts.map((p, i) => {
                  const isSelected = p.productId === selectedProductId;
                  const totalQty = p.batches.reduce((sum, b) => sum + (Number(b.available_quantity) || 0), 0);
                  const unaddedCount = p.batches.filter(
                    (b) => !existingLines.some((l) => l.sourceInventoryLotId === b.inventory_lot_id)
                  ).length;
                  const isAllAdded = unaddedCount === 0;

                  return (
                    <motion.button
                      key={p.productId}
                      type="button"
                      disabled={isAllAdded}
                      onClick={() => handleSelectProduct(p.productId)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.18 }}
                      whileHover={!isAllAdded ? { scale: 1.01 } : {}}
                      whileTap={!isAllAdded ? { scale: 0.99 } : {}}
                      className={`text-left p-3 rounded-lg border transition-all duration-150 w-full relative ${
                        isAllAdded
                          ? "opacity-45 bg-muted/30 border-dashed cursor-not-allowed"
                          : isSelected
                          ? "bg-primary/10 border-primary ring-1 ring-primary/40 shadow-sm border-l-4 border-l-primary"
                          : "bg-card border-border hover:border-primary/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="text-xs font-semibold leading-snug text-foreground line-clamp-2">
                          {p.productDescription || p.productName}
                        </div>
                        {isSelected && !isAllAdded && (
                          <div className="shrink-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center mt-0.5">
                            <Check className="w-2.5 h-2.5 text-primary-foreground" />
                          </div>
                        )}
                        {isAllAdded && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0 font-normal">
                            All Added
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground truncate">
                        {p.productCode && (
                          <span className="font-mono">Code: {p.productCode}</span>
                        )}
                        <span>•</span>
                        <span>{p.uomName || "-"}</span>
                      </div>

                      <div className="mt-2 text-[11px] font-mono text-muted-foreground/80 flex items-center justify-between border-t pt-1.5">
                        <span>{p.batches.length} {p.batches.length === 1 ? "batch" : "batches"}</span>
                        <span className={`font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {totalQty.toLocaleString()} {p.uomName || ""}
                        </span>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </div>

          {/* ─── RIGHT COLUMN: BATCH DETAILS & CONFIGURE (~62% width) ─── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            {/* Top Sub-section: Available Batches Header & Filter */}
            <div className="px-5 py-3 border-b flex items-center justify-between gap-3 bg-muted/5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Available Batches in Source Lot
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 gap-1 font-semibold ${
                      isFefo
                        ? "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20"
                        : "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20"
                    }`}
                  >
                    {isFefo ? <Sparkles className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
                    {classification.strategy} Priority
                  </Badge>
                </div>
                {selectedProduct && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Selected Product: <strong className="text-foreground">{selectedProduct.productDescription || selectedProduct.productName}</strong>
                  </p>
                )}
              </div>

              {/* Batch Search Input */}
              {evaluatedBatches.length > 3 && (
                <div className="relative w-44 shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                    placeholder="Search batch #..."
                    className="h-8 pl-8 text-xs bg-card"
                  />
                  {batchSearch && (
                    <button
                      type="button"
                      onClick={() => setBatchSearch("")}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Middle: Scrollable Batches List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading && availableBatches.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : availableBatches.length === 0 ? (
                <div className="text-sm text-muted-foreground p-8 border rounded-xl bg-muted/20 text-center space-y-1">
                  <Package className="w-7 h-7 mx-auto opacity-40 text-muted-foreground" />
                  <p className="font-semibold text-foreground">No Batches Available</p>
                  <p className="text-xs">No active inventory batches with positive quantity found for this product in this lot.</p>
                </div>
              ) : evaluatedBatches.length > 0 && evaluatedBatches.every((b) => b.isAlreadyAdded) ? (
                <div className="text-sm text-muted-foreground p-8 border rounded-xl bg-muted/20 text-center space-y-1">
                  <Check className="w-7 h-7 mx-auto text-emerald-500 opacity-60" />
                  <p className="font-semibold text-foreground">All Batches Already Added</p>
                  <p className="text-xs">All inventory batches for this product have already been included in this transfer request.</p>
                </div>
              ) : filteredBatches.length === 0 ? (
                <div className="text-center p-8 text-xs text-muted-foreground space-y-1">
                  <Search className="w-6 h-6 mx-auto opacity-30" />
                  <p className="font-medium text-foreground">No batches match &ldquo;{batchSearch}&rdquo;</p>
                  <p className="text-[11px]">Clear the batch search to view all batches.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {filteredBatches.map((b, idx) => {
                      const isSelected = selectedBatch?.inventory_lot_id === b.inventory_lot_id;
                      const isBlocked = !b.eligibility.isEligible || b.isAlreadyAdded;

                      return (
                        <motion.div
                          key={b.inventory_lot_id}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.03, 0.2), duration: 0.18 }}
                          onClick={() => !isBlocked && handleSelectBatch(b)}
                          className={`p-3 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? "bg-primary/8 border-primary ring-1 ring-primary/40 shadow-sm border-l-4 border-l-primary"
                              : isBlocked
                              ? "opacity-50 cursor-not-allowed bg-muted/20 border-border"
                              : "bg-card border-border hover:border-primary/30 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-foreground text-xs">{b.batch_no}</span>
                              {b.isRecommended && (
                                <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1 text-[9px] px-1.5 py-0 font-medium">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {classification.strategy} Recommended
                                </Badge>
                              )}
                              {b.isAlreadyAdded && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                  Already Added
                                </Badge>
                              )}
                              {b.eligibility.isEligible && (b.qa_status === "DAMAGED" || b.qa_status === "QUARANTINED" || b.eligibility.isExpired) && (
                                <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/20 text-[9px] px-1.5 py-0 font-medium">
                                  Quarantine Relocation
                                </Badge>
                              )}
                              {!b.eligibility.isEligible && (
                                <Badge variant="destructive" className="gap-1 text-[9px] px-1.5 py-0">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {b.eligibility.reason || "Ineligible"}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                              {b.expiry_date && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Calendar className="w-3 h-3 text-muted-foreground" />
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
                              <span>QA: <strong className="text-foreground font-normal">{b.qa_status || "GOOD"}</strong></span>
                            </div>
                          </div>

                          <div className="text-right pl-3 shrink-0 flex items-center gap-3">
                            <div>
                              <div className="font-mono font-bold text-foreground text-sm">
                                {b.available_quantity.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {selectedProduct?.uomName || ""} available
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                : "border-muted-foreground/30 bg-muted/20"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Bottom: Docked / Persistent "Configure Line Item" Section */}
            <AnimatePresence>
              {selectedBatch && (
                <motion.div
                  key={selectedBatch.inventory_lot_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 border-t bg-muted/15 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Configure Transfer Quantity
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      Selected Batch: <strong className="text-foreground">{selectedBatch.batch_no}</strong>
                      {selectedBatch.expiry_date && (
                        <span className="ml-2 text-muted-foreground/70">
                          (Exp: {selectedBatch.expiry_date})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between h-5">
                        <label className="text-xs font-semibold text-foreground">
                          Transfer Quantity *
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
                        min={minAllowedQty}
                        placeholder="Enter quantity"
                        className="bg-card text-sm"
                        disabled={isTargetLotFull}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between h-5">
                        <label className="text-xs font-semibold text-foreground">
                          Target Batch Number *
                        </label>
                        <span className="text-[11px] text-muted-foreground/70 font-mono">
                          Format: [batch]-LT
                        </span>
                      </div>
                      <Input
                        value={targetBatchNo}
                        onChange={(e) => setCustomTargetBatchNo(e.target.value)}
                        placeholder="Destination batch #"
                        className="h-8 font-mono text-sm bg-card"
                        disabled={isTargetLotFull}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between h-5">
                      <label className="text-xs font-semibold text-foreground">
                        Line Remarks <span className="font-normal text-muted-foreground">(Optional)</span>
                      </label>
                    </div>
                    <Input
                      value={lineRemarks}
                      onChange={(e) => setLineRemarks(e.target.value)}
                      placeholder="e.g. Relocating near packaging line"
                      className="h-8 text-sm bg-card"
                      disabled={isTargetLotFull}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t shrink-0 flex items-center justify-between bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {existingLines.length > 0 && (
              <span><strong>{existingLines.length}</strong> line{existingLines.length !== 1 ? "s" : ""} already added in this request</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
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
              className="gap-1.5 min-w-[140px]"
            >
              <Check className="w-4 h-4" />
              Add to Transfer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
