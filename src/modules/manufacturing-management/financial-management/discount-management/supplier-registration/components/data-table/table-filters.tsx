"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterX, RefreshCw, Search } from "lucide-react";

interface SupplierTableFiltersProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  searchPlaceholder?: string;
}

export function SupplierTableFilters({
  searchValue,
  onSearchChange,
  statusValue = "all",
  onStatusChange,
  onRefresh,
  isLoading = false,
  searchPlaceholder = "Search name or TIN...",
}: SupplierTableFiltersProps) {
  const isFiltered = !!searchValue || (statusValue && statusValue !== "all");

  const handleClear = () => {
    onSearchChange("");
    if (onStatusChange) {
      onStatusChange("all");
    }
  };

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          {/* Search bar */}
          <div className="relative w-full md:w-[280px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-10 text-sm bg-muted/30 focus-visible:ring-primary"
            />
          </div>

          {/* Status filter select on the right of search bar */}
          {onStatusChange && (
            <Select value={statusValue} onValueChange={onStatusChange}>
              <SelectTrigger className="w-full md:w-[160px] h-10 text-sm bg-muted/30 focus:ring-primary">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent side="bottom">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          )}

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground h-10 gap-2"
            >
              <FilterX className="h-4 w-4" /> Clear Filter
            </Button>
          )}
        </div>

        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-10 gap-2 font-medium"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
}

