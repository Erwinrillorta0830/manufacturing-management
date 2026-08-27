// src/modules/financial-management/accounting/supplier-debit-memo/components/MemoFilters.tsx

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X, Plus } from "lucide-react";
import { useState } from "react";
import type { MemoFilters as FiltersType } from "../types";
import { MEMO_STATUSES } from "../utils";

interface MemoFiltersProps {
  filters:    FiltersType;
  suppliers:  { id: number; supplier_name: string }[];
  accounts:   { coa_id: number; account_title: string | null; id?: number }[];
  hasFilters: boolean;
  onChange:   <K extends keyof FiltersType>(key: K, value: FiltersType[K]) => void;
  onClear:    () => void;
  onAddNew:   () => void;
}

export function MemoFiltersBar({
  filters, suppliers, accounts, hasFilters, onChange, onClear, onAddNew,
}: MemoFiltersProps) {
  const [supplierSearch, setSupplierSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");

  const filteredSuppliers = suppliers.filter(s => 
    s.supplier_name?.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredAccounts = accounts.filter(a =>
    (a.account_title?.toLowerCase().includes(accountSearch.toLowerCase()) ?? false)
  );

  return (
    <div className="flex items-center justify-between gap-2 w-full flex-wrap">

      {/* Left side — filters */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Date Range — From */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 h-9">
          <span className="text-xs font-medium text-muted-foreground shrink-0">From</span>
          <Input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => onChange('date_from', e.target.value)}
            className="h-auto border-0 p-0 text-xs focus-visible:ring-0 shadow-none w-[110px] bg-transparent"
          />
        </div>

        {/* Date Range — To */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 h-9">
          <span className="text-xs font-medium text-muted-foreground shrink-0">To</span>
          <Input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => onChange('date_to', e.target.value)}
            className="h-auto border-0 p-0 text-xs focus-visible:ring-0 shadow-none w-[110px] bg-transparent"
          />
        </div>

        {/* Supplier with search */}
<Select
  key={`supplier-${filters.supplier_id}`}
  value={filters.supplier_id || ""}
  onValueChange={val => onChange("supplier_id", val === 'all' ? '' : val)}
>
  <SelectTrigger className="h-9 w-[180px] text-xs">
    <SelectValue placeholder="All Suppliers" />
  </SelectTrigger>
  <SelectContent
    className="max-h-60 z-50"
    position="popper"
    side="bottom"
    avoidCollisions={false}
    onCloseAutoFocus={(e) => e.preventDefault()}
  >
    <div
      className="px-2 py-1.5 sticky top-0 z-10 bg-background border-b"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <Input
        placeholder="Search supplier…"
        className="h-7 text-xs"
        value={supplierSearch}
        onChange={(e) => setSupplierSearch(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        autoFocus
      />
    </div>
    <SelectItem key="all" value="all" className="text-xs">All Suppliers</SelectItem>
    {filteredSuppliers.filter(s => s.supplier_name?.trim()).map(s => (
      <SelectItem key={s.id} value={String(s.id)} className="text-xs">
        {s.supplier_name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>

{/* Chart of Account with search */}
<Select
  key={`account-${filters.chart_of_account}`}
  value={filters.chart_of_account || ""}
  onValueChange={val => onChange("chart_of_account", val === 'all' ? '' : val)}
>
  <SelectTrigger className="h-9 w-[180px] text-xs">
    <SelectValue placeholder="All Accounts" />
  </SelectTrigger>
  <SelectContent
    className="max-h-60 z-50"
    position="popper"
    side="bottom"
    avoidCollisions={false}
    onCloseAutoFocus={(e) => e.preventDefault()}
  >
    <div
      className="px-2 py-1.5 sticky top-0 z-10 bg-background border-b"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <Input
        placeholder="Search account…"
        className="h-7 text-xs"
        value={accountSearch}
        onChange={(e) => setAccountSearch(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        autoFocus
      />
    </div>
    <SelectItem key="all" value="all" className="text-xs">All Accounts</SelectItem>
    {filteredAccounts.map(a => {
      const id = ('id' in a && typeof (a as { id?: number }).id === 'number') ? (a as { id: number }).id : a.coa_id;
      return (
        <SelectItem key={id} value={String(id)} className="text-xs">
          {a.account_title ?? String(id)}
        </SelectItem>
      );
    })}
  </SelectContent>
</Select>

        {/* Status */}
        <Select
          key={`status-${filters.status}`}
          value={filters.status || ""}
          onValueChange={val => onChange("status", val === 'all' ? '' : val)}
        >
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem key="all" value="all" className="text-xs">All Statuses</SelectItem>
            {MEMO_STATUSES.map(s => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Right side — always pinned to the right */}
      <Button
        size="sm"
        onClick={onAddNew}
        className="h-9 px-3 text-xs gap-1.5 shrink-0"
      >
        <Plus className="h-3.5 w-3.5" />
        New Debit Memo
      </Button>
    </div>
  );
}