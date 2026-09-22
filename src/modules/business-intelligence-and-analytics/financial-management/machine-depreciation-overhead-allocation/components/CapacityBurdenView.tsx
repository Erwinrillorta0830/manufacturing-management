"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
    Cpu,
    Sliders,
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ProductionAssetMaster } from "../types";

interface CapacityBurdenViewProps {
    assets: ProductionAssetMaster[];
    onSelectAsset: (asset: ProductionAssetMaster) => void;
    isLoading: boolean;
}

export default function CapacityBurdenView({
    assets,
    onSelectAsset,
    isLoading
}: CapacityBurdenViewProps) {
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    const totalPages = Math.max(1, Math.ceil(assets.length / pageSize));
    const validCurrentPage = Math.min(currentPage, totalPages);
    const startIndex = (validCurrentPage - 1) * pageSize;
    const paginatedAssets = assets.slice(startIndex, startIndex + pageSize);

    if (isLoading) {
        return (
            <div className="rounded-xl border bg-card p-8 text-center space-y-3">
                <div className="h-6 w-48 bg-muted animate-pulse rounded mx-auto" />
                <div className="h-4 w-64 bg-muted/60 animate-pulse rounded mx-auto" />
            </div>
        );
    }

    if (assets.length === 0) {
        return (
            <div className="rounded-xl border bg-card p-12 text-center space-y-3">
                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-semibold">No Machines Available</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    No production machines match your current filter settings.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 text-muted-foreground border-b uppercase text-[10px] tracking-wider font-semibold">
                        <tr>
                            <th className="py-3 px-4">Machine & Station</th>
                            <th className="py-3 px-4 text-center">Operating Model</th>
                            <th className="py-3 px-4 text-right" title="Operating throughput (UOP) or scheduled annual hours (SL)">Operating Basis</th>
                            <th className="py-3 px-4 text-right" title="Lifetime production capacity (UOP) or utilization rate (SL)">Utilization / Capacity</th>
                            <th className="py-3 px-4 text-center" title="Unit of measure (UOP) or productive operating hours (SL)">Productive / UOM</th>
                            <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-semibold" title="Depreciation cost absorbed per productive hour">Depr. Burden / Hr</th>
                            <th className="py-3 px-4 text-right text-muted-foreground" title="BIA Power cost modeling assumption">Power Assumption</th>
                            <th className="py-3 px-4 text-right text-muted-foreground" title="BIA Maintenance cost modeling assumption">Maint. Assumption</th>
                            <th className="py-3 px-4 text-right font-bold" title="Total comprehensive hourly machine burden">Calculated Burden</th>
                            <th className="py-3 px-4 text-right font-medium" title="Authoritative rate currently in manufacturing_work_centers">Current Rate</th>
                            <th className="py-3 px-4 text-center" title="Variance between calculated burden and current operational rate">Rate Variance</th>
                            <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {paginatedAssets.map((asset, idx) => {
                            const isSL = asset.depreciation_method === "Straight Line";
                            const defaultSchedHrs = 4000;
                            const defaultUtil = 75;
                            const defaultProdHrs = defaultSchedHrs * (defaultUtil / 100);

                            const hasWorkStation = Boolean(asset.work_center_name);
                            const stationCapacity = asset.work_center_capacity_per_hour || 0;
                            const uom = asset.production_unit_shortcut || "units";

                            let deprHr: number | null = null;
                            let statusState: "valid" | "station_required" | "align_uop" = "valid";

                            if (isSL) {
                                if (asset.life_span && asset.life_span > 0 && defaultProdHrs > 0) {
                                    const annualDep = asset.depreciable_amount / asset.life_span;
                                    deprHr = annualDep / defaultProdHrs;
                                }
                            } else {
                                if (!hasWorkStation || stationCapacity <= 0) {
                                    statusState = "station_required";
                                } else if (asset.depreciation_per_unit != null && asset.depreciation_per_unit > 0) {
                                    deprHr = asset.depreciation_per_unit * stationCapacity;
                                    statusState = "valid";
                                } else {
                                    statusState = "align_uop";
                                }
                            }

                            const defaultPower = 0;
                            const defaultMaint = 0;
                            const totalBurden = deprHr !== null ? deprHr + defaultPower + defaultMaint : null;

                            const currentWcRate = hasWorkStation ? (asset.current_work_center_rate || 0) : null;
                            const rateVariance = totalBurden !== null && currentWcRate !== null ? totalBurden - currentWcRate : null;

                            return (
                                <motion.tr
                                    key={asset.asset_id}
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.5) }}
                                    className="hover:bg-muted/40 transition-colors"
                                >
                                    {/* Machine & Work Center */}
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-500">
                                                <Cpu className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <span className="font-semibold text-foreground" title={asset.item_name}>{asset.item_name}</span>
                                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                                    {asset.work_center_name ? (
                                                        <span>Work Station: {asset.work_center_name}</span>
                                                    ) : (
                                                        <span className="text-amber-500 font-medium">Unassigned Station</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Operating Model */}
                                    <td className="py-3 px-4 text-center">
                                        <Badge
                                            variant="secondary"
                                            className="text-[10px] px-2 py-0.5 bg-muted font-normal"
                                        >
                                            {isSL
                                                ? "Straight Line"
                                                : statusState === "valid"
                                                    ? "UOP (Capacity)"
                                                    : statusState === "station_required"
                                                        ? "UOP (Unassigned)"
                                                        : "UOP (Check Unit)"}
                                        </Badge>
                                    </td>

                                    {/* Operating Basis */}
                                    <td className="py-3 px-4 text-right">
                                        {isSL ? (
                                            <span className="text-muted-foreground font-mono">{defaultSchedHrs.toLocaleString()} h</span>
                                        ) : hasWorkStation && stationCapacity > 0 ? (
                                            <span className="font-semibold font-mono text-foreground">
                                                {stationCapacity.toLocaleString()}{" "}
                                                <span className="text-[10px] font-normal text-muted-foreground">{uom}/hr</span>
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                                Station Required
                                            </span>
                                        )}
                                    </td>

                                    {/* Utilization / Capacity */}
                                    <td className="py-3 px-4 text-right font-mono">
                                        {isSL ? (
                                            <span className="text-muted-foreground">{defaultUtil}%</span>
                                        ) : asset.maximum_unit_produced_capacity ? (
                                            <span className="font-medium text-foreground">
                                                {asset.maximum_unit_produced_capacity.toLocaleString()}{" "}
                                                <span className="text-[10px] font-normal font-sans text-muted-foreground">{uom}</span>
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>

                                    {/* Productive / UOM */}
                                    <td className="py-3 px-4 text-center">
                                        {isSL ? (
                                            <span className="font-mono text-muted-foreground">{defaultProdHrs.toLocaleString()} h</span>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] font-normal text-foreground">
                                                {uom}
                                            </Badge>
                                        )}
                                    </td>

                                    {/* Depr. Burden / Hr */}
                                    <td className="py-3 px-4 text-right">
                                        {deprHr !== null ? (
                                            <div>
                                                <div className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                                    ₱{deprHr.toFixed(2)}/hr
                                                </div>
                                                {!isSL && asset.depreciation_per_unit != null && (
                                                    <div className="text-[9px] text-muted-foreground font-mono">
                                                        ₱{asset.depreciation_per_unit.toFixed(4)}/{uom}
                                                    </div>
                                                )}
                                            </div>
                                        ) : statusState === "station_required" ? (
                                            <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 font-normal">
                                                Station Required
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 font-normal">
                                                Align UOP
                                            </Badge>
                                        )}
                                    </td>

                                    {/* Power Assumption */}
                                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">
                                        ₱0.00/hr
                                    </td>

                                    {/* Maint Assumption */}
                                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">
                                        ₱0.00/hr
                                    </td>

                                    {/* Total Machine Burden */}
                                    <td className="py-3 px-4 text-right">
                                        {totalBurden !== null ? (
                                            <span className="font-bold text-foreground font-mono">
                                                ₱{totalBurden.toFixed(2)}/hr
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground italic">
                                                —
                                            </span>
                                        )}
                                    </td>

                                    {/* Current Operational Rate */}
                                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">
                                        {currentWcRate !== null ? `₱${currentWcRate.toFixed(2)}/hr` : "—"}
                                    </td>

                                    {/* Rate Variance Badge */}
                                    <td className="py-3 px-4 text-center">
                                        {rateVariance !== null ? (
                                            Math.abs(rateVariance) < 0.01 ? (
                                                <Badge variant="outline" className="text-[10px] gap-0.5 text-muted-foreground border-muted-foreground/30 font-normal">
                                                    <Minus className="h-3 w-3" />
                                                    Balanced
                                                </Badge>
                                            ) : rateVariance > 0 ? (
                                                <Badge variant="outline" className="text-[10px] gap-0.5 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 font-normal">
                                                    <ArrowUpRight className="h-3 w-3" />
                                                    +₱{rateVariance.toFixed(2)}/hr
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] gap-0.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-normal">
                                                    <ArrowDownRight className="h-3 w-3" />
                                                    -₱{Math.abs(rateVariance).toFixed(2)}/hr
                                                </Badge>
                                            )
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground">—</span>
                                        )}
                                    </td>

                                    {/* Action Button */}
                                    <td className="py-3 px-4 text-center">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onSelectAsset(asset)}
                                            className="h-7 text-[11px] gap-1 px-2.5 hover:border-primary hover:text-primary"
                                        >
                                            <Sliders className="h-3 w-3" />
                                            <span>Adjust & Model</span>
                                        </Button>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls (No max height constraint) */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground px-4 py-3 border-t bg-card">
                <div className="flex items-center gap-1.5">
                    <span>Showing</span>
                    <span className="font-semibold font-mono text-foreground">
                        {assets.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, assets.length)}
                    </span>
                    <span>of</span>
                    <span className="font-semibold font-mono text-foreground">{assets.length}</span>
                    <span>machines</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span>Rows per page:</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => {
                                setPageSize(Number(val));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="h-7 w-16 text-xs bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="15">15</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={validCurrentPage <= 1}
                            className="h-7 w-7 p-0"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="px-2 font-mono text-xs">
                            {validCurrentPage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={validCurrentPage >= totalPages}
                            className="h-7 w-7 p-0"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
