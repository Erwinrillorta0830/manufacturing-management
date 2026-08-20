// src/modules/supply-chain-management/product-pricing-management/product-pricing/components/PricingFiltersBar.tsx
"use client";

import * as React from "react";
import type { Brand, Category, PriceType, PricingFilters, Supplier, Unit } from "../types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
    FilterField,
    labelCount,
    MultiSelectFilter,
    type MultiSelectOption,
} from "../../shared/MultiSelectFilter";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ChevronDown, Filter, RotateCcw, Search, X } from "lucide-react";
import {
    filtersFromPriceViewSelection,
    PRICE_VIEW_LIST_OPTION_ID,
    priceViewSelectionFromFilters,
} from "../utils/pivot";

type Props = {
    filters: PricingFilters;
    setFilters: React.Dispatch<React.SetStateAction<PricingFilters>>;
    resetFilters: () => void;

    categories: Category[];
    brands: Brand[];
    units: Unit[];
    suppliers: Supplier[];
    priceTypes: PriceType[];
};

type FilterArrayKey = "category_ids" | "brand_ids" | "unit_ids" | "supplier_ids" | "price_type_ids";

function safeStr(v: unknown): string {
    const s = String(v ?? "").trim();
    if (!s || s === "undefined" || s === "null") return "";
    return s;
}

function supplierText(s: Supplier): string {
    const shortcut = safeStr(s.supplier_shortcut);
    const name = safeStr(s.supplier_name);
    const id = safeStr(s.id) || "0";

    if (!name) return `Supplier #${id}`;
    return shortcut ? `${shortcut} - ${name}` : name;
}

function unitText(u: Unit): string {
    const shortcut = safeStr(u.unit_shortcut);
    const name = safeStr(u.unit_name);
    return shortcut || name || "-";
}

function getIds(filters: PricingFilters, arrayKey: FilterArrayKey): string[] {
    return filters[arrayKey].map((item) => String(item));
}

function toNumericIds(ids: string[]): number[] {
    return ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
}

const ADVANCED_FILTER_DEBOUNCE_MS = 400;

function priceTypeText(pt: PriceType): string {
    const label = safeStr(pt.price_type_name);
    return label ? `Price ${label}` : `Price #${pt.price_type_id}`;
}

function sortPriceTypes(priceTypes: PriceType[]): PriceType[] {
    return [...priceTypes].sort((a, b) => {
        const aSort = Number(a.sort ?? Number.MAX_SAFE_INTEGER);
        const bSort = Number(b.sort ?? Number.MAX_SAFE_INTEGER);
        return aSort - bSort || safeStr(a.price_type_name).localeCompare(safeStr(b.price_type_name));
    });
}

export function PricingFiltersBar(props: Props) {
    const { filters, setFilters, resetFilters, categories, brands, units, suppliers, priceTypes } = props;

    const selectedSupplierIds = React.useMemo(
        () => getIds(filters, "supplier_ids"),
        [filters],
    );
    const selectedBrandIds = React.useMemo(
        () => getIds(filters, "brand_ids"),
        [filters],
    );
    const selectedCategoryIds = React.useMemo(
        () => getIds(filters, "category_ids"),
        [filters],
    );
    const selectedUnitIds = React.useMemo(
        () => getIds(filters, "unit_ids"),
        [filters],
    );
    const selectedPriceViewIds = React.useMemo(
        () => priceViewSelectionFromFilters(filters),
        [filters],
    );

    const [localQ, setLocalQ] = React.useState(filters.q);
    const [localSupplierIds, setLocalSupplierIds] = React.useState(() => getIds(filters, "supplier_ids"));
    const [localBrandIds, setLocalBrandIds] = React.useState(() => getIds(filters, "brand_ids"));
    const [localCategoryIds, setLocalCategoryIds] = React.useState(() => getIds(filters, "category_ids"));
    const [localUnitIds, setLocalUnitIds] = React.useState(() => getIds(filters, "unit_ids"));
    const [localPriceViewIds, setLocalPriceViewIds] = React.useState(() => priceViewSelectionFromFilters(filters));
    const [advancedOpen, setAdvancedOpen] = React.useState(true);

    React.useEffect(() => {
        setLocalQ(filters.q);
    }, [filters, filters.q]);

    React.useEffect(() => {
        setLocalSupplierIds(getIds(filters, "supplier_ids"));
    }, [filters, filters.supplier_ids]);

    React.useEffect(() => {
        setLocalBrandIds(getIds(filters, "brand_ids"));
    }, [filters, filters.brand_ids]);

    React.useEffect(() => {
        setLocalCategoryIds(getIds(filters, "category_ids"));
    }, [filters, filters.category_ids]);

    React.useEffect(() => {
        setLocalUnitIds(getIds(filters, "unit_ids"));
    }, [filters, filters.unit_ids]);

    React.useEffect(() => {
        setLocalPriceViewIds(priceViewSelectionFromFilters(filters));
    }, [filters, filters.price_view, filters.price_type_ids, filters.show_list_price]);

    React.useEffect(() => {
        const committedSupplierIds = getIds(filters, "supplier_ids").join(",");
        const draftSupplierIds = localSupplierIds.join(",");

        if (draftSupplierIds === committedSupplierIds) {
            return;
        }

        const timer = window.setTimeout(() => {
            setFilters((prev) => {
                const nextSupplierIds = toNumericIds(localSupplierIds);
                const sameSuppliers =
                    JSON.stringify(prev.supplier_ids ?? []) === JSON.stringify(nextSupplierIds);
                if (sameSuppliers) return prev;

                return {
                    ...prev,
                    supplier_ids: nextSupplierIds,
                    supplier_scope: nextSupplierIds.length > 0 ? "LINKED_ONLY" : "ALL",
                };
            });
        }, ADVANCED_FILTER_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [localSupplierIds, filters, filters.supplier_ids, setFilters]);

    React.useEffect(() => {
        const committedBrandIds = getIds(filters, "brand_ids").join(",");
        const committedCategoryIds = getIds(filters, "category_ids").join(",");
        const committedUnitIds = getIds(filters, "unit_ids").join(",");
        const draftBrandIds = localBrandIds.join(",");
        const draftCategoryIds = localCategoryIds.join(",");
        const draftUnitIds = localUnitIds.join(",");

        if (
            draftBrandIds === committedBrandIds &&
            draftCategoryIds === committedCategoryIds &&
            draftUnitIds === committedUnitIds
        ) {
            return;
        }

        const timer = window.setTimeout(() => {
            setFilters((prev) => {
                const nextBrandIds = toNumericIds(localBrandIds);
                const nextCategoryIds = toNumericIds(localCategoryIds);
                const nextUnitIds = toNumericIds(localUnitIds);

                const sameBrands =
                    JSON.stringify(prev.brand_ids ?? []) === JSON.stringify(nextBrandIds);
                const sameCategories =
                    JSON.stringify(prev.category_ids ?? []) === JSON.stringify(nextCategoryIds);
                const sameUnits =
                    JSON.stringify(prev.unit_ids ?? []) === JSON.stringify(nextUnitIds);

                if (sameBrands && sameCategories && sameUnits) return prev;

                return {
                    ...prev,
                    brand_ids: nextBrandIds,
                    category_ids: nextCategoryIds,
                    unit_ids: nextUnitIds,
                };
            });
        }, ADVANCED_FILTER_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [
        localBrandIds,
        localCategoryIds,
        localUnitIds,
        filters,
        filters.brand_ids,
        filters.category_ids,
        filters.unit_ids,
        setFilters,
    ]);

    const supplierOptions = React.useMemo<MultiSelectOption[]>(() => {
        const options: MultiSelectOption[] = [];

        for (const supplier of suppliers) {
            const id = safeStr(supplier.id);
            if (!id) continue;

            options.push({
                id,
                label: supplierText(supplier),
                search: safeStr(supplier.supplier_name),
            });
        }

        return options;
    }, [suppliers]);

    const brandOptions = React.useMemo<MultiSelectOption[]>(
        () => {
            const options: MultiSelectOption[] = [];

            for (const brand of brands) {
                const id = safeStr(brand.brand_id);
                if (!id) continue;

                options.push({ id, label: safeStr(brand.brand_name) || "-" });
            }

            return options;
        },
        [brands],
    );

    const categoryOptions = React.useMemo<MultiSelectOption[]>(
        () => {
            const options: MultiSelectOption[] = [];

            for (const category of categories) {
                const id = safeStr(category.category_id);
                if (!id) continue;

                options.push({ id, label: safeStr(category.category_name) || "-" });
            }

            return options;
        },
        [categories],
    );

    const unitOptions = React.useMemo<MultiSelectOption[]>(
        () => {
            const options: MultiSelectOption[] = [];

            for (const unit of units) {
                const id = safeStr(unit.unit_id);
                if (!id) continue;

                options.push({
                    id,
                    label: unitText(unit),
                    search: safeStr(unit.unit_name),
                });
            }

            return options;
        },
        [units],
    );

    const sortedPriceTypes = React.useMemo(() => sortPriceTypes(priceTypes), [priceTypes]);

    const priceViewOptions = React.useMemo<MultiSelectOption[]>(() => {
        const options: MultiSelectOption[] = [
            {
                id: PRICE_VIEW_LIST_OPTION_ID,
                label: "List Cost",
                search: "list cost",
            },
        ];

        for (const pt of sortedPriceTypes) {
            const id = safeStr(pt.price_type_id);
            if (!id) continue;

            options.push({
                id,
                label: priceTypeText(pt),
                search: safeStr(pt.price_type_name),
            });
        }

        return options;
    }, [sortedPriceTypes]);

    const supplierLabelById = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const s of suppliers) {
            const id = safeStr(s.id);
            if (id) map.set(id, supplierText(s));
        }
        return map;
    }, [suppliers]);

    const brandLabelById = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const b of brands) {
            const id = safeStr(b.brand_id);
            const label = safeStr(b.brand_name) || "-";
            if (id) map.set(id, label);
        }
        return map;
    }, [brands]);

    const categoryLabelById = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const c of categories) {
            const id = safeStr(c.category_id);
            const label = safeStr(c.category_name) || "-";
            if (id) map.set(id, label);
        }
        return map;
    }, [categories]);

    const unitLabelById = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const u of units) {
            const id = safeStr(u.unit_id);
            const label = unitText(u);
            if (id) map.set(id, label);
        }
        return map;
    }, [units]);

    const priceTypeLabelById = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const pt of priceTypes) {
            const id = safeStr(pt.price_type_id);
            const label = safeStr(pt.price_type_name) || "-";
            if (id) map.set(id, label);
        }
        return map;
    }, [priceTypes]);

    const advancedCount = localBrandIds.length + localCategoryIds.length + localUnitIds.length;

    React.useEffect(() => {
        if (advancedCount > 0) setAdvancedOpen(true);
    }, [advancedCount]);

    const commitPriceViewIds = React.useCallback(
        (ids: string[]) => {
            setFilters((prev) => ({
                ...prev,
                ...filtersFromPriceViewSelection(ids),
            }));
        },
        [setFilters],
    );

    const applySearch = React.useCallback(() => {
        setFilters((prev) => ({ ...prev, q: localQ.trim() }));
    }, [localQ, setFilters]);

    const clearSearch = React.useCallback(() => {
        setLocalQ("");
        setFilters((prev) => ({ ...prev, q: "" }));
    }, [setFilters]);

    const resetAllFilters = React.useCallback(() => {
        resetFilters();
        setLocalQ("");
        setLocalSupplierIds([]);
        setLocalBrandIds([]);
        setLocalCategoryIds([]);
        setLocalUnitIds([]);
        setLocalPriceViewIds([]);
        setAdvancedOpen(true);
    }, [resetFilters]);

    const commitSupplierIds = React.useCallback(
        (ids: string[]) => {
            const numericIds = toNumericIds(ids);
            setFilters((prev) => ({
                ...prev,
                supplier_ids: numericIds,
                supplier_scope: numericIds.length > 0 ? "LINKED_ONLY" : "ALL",
            }));
        },
        [setFilters],
    );

    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    const q = safeStr(filters.q);
    if (q) {
        chips.push({
            key: `q:${q}`,
            label: `Search: ${q}`,
            onRemove: clearSearch,
        });
    }

    for (const id of selectedSupplierIds) {
        const label = supplierLabelById.get(id) ?? `Supplier #${id}`;
        chips.push({
            key: `s:${id}`,
            label: `Supplier: ${label}`,
            onRemove: () => {
                const next = selectedSupplierIds.filter((x) => x !== id);
                setLocalSupplierIds(next);
                commitSupplierIds(next);
            },
        });
    }

    for (const id of selectedBrandIds) {
        const label = brandLabelById.get(id) ?? `Brand #${id}`;
        chips.push({
            key: `b:${id}`,
            label: `Brand: ${label}`,
            onRemove: () => {
                const next = selectedBrandIds.filter((x) => x !== id);
                setLocalBrandIds(next);
                setFilters((prev) => ({ ...prev, brand_ids: toNumericIds(next) }));
            },
        });
    }

    for (const id of selectedCategoryIds) {
        const label = categoryLabelById.get(id) ?? `Category #${id}`;
        chips.push({
            key: `c:${id}`,
            label: `Category: ${label}`,
            onRemove: () => {
                const next = selectedCategoryIds.filter((x) => x !== id);
                setLocalCategoryIds(next);
                setFilters((prev) => ({ ...prev, category_ids: toNumericIds(next) }));
            },
        });
    }

    for (const id of selectedUnitIds) {
        const label = unitLabelById.get(id) ?? `UOM #${id}`;
        chips.push({
            key: `u:${id}`,
            label: `UOM: ${label}`,
            onRemove: () => {
                const next = selectedUnitIds.filter((x) => x !== id);
                setLocalUnitIds(next);
                setFilters((prev) => ({ ...prev, unit_ids: toNumericIds(next) }));
            },
        });
    }

    for (const id of selectedPriceViewIds) {
        const label =
            id === PRICE_VIEW_LIST_OPTION_ID
                ? "List Cost"
                : `Price ${priceTypeLabelById.get(id) ?? `#${id}`}`;
        chips.push({
            key: `price_view:${id}`,
            label: `Price view: ${label}`,
            onRemove: () => {
                const next = selectedPriceViewIds.filter((x) => x !== id);
                setLocalPriceViewIds(next);
                commitPriceViewIds(next);
            },
        });
    }

    if (!filters.active_only) {
        chips.push({
            key: "active_only",
            label: "Status: Includes inactive",
            onRemove: () => setFilters((prev) => ({ ...prev, active_only: true })),
        });
    }

    if (filters.missing_tier) {
        chips.push({
            key: "missing_tier",
            label: "Missing price tiers",
            onRemove: () => setFilters((prev) => ({ ...prev, missing_tier: false })),
        });
    }

    const hasNonDefaultFilters =
        chips.length > 0 ||
        filters.price_view !== "ALL" ||
        selectedPriceViewIds.length > 0;

    return (
        <Card className="overflow-hidden rounded-2xl shadow-sm">
            <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-foreground">Product pricing filters</h2>
                        <p className="text-xs text-muted-foreground">
                            Search products and narrow the price matrix by supplier, price view, and catalog details.
                        </p>
                    </div>

                    {hasNonDefaultFilters ? (
                        <Button
                            variant="ghost"
                            className="h-8 w-fit shrink-0 gap-2 text-muted-foreground hover:text-foreground"
                            onClick={resetAllFilters}
                            type="button"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Reset filters
                        </Button>
                    ) : null}
                </div>

                <div className="grid gap-3 xl:grid-cols-[minmax(280px,1.25fr)_minmax(220px,1fr)_minmax(200px,0.85fr)_minmax(260px,0.9fr)]">
                    <FilterField label="Search products" helper="Name, product code, or barcode.">
                        <InputGroup className="h-10 bg-background">
                            <InputGroupAddon align="inline-start">
                                <Search className="h-4 w-4" />
                            </InputGroupAddon>
                            <InputGroupInput
                                placeholder="Name, code, or barcode"
                                value={localQ}
                                onChange={(e) => setLocalQ(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        applySearch();
                                    }
                                }}
                            />
                            <InputGroupAddon align="inline-end" className="gap-1">
                                {localQ ? (
                                    <InputGroupButton
                                        size="icon-xs"
                                        variant="ghost"
                                        onClick={clearSearch}
                                        title="Clear search"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </InputGroupButton>
                                ) : null}
                                <InputGroupButton
                                    size="sm"
                                    variant="secondary"
                                    onClick={applySearch}
                                    title="Search products"
                                >
                                    Search
                                </InputGroupButton>
                            </InputGroupAddon>
                        </InputGroup>
                    </FilterField>

                    <MultiSelectFilter
                        label="Suppliers"
                        helper={
                            localSupplierIds.length > 0
                                ? localSupplierIds.length === 1
                                    ? "Showing linked supplier products."
                                    : `Showing products linked to ${localSupplierIds.length} suppliers.`
                                : "Select one or more suppliers to limit the matrix to linked products."
                        }
                        triggerLabel={labelCount("Suppliers", localSupplierIds.length, "All suppliers")}
                        searchPlaceholder="Search supplier"
                        emptyText="No suppliers found."
                        groupLabel="Suppliers"
                        options={supplierOptions}
                        selectedIds={localSupplierIds}
                        onChange={setLocalSupplierIds}
                        clearTitle="Clear suppliers"
                    />

                    <MultiSelectFilter
                        label="Price view"
                        helper={
                            localPriceViewIds.length > 0
                                ? localPriceViewIds.length === 1
                                    ? "Showing one selected price column."
                                    : `Showing ${localPriceViewIds.length} selected price columns.`
                                : "Select price columns to show in the matrix, or leave empty for all prices."
                        }
                        triggerLabel={labelCount("Price view", localPriceViewIds.length, "All prices")}
                        searchPlaceholder="Search price type"
                        emptyText="No price types found."
                        groupLabel="Price columns"
                        options={priceViewOptions}
                        selectedIds={localPriceViewIds}
                        onChange={(ids) => {
                            setLocalPriceViewIds(ids);
                            commitPriceViewIds(ids);
                        }}
                        clearTitle="Clear price view"
                    />

                    <FilterField label="Product status" helper="Limit results by product or price condition.">
                        <div className="flex min-h-10 flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:gap-4">
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="filter-active-only"
                                    checked={filters.active_only}
                                    onCheckedChange={(checked) =>
                                        setFilters((prev) => ({ ...prev, active_only: checked }))
                                    }
                                />
                                <Label htmlFor="filter-active-only" className="cursor-pointer text-sm font-medium">
                                    Active only
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="filter-missing-tier"
                                    checked={filters.missing_tier}
                                    onCheckedChange={(checked) =>
                                        setFilters((prev) => ({ ...prev, missing_tier: checked }))
                                    }
                                />
                                <Label htmlFor="filter-missing-tier" className="cursor-pointer text-sm font-medium">
                                    Missing tier
                                </Label>
                            </div>
                        </div>
                    </FilterField>
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-8 gap-2 px-2 text-sm font-medium"
                                        type="button"
                                    >
                                        <Filter className="h-4 w-4" />
                                        Advanced filters
                                        {advancedCount > 0 ? (
                                            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px]">
                                                {advancedCount}
                                            </Badge>
                                        ) : null}
                                        <ChevronDown
                                            className={cn(
                                                "h-4 w-4 transition-transform",
                                                advancedOpen && "rotate-180",
                                            )}
                                        />
                                    </Button>
                                </CollapsibleTrigger>
                            </div>
                            <p className="px-2 text-xs text-muted-foreground">
                                Brand, category, and unit of measure filters.
                            </p>
                        </div>
                    </div>

                    <CollapsibleContent>
                        <div className="grid gap-3 px-1 pt-3 md:grid-cols-3">
                            <MultiSelectFilter
                                label="Brand"
                                triggerLabel={labelCount("Brands", localBrandIds.length, "All brands")}
                                searchPlaceholder="Search brand"
                                emptyText="No brands found."
                                groupLabel="Brands"
                                options={brandOptions}
                                selectedIds={localBrandIds}
                                onChange={setLocalBrandIds}
                                clearTitle="Clear brands"
                            />

                            <MultiSelectFilter
                                label="Category"
                                triggerLabel={labelCount("Categories", localCategoryIds.length, "All categories")}
                                searchPlaceholder="Search category"
                                emptyText="No categories found."
                                groupLabel="Categories"
                                options={categoryOptions}
                                selectedIds={localCategoryIds}
                                onChange={setLocalCategoryIds}
                                clearTitle="Clear categories"
                            />

                            <MultiSelectFilter
                                label="Unit of measure"
                                triggerLabel={labelCount("UOM", localUnitIds.length, "All units")}
                                searchPlaceholder="Search unit"
                                emptyText="No units found."
                                groupLabel="Units"
                                options={unitOptions}
                                selectedIds={localUnitIds}
                                onChange={setLocalUnitIds}
                                clearTitle="Clear units"
                            />
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </div>

            {chips.length > 0 ? (
                <div className="border-t bg-muted/10 px-4 py-3">
                    <div className="flex flex-col gap-2">
                        <div className="text-xs font-medium text-muted-foreground">Active filters</div>
                        <div className="flex flex-wrap items-center gap-2">
                            {chips.map((chip) => (
                                <Badge
                                    key={chip.key}
                                    variant="secondary"
                                    className="flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs"
                                >
                                    <span className="max-w-[520px] truncate">{chip.label}</span>
                                    <button
                                        type="button"
                                        onClick={chip.onRemove}
                                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted"
                                        aria-label={`Remove ${chip.label}`}
                                        title="Remove"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </Card>
    );
}

export default React.memo(PricingFiltersBar);
