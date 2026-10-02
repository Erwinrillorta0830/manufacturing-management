"use client";

import React, { useState } from "react";
import { JobOrderProfitabilityRow } from "../types";
import { ProfitabilityAnalyticsCharts } from "./ProfitabilityAnalyticsCharts";
import { BarChart3, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfitabilityAnalyticsSectionProps {
    rows: JobOrderProfitabilityRow[];
}

export function ProfitabilityAnalyticsSection({ rows }: ProfitabilityAnalyticsSectionProps) {
    const [isExpanded, setIsExpanded] = useState<boolean>(true);

    if (rows.length === 0) {
        return null;
    }

    return (
        <div className="rounded-xl border bg-card/60 shadow-2xs overflow-hidden transition-all">
            {/* Section Header Toggle Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                        <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">Visual Analytics &amp; Margin Trends</span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                <Sparkles className="h-3 w-3" />
                                7-Day Trend &bull; Product Analysis
                            </span>
                        </div>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(prev => !prev)}
                    className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                    <span>{isExpanded ? "Hide Visuals" : "Show Visuals"}</span>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
            </div>

            {/* Expandable Chart Body */}
            {isExpanded && (
                <div className="p-3.5 animate-in fade-in duration-200">
                    <ProfitabilityAnalyticsCharts rows={rows} />
                </div>
            )}
        </div>
    );
}
