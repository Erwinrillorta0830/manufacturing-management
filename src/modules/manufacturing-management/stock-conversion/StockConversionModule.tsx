"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { toast } from "sonner";
import { useStockConversion } from "./hooks/useStockConversion";
import { StockConversionTable } from "./components/StockConversionTable";
import { StockConversionModal, type OutputBatchDetails } from "./components/StockConversionModal";
import type { StockConversionProduct, RFIDTag, UnitTarget, StockConversionPayload } from "./types/stock-conversion.types";
import { ModuleSkeleton } from "@/components/shared/ModuleSkeleton";
import ErrorPage from "@/components/shared/ErrorPage";

const MemoizedStockConversionTable = memo(StockConversionTable);

interface StockConversionModuleProps {
  userId?: number;
  userBranchId?: number;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}

export default function StockConversionModule({
  userId = 0,
  userBranchId = 0,
}: StockConversionModuleProps) {
  // ── Core state ────────────────────────────────────────────────────────────
  const [selectedBranchId, setSelectedBranchId] = useState<number>(userBranchId);
  const [branches, setBranches] = useState<{ id: number; branch_name: string }[]>([]);

  useEffect(() => {
    fetch("/api/scm/inventory-management/branch-management")
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json.branches)) setBranches(json.branches);
      })
      .catch(err => console.error("Failed to fetch branches", err));
  }, []);

  const {
    data,
    totalCount,
    page,
    pageSize,
    setPage,
    setPageSize,
    options,
    isLoading,
    convertingId,
    error,
    refresh,
    loadProductsInventory,
    convertStock,
    setFilters,
  } = useStockConversion();
  
  // Initialize filters with branchId if available
  useEffect(() => {
    if (selectedBranchId > 0) {
      setFilters((prev: Record<string, string>) => ({ ...prev, branchId: String(selectedBranchId) }));
    }
  }, [selectedBranchId, setFilters]);

  const [selectedProduct, setSelectedProduct] = useState<StockConversionProduct | null>(null);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [, setIsSubmitting] = useState(false);

  const handleOpenConversion = useCallback((product: StockConversionProduct) => {
    setSelectedProduct(product);
    setIsUnitModalOpen(true);
  }, []);

  const handleUnitModalConfirm = useCallback(async (
    qtyToConvert: number,
    targetUnit: UnitTarget,
    convertedQuantity: number,
    outputBatch?: OutputBatchDetails
  ) => {
    setIsUnitModalOpen(false);

    if (!selectedProduct) return;

    const branchId = selectedBranchId > 0 ? selectedBranchId : userBranchId;
    if (!branchId || branchId <= 0) {
      toast.error("Branch Required", { description: "Please select a branch before converting stock." });
      return;
    }
    const currentUserId = userId;
    if (!currentUserId || currentUserId <= 0) {
      toast.error("Authentication Required", { description: "User session is invalid. Please log in again." });
      return;
    }
    const payload: StockConversionPayload = {
      productId: selectedProduct.productId,
      sourceUnitId: selectedProduct.currentUnitId,
      targetUnitId: targetUnit.unitId,
      targetProductId: targetUnit.targetProductId ?? selectedProduct.productId,
      quantityToConvert: qtyToConvert,
      convertedQuantity,
      pricePerUnit: selectedProduct.pricePerUnit,
      branchId,
      userId: currentUserId,
      sourceLotId: outputBatch?.sourceLotId,
      sourceInventoryLotId: outputBatch?.sourceInventoryLotId,
      sourceBatchNo: outputBatch?.sourceBatchNo || outputBatch?.sourceBatchSummary,
      sourceManufacturingDate: outputBatch?.sourceMfgDate,
      sourceExpiryDate: outputBatch?.sourceExpDate,
      sourceAllocations: outputBatch?.sourceAllocations,
      targetLotId: outputBatch?.targetLotId,
      targetBatchNo: outputBatch?.targetBatchNo,
      targetManufacturingDate: outputBatch?.targetMfgDate,
      targetExpiryDate: outputBatch?.targetExpDate,
      targetAllocations: outputBatch?.targetAllocations,
      rfidTags: [] as RFIDTag[],
      sourceFactor: selectedProduct.conversionFactor || 1,
      targetFactor: targetUnit.conversionFactor || 1,
    };

    setIsSubmitting(true);
    try {
      await convertStock(payload);
      setSelectedProduct(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedProduct, selectedBranchId, userBranchId, userId, convertStock]);

  // Track if we've successfully loaded data at least once
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!isLoading && !hasLoadedOnce) {
      queueMicrotask(() => {
        setHasLoadedOnce(true);
      });
    }
  }, [isLoading, hasLoadedOnce]);

  if (error) {
    return <ErrorPage code="500" title="Fetch Error" message={error} reset={refresh} />;
  }

  // Only show the big skeleton on the very first mount. 
  // Subsequent refreshes (like searching) will handle loading inside the table.
  if (isLoading && !hasLoadedOnce) {
    return <ModuleSkeleton rowCount={10} />;
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <MemoizedStockConversionTable
        data={data}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        setPage={setPage}
        setPageSize={setPageSize}
        onConvertClick={handleOpenConversion}
        onRefresh={refresh}
        options={options}
        convertingId={convertingId}
        onFilterChange={setFilters}
        loadProductsInventory={loadProductsInventory}
        isLoading={isLoading}
        branches={branches}
        selectedBranchId={selectedBranchId > 0 ? selectedBranchId : undefined}
        onBranchChange={val => setSelectedBranchId(val ?? 0)}
      />

      <StockConversionModal
        product={selectedProduct}
        branchId={selectedBranchId > 0 ? selectedBranchId : userBranchId}
        isOpen={isUnitModalOpen}
        onClose={() => setIsUnitModalOpen(false)}
        onConfirm={handleUnitModalConfirm}
      />
    </div>
  );
}
