"use client";

import { useState, useEffect, useMemo } from "react";
import { LayoutGrid, Warehouse, Layers, Plus, RefreshCw, ArrowLeftRight } from "lucide-react";
import { useLotManagement } from "./hooks/useLotManagement";
import { useBatchRegistration } from "./hooks/useBatchRegistration";
import { useInventoryMovements } from "./hooks/useInventoryMovements";
import LotKpiCards from "./components/LotKpiCards";
import WarehouseRackView from "./components/WarehouseRackView";
import LotTable from "./components/LotTable";
import BatchTable from "./components/BatchTable";
import InventoryMovementTable from "./components/InventoryMovementTable";
import LotFormDialog from "./components/LotFormDialog";
import BatchFormDialog from "./components/BatchFormDialog";
import BatchMovementsDialog from "./components/BatchMovementsDialog";
import { SearchableProductSelect } from "./components/SearchableProductSelect";
import { Batch } from "./types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function LotManagementModule() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);
    const {
        lots,
        filteredLots,
        loading: loadingLots,
        saving: savingLot,
        searchQuery: lotSearchQuery,
        setSearchQuery: setLotSearchQuery,
        uoms,
        branches,
        isFormOpen: isLotFormOpen,
        editingLot,
        formData: lotFormData,
        formErrors: lotFormErrors,
        isDuplicateLotName,
        openCreateDialog: openCreateLotDialog,
        openEditDialog: openEditLotDialog,
        closeDialog: closeLotDialog,
        handleFormChange: handleLotFormChange,
        handleCreate: handleCreateLot,
        handleUpdate: handleUpdateLot,
        loadLots
    } = useLotManagement();

    const [selectedProductId, setSelectedProductId] = useState<number | "ALL">("ALL");

    const {
        batches,
        products,
        loadingBatches,
        savingBatch,
        selectedLotFilter,
        setSelectedLotFilter,
        statusFilter,
        setStatusFilter,
        batchSearchQuery,
        setBatchSearchQuery,
        isBatchFormOpen,
        editingBatch,
        batchFormData,
        batchFormErrors,
        openCreateBatchDialog,
        closeBatchDialog,
        handleBatchFormChange,
        handleCreateBatch,
        handleUpdateBatch,
        handleDeleteBatch,
        filteredBatches,
        kpiMetrics,
        loadBatches
    } = useBatchRegistration(lots, selectedProductId);

    // Inventory Movements Hook (/api/mm-inventory-movements/all)
    const {
        movements,
        filteredMovements,
        loadingMovements,
        movementSearchQuery,
        setMovementSearchQuery,
        directionFilter,
        setDirectionFilter,
        transactionTypeFilter,
        setTransactionTypeFilter,
        lotFilter: movementLotFilter,
        setLotFilter: setMovementLotFilter,
        productFilter: movementProductFilter,
        setProductFilter: setMovementProductFilter,
        availableTransactionTypes,
        movementStats,
        loadMovements,
        resetFilters: resetMovementFilters
    } = useInventoryMovements(selectedProductId);

    const [activeTab, setActiveTab] = useState<"rack-view" | "storage-lots" | "batch-table" | "movement-history">("rack-view");

    // Modal state for viewing movement audit trail for a specific batch
    const [auditBatch, setAuditBatch] = useState<Batch | null>(null);
    const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);

    const handleOpenBatchAudit = (batch: Batch) => {
        setAuditBatch(batch);
        setIsAuditDialogOpen(true);
    };

    const handleCloseBatchAudit = () => {
        setAuditBatch(null);
        setIsAuditDialogOpen(false);
    };

    const handleViewLotMovements = (lotId: number) => {
        setMovementLotFilter(lotId);
        setActiveTab("movement-history");
    };

    const handleRefreshAll = () => {
        loadLots();
        loadBatches();
        loadMovements();
    };

    const displayedLotsForTable = useMemo(() => {
        if (selectedProductId === "ALL") return filteredLots;
        const relevantLotIds = new Set(
            batches
                .filter((b) => Number(b.productId) === Number(selectedProductId))
                .map((b) => b.lotId)
        );
        return filteredLots.filter((l) => relevantLotIds.has(l.lotId));
    }, [filteredLots, batches, selectedProductId]);

    if (!mounted) {
        return (
            <div className="space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />
                    ))}
                </div>
                <div className="h-12 rounded-xl border border-border bg-card animate-pulse" />
                <div className="h-96 rounded-xl border border-border bg-card animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Top KPI Metrics Overview */}
            <LotKpiCards metrics={kpiMetrics} />

            {/* Tabbed View Navigation & Action Toolbar */}
            <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as "rack-view" | "storage-lots" | "batch-table" | "movement-history")}
                className="space-y-4"
            >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-card p-2 rounded-xl border border-border shadow-xs">
                    <TabsList className="bg-muted/60 p-1 rounded-lg">
                        <TabsTrigger
                            value="rack-view"
                            className="gap-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs px-3.5 h-8"
                        >
                            <LayoutGrid className="h-4 w-4 text-primary" />
                            Visual Rack Grid
                        </TabsTrigger>
                        <TabsTrigger
                            value="storage-lots"
                            className="gap-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs px-3.5 h-8"
                        >
                            <Warehouse className="h-4 w-4 text-primary" />
                            Storage Racks ({displayedLotsForTable.length})
                        </TabsTrigger>
                        <TabsTrigger
                            value="batch-table"
                            className="gap-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs px-3.5 h-8"
                        >
                            <Layers className="h-4 w-4 text-primary" />
                            Registered Batches ({filteredBatches.length})
                        </TabsTrigger>
                        <TabsTrigger
                            value="movement-history"
                            className="gap-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs px-3.5 h-8"
                        >
                            <ArrowLeftRight className="h-4 w-4 text-primary" />
                            Movement History ({filteredMovements.length})
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                        {/* Global Product FEFO Searchable Dropdown */}
                        <div className="w-[300px] sm:w-[300px]">
                            <SearchableProductSelect
                                products={products}
                                value={selectedProductId}
                                onValueChange={setSelectedProductId}
                                allowAll={true}
                                allLabel="All Products (Global FEFO)"
                                placeholder="All Products (Global FEFO)"
                                className="h-8.5 bg-background shadow-2xs"
                            />
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleRefreshAll}
                            className="h-8.5 w-8.5 shrink-0"
                            title="Refresh Data"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            onClick={openCreateLotDialog}
                            className="h-8.5 gap-1.5 text-xs shrink-0"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add Rack / Lot
                        </Button>
                    </div>
                </div>

                {/* Tab 1: Visual Warehouse Rack Grid */}
                <TabsContent value="rack-view" className="mt-0 space-y-4 outline-none">
                    <WarehouseRackView
                        lots={filteredLots}
                        batches={batches}
                        loading={loadingLots || loadingBatches}
                        selectedProductId={selectedProductId}
                        onEditLot={openEditLotDialog}
                        onViewBatchMovements={handleOpenBatchAudit}
                        onViewLotMovements={handleViewLotMovements}
                    />
                </TabsContent>

                {/* Tab 2: Storage Lots Table */}
                <TabsContent value="storage-lots" className="mt-0 outline-none">
                    <LotTable
                        filteredLots={displayedLotsForTable}
                        loading={loadingLots}
                        searchQuery={lotSearchQuery}
                        onSearchChange={setLotSearchQuery}
                        onEdit={openEditLotDialog}
                        onRefresh={loadLots}
                        onAddClick={openCreateLotDialog}
                    />
                </TabsContent>

                {/* Tab 3: Registered Batches Table */}
                <TabsContent value="batch-table" className="mt-0 outline-none">
                    <BatchTable
                        batches={filteredBatches}
                        lots={lots}
                        loading={loadingBatches}
                        searchQuery={batchSearchQuery}
                        onSearchChange={setBatchSearchQuery}
                        selectedLotFilter={selectedLotFilter}
                        onLotFilterChange={setSelectedLotFilter}
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        selectedProductId={selectedProductId}
                        onDelete={handleDeleteBatch}
                        onRefresh={loadBatches}
                        onAddClick={() => openCreateBatchDialog()}
                        onViewMovements={handleOpenBatchAudit}
                    />
                </TabsContent>

                {/* Tab 4: Inventory Movements (/api/mm-inventory-movements/all) */}
                <TabsContent value="movement-history" className="mt-0 outline-none">
                    <InventoryMovementTable
                        movements={filteredMovements}
                        lots={lots}
                        products={products}
                        loading={loadingMovements}
                        searchQuery={movementSearchQuery}
                        onSearchChange={setMovementSearchQuery}
                        directionFilter={directionFilter}
                        onDirectionFilterChange={setDirectionFilter}
                        transactionTypeFilter={transactionTypeFilter}
                        onTransactionTypeFilterChange={setTransactionTypeFilter}
                        lotFilter={movementLotFilter}
                        onLotFilterChange={setMovementLotFilter}
                        productFilter={movementProductFilter}
                        onProductFilterChange={setMovementProductFilter}
                        availableTransactionTypes={availableTransactionTypes}
                        onRefresh={loadMovements}
                        onResetFilters={resetMovementFilters}
                        stats={movementStats}
                    />
                </TabsContent>
            </Tabs>

            {/* Storage Lot Dialog */}
            <LotFormDialog
                isOpen={isLotFormOpen}
                onClose={closeLotDialog}
                onSubmit={editingLot ? handleUpdateLot : handleCreateLot}
                editingLot={editingLot}
                formData={lotFormData}
                formErrors={lotFormErrors}
                isDuplicateLotName={isDuplicateLotName}
                onFormChange={handleLotFormChange}
                uoms={uoms}
                branches={branches}
                saving={savingLot}
            />

            {/* Batch Registration Dialog */}
            <BatchFormDialog
                isOpen={isBatchFormOpen}
                onClose={closeBatchDialog}
                onSubmit={editingBatch ? handleUpdateBatch : handleCreateBatch}
                editingBatch={editingBatch}
                formData={batchFormData}
                formErrors={batchFormErrors}
                onFormChange={handleBatchFormChange}
                lots={lots}
                uoms={uoms}
                products={products}
                saving={savingBatch}
            />

            {/* Batch Movement History Audit Dialog */}
            <BatchMovementsDialog
                isOpen={isAuditDialogOpen}
                onClose={handleCloseBatchAudit}
                batch={auditBatch}
                movements={movements}
                loading={loadingMovements}
            />
        </div>
    );
}

