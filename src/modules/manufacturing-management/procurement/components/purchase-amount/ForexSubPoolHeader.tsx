"use client";

import { HybridCalculationResult } from "./types";

interface ForexSubPoolHeaderProps {
    currencyCode: string;
    exchangeRate: number;
    calculationResult: HybridCalculationResult;
    onExchangeRateChange?: (value: number) => void;
    disabled?: boolean;
}

function formatPhp(value: number): string {
    return `PHP ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ForexSubPoolHeader({
    currencyCode,
    exchangeRate,
    calculationResult,
    onExchangeRateChange,
    disabled = false
}: ForexSubPoolHeaderProps) {
    const hasRate = Number.isFinite(exchangeRate) && exchangeRate > 0;
    const isLocal = currencyCode === "PHP";

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-900/5 dark:bg-slate-900/40 rounded-xl border">
            <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Forex Exchange Rate ({currencyCode}/PHP)
                </span>
                {isLocal ? (
                    <div className="h-9 px-3 rounded-md border text-xs font-bold bg-muted/40 flex items-center font-mono" aria-label="Locked exchange rate">
                        1.0000 PHP/PHP
                    </div>
                ) : (
                    <input
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        value={Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : ""}
                        onChange={event => onExchangeRateChange?.(event.target.value ? Number(event.target.value) : 0)}
                        disabled={disabled || !onExchangeRateChange}
                        aria-label="Forex exchange rate"
                        aria-invalid={!hasRate}
                        className="h-9 w-full px-3 rounded-md border text-xs font-bold bg-background font-mono disabled:cursor-not-allowed disabled:opacity-60"
                    />
                )}
                {!isLocal && <span className="text-[10px] text-muted-foreground">PHP per {currencyCode}; used for preview and posting.</span>}
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
