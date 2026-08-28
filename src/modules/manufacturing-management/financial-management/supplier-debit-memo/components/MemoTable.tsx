// src/modules/financial-management/accounting/supplier-debit-memo/components/MemoTable.tsx

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/components/ui/pagination";
import { Search } from "lucide-react";
import type { SupplierDebitMemo, Supplier, ChartOfAccount } from "../types";
import { formatPeso, formatDate } from "../utils";

const PAGE_SIZE = 10;

// Status badge uses inline styles to avoid Tailwind JIT purging dynamic classes
const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  Available: { bg: "rgba(16,185,129,0.15)", color: "#047857",  border: "rgba(16,185,129,0.3)"  },
  Applied:   { bg: "rgba(59,130,246,0.15)", color: "#1d4ed8",  border: "rgba(59,130,246,0.3)"  },
};


function StatusPill({ status }: { status: string }) {
  const key   = status ?? "";
  const style = STATUS_STYLES[key] ?? STATUS_STYLES[key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()];

  if (!style) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-border bg-muted text-muted-foreground">
        {status}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
      style={{ background: style.bg, color: style.color, borderColor: style.border }}
    >
      {status}
    </span>
  );
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3) return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

interface MemoTableProps {
  memos:     SupplierDebitMemo[];
  loading:   boolean;
  error?:    string | null;
  suppliers: Supplier[];
  accounts:  ChartOfAccount[];
}

export function MemoTable({ memos, loading, error, suppliers, accounts }: MemoTableProps) {
  const [search, setSearch] = useState("");
  const [page,   setPage]   = useState(1);

  // Lookup maps — use string keys to handle both number and string IDs from Directus
  const supplierMap: Record<string, string> = {};
  suppliers.forEach(s => {
    supplierMap[String(s.id)] = s.supplier_name;
    // Directus may also return supplier_name directly on the memo row
    if (s.supplier_name) supplierMap[String(s.id)] = s.supplier_name;
  });

  const accountMap: Record<string, string> = {};
  accounts.forEach(a => {
    const key = String(('id' in a && typeof (a as { id?: number }).id === 'number') ? (a as { id: number }).id : a.coa_id ?? a.coa_id);
    accountMap[key] = a.account_title ?? key;
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? memos.filter(m =>
        m.memo_number.toLowerCase().includes(q) ||
        (m.reason ?? "").toLowerCase().includes(q) ||
        (supplierMap[String(m.supplier_id)] ?? "").toLowerCase().includes(q) ||
        (accountMap[String(m.chart_of_account)] ?? "").toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q) ||
        m.amount.toString().includes(q)
      )
    : memos;

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage    = Math.min(page, totalPages || 1);
  const paged       = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  return (
    <Card className="shadow-none border-border overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border/50 flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm font-bold uppercase shrink-0">SDM Records</CardTitle>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search memo #, reason, supplier..."
            className="h-8 pl-8 text-xs focus-visible:ring-1"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} — page {safePage} of {totalPages || 1}
        </span>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-bold py-3 pl-6 whitespace-nowrap">Memo No.</TableHead>
              <TableHead className="text-xs font-bold py-3 whitespace-nowrap">Date</TableHead>
              <TableHead className="text-xs font-bold py-3 whitespace-nowrap">Supplier Name</TableHead>
              <TableHead className="text-xs font-bold py-3 whitespace-nowrap">Chart of Account</TableHead>
              <TableHead className="text-xs font-bold py-3 whitespace-nowrap">Reason</TableHead>
              <TableHead className="text-xs font-bold py-3 text-right whitespace-nowrap">Amount</TableHead>
              <TableHead className="text-xs font-bold py-3 pr-6 whitespace-nowrap">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-border/40">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j} className="py-3">
                      <div className="h-4 bg-muted rounded animate-pulse" style={{ width: j === 2 ? "140px" : "80px" }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  Failed to load memos: {error}
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  {q ? `No results for "${search}".` : "No debit memos found."}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((m, i) => (
                <TableRow key={`${m.id}-${i}`} className="border-border/40 hover:bg-muted/20">
                  <TableCell className="font-bold text-primary text-xs py-3 pl-6 whitespace-nowrap">
                    {m.memo_number}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-3 whitespace-nowrap">
                    {formatDate(m.date)}
                  </TableCell>
                  <TableCell className="text-xs font-medium py-3 max-w-[180px] truncate" title={supplierMap[String(m.supplier_id)]}>
                    {supplierMap[String(m.supplier_id)] ?? `#${m.supplier_id}`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-3 whitespace-nowrap">
                    {accountMap[String(m.chart_of_account)] ?? `#${m.chart_of_account}`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-3 max-w-[200px] truncate" title={m.reason ?? ""}>
                    {m.reason || <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="text-xs font-semibold py-3 text-right whitespace-nowrap">
                    {formatPeso(parseFloat(m.amount))}
                  </TableCell>
                  <TableCell className="py-3 pr-6 whitespace-nowrap">
                    <StatusPill status={m.status} />
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
                    onClick={e => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }}
                    aria-disabled={safePage === 1}
                    className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                {pageNumbers.map((num, idx) =>
                  num === "ellipsis" ? (
                    <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                  ) : (
                    <PaginationItem key={num}>
                      <PaginationLink
                        href="#"
                        isActive={safePage === num}
                        onClick={e => { e.preventDefault(); setPage(num); }}
                      >
                        {num}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={e => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }}
                    aria-disabled={safePage === totalPages}
                    className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
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