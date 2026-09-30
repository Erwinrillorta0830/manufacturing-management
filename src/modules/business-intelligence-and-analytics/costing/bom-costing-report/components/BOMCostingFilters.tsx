"use client";

import React, { useState, useEffect } from "react";
import {
    ChevronsUpDown,
    Layers,
    Package,
    RotateCcw,
    GitBranch,
    Coins,
    Calculator
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProductOption, VersionOption } from "../types";
import { isDiscreteUom } from "./BOMCostingTreeTable";

interface BOMCostingFiltersProps {
    products: ProductOption[];
    selectedProduct: ProductOption | null;
    onSelectProduct: (product: ProductOption) => void;
    versions?: VersionOption[];
    selectedVersion: VersionOption | null;
    onSelectVersion?: (version: VersionOption) => void;
    targetQuantity: number;
    onChangeTargetQuantity: (qty: number) => void;
    onGenerate: () => void;
    onReset: () => void;
    isLoadingProducts: boolean;
    isLoadingVersions: boolean;
    isGenerating: boolean;
}

export default function BOMCostingFilters({
    products,
    selectedProduct,
    onSelectProduct,
    versions = [],
    selectedVersion,
    onSelectVersion,
    targetQuantity,
    onChangeTargetQuantity,
    onGenerate,
    onReset,
    isLoadingProducts,
    isLoadingVersions,
    isGenerating
}: BOMCostingFiltersProps) {
    const [isProductOpen, setIsProductOpen] = useState(false);

    // Format raw input string based on whether UOM is discrete (e.g. PCS) or continuous
    const formatInitialQty = (qty: number, _uom?: string): string => {
        if (!qty || qty <= 0) return "1.0000";
        return Number(qty).toFixed(4);
    };

    const [rawQtyInput, setRawQtyInput] = useState<string>(
        formatInitialQty(targetQuantity, selectedVersion?.uom_name)
    );

    // Synchronize local input string when external targetQuantity or version changes
    useEffect(() => {
        setRawQtyInput(formatInitialQty(targetQuantity, selectedVersion?.uom_name));
    }, [targetQuantity, selectedVersion?.uom_name]);

    // Handle quantity typing with auto-selection & blur fallback
    const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setRawQtyInput(val);
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0) {
            onChangeTargetQuantity(num);
        }
    };

    const handleQtyFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        e.target.select();
    };

    const handleQtyClick = (e: React.MouseEvent<HTMLInputElement>) => {
        (e.target as HTMLInputElement).select();
    };

    const handleQtyBlur = () => {
        const num = parseFloat(rawQtyInput);
        if (isNaN(num) || num <= 0) {
            const fallback = selectedVersion?.base_quantity || 1;
            const formattedFallback = Number(fallback).toFixed(4);
            setRawQtyInput(formattedFallback);
            onChangeTargetQuantity(Number(formattedFallback));
        } else {
            const formatted = num.toFixed(4);
            setRawQtyInput(formatted);
            onChangeTargetQuantity(Number(formatted));
        }
    };

    // Build hierarchical finished goods options (Parent & Child variants)
    const { roots, childrenMap, orphans } = React.useMemo(() => {
        const cMap = new Map<number, ProductOption[]>();
        const rList: ProductOption[] = [];
        const rIds = new Set<number>();

        products.forEach(p => {
            if (!p.parent_id) {
                rList.push(p);
                rIds.add(p.product_id);
            } else {
                const pId = p.parent_id;
                if (!cMap.has(pId)) cMap.set(pId, []);
                cMap.get(pId)!.push(p);
            }
        });

        const oList: ProductOption[] = [];
        products.forEach(p => {
            if (p.parent_id && !rIds.has(p.parent_id)) {
                oList.push(p);
            }
        });

        return { roots: rList, childrenMap: cMap, orphans: oList };
    }, [products]);

    return (
        <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-xs transition-all space-y-4">
            {/* Top action header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Layers className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Standard Costing Parameters</h3>
                        <p className="text-xs text-muted-foreground">Select a finished product assembly to explode its multi-level BOM standard cost breakdown.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onReset}
                        disabled={isGenerating || (!selectedProduct && !selectedVersion)}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Reset
                    </Button>
                    <Button
                        size="sm"
                        onClick={onGenerate}
                        disabled={!selectedProduct || !selectedVersion || isGenerating}
                        className="h-8 text-xs font-medium shadow-xs"
                    >
                        {isGenerating ? "Calculating Standard Cost..." : "Generate Costing Report"}
                    </Button>
                </div>
            </div>

            {/* Filter grid row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. FINISHED PRODUCT ASSEMBLY (COMBOBOX) */}
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                    <Label className="text-[11px] font-semibold text-foreground tracking-wider uppercase flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-primary" />
                        Finished Product Assembly
                    </Label>
                    <Popover open={isProductOpen} onOpenChange={setIsProductOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isProductOpen}
                                disabled={isLoadingProducts || isGenerating}
                                className="w-full justify-between h-9 text-xs font-normal bg-background hover:border-primary transition-all"
                            >
                                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                    {selectedProduct ? (
                                        selectedProduct.is_parent ? (
                                            <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                                        ) : (
                                            <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                                        )
                                    ) : (
                                        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    )}
                                    <span
                                        className="font-semibold text-foreground text-xs truncate"
                                        title={selectedProduct ? (selectedProduct.description || selectedProduct.product_name) : ""}
                                    >
                                        {selectedProduct
                                            ? `${selectedProduct.product_code ? `${selectedProduct.product_code} • ` : ""}${selectedProduct.description || selectedProduct.product_name}`
                                            : isLoadingProducts
                                            ? "Loading finished products..."
                                            : "Select finished product assembly..."}
                                    </span>
                                </div>
                                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[500px] sm:w-[600px] max-w-[95vw] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search assembly by name, code or SKU..." className="h-9 text-xs" />
                                <CommandList className="max-h-80">
                                    <CommandEmpty>No matching finished products found.</CommandEmpty>
                                    <CommandGroup heading="Finished Assemblies & Variants">
                                        {roots.map(root => {
                                            const rootDisplayName = root.description || root.product_name;
                                            const rootChildren = childrenMap.get(root.product_id) || [];
                                            const isRootSelected = selectedProduct?.product_id === root.product_id;

                                            return (
                                                <React.Fragment key={`root-group-${root.product_id}`}>
                                                    <CommandItem
                                                        value={`${rootDisplayName} ${root.product_name} ${root.product_code || ""} ${root.product_id} Parent`}
                                                        onSelect={() => {
                                                            onSelectProduct(root);
                                                            setIsProductOpen(false);
                                                        }}
                                                        className={cn(
                                                            "text-xs flex items-center justify-between cursor-pointer py-2 px-3 border-b border-border/30 hover:bg-muted/50 transition-colors",
                                                            isRootSelected && "bg-primary/5 font-semibold"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                                            <div className="p-1.5 rounded-full bg-primary/10 text-primary shrink-0">
                                                                <Package className="h-3.5 w-3.5" />
                                                            </div>
                                                            <div className="flex flex-col min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <span className="font-semibold text-foreground truncate text-xs">
                                                                        {rootDisplayName}
                                                                    </span>
                                                                    <span className="bg-primary/10 text-primary text-[8px] font-medium px-1.5 py-0.2 rounded border border-primary/20 shrink-0">
                                                                        Master
                                                                    </span>
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground font-mono truncate">
                                                                    SKU: {root.product_code || "N/A"} • Base: {root.uom_name || "PCS"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0">
                                                            <Badge
                                                                variant={root.has_versions ? "default" : "secondary"}
                                                                className={cn(
                                                                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                                                    root.has_versions
                                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                                        : "bg-muted text-muted-foreground"
                                                                )}
                                                            >
                                                                {root.has_versions ? "Recipe Ready" : "No Recipe"}
                                                            </Badge>
                                                        </div>
                                                    </CommandItem>

                                                    {rootChildren.map(child => {
                                                        const childDisplayName = child.description || child.product_name;
                                                        const isChildSelected = selectedProduct?.product_id === child.product_id;

                                                        return (
                                                            <CommandItem
                                                                key={`child-${child.product_id}`}
                                                                value={`${childDisplayName} ${child.product_name} ${child.product_code || ""} ${child.product_id} Child`}
                                                                onSelect={() => {
                                                                    onSelectProduct(child);
                                                                    setIsProductOpen(false);
                                                                }}
                                                                className={cn(
                                                                    "text-xs flex items-center justify-between cursor-pointer py-2 px-3 pl-8 border-b border-border/30 hover:bg-muted/50 transition-colors",
                                                                    isChildSelected && "bg-primary/5 font-semibold"
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                                                    <div className="p-1 rounded-full bg-muted text-muted-foreground shrink-0">
                                                                        <Layers className="h-3 w-3" />
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0 flex-1">
                                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                                            <span className="font-medium text-foreground truncate text-xs">
                                                                                {childDisplayName}
                                                                            </span>
                                                                            <span className="bg-muted text-muted-foreground text-[8px] font-medium px-1.5 py-0.2 rounded border shrink-0">
                                                                                Variant
                                                                            </span>
                                                                        </div>
                                                                        <span className="text-[10px] text-muted-foreground font-mono truncate">
                                                                            SKU: {child.product_code || "N/A"} • Base: {child.uom_name || "PCS"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="shrink-0">
                                                                    <Badge
                                                                        variant={child.has_versions ? "default" : "secondary"}
                                                                        className={cn(
                                                                            "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                                                            child.has_versions
                                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                                                : "bg-muted text-muted-foreground"
                                                                        )}
                                                                    >
                                                                        {child.has_versions ? "Recipe Ready" : "No Recipe"}
                                                                    </Badge>
                                                                </div>
                                                            </CommandItem>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}

                                        {orphans.map(orphan => {
                                            const orphanDisplayName = orphan.description || orphan.product_name;
                                            const isOrphanSelected = selectedProduct?.product_id === orphan.product_id;

                                            return (
                                                <CommandItem
                                                    key={`orphan-${orphan.product_id}`}
                                                    value={`${orphanDisplayName} ${orphan.product_name} ${orphan.product_code || ""} ${orphan.product_id} Child`}
                                                    onSelect={() => {
                                                        onSelectProduct(orphan);
                                                        setIsProductOpen(false);
                                                    }}
                                                    className={cn(
                                                        "text-xs flex items-center justify-between cursor-pointer py-2 px-3 pl-8 border-b border-border/30 hover:bg-muted/50 transition-colors",
                                                        isOrphanSelected && "bg-primary/5 font-semibold"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                                        <div className="p-1 rounded-full bg-muted text-muted-foreground shrink-0">
                                                            <Layers className="h-3 w-3" />
                                                        </div>
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="font-semibold text-foreground truncate text-xs">
                                                                {orphanDisplayName}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                                                                SKU: {orphan.product_code || "N/A"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        variant={orphan.has_versions ? "default" : "secondary"}
                                                        className={cn(
                                                            "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                                            orphan.has_versions
                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                                : "bg-muted text-muted-foreground"
                                                        )}
                                                    >
                                                        {orphan.has_versions ? "Recipe Ready" : "No Recipe"}
                                                    </Badge>
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 2. ROUTING & BOM REV */}
                <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground tracking-wider uppercase flex items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5 text-primary" />
                        Routing & BOM Rev
                    </Label>
                    {versions.length > 0 && onSelectVersion ? (
                        <Select
                            value={selectedVersion ? String(selectedVersion.version_id) : ""}
                            onValueChange={val => {
                                const found = versions.find(v => String(v.version_id) === val);
                                if (found) onSelectVersion(found);
                            }}
                            disabled={isLoadingVersions || isGenerating}
                        >
                            <SelectTrigger className="h-9 text-xs bg-background">
                                <SelectValue placeholder="Select routing revision..." />
                            </SelectTrigger>
                            <SelectContent>
                                {versions.map(v => (
                                    <SelectItem key={v.version_id} value={String(v.version_id)} className="text-xs">
                                        {v.version_name} {v.is_primary ? "(Active Standard)" : `(${v.status})`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Input
                            disabled
                            value={isLoadingVersions ? "Loading revisions..." : selectedVersion ? `${selectedVersion.version_name} (${selectedVersion.status})` : "No revision available"}
                            className="h-9 text-xs bg-muted/30"
                        />
                    )}
                </div>

                {/* 3. CURRENCY BASE */}
                <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground tracking-wider uppercase flex items-center gap-1.5">
                        <Coins className="h-3.5 w-3.5 text-primary" />
                        Currency Base
                    </Label>
                    <Select defaultValue="PHP">
                        <SelectTrigger className="h-9 text-xs bg-background">
                            <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="PHP" className="text-xs">
                                PHP (₱) - Philippine Peso
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 4. BATCH PRODUCTION QTY */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-semibold text-foreground tracking-wider uppercase flex items-center gap-1.5">
                            <Calculator className="h-3.5 w-3.5 text-primary" />
                            Batch Production Qty
                        </Label>
                        {selectedVersion && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                                Base: {formatInitialQty(selectedVersion.base_quantity, selectedVersion.uom_name)} {selectedVersion.uom_name}
                            </span>
                        )}
                    </div>
                    <div className="relative">
                        <Input
                            type="text"
                            inputMode="decimal"
                            value={rawQtyInput}
                            onChange={handleQtyChange}
                            onFocus={handleQtyFocus}
                            onClick={handleQtyClick}
                            onBlur={handleQtyBlur}
                            disabled={!selectedVersion || isGenerating}
                            placeholder="Enter batch quantity..."
                            className="h-9 text-xs font-semibold bg-background pr-14"
                        />
                        <div className="absolute right-3 top-2 text-[11px] font-mono text-muted-foreground pointer-events-none">
                            {selectedVersion?.uom_name || "PCS"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
