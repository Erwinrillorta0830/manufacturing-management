"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Table as TableIcon, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBatchesExpiration } from "./hooks/useBatchesExpiration";
import ExpirationKpiCards from "./components/ExpirationKpiCards";
import ExpirationFilterBar from "./components/ExpirationFilterBar";
import ExpirationTable from "./components/ExpirationTable";
import ExpirationTimelineChart from "./components/ExpirationTimelineChart";
import BatchDetailDrawer from "./components/BatchDetailDrawer";

export default function BatchesExpirationTrackingModule() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            setMounted(true);
        });
    }, []);

    const {
        items,
        totalItemsCount,
        kpis,
        timeline,
        branches,
        productTypes,
        loading,
        filters,
        activeTab,
        selectedBatch,
        isDrawerOpen,
        setActiveTab,
        handleFilterChange,
        resetFilters,
        handleOpenDrawer,
        handleCloseDrawer,
        handleExport,
        refresh,
    } = useBatchesExpiration();

    if (!mounted) {
        return (
            <div className="space-y-4">
                <div className="h-28 w-full rounded-xl border border-border bg-card animate-pulse" />
                <div className="h-14 w-full rounded-xl border border-border bg-card animate-pulse" />
                <div className="h-96 w-full rounded-xl border border-border bg-card animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-bold text-foreground">
                        Inventory Batch Expiration Monitor
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Tracking {totalItemsCount.toLocaleString()} batches across active warehouse locations.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        disabled={loading}
                        className="h-8 text-xs bg-background"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh Live Balance
                    </Button>
                </div>
            </div>

            {/* 4 KPI Metric Cards */}
            <ExpirationKpiCards
                kpis={kpis}
                loading={loading}
                onSelectStatusFilter={(status) => handleFilterChange("status", status)}
            />

            {/* Filter Bar with Search & Comboboxes */}
            <ExpirationFilterBar
                filters={filters}
                branches={branches}
                productTypes={productTypes}
                onFilterChange={handleFilterChange}
                onResetFilters={resetFilters}
                onExport={handleExport}
                totalCount={items.length}
            />

            {/* Tabs & View Switcher */}
            <div className="flex items-center justify-between">
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => setActiveTab(val as "table" | "timeline")}
                    className="w-full sm:w-auto"
                >
                    <TabsList className="h-9 p-1 bg-muted/60">
                        <TabsTrigger value="table" className="text-xs gap-1.5 px-3">
                            <TableIcon className="h-3.5 w-3.5" />
                            Batches Monitoring ({items.length})
                        </TabsTrigger>
                        <TabsTrigger value="timeline" className="text-xs gap-1.5 px-3">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Expiration Timeline &amp; Exposure
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Main Content Area */}
            {activeTab === "table" ? (
                <motion.div
                    key="table-view"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ExpirationTable
                        items={items}
                        loading={loading}
                        onSelectBatch={handleOpenDrawer}
                    />
                </motion.div>
            ) : (
                <motion.div
                    key="timeline-view"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ExpirationTimelineChart
                        timeline={timeline}
                        items={items}
                    />
                </motion.div>
            )}

            {/* Batch Details Drawer */}
            <BatchDetailDrawer
                batch={selectedBatch}
                open={isDrawerOpen}
                onClose={handleCloseDrawer}
            />
        </div>
    );
}
