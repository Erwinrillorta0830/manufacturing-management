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
import LotBatchesDialog from "./components/LotBatchesDialog";
import { SearchableProductSelect } from "./components/SearchableProductSelect";
import { SearchableLotSelect } from "./components/SearchableLotSelect";
import { SearchableBatchSelect } from "./components/SearchableBatchSelect";
import { SearchableBranchSelect } from "./components/SearchableBranchSelect";
import { SearchableProductTypeSelect } from "./components/SearchableProductTypeSelect";
import { SearchableUomSelect } from "./components/SearchableUomSelect";
import { resolveProductClassification } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";
import { Batch, Lot } from "./types";
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
        branches,
        uoms,
        filteredLots,
        loading: loadingLots,
        searchQuery: lotSearchQuery,
        setSearchQuery: setLotSearchQuery,
        loadLots
    } = useLotManagement();

    // Global Filter States
    const [selectedBranchId, setSelectedBranchId] = useState<number | "ALL">("ALL");
    const [selectedProductType, setSelectedProductType] = useState<string | "ALL">("ALL");
    const [selectedUomId, setSelectedUomId] = useState<number | "ALL">("ALL");
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
        globalSearchQuery,
        selectedBranchId,
        selectedProductType,
        selectedUomId
    );

    // Inventory Movements Hook
    const {
        movements,
        filteredMovements,
        loadingMovements,
        movementError,
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
        globalSearchQuery,
        selectedBranchId,
        selectedProductType,
        selectedUomId
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

    // Modal state for viewing batches stored inside a specific storage lot
    const [selectedLotForBatches, setSelectedLotForBatches] = useState<Lot | null>(null);
    const [isLotBatchesDialogOpen, setIsLotBatchesDialogOpen] = useState(false);

    const handleOpenLotBatches = (lot: Lot) => {
        setSelectedLotForBatches(lot);
        setIsLotBatchesDialogOpen(true);
    };

    const handleCloseLotBatches = () => {
        setSelectedLotForBatches(null);
        setIsLotBatchesDialogOpen(false);
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

    // Cascaded available options for Product, Lot & Batch dropdowns
    const availableProductsForSelect = useMemo(() => {
        if (selectedProductType === "ALL") return products;
        return products.filter((p) => {
            const pType = (p as { productType?: unknown; product_type?: unknown }).productType || (p as { productType?: unknown; product_type?: unknown }).product_type;
            const pCat = (p as { productCategory?: unknown; category_name?: unknown }).productCategory || (p as { productCategory?: unknown; category_name?: unknown }).category_name;
            const cls = resolveProductClassification(pType, pCat, p.skuCode, p.productName);
            return cls.code === selectedProductType;
        });
    }, [products, selectedProductType]);

    const availableLotsForSelect = useMemo(() => {
        let baseLots = lots;
        if (selectedBranchId !== "ALL") {
            baseLots = baseLots.filter((l) => Number(l.branchId) === Number(selectedBranchId));
        }
        if (selectedUomId !== "ALL") {
            baseLots = baseLots.filter((l) => Number(l.uomId) === Number(selectedUomId));
        }
        if (selectedProductType !== "ALL") {
            const relevantLotIds = new Set(
                batches
                    .filter((b) => {
                        const cls = resolveProductClassification(b.productType, b.productCategory, b.itemCode, b.productName);
                        return cls.code === selectedProductType;
                    })
                    .map((b) => b.lotId)
            );
            baseLots = baseLots.filter((l) => relevantLotIds.has(l.lotId));
        }
        if (selectedProductId === "ALL") return baseLots;
        const relevantLotIds = new Set(
            batches
                .filter((b) => Number(b.productId) === Number(selectedProductId))
                .map((b) => b.lotId)
        );
        return baseLots.filter((l) => relevantLotIds.has(l.lotId));
    }, [lots, batches, selectedBranchId, selectedProductType, selectedUomId, selectedProductId]);

    const availableBatchesForSelect = useMemo(() => {
        return batches.filter((b) => {
            if (selectedBranchId !== "ALL") {
                const matchedLot = lots.find((l) => Number(l.lotId) === Number(b.lotId));
                if (matchedLot && Number(matchedLot.branchId) !== Number(selectedBranchId)) {
                    return false;
                }
            }
            if (selectedProductType !== "ALL") {
                const cls = resolveProductClassification(b.productType, b.productCategory, b.itemCode, b.productName);
                if (cls.code !== selectedProductType) {
                    return false;
                }
            }
            if (selectedUomId !== "ALL") {
                const matchedLot = lots.find((l) => Number(l.lotId) === Number(b.lotId));
                if (Number(b.uomId) !== Number(selectedUomId) && Number(matchedLot?.uomId) !== Number(selectedUomId)) {
                    return false;
                }
            }
            if (selectedProductId !== "ALL" && Number(b.productId) !== Number(selectedProductId)) {
                return false;
            }
            if (selectedLotId !== "ALL" && Number(b.lotId) !== Number(selectedLotId)) {
                return false;
            }
            return true;
        });
    }, [batches, lots, selectedBranchId, selectedProductType, selectedUomId, selectedProductId, selectedLotId]);

    const hasAnyFilterActive =
        selectedBranchId !== "ALL" ||
        selectedProductType !== "ALL" ||
        selectedUomId !== "ALL" ||
        selectedProductId !== "ALL" ||
        selectedLotId !== "ALL" ||
        selectedBatchId !== "ALL" ||
        globalSearchQuery.trim() !== "";

    const handleResetAllFilters = () => {
        setSelectedBranchId("ALL");
        setSelectedProductType("ALL");
        setSelectedUomId("ALL");
        setSelectedProductId("ALL");
        setSelectedLotId("ALL");
        setSelectedBatchId("ALL");
        setGlobalSearchQuery("");
    };

    const displayedLotsForTable = useMemo(() => {
        let baseLots = filteredLots;
        if (selectedBranchId !== "ALL") {
            baseLots = baseLots.filter((l) => Number(l.branchId) === Number(selectedBranchId));
        }
        if (selectedUomId !== "ALL") {
            baseLots = baseLots.filter((l) => Number(l.uomId) === Number(selectedUomId));
        }
        if (selectedProductType !== "ALL") {
            const relevantLotIds = new Set(
                batches
                    .filter((b) => {
                        const cls = resolveProductClassification(b.productType, b.productCategory, b.itemCode, b.productName);
                        return cls.code === selectedProductType;
                    })
                    .map((b) => b.lotId)
            );
            baseLots = baseLots.filter((l) => relevantLotIds.has(l.lotId));
        }
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
    }, [filteredLots, batches, selectedBranchId, selectedProductType, selectedUomId, selectedProductId, selectedLotId, selectedBatchId, globalSearchQuery]);

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

            {/* Navigation Tabs with Modern Capsule Styling */}
            <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as typeof activeTab)}
                className="w-full space-y-4"
            >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-1.5 rounded-xl border border-border">
                    <TabsList className="grid grid-cols-2 sm:flex sm:flex-row h-auto p-1 bg-muted/60 rounded-lg gap-1 w-full sm:w-auto">
                        <TabsTrigger
                            value="rack-view"
                            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs transition-all"
                        >
                            <Warehouse className="h-3.5 w-3.5 text-primary" />
                            Visual Rack Grid
                        </TabsTrigger>
                        <TabsTrigger
                            value="storage-lots"
                            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs transition-all"
                        >
                            <LayoutGrid className="h-3.5 w-3.5 text-sky-500" />
                            Storage Lots Table
                        </TabsTrigger>
                        <TabsTrigger
                            value="batch-table"
                            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs transition-all"
                        >
                            <Layers className="h-3.5 w-3.5 text-amber-500" />
                            Registered Batches
                        </TabsTrigger>
                        <TabsTrigger
                            value="movement-history"
                            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs transition-all"
                        >
                            <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-500" />
                            Movement History
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Global Filter Bar */}
                <div className="bg-card rounded-xl border border-border/80 shadow-2xs p-3.5 space-y-3">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search by batch #, product name, SKU, or lot..."
                                value={globalSearchQuery}
                                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                                className="pl-8.5 pr-8 h-8.5 text-xs bg-background shadow-2xs"
                            />
                            {globalSearchQuery && (
                                <button
                                    onClick={() => setGlobalSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Quick Refresh & Clear Controls */}
                        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRefreshAll}
                                className="h-8.5 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1 font-medium bg-background shadow-2xs"
                                title="Refresh Data"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                            {hasAnyFilterActive && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleResetAllFilters}
                                    className="h-8.5 px-2.5 text-xs text-muted-foreground hover:text-rose-600 shrink-0 gap-1 font-medium hover:bg-rose-500/10"
                                    title="Reset all filters"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Filter Dropdowns Row: Branch, Product Type, UOM, Product, Lot, Batch */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-border/50">
                        {/* 1. Global Branch Select */}
                        <div className="w-full">
                            <SearchableBranchSelect
                                branches={branches}
                                value={selectedBranchId}
                                onValueChange={(val) => {
                                    setSelectedBranchId(val);
                                    if (val !== "ALL" && selectedLotId !== "ALL") {
                                        const currentLot = lots.find((l) => Number(l.lotId) === Number(selectedLotId));
                                        if (currentLot && Number(currentLot.branchId) !== Number(val)) {
                                            setSelectedLotId("ALL");
                                        }
                                    }
                                }}
                                allowAll={true}
                                allLabel="All Branches"
                                placeholder="All Branches"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>

                        {/* 2. Global Product Type Select */}
                        <div className="w-full">
                            <SearchableProductTypeSelect
                                value={selectedProductType}
                                onValueChange={(val) => {
                                    setSelectedProductType(val);
                                    if (val !== "ALL" && selectedProductId !== "ALL") {
                                        const currentProd = products.find((p) => Number(p.productId) === Number(selectedProductId));
                                        if (currentProd) {
                                            const pType = (currentProd as { productType?: unknown; product_type?: unknown }).productType || (currentProd as { productType?: unknown; product_type?: unknown }).product_type;
                                            const pCat = (currentProd as { productCategory?: unknown; category_name?: unknown }).productCategory || (currentProd as { productCategory?: unknown; category_name?: unknown }).category_name;
                                            const cls = resolveProductClassification(pType, pCat, currentProd.skuCode, currentProd.productName);
                                            if (cls.code !== val) {
                                                setSelectedProductId("ALL");
                                            }
                                        }
                                    }
                                }}
                                placeholder="All Product Types"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>

                        {/* 3. Global UOM Select */}
                        <div className="w-full">
                            <SearchableUomSelect
                                uoms={uoms}
                                value={selectedUomId}
                                onValueChange={(val) => {
                                    setSelectedUomId(val);
                                    if (val !== "ALL" && selectedLotId !== "ALL") {
                                        const currentLot = lots.find((l) => Number(l.lotId) === Number(selectedLotId));
                                        if (currentLot && Number(currentLot.uomId) !== Number(val)) {
                                            setSelectedLotId("ALL");
                                        }
                                    }
                                }}
                                allowAll={true}
                                allLabel="All Units (UOM)"
                                placeholder="All Units (UOM)"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>

                        {/* 4. Global Product Select */}
                        <div className="w-full">
                            <SearchableProductSelect
                                products={availableProductsForSelect}
                                value={selectedProductId}
                                onValueChange={(val) => {
                                    setSelectedProductId(val);
                                }}
                                allowAll={true}
                                allLabel="All Products"
                                placeholder="All Products"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>

                        {/* 5. Global Storage Lot Select */}
                        <div className="w-full">
                            <SearchableLotSelect
                                lots={availableLotsForSelect}
                                value={selectedLotId}
                                onValueChange={(val) => {
                                    setSelectedLotId(val);
                                }}
                                allowAll={true}
                                placeholder="All Storage Lots"
                                className="h-8.5 bg-background shadow-2xs w-full"
                            />
                        </div>

                        {/* 6. Global Batch Select */}
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
                        selectedBranchId={selectedBranchId}
                        selectedProductType={selectedProductType}
                        selectedUomId={selectedUomId}
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
                        onViewBatches={handleOpenLotBatches}
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
                        error={movementError}
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
                lots={lots}
                branches={branches}
                loading={loadingMovements}
            />

            {/* Storage Lot Batches Dialog */}
            <LotBatchesDialog
                isOpen={isLotBatchesDialogOpen}
                onClose={handleCloseLotBatches}
                lot={selectedLotForBatches}
                batches={batches}
                onViewBatchMovements={handleOpenBatchAudit}
            />
        </div>
    );
}


