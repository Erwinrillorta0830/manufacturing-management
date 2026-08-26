"use client";

import React, { useState } from "react";
import { LayoutGrid, Warehouse, Layers, Plus, RefreshCw } from "lucide-react";
import { useLotManagement } from "./hooks/useLotManagement";
import { useBatchRegistration } from "./hooks/useBatchRegistration";
import LotKpiCards from "./components/LotKpiCards";
import WarehouseRackView from "./components/WarehouseRackView";
import LotTable from "./components/LotTable";
import BatchTable from "./components/BatchTable";
import LotFormDialog from "./components/LotFormDialog";
import BatchFormDialog from "./components/BatchFormDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";

export default function LotManagementModule() {
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
        openEditBatchDialog,
        closeBatchDialog,
        handleBatchFormChange,
        handleCreateBatch,
        handleUpdateBatch,
        handleDeleteBatch,
        filteredBatches,
        kpiMetrics,
        loadBatches
    } = useBatchRegistration(lots, selectedProductId);

    const [activeTab, setActiveTab] = useState<"rack-view" | "storage-lots" | "batch-table">("rack-view");


    const handleRefreshAll = () => {
        loadLots();
        loadBatches();
    };

    return (
        <div className="space-y-5">
            {/* Top KPI Metrics Overview */}
            <LotKpiCards metrics={kpiMetrics} />

            {/* Tabbed View Navigation & Action Toolbar */}
            <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as "rack-view" | "storage-lots" | "batch-table")}
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
                            Storage Racks ({lots.length})
                        </TabsTrigger>
                        <TabsTrigger
                            value="batch-table"
                            className="gap-2 text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-xs px-3.5 h-8"
                        >
                            <Layers className="h-4 w-4 text-primary" />
                            Registered Batches ({batches.length})
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                        {/* Product FEFO Context Selector */}
                        <div className="flex items-center gap-2 bg-background px-2.5 py-1 rounded-lg border border-border h-9 shadow-2xs">
                            <Select
                                value={selectedProductId === "ALL" ? "ALL" : String(selectedProductId)}
                                onValueChange={(val) => setSelectedProductId(val === "ALL" ? "ALL" : Number(val))}
                            >
                                <SelectTrigger className="h-7 border-none bg-transparent shadow-none text-xs font-bold w-[220px] max-w-[280px] p-0 focus:ring-0 focus:ring-offset-0 truncate">
                                    <SelectValue placeholder="All Products (FEFO)" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border border-border max-h-[260px] min-w-[280px]">
                                    <SelectItem value="ALL">
                                        <span className="font-bold text-xs truncate">All Products (Global FEFO)</span>
                                    </SelectItem>
                                    {products.map((p) => (
                                        <SelectItem key={p.productId} value={String(p.productId)}>
                                            <span className="font-semibold text-xs truncate">
                                                {p.productName} {p.skuCode ? `(${p.skuCode})` : ""}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                        <Button
                            onClick={() => openCreateBatchDialog()}
                            className="h-8.5 gap-1.5 text-xs shadow-md shadow-primary/15 shrink-0"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Register Batch
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
                        onAddBatchToLot={(lotId) => openCreateBatchDialog(lotId)}
                        onEditBatch={openEditBatchDialog}
                    />
                </TabsContent>

                {/* Tab 2: Storage Lots Table */}
                <TabsContent value="storage-lots" className="mt-0 outline-none">
                    <LotTable
                        filteredLots={filteredLots}
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
                        onEdit={openEditBatchDialog}
                        onDelete={handleDeleteBatch}
                        onRefresh={loadBatches}
                        onAddClick={() => openCreateBatchDialog()}
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
        </div>
    );
}
