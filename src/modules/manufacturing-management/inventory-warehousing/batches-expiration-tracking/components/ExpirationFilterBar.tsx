import React, { useState } from "react";
import { Search, RotateCcw, Check, ChevronsUpDown, Download, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BatchExpirationFilters, ExpirationStatus } from "../types";

interface ExpirationFilterBarProps {
    filters: BatchExpirationFilters;
    branches: Array<{ id: number; branch_name: string; branch_code: string }>;
    productTypes: Array<{ id: number; name: string }>;
    onFilterChange: (key: keyof BatchExpirationFilters, value: unknown) => void;
    onResetFilters: () => void;
    onExport: () => void;
    totalCount: number;
}

const statusOptions: Array<{ value: ExpirationStatus | "ALL"; label: string }> = [
    { value: "ALL", label: "All Expiration Statuses" },
    { value: "EXPIRED", label: "Expired (< 0 Days)" },
    { value: "EXPIRING_TODAY", label: "Expiring Today (0 Days)" },
    { value: "CRITICAL", label: "Critical (1–30 Days)" },
    { value: "WARNING", label: "Warning (31–90 Days)" },
    { value: "UPCOMING", label: "Upcoming (91–180 Days)" },
    { value: "SAFE", label: "Safe (> 180 Days)" },
    { value: "NO_EXPIRY", label: "No Expiration Date" },
];

export default function ExpirationFilterBar({
    filters,
    branches,
    productTypes,
    onFilterChange,
    onResetFilters,
    onExport,
    totalCount,
}: ExpirationFilterBarProps) {
    const [branchOpen, setBranchOpen] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    const [categoryOpen, setCategoryOpen] = useState(false);

    const selectedBranchLabel =
        filters.branch_id === "ALL"
            ? "All Branches"
            : branches.find((b) => b.id === filters.branch_id)?.branch_name || `Branch ${filters.branch_id}`;

    const selectedStatusLabel =
        statusOptions.find((s) => s.value === filters.status)?.label || "All Statuses";

    const selectedCategoryLabel =
        filters.product_type === "ALL"
            ? "All Categories"
            : productTypes.find((p) => String(p.id) === filters.product_type || p.name === filters.product_type)?.name ||
              filters.product_type;

    return (
        <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                {/* Search Bar Input */}
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search item code, name, batch no., or location..."
                        value={filters.search}
                        onChange={(e) => onFilterChange("search", e.target.value)}
                        className="pl-9 text-xs h-9 bg-background"
                    />
                    {filters.search && (
                        <button
                            type="button"
                            onClick={() => onFilterChange("search", "")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                        >
                            ×
                        </button>
                    )}
                </div>

                {/* Combobox Dropdown Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Status Combobox */}
                    <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                size="sm"
                                className="h-9 justify-between text-xs bg-background min-w-[155px]"
                            >
                                <span className="truncate flex items-center gap-1.5">
                                    <Filter className="h-3 w-3 text-muted-foreground" />
                                    {selectedStatusLabel}
                                </span>
                                <ChevronsUpDown className="ml-1.5 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Filter status..." className="h-8 text-xs" />
                                <CommandList className="max-h-[220px]">
                                    <CommandEmpty>No status found.</CommandEmpty>
                                    <CommandGroup>
                                        {statusOptions.map((opt) => (
                                            <CommandItem
                                                key={opt.value}
                                                value={opt.label}
                                                onSelect={() => {
                                                    onFilterChange("status", opt.value);
                                                    setStatusOpen(false);
                                                }}
                                                className="text-xs cursor-pointer"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5 text-primary",
                                                        filters.status === opt.value
                                                            ? "opacity-100"
                                                            : "opacity-0"
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

                    {/* Branch Combobox */}
                    <Popover open={branchOpen} onOpenChange={setBranchOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                size="sm"
                                className="h-9 justify-between text-xs bg-background min-w-[140px]"
                            >
                                <span className="truncate">{selectedBranchLabel}</span>
                                <ChevronsUpDown className="ml-1.5 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[210px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search branch..." className="h-8 text-xs" />
                                <CommandList className="max-h-[220px]">
                                    <CommandEmpty>No branch found.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="All Branches"
                                            onSelect={() => {
                                                onFilterChange("branch_id", "ALL");
                                                setBranchOpen(false);
                                            }}
                                            className="text-xs cursor-pointer font-medium"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5 text-primary",
                                                    filters.branch_id === "ALL"
                                                        ? "opacity-100"
                                                        : "opacity-0"
                                                )}
                                            />
                                            All Branches
                                        </CommandItem>
                                        {branches.map((b) => (
                                            <CommandItem
                                                key={b.id}
                                                value={b.branch_name}
                                                onSelect={() => {
                                                    onFilterChange("branch_id", b.id);
                                                    setBranchOpen(false);
                                                }}
                                                className="text-xs cursor-pointer"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5 text-primary",
                                                        filters.branch_id === b.id
                                                            ? "opacity-100"
                                                            : "opacity-0"
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

                    {/* Category Combobox */}
                    <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                size="sm"
                                className="h-9 justify-between text-xs bg-background min-w-[140px]"
                            >
                                <span className="truncate">{selectedCategoryLabel}</span>
                                <ChevronsUpDown className="ml-1.5 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[210px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search category..." className="h-8 text-xs" />
                                <CommandList className="max-h-[220px]">
                                    <CommandEmpty>No category found.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="All Categories"
                                            onSelect={() => {
                                                onFilterChange("product_type", "ALL");
                                                setCategoryOpen(false);
                                            }}
                                            className="text-xs cursor-pointer font-medium"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5 text-primary",
                                                    filters.product_type === "ALL"
                                                        ? "opacity-100"
                                                        : "opacity-0"
                                                )}
                                            />
                                            All Categories
                                        </CommandItem>
                                        {productTypes.map((pt) => (
                                            <CommandItem
                                                key={pt.id}
                                                value={pt.name}
                                                onSelect={() => {
                                                    onFilterChange("product_type", String(pt.id));
                                                    setCategoryOpen(false);
                                                }}
                                                className="text-xs cursor-pointer"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5 text-primary",
                                                        filters.product_type === String(pt.id)
                                                            ? "opacity-100"
                                                            : "opacity-0"
                                                    )}
                                                />
                                                {pt.name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    {/* Reset Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onResetFilters}
                        title="Reset Filters"
                        className="h-9 text-xs px-2.5 text-muted-foreground hover:text-foreground"
                    >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reset
                    </Button>

                    {/* Excel Export Button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onExport}
                        className="h-9 text-xs bg-background font-semibold"
                    >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Export Excel ({totalCount})
                    </Button>
                </div>
            </div>

            {/* Bottom Row: On-Hand Toggle and Active Quick Filter Legend */}
            <div className="flex flex-wrap items-center justify-between border-t border-border/40 pt-2 text-xs">
                <div className="flex items-center gap-2">
                    <Switch
                        id="on-hand-toggle"
                        checked={filters.only_with_on_hand}
                        onCheckedChange={(val) => onFilterChange("only_with_on_hand", val)}
                    />
                    <Label
                        htmlFor="on-hand-toggle"
                        className="cursor-pointer text-xs font-medium text-foreground select-none"
                    >
                        Only show stock with remaining quantity (&gt; 0)
                    </Label>
                </div>

                <div className="text-[11px] text-muted-foreground">
                    Sorted by <span className="font-semibold text-foreground">FEFO</span> (First Expired, First Out)
                </div>
            </div>
        </div>
    );
}
