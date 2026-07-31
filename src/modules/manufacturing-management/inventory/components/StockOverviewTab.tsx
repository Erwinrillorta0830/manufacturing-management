import React from "react";
import {
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Tag,
    AlertTriangle
} from "lucide-react";
import { StockLevelProduct, InventoryData } from "../types/inventory.types";

interface StockOverviewTabProps {
    groupedStock: Record<string, Record<string, StockLevelProduct[]>>;
    stockLevels: StockLevelProduct[];
    isExpanded: (key: string) => boolean;
    toggleGroup: (key: string) => void;
    expandedProducts: Record<number, boolean>;
    toggleProductExpand: (prodId: number) => void;
    flashStates: Record<number, "up" | "down">;
    data: InventoryData | null;
}

export function StockOverviewTab({
    groupedStock,
    stockLevels,
    isExpanded,
    toggleGroup,
    expandedProducts,
    toggleProductExpand,
    flashStates,
    data
}: StockOverviewTabProps) {
    return (
        <div className="space-y-4">
            {Object.keys(groupedStock).map((catName) => {
                const catBrands = groupedStock[catName];
                const catKey = `cat-${catName}`;
                const catExpanded = isExpanded(catKey);

                let catTotalStock = 0;
                let catTotalValue = 0;
                let catProductsCount = 0;

                Object.values(catBrands).forEach(prods => {
                    prods.forEach(p => {
                        catTotalStock += p.currentStock;
                        catTotalValue += p.currentStock * (p.cost_per_unit || 0);
                        catProductsCount++;
                    });
                });

                return (
                    <div key={catName} className="border border-border rounded-xl overflow-hidden bg-muted/5">
                        {/* Category Header */}
                        <button
                            onClick={() => toggleGroup(catKey)}
                            className="w-full flex items-center justify-between bg-muted/30 p-4 border-none text-left cursor-pointer transition-all hover:bg-muted/50"
                        >
                            <div className="flex items-center gap-3">
                                {catExpanded ? <ChevronDown className="h-4.5 w-4.5 text-primary" /> : <ChevronRight className="h-4.5 w-4.5 text-primary" />}
                                <FolderOpen className="h-4.5 w-4.5 text-amber-500" />
                                <div>
                                    <span className="text-xs font-extrabold text-foreground tracking-wider uppercase">{catName}</span>
                                    <span className="text-[10px] text-muted-foreground block mt-0.5">{catProductsCount} Products</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-black text-foreground block">₱{catTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-[9px] text-muted-foreground block">Total Stock: {catTotalStock.toLocaleString()} Units</span>
                            </div>
                        </button>

                        {/* Brand Level */}
                        {catExpanded && (
                            <div className="p-4 space-y-4 bg-muted/10 border-t border-border">
                                {Object.keys(catBrands).map((brandName) => {
                                    const brandProds = catBrands[brandName];
                                    const brandKey = `brand-${catName}-${brandName}`;
                                    const brandExpanded = isExpanded(brandKey);

                                    const brandTotalStock = brandProds.reduce((sum, p) => sum + p.currentStock, 0);
                                    const brandTotalValue = brandProds.reduce((sum, p) => sum + (p.currentStock * (p.cost_per_unit || 0)), 0);

                                    return (
                                        <div key={brandName} className="border border-border rounded-lg overflow-hidden bg-card">
                                            {/* Brand Header */}
                                            <button
                                                onClick={() => toggleGroup(brandKey)}
                                                className="w-full flex items-center justify-between bg-muted/20 px-4 py-3 border-none text-left cursor-pointer transition-all hover:bg-muted/40"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {brandExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                    <Tag className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-bold text-foreground">{brandName}</span>
                                                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-2 font-semibold">
                                                        {brandProds.length} SKUs
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-6 text-[11px] font-bold text-foreground">
                                                    <span>Stock: {brandTotalStock.toLocaleString()} Units</span>
                                                    <span className="text-primary">₱{brandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                            </button>

                                            {/* Products list table */}
                                            {brandExpanded && (
                                                <div className="overflow-x-auto border-t border-border">
                                                    <table className="w-full border-collapse text-left text-[11px]">
                                                        <thead>
                                                            <tr className="border-b border-border bg-muted/20 text-muted-foreground font-extrabold">
                                                                <th className="py-2.5 px-4">Product details</th>
                                                                <th className="py-2.5 px-4 text-right hidden sm:table-cell">Standard Cost</th>
                                                                <th className="py-2.5 px-4 text-right">Stock Balance</th>
                                                                <th className="py-2.5 px-4 text-right hidden md:table-cell">Asset Value</th>
                                                                <th className="py-2.5 px-4">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {brandProds.map((prod, idx) => {
                                                                const assetVal = prod.currentStock * (prod.cost_per_unit || 0);
                                                                const uom = prod.unit_of_measurement?.unit_name || "Units";
                                                                const isLow = prod.currentStock < 50;
                                                                const isExpandedProd = !!expandedProducts[Number(prod.product_id)];

                                                                const flash = flashStates[Number(prod.product_id)];
                                                                const trClass = `border-b border-border/40 last:border-b-0 hover:bg-muted/20 cursor-pointer select-none transition-all duration-300 ${flash === "up" ? "animate-flash-up" : flash === "down" ? "animate-flash-down" : ""
                                                                    }`;

                                                                return (
                                                                    <React.Fragment key={prod.product_id || idx}>
                                                                        <tr
                                                                            className={trClass}
                                                                            onClick={() => toggleProductExpand(Number(prod.product_id))}
                                                                        >
                                                                            <td className="py-3 px-4">
                                                                                <div className="flex items-center gap-2">
                                                                                    <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpandedProd ? "rotate-90 text-primary" : ""}`} />
                                                                                    <div>
                                                                                        <span className="font-bold text-foreground block">
                                                                                            {prod.product_name}
                                                                                            {prod.unit_of_measurement?.unit_name && (
                                                                                                <span className="text-muted-foreground text-[10px] ml-1.5 font-normal">
                                                                                                    ({prod.unit_of_measurement.unit_name})
                                                                                                </span>
                                                                                            )}
                                                                                        </span>
                                                                                        <span className="text-[10px] text-muted-foreground font-mono">Code: {prod.product_code}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                            <td className="py-3 px-4 text-right font-medium text-foreground hidden sm:table-cell">₱{prod.cost_per_unit?.toFixed(2) || "0.00"}</td>
                                                                            <td className="py-3 px-4 text-right font-extrabold">
                                                                                <span className={prod.currentStock < 0 ? "text-red-500 flex items-center justify-end gap-1" : isLow ? "text-amber-500 animate-pulse" : "text-foreground"}>
                                                                                    {prod.currentStock < 0 && <AlertTriangle className="h-3 w-3 text-red-500 animate-bounce" />}
                                                                                    {prod.currentStock.toLocaleString()} {uom}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-3 px-4 text-right font-bold text-foreground hidden md:table-cell">₱{assetVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                                            <td className="py-3 px-4">
                                                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${prod.currentStock < 0
                                                                                        ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                                                        : isLow
                                                                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                                                            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                                                    }`}>
                                                                                    {prod.currentStock < 0 ? "Stock Deficit" : isLow ? "Low Stock" : "Optimal"}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                        {isExpandedProd && (
                                                                            <tr className="bg-muted/10 border-b border-border/30">
                                                                                <td colSpan={5} className="p-4">
                                                                                    <div className="border-l-2 border-primary/45 pl-4 py-1.5 space-y-2">
                                                                                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stock Breakdown by Branch</div>
                                                                                        {Object.keys(prod.branchStocks || {}).length > 0 ? (
                                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                                                                {Object.entries(prod.branchStocks).map(([bId, qty]) => {
                                                                                                    const branchObj = data?.branches?.find(br => Number(br.id) === Number(bId));
                                                                                                    const branchName = branchObj ? branchObj.branch_name : `Branch #${bId}`;
                                                                                                    return (
                                                                                                        <div key={bId} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
                                                                                                            <span className="text-[10px] font-medium text-muted-foreground">{branchName}</span>
                                                                                                            <span className={`text-[11px] font-bold ${(qty as number) < 0 ? "text-red-400" : "text-foreground"}`}>
                                                                                                                {(qty as number).toLocaleString()} {uom}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="text-[10px] text-muted-foreground italic">No branch stock records.</div>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}

            {stockLevels.length === 0 && (
                <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                    No products match search filters.
                </div>
            )}
        </div>
    );
}
