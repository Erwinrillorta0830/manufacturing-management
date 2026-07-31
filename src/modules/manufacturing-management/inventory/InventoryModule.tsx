/* eslint-disable */
"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { useInventoryData } from "./hooks/useInventoryData";
import { useInventoryFilters } from "./hooks/useInventoryFilters";
import { usePickingReceiving } from "./hooks/usePickingReceiving";
import { useStockAdjustment } from "./hooks/useStockAdjustment";

import { InventoryHeader } from "./components/InventoryHeader";
import { InventoryControls } from "./components/InventoryControls";
import { StockOverviewTab } from "./components/StockOverviewTab";
import { BatchesTab } from "./components/BatchesTab";
import { LedgerTab } from "./components/LedgerTab";
import { MaterialPickingTab } from "./components/MaterialPickingTab";
import { FinishedGoodsReceivingTab } from "./components/FinishedGoodsReceivingTab";
import { StockAdjustmentModal } from "./components/StockAdjustmentModal";
import { PickingModal } from "./components/PickingModal";
import { ReceivingModal } from "./components/ReceivingModal";
import { ReceivingResultModal } from "./components/ReceivingResultModal";

export default function InventoryModule() {
    const { data, loading, flashStates, loadInventoryData } = useInventoryData();
    const filters = useInventoryFilters(data);
    const pickingReceiving = usePickingReceiving(filters.activeTab, loadInventoryData);
    const adjustment = useStockAdjustment(loadInventoryData);

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center p-24 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-semibold">Loading manufacturing inventory dashboard...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <style>{`
                @keyframes flash-green {
                    0% { background-color: rgba(16, 185, 129, 0.25); }
                    100% { background-color: transparent; }
                }
                @keyframes flash-red {
                    0% { background-color: rgba(239, 68, 68, 0.25); }
                    100% { background-color: transparent; }
                }
                .animate-flash-up {
                    animation: flash-green 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .animate-flash-down {
                    animation: flash-red 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>

            {/* KPI Header */}
            <InventoryHeader stockLevels={filters.stockLevels} data={data} />

            {/* Control Bar & Tab Switcher & Filters */}
            <InventoryControls
                activeTab={filters.activeTab}
                setActiveTab={filters.setActiveTab}
                ledgerType={filters.ledgerType}
                setLedgerType={filters.setLedgerType}
                filterBranch={filters.filterBranch}
                setFilterBranch={filters.setFilterBranch}
                filterBrand={filters.filterBrand}
                setFilterBrand={filters.setFilterBrand}
                filterCategory={filters.filterCategory}
                setFilterCategory={filters.setFilterCategory}
                filterProduct={filters.filterProduct}
                setFilterProduct={filters.setFilterProduct}
                filterStartDate={filters.filterStartDate}
                setFilterStartDate={filters.setFilterStartDate}
                filterEndDate={filters.filterEndDate}
                setFilterEndDate={filters.setFilterEndDate}
                searchQuery={filters.searchQuery}
                setSearchQuery={filters.setSearchQuery}
                lowStockFilter={filters.lowStockFilter}
                setLowStockFilter={filters.setLowStockFilter}
                expiryFilter={filters.expiryFilter}
                setExpiryFilter={filters.setExpiryFilter}
                data={data}
                loading={loading}
                onSync={loadInventoryData}
                onOpenAdjustment={() => adjustment.setIsAdjustmentModalOpen(true)}
            />

            {/* Tab Body Content */}
            <div className="overflow-x-auto">
                {filters.activeTab === "stock" && (
                    <StockOverviewTab
                        groupedStock={filters.groupedStock}
                        stockLevels={filters.stockLevels}
                        isExpanded={filters.isExpanded}
                        toggleGroup={filters.toggleGroup}
                        expandedProducts={filters.expandedProducts}
                        toggleProductExpand={filters.toggleProductExpand}
                        flashStates={flashStates}
                        data={data}
                    />
                )}

                {filters.activeTab === "batches" && (
                    <BatchesTab
                        productBatchesGrouped={filters.productBatchesGrouped}
                        expandedBatches={filters.expandedBatches}
                        toggleBatchExpand={filters.toggleBatchExpand}
                    />
                )}

                {filters.activeTab === "ledger" && (
                    <LedgerTab
                        filteredLedger={filters.filteredLedger}
                        expandedLedgers={filters.expandedLedgers}
                        toggleLedgerExpand={filters.toggleLedgerExpand}
                    />
                )}

                {filters.activeTab === "picking" && (
                    <MaterialPickingTab
                        pickingList={pickingReceiving.pickingList}
                        pickingLoading={pickingReceiving.pickingLoading}
                        searchQuery={filters.searchQuery}
                        data={data}
                        onSelectPickingJO={(jo) => {
                            pickingReceiving.setSelectedPickingJO(jo);
                            pickingReceiving.setIsPickingModalOpen(true);
                        }}
                    />
                )}

                {filters.activeTab === "receiving" && (
                    <FinishedGoodsReceivingTab
                        receivingJOs={pickingReceiving.receivingJOs}
                        receivingLoading={pickingReceiving.receivingLoading}
                        searchQuery={filters.searchQuery}
                        data={data}
                        onSelectReceivingJO={(jo) => {
                            pickingReceiving.setSelectedReceivingJO(jo);
                            pickingReceiving.setRecQtyProduced(String((jo as any).quantity || jo.planned_quantity || ""));
                            pickingReceiving.setRecLotNumber(`MFG-${jo.jo_id}`);
                            pickingReceiving.setRecExpirationDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
                            const stdProd = data?.products?.find(p => p.product_id === jo.product_id);
                            pickingReceiving.setRecUnitCost(String(stdProd?.cost_per_unit || 0));
                            pickingReceiving.setIsReceivingModalOpen(true);
                        }}
                        onViewYieldReport={(jo) => {
                            pickingReceiving.setReceivingResult({
                                success: true,
                                joId: jo.jo_id,
                                yieldQuantity: (jo as any).quantity || jo.planned_quantity || 0,
                                allocations: (jo as any).yieldAllocations || [],
                                ...((jo as any).materialCostVariances ? { materialCostVariances: (jo as any).materialCostVariances } : {})
                            });
                            pickingReceiving.setSelectedReceivingJO(jo);
                            pickingReceiving.setShowReceivingResult(true);
                        }}
                    />
                )}
            </div>

            {/* Modals */}
            <StockAdjustmentModal
                isOpen={adjustment.isAdjustmentModalOpen}
                onClose={() => adjustment.setIsAdjustmentModalOpen(false)}
                data={data}
                adjProductId={adjustment.adjProductId}
                setAdjProductId={adjustment.setAdjProductId}
                adjBranchId={adjustment.adjBranchId}
                setAdjBranchId={adjustment.setAdjBranchId}
                adjQty={adjustment.adjQty}
                setAdjQty={adjustment.setAdjQty}
                adjType={adjustment.adjType}
                setAdjType={adjustment.setAdjType}
                adjRemarks={adjustment.adjRemarks}
                setAdjRemarks={adjustment.setAdjRemarks}
                adjDate={adjustment.adjDate}
                setAdjDate={adjustment.setAdjDate}
                submittingAdj={adjustment.submittingAdj}
                onSubmit={adjustment.handlePostAdjustment}
            />

            <PickingModal
                isOpen={pickingReceiving.isPickingModalOpen}
                onClose={() => pickingReceiving.setIsPickingModalOpen(false)}
                selectedPickingJO={pickingReceiving.selectedPickingJO}
                data={data}
                pickingSubmitting={pickingReceiving.pickingSubmitting}
                onConfirmPick={pickingReceiving.handleConfirmPick}
            />

            <ReceivingModal
                isOpen={pickingReceiving.isReceivingModalOpen}
                onClose={() => pickingReceiving.setIsPickingModalOpen(false)}
                selectedReceivingJO={pickingReceiving.selectedReceivingJO}
                data={data}
                recQtyProduced={pickingReceiving.recQtyProduced}
                setRecQtyProduced={pickingReceiving.setRecQtyProduced}
                recLotNumber={pickingReceiving.recLotNumber}
                setRecLotNumber={pickingReceiving.setRecLotNumber}
                recExpirationDate={pickingReceiving.recExpirationDate}
                setRecExpirationDate={pickingReceiving.setRecExpirationDate}
                recUnitCost={pickingReceiving.recUnitCost}
                setRecUnitCost={pickingReceiving.setRecUnitCost}
                recSubmitting={pickingReceiving.recSubmitting}
                onSubmit={pickingReceiving.handleConfirmReceiving}
            />

            <ReceivingResultModal
                isOpen={pickingReceiving.showReceivingResult}
                onClose={() => {
                    pickingReceiving.setShowReceivingResult(false);
                    pickingReceiving.setIsReceivingModalOpen(false);
                }}
                selectedReceivingJO={pickingReceiving.selectedReceivingJO}
                receivingResult={pickingReceiving.receivingResult}
            />
        </div>
    );
}
