"use client";

import React from "react";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { useInventoryReports } from "./hooks/useInventoryReports";
import { ReportSummaryCards } from "./components/ReportSummaryCards";
import { ReportFilters } from "./components/ReportFilters";
import { InventoryReportsTable } from "./components/InventoryReportsTable";
import { InventoryReportExportModal } from "./components/InventoryReportExportModal";

export default function InventoryReportsModule() {
    const {
        filters,
        searchInput,
        setSearchInput,
        loading,
        products,
        metrics,
        branches,
        categories,
        productTypes,
        expandedProductIds,
        isExportModalOpen,
        setIsExportModalOpen,
        loadData,
        handleFilterChange,
        handleSearchSubmit,
        handleClearSearch,
        toggleProductExpand,
        expandAll,
        collapseAll,
    } = useInventoryReports();

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.08,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: -10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-4 p-4 sm:p-6 min-w-0"
        >
            {/* Header Title & Legend */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <ShieldAlert className="w-6 h-6 text-amber-500" />
                        Inventory Maintaining Quantity Report
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        Real-time safety stock monitoring alerting when live on-hand is below or equal to maintaining quantity.
                    </p>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground self-start sm:self-auto bg-muted/40 px-3 py-1.5 rounded-lg border border-border/60">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    <span>Out of Stock</span>
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 ml-1" />
                    <span>Low Stock (≤ Limit)</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-1" />
                    <span>Healthy Stock</span>
                </div>
            </motion.div>

            {/* KPI Summary Cards */}
            <motion.div variants={itemVariants}>
                <ReportSummaryCards metrics={metrics} loading={loading} />
            </motion.div>

            {/* Filters Toolbar */}
            <motion.div variants={itemVariants}>
                <ReportFilters
                    filters={filters}
                    searchInput={searchInput}
                    setSearchInput={setSearchInput}
                    branches={branches}
                    categories={categories}
                    productTypes={productTypes}
                    loading={loading}
                    onFilterChange={handleFilterChange}
                    onSearchSubmit={handleSearchSubmit}
                    onClearSearch={handleClearSearch}
                    onRefresh={loadData}
                    onOpenExport={() => setIsExportModalOpen(true)}
                    expandedCount={expandedProductIds.size}
                    totalProducts={products.length}
                    onExpandAll={expandAll}
                    onCollapseAll={collapseAll}
                />
            </motion.div>

            {/* Main Products & Batch Stock Table */}
            <motion.div variants={itemVariants}>
                <InventoryReportsTable
                    products={products}
                    loading={loading}
                    expandedProductIds={expandedProductIds}
                    onToggleExpand={toggleProductExpand}
                />
            </motion.div>

            {/* Export Dialog */}
            <InventoryReportExportModal
                open={isExportModalOpen}
                onOpenChange={setIsExportModalOpen}
                products={products}
                branches={branches}
                selectedBranchId={filters.branchId}
            />
        </motion.div>
    );
}
