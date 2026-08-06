"use client";

import React from "react";
import { Settings, Calculator, Percent, DollarSign, Layers } from "lucide-react";
import { ProductFamily } from "../types";

interface CostingAnalyticsTabProps {
    forecastModel: "sma" | "exponential" | "seasonal";
    setForecastModel: (model: "sma" | "exponential" | "seasonal") => void;
    alpha: number;
    setAlpha: (alpha: number) => void;
    demandMultiplier: number;
    setDemandMultiplier: (multiplier: number) => void;
    activeFamily?: ProductFamily;
}

export function CostingAnalyticsTab({
    forecastModel,
    setForecastModel,
    alpha,
    setAlpha,
    demandMultiplier,
    setDemandMultiplier,
    activeFamily
}: CostingAnalyticsTabProps) {
    const baseTargetPrice = activeFamily?.targetSellingPrice || 0;
    const estRoutingCost = activeFamily?.routingCost || 0;
    const bomMaterialCost = activeFamily?.bom.reduce((acc, item) => acc + (item.landedCost * item.quantity), 0) || 0;
    const totalUnitCost = bomMaterialCost + estRoutingCost;
    const estimatedMargin = baseTargetPrice > 0 ? ((baseTargetPrice - totalUnitCost) / baseTargetPrice) * 100 : 0;

    return (
        <div className="grid gap-6 md:grid-cols-3">
            {/* Settings Panel */}
            <div className="md:col-span-2 border rounded-xl p-4 sm:p-5 bg-background space-y-5">
                <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5 border-b pb-3">
                    <Settings className="h-4.5 w-4.5 text-primary" />
                    Forecasting Model &amp; Mathematical Configuration
                </h3>

                {/* Choose forecasting algorithm */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground">Select Mathematical Model</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                            { id: "exponential", label: "Exponential Smoothing", desc: "Weighted smoothing average favoring recent data." },
                            { id: "sma", label: "Simple Moving Average", desc: "Averages last 3 months to project trend." },
                            { id: "seasonal", label: "Seasonal Index Projection", desc: "Averages values with fixed seasonal indices." }
                        ].map(model => (
                            <button
                                key={model.id}
                                type="button"
                                onClick={() => setForecastModel(model.id as "exponential" | "sma" | "seasonal")}
                                className={`w-full text-left p-3 rounded-lg border text-xs transition-all cursor-pointer ${
                                    forecastModel === model.id
                                        ? "border-primary bg-primary/5 font-semibold text-primary"
                                        : "hover:bg-muted/30 border-muted"
                                }`}
                            >
                                <span className="block font-bold">{model.label}</span>
                                <span className="block text-[10px] text-muted-foreground mt-1 leading-normal">{model.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                    {/* Exponential Smoothing Weight */}
                    {forecastModel === "exponential" ? (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-muted-foreground">Alpha Smoothing Parameter</span>
                                <span className="font-extrabold text-primary">{alpha.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.05"
                                max="0.95"
                                step="0.05"
                                value={alpha}
                                onChange={e => setAlpha(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-[9px] text-muted-foreground">
                                <span>Smooth (0.05)</span>
                                <span>Responsive (0.95)</span>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground">
                            <span className="font-semibold block mb-0.5">Model Parameters</span>
                            Alpha smoothing applies specifically to Exponential Smoothing mode.
                        </div>
                    )}

                    {/* Simulated demand surge */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-muted-foreground">What-If Sales Growth Multiplier</span>
                            <span className="font-extrabold text-emerald-600">
                                {demandMultiplier === 1.0 ? "Baseline (1.0x)" : `${demandMultiplier > 1 ? "+" : ""}${((demandMultiplier - 1) * 100).toFixed(0)}%`}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0.70"
                            max="2.00"
                            step="0.05"
                            value={demandMultiplier}
                            onChange={e => setDemandMultiplier(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <div className="flex justify-between text-[9px] text-muted-foreground">
                            <span>-30% Downturn</span>
                            <span>+100% Sales Peak</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Costing Analysis Card */}
            <div className="border rounded-xl p-4 sm:p-5 bg-background space-y-4">
                <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5 border-b pb-3">
                    <Calculator className="h-4.5 w-4.5 text-primary" />
                    Unit Costing Breakdown
                </h3>

                <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b">
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                            Target Selling Price
                        </span>
                        <span className="font-bold text-foreground">₱{baseTargetPrice.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1.5 border-b">
                        <span className="text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                            Raw Materials Landed Cost
                        </span>
                        <span className="font-semibold text-foreground">₱{bomMaterialCost.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1.5 border-b">
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                            Routing &amp; Labor Overhead
                        </span>
                        <span className="font-semibold text-foreground">₱{estRoutingCost.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 bg-primary/5 px-3 rounded-lg border border-primary/10">
                        <span className="font-bold text-primary flex items-center gap-1">
                            <Percent className="h-3.5 w-3.5" />
                            Est. Gross Profit Margin
                        </span>
                        <span className={`font-extrabold ${estimatedMargin >= 20 ? "text-emerald-600" : "text-amber-600"}`}>
                            {estimatedMargin.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
