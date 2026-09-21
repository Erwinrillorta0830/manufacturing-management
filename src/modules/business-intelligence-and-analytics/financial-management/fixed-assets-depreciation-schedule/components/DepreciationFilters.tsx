"use client";

import React, { useState } from "react";
import {
    Calendar,
    Search,
    RotateCcw,
    RefreshCw,
    Building2,
    SlidersHorizontal,
    Check,
    ChevronsUpDown,
    Tag,
    Calculator,
    Activity,
    CheckCircle2,
    Clock,
    AlertTriangle,
    AlertCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    DepreciationFiltersState,
    DepartmentOption,
    AssetType,
    DepreciationMethod,
    PeriodPreset,
    AssetReportingStatus
} from "../types";

interface DepreciationFiltersProps {
    filters: DepreciationFiltersState;
    departments: DepartmentOption[];
    onFilterChange: <K extends keyof DepreciationFiltersState>(key: K, value: DepreciationFiltersState[K]) => void;
    onResetFilters: () => void;
    onRefresh: () => void;
    isRefreshing: boolean;
}

export default function DepreciationFilters({
    filters,
    departments,
    onFilterChange,
    onResetFilters,
    onRefresh,
    isRefreshing
}: DepreciationFiltersProps) {
    const [openDeptCombobox, setOpenDeptCombobox] = useState(false);
    const [openMethodCombobox, setOpenMethodCombobox] = useState(false);
    const [openTypeCombobox, setOpenTypeCombobox] = useState(false);
    const [openStatusCombobox, setOpenStatusCombobox] = useState(false);

    const selectedDept = departments.find(
        (d) => String(d.department_id) === filters.departmentId
    );

    const assetTypes: { label: string; value: "ALL" | AssetType }[] = [
        { label: "All Asset Types", value: "ALL" },
        { label: "Administrative", value: "Administrative" },
        { label: "Production", value: "Production" }
    ];

    const deprMethods: { label: string; value: "ALL" | DepreciationMethod }[] = [
        { label: "All Depreciation Methods", value: "ALL" },
        { label: "Straight Line", value: "Straight Line" },
        { label: "Units of Production", value: "Units of Production" }
    ];

    const lifecycleStates: { label: string; value: "ALL" | AssetReportingStatus; dotColor: string }[] = [
        { label: "All Lifecycle States", value: "ALL", dotColor: "bg-muted-foreground" },
        { label: "Active", value: "Active", dotColor: "bg-emerald-500" },
        { label: "Fully Depreciated", value: "Fully Depreciated", dotColor: "bg-blue-500" },
        { label: "Under Maintenance", value: "Under Maintenance", dotColor: "bg-amber-500" },
        { label: "Discontinued", value: "Discontinued", dotColor: "bg-slate-500" },
        { label: "Bad", value: "Bad", dotColor: "bg-rose-500" }
    ];

    const presets: { label: string; value: PeriodPreset }[] = [
        { label: "FY 2026 YTD (Jan 1 – Cutoff)", value: "fy_ytd" },
        { label: "Current Month", value: "current_month" },
        { label: "Current Quarter", value: "current_quarter" },
        { label: "Full Fiscal Year", value: "current_year" },
        { label: "Prior Year", value: "prior_year" },
        { label: "Custom Range", value: "custom" }
    ];

    const selectedStatusLabel =
        lifecycleStates.find((s) => s.value === filters.statusFilter)?.label || "All Lifecycle States";

    return (
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs space-y-3.5">
            {/* Row 1: Primary Date Controls & Search */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
                {/* 1. As-of Date (Cutoff) */}
                <div className="lg:col-span-3 space-y-1.5">
                    <Label htmlFor="as-of-date" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>As-of Date (Cutoff)</span>
                    </Label>
                    <Input
                        id="as-of-date"
                        type="date"
                        value={filters.asOfDate}
                        onChange={(e) => onFilterChange("asOfDate", e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="h-9 text-xs font-mono bg-background shadow-2xs"
                    />
                </div>

                {/* 2. Reporting Period Preset */}
                <div className="lg:col-span-3 space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                        <span>Period Preset</span>
                    </Label>
                    <Select
                        value={filters.periodPreset}
                        onValueChange={(val: PeriodPreset) => onFilterChange("periodPreset", val)}
                    >
                        <SelectTrigger className="h-9 text-xs bg-background shadow-2xs">
                            <SelectValue placeholder="Select preset" />
                        </SelectTrigger>
                        <SelectContent>
                            {presets.map((p) => (
                                <SelectItem key={p.value} value={p.value} className="text-xs">
                                    {p.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* 3. Search Assets */}
                <div className="lg:col-span-6 space-y-1.5">
                    <Label htmlFor="search-assets" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Search className="h-3.5 w-3.5 text-primary" />
                        <span>Search Assets</span>
                    </Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            id="search-assets"
                            type="text"
                            placeholder="Filter by item description, serial, barcode, or department..."
                            value={filters.searchQuery}
                            onChange={(e) => onFilterChange("searchQuery", e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                            className="h-9 pl-8 text-xs bg-background shadow-2xs"
                        />
                        {filters.searchQuery && (
                            <button
                                type="button"
                                onClick={() => onFilterChange("searchQuery", "")}
                                className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 2: Categorical Dropdowns & Action Buttons */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-end pt-0.5">
                {/* 4. Department Combobox (Popover + Command) */}
                <div className="lg:col-span-3 space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Department</span>
                    </Label>
                    <Popover open={openDeptCombobox} onOpenChange={setOpenDeptCombobox}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openDeptCombobox}
                                className="h-9 w-full justify-between bg-background text-xs font-normal shadow-2xs"
                            >
                                <span className="truncate">
                                    {filters.departmentId === "ALL"
                                        ? "All Departments"
                                        : selectedDept?.department_name || `Dept #${filters.departmentId}`}
                                </span>
                                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search department..." className="h-8 text-xs" />
                                <CommandList>
                                    <CommandEmpty>No department found.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="all-departments"
                                            onSelect={() => {
                                                onFilterChange("departmentId", "ALL");
                                                setOpenDeptCombobox(false);
                                            }}
                                            className="text-xs"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5",
                                                    filters.departmentId === "ALL" ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            All Departments
                                        </CommandItem>
                                        {departments.map((dept) => (
                                            <CommandItem
                                                key={dept.department_id}
                                                value={`${dept.department_name} ${dept.department_id}`}
                                                onSelect={() => {
                                                    onFilterChange("departmentId", String(dept.department_id));
                                                    setOpenDeptCombobox(false);
                                                }}
                                                className="text-xs"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5",
                                                        filters.departmentId === String(dept.department_id)
                                                            ? "opacity-100"
                                                            : "opacity-0"
                                                    )}
                                                />
                                                {dept.department_name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 5. Asset Type Combobox */}
                <div className="lg:col-span-2 space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Asset Type</span>
                    </Label>
                    <Popover open={openTypeCombobox} onOpenChange={setOpenTypeCombobox}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openTypeCombobox}
                                className="h-9 w-full justify-between bg-background text-xs font-normal shadow-2xs"
                            >
                                <span className="truncate">
                                    {filters.assetType === "ALL" ? "All Types" : filters.assetType}
                                </span>
                                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0" align="start">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        {assetTypes.map((type) => (
                                            <CommandItem
                                                key={type.value}
                                                value={type.label}
                                                onSelect={() => {
                                                    onFilterChange("assetType", type.value);
                                                    setOpenTypeCombobox(false);
                                                }}
                                                className="text-xs"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5",
                                                        filters.assetType === type.value ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {type.label}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 6. Depreciation Method Combobox */}
                <div className="lg:col-span-2 space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Method</span>
                    </Label>
                    <Popover open={openMethodCombobox} onOpenChange={setOpenMethodCombobox}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openMethodCombobox}
                                className="h-9 w-full justify-between bg-background text-xs font-normal shadow-2xs"
                            >
                                <span className="truncate">
                                    {filters.depreciationMethod === "ALL"
                                        ? "All Methods"
                                        : filters.depreciationMethod === "Straight Line"
                                        ? "Straight Line"
                                        : "UOP"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0" align="start">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        {deprMethods.map((m) => (
                                            <CommandItem
                                                key={m.value}
                                                value={m.label}
                                                onSelect={() => {
                                                    onFilterChange("depreciationMethod", m.value);
                                                    setOpenMethodCombobox(false);
                                                }}
                                                className="text-xs"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5",
                                                        filters.depreciationMethod === m.value
                                                            ? "opacity-100"
                                                            : "opacity-0"
                                                    )}
                                                />
                                                {m.label}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 7. Lifecycle State Dropdown (Revision 5) */}
                <div className="lg:col-span-3 space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Lifecycle State</span>
                    </Label>
                    <Popover open={openStatusCombobox} onOpenChange={setOpenStatusCombobox}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openStatusCombobox}
                                className="h-9 w-full justify-between bg-background text-xs font-normal shadow-2xs"
                            >
                                <div className="flex items-center gap-2 truncate">
                                    <span
                                        className={cn(
                                            "h-2 w-2 rounded-full shrink-0",
                                            lifecycleStates.find((s) => s.value === filters.statusFilter)?.dotColor ||
                                                "bg-muted-foreground"
                                        )}
                                    />
                                    <span className="truncate">{selectedStatusLabel}</span>
                                </div>
                                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[240px] p-0" align="start">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        {lifecycleStates.map((st) => (
                                            <CommandItem
                                                key={st.value}
                                                value={st.label}
                                                onSelect={() => {
                                                    onFilterChange("statusFilter", st.value);
                                                    setOpenStatusCombobox(false);
                                                }}
                                                className="text-xs"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-3.5 w-3.5",
                                                        filters.statusFilter === st.value ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <span className={cn("mr-2 h-2 w-2 rounded-full", st.dotColor)} />
                                                <span>{st.label}</span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 8. Action Buttons (Reset & Recalculate) */}
                <div className="lg:col-span-2 flex items-center justify-end gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onResetFilters}
                        className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Reset
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className="h-9 px-3 text-xs shadow-xs"
                    >
                        <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                        Recalculate
                    </Button>
                </div>
            </div>
        </div>
    );
}
