"use client";

import React from "react";
import { Loader2, Search } from "lucide-react";
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
                <div className="flex border-b border-border/60 gap-1 bg-muted/20 px-2 pt-2 rounded-t-xl shrink-0 overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab("production")}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                            activeTab === "production" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Production &amp; Yield
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("raw")}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                            activeTab === "raw" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Raw Materials
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("finished")}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                            activeTab === "finished" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Finished Goods
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("producible")}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                            activeTab === "producible" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Producible Capacity
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("sellout")}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                            activeTab === "sellout" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Sellout Reports
                    </button>
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
