"use client";

import React from "react";
import { Loader2, TrendingUp, Layers, Boxes, ClipboardList, ShoppingBag, Search } from "lucide-react";
import { useDashboard } from "./hooks/useDashboard";
import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardControls } from "./components/DashboardControls";
import { DashboardKpiCards } from "./components/DashboardKpiCards";
import { OngoingProductionRun } from "./components/OngoingProductionRun";
import { ProductionWastageTab } from "./components/ProductionWastageTab";
import { RawInventoryTab } from "./components/RawInventoryTab";
import { FinishedGoodsInventoryTab } from "./components/FinishedGoodsInventoryTab";
import { ProducibleGoodsTab } from "./components/ProducibleGoodsTab";
import { SelloutReportsTab } from "./components/SelloutReportsTab";

export default function DashboardModule() {
    const {
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        activePreset,
        data,
        loading,
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        expandedRows,
        toggleRow,
        loadDashboardData,
        handlePresetChange,
        handleCustomFilterSubmit,
        filteredRaw,
        filteredFG,
        productionWastageChartData,
        yieldEfficiency,
        selloutChartData
    } = useDashboard();

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center p-24 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-semibold">Generating dashboard intelligence reports...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header section */}
            <DashboardHeader />

            {/* Filter and Presets Controls Card */}
            <DashboardControls
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                activePreset={activePreset}
                handlePresetChange={handlePresetChange}
                handleCustomFilterSubmit={handleCustomFilterSubmit}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                loading={loading}
                onRefresh={() => loadDashboardData(startDate, endDate)}
            />

            {/* Top KPI Cards Grid */}
            <DashboardKpiCards data={data} />

            {/* Ongoing Production Run Progress Breakdown */}
            <OngoingProductionRun data={data} />

            {/* View navigation Tab Bar */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-card p-4 space-y-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="flex flex-wrap bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-1 rounded-lg gap-1 w-full lg:w-auto justify-start">
                        <button
                            onClick={() => { setActiveTab("production"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "production" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <TrendingUp className="h-4 w-4" /> Production & Wastage
                        </button>
                        <button
                            onClick={() => { setActiveTab("raw"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "raw" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <Layers className="h-4 w-4" /> Raw Materials Inventory
                        </button>
                        <button
                            onClick={() => { setActiveTab("finished"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "finished" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <Boxes className="h-4 w-4" /> Finished Goods Inventory
                        </button>
                        <button
                            onClick={() => { setActiveTab("producible"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "producible" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <ClipboardList className="h-4 w-4" /> Producible Right Now
                        </button>
                        <button
                            onClick={() => { setActiveTab("sellout"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                activeTab === "sellout" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                        >
                            <ShoppingBag className="h-4 w-4" /> Sellout Reports
                        </button>
                    </div>
                </div>

                {/* Search Bar for inventory tabs */}
                {(activeTab === "raw" || activeTab === "finished") && (
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Filter inventory table by product name, code, or category..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-background border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                )}

                {/* 📊 Tab Content Area */}
                <div className="overflow-x-auto">
                    {activeTab === "production" && (
                        <ProductionWastageTab
                            data={data}
                            productionWastageChartData={productionWastageChartData}
                            yieldEfficiency={yieldEfficiency}
                        />
                    )}

                    {activeTab === "raw" && (
                        <RawInventoryTab
                            data={data}
                            filteredRaw={filteredRaw}
                            expandedRows={expandedRows}
                            toggleRow={toggleRow}
                        />
                    )}

                    {activeTab === "finished" && (
                        <FinishedGoodsInventoryTab
                            data={data}
                            filteredFG={filteredFG}
                            expandedRows={expandedRows}
                            toggleRow={toggleRow}
                        />
                    )}

                    {activeTab === "producible" && (
                        <ProducibleGoodsTab
                            data={data}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                        />
                    )}

                    {activeTab === "sellout" && (
                        <SelloutReportsTab
                            data={data}
                            selloutChartData={selloutChartData}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
