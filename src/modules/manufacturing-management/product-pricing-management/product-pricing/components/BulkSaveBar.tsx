// src/modules/supply-chain-management/product-pricing-management/product-pricing/components/BulkSaveBar.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Printer, RotateCcw, RefreshCw, Save, FileSpreadsheet, FileUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function saveHelperText(priceDirtyCount: number, costDirtyCount: number): string {
    const hasPrice = priceDirtyCount > 0;
    const hasCost = costDirtyCount > 0;

    if (hasPrice && hasCost) {
        return "Save will create a price change batch and submit list cost requests.";
    }
    if (hasPrice) {
        return "Save will create a price change batch request.";
    }
    if (hasCost) {
        return "Save will submit list cost change requests.";
    }
    return "Save your pending changes.";
}

type Props = {
    dirtyCount: number;
    priceDirtyCount: number;
    costDirtyCount: number;
    offPageDirtyCount?: number;
    loading: boolean;

    onSave: () => void;
    onDiscard: () => void;
    onRefresh: () => void;
    onPrint: () => void;
    onExportExcel?: () => void;
    onImportExcel?: () => void;
    onNewBatch?: () => void;
};

export default function BulkSaveBar(props: Props) {
    const {
        dirtyCount,
        priceDirtyCount,
        costDirtyCount,
        offPageDirtyCount = 0,
        loading,
        onSave,
        onDiscard,
        onRefresh,
        onPrint,
        onExportExcel,
        onImportExcel,
        onNewBatch,
    } = props;

    const hasDirty = dirtyCount > 0;
    const hasOffPageDirty = offPageDirtyCount > 0;

    return (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Printables + status (matches “pill / tight” feel) */}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <Card className="w-full rounded-2xl border p-3 shadow-sm sm:w-auto">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold leading-tight">Printables</div>
                                <div className="text-xs text-muted-foreground leading-tight">
                                    Pricing Matrix (PDF / Excel)
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onPrint}
                                disabled={loading}
                                className={cn("gap-2", "cursor-pointer")}
                                type="button"
                            >
                                <Printer className="h-4 w-4" />
                                Print PDF
                            </Button>
                        </div>

                        {onExportExcel || onImportExcel ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {onNewBatch ? (
                                    <Button
                                        size="sm"
                                        onClick={onNewBatch}
                                        disabled={loading}
                                        className="gap-2 cursor-pointer"
                                        type="button"
                                    >
                                        <Plus className="h-4 w-4" />
                                        New Batch
                                    </Button>
                                ) : null}
                                {onExportExcel ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onExportExcel}
                                        disabled={loading}
                                        className="gap-2 cursor-pointer"
                                        type="button"
                                    >
                                        <FileSpreadsheet className="h-4 w-4" />
                                        Export Excel
                                    </Button>
                                ) : null}
                                {onImportExcel ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onImportExcel}
                                        disabled={loading}
                                        className="gap-2 cursor-pointer"
                                        type="button"
                                    >
                                        <FileUp className="h-4 w-4" />
                                        Import Excel
                                    </Button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </Card>

                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        variant={hasDirty ? "default" : "secondary"}
                        className={cn(hasDirty && "bg-amber-600 text-white hover:bg-amber-600")}
                    >
                        {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
                    </Badge>
                    {hasDirty ? (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">
                                {saveHelperText(priceDirtyCount, costDirtyCount)}
                            </span>
                            {hasOffPageDirty ? (
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                    Includes {offPageDirtyCount} change{offPageDirtyCount === 1 ? "" : "s"} on other pages.
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    {loading ? <span className="text-sm text-muted-foreground">Loading…</span> : null}
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
                <Button
                    variant="outline"
                    onClick={onRefresh}
                    disabled={loading}
                    className="gap-2 cursor-pointer"
                    type="button"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </Button>

                <Button
                    variant="outline"
                    onClick={onDiscard}
                    disabled={!hasDirty}
                    className="gap-2 cursor-pointer"
                    type="button"
                >
                    <RotateCcw className="h-4 w-4" />
                    Discard
                </Button>

                <Button
                    onClick={onSave}
                    disabled={!hasDirty}
                    className="gap-2 cursor-pointer"
                    type="button"
                >
                    <Save className="h-4 w-4" />
                    Save
                </Button>
            </div>
        </div>
    );
}
