"use client";

import React, { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, FileText, Download } from "lucide-react";
import type { DetailRow } from "../types";
import { pesoFmt, numFmt } from "./OverviewTab";

interface Props {
  data: { rows: DetailRow[]; total: number } | null;
  loading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
  onRefetch: () => void;
}

const PAGE_SIZE = 20;

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 bg-muted rounded w-4/5" />
        </td>
      ))}
    </tr>
  );
}

export function DetailsTab({ data, loading, error, page, onPageChange, onRefetch }: Props) {
  const [search, setSearch] = useState("");

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Sort default date descending
  const sortedByDate = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sortedByDate;
    return sortedByDate.filter(
      (r) =>
        r.jobOrderNo.toLowerCase().includes(q) ||
        r.machineName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        (r.assetSerial && r.assetSerial.toLowerCase().includes(q))
    );
  }, [sortedByDate, search]);

  const isEmpty = !loading && !error && rows.length === 0;

  function fmt(date: string | null) {
    if (!date) return "—";
    try {
      return new Date(date).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return date;
    }
  }

  // CSV Export utility
  function handleExportCsv() {
    if (!filtered.length) return;
    const headers = [
      "Date",
      "Machine",
      "Job Order",
      "Product",
      "Output",
      "UOM",
      "Rate Per Unit",
      "Depreciation Attributed",
    ];

    const csvRows = filtered.map((r) => [
      `"${r.date ?? ""}"`,
      `"${r.machineName.replace(/"/g, '""')}"`,
      `"${r.jobOrderNo.replace(/"/g, '""')}"`,
      `"${r.productName.replace(/"/g, '""')}"`,
      r.productionOutput,
      `"${r.uom}"`,
      r.ratePerUnit,
      r.depreciationAttributed,
    ]);

    const csvContent = [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `uop_depreciation_details_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={onRefetch}
            className="ml-auto text-xs underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* Control bar: Search + CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-xl border border-border">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search job order, machine, product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 h-8 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          {search && (
            <span className="text-xs text-muted-foreground font-mono">
              {filtered.length} of {rows.length} rows
            </span>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table with Right-Aligned Financial Values and Descending Date Sort */}
      <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto max-h-[550px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur border-b border-border shadow-xs">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Date</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Machine</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Job Order</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Product</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Output</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">UOM</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Rate / Unit</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Depreciation Attributed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : isEmpty
                ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-muted-foreground">No audit detail records found</p>
                    </td>
                  </tr>
                )
                : filtered.length === 0 && search
                ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-muted-foreground italic">
                      No rows match &ldquo;{search}&rdquo;
                    </td>
                  </tr>
                )
                : filtered.map((row, i) => {
                  const hasJob = row.jobOrderNo && row.jobOrderNo !== "—" && !row.jobOrderNo.startsWith("JO #null");
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-muted/30 transition-colors ${
                        hasJob ? "bg-primary/[0.02]" : "text-muted-foreground"
                      }`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-foreground">{fmt(row.date)}</td>
                      <td className="px-3 py-2.5 max-w-[170px] truncate font-medium text-foreground" title={row.machineName}>
                        {row.machineName}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-medium">
                        {hasJob ? (
                          <span className="text-primary font-semibold">{row.jobOrderNo}</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 max-w-[160px] truncate" title={row.productName}>
                        {row.productName !== "—" ? row.productName : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right font-medium">
                        {numFmt.format(row.productionOutput)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                          {row.uom}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                        {pesoFmt.format(row.ratePerUnit)}{" "}
                        <span className="text-muted-foreground text-[10px] font-sans">/ {row.uom}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right font-bold text-foreground">
                        {pesoFmt.format(row.depreciationAttributed)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && !error && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages} &middot; {total} total records
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 rounded-md border border-input hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 py-1 rounded-md border border-input bg-muted/30 font-mono">{page}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 rounded-md border border-input hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
