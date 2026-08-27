"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ProductItem } from "../types";

interface SearchableProductSelectProps {
    products: ProductItem[];
    value: number | "";
    onValueChange: (val: number) => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
}

export function SearchableProductSelect({
    products,
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "Select product / material..."
}: SearchableProductSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const selectedProduct = React.useMemo(() => {
        if (value === "") return null;
        return products.find((p) => Number(p.productId) === Number(value));
    }, [products, value]);

    const filteredProducts = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return products;
        return products.filter((p) => {
            const nameMatch = p.productName?.toLowerCase().includes(query);
            const skuMatch = p.skuCode?.toLowerCase().includes(query);
            const idMatch = String(p.productId).includes(query);
            return nameMatch || skuMatch || idMatch;
        });
    }, [products, searchQuery]);

    return (
        <Popover
            open={open}
            onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) setSearchQuery("");
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between font-normal text-left h-9.5 px-3 bg-background border-border",
                        !selectedProduct && "text-muted-foreground",
                        hasError && "border-rose-500 ring-rose-500/20 text-rose-500"
                    )}
                >
                    <span className="truncate flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        {selectedProduct ? (
                            <span className="flex items-center gap-2 truncate">
                                <span className="font-semibold text-foreground truncate">{selectedProduct.productName}</span>
                                {selectedProduct.skuCode && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-muted text-muted-foreground border border-border/60 shrink-0">
                                        {selectedProduct.skuCode}
                                    </span>
                                )}
                            </span>
                        ) : value ? (
                            <span className="font-semibold text-foreground">Product #{value}</span>
                        ) : (
                            placeholder
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 shadow-lg border border-border bg-popover z-[9999]"
                style={{ width: "var(--radix-popover-trigger-width)" }}
                align="start"
                sideOffset={4}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Search Input Bar */}
                <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border bg-muted/30">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search product name or SKU..."
                        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Scrollable List */}
                <div
                    className="max-h-56 overflow-y-auto overscroll-contain p-1 space-y-0.5 text-xs"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {filteredProducts.length === 0 ? (
                        <div className="py-5 text-center text-xs text-muted-foreground space-y-2">
                            <p>No products found matching &quot;{searchQuery}&quot;</p>
                            {!isNaN(Number(searchQuery)) && Number(searchQuery) > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onValueChange(Number(searchQuery));
                                        setOpen(false);
                                        setSearchQuery("");
                                    }}
                                    className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90"
                                >
                                    Use Product ID #{searchQuery}
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredProducts.map((p) => {
                            const isSelected = selectedProduct?.productId === p.productId;
                            return (
                                <button
                                    key={p.productId}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(p.productId);
                                        setOpen(false);
                                        setSearchQuery("");
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2.5 py-2 rounded-sm text-left transition-colors cursor-pointer",
                                        isSelected
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-foreground hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                isSelected ? "opacity-100 text-primary" : "opacity-0"
                                            )}
                                        />
                                        <span className="truncate font-medium">{p.productName}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        {p.unitCost !== undefined && Number(p.unitCost) > 0 && (
                                            <span className="text-[10px] font-mono text-muted-foreground">
                                                ₱{Number(p.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        )}
                                        {p.skuCode && (
                                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border/50">
                                                {p.skuCode}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
