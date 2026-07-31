import React from "react";
import { Boxes, Layers, TrendingDown, AlertTriangle } from "lucide-react";
import { StockLevelProduct, InventoryData } from "../types/inventory.types";

interface InventoryHeaderProps {
    stockLevels: StockLevelProduct[];
    data: InventoryData | null;
}

export function InventoryHeader({ stockLevels, data }: InventoryHeaderProps) {
    const totalStockVal = stockLevels.reduce((sum, s) => sum + (s.currentStock * (s.cost_per_unit || 0)), 0);
    const lowStockCount = stockLevels.filter(s => s.currentStock < 50).length;
    const soonExpiredCount = data?.batches.filter(b => {
        if (!b.expiration_date) return false;
        const days = Math.ceil((new Date(b.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 90;
    }).length || 0;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Estimated Stock Value</span>
                    <h4 className="text-lg font-black text-foreground mt-1">₱{totalStockVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                    <span className="text-[9px] text-muted-foreground block mt-0.5">Based on active standard costs</span>
                </div>
                <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                    <Boxes className="h-5 w-5 text-emerald-500" />
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Consolidated SKUs</span>
                    <h4 className="text-lg font-black text-foreground mt-1">{stockLevels.length} Products</h4>
                    <span className="text-[9px] text-muted-foreground block mt-0.5">Active catalog items</span>
                </div>
                <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                    <Layers className="h-5 w-5 text-primary" />
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Shortages & Low Stock</span>
                    <h4 className="text-lg font-black text-amber-500 mt-1">{lowStockCount} Items</h4>
                    <span className="text-[9px] text-muted-foreground block mt-0.5">Stock balance &lt; 50 units</span>
                </div>
                <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                    <TrendingDown className="h-5 w-5 text-amber-500" />
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Lots Expiring (90 days)</span>
                    <h4 className="text-lg font-black text-rose-500 mt-1">{soonExpiredCount} Batches</h4>
                    <span className="text-[9px] text-muted-foreground block mt-0.5">Active FIFO inventory warning</span>
                </div>
                <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                </div>
            </div>
        </div>
    );
}
