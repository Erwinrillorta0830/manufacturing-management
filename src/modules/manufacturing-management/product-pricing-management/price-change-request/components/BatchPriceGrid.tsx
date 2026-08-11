"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import * as api from "../providers/pcrApi";
import { useEditableGridNavigation } from "./useEditableGridNavigation";

type GridNav = ReturnType<typeof useEditableGridNavigation>;
type CardTone = "neutral" | "pending" | "increase" | "decrease";
type DecimalParser = (value: string) => { value: number | null; error: string | null };

type Props = {
    products: api.ProductSearchRow[];
    priceTypes: api.PriceTypeOption[];
    draftPrices: Map<string, string>;
    pendingValues: Map<string, number>;
    saving: boolean;
    gridNav: GridNav;
    cellKey: (productId: number, priceTypeId: number) => string;
    formatMoney: (value: number | null | undefined) => string;
    formatCostMoney?: (value: number | null | undefined) => string;
    priceTypeLabel: (priceType: api.PriceTypeOption) => string;
    currentPriceFor: (product: api.ProductSearchRow, priceType: api.PriceTypeOption) => number | null;
    unitLabelFor?: (product: api.ProductSearchRow) => string | null;
    parsePriceInput: DecimalParser;
    parseCostInput?: DecimalParser;
    groupIdFor: (product: api.ProductSearchRow) => number;
    isChildVariant: (product: api.ProductSearchRow) => boolean;
    onDraftPriceChange: (product: api.ProductSearchRow, priceTypeId: number, value: string) => void;
    showListCost?: boolean;
    draftCosts?: Map<number, string>;
    currentCostFor?: (product: api.ProductSearchRow) => number | null;
    onDraftCostChange?: (product: api.ProductSearchRow, value: string) => void;
};

export function BatchPriceGrid({
    products,
    priceTypes,
    draftPrices,
    pendingValues,
    saving,
    gridNav,
    cellKey,
    formatMoney,
    formatCostMoney = formatMoney,
    priceTypeLabel,
    currentPriceFor,
    unitLabelFor,
    parsePriceInput,
    parseCostInput = parsePriceInput,
    groupIdFor,
    isChildVariant,
    onDraftPriceChange,
    showListCost = false,
    draftCosts,
    currentCostFor,
    onDraftCostChange,
}: Props) {
    const pendingLabel = React.useCallback(
        (value: number) => `Pending PHP ${formatMoney(value)}`,
        [formatMoney],
    );

    const handlePasteCell = React.useCallback(
        (row: number, col: number, value: string) => {
            const product = products[row];
            if (!product) return;

            if (showListCost && col === 0) {
                if (pendingValues.has(`${product.product_id}:LIST`)) return;
                onDraftCostChange?.(product, value);
                return;
            }

            const priceType = priceTypes[showListCost ? col - 1 : col];
            if (!priceType) return;
            if (pendingValues.has(cellKey(product.product_id, priceType.price_type_id))) return;
            onDraftPriceChange(product, priceType.price_type_id, value);
        },
        [cellKey, onDraftCostChange, onDraftPriceChange, pendingValues, priceTypes, products, showListCost],
    );

    const cardToneFor = React.useCallback(
        (args: {
            hasPending: boolean;
            rawValue: string;
            currentValue: number | null | undefined;
            parseInput?: DecimalParser;
        }): CardTone => {
            if (args.hasPending) return "pending";
            if (!args.rawValue.trim()) return "neutral";

            const parsed = (args.parseInput ?? parsePriceInput)(args.rawValue);
            if (parsed.error || parsed.value === null) return "neutral";

            const currentValue = Number(args.currentValue);
            if (!Number.isFinite(currentValue)) return "neutral";
            if (parsed.value > currentValue) return "increase";
            if (parsed.value < currentValue) return "decrease";
            return "neutral";
        },
        [parsePriceInput],
    );

    const cardToneClass = React.useCallback((tone: CardTone) => {
        switch (tone) {
            case "pending":
                return "border-amber-300 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100";
            case "increase":
                return "border-emerald-300 bg-emerald-50/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100";
            case "decrease":
                return "border-red-300 bg-red-50/80 text-red-950 dark:border-red-800 dark:bg-red-950/35 dark:text-red-100";
            default:
                return "border-border bg-background";
        }
    }, []);

    return (
        <div className="max-h-[46vh] overflow-y-auto rounded-md border">
            <div className="sticky top-0 z-10 border-b bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
                Products and proposed prices
            </div>
            <div className="divide-y">
                {products.map((product, rowIndex) => {
                    const groupId = groupIdFor(product);
                    const unitLabel = unitLabelFor?.(product);
                    const productDisplayName = unitLabel
                        ? `${product.product_name} (${unitLabel})`
                        : product.product_name;

                    return (
                        <div key={product.product_id} className="space-y-3 px-3 py-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium" title={productDisplayName}>
                                        {productDisplayName}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span>Product #{product.product_id}</span>
                                        <span>Code: {product.product_code || "-"}</span>
                                        <span>Barcode: {product.barcode || "-"}</span>
                                    </div>
                                </div>
                                <span
                                    className={cn(
                                        "w-fit shrink-0 rounded-md border px-2 py-1 text-xs",
                                        isChildVariant(product)
                                            ? "bg-muted text-muted-foreground"
                                            : "bg-background text-foreground",
                                    )}
                                >
                                    {isChildVariant(product) ? `Child ${groupId}` : "Parent"}
                                </span>
                            </div>

                            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                                {showListCost ? (
                                    (() => {
                                            const pendingCost = pendingValues.get(`${product.product_id}:LIST`);
                                            const hasPendingCost = pendingCost !== undefined;
                                            const pendingHintId = `batch-list-cost-pending-${product.product_id}`;
                                            const rawCost = draftCosts?.get(product.product_id) ?? "";
                                            const costError =
                                                rawCost.trim() && !hasPendingCost
                                                    ? parseCostInput(rawCost).error
                                                    : null;
                                            const currentCost = currentCostFor?.(product) ?? null;
                                            const tone = cardToneFor({
                                                hasPending: hasPendingCost,
                                                rawValue: rawCost,
                                                currentValue: currentCost,
                                                parseInput: parseCostInput,
                                            });

                                            return (
                                                <div className={cn("min-w-0 rounded-md border p-2", cardToneClass(tone))}>
                                                    <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                                                        <div className="truncate text-xs font-medium" title="List Cost">
                                                            List Cost
                                                        </div>
                                                        <div className="shrink-0 text-[11px] text-muted-foreground">
                                                            {formatCostMoney(currentCost)}
                                                        </div>
                                                    </div>
                                                    <Input
                                                        inputMode="decimal"
                                                        value={hasPendingCost ? "" : rawCost}
                                                        onChange={(event) => {
                                                            if (hasPendingCost) return;
                                                            onDraftCostChange?.(product, event.target.value);
                                                        }}
                                                        onKeyDown={(event) => gridNav.onKeyDown(event, rowIndex, 0)}
                                                        onPaste={(event) =>
                                                            gridNav.onPaste(event, rowIndex, 0, handlePasteCell)
                                                        }
                                                        onFocus={() => gridNav.setActive(rowIndex, 0)}
                                                        ref={(el) => gridNav.register(rowIndex, 0, el)}
                                                        placeholder="Proposed"
                                                        aria-label={`Proposed list cost, row ${rowIndex + 1}`}
                                                        aria-invalid={Boolean(costError)}
                                                        aria-describedby={hasPendingCost ? pendingHintId : undefined}
                                                        aria-disabled={hasPendingCost ? true : undefined}
                                                        disabled={saving}
                                                        readOnly={hasPendingCost}
                                                        title={
                                                            hasPendingCost
                                                                ? "A list cost request is pending approval for this product."
                                                                : undefined
                                                        }
                                                        className={cn(
                                                            "h-8 text-right text-sm",
                                                            hasPendingCost ? "cursor-not-allowed opacity-60" : "",
                                                        )}
                                                    />
                                                    {costError ? (
                                                        <div className="mt-1 text-[11px] text-destructive">
                                                            {costError}
                                                        </div>
                                                    ) : null}
                                                    {hasPendingCost ? (
                                                        <div
                                                            id={pendingHintId}
                                                            title={`Request: PHP ${formatCostMoney(pendingCost)} - pending approval`}
                                                            className="mt-1 max-w-full truncate rounded-sm border border-amber-200/50 bg-amber-50 px-1 py-0.5 text-[11px] font-semibold leading-snug text-amber-600 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-500"
                                                        >
                                                            {`Pending PHP ${formatCostMoney(pendingCost)}`}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })()
                                ) : null}

                                {priceTypes.map((priceType, colIndex) => {
                                    const gridColIndex = showListCost ? colIndex + 1 : colIndex;
                                    const key = cellKey(product.product_id, priceType.price_type_id);
                                    const pendingValue = pendingValues.get(key);
                                    const hasPending = pendingValue !== undefined;
                                    const pendingHintId = `batch-price-pending-${product.product_id}-${priceType.price_type_id}`;
                                    const rawValue = draftPrices.get(key) ?? "";
                                    const parsed = parsePriceInput(rawValue);
                                    const hasError = !hasPending && rawValue.trim() && parsed.error;
                                    const label = priceTypeLabel(priceType);
                                    const currentPrice = currentPriceFor(product, priceType);
                                    const tone = cardToneFor({
                                        hasPending,
                                        rawValue,
                                        currentValue: currentPrice,
                                    });

                                    return (
                                        <div
                                            key={key}
                                            className={cn("min-w-0 rounded-md border p-2", cardToneClass(tone))}
                                        >
                                            <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                                                <div className="truncate text-xs font-medium" title={label}>
                                                    {label}
                                                </div>
                                                <div className="shrink-0 text-[11px] text-muted-foreground">
                                                    {formatMoney(currentPrice)}
                                                </div>
                                            </div>
                                            <Input
                                                inputMode="decimal"
                                                value={hasPending ? "" : rawValue}
                                                onChange={(event) =>
                                                    !hasPending
                                                        ? onDraftPriceChange(
                                                            product,
                                                            priceType.price_type_id,
                                                            event.target.value,
                                                        )
                                                        : undefined
                                                }
                                                onKeyDown={(event) =>
                                                    gridNav.onKeyDown(event, rowIndex, gridColIndex)
                                                }
                                                onPaste={(event) =>
                                                    gridNav.onPaste(
                                                        event,
                                                        rowIndex,
                                                        gridColIndex,
                                                        handlePasteCell,
                                                    )
                                                }
                                                onFocus={() => gridNav.setActive(rowIndex, gridColIndex)}
                                                ref={(el) => gridNav.register(rowIndex, gridColIndex, el)}
                                                placeholder="Proposed"
                                                aria-label={`Proposed price, row ${rowIndex + 1}, ${label}`}
                                                aria-invalid={Boolean(hasError)}
                                                aria-describedby={hasPending ? pendingHintId : undefined}
                                                aria-disabled={hasPending ? true : undefined}
                                                disabled={saving}
                                                readOnly={hasPending}
                                                title={
                                                    hasPending
                                                        ? "A price change request is pending approval for this cell."
                                                        : undefined
                                                }
                                                className={cn(
                                                    "h-8 text-right text-sm",
                                                    hasPending ? "cursor-not-allowed opacity-60" : "",
                                                )}
                                            />
                                            {hasError ? (
                                                <div className="mt-1 text-[11px] text-destructive">{parsed.error}</div>
                                            ) : null}
                                            {hasPending ? (
                                                <div
                                                    id={pendingHintId}
                                                    title={`Request: PHP ${formatMoney(pendingValue)} - pending approval`}
                                                    className="mt-1 max-w-full truncate rounded-sm border border-amber-200/50 bg-amber-50 px-1 py-0.5 text-[11px] font-semibold leading-snug text-amber-600 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-500"
                                                >
                                                    {pendingLabel(pendingValue)}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
