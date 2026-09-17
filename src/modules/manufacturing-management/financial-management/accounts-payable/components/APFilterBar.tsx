"use client";

// components/APFilterBar.tsx — Polished date / supplier / status filter row.

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { X, SlidersHorizontal } from 'lucide-react';
import type { APStatus } from '../types';

interface APFilterBarProps {
  dateFrom:        string; setDateFrom: (v: string) => void;
  dateTo:          string; setDateTo:   (v: string) => void;
  supplier:        string; setSupplier: (v: string) => void;
  status:          string; setStatus:   (v: string) => void;
  supplierOptions: string[];
  isFiltered:      boolean;
  clearFilters:    () => void;
  setPage:         (p: number | ((prev: number) => number)) => void;
  STATUS_OPTIONS:  APStatus[];
}

export function APFilterBar({
  dateFrom, setDateFrom, dateTo, setDateTo,
  supplier, setSupplier, status, setStatus,
  supplierOptions, isFiltered, clearFilters, setPage,
  STATUS_OPTIONS,
}: APFilterBarProps) {
  const supplierSelectOptions = useMemo(() => [
    { value: '', label: 'All Suppliers' },
    ...supplierOptions.map((name) => ({ value: name, label: name })),
  ], [supplierOptions]);

  return (
    <div className="flex flex-wrap items-center gap-2 w-full min-w-0 rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-1.5 pr-2 border-r border-border/60 text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="text-[10px] font-black uppercase tracking-widest">Filters</span>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 h-8">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">From</span>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-auto border-0 p-0 text-xs focus-visible:ring-0 shadow-none w-[110px] bg-transparent"
        />
      </div>

      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 h-8">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">To</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-auto border-0 p-0 text-xs focus-visible:ring-0 shadow-none w-[110px] bg-transparent"
        />
      </div>

      <SearchableSelect
        value={supplier}
        onValueChange={(val) => { setSupplier(val); setPage(1); }}
        placeholder="All Suppliers"
        className="h-8 w-[200px] text-xs !block text-left truncate relative pr-8 [&_svg]:absolute [&_svg]:right-3 [&_svg]:top-1/2 [&_svg]:-translate-y-1/2"
        options={supplierSelectOptions}
      />

      <Select
        value={status || '__all__'}
        onValueChange={(val) => { setStatus(val === '__all__' ? '' : val); setPage(1); }}
      >
        <SelectTrigger className="h-8 w-[170px] text-xs">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs text-muted-foreground">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
