import React from "react";
import { 
    DollarSign, 
    TrendingUp, 
    AlertTriangle, 
    ShoppingBag, 
    Warehouse, 
    Boxes, 
    Package, 
    Layers 
} from "lucide-react";
import { DashboardData } from "../types/dashboard.types";

interface DashboardKpiCardsProps {
    data: DashboardData | null;
}

export function DashboardKpiCards({ data }: DashboardKpiCardsProps) {
    // 1. Finished Goods calculations
    const fgValue = data?.inventory.finishedGoods?.totalValue || 0;
    const fgSKUs = data?.inventory.finishedGoods?.totalSKUs || 0;
    const fgStock = data?.inventory.finishedGoods?.totalStock || 0;

    // Helper to check packaging items
    const isPkgItem = (i: { category?: string; product_name?: string; product_code?: string }) => {
        const cat = (i.category || "").toLowerCase();
        const name = (i.product_name || "").toLowerCase();
        const code = (i.product_code || "").toUpperCase();
        const keywords = ["pack", "packaging", "box", "label", "bottle", "wrapper", "container", "carton", "pouch", "sticker", "film", "cap", "can", "jar", "bag", "tape", "tray", "tub"];
        return keywords.some(k => cat.includes(k) || name.includes(k)) || code.startsWith("PKG") || code.startsWith("BOX") || code.startsWith("LBL");
    };

    let pkgValue = 0;
    let pkgSKUs = 0;
    let pkgStock = 0;

    let rawVal = 0;
    let rawSKUs = 0;
    let rawStock = 0;

    const backendPkg = data?.inventory.packagingMaterials;
    if (backendPkg) {
        pkgValue = backendPkg.totalValue || 0;
        pkgSKUs = backendPkg.totalSKUs || 0;
        pkgStock = backendPkg.totalStock || 0;

        rawVal = data?.inventory.rawMaterials?.totalValue || 0;
        rawSKUs = data?.inventory.rawMaterials?.totalSKUs || 0;
        rawStock = data?.inventory.rawMaterials?.totalStock || 0;
    } else if (data?.inventory.rawMaterials?.items) {
        const allItems = data.inventory.rawMaterials.items;
        const pkgItems = allItems.filter(isPkgItem);
        const rawItems = allItems.filter(i => !isPkgItem(i));

        pkgValue = pkgItems.reduce((sum, i) => sum + i.value, 0);
        pkgSKUs = pkgItems.length;
        pkgStock = pkgItems.reduce((sum, i) => sum + i.stock, 0);

        rawVal = rawItems.reduce((sum, i) => sum + i.value, 0);
        rawSKUs = rawItems.length;
        rawStock = rawItems.reduce((sum, i) => sum + i.stock, 0);
    } else {
        rawVal = data?.inventory.rawMaterials?.totalValue || 0;
        rawSKUs = data?.inventory.rawMaterials?.totalSKUs || 0;
        rawStock = data?.inventory.rawMaterials?.totalStock || 0;
    }

    // Total Inventory Value across all categories
    const totalInventoryVal = fgValue + pkgValue + rawVal;
    const totalSKUs = fgSKUs + pkgSKUs + rawSKUs;

    return (
        <div className="space-y-4">
            {/* Main Inventory Value Card with 3 Sub Cards */}
            <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                            <Warehouse className="h-5 w-5" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Total Asset Inventory Valuation</span>
                            <h3 className="text-xl font-black text-foreground mt-0.5">
                                ₱{totalInventoryVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground bg-slate-100 dark:bg-slate-900/60 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                            {totalSKUs.toLocaleString()} Total Active SKUs
                        </span>
                    </div>
                </div>

                {/* 3 Sub-Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Sub-card 1: Finished Goods */}
                    <div className="bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-2 hover:border-primary/40 transition-colors">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-primary flex items-center gap-1.5">
                                <Boxes className="h-3.5 w-3.5" />
                                Finished Goods
                            </span>
                            <span className="text-[9px] font-bold text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                {fgSKUs} SKUs
                            </span>
                        </div>
                        <div>
                            <div className="text-base font-black text-foreground">
                                ₱{fgValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9px] text-muted-foreground font-medium mt-0.5">
                                {fgStock.toLocaleString()} total units on hand
                            </div>
                        </div>
                    </div>

                    {/* Sub-card 2: Packaging Materials */}
                    <div className="bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-2 hover:border-purple-500/40 transition-colors">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-purple-500 dark:text-purple-400 flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5" />
                                Packaging Materials
                            </span>
                            <span className="text-[9px] font-bold text-muted-foreground bg-purple-500/10 text-purple-500 dark:text-purple-400 px-2 py-0.5 rounded-full">
                                {pkgSKUs} SKUs
                            </span>
                        </div>
                        <div>
                            <div className="text-base font-black text-foreground">
                                ₱{pkgValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9px] text-muted-foreground font-medium mt-0.5">
                                {pkgStock.toLocaleString()} packaging items
                            </div>
                        </div>
                    </div>

                    {/* Sub-card 3: Raw Materials */}
                    <div className="bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-2 hover:border-emerald-500/40 transition-colors">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5" />
                                Raw Materials
                            </span>
                            <span className="text-[9px] font-bold text-muted-foreground bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                                {rawSKUs} SKUs
                            </span>
                        </div>
                        <div>
                            <div className="text-base font-black text-foreground">
                                ₱{rawVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9px] text-muted-foreground font-medium mt-0.5">
                                {rawStock.toLocaleString()} raw stock units
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Additional KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Production Value */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Production Value</span>
                        <h4 className="text-xl font-black text-foreground mt-1.5">
                            ₱{data?.production.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                        </h4>
                        <span className="text-[9px] text-primary block mt-1 font-semibold flex items-center gap-0.5">
                            Based on finished goods receipts
                        </span>
                    </div>
                    <div className="bg-primary/10 dark:bg-primary/20 p-3 rounded-lg border border-primary/20">
                        <DollarSign className="h-5 w-5 text-primary" />
                    </div>
                </div>

                {/* 2. Total Produced Volume */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Total Produced</span>
                        <h4 className="text-xl font-black text-foreground mt-1.5">
                            {data?.production.totalQuantity.toLocaleString() || "0"} <span className="text-xs text-muted-foreground font-normal">Units</span>
                        </h4>
                        <span className="text-[9px] text-muted-foreground block mt-1 font-semibold">
                            Consolidated manufactured lots
                        </span>
                    </div>
                    <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 rounded-lg border border-emerald-500/20">
                        <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                </div>

                {/* 3. Wastage & Scrap Value */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Wastage / Scrap</span>
                        <h4 className={`text-xl font-black mt-1.5 ${data && data.wastage.totalValue > 0 ? "text-rose-500" : "text-foreground"}`}>
                            ₱{data?.wastage.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                        </h4>
                        <span className="text-[9px] text-rose-400 block mt-1 font-semibold flex items-center gap-0.5">
                            {data?.wastage.totalQuantity.toLocaleString() || 0} units lost in period
                        </span>
                    </div>
                    <div className="bg-rose-500/10 dark:bg-rose-500/20 p-3 rounded-lg border border-rose-500/20">
                        <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 animate-pulse" />
                    </div>
                </div>

                {/* 4. Sellout Revenue */}
                <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-xs hover:scale-[1.01] transition-transform duration-250">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Sellout (Sales Value)</span>
                        <h4 className="text-xl font-black text-amber-500 mt-1.5">
                            ₱{data?.sellout.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                        </h4>
                        <span className="text-[9px] text-muted-foreground block mt-1 font-semibold">
                            Total invoiced customer sales
                        </span>
                    </div>
                    <div className="bg-amber-500/10 dark:bg-amber-500/20 p-3 rounded-lg border border-amber-500/20">
                        <ShoppingBag className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                </div>
            </div>
        </div>
    );
}
