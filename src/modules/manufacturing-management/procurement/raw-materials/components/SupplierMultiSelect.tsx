"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

import { SupplierItem } from "../types/raw-materials.types";

interface SupplierMultiSelectProps {
    suppliers: SupplierItem[];
    selectedSupplierIds: number[];
    onToggleSupplier: (supplierId: number) => void;
    disabled?: boolean;
}

function isInactiveSupplier(supplier: SupplierItem): boolean {
    return supplier.isActive === false || supplier.isActive === 0;
}

function supplierLabel(supplier: SupplierItem): string {
    return supplier.supplier_name?.trim() || `Inactive supplier #${supplier.id}`;
}

export function SupplierMultiSelect({
    suppliers,
    selectedSupplierIds,
    onToggleSupplier,
    disabled = false,
}: SupplierMultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const selectedIds = React.useMemo(() => new Set(selectedSupplierIds), [selectedSupplierIds]);
    const suppliersById = React.useMemo(
        () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
        [suppliers]
    );
    const selectedSuppliers = React.useMemo(
        () => selectedSupplierIds.map((id) => suppliersById.get(id) || {
            id,
            supplier_name: `Inactive supplier #${id}`,
            isActive: 0,
        }),
        [selectedSupplierIds, suppliersById]
    );
    const availableSuppliers = React.useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return suppliers.filter((supplier) => {
            if (selectedIds.has(supplier.id) || isInactiveSupplier(supplier)) return false;
            if (!normalizedSearch) return true;
            return supplierLabel(supplier).toLowerCase().includes(normalizedSearch)
                || (supplier.supplier_shortcut || "").toLowerCase().includes(normalizedSearch);
        });
    }, [search, selectedIds, suppliers]);

    const handleToggle = (supplierId: number) => {
        onToggleSupplier(supplierId);
        setSearch("");
    };

    return (
        <div data-testid="raw-material-supplier-linking" className="space-y-1">
            <div className="flex items-center justify-between gap-2">
                <label id="raw-material-supplier-linking-label" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Linked Approved Suppliers ({selectedSupplierIds.length})
                </label>
                {disabled && <span className="text-[9px] font-semibold text-muted-foreground">Inherited from parent</span>}
            </div>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-label="Link approved suppliers"
                        aria-labelledby="raw-material-supplier-linking-label"
                        aria-expanded={open}
                        aria-controls="raw-material-supplier-linking-list"
                        className={cn("h-8 w-full justify-between text-xs", selectedSupplierIds.length === 0 && "text-muted-foreground")}
                        disabled={disabled}
                    >
                        <span className="min-w-0 truncate text-left">
                            {selectedSupplierIds.length > 0
                                ? `${selectedSupplierIds.length} supplier${selectedSupplierIds.length === 1 ? "" : "s"} linked`
                                : "Search and link approved supplier..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput
                            value={search}
                            onValueChange={setSearch}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") setOpen(false);
                            }}
                            placeholder="Search supplier name or shortcut..."
                        />
                        <CommandList id="raw-material-supplier-linking-list">
                            <CommandEmpty>
                                {suppliers.length > 0 ? "No active suppliers match your search." : "No active suppliers available."}
                            </CommandEmpty>
                            <CommandGroup heading="Active suppliers">
                                {availableSuppliers.map((supplier) => (
                                    <CommandItem
                                        key={supplier.id}
                                        value={`${supplierLabel(supplier)} ${supplier.supplier_shortcut || ""} ${supplier.id}`}
                                        onSelect={() => handleToggle(supplier.id)}
                                    >
                                        <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                                        <span className="min-w-0 truncate font-semibold">{supplierLabel(supplier)}</span>
                                        {supplier.supplier_shortcut && (
                                            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                                                ({supplier.supplier_shortcut})
                                            </span>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            <div className="min-h-8 rounded-lg border bg-card p-1.5" aria-live="polite">
                {selectedSuppliers.length === 0 ? (
                    <p className="px-1 py-1 text-[10px] text-muted-foreground">No suppliers linked</p>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {selectedSuppliers.map((supplier) => {
                            const inactive = isInactiveSupplier(supplier);
                            const label = supplierLabel(supplier);
                            return (
                                <Badge
                                    key={supplier.id}
                                    variant="outline"
                                    className={cn(
                                        "max-w-full gap-1 py-1 text-[10px]",
                                        inactive && "border-amber-400/60 bg-amber-50 text-amber-800"
                                    )}
                                    aria-disabled={inactive || undefined}
                                    title={inactive ? "Inactive supplier. Remove explicitly to unlink it." : label}
                                >
                                    <span className="min-w-0 truncate">
                                        {label}
                                        {supplier.supplier_shortcut && ` (${supplier.supplier_shortcut})`}
                                        {inactive && " - Inactive supplier"}
                                    </span>
                                    <button
                                        type="button"
                                        className="shrink-0 rounded-sm opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() => onToggleSupplier(supplier.id)}
                                        aria-label={`Remove ${label}`}
                                        disabled={disabled}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            );
                        })}
                    </div>
                )}
            </div>
            <p className="text-[10px] text-muted-foreground">Supplier links are saved with the material profile.</p>
        </div>
    );
}
