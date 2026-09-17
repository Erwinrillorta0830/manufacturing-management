"use client";

import React, { useState } from "react";
import { 
    Search, 
    X, 
    RotateCcw, 
    Building2, 
    Factory, 
    Package, 
    AlertTriangle,
    Check, 
    ChevronsUpDown,
    Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { WipFilterState, WipMasterData } from "../types";
import { JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";

interface WipFilterToolbarProps {
    filters: WipFilterState;
    masterData: WipMasterData;
    onFilterChange: <K extends keyof WipFilterState>(key: K, value: WipFilterState[K]) => void;
    onResetFilters: () => void;
}

export function WipFilterToolbar({
    filters,
    masterData,
    onFilterChange,
    onResetFilters
}: WipFilterToolbarProps) {
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [isWorkCenterOpen, setIsWorkCenterOpen] = useState(false);
    const [isProductOpen, setIsProductOpen] = useState(false);
    const [isBranchOpen, setIsBranchOpen] = useState(false);

    const selectedWorkCenter = masterData.workCenters.find(
        (wc) => wc.work_center_id === filters.workCenterId
    );
    const selectedProduct = masterData.products.find(
        (p) => p.product_id === filters.productId
    );
    const selectedBranch = masterData.branches.find(
        (b) => b.id === filters.branchId
    );

    const statusOptions = [
        { label: "Active WIP (Default)", value: "ALL_ACTIVE" },
        { label: "In Production", value: JOB_ORDER_STATUS.IN_PRODUCTION },
        { label: "Picked (Ready)", value: JOB_ORDER_STATUS.PICKED },
        { label: "On Hold", value: JOB_ORDER_STATUS.ON_HOLD },
        { label: "For QA / Reconciliation", value: JOB_ORDER_STATUS.FOR_QA_RECONCILIATION },
        { label: "Draft", value: JOB_ORDER_STATUS.DRAFT },
        { label: "Closed", value: JOB_ORDER_STATUS.CLOSED },
        { label: "All Statuses", value: "ALL" }
    ];

    const selectedStatus = statusOptions.find((s) => s.value === filters.status);

    const isFiltered = Boolean(
        filters.search ||
        filters.status !== "ALL_ACTIVE" ||
        filters.workCenterId !== null ||
        filters.productId !== null ||
        filters.branchId !== null ||
        filters.delayedOnly
    );

    return (
        <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
            {/* Row 1: Search, Delayed Only Toggle, and Reset */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search Input */}
                <div className="relative min-w-[240px] flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search Job Order #, Product Name, Code, Station..."
                        value={filters.search}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        onChange={(e) => onFilterChange("search", e.target.value)}
                        className="h-9 pl-9 pr-8 text-xs sm:text-sm bg-background/80"
                    />
                    {filters.search && (
                        <button
                            type="button"
                            onClick={() => onFilterChange("search", "")}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Actions: Delayed Only & Reset */}
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant={filters.delayedOnly ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => onFilterChange("delayedOnly", !filters.delayedOnly)}
                        className={`h-9 gap-1.5 text-xs font-semibold ${
                            filters.delayedOnly
                                ? "bg-rose-600 text-white hover:bg-rose-700"
                                : "text-muted-foreground border-input bg-background/80 hover:text-foreground"
                        }`}
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Delayed Only</span>
                    </Button>

                    {isFiltered && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onResetFilters}
                            className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reset Filters</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* Row 2: 4 Combobox Dropdowns (Status, Line, Product, Branch) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2.5 border-t border-border/50">
                {/* 1. Status Combobox */}
                <Popover open={isStatusOpen} onOpenChange={setIsStatusOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isStatusOpen}
                            className="h-9 w-full justify-between text-xs font-normal border-input bg-background/80"
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate font-medium">
                                    {selectedStatus ? selectedStatus.label : "Status: Active WIP"}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[240px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search status..." className="h-9 text-xs" />
                            <CommandList>
                                <CommandEmpty>No status found.</CommandEmpty>
                                <CommandGroup>
                                    {statusOptions.map((opt) => (
                                        <CommandItem
                                            key={opt.value}
                                            value={opt.label}
                                            onSelect={() => {
                                                onFilterChange("status", opt.value);
                                                setIsStatusOpen(false);
                                            }}
                                            className="text-xs cursor-pointer"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5",
                                                    filters.status === opt.value ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {opt.label}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* 2. Work Center / Line Combobox */}
                <Popover open={isWorkCenterOpen} onOpenChange={setIsWorkCenterOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isWorkCenterOpen}
                            className="h-9 w-full justify-between text-xs font-normal border-input bg-background/80"
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Factory className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">
                                    {selectedWorkCenter
                                        ? selectedWorkCenter.work_center_name
                                        : "All Lines / Centers"}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[260px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search line or work center..." className="h-9 text-xs" />
                            <CommandList>
                                <CommandEmpty>No work center found.</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem
                                        value="all-lines"
                                        onSelect={() => {
                                            onFilterChange("workCenterId", null);
                                            setIsWorkCenterOpen(false);
                                        }}
                                        className="text-xs cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-3.5 w-3.5",
                                                filters.workCenterId === null ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        All Lines / Centers
                                    </CommandItem>
                                    {masterData.workCenters.map((wc) => (
                                        <CommandItem
                                            key={wc.work_center_id}
                                            value={wc.work_center_name}
                                            onSelect={() => {
                                                onFilterChange("workCenterId", wc.work_center_id);
                                                setIsWorkCenterOpen(false);
                                            }}
                                            className="text-xs cursor-pointer"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5",
                                                    filters.workCenterId === wc.work_center_id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {wc.work_center_name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* 3. Finished Good Product Combobox */}
                <Popover open={isProductOpen} onOpenChange={setIsProductOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isProductOpen}
                            className="h-9 w-full justify-between text-xs font-normal border-input bg-background/80"
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">
                                    {selectedProduct
                                        ? selectedProduct.product_name
                                        : "All Finished Goods"}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search finished good..." className="h-9 text-xs" />
                            <CommandList>
                                <CommandEmpty>No product found.</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem
                                        value="all-products"
                                        onSelect={() => {
                                            onFilterChange("productId", null);
                                            setIsProductOpen(false);
                                        }}
                                        className="text-xs cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-3.5 w-3.5",
                                                filters.productId === null ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        All Finished Goods
                                    </CommandItem>
                                    {masterData.products.map((p) => (
                                        <CommandItem
                                            key={p.product_id}
                                            value={`${p.product_name} ${p.product_code || ""}`}
                                            onSelect={() => {
                                                onFilterChange("productId", p.product_id);
                                                setIsProductOpen(false);
                                            }}
                                            className="text-xs cursor-pointer"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5",
                                                    filters.productId === p.product_id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <div className="flex flex-col">
                                                <span>{p.product_name}</span>
                                                {p.product_code && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {p.product_code}
                                                    </span>
                                                )}
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* 4. Branch Combobox */}
                <Popover open={isBranchOpen} onOpenChange={setIsBranchOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isBranchOpen}
                            className="h-9 w-full justify-between text-xs font-normal border-input bg-background/80"
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">
                                    {selectedBranch
                                        ? selectedBranch.branch_name
                                        : "All Branches"}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[240px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search branch..." className="h-9 text-xs" />
                            <CommandList>
                                <CommandEmpty>No branch found.</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem
                                        value="all-branches"
                                        onSelect={() => {
                                            onFilterChange("branchId", null);
                                            setIsBranchOpen(false);
                                        }}
                                        className="text-xs cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-3.5 w-3.5",
                                                filters.branchId === null ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        All Branches
                                    </CommandItem>
                                    {masterData.branches.map((b) => (
                                        <CommandItem
                                            key={b.id}
                                            value={`${b.branch_name} ${b.branch_code || ""}`}
                                            onSelect={() => {
                                                onFilterChange("branchId", b.id);
                                                setIsBranchOpen(false);
                                            }}
                                            className="text-xs cursor-pointer"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5",
                                                    filters.branchId === b.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {b.branch_name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
