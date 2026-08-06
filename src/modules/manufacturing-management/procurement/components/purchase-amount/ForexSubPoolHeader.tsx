"use client";

import React from "react";
import { HybridCalculationResult } from "./types";

interface ForexSubPoolHeaderProps {
    exchangeRate: number;
    setExchangeRate: (rate: number) => void;
    calculationResult: HybridCalculationResult;
}

export default function ForexSubPoolHeader({
    exchangeRate,
    setExchangeRate,
    calculationResult
}: ForexSubPoolHeaderProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-900/5 dark:bg-slate-900/40 rounded-xl border">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Forex Exchange Rate (USD/PHP)
                </label>
                <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">₱</span>
                    <input
                        type="number"
                        step="0.0001"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(Number(e.target.value))}
                        className="h-9 w-full pl-7 pr-3 rounded-md border text-xs font-bold bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Raw Materials Sub-Pool Share
                </label>
                <div className="h-9 px-3 rounded-md border text-xs font-bold bg-background flex items-center text-primary">
                    ₱{calculationResult.rmSubPool.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Packaging Sub-Pool Share
                </label>
                <div className="h-9 px-3 rounded-md border text-xs font-bold bg-background flex items-center text-purple-600 dark:text-purple-400">
                    ₱{calculationResult.pkgSubPool.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
            </div>
        </div>
    );
}
