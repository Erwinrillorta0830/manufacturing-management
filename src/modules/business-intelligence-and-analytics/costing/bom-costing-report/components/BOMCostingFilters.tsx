"use client";

import React, { useState } from "react";
import {
    ChevronsUpDown,
    Layers,
    Package,
    RotateCcw,
    Scale
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProductOption, VersionOption } from "../types";

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
    selectedVersion,
    targetQuantity,
    onChangeTargetQuantity,
    onGenerate,
    onReset,
    isLoadingProducts,
    isLoadingVersions,
    isGenerating
}: BOMCostingFiltersProps) {
    const [isProductOpen, setIsProductOpen] = useState(false);
    const [rawQtyInput, setRawQtyInput] = useState<string>(String(targetQuantity || 1));

    // Synchronize local input string when external targetQuantity changes
    React.useEffect(() => {
        setRawQtyInput(String(targetQuantity));
    }, [targetQuantity]);

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
            setRawQtyInput(String(fallback));
            onChangeTargetQuantity(fallback);
        } else {
            setRawQtyInput(String(num));
            onChangeTargetQuantity(num);
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Layers className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Report Parameters & Simulation</h3>
                        <p className="text-xs text-muted-foreground">Select a finished good or sub-assembly to explode its multi-level material cost breakdown.</p>
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
                      
                        {isGenerating ? "Exploding BOM..." : "Generate Costing Report"}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. PRODUCT SELECTOR (COMBOBOX) */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-primary" />
                        Target Finished Good
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
                                            ? (selectedProduct.description || selectedProduct.product_name)
                                            : isLoadingProducts
                                            ? "Loading finished goods..."
                                            : "Select finished good..."}
                                    </span>
                                </div>
                                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[540px] sm:w-[650px] md:w-[720px] max-w-[95vw] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search products by name or SKU..." className="h-9 text-xs" />
                                <CommandList className="max-h-84">
                                    <CommandEmpty>No matching finished goods found.</CommandEmpty>
                                    <CommandGroup heading="Finished Goods & Variants">
                                        {roots.map(root => {
                                            const rootDisplayName = root.description || root.product_name;
                                            const rootChildren = childrenMap.get(root.product_id) || [];
                                            const isRootSelected = selectedProduct?.product_id === root.product_id;

                                            return (
                                                <React.Fragment key={`root-group-${root.product_id}`}>
                                                    {/* Parent Product Row */}
                                                    <CommandItem
                                                        value={`${rootDisplayName} ${root.product_name} ${root.product_code || ""} ${root.uom_name || ""} ${root.product_id} Parent`}
                                                        onSelect={() => {
                                                            onSelectProduct(root);
                                                            setIsProductOpen(false);
                                                        }}
                                                        className={cn(
                                                            "text-xs flex items-center justify-between cursor-pointer py-2 px-3 border-b border-border/40 hover:bg-muted/50 transition-colors",
                                                            isRootSelected && "bg-primary/5 font-semibold"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                                            <div className="p-1.5 rounded-full bg-primary/10 text-primary shrink-0">
                                                                <Package className="h-3.5 w-3.5" />
                                                            </div>
                                                            <div className="flex flex-col min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <span className="font-bold text-foreground truncate text-xs">
                                                                        {rootDisplayName}
                                                                    </span>
                                                                    <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[8px] font-bold px-1.5 py-0.2 rounded border border-blue-500/20 shrink-0">
                                                                        Parent
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
                                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15"
                                                                        : "bg-muted text-muted-foreground"
                                                                )}
                                                            >
                                                                {root.has_versions ? "Recipe Ready" : "No Recipe"}
                                                            </Badge>
                                                        </div>
                                                    </CommandItem>

                                                    {/* Child Variants */}
                                                    {rootChildren.map(child => {
                                                        const childDisplayName = child.description || child.product_name;
                                                        const isChildSelected = selectedProduct?.product_id === child.product_id;

                                                        return (
                                                            <CommandItem
                                                                key={`child-${child.product_id}`}
                                                                value={`${childDisplayName} ${child.product_name} ${child.product_code || ""} ${child.uom_name || ""} ${child.product_id} Child ${rootDisplayName}`}
                                                                onSelect={() => {
                                                                    onSelectProduct(child);
                                                                    setIsProductOpen(false);
                                                                }}
                                                                className={cn(
                                                                    "text-xs flex items-center justify-between cursor-pointer py-2 px-3 pl-7 border-b border-border/30 hover:bg-muted/50 transition-colors",
                                                                    isChildSelected && "bg-primary/5 font-semibold"
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                                                    <div className="p-1.5 rounded-full bg-muted text-muted-foreground shrink-0">
                                                                        <Layers className="h-3 w-3" />
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0 flex-1">
                                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                                            <span className="font-semibold text-foreground truncate text-xs">
                                                                                {childDisplayName}
                                                                            </span>
                                                                            <span className="bg-muted text-muted-foreground text-[8px] font-medium px-1.5 py-0.2 rounded border shrink-0">
                                                                                Child
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
                                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15"
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

                                        {/* Orphan Variants (if parent not in roots) */}
                                        {orphans.map(orphan => {
                                            const orphanDisplayName = orphan.description || orphan.product_name;
                                            const isOrphanSelected = selectedProduct?.product_id === orphan.product_id;

                                            return (
                                                <CommandItem
                                                    key={`orphan-${orphan.product_id}`}
                                                    value={`${orphanDisplayName} ${orphan.product_name} ${orphan.product_code || ""} ${orphan.uom_name || ""} ${orphan.product_id} Child`}
                                                    onSelect={() => {
                                                        onSelectProduct(orphan);
                                                        setIsProductOpen(false);
                                                    }}
                                                    className={cn(
                                                        "text-xs flex items-center justify-between cursor-pointer py-2 px-3 pl-7 border-b border-border/30 hover:bg-muted/50 transition-colors",
                                                        isOrphanSelected && "bg-primary/5 font-semibold"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                                        <div className="p-1.5 rounded-full bg-muted text-muted-foreground shrink-0">
                                                            <Layers className="h-3 w-3" />
                                                        </div>
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="font-semibold text-foreground truncate text-xs">
                                                                    {orphanDisplayName}
                                                                </span>
                                                                <span className="bg-muted text-muted-foreground text-[8px] font-medium px-1.5 py-0.2 rounded border shrink-0">
                                                                    Child
                                                                </span>
                                                            </div>
                                                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                                                                SKU: {orphan.product_code || "N/A"} • Base: {orphan.uom_name || "PCS"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0">
                                                        <Badge
                                                            variant={orphan.has_versions ? "default" : "secondary"}
                                                            className={cn(
                                                                "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                                                orphan.has_versions
                                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15"
                                                                    : "bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {orphan.has_versions ? "Recipe Ready" : "No Recipe"}
                                                        </Badge>
                                                    </div>
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 2. SIMULATED BATCH QUANTITY */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            <Scale className="h-3.5 w-3.5 text-primary" />
                            Target Batch Size ({selectedVersion?.uom_name || "Units"})
                        </Label>
                        {isLoadingVersions ? (
                            <span className="text-[10px] text-muted-foreground animate-pulse">
                                Loading primary recipe...
                            </span>
                        ) : selectedVersion ? (
                            <span className="text-[10px] text-muted-foreground">
                                Recipe: <strong className="text-foreground font-medium">{selectedVersion.version_name}</strong> (Base: {selectedVersion.base_quantity} {selectedVersion.uom_name})
                            </span>
                        ) : null}
                    </div>
                    <div className="relative">
                        <Input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={rawQtyInput}
                            onChange={handleQtyChange}
                            onFocus={handleQtyFocus}
                            onClick={handleQtyClick}
                            onBlur={handleQtyBlur}
                            disabled={!selectedVersion || isGenerating}
                            placeholder="Enter batch size..."
                            className="h-9 text-xs font-semibold bg-background pr-12"
                        />
                        <div className="absolute right-3 top-2.5 text-[11px] font-medium text-muted-foreground pointer-events-none">
                            {selectedVersion?.uom_name || "pcs"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
