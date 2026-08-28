"use client";

import React from "react";
import { useStockAdjustmentSummary } from "../hooks/useStockAdjustmentSummary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FilterToolbar() {
  const {
    search,
    setSearch,
    branchId,
    setBranchId,
    supplierId,
    setSupplierId,
    type,
    setType,
    status,
    setStatus,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    resetFilters,
    branches,
    suppliers
  } = useStockAdjustmentSummary();

  // Transform branches for searchable dropdown with unique IDs and distinct labels
  const branchOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];

    branches.forEach((b) => {
      const val = String(b.id);
      if (!val || seen.has(val)) return;
      seen.add(val);

      const codeStr = b.branch_code ? ` • ${b.branch_code}` : "";
      opts.push({
        value: val,
        label: `${b.branch_name}${codeStr} (ID: ${b.id})`
      });
    });

    return [{ value: "all", label: "All Branches" }, ...opts];
  }, [branches]);

  // Transform suppliers for searchable dropdown with unique IDs and distinct labels
  const supplierOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];

    suppliers.forEach((s) => {
      const val = String(s.id);
      if (!val || seen.has(val)) return;
      seen.add(val);

      const codeStr = s.supplier_shortcut ? ` • ${s.supplier_shortcut}` : "";
      opts.push({
        value: val,
        label: `${s.supplier_name}${codeStr} (ID: ${s.id})`
      });
    });

    return [{ value: "all", label: "All Suppliers" }, ...opts];
  }, [suppliers]);

  const currentBranchValue = branchId ? String(branchId) : "all";
  const currentSupplierValue = supplierId ? String(supplierId) : "all";

  return (
    <Card className="border border-border/40 shadow-sm bg-card/65 backdrop-blur-sm rounded-xl">
      <CardContent className="p-4 flex flex-wrap items-end gap-4">
        
        {/* Search */}
        <div className="flex flex-col gap-1 w-64">
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider pl-1">Search Details</span>
          <Input
            placeholder="Search by doc number..."
            className="h-9 text-xs border-border bg-background rounded-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Branch Dropdown (Searchable) */}
        <div className="flex flex-col gap-1 w-56 min-w-0">
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider pl-1">Branch</span>
          <SearchableSelect
            options={branchOptions}
            value={currentBranchValue}
            placeholder="Select Branch"
            className="h-9 text-xs font-semibold rounded-lg bg-background border-border text-foreground/80 text-left justify-between overflow-hidden truncate [&>svg]:shrink-0"
            onValueChange={(val) => {
              setBranchId(val === "all" ? undefined : Number(val));
            }}
          />
        </div>

        {/* Supplier Dropdown (Searchable) */}
        <div className="flex flex-col gap-1 w-56 min-w-0">
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider pl-1">Supplier</span>
          <SearchableSelect
            options={supplierOptions}
            value={currentSupplierValue}
            placeholder="Select Supplier"
            className="h-9 text-xs font-semibold rounded-lg bg-background border-border text-foreground/80 text-left justify-between overflow-hidden truncate [&>svg]:shrink-0"
            onValueChange={(val) => {
              setSupplierId(val === "all" ? undefined : Number(val));
            }}
          />
        </div>

        {/* Type Dropdown (Shadcn Select) */}
        <div className="flex flex-col gap-1 w-44">
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider pl-1">Type</span>
          <Select
            value={type || "all"}
            onValueChange={(val) => setType(val === "all" ? undefined : (val as "IN" | "OUT"))}
          >
            <SelectTrigger className="h-9 w-full text-xs font-semibold rounded-lg bg-background border-border text-foreground/80">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="IN">Stock In (+)</SelectItem>
              <SelectItem value="OUT">Stock Out (-)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Dropdown (Shadcn Select) */}
        <div className="flex flex-col gap-1 w-44">
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider pl-1">Status</span>
          <Select
            value={status || "all"}
            onValueChange={(val) => setStatus(val === "all" ? undefined : (val as "Posted" | "Unposted"))}
          >
            <SelectTrigger className="h-9 w-full text-xs font-semibold rounded-lg bg-background border-border text-foreground/80">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Posted">Posted</SelectItem>
              <SelectItem value="Unposted">Unposted (Draft)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* From Date Filter */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider pl-1">From Date</span>
          <input
            type="date"
            className="h-9 px-3 border border-border bg-background rounded-lg text-xs font-semibold text-foreground/80 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            value={fromDate || ""}
            onChange={(e) => setFromDate(e.target.value || undefined)}
          />
        </div>

        {/* To Date Filter */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider pl-1">To Date</span>
          <input
            type="date"
            className="h-9 px-3 border border-border bg-background rounded-lg text-xs font-semibold text-foreground/80 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            value={toDate || ""}
            onChange={(e) => setToDate(e.target.value || undefined)}
          />
        </div>

        <Button
          variant="ghost"
          onClick={resetFilters}
          className="h-9 px-4 text-xs font-semibold hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg"
        >
          Reset
        </Button>
      </CardContent>
    </Card>
  );
}
