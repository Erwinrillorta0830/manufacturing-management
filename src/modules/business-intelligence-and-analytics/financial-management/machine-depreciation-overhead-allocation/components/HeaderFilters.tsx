"use client";

import React, { useState } from "react";
import {
    ChevronsUpDown,
    Check,
    Search,
    RotateCcw,
    Calendar,
    Layers,
    Cpu,
    Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ProductionAssetMaster, WorkCenterOption, ReportFilters } from "../types";

interface HeaderFiltersProps {
    assets: ProductionAssetMaster[];
    workCenters: WorkCenterOption[];
    filters: ReportFilters;
    onChangeFilters: (filters: ReportFilters) => void;
    onResetFilters: () => void;
}

export default function HeaderFilters({
    assets,
    workCenters,
    filters,
    onChangeFilters,
    onResetFilters
}: HeaderFiltersProps) {
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [isWcOpen, setIsWcOpen] = useState(false);
    const [isTypeOpen, setIsTypeOpen] = useState(false);

    const selectedAsset = assets.find(a => String(a.asset_id) === filters.asset_id);
    const selectedWc = workCenters.find(w => String(w.work_center_id) === filters.work_center_id);

    const typeOptions = [
        { label: "All Equipment", value: "ALL" },
        { label: "Assigned to Work Station", value: "ASSIGNED" },
        { label: "Unassigned in Master Data", value: "UNASSIGNED" }
    ];

    return (
        <div className="rounded-xl border bg-card/60 backdrop-blur-sm p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* 1. Period Selector */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Fiscal Period
                    </Label>
                    <Input
                        type="month"
                        value={filters.period}
                        onChange={(e) => onChangeFilters({ ...filters, period: e.target.value })}
                        className="h-9 text-xs"
                    />
                </div>

                {/* 2. Machine / Production Asset Combobox */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5" />
                        Machine / Asset
                    </Label>
                    <Popover open={isAssetOpen} onOpenChange={setIsAssetOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isAssetOpen}
                                className="w-full justify-between h-9 text-xs px-3 font-normal"
                            >
                                <span className="truncate">
                                    {selectedAsset ? selectedAsset.item_name : "All Production Assets"}
                                </span>
                                <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search machine name or serial..." className="h-8 text-xs" />
                                <CommandList>
                                    <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                                        No production machines found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="ALL"
                                            onSelect={() => {
                                                onChangeFilters({ ...filters, asset_id: "ALL" });
                                                setIsAssetOpen(false);
                                            }}
                                            className="text-xs"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5",
                                                    filters.asset_id === "ALL" ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            All Production Assets
                                        </CommandItem>
                                        {assets.map((asset) => (
                                            <CommandItem
                                                key={asset.asset_id}
                                                value={`${asset.item_name} ${asset.serial || ""}`}
                                                onSelect={() => {
                                                    onChangeFilters({ ...filters, asset_id: String(asset.asset_id) });
                                                    setIsAssetOpen(false);
                                                }}
                                                className="text-xs"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5",
                                                        filters.asset_id === String(asset.asset_id) ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <div className="flex flex-col truncate">
                                                    <span className="truncate font-medium">{asset.item_name}</span>
                                                    {asset.serial && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            S/N: {asset.serial}
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
                </div>

                {/* 3. Work Center Combobox */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5" />
                        Work Center
                    </Label>
                    <Popover open={isWcOpen} onOpenChange={setIsWcOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isWcOpen}
                                className="w-full justify-between h-9 text-xs px-3 font-normal"
                            >
                                <span className="truncate">
                                    {selectedWc ? selectedWc.work_center_name : "All Work Centers"}
                                </span>
                                <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search work center..." className="h-8 text-xs" />
                                <CommandList>
                                    <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                                        No work centers found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="ALL"
                                            onSelect={() => {
                                                onChangeFilters({ ...filters, work_center_id: "ALL" });
                                                setIsWcOpen(false);
                                            }}
                                            className="text-xs"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5",
                                                    filters.work_center_id === "ALL" ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            All Work Centers
                                        </CommandItem>
                                        {workCenters.map((wc) => (
                                            <CommandItem
                                                key={wc.work_center_id}
                                                value={wc.work_center_name}
                                                onSelect={() => {
                                                    onChangeFilters({ ...filters, work_center_id: String(wc.work_center_id) });
                                                    setIsWcOpen(false);
                                                }}
                                                className="text-xs"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5",
                                                        filters.work_center_id === String(wc.work_center_id) ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <div className="flex flex-col truncate">
                                                    <span className="truncate font-medium">{wc.work_center_name}</span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Rate: ₱{wc.overhead_cost_per_hour.toFixed(2)}/hr
                                                    </span>
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 4. Station Linkage Filter */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Filter className="h-3.5 w-3.5" />
                        Station Linkage
                    </Label>
                    <Popover open={isTypeOpen} onOpenChange={setIsTypeOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isTypeOpen}
                                className="w-full justify-between h-9 text-xs px-3 font-normal"
                            >
                                <span className="truncate">
                                    {typeOptions.find(o => o.value === filters.asset_type)?.label || "All Equipment"}
                                </span>
                                <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0" align="start">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        {typeOptions.map((opt) => (
                                            <CommandItem
                                                key={opt.value}
                                                value={opt.value}
                                                onSelect={() => {
                                                    onChangeFilters({ ...filters, asset_type: opt.value });
                                                    setIsTypeOpen(false);
                                                }}
                                                className="text-xs"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5",
                                                        filters.asset_type === opt.value ? "opacity-100" : "opacity-0"
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
                </div>

                {/* 5. Search & Reset Button */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                        Search Keywords
                    </Label>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search keyword..."
                                value={filters.search}
                                onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
                                className="pl-8 h-9 text-xs"
                            />
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onResetFilters}
                            title="Reset all filters"
                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
