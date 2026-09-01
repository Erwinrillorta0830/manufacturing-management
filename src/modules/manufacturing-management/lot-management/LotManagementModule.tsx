"use client";

import { useState, useEffect, useMemo } from "react";
import { LayoutGrid, Warehouse, Layers, RefreshCw, ArrowLeftRight, Search, X, RotateCcw } from "lucide-react";
import { useLotManagement } from "./hooks/useLotManagement";
import { useBatchRegistration } from "./hooks/useBatchRegistration";
import { useInventoryMovements } from "./hooks/useInventoryMovements";
import LotKpiCards from "./components/LotKpiCards";
import WarehouseRackView from "./components/WarehouseRackView";
import LotTable from "./components/LotTable";
import BatchTable from "./components/BatchTable";
import InventoryMovementTable from "./components/InventoryMovementTable";
import BatchMovementsDialog from "./components/BatchMovementsDialog";
import { SearchableProductSelect } from "./components/SearchableProductSelect";
import { SearchableLotSelect } from "./components/SearchableLotSelect";
import { SearchableBatchSelect } from "./components/SearchableBatchSelect";
import { Batch } from "./types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LotManagementModule() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            setMounted(true);
        });
    }, []);
    const {
        lots,
        filteredLots,
        loading: loadingLots,
        searchQuery: lotSearchQuery,
        setSearchQuery: setLotSearchQuery,
        // uoms,
        loadLots
    } = useLotManagement();

    // Global Filter States
    const [selectedProductId, setSelectedProductId] = useState<number | "ALL">("ALL");
    const [selectedLotId, setSelectedLotId] = useState<number | "ALL">("ALL");
    const [selectedBatchId, setSelectedBatchId] = useState<number | "ALL">("ALL");
    const [globalSearchQuery, setGlobalSearchQuery] = useState("");

    const {
        batches,
        products,
        loadingBatches,
        selectedLotFilter,
        setSelectedLotFilter,
        statusFilter,
        setStatusFilter,
        batchSearchQuery,
        setBatchSearchQuery,
        handleDeleteBatch,
        filteredBatches,
        kpiMetrics,
        loadBatches
    } = useBatchRegistration(
        lots,
        selectedProductId,
        selectedLotId,
        selectedBatchId,
        globalSearchQuery
    );

    // Inventory Movements Hook
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
    } = useInventoryMovements(
        selectedProductId,
        selectedLotId,
        selectedBatchId,
        globalSearchQuery
    );

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

    // Cascaded available options for Lot & Batch dropdowns
    const availableLotsForSelect = useMemo(() => {
        if (selectedProductId === "ALL") return lots;
        const relevantLotIds = new Set(
            batches
                .filter((b) => Number(b.productId) === Number(selectedProductId))
                .map((b) => b.lotId)
        );
        return lots.filter((l) => relevantLotIds.has(l.lotId));
    }, [lots, batches, selectedProductId]);

    const availableBatchesForSelect = useMemo(() => {
        return batches.filter((b) => {
            if (selectedProductId !== "ALL" && Number(b.productId) !== Number(selectedProductId)) {
                return false;
            }
            if (selectedLotId !== "ALL" && Number(b.lotId) !== Number(selectedLotId)) {
                return false;
            }
            return true;
        });
    }, [batches, selectedProductId, selectedLotId]);

    const hasAnyFilterActive =
        selectedProductId !== "ALL" ||
        selectedLotId !== "ALL" ||
        selectedBatchId !== "ALL" ||
        globalSearchQuery.trim() !== "";

    const handleResetAllFilters = () => {
        setSelectedProductId("ALL");
        setSelectedLotId("ALL");
        setSelectedBatchId("ALL");
        setGlobalSearchQuery("");
    };

    const displayedLotsForTable = useMemo(() => {
        let baseLots = filteredLots;
        if (selectedLotId !== "ALL") {
            baseLots = baseLots.filter((l) => Number(l.lotId) === Number(selectedLotId));
        }
        if (selectedProductId !== "ALL") {
            const relevantLotIds = new Set(
                batches
                    .filter((b) => Number(b.productId) === Number(selectedProductId))
                    .map((b) => b.lotId)
            );
            baseLots = baseLots.filter((l) => relevantLotIds.has(l.lotId));
        }
        if (selectedBatchId !== "ALL") {
            const batch = batches.find((b) => Number(b.batchId) === Number(selectedBatchId));
            if (batch) {
                baseLots = baseLots.filter((l) => Number(l.lotId) === Number(batch.lotId));
            }
        }
        if (globalSearchQuery.trim()) {
            const q = globalSearchQuery.toLowerCase().trim();
            baseLots = baseLots.filter((l) => {
                const nameMatches = l.lotName?.toLowerCase().includes(q);
                const hasMatchingBatch = batches.some(
                    (b) =>
                        Number(b.lotId) === Number(l.lotId) &&
                        (b.batchNumber?.toLowerCase().includes(q) ||
                            b.productName?.toLowerCase().includes(q) ||
                            b.itemCode?.toLowerCase().includes(q))
                );
                return nameMatches || hasMatchingBatch;
            });
        }
        return baseLots;
    }, [filteredLots, batches, selectedProductId, selectedLotId, selectedBatchId, globalSearchQuery]);

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
                <div className="flex flex-col gap-3 bg-card p-3 rounded-xl border border-border shadow-xs">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                        <TabsList className="bg-muted/60 p-1 rounded-lg shrink-0 flex-wrap">
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

                        <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                            {/* Global Searchbar */}
                            <div className="relative flex-1 lg:w-[240px]">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Search batch, SKU, lot..."
                                    value={globalSearchQuery}
                                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                                    className="pl-8 pr-7 h-8.5 text-xs bg-background shadow-2xs"
                                />
                                {globalSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setGlobalSearchQuery("")}
                                        className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
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

                            {hasAnyFilterActive && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleResetAllFilters}
                                    className="h-8.5 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1 font-medium"
                                    title="Reset all filters"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Filter Dropdowns Row: Product, Lot, Batch */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border/50">
                        {/* 1. Global Product Select */}
                        <div className="w-full">
                            <SearchableProductSelect
                                products={products}
                                value={selectedProductId}
                                onValueChange={(val) => {
                                    setSelectedProductId(val);
                                }}
                                allowAll={true}
                                allLabel="All Products (Global FEFO)"
                                placeholder="All Products (Global FEFO)"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>

                        {/* 2. Global Storage Lot Select */}
                        <div className="w-full">
                            <SearchableLotSelect
                                lots={availableLotsForSelect}
                                value={selectedLotId}
                                onValueChange={(val) => {
                                    setSelectedLotId(val);
                                }}
                                allowAll={true}
                                placeholder="All Storage Racks / Lots"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>

                        {/* 3. Global Batch Select */}
                        <div className="w-full">
                            <SearchableBatchSelect
                                batches={availableBatchesForSelect}
                                value={selectedBatchId}
                                onValueChange={(val) => {
                                    setSelectedBatchId(val);
                                }}
                                allowAll={true}
                                allLabel="All Batches"
                                placeholder="All Batches"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* Tab 1: Visual Warehouse Rack Grid */}
                <TabsContent value="rack-view" className="mt-0 space-y-4 outline-none">
                    <WarehouseRackView
                        lots={filteredLots}
                        batches={batches}
                        loading={loadingLots || loadingBatches}
                        selectedProductId={selectedProductId}
                        selectedLotId={selectedLotId}
                        selectedBatchId={selectedBatchId}
                        searchQuery={globalSearchQuery}
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
                        onRefresh={loadLots}
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


