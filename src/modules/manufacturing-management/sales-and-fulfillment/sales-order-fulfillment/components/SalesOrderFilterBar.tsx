import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Search, X, Check, ChevronsUpDown, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Branch } from "../types";

interface SalesOrderFilterBarProps {
    searchQuery: string;
    onSearchChange: (val: string) => void;
    branches: Branch[];
    selectedBranchId: number | null;
    onBranchChange: (id: number | null) => void;
    isLoadingBranches: boolean;
    totalOrders: number;
}

export const SalesOrderFilterBar: React.FC<SalesOrderFilterBarProps> = ({
    searchQuery,
    onSearchChange,
    branches,
    selectedBranchId,
    onBranchChange,
    isLoadingBranches,
    totalOrders,
}) => {
    const [isBranchOpen, setIsBranchOpen] = useState(false);

    const selectedBranch = branches.find((b) => b.id === selectedBranchId);

    const handleClearSearch = () => {
        onSearchChange("");
    };

    const handleClearAll = () => {
        onSearchChange("");
        onBranchChange(null);
    };

    const hasActiveFilters = Boolean(searchQuery.trim() || selectedBranchId !== null);

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.05, ease: "easeOut" }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/60 backdrop-blur-sm p-3 rounded-xl border shadow-sm"
        >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[240px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        type="text"
                        placeholder="Search order #, customer..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 pr-8 h-9 text-sm"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* Branch Combobox (Popover + Command) */}
                <Popover open={isBranchOpen} onOpenChange={setIsBranchOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isBranchOpen}
                            className="h-9 min-w-[190px] justify-between text-sm font-normal border-input"
                            disabled={isLoadingBranches}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">
                                    {isLoadingBranches
                                        ? "Loading branches..."
                                        : selectedBranch
                                        ? selectedBranch.branch_name
                                        : "All Branches"}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[240px] p-0 shadow-md" align="start">
                        <Command>
                            <CommandInput placeholder="Search branch name..." className="h-9 text-sm" />
                            <CommandList>
                                <CommandEmpty>No branch found.</CommandEmpty>
                                <CommandGroup heading="Branch Filter">
                                    <CommandItem
                                        value="all-branches"
                                        onSelect={() => {
                                            onBranchChange(null);
                                            setIsBranchOpen(false);
                                        }}
                                        className="cursor-pointer text-sm"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedBranchId === null ? "opacity-100 text-primary" : "opacity-0"
                                            )}
                                        />
                                        <span className="font-medium">All Branches</span>
                                    </CommandItem>
                                    {branches.map((b) => (
                                        <CommandItem
                                            key={b.id}
                                            value={`${b.branch_name} ${b.branch_code || ""}`}
                                            onSelect={() => {
                                                onBranchChange(b.id);
                                                setIsBranchOpen(false);
                                            }}
                                            className="cursor-pointer text-sm"
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    selectedBranchId === b.id ? "opacity-100 text-primary" : "opacity-0"
                                                )}
                                            />
                                            <span className="truncate">{b.branch_name}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* Reset Filters CTA */}
                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        className="h-9 text-xs text-muted-foreground hover:text-foreground px-2.5"
                    >
                        Reset filters
                    </Button>
                )}
            </div>

            {/* Total Results Count */}
            <div className="text-xs text-muted-foreground whitespace-nowrap self-end sm:self-auto px-1 font-medium">
                Total: <strong className="text-foreground">{totalOrders.toLocaleString()}</strong>
            </div>
        </motion.div>
    );
};
