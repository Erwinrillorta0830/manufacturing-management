"use client";

import { HybridCalculationResult } from "./types";

interface ForexSubPoolHeaderProps {
    currencyCode: string;
    exchangeRate: number;
    calculationResult: HybridCalculationResult;
}

function formatPhp(value: number): string {
    return `PHP ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ForexSubPoolHeader({
    currencyCode,
    exchangeRate,
    calculationResult
}: ForexSubPoolHeaderProps) {
    const hasRate = Number.isFinite(exchangeRate) && exchangeRate > 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-900/5 dark:bg-slate-900/40 rounded-xl border">
            <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Locked Exchange Rate (PHP / {currencyCode})
                </span>
                <div className="h-9 px-3 rounded-md border text-xs font-bold bg-background flex items-center font-mono" aria-label="Locked exchange rate">
                    {hasRate ? `PHP ${exchangeRate.toFixed(4)} / ${currencyCode}` : "Unavailable — reconciliation required"}
                </div>
            </div>

            <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Raw Materials Sub-Pool Share
                </span>
                <div className="h-9 px-3 rounded-md border text-xs font-bold bg-background flex items-center text-primary">
                    {formatPhp(calculationResult.rmSubPool)}
                </div>
            </div>

            <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Packaging Sub-Pool Share
                </span>
                <div className="h-9 px-3 rounded-md border text-xs font-bold bg-background flex items-center text-purple-600 dark:text-purple-400">
                    {formatPhp(calculationResult.pkgSubPool)}
                </div>
            </div>

            <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Finished Goods Sub-Pool Share
                </span>
                <div className="h-9 px-3 rounded-md border text-xs font-bold bg-background flex items-center text-amber-600 dark:text-amber-400">
                    {formatPhp(calculationResult.fgSubPool)}
                </div>
            </div>
        </div>
    );
}
