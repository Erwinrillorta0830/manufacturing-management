// src/modules/manufacturing-management/financial-management/accounts-payable/components/APTable.tsx

import { useDeferredValue, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from '@/components/ui/pagination';
import { Search, Calendar, ChevronDown, ChevronsUpDown, ChevronUp, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatPeso, getPageNumbers } from '../utils';
import type { APRecord, APStatus } from '../types';

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  'Paid':                     { bg: 'rgba(16,185,129,0.1)',  color: '#059669', border: 'rgba(16,185,129,0.2)'  },
  'Unpaid':                   { bg: 'rgba(100,116,139,0.1)', color: '#64748b', border: 'rgba(100,116,139,0.2)' },
  'Partially Paid':           { bg: 'rgba(245,158,11,0.1)',  color: '#d97706', border: 'rgba(245,158,11,0.2)'  },
  'Overdue':                  { bg: 'rgba(220,38,38,0.1)',   color: '#b91c1c', border: 'rgba(220,38,38,0.2)'   },
  'Unpaid | Overdue':         { bg: 'rgba(239,68,68,0.1)',   color: '#dc2626', border: 'rgba(239,68,68,0.2)'   },
  'Partially Paid | Overdue': { bg: 'rgba(249,115,22,0.1)',  color: '#ea580c', border: 'rgba(249,115,22,0.2)'  },
};

function StatusPill({ status }: { status: APStatus }) {
  const style = STATUS_STYLES[status];
  if (!style) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-border bg-muted text-muted-foreground">
      {status}
    </span>
  );
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border"
      style={{ background: style.bg, color: style.color, borderColor: style.border }}
    >
      {status}
    </span>
  );
}

/**
 * Color for the aging day count.
 *
 * Only called when aging >= 0 (i.e. actually overdue).
 *   0 days  → amber  (due today — overdue but freshest)
 *   1–30    → default text color
 *   31–60   → amber
 *   61–90   → orange-red
 *   91+     → red
 */
function agingColor(aging: number): string | undefined {
  if (aging === 0)  return '#f59e0b';
  if (aging > 90)   return '#dc2626';
  if (aging > 60)   return '#ef4444';
  if (aging > 30)   return '#f59e0b';
  return undefined; // 1–30 days: inherit default text color
}

function SortableHeader<T>({
  label,
  sortKey,
  currentSortKey,
  currentSortOrder,
  onSort,
  className,
}: {
  label: string;
  sortKey: keyof T;
  currentSortKey: keyof T | null;
  currentSortOrder: 'asc' | 'desc' | null;
  onSort: (key: keyof T, order: 'asc' | 'desc' | null) => void;
  className?: string;
}) {
  const isSorted = currentSortKey === sortKey;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1.5 focus:outline-none hover:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground whitespace-nowrap",
          className
        )}
      >
        {label}
        {isSorted && currentSortOrder === "desc" ? (
          <ChevronDown />
        ) : isSorted && currentSortOrder === "asc" ? (
          <ChevronUp />
        ) : (
          <ChevronsUpDown />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-28">
        <DropdownMenuCheckboxItem
          checked={isSorted && currentSortOrder === "asc"}
          onClick={() => onSort(sortKey, "asc")}
        >
          <ChevronUp className="mr-2 h-4 w-4 text-muted-foreground" />
          Asc
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={isSorted && currentSortOrder === "desc"}
          onClick={() => onSort(sortKey, "desc")}
        >
          <ChevronDown className="mr-2 h-4 w-4 text-muted-foreground" />
          Desc
        </DropdownMenuCheckboxItem>
        {isSorted && (
          <DropdownMenuItem onClick={() => onSort(sortKey, null)}>
            <X className="mr-2 h-4 w-4 text-muted-foreground" />
            Reset
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface APTableProps {
  records: APRecord[];
  page:    number;
  setPage: (p: number | ((prev: number) => number)) => void;
}

export function APTable({ records, page, setPage }: APTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof APRecord | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const deferredSearch = useDeferredValue(search);

  const handleSort = (key: keyof APRecord, order: 'asc' | 'desc' | null) => {
    setSortKey(key);
    setSortOrder(order);
  };

  const q = deferredSearch.trim().toLowerCase();
  const filtered = useMemo(() => q
    ? records.filter((r) =>
        r.refNo.toLowerCase().includes(q)              ||
        r.invoiceNo.toLowerCase().includes(q)          ||
        r.supplier.toLowerCase().includes(q)           ||
        r.status.toLowerCase().includes(q)             ||
        r.amountPayable.toString().includes(q)         ||
        r.outstandingBalance.toString().includes(q)
      )
    : records, [q, records]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortOrder) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const compare = aVal.localeCompare(bVal);
        return sortOrder === 'asc' ? compare : -compare;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  }, [filtered, sortKey, sortOrder]);

  const totalPages  = Math.ceil(sorted.length / PAGE_SIZE);
  const safePage    = Math.min(page, totalPages || 1);
  const paged       = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  return (
    <Card className="shadow-none border-border overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border/50 flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm font-bold uppercase shrink-0">AP Records</CardTitle>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search ref, supplier, remarks…"
            className="h-8 pl-8 text-xs focus-visible:ring-1"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} — page {safePage} of {totalPages || 1}
        </span>
      </CardHeader>

      <CardContent className="p-0">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-2 pl-4 w-[8%] whitespace-nowrap"><SortableHeader<APRecord> label="Ref. No." sortKey="refNo" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
              <TableHead className="py-2 w-[9%] whitespace-nowrap"><SortableHeader<APRecord> label="Invoice No." sortKey="invoiceNo" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
              <TableHead className="py-2 w-[15%] whitespace-nowrap"><SortableHeader<APRecord> label="Payee" sortKey="supplier" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
              <TableHead className="py-2 w-[10%] whitespace-nowrap"><SortableHeader<APRecord> label="Division" sortKey="division" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
              <TableHead className="py-2 w-[8%] whitespace-nowrap"><SortableHeader<APRecord> label="Invoice Date" sortKey="invoiceDate" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
              <TableHead className="py-2 w-[8%] whitespace-nowrap"><SortableHeader<APRecord> label="Due Date" sortKey="dueDate" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
              <TableHead className="py-2 w-[10%] whitespace-nowrap text-right"><SortableHeader<APRecord> label="Amount Payable" sortKey="amountPayable" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold justify-end w-full" /></TableHead>
              <TableHead className="py-2 w-[9%] whitespace-nowrap text-right"><SortableHeader<APRecord> label="Amount Paid" sortKey="amountPaid" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold justify-end w-full" /></TableHead>
              <TableHead className="py-2 w-[10%] whitespace-nowrap text-right"><SortableHeader<APRecord> label="Outstanding" sortKey="outstandingBalance" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold justify-end w-full" /></TableHead>
              <TableHead className="py-2 w-[5%] whitespace-nowrap text-right"><SortableHeader<APRecord> label="Aging" sortKey="aging" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold justify-end w-full" /></TableHead>
              <TableHead className="py-2 pr-4 w-[11%] whitespace-nowrap"><SortableHeader<APRecord> label="Status" sortKey="status" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10 text-muted-foreground text-sm">
                  {q ? `No results for "${search}".` : 'No records found.'}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r, i) => (
                <TableRow key={`${r.id}-${i}`} className="border-border/40 hover:bg-muted/20">

                  <TableCell className="font-bold text-primary text-[11px] py-2 pl-4 whitespace-nowrap truncate">
                    <span className="block truncate w-full">{r.refNo}</span>
                  </TableCell>

                  <TableCell className="text-[11px] text-muted-foreground py-2 whitespace-nowrap truncate">
                    <span className="block truncate w-full">
                      {r.invoiceNo && r.invoiceNo !== '—'
                        ? r.invoiceNo
                        : <span className="text-muted-foreground/40">—</span>}
                    </span>
                  </TableCell>

                  <TableCell className="text-[11px] font-medium py-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block truncate cursor-default w-full">{r.supplier}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right"><p>{r.supplier}</p></TooltipContent>
                    </Tooltip>
                  </TableCell>

                  <TableCell className="text-[11px] text-muted-foreground py-2">
                    <span className="block truncate cursor-default w-full" title={r.division}>
                      {r.division && r.division !== '—'
                        ? r.division
                        : <span className="text-muted-foreground/40">—</span>}
                    </span>
                  </TableCell>

                  <TableCell className="text-[11px] text-muted-foreground py-2 whitespace-nowrap truncate">
                    <div className="flex items-center gap-1 w-full truncate">
                      <Calendar size={11} className="shrink-0" />
                      <span className="truncate">{r.invoiceDate ? r.invoiceDate.split(' ')[0] : '—'}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-[11px] text-muted-foreground py-2 whitespace-nowrap truncate">
                    <div className="flex items-center gap-1 w-full truncate">
                      <Calendar size={11} className="shrink-0" />
                      <span className="truncate">{r.dueDate ? r.dueDate.split(' ')[0] : '—'}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-[11px] py-2 text-right whitespace-nowrap truncate">
                    <span className="block truncate w-full">{formatPeso(r.amountPayable)}</span>
                  </TableCell>

                  <TableCell className="text-[11px] py-2 text-right whitespace-nowrap truncate">
                    <span className="block truncate w-full">{formatPeso(r.amountPaid)}</span>
                  </TableCell>

                  <TableCell className="text-[11px] font-bold text-primary py-2 text-right whitespace-nowrap truncate">
                    <span className="block truncate w-full">{formatPeso(r.outstandingBalance)}</span>
                  </TableCell>

                  {/*
                    Aging column display rules:
                    - null         → no due date at all → show dash
                    - negative     → due in the future → show dash (not yet overdue)
                    - 0            → due today → show "0" in amber
                    - positive     → N days past due → show N with escalating color
                  */}
                  <TableCell className="text-[11px] py-2 text-right whitespace-nowrap truncate">
                    <span className="block truncate w-full">
                      {r.aging !== null && r.aging >= 0 ? (
                        <span
                          className={r.aging > 30 ? 'font-semibold' : ''}
                          style={{ color: agingColor(r.aging) }}
                        >
                          {r.aging}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </span>
                  </TableCell>

                  <TableCell className="py-2 pr-4 whitespace-nowrap">
                    <StatusPill status={r.status} />
                  </TableCell>

                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="py-4 border-t border-border/50">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                    aria-disabled={safePage === 1}
                    className={safePage === 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
                {pageNumbers.map((num, idx) =>
                  num === 'ellipsis' ? (
                    <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                  ) : (
                    <PaginationItem key={num}>
                      <PaginationLink
                        href="#"
                        isActive={safePage === num}
                        onClick={(e) => { e.preventDefault(); setPage(num); }}
                      >
                        {num}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                    aria-disabled={safePage === totalPages}
                    className={safePage === totalPages ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
