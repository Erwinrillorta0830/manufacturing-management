"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import * as api from "../providers/pcrApi";
import { BatchPriceGrid } from "./BatchPriceGrid";
import { cellKey, formatCostMoney, formatMoney, parseCostInput, parsePriceInput, priceTypeLabel } from "./useCreateBatchState";
import { groupIdFor, isChildVariant } from "../utils/variantPropagation";

type CatalogPanelProps = {
    saving: boolean;
    priceTypes: api.PriceTypeOption[];
    products: api.ProductSearchRow[];
    draftPrices: Map<string, string>;
    draftCosts: Map<number, string>;
    pendingValues: Map<string, number>;
    unitLabelMap: Map<number, string>;
    currentPriceFor: (product: api.ProductSearchRow, priceType: api.PriceTypeOption) => number | null;
    unitLabelFor: (product: api.ProductSearchRow) => string | null;
    setDraftPrice: (product: api.ProductSearchRow, priceTypeId: number, value: string) => void;
    setDraftCost: (product: api.ProductSearchRow, value: string) => void;
    validation: {
        validPriceCount: number;
        validCostCount: number;
        invalidPriceKeys: Set<string>;
        invalidCostIds: Set<number>;
    };
    gridNav: ReturnType<typeof import("./useEditableGridNavigation").useEditableGridNavigation>;
    catalogViewMode: "catalog" | "imported";
    setCatalogViewMode: React.Dispatch<React.SetStateAction<"catalog" | "imported">>;
    showingImportedView: boolean;
    importedProductIds: number[];
    localCatalogQ: string;
    setLocalCatalogQ: React.Dispatch<React.SetStateAction<string>>;
    applyCatalogSearch: () => void;
    loadingProducts: boolean;
    loadError: string | null;
    catalogLoading: boolean;
    gridProducts: api.ProductSearchRow[];
    catalogStartIndex: number;
    catalogEndIndex: number;
    catalogTotal: number;
    catalogTotalVariants: number;
    catalogTotalPages: number;
    catalogPageSize: number;
    setCatalogPageSize: React.Dispatch<React.SetStateAction<number>>;
    setCatalogPage: React.Dispatch<React.SetStateAction<number>>;
    canCatalogPrev: boolean;
    canCatalogNext: boolean;
    currentCostFor: (product: api.ProductSearchRow) => number | null;
    catalogQuery: string;
};

export function BatchCatalogPanel(props: CatalogPanelProps) {
    const showListCost = true;

    return (
        <div className="rounded-md border">
            <div className="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="font-medium">Supplier Catalog</div>
                    {props.importedProductIds.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" size="sm" variant={props.catalogViewMode === "imported" ? "default" : "outline"} onClick={() => props.setCatalogViewMode("imported")} disabled={props.saving}>
                                Imported ({props.importedProductIds.length})
                            </Button>
                            <Button type="button" size="sm" variant={props.catalogViewMode === "catalog" ? "default" : "outline"} onClick={() => props.setCatalogViewMode("catalog")} disabled={props.saving}>
                                Full Catalog
                            </Button>
                        </div>
                    ) : null}
                </div>
                <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                    <div>
                        {props.validation.validPriceCount} price cell(s)
                        {props.validation.validCostCount > 0 ? ` - ${props.validation.validCostCount} list cost cell(s)` : ""}
                    </div>
                    <div>Tab/Enter to move - Paste from Excel - Edits kept across pages - Invalid values (text or negatives) are skipped</div>
                </div>
            </div>

            {!props.showingImportedView ? (
                <div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Search className="size-4 shrink-0 text-muted-foreground" />
                        <Input value={props.localCatalogQ} onChange={(e) => props.setLocalCatalogQ(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); props.applyCatalogSearch(); } }}
                            placeholder="Search product name or code" className="h-9" disabled={props.saving || props.loadingProducts} />
                        <Button type="button" variant="secondary" size="sm" onClick={props.applyCatalogSearch} disabled={props.saving || props.loadingProducts}>
                            Search
                        </Button>
                    </div>
                </div>
            ) : null}

            {props.loadError ? (
                <div className="px-3 py-3 text-sm text-destructive">{props.loadError}</div>
            ) : !props.showingImportedView && props.catalogLoading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog
                </div>
            ) : props.priceTypes.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">No price types found.</div>
            ) : props.gridProducts.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {props.showingImportedView ? "No imported products to display." : props.catalogQuery ? "No products match your search." : "No linked products found for this supplier."}
                </div>
            ) : (
                <>
                    <BatchPriceGrid
                        products={props.gridProducts}
                        priceTypes={props.priceTypes}
                        draftPrices={props.draftPrices}
                        pendingValues={props.pendingValues}
                        saving={props.saving}
                        gridNav={props.gridNav}
                        cellKey={cellKey}
                        formatMoney={formatMoney}
                        formatCostMoney={formatCostMoney}
                        priceTypeLabel={priceTypeLabel}
                        currentPriceFor={props.currentPriceFor}
                        unitLabelFor={props.unitLabelFor}
                        parsePriceInput={parsePriceInput}
                        parseCostInput={parseCostInput}
                        groupIdFor={groupIdFor}
                        isChildVariant={isChildVariant}
                        onDraftPriceChange={props.setDraftPrice}
                        showListCost={showListCost}
                        draftCosts={props.draftCosts}
                        currentCostFor={props.currentCostFor}
                        onDraftCostChange={props.setDraftCost}
                    />
                    {props.showingImportedView ? (
                        <div className="border-t px-3 py-3 text-sm text-muted-foreground">
                            Showing <span className="font-medium text-foreground">{props.gridProducts.length}</span> imported product{props.gridProducts.length === 1 ? "" : "s"} with proposed changes.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-muted-foreground">
                                Showing <span className="font-medium text-foreground">{props.gridProducts.length}</span> product variants on this page
                                {props.catalogTotalVariants > 0 ? (
                                    <> of <span className="font-medium text-foreground">{props.catalogTotalVariants}</span> variants</>
                                ) : null}
                                {props.catalogTotal > 0 ? (
                                    <> across <span className="font-medium text-foreground">{props.catalogTotal}</span> product groups</>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <select className={cn("h-9 rounded-md border bg-background px-2 text-sm")} value={String(props.catalogPageSize)}
                                    onChange={(e) => { props.setCatalogPageSize(Number(e.target.value)); props.setCatalogPage(1); }}
                                    disabled={props.saving || props.loadingProducts}>
                                    {[25, 50, 100].map((size) => (<option key={size} value={String(size)}>{size} / page</option>))}
                                </select>
                                <Button type="button" variant="outline" size="sm" disabled={!props.canCatalogPrev || props.saving || props.loadingProducts} onClick={() => props.setCatalogPage((p) => Math.max(1, p - 1))}>
                                    Prev
                                </Button>
                                <Button type="button" variant="outline" size="sm" disabled={!props.canCatalogNext || props.saving || props.loadingProducts}
                                    onClick={() => props.setCatalogPage((p) => props.catalogTotalPages > 0 ? Math.min(props.catalogTotalPages, p + 1) : p + 1)}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
