/* eslint-disable react-hooks/incompatible-library */
// src/modules/manufacturing-management/financial-management/accounts-receivable/components/InvoiceTable.tsx

import React, { useMemo, useState, Fragment, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis,
} from '@/components/ui/pagination';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronUp, ChevronRight, ChevronsUpDown, LayoutGrid, Table2, X } from 'lucide-react';
import { cn } from "@/lib/utils";
import { formatPeso, formatDate, getPageNumbers, mapARRowToInvoice, sortCustomerGroups } from '../utils';
import type { Invoice, CustomerGroup } from '../types';

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  'Paid': { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
  'Overdue': { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
  'Partially Paid': { bg: 'rgba(245,158,11,0.1)', color: '#d97706' },
  'Unpaid': { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
  'Due': { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
  'Dispatch': { bg: 'rgba(99,102,241,0.1)', color: '#4f46e5' }, // Indigo
  'Delivered': { bg: 'rgba(14,165,233,0.1)', color: '#0284c7' }, // Sky
  'Transmitted': { bg: 'rgba(168,85,247,0.1)', color: '#9333ea' }, // Purple
  'Countered': { bg: 'rgba(234,179,8,0.1)', color: '#ca8a04' }, // Amber
  'Collected': { bg: 'rgba(16,185,129,0.1)', color: '#059669' }, // Emerald
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: 'rgba(100,116,139,0.1)', color: '#64748b' };
  const showDot = ['Paid', 'Fully Paid', 'Overdue', 'Due', 'Unpaid', 'Partially Paid'].includes(status);
  const dotColors: Record<string, string> = {
    'Paid': 'bg-emerald-500',
    'Fully Paid': 'bg-emerald-500',
    'Overdue': 'bg-rose-500 animate-pulse',
    'Due': 'bg-blue-500',
    'Unpaid': 'bg-slate-400',
    'Partially Paid': 'bg-amber-500 animate-pulse',
  };

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-current/10 whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {showDot && (
        <span className={`w-1 h-1 rounded-full ${dotColors[status] || 'bg-slate-400'}`} />
      )}
      {status}
    </span>
  );
}

/**
 * Color for the aging day count.
 *
 * Only called when aging >= 0 (i.e. actually overdue).
 *   0 days  → amber  (due today — overdue but freshest)
 *   1–30    → slate  (default muted)
 *   31–60   → amber
 *   61–90   → orange-red
 *   91+     → red
 */
function agingColor(aging: number): string {
  if (aging === 0) return '#f59e0b';
  if (aging > 90) return '#dc2626';
  if (aging > 60) return '#ef4444';
  if (aging > 30) return '#f59e0b';
  return '#64748b'; // 1–30 days: slate
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
          "flex min-w-0 items-center gap-1.5 focus:outline-none hover:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground whitespace-nowrap",
          className
        )}
      >
        <span className="min-w-0 whitespace-nowrap leading-tight">{label}</span>
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

interface InvoiceTableProps {
  invoices?: Invoice[];
  customerGroups?: CustomerGroup[];
  serverMode?: boolean;
  page: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  totalPages?: number;
  totalInvoiceCount?: number;
  totalGroupCount?: number;
  tableLoading?: boolean;
  truncated?: boolean;
  sortKey?: keyof Invoice | null;
  sortOrder?: 'asc' | 'desc' | null;
  onSortChange?: (key: keyof Invoice | null, order: 'asc' | 'desc' | null) => void;
  onRowClick?: (invoice: Invoice) => void;
}

const VIRTUALIZE_THRESHOLD = 15;
const INVOICE_ROW_HEIGHT = 44;
const MAX_VIRTUAL_LIST_HEIGHT = 320;

const INVOICE_TABLE_COL_WIDTHS = [
  { width: '8%', minWidth: 120 },
  { width: '12%', minWidth: 150 },
  { width: '7%', minWidth: 100 },
  { width: '6%', minWidth: 90 },
  { width: '5%', minWidth: 75 },
  { width: '6%', minWidth: 90 },
  { width: '6%', minWidth: 90 },
  { width: '6%', minWidth: 90 },
  { width: '8%', minWidth: 115 },
  { width: '7%', minWidth: 95 },
  { width: '8%', minWidth: 115 },
  { width: '6%', minWidth: 90 },
  { width: '7%', minWidth: 100 },
  { width: '8%', minWidth: 130 },
] as const;

function InvoiceTableColGroup() {
  return (
    <colgroup>
      {INVOICE_TABLE_COL_WIDTHS.map((column, i) => (
        <col key={i} style={{ width: column.width, minWidth: column.minWidth }} />
      ))}
    </colgroup>
  );
}

function VirtualInvoiceRows({
  invoices,
  onRowClick,
}: {
  invoices: Invoice[];
  onRowClick?: (invoice: Invoice) => void;
}) {
  "use no memo";

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: invoices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => INVOICE_ROW_HEIGHT,
    overscan: 5,
  });

  if (invoices.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <>
        {invoices.map((inv, idx) => (
          <InvoiceChildRow
            key={`${inv.invoiceNo}-${idx}`}
            inv={inv}
            isLast={idx === invoices.length - 1}
            onRowClick={onRowClick}
          />
        ))}
      </>
    );
  }

  const listHeight = Math.min(
    invoices.length * INVOICE_ROW_HEIGHT,
    MAX_VIRTUAL_LIST_HEIGHT,
  );

  return (
    <TableRow className="hover:bg-transparent border-0">
      <TableCell colSpan={14} className="p-0">
        <div
          ref={parentRef}
          className="overflow-y-auto"
          style={{ height: listHeight }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const inv = invoices[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <table className="w-full min-w-[1450px] table-fixed">
                    <InvoiceTableColGroup />
                    <tbody>
                      <InvoiceChildRow inv={inv} isLast={virtualRow.index === invoices.length - 1} onRowClick={onRowClick} asTableRow />
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function InvoiceChildRow({
  inv,
  isLast,
  onRowClick,
  asTableRow = false,
}: {
  inv: Invoice;
  isLast: boolean;
  onRowClick?: (invoice: Invoice) => void;
  asTableRow?: boolean;
}) {
  const row = (
    <>
      <TableCell className="relative min-w-0 overflow-hidden py-2 pl-8">
        {isLast ? (
          <div className="absolute left-5 top-0 h-[22px] w-px bg-border/40 dark:bg-border/20" />
        ) : (
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border/40 dark:bg-border/20" />
        )}
        <div className="absolute left-5 top-[22px] w-3 h-px bg-border/40 dark:bg-border/20" />
        <div className="flex flex-col gap-1 min-w-0 pl-2.5">
          <span className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-extrabold text-foreground/90" title={inv.invoiceNo}>{inv.invoiceNo}</span>
          {inv.isPosted ? (
            <span className="inline-flex items-center w-max px-1 py-0.25 rounded text-[8px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 uppercase">Posted</span>
          ) : (
            <span className="inline-flex items-center w-max px-1 py-0.25 rounded text-[8px] font-bold tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/15 uppercase">Draft</span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-2 text-muted-foreground/35 text-[9px] font-medium tracking-wide uppercase italic">└─ detail</TableCell>
      <TableCell className="min-w-0 overflow-hidden py-2"><span className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-muted-foreground" title={inv.salesman}>{inv.salesman || <span className="text-muted-foreground/20">—</span>}</span></TableCell>
      <TableCell className="min-w-0 overflow-hidden py-2"><span className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-muted-foreground" title={inv.division}>{inv.division || <span className="text-muted-foreground/20">—</span>}</span></TableCell>
      <TableCell className="min-w-0 overflow-hidden py-2"><span className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs font-medium text-muted-foreground" title={inv.supplierCode}>{inv.supplierCode || <span className="text-muted-foreground/20">—</span>}</span></TableCell>
      <TableCell className="py-2"><span className="text-xs text-muted-foreground/90 font-mono font-medium whitespace-nowrap block">{formatDate(inv.invoiceDate)}</span></TableCell>
      <TableCell className="py-2"><span className="text-xs text-muted-foreground/90 font-mono font-medium whitespace-nowrap block">{formatDate(inv.deliveryDate)}</span></TableCell>
      <TableCell className="py-2"><span className="text-xs text-muted-foreground/90 font-mono font-medium whitespace-nowrap block">{formatDate(inv.due)}</span></TableCell>
      <TableCell className="py-2 text-right"><span className="text-xs font-semibold font-mono text-muted-foreground/90 tabular-nums">{formatPeso(inv.netReceivable)}</span></TableCell>
      <TableCell className="py-2 text-right"><span className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{formatPeso(inv.totalPaid)}</span></TableCell>
      <TableCell className="py-2 text-right font-bold font-mono text-primary tabular-nums">{formatPeso(inv.outstanding)}</TableCell>
      <TableCell className="py-2 text-center">
        {inv.overdue !== null && inv.overdue >= 0 ? (
          <span className={`text-xs font-mono font-extrabold ${inv.overdue > 30 ? 'animate-pulse' : ''}`} style={{ color: agingColor(inv.overdue) }}>{inv.overdue}d</span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell className="min-w-0 overflow-hidden py-2"><StatusPill status={inv.arStatus} /></TableCell>
      <TableCell className="min-w-0 overflow-hidden py-2 pr-4"><StatusPill status={inv.transactionStatus} /></TableCell>
    </>
  );

  if (asTableRow) {
    return (
      <TableRow className="border-b border-border/15 hover:bg-primary/[0.03] cursor-pointer bg-card/25 transition-all duration-150 ease-in-out active:bg-primary/[0.06] hover:shadow-[inset_3px_0_0_0_#4f46e5]" onClick={() => onRowClick?.(inv)}>
        {row}
      </TableRow>
    );
  }

  return (
    <TableRow className="border-b border-border/20 hover:bg-muted/15 cursor-pointer bg-card/45 transition-colors active:bg-muted/25" onClick={() => onRowClick?.(inv)}>
      {row}
    </TableRow>
  );
}

type InvoiceViewMode = 'table' | 'cards';
type DisplayCustomerGroup = Omit<CustomerGroup, 'invoices'> & { invoices: Invoice[] };

function InvoiceCardField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
      <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-xs font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function InvoiceCard({
  invoice,
  onRowClick,
}: {
  invoice: Invoice;
  onRowClick?: (invoice: Invoice) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onRowClick?.(invoice)}
      className="w-full min-w-0 rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/[0.06]"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-extrabold text-foreground" title={invoice.invoiceNo}>
            {invoice.invoiceNo}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {invoice.isPosted ? 'Posted' : 'Draft'} · {invoice.customerCode || 'No customer code'}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <StatusPill status={invoice.arStatus} />
          <StatusPill status={invoice.transactionStatus} />
        </div>
      </div>

      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <InvoiceCardField label="Customer" value={invoice.customer || '—'} />
        <InvoiceCardField label="Salesman" value={invoice.salesman || '—'} />
        <InvoiceCardField label="Division" value={invoice.division || '—'} />
        <InvoiceCardField label="Supplier Code" value={invoice.supplierCode || '—'} />
        <InvoiceCardField label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
        <InvoiceCardField label="Delivery Date" value={formatDate(invoice.deliveryDate)} />
        <InvoiceCardField label="Due Date" value={formatDate(invoice.due)} />
        <InvoiceCardField label="Net Receivable" value={formatPeso(invoice.netReceivable)} />
        <InvoiceCardField label="Paid" value={formatPeso(invoice.totalPaid)} />
        <InvoiceCardField label="Outstanding" value={formatPeso(invoice.outstanding)} />
        <InvoiceCardField
          label="Overdue"
          value={invoice.overdue !== null && invoice.overdue >= 0 ? `${invoice.overdue}d` : '—'}
        />
      </dl>
    </button>
  );
}

function InvoiceCardGroups({
  groups,
  expandedCustomers,
  onToggleCustomer,
  onRowClick,
  tableLoading,
}: {
  groups: DisplayCustomerGroup[];
  expandedCustomers: Record<string, boolean>;
  onToggleCustomer: (customerName: string) => void;
  onRowClick?: (invoice: Invoice) => void;
  tableLoading: boolean;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        {tableLoading ? 'Loading invoices…' : 'No invoices found.'}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3 p-3 sm:p-4">
      {groups.map((group) => {
        const isExpanded = expandedCustomers[group.customerName] !== false;

        return (
          <section key={group.customerName} className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-muted/10">
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => onToggleCustomer(group.customerName)}
              className="flex min-h-11 w-full min-w-0 flex-col items-stretch gap-3 p-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {isExpanded ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-primary">
                      Group
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground/80">
                      {group.invoices.length} invoice{group.invoices.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-1 break-words text-xs font-extrabold text-foreground/90" title={group.customerName}>
                    {group.customerName}
                  </div>
                  <div className="mt-1 break-words font-mono text-[9px] font-semibold text-muted-foreground">
                    {group.customerCode}
                  </div>
                </div>
              </div>

              <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-right text-[10px] sm:w-auto sm:grid-cols-4">
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Net</dt>
                  <dd className="mt-0.5 font-mono font-bold text-foreground/90">{formatPeso(group.netReceivable)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Paid</dt>
                  <dd className="mt-0.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatPeso(group.totalPaid)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Outstanding</dt>
                  <dd className="mt-0.5 font-mono font-extrabold text-primary">{formatPeso(group.outstanding)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Overdue</dt>
                  <dd className="mt-0.5 font-mono font-bold" style={{ color: group.maxOverdue !== null && group.maxOverdue >= 0 ? agingColor(group.maxOverdue) : undefined }}>
                    {group.maxOverdue !== null && group.maxOverdue >= 0 ? `${group.maxOverdue}d` : '—'}
                  </dd>
                </div>
              </dl>
            </button>

            {isExpanded && (
              <div className="min-w-0 space-y-2 border-t border-border/50 bg-background/30 p-2 sm:p-3">
                {group.invoices.map((invoice, index) => (
                  <InvoiceCard
                    key={`${invoice.invoiceNo}-${index}`}
                    invoice={invoice}
                    onRowClick={onRowClick}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function InvoiceTable({
  invoices = [],
  customerGroups: serverGroups,
  serverMode = false,
  page,
  setPage,
  totalPages: serverTotalPages,
  totalInvoiceCount,
  totalGroupCount,
  tableLoading = false,
  truncated = false,
  sortKey: controlledSortKey,
  sortOrder: controlledSortOrder,
  onSortChange,
  onRowClick,
}: InvoiceTableProps) {
  const [localSortKey, setLocalSortKey] = useState<keyof Invoice | null>(null);
  const [localSortOrder, setLocalSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<InvoiceViewMode>('table');

  const isControlledSort = serverMode && onSortChange != null;
  const sortKey = isControlledSort ? (controlledSortKey ?? null) : localSortKey;
  const sortOrder = isControlledSort ? (controlledSortOrder ?? null) : localSortOrder;

  const handleSort = (key: keyof Invoice, order: 'asc' | 'desc' | null) => {
    if (isControlledSort) {
      onSortChange!(key, order);
    } else {
      setLocalSortKey(key);
      setLocalSortOrder(order);
    }
  };

  const mappedServerGroups = useMemo(() => {
    if (!serverGroups) return [];
    return serverGroups.map((g) => ({
      customerName: g.customerName,
      customerCode: g.customerCode,
      netReceivable: g.netReceivable,
      totalPaid: g.totalPaid,
      outstanding: g.outstanding,
      maxOverdue: g.maxOverdue,
      invoices: g.invoices.map(mapARRowToInvoice),
    }));
  }, [serverGroups]);

  const filtered = useMemo(() => serverMode ? [] as Invoice[] : invoices, [serverMode, invoices]);

  const customerGroups = useMemo(() => {
    if (serverMode) return mappedServerGroups;

    const groupsMap: Record<string, Invoice[]> = {};
    filtered.forEach((inv) => {
      const name = inv.customer || '—';
      if (!groupsMap[name]) groupsMap[name] = [];
      groupsMap[name].push(inv);
    });

    const groups = Object.entries(groupsMap).map(([name, invs]) => {
      const netReceivable = invs.reduce((sum, inv) => sum + inv.netReceivable, 0);
      const totalPaid = invs.reduce((sum, inv) => sum + inv.totalPaid, 0);
      const outstanding = invs.reduce((sum, inv) => sum + inv.outstanding, 0);

      let maxOverdue: number | null = null;
      invs.forEach((inv) => {
        if (inv.overdue !== null && inv.overdue >= 0) {
          if (maxOverdue === null || inv.overdue > maxOverdue) {
            maxOverdue = inv.overdue;
          }
        }
      });

      return {
        customerName: name,
        customerCode: invs[0]?.customerCode || '—',
        netReceivable,
        totalPaid,
        outstanding,
        maxOverdue,
        invoices: invs,
      };
    });

    return sortCustomerGroups(groups, { sortKey, sortOrder });
  }, [serverMode, mappedServerGroups, filtered, sortKey, sortOrder]);

  const totalPages = serverMode ? (serverTotalPages ?? 1) : Math.ceil(customerGroups.length / PAGE_SIZE);
  const safePage = Math.min(page, totalPages || 1);
  const pagedGroups = serverMode ? customerGroups : customerGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const displayInvoiceCount = serverMode ? (totalInvoiceCount ?? 0) : filtered.length;
  const displayGroupCount = serverMode ? (totalGroupCount ?? customerGroups.length) : customerGroups.length;
  const pageNumbers = getPageNumbers(safePage, totalPages);

  const isAllExpanded = pagedGroups.length > 0 && pagedGroups.every(g => expandedCustomers[g.customerName] !== false);
  const toggleAll = () => {
    if (isAllExpanded) {
      const newExpanded: Record<string, boolean> = {};
      pagedGroups.forEach(g => {
        newExpanded[g.customerName] = false;
      });
      setExpandedCustomers(newExpanded);
    } else {
      setExpandedCustomers({});
    }
  };

  const toggleCustomer = (customerName: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [customerName]: prev[customerName] === false,
    }));
  };

  return (
    <Card className="dark:bg-zinc-950 border-border overflow-hidden w-full">
      <CardHeader className="flex flex-col items-start gap-3 bg-muted/30 border-b border-border/50 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <CardTitle className="shrink-0 text-sm font-bold uppercase">Invoice Details</CardTitle>
          <div role="group" aria-label="Invoice display mode" className="flex shrink-0 rounded-lg border border-border bg-background/60 p-0.5">
            <button
              type="button"
              aria-pressed={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[10px] font-bold uppercase tracking-wider transition-colors",
                viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[10px] font-bold uppercase tracking-wider transition-colors",
                viewMode === 'cards' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={toggleAll}
            className="min-h-9 rounded border border-border bg-muted/40 px-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground whitespace-nowrap"
          >
            {isAllExpanded ? "Collapse Page" : "Expand Page"}
          </button>
          <span className="text-right text-xs text-muted-foreground sm:text-left">
            {tableLoading ? 'Loading…' : (
              <>{displayInvoiceCount} invoice{displayInvoiceCount !== 1 ? 's' : ''} ({displayGroupCount} customer{displayGroupCount !== 1 ? 's' : ''}) &mdash; page {safePage} of {totalPages || 1}</>
            )}
          </span>
        </div>
      </CardHeader>

      {truncated ? (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">
          Data truncated — showing partial results. Narrow the date range or use supplier/customer filters to see all records.
        </div>
      ) : null}

      <CardContent className="p-0">
        {viewMode === 'cards' ? (
          <InvoiceCardGroups
            groups={pagedGroups}
            expandedCustomers={expandedCustomers}
            onToggleCustomer={toggleCustomer}
            onRowClick={onRowClick}
            tableLoading={tableLoading}
          />
        ) : (
          <div className="relative w-full min-w-0 max-h-[600px] overflow-auto">
            <Table className="w-full min-w-[1450px] table-fixed">
              <InvoiceTableColGroup />
              <TableHeader className="sticky top-0 bg-background dark:bg-zinc-950 z-20 shadow-sm">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="py-3 pl-4 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Inv No." sortKey="invoiceNo" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Customer" sortKey="customer" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Salesman" sortKey="salesman" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Division" sortKey="division" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="SCode" sortKey="supplierCode" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Inv. Date" sortKey="invoiceDate" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Del Date" sortKey="deliveryDate" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Due Date" sortKey="due" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 text-right whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Net Receivable" sortKey="netReceivable" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-full justify-end text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 text-right whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Paid" sortKey="totalPaid" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-full justify-end text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 text-right whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Outstanding" sortKey="outstanding" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-full justify-end text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 text-center whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Overdue" sortKey="overdue" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="w-full justify-center text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="AR Status" sortKey="arStatus" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                  <TableHead className="py-3 pr-4 whitespace-nowrap align-middle"><SortableHeader<Invoice> label="Transaction Status" sortKey="transactionStatus" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="text-xs font-bold" /></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pagedGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-10 text-muted-foreground text-sm">
                      {tableLoading ? 'Loading invoices…' : 'No invoices found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedGroups.map((group) => {
                    const isExpanded = expandedCustomers[group.customerName] !== false;
                    const toggleExpand = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setExpandedCustomers((prev) => ({
                        ...prev,
                        [group.customerName]: !isExpanded,
                      }));
                    };

                    return (
                      <Fragment key={group.customerName}>
                        {/* Customer Group Row */}
                        <TableRow
                          className="bg-gradient-to-r from-muted/50 via-muted/20 to-transparent hover:from-muted/60 hover:via-muted/30 hover:to-transparent border-b border-border/40 cursor-pointer transition-all duration-200 ease-in-out active:bg-muted/40 font-semibold border-l-4 border-l-primary"
                          onClick={(e) => toggleExpand(e)}
                        >
                          <TableCell className="py-2.5 pl-4 flex items-center gap-1.5 font-bold text-xs text-primary">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-primary animate-in fade-in duration-200" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
                            )}
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
                              Group
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground/80">
                              ({group.invoices.length})
                            </span>
                          </TableCell>

                          <TableCell className="py-2.5 font-extrabold text-xs text-foreground/90 truncate" colSpan={7}>
                            {group.customerName} <span className="font-mono text-[9px] font-semibold text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded ml-2">{group.customerCode}</span>
                          </TableCell>

                          {/* Net Receivable */}
                          <TableCell className="py-2.5 text-right font-bold text-xs text-foreground/90 font-mono">
                            {formatPeso(group.netReceivable)}
                          </TableCell>

                          {/* Paid */}
                          <TableCell className="py-2.5 text-right font-bold text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                            {formatPeso(group.totalPaid)}
                          </TableCell>

                          {/* Outstanding */}
                          <TableCell className="py-2.5 text-right font-extrabold text-xs text-primary font-mono">
                            {formatPeso(group.outstanding)}
                          </TableCell>

                          {/* Overdue */}
                          <TableCell className="py-2.5 text-center">
                            {group.maxOverdue !== null && group.maxOverdue >= 0 ? (
                              <span
                                className={`text-xs ${group.maxOverdue > 30 ? 'font-black' : 'font-semibold'}`}
                                style={{ color: agingColor(group.maxOverdue) }}
                              >
                                {group.maxOverdue}d
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* AR Status */}
                          <TableCell className="py-2.5">
                            <StatusPill status={group.maxOverdue !== null && group.maxOverdue >= 0 ? 'Overdue' : 'Due'} />
                          </TableCell>

                          {/* Transaction Status empty at Group level */}
                          <TableCell className="py-2.5 pr-4">
                            <span className="text-[11px] text-muted-foreground">—</span>
                          </TableCell>
                        </TableRow>

                        {/* Child Invoice Rows */}
                        {isExpanded && (
                          <VirtualInvoiceRows
                            invoices={group.invoices}
                            onRowClick={onRowClick}
                          />
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="w-full py-4 border-t border-border/50">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }}
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
                    onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }}
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
