"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useDebounce } from "use-debounce";
import { BFFCatalogProduct } from "../types";
import { MaterialType } from "../material-types";

interface BOMMaterialSelectProps {
    value?: number;
    productName?: string;
    productCode?: string;
    onSelectProduct: (product: BFFCatalogProduct) => void;
    placeholder?: string;
    disabled?: boolean;
    type?: MaterialType | "by_product" | null;
}

export function BOMMaterialSelect({
    value,
    productName,
    productCode,
    onSelectProduct,
    placeholder = "Choose Material...",
    disabled = false,
    type,
}: BOMMaterialSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [options, setOptions] = React.useState<BFFCatalogProduct[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");
    const [debouncedSearch] = useDebounce(searchValue, 250);

    // Keep track of the currently selected product details so we can display the label even when closed
    const [selectedProduct, setSelectedProduct] = React.useState<BFFCatalogProduct | null>(null);

    // Resolve the selected product label on mount or value change
    React.useEffect(() => {
        if (!value || typeof value !== "number" || value <= 0) {
            queueMicrotask(() => {
                setSelectedProduct(null);
            });
            return;
        }

        // Avoid refetching if the current selection is already this product ID
        if (selectedProduct && selectedProduct.product_id === value) {
            return;
        }

        const controller = new AbortController();

        async function fetchSelected() {
            try {
                // Fetch the product by id or search with excludeRollup for speed
                const res = await fetch(`/api/manufacturing/finished-goods/products?search=${value}&limit=1&excludeRollup=true`, {
                    signal: controller.signal
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        const found = data.find((p: BFFCatalogProduct) => p.product_id === value);
                        if (found) {
                            setSelectedProduct(found);
                        }
                    }
                }
            } catch (e: unknown) {
                if ((e as Error)?.name !== "AbortError") {
                    console.error("Failed to fetch selected product details:", e);
                }
            }
        }

        fetchSelected();

        return () => {
            controller.abort();
        };
    }, [value, selectedProduct]);

    // Load initial recommendations when popover opens
    React.useEffect(() => {
        if (!open) return;

        const controller = new AbortController();

        async function loadDefaults() {
            setLoading(true);
            try {
                const res = await fetch("/api/manufacturing/finished-goods/products?limit=50&excludeRollup=true", {
                    signal: controller.signal
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setOptions(data);
                    }
                }
            } catch (e: unknown) {
                if ((e as Error)?.name !== "AbortError") {
                    console.error("Failed to fetch default materials:", e);
                }
            } finally {
                setLoading(false);
            }
        }

        loadDefaults();

        return () => {
            controller.abort();
        };
    }, [open]);

    // Dynamic search effect
    React.useEffect(() => {
        if (!open || !debouncedSearch.trim()) return;

        const controller = new AbortController();

        async function searchMaterials() {
            setLoading(true);
            try {
                const res = await fetch(`/api/manufacturing/finished-goods/products?search=${encodeURIComponent(debouncedSearch.trim())}&limit=50&excludeRollup=true`, {
                    signal: controller.signal
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setOptions(data);
                    }
                }
            } catch (e: unknown) {
                if ((e as Error)?.name !== "AbortError") {
                    console.error("Failed to search materials:", e);
                }
            } finally {
                setLoading(false);
            }
        }

        searchMaterials();

        return () => {
            controller.abort();
        };
    }, [debouncedSearch, open]);

    const filteredOptions = React.useMemo(() => {
        if (!type) return options;
        return options.filter(opt => {
            const pType = opt.product_type ? Number(opt.product_type) : null;
            
            if (type === "raw_material") {
                return pType === 389;
            }
            if (type === "packaging") {
                return pType === 390;
            }
            if (type === "sub_assembly") {
                return pType === 388 && Boolean(opt.has_versions);
            }
            if (type === "finished_good") {
                return pType === 388 && !opt.has_versions;
            }
            if (type === "by_product") {
                return true;
            }
            return false;
        });
    }, [options, type]);

    const displayLabel = React.useMemo(() => {
        if (selectedProduct) {
            const uom = selectedProduct.unit_of_measurement?.unit_shortcut || "N/A";
            const name = selectedProduct.description || selectedProduct.product_name;
            return `${name} (${selectedProduct.product_code || `ID-${selectedProduct.product_id}`}) [${uom}]`;
        }
        if (productName) {
            return productCode ? `${productName} (${productCode})` : productName;
        }
        if (value) {
            return `Unresolved Material (ID #${value} - Missing or Inactive)`;
        }
        return placeholder;
    }, [selectedProduct, productName, productCode, value, placeholder]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between font-normal text-left hover:bg-muted/10 shadow-none py-1.5 px-2.5 h-auto rounded-sm border-0 focus:ring-1 focus:ring-primary focus:bg-background", !value && "text-muted-foreground")}
                    disabled={disabled}
                >
                    <span className="truncate">{displayLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput 
                        placeholder="Type material name or SKU..." 
                        value={searchValue}
                        onValueChange={setSearchValue}
                    />
                    <CommandList>
                        {loading && (
                            <div className="flex items-center justify-center p-2 text-muted-foreground gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span className="text-xs">Loading materials...</span>
                            </div>
                        )}
                        {!loading && filteredOptions.length === 0 && (
                            <CommandEmpty>No materials found.</CommandEmpty>
                        )}
                        <CommandGroup>
                            {filteredOptions.map((opt) => (
                                <CommandItem
                                    key={opt.product_id}
                                    value={String(opt.product_id)}
                                    onSelect={() => {
                                        onSelectProduct(opt);
                                        setSelectedProduct(opt);
                                        setOpen(false);
                                        setSearchValue("");
                                    }}
                                >
                                    <Check
                                        className={cn(
                                             "mr-2 h-4 w-4",
                                            value === opt.product_id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {opt.description || opt.product_name} ({opt.product_code || `ID-${opt.product_id}`}) [{opt.unit_of_measurement?.unit_shortcut || "N/A"}]
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
