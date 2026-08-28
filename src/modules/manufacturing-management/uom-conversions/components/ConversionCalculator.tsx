import React from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Scale, ArrowRightLeft, Calculator, Sparkles } from "lucide-react";
import { DensityFactor } from "../types";
import { AssetSearchableSelect as AssetUomSelect } from "@/modules/manufacturing-management/asset-management/components/ui-selects";

interface ConversionCalculatorProps {
    densities: DensityFactor[];
    calcVal: string;
    setCalcVal: (v: string) => void;
    calcFrom: string;
    setCalcFrom: (v: string) => void;
    calcTo: string;
    setCalcTo: (v: string) => void;
    selectedOilId: string;
    setSelectedOilId: (v: string) => void;
    onCalculate: () => void;
    activeOil: DensityFactor;
    previewResult: number;
}

const UOM_OPTIONS = [
    { value: "MT", label: "Metric Tons (MT)", shortcut: "MT", description: "Mass" },
    { value: "KG", label: "Kilograms (KG)", shortcut: "KG", description: "Mass" },
    { value: "L", label: "Liters (L)", shortcut: "L", description: "Volumetric" },
    { value: "ML", label: "Milliliters (ML)", shortcut: "ML", description: "Volumetric" },
    { value: "Drums", label: "Standard Drums (200L)", shortcut: "Drums", description: "Pack" }
];

export default function ConversionCalculator({
    densities,
    calcVal,
    setCalcVal,
    calcFrom,
    setCalcFrom,
    calcTo,
    setCalcTo,
    selectedOilId,
    setSelectedOilId,
    onCalculate,
    activeOil,
    previewResult
}: ConversionCalculatorProps) {

    // Helper to explain the math formula
    const getMathExplanation = () => {
        if (calcFrom === calcTo) return "No conversion needed (Units match).";
        
        const densityStr = activeOil.density.toFixed(4);
        
        if (calcFrom === "MT" && calcTo === "L") {
            return `Formula: (Value * 1,000) / ${densityStr} (Liters)`;
        }
        if (calcFrom === "L" && calcTo === "MT") {
            return `Formula: (Value * ${densityStr}) / 1,000 (Metric Tons)`;
        }
        if (calcFrom === "KG" && calcTo === "L") {
            return `Formula: Value / ${densityStr} (Liters)`;
        }
        if (calcFrom === "L" && calcTo === "KG") {
            return `Formula: Value * ${densityStr} (Kilograms)`;
        }
        if (calcFrom === "MT" && calcTo === "KG") {
            return `Formula: Value * 1,000 (Kilograms)`;
        }
        if (calcFrom === "KG" && calcTo === "MT") {
            return `Formula: Value / 1,000 (Metric Tons)`;
        }
        if (calcFrom === "Drums" && calcTo === "L") {
            return `Formula: Value * 200 (Liters)`;
        }
        if (calcFrom === "L" && calcTo === "Drums") {
            return `Formula: Value / 200 (Drums)`;
        }
        if (calcFrom === "Drums" && calcTo === "KG") {
            return `Formula: (Value * 200) * ${densityStr} (Kilograms)`;
        }
        if (calcFrom === "KG" && calcTo === "Drums") {
            return `Formula: (Value / ${densityStr}) / 200 (Drums)`;
        }
        
        return "Cross-UOM conversion using baseline units & density factors.";
    };

    return (
        <div className="border rounded-xl bg-card p-6 shadow-sm flex flex-col justify-between relative overflow-hidden h-full">
            <div className="absolute right-0 top-0 h-32 w-32 bg-primary/5 rounded-full -mr-8 -mt-8 pointer-events-none animate-pulse" />
            
            <div className="space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-3">
                    <Scale className="h-4.5 w-4.5 text-primary" />
                    BOM Density Converter & Sandbox
                </h3>

                <div className="space-y-4">
                    {/* Liquid Select */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Liquid Profile (Density Specific)</label>
                        <select
                            value={selectedOilId}
                            onChange={(e) => setSelectedOilId(e.target.value)}
                            className="w-full bg-background border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-bold"
                        >
                            {densities.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name} (SG: {d.density.toFixed(4)})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* From & To Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase">Source UOM</label>
                            <AssetUomSelect
                                options={UOM_OPTIONS}
                                value={calcFrom}
                                onValueChange={setCalcFrom}
                                placeholder="Select source UOM..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase">Target UOM</label>
                            <AssetUomSelect
                                options={UOM_OPTIONS}
                                value={calcTo}
                                onValueChange={setCalcTo}
                                placeholder="Select target UOM..."
                            />
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Amount to Convert</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="any"
                                value={calcVal}
                                onChange={(e) => setCalcVal(e.target.value)}
                                placeholder="Enter qty..."
                                className="w-full bg-background border rounded-lg pl-3 pr-16 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary font-mono font-bold"
                            />
                            <span className="absolute right-3 top-2.5 text-[10px] font-extrabold uppercase text-muted-foreground bg-muted border px-2 py-0.5 rounded-md">
                                {calcFrom}
                            </span>
                        </div>
                    </div>

                    {/* Styled Result Card */}
                    <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-2 relative overflow-hidden mt-6">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase font-black tracking-wider text-primary flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                                Computed Value
                            </span>
                            <span className="text-[9px] font-mono text-muted-foreground">{activeOil.name}</span>
                        </div>

                        <div className="space-y-1">
                            <div className="text-xl sm:text-2xl font-black text-foreground tracking-tight font-mono truncate">
                                {previewResult.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}{" "}
                                <span className="text-xs font-extrabold text-primary">{calcTo}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-normal font-medium bg-background/50 p-2 rounded-lg border">
                                {getMathExplanation()}
                            </div>
                        </div>
                    </div>

                    {/* Action */}
                    <button
                        type="button"
                        onClick={onCalculate}
                        className="w-full mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/95 transition-all shadow-md cursor-pointer"
                    >
                        <Calculator className="h-4 w-4" />
                        Log Conversion Transaction
                    </button>
                </div>
            </div>
        </div>
    );
}
