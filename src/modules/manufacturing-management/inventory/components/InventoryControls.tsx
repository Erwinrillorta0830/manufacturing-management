import React from "react";
import {
    Boxes,
    Calendar,
    History,
    ArrowUpRight,
    ArrowDownLeft,
    Sliders,
    RefreshCw,
    Layers,
    Search
} from "lucide-react";
import { InventoryTab, LedgerType, ExpiryFilter, InventoryData } from "../types/inventory.types";

interface InventoryControlsProps {
    activeTab: InventoryTab;
    setActiveTab: (tab: InventoryTab) => void;
    ledgerType: LedgerType;
    setLedgerType: (type: LedgerType) => void;
    filterBranch: string;
    setFilterBranch: (v: string) => void;
    filterBrand: string;
    setFilterBrand: (v: string) => void;
    filterCategory: string;
    setFilterCategory: (v: string) => void;
    filterProduct: string;
    setFilterProduct: (v: string) => void;
    filterStartDate: string;
    setFilterStartDate: (v: string) => void;
    filterEndDate: string;
    setFilterEndDate: (v: string) => void;
    searchQuery: string;
    setSearchQuery: (v: string) => void;
    lowStockFilter: boolean;
    setLowStockFilter: (v: boolean) => void;
    expiryFilter: ExpiryFilter;
    setExpiryFilter: (v: ExpiryFilter) => void;
    data: InventoryData | null;
    loading: boolean;
    onSync: () => void;
    onOpenAdjustment: () => void;
}

export function InventoryControls({
    activeTab,
    setActiveTab,
    ledgerType,
    setLedgerType,
    filterBranch,
    setFilterBranch,
    filterBrand,
    setFilterBrand,
    filterCategory,
    setFilterCategory,
    filterProduct,
    setFilterProduct,
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    searchQuery,
    setSearchQuery,
    lowStockFilter,
    setLowStockFilter,
    expiryFilter,
    setExpiryFilter,
    data,
    loading,
    onSync,
    onOpenAdjustment
}: InventoryControlsProps) {
    return (
        <div className="border border-border rounded-xl bg-card p-4 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-3">
                <div className="flex bg-muted/40 border border-border p-1 rounded-lg gap-1 overflow-x-auto max-w-full">
                    <button
                        onClick={() => { setActiveTab("stock"); setSearchQuery(""); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "stock" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                    >
                        <Boxes className="h-4 w-4" /> Stock Balances
                    </button>
                    <button
                        onClick={() => { setActiveTab("batches"); setSearchQuery(""); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "batches" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                    >
                        <Calendar className="h-4 w-4" /> FIFO Batches
                    </button>
                    <button
                        onClick={() => { setActiveTab("ledger"); setSearchQuery(""); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "ledger" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                    >
                        <History className="h-4 w-4" /> Audit Ledger
                    </button>
                    <button
                        onClick={() => { setActiveTab("picking"); setSearchQuery(""); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "picking" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                    >
                        <ArrowUpRight className="h-4 w-4" /> Material Picking
                    </button>
                    <button
                        onClick={() => { setActiveTab("receiving"); setSearchQuery(""); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "receiving" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                            }`}
                    >
                        <ArrowDownLeft className="h-4 w-4" /> Yield Receiving
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-lg uppercase tracking-wider shadow-xs">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                        </span>
                        Live
                    </div>
                    <button
                        onClick={onOpenAdjustment}
                        className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all border-none cursor-pointer shadow-xs"
                    >
                        <Sliders className="h-3.5 w-3.5" /> Post Adjustment
                    </button>
                    <button
                        onClick={onSync}
                        className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                        disabled={loading}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Sync stock
                    </button>
                </div>
            </div>

            {(activeTab === "stock" || activeTab === "batches" || activeTab === "ledger") && (
                <>
                    {/* Ledger Switcher */}
                    <div className="flex bg-muted/50 border border-border p-0.5 rounded-lg w-fit">
                        <button
                            type="button"
                            onClick={() => {
                                setLedgerType("raw");
                                setFilterProduct("all");
                            }}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${ledgerType === "raw" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                        >
                            <Boxes className="h-4 w-4" /> Raw Materials & Packaging Items
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setLedgerType("fg");
                                setFilterProduct("all");
                            }}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${ledgerType === "fg" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                        >
                            <Layers className="h-4 w-4" /> Finished Goods
                        </button>
                    </div>

                    {/* Advanced Multi-Criteria Filters */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-muted/20 p-3 rounded-lg border border-border">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Branch</label>
                            <select
                                value={filterBranch}
                                onChange={(e) => setFilterBranch(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                            >
                                <option value="all">All Branches</option>
                                {data?.branches?.map(b => (
                                    <option key={b.id} value={String(b.id)}>{b.branch_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Brand</label>
                            <select
                                value={filterBrand}
                                onChange={(e) => setFilterBrand(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                            >
                                <option value="all">All Brands</option>
                                {Array.from(new Set(data?.products?.map(p => p.product_brand?.brand_name).filter(Boolean))).map(brand => (
                                    <option key={String(brand)} value={String(brand)}>{String(brand)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Category</label>
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                            >
                                <option value="all">All Categories</option>
                                {Array.from(new Set(data?.products?.map(p => p.product_category?.category_name).filter(Boolean))).map(cat => (
                                    <option key={String(cat)} value={String(cat)}>{String(cat)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Product</label>
                            <select
                                value={filterProduct}
                                onChange={(e) => setFilterProduct(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                            >
                                <option value="all">All Products</option>
                                {data?.products?.filter(p => ledgerType === "fg" ? p.is_finished_good : !p.is_finished_good).map(p => (
                                    <option key={p.product_id} value={String(p.product_id)}>{p.product_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Start Date</label>
                            <input
                                type="date"
                                value={filterStartDate}
                                onChange={(e) => setFilterStartDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-foreground outline-none font-semibold"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">End Date</label>
                            <input
                                type="date"
                                value={filterEndDate}
                                onChange={(e) => setFilterEndDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-foreground outline-none font-semibold"
                            />
                        </div>
                    </div>
                </>
            )}

            {/* Search bar & filter controls */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by product name, code, brand, or lot number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>

                {activeTab === "stock" && (
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="lowStockChk"
                            checked={lowStockFilter}
                            onChange={(e) => setLowStockFilter(e.target.checked)}
                            className="h-4 w-4 rounded bg-background border-slate-800 text-primary accent-primary"
                        />
                        <label htmlFor="lowStockChk" className="text-xs text-muted-foreground font-bold select-none cursor-pointer">
                            Low Stock (&lt;50) only
                        </label>
                    </div>
                )}

                {activeTab === "batches" && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground font-bold">Expiry Status:</span>
                        <select
                            value={expiryFilter}
                            onChange={(e: any) => setExpiryFilter(e.target.value)}
                            className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground font-semibold outline-none"
                        >
                            <option value="all">All Batches</option>
                            <option value="active">Safe Lots (&gt;90 days)</option>
                            <option value="soon">Expiring Soon (&le;90 days)</option>
                            <option value="expired">Expired Lots</option>
                        </select>
                    </div>
                )}
            </div>
        </div>
    );
}
