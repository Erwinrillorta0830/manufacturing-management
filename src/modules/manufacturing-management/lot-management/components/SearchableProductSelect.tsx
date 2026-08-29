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
    value: number | "ALL" | "";
    onValueChange: (val: number | "ALL") => void;
    disabled?: boolean;
    hasError?: boolean;
    placeholder?: string;
    allowAll?: boolean;
    allLabel?: string;
    className?: string;
}

export function SearchableProductSelect({
    products,
    value,
    onValueChange,
    disabled = false,
    hasError = false,
    placeholder = "Select product / material...",
    allowAll = false,
    allLabel = "All Products (Global FEFO)",
    className
}: SearchableProductSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const selectedProduct = React.useMemo(() => {
        if (value === "" || value === "ALL") return null;
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
                        "w-full justify-between font-normal text-left h-9 px-3 bg-background border-border shadow-2xs hover:bg-accent/40",
                        !selectedProduct && value !== "ALL" && "text-muted-foreground",
                        hasError && "border-rose-500 ring-rose-500/20 text-rose-500",
                        className
                    )}
                >
                    <span className="truncate flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                        {value === "ALL" ? (
                            <span className="font-bold text-foreground text-xs truncate">{allLabel}</span>
                        ) : selectedProduct ? (
                            <span className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold text-foreground text-xs truncate">{selectedProduct.productName}</span>
                                {selectedProduct.skuCode && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-muted text-muted-foreground border border-border/60 shrink-0">
                                        {selectedProduct.skuCode}
                                    </span>
                                )}
                            </span>
                        ) : value ? (
                            <span className="font-semibold text-foreground text-xs">Product #{value}</span>
                        ) : (
                            <span className="text-xs">{placeholder}</span>
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto p-0 shadow-xl border border-border bg-popover z-[9999] rounded-xl overflow-hidden"
                align="start"
                sideOffset={6}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Search Input Bar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search product description or SKU..."
                        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-[11px] text-muted-foreground hover:text-foreground font-medium px-1"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Scrollable List */}
                <div
                    className="max-h-60 overflow-y-auto overscroll-contain p-1 space-y-0.5 text-xs"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {allowAll && (
                        <button
                            type="button"
                            onClick={() => {
                                onValueChange("ALL");
                                setOpen(false);
                                setSearchQuery("");
                            }}
                            className={cn(
                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors cursor-pointer",
                                value === "ALL"
                                    ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                    : "text-foreground hover:bg-muted/70"
                            )}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Check
                                    className={cn(
                                        "h-3.5 w-3.5 shrink-0",
                                        value === "ALL" ? "opacity-100 text-primary" : "opacity-0"
                                    )}
                                />
                                <span className="font-bold">{allLabel}</span>
                            </div>
                        </button>
                    )}

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
                            const isSelected = selectedProduct ? Number(selectedProduct.productId) === Number(p.productId) : false;
                            return (
                                <button
                                    key={p.productId}
                                    type="button"
                                    onClick={() => {
                                        onValueChange(Number(p.productId));
                                        setOpen(false);
                                        setSearchQuery("");
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors cursor-pointer",
                                        isSelected
                                            ? "bg-primary/10 text-primary font-bold border border-primary/20"
                                            : "text-foreground hover:bg-muted/70"
                                    )}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                isSelected ? "opacity-100 text-primary" : "opacity-0"
                                            )}
                                        />
                                        <span className="truncate font-medium">{p.productName}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        {p.skuCode && (
                                            <span className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border/50">
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
