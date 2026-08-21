"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import {
    FilterField,
    labelCount,
    MultiSelectFilter,
    type MultiSelectOption,
} from "../../shared/MultiSelectFilter";
import { CalendarDays, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

import type { ListQuery } from "../types";
import type { SupplierOption } from "../providers/pcrApi";
import { pcrStatusBadgeClass } from "../utils/pcrStatusStyles";

type FilterContext = "all" | "price" | "cost";

type Props = {
    query: ListQuery;
    setQuery: React.Dispatch<React.SetStateAction<ListQuery>>;
    suppliers: SupplierOption[];
    suppliersLoading?: boolean;
    suppliersError?: string | null;
    loading: boolean;
    total: number;
    totalLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    searchHelper: string;
    filterContext?: FilterContext;
    onRefresh: () => void;
    onReset?: () => void;
};

function supplierFilterHelperText(
    filterContext: FilterContext,
    supplierCount: number,
): string {
    const hasSuppliers = supplierCount > 0;

    if (!hasSuppliers) {
        if (filterContext === "all") return "All suppliers included.";
        if (filterContext === "price") {
            return "All suppliers included. Batches match by header supplier or product-linked batch lines.";
        }
        return "All suppliers included. List-cost requests match supplier-linked products (incl. variants).";
    }

    const prefix =
        supplierCount > 1
            ? `${supplierCount} suppliers selected. `
            : "";

    if (filterContext === "all") {
        return `${prefix}Batches: header supplier or lines for supplier-linked products (incl. variants). List-cost: linked products only.`;
    }
    if (filterContext === "price") {
        return `${prefix}Batches for selected suppliers by header or product-linked batch lines (incl. variants).`;
    }
    return `${prefix}List-cost requests for supplier-linked products, including unit variants.`;
}

function safeStr(value: unknown): string {
    const text = String(value ?? "").trim();
    return text && text !== "undefined" && text !== "null" ? text : "";
}

function supplierText(supplier: SupplierOption): string {
    const shortcut = safeStr(supplier.supplier_shortcut);
    const name = safeStr(supplier.supplier_name);
    return shortcut ? `${shortcut} - ${name}` : name || `Supplier #${supplier.id}`;
}

function toSupplierIdStrings(ids: number[] | undefined): string[] {
    return (ids ?? [])
        .map((id) => String(id))
        .filter((id) => /^\d+$/.test(id) && Number(id) > 0);
}

function toNumericSupplierIds(ids: string[]): number[] {
    return ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
}

const DATE_FILTER_DEBOUNCE_MS = 400;
const SUPPLIER_FILTER_DEBOUNCE_MS = 400;

export function RequestFiltersBar(props: Props) {
    const {
        query,
        setQuery,
        suppliers,
        suppliersLoading = false,
        suppliersError = null,
        loading,
        total,
        totalLabel,
        searchLabel,
        searchPlaceholder,
        searchHelper,
        filterContext = "all",
        onRefresh,
        onReset,
    } = props;

    const selectedSupplierIds = React.useMemo(
        () => toSupplierIdStrings(query.supplier_ids),
        [query.supplier_ids],
    );

    const [localSupplierIds, setLocalSupplierIds] = React.useState(() =>
        toSupplierIdStrings(query.supplier_ids),
    );

    const supplierFilterDisabled = suppliersLoading || Boolean(suppliersError);
    const supplierHelper = suppliersError
        ? "Supplier filter is unavailable until suppliers reload successfully."
        : suppliersLoading
          ? "Loading suppliers..."
          : supplierFilterHelperText(filterContext, localSupplierIds.length);

    const [localQ, setLocalQ] = React.useState(query.q ?? "");
    const [localDateFrom, setLocalDateFrom] = React.useState(query.date_from ?? "");
    const [localDateTo, setLocalDateTo] = React.useState(query.date_to ?? "");

    React.useEffect(() => {
        setLocalQ(query.q ?? "");
    }, [query.q]);

    React.useEffect(() => {
        setLocalDateFrom(query.date_from ?? "");
        setLocalDateTo(query.date_to ?? "");
    }, [query.date_from, query.date_to]);

    React.useEffect(() => {
        setLocalSupplierIds(toSupplierIdStrings(query.supplier_ids));
    }, [query.supplier_ids]);

    React.useEffect(() => {
        const committedSupplierIds = toSupplierIdStrings(query.supplier_ids).join(",");
        const draftSupplierIds = localSupplierIds.join(",");

        if (draftSupplierIds === committedSupplierIds) {
            return;
        }

        const timer = window.setTimeout(() => {
            setQuery((prev) => {
                const nextSupplierIds = toNumericSupplierIds(localSupplierIds);
                const sameSuppliers =
                    JSON.stringify(prev.supplier_ids ?? []) === JSON.stringify(nextSupplierIds);
                if (sameSuppliers) return prev;

                return {
                    ...prev,
                    supplier_ids: nextSupplierIds,
                    page: 1,
                };
            });
        }, SUPPLIER_FILTER_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [localSupplierIds, query.supplier_ids, setQuery]);

    React.useEffect(() => {
        const committedFrom = query.date_from ?? "";
        const committedTo = query.date_to ?? "";

        if (localDateFrom === committedFrom && localDateTo === committedTo) {
            return;
        }

        const timer = window.setTimeout(() => {
            setQuery((prev) => {
                const prevFrom = prev.date_from ?? "";
                const prevTo = prev.date_to ?? "";
                if (prevFrom === localDateFrom && prevTo === localDateTo) {
                    return prev;
                }
                return {
                    ...prev,
                    date_from: localDateFrom,
                    date_to: localDateTo,
                    page: 1,
                };
            });
        }, DATE_FILTER_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [localDateFrom, localDateTo, query.date_from, query.date_to, setQuery]);

    const supplierOptions = React.useMemo<MultiSelectOption[]>(
        () =>
            suppliers.map((supplier) => ({
                id: String(supplier.id),
                label: supplierText(supplier),
                search: safeStr(supplier.supplier_name),
            })),
        [suppliers],
    );

    const supplierLabelById = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const supplier of suppliers) {
            map.set(String(supplier.id), supplierText(supplier));
        }
        return map;
    }, [suppliers]);

    const applySearch = React.useCallback(() => {
        setQuery((prev) => ({
            ...prev,
            q: localQ.trim(),
            page: 1,
        }));
    }, [localQ, setQuery]);

    const clearSearch = React.useCallback(() => {
        setLocalQ("");
        setQuery((prev) => ({
            ...prev,
            q: "",
            page: 1,
        }));
    }, [setQuery]);

    const commitSupplierIds = React.useCallback(
        (ids: string[]) => {
            setQuery((prev) => ({
                ...prev,
                supplier_ids: toNumericSupplierIds(ids),
                page: 1,
            }));
        },
        [setQuery],
    );

    const resetFilters = React.useCallback(() => {
        setLocalQ("");
        setLocalDateFrom("");
        setLocalDateTo("");
        setLocalSupplierIds([]);
        setQuery((prev) => ({
            ...prev,
            q: "",
            supplier_ids: [],
            date_from: "",
            date_to: "",
            status: "ALL",
            page: 1,
        }));
        onReset?.();
    }, [onReset, setQuery]);

    const q = safeStr(query.q);
    const hasDateRange = Boolean(query.date_from || query.date_to);
    const hasStatusFilter = Boolean(query.status && query.status !== "ALL");
    const hasFilters = Boolean(q || selectedSupplierIds.length > 0 || hasDateRange || hasStatusFilter);

    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (q) {
        chips.push({
            key: "search",
            label: `Search: ${q}`,
            onRemove: clearSearch,
        });
    }

    for (const id of selectedSupplierIds) {
        const label = supplierLabelById.get(id) ?? `Supplier #${id}`;
        chips.push({
            key: `supplier:${id}`,
            label: `Supplier: ${label}`,
            onRemove: () => {
                const next = selectedSupplierIds.filter((value) => value !== id);
                setLocalSupplierIds(next);
                commitSupplierIds(next);
            },
        });
    }

    if (hasDateRange) {
        const from = query.date_from || "Any start";
        const to = query.date_to || "Any end";
        chips.push({
            key: "date",
            label: `Date: ${from} to ${to}`,
            onRemove: () => {
                setQuery((prev) => ({
                    ...prev,
                    date_from: "",
                    date_to: "",
                    page: 1,
                }));
            },
        });
    }

    if (query.status && query.status !== "ALL") {
        chips.push({
            key: "status",
            label: `Status: ${query.status}`,
            onRemove: () => {
                setQuery((prev) => ({
                    ...prev,
                    status: "ALL",
                    page: 1,
                }));
            },
        });
    }

    return (
        <Card className="overflow-hidden rounded-2xl shadow-sm">
            <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-foreground">Request filters</h2>
                        <p className="text-xs text-muted-foreground">
                            Search, narrow by supplier or date range, and filter by status. Reset clears all of these.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{total.toLocaleString()}</span> {totalLabel}
                        </div>
                        {hasFilters ? (
                            <Button
                                variant="ghost"
                                className="h-8 gap-2 text-muted-foreground hover:text-foreground"
                                onClick={resetFilters}
                                type="button"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Reset filters
                            </Button>
                        ) : null}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onRefresh}
                            disabled={loading}
                            type="button"
                        >
                            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                            Refresh
                        </Button>
                    </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.35fr)_minmax(210px,0.9fr)_minmax(170px,0.65fr)_minmax(170px,0.65fr)]">
                    <FilterField label={searchLabel} helper={searchHelper}>
                        <InputGroup className="h-10 bg-background">
                            <InputGroupAddon align="inline-start">
                                <Search className="h-4 w-4" />
                            </InputGroupAddon>
                            <InputGroupInput
                                placeholder={searchPlaceholder}
                                value={localQ}
                                onChange={(event) => setLocalQ(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
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
                                    title="Search requests"
                                >
                                    Search
                                </InputGroupButton>
                            </InputGroupAddon>
                        </InputGroup>
                    </FilterField>

                    <MultiSelectFilter
                        label="Suppliers"
                        helper={supplierHelper}
                        triggerLabel={
                            suppliersLoading
                                ? "Loading suppliers..."
                                : labelCount("Suppliers", localSupplierIds.length, "All suppliers")
                        }
                        searchPlaceholder="Search supplier"
                        emptyText="No suppliers found."
                        groupLabel="Suppliers"
                        options={supplierOptions}
                        selectedIds={localSupplierIds}
                        onChange={setLocalSupplierIds}
                        clearTitle="Clear suppliers"
                        disabled={supplierFilterDisabled}
                    />

                    <FilterField label="From date" helper="Start date.">
                        <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border bg-background px-3">
                            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <input
                                type="date"
                                value={localDateFrom}
                                onChange={(event) => setLocalDateFrom(event.target.value)}
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                        </div>
                    </FilterField>

                    <FilterField label="To date" helper="End date.">
                        <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border bg-background px-3">
                            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <input
                                type="date"
                                value={localDateTo}
                                onChange={(event) => setLocalDateTo(event.target.value)}
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                        </div>
                    </FilterField>
                </div>
            </div>

            {chips.length > 0 ? (
                <div className="border-t bg-muted/10 px-4 py-3">
                    <div className="flex flex-col gap-2">
                        <div className="text-xs font-medium text-muted-foreground">Active filters</div>
                        <div className="flex flex-wrap items-center gap-2">
                            {chips.map((chip) => (
                                <Badge
                                    key={chip.key}
                                    variant={chip.key === "status" ? "outline" : "secondary"}
                                    className={cn(
                                        "flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs",
                                        chip.key === "status" && query.status
                                            ? pcrStatusBadgeClass(query.status)
                                            : null,
                                    )}
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
