"use client";

import React from "react";
import { DefectCategorySummary } from "../types/scrap-rejection.types";
import { PieChart } from "lucide-react";

interface ScrapDefectParetoChartProps {
    defectCategories: DefectCategorySummary[];
    selectedCategory: string;
    onSelectCategory: (category: string) => void;
}

export function ScrapDefectParetoChart({
    defectCategories,
    selectedCategory,
    onSelectCategory
}: ScrapDefectParetoChartProps) {
    if (defectCategories.length === 0) return null;

    return (
        <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        Defect Categories & Rejection Distribution
                    </h3>
                </div>
                <span className="text-[11px] text-muted-foreground">
                    Click a category to filter
                </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {defectCategories.slice(0, 4).map((cat, idx) => {
                    const isSelected = selectedCategory.toLowerCase() === cat.category.toLowerCase();
                    return (
                        <div
                            key={cat.category}
                            onClick={() => onSelectCategory(isSelected ? "all" : cat.category)}
                            className={`group cursor-pointer rounded-lg border p-3 transition-all ${
                                isSelected
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "bg-background hover:border-primary/50 hover:bg-muted/30"
                            }`}
                        >
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-foreground truncate max-w-[130px]">
                                    #{idx + 1} {cat.category}
                                </span>
                                <span className="font-bold text-primary">{cat.percentage.toFixed(1)}%</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-all duration-500"
                                    style={{ width: `${Math.min(100, cat.percentage)}%` }}
                                />
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{cat.defectCount} inspection logs</span>
                                <span className="font-medium text-foreground">{cat.rejectedQuantity.toLocaleString()} units</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
