"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { useStockConversionManual } from "./hooks/useStockConversionManual";
import { StockConversionTable } from "../stock-conversion/components/StockConversionTable";
import { StockConversionModal, OutputBatchDetails } from "../stock-conversion/components/StockConversionModal";
import type { StockConversionProduct, StockConversionPayload } from "./types/stock-conversion-manual.types";
import { ModuleSkeleton } from "@/components/shared/ModuleSkeleton";
import ErrorPage from "@/components/shared/ErrorPage";

const MemoizedStockConversionTable = memo(StockConversionTable);

interface StockConversionManualModuleProps {
  userId?: number;
  userBranchId?: number;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}

export default function StockConversionManualModule({
  userId = 0,
  userBranchId = 0,
}: StockConversionManualModuleProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<number>(userBranchId);
  const [branches, setBranches] = useState<{ id: number; branch_name: string; isActive?: number | boolean | string }[]>([]);

  useEffect(() => {
    fetch("/api/scm/inventory-management/branch-management")
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json.branches)) {
          const activeBranches = json.branches.filter(
            (b: { isActive?: number | boolean | string }) => b.isActive === 1 || b.isActive === true || b.isActive === "1"
          );
          setBranches(activeBranches);
        }
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
  } = useStockConversionManual(selectedBranchId > 0 ? selectedBranchId : undefined);

  const [selectedProduct, setSelectedProduct] = useState<StockConversionProduct | null>(null);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);

  const handleOpenConversion = useCallback((product: StockConversionProduct) => {
    setSelectedProduct(product);
    setIsUnitModalOpen(true);
  }, []);

  const handleConfirmUnitConversion = useCallback(async (
    qtyToConvert: number,
    targetUnit: { unitId: number; targetProductId?: number; name?: string; conversionFactor?: number },
    convertedQuantity: number,
    outputBatch?: OutputBatchDetails
  ) => {
    if (!selectedProduct) return;

    const branchId = selectedBranchId > 0 ? selectedBranchId : (userBranchId || 190);
    const payload: StockConversionPayload = {
      productId: selectedProduct.productId,
      sourceUnitId: selectedProduct.currentUnitId ?? 11,
      targetUnitId: targetUnit.unitId,
      targetProductId: targetUnit.targetProductId ?? selectedProduct.productId,
      quantityToConvert: qtyToConvert,
      convertedQuantity,
      pricePerUnit: selectedProduct.pricePerUnit,
      branchId,
      userId: userId || 24,
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
      sourceFactor: selectedProduct.conversionFactor || 1,
      targetFactor: targetUnit.conversionFactor || 1,
    };

    try {
      await convertStock(payload);
      setIsUnitModalOpen(false);
      setSelectedProduct(null);
    } finally {
      // Cleaned up
    }
  }, [selectedProduct, selectedBranchId, userBranchId, userId, convertStock]);

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
        onConfirm={handleConfirmUnitConversion}
      />
    </div>
  );
}
