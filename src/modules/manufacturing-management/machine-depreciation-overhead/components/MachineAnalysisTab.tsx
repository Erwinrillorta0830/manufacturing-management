"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ArrowUpDown, AlertCircle, RefreshCw, BarChart2, Search } from "lucide-react";
import type { MachineRow } from "../types";
import { pesoFmt, numFmt, fmtPesoAxis } from "./OverviewTab";

const pctFmt = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

type SortKey = keyof MachineRow;
type SortDir = "asc" | "desc";

interface Props {
  data: { rows: MachineRow[] } | null;
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 bg-muted rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

function SortHeader({
  k,
  label,
  align = "left",
  sortKey,
  onSort,
}: {
  k: SortKey;
  label: string;
  align?: "left" | "right";
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2.5 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap text-xs ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <div className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}>
        <span>{label}</span>
        <ArrowUpDown
          className={`h-3 w-3 ${isActive ? "text-primary font-bold" : "text-muted-foreground/40"}`}
        />
      </div>
    </th>
  );
}

export function MachineAnalysisTab({ data, loading, error, onRefetch }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("productionOutput");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hideIdle, setHideIdle] = useState(true);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);

  // Filter idle and search query
  const filtered = useMemo(() => {
    let result = rows;
    if (hideIdle) {
      result = result.filter((r) => r.productionOutput > 0 || r.periodDepreciation > 0);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.machineName.toLowerCase().includes(q) ||
          (r.serial && r.serial.toLowerCase().includes(q))
      );
    }
    return result;
  }, [rows, hideIdle, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (Number(av) || 0) - (Number(bv) || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }


  const idleCount = rows.filter((r) => r.productionOutput <= 0 && r.periodDepreciation <= 0).length;

  // Totals for visible rows
  const totals = useMemo(() => {
    return {
      depreciableBase: sorted.reduce((s, r) => s + r.depreciableBase, 0),
      productionOutput: sorted.reduce((s, r) => s + r.productionOutput, 0),
      periodDepreciation: sorted.reduce((s, r) => s + r.periodDepreciation, 0),
    };
  }, [sorted]);

  const chartData = sorted
    .filter((r) => r.productionOutput > 0)
    .slice(0, 10)
    .map((r) => ({
      name: r.machineName.length > 14 ? `${r.machineName.slice(0, 13)}…` : r.machineName,
      "Production Output": r.productionOutput,
      "Depreciation (₱)": r.periodDepreciation,
    }));

  const isEmpty = !loading && !error && rows.length === 0;

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

      {/* Control bar: Search + Hide Idle Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-xl border border-border">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search machine name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 h-8 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideIdle}
              onChange={(e) => setHideIdle(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-ring"
            />
            <span className="font-medium text-foreground">Hide idle machines</span>
            {idleCount > 0 && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                {idleCount} idle
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Table with Sticky Header and Right-Aligned Numeric Columns */}
      <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto max-h-[550px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur border-b border-border shadow-xs">
              <tr>
                <SortHeader k="machineName" label="Machine" align="left" sortKey={sortKey} onSort={handleSort} />
                <SortHeader k="depreciableBase" label="Depreciable Base" align="right" sortKey={sortKey} onSort={handleSort} />
                <SortHeader k="lifetimeCapacity" label="Lifetime Capacity" align="right" sortKey={sortKey} onSort={handleSort} />
                <SortHeader k="productionOutput" label="Production Output" align="right" sortKey={sortKey} onSort={handleSort} />
                <SortHeader k="ratePerUnit" label="Rate / Unit" align="right" sortKey={sortKey} onSort={handleSort} />
                <SortHeader k="periodDepreciation" label="Period Depreciation" align="right" sortKey={sortKey} onSort={handleSort} />
                <SortHeader k="capacityUsedPercent" label="Capacity Used" align="right" sortKey={sortKey} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : isEmpty
                ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <BarChart2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-muted-foreground">No UOP equipment found</p>
                    </td>
                  </tr>
                )
                : sorted.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-muted-foreground italic">
                      No machines match the filter criteria
                    </td>
                  </tr>
                )
                : sorted.map((row) => {
                  const isIdle = row.productionOutput <= 0 && row.periodDepreciation <= 0;
                  const pct = Math.max(0, row.capacityUsedPercent);
                  // Ensure small non-zero percentage bar is visible
                  const barWidth = pct > 0 ? Math.max(pct, 2) : 0;

                  return (
                    <tr
                      key={row.assetId}
                      className={`hover:bg-muted/40 transition-colors ${
                        isIdle ? "text-muted-foreground/60 bg-muted/10" : "text-foreground"
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium max-w-[200px] truncate" title={row.machineName}>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              isIdle ? "bg-muted-foreground/30" : "bg-emerald-500"
                            }`}
                          />
                          <span className="truncate">{row.machineName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                        {pesoFmt.format(row.depreciableBase)}
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right whitespace-nowrap">
                        {numFmt.format(row.lifetimeCapacity)}{" "}
                        <span className="text-muted-foreground text-[10px] font-sans font-medium">{row.uom}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right whitespace-nowrap">
                        <span className={isIdle ? "text-muted-foreground/60" : "font-semibold text-foreground"}>
                          {numFmt.format(row.productionOutput)}
                        </span>{" "}
                        <span className="text-muted-foreground text-[10px] font-sans font-medium">{row.uom}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right whitespace-nowrap">
                        {pesoFmt.format(row.ratePerUnit)}{" "}
                        <span className="text-muted-foreground text-[10px] font-sans">/ {row.uom}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-right font-semibold">
                        <span className={isIdle ? "text-muted-foreground/60 font-normal" : "text-foreground font-bold"}>
                          {pesoFmt.format(row.periodDepreciation)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, barWidth)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right">{pctFmt.format(row.capacityUsedPercent)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            {/* Totals Footer Row */}
            {!loading && sorted.length > 0 && (
              <tfoot className="bg-muted/40 border-t border-border font-semibold text-xs text-foreground">
                <tr>
                  <td className="px-3 py-2.5 font-sans">
                    Total ({sorted.length} machine{sorted.length > 1 ? "s" : ""})
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                    {pesoFmt.format(totals.depreciableBase)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground font-mono">—</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right font-bold text-foreground">
                    {numFmt.format(totals.productionOutput)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground font-mono">—</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right font-bold text-primary">
                    {pesoFmt.format(totals.periodDepreciation)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground font-mono">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Chart: Production Output vs Period Depreciation with Adaptive Formatting */}
      {!loading && !error && chartData.length > 0 && (
        <div className="rounded-xl border border-border p-4 bg-card shadow-sm">
          <div className="mb-3">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Production Output vs. Period Depreciation (Top Active Machines)
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Visualizes units produced alongside depreciation expense for active equipment
            </p>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" interval={0} />
                <YAxis
                  yAxisId="units"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                  width={55}
                />
                <YAxis
                  yAxisId="dep"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  tickFormatter={fmtPesoAxis}
                  width={65}
                />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === "Depreciation (₱)" ? [pesoFmt.format(v), name] : [`${numFmt.format(v)} units`, name]
                  }
                  contentStyle={{ fontSize: "11px", borderRadius: "8px" }}
                />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                <Bar
                  yAxisId="units"
                  dataKey="Production Output"
                  fill="#0ea5e9"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                />
                <Bar
                  yAxisId="dep"
                  dataKey="Depreciation (₱)"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
