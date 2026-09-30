"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingDown,
  Package,
  DollarSign,
  AlertCircle,
  BarChart2,
  RefreshCw,
  Cpu,
  CheckCircle2,
  ArrowRight,
  Info,
} from "lucide-react";
import type { OverviewData } from "../types";

export const pesoFmt = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export const numFmt = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const fmtPesoAxis = (v: number): string =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: Math.abs(v) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(v) >= 10_000 ? 1 : 0,
  }).format(v);

interface Props {
  data: OverviewData | null;
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
}

const BAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function SkeletonCard() {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-2 animate-pulse bg-muted/20">
      <div className="h-3 bg-muted rounded w-2/3" />
      <div className="h-7 bg-muted rounded w-1/2 mt-1" />
      <div className="h-2.5 bg-muted rounded w-3/4 mt-1" />
    </div>
  );
}

export function OverviewTab({ data, loading, error, onRefetch }: Props) {
  const kpis = data?.kpis;
  const monthlyTrend = data?.monthlyTrend ?? [];
  const byMachine = data?.byMachine ?? [];
  const uopScatter = data?.uopOutputVsDepreciation ?? [];

  const isEmpty = !loading && !error && !kpis;

  // Filter machines with positive depreciation for the chart, sort descending, take top 8
  const activeMachines = byMachine
    .filter((m) => m.depreciation > 0)
    .sort((a, b) => b.depreciation - a.depreciation)
    .slice(0, 8);
  const idleMachinesCount = byMachine.filter((m) => m.depreciation <= 0).length;

  const isReconciled = kpis ? Math.abs(kpis.attributionDifference) < 0.01 : false;

  return (
    <div className="flex flex-col gap-5">
      {/* 6 Neutral KPI Cards with status-only tinting */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : error
          ? (
            <div className="col-span-full flex items-center gap-2 text-sm text-destructive p-4 rounded-lg border border-destructive/30 bg-destructive/5">
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
          )
          : isEmpty
          ? null
          : (
            <>
              {/* Card 1 */}
              <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <TrendingDown className="h-4 w-4 text-primary shrink-0" />
                  <span>UOP Machine Depreciation</span>
                </div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  {kpis ? pesoFmt.format(kpis.uopMachineDepreciation) : "—"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Sum of period depreciation across UOP assets
                </p>
              </div>

              {/* Card 2 */}
              <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <Package className="h-4 w-4 text-sky-500 shrink-0" />
                  <span>UOP Production Output</span>
                </div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums truncate">
                  {kpis && kpis.uopProductionOutput !== null
                    ? `${numFmt.format(kpis.uopProductionOutput)} ${kpis.outputUom}`
                    : kpis?.outputUom ?? "—"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {kpis?.uopProductionOutput !== null ? "Total output volume in period" : "Mixed unit measurements"}
                </p>
              </div>

              {/* Card 3 */}
              <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <DollarSign className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Average Depreciation / Unit</span>
                </div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums truncate">
                  {kpis?.rateUom ?? "—"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {kpis?.avgUopDepreciationPerUnit !== null
                    ? "Weighted average unit burden rate"
                    : "Safeguarded against mixed UOMs"}
                </p>
              </div>

              {/* Card 4 */}
              <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <Cpu className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>Depreciation Attributed to Jobs</span>
                </div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  {kpis ? pesoFmt.format(kpis.attributedToJobs) : "—"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Absorbed into job order production
                </p>
              </div>

              {/* Card 5: Tinted specifically for Attribution Difference status */}
              <div
                className={`rounded-xl border p-4 shadow-sm flex flex-col justify-between gap-1 ${
                  isReconciled
                    ? "bg-emerald-500/5 border-emerald-500/30 text-card-foreground"
                    : "bg-amber-500/5 border-amber-500/30 text-card-foreground"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Attribution Difference</span>
                  </div>
                  {isReconciled ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Reconciled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                      Variance
                    </span>
                  )}
                </div>
                <div
                  className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${
                    isReconciled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {kpis ? pesoFmt.format(kpis.attributionDifference) : "—"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  UOP Machine Depr. − Job-Order Attributed
                </p>
              </div>

              {/* Card 6 */}
              <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Machines with Output</span>
                </div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  {kpis ? String(kpis.machinesWithOutputCount) : "—"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Active producing UOP assets in scope
                </p>
              </div>
            </>
          )}
      </div>

      {/* Redesigned Clean Reconciliation Strip */}
      {kpis && !loading && !error && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-muted-foreground font-medium">
            <Info className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Reconciliation Audit Trail:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Asset-Level</span>
              <span className="font-semibold text-foreground">{pesoFmt.format(kpis.uopMachineDepreciation)}</span>
            </div>

            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />

            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Attributed</span>
              <span className="font-semibold text-foreground">{pesoFmt.format(kpis.attributedToJobs)}</span>
            </div>

            <span className="text-muted-foreground font-sans font-bold">=</span>

            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Variance (Δ)</span>
              <span
                className={`font-bold ${
                  isReconciled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {pesoFmt.format(kpis.attributionDifference)}
              </span>
              {isReconciled && (
                <span className="text-emerald-600 dark:text-emerald-400 font-sans font-bold">✓</span>
              )}
            </div>
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <BarChart2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            No UOP depreciation data found for the selected period
          </p>
        </div>
      )}

      {/* Charts Section with Fixed Heights and Adaptive Tick Formatters */}
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 1: Monthly Trend */}
          <div className="rounded-xl border border-border p-4 bg-card shadow-sm flex flex-col justify-between">
            <div className="mb-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Monthly UOP Incurred Depreciation
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Actual historical depreciation incurred per calendar month
              </p>
            </div>

            <div className="h-[280px] w-full">
              {monthlyTrend.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  No monthly trend records
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtPesoAxis} width={65} />
                    <Tooltip
                      formatter={(v: number) => [pesoFmt.format(v), "Depreciation"]}
                      contentStyle={{ fontSize: "11px", borderRadius: "8px" }}
                    />
                    <Bar
                      dataKey="depreciation"
                      name="Depreciation"
                      radius={[4, 4, 0, 0]}
                      fill="#6366f1"
                      minPointSize={4}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Chart 2: By Machine (Filtered to Active Top 8, with Idle Note) */}
          <div className="rounded-xl border border-border p-4 bg-card shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  Top Producing Machines by Depreciation
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Depreciation burden for active UOP equipment
                </p>
              </div>
              {idleMachinesCount > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full font-medium shrink-0">
                  {idleMachinesCount} idle machine{idleMachinesCount > 1 ? "s" : ""} hidden
                </span>
              )}
            </div>

            <div className="h-[280px] w-full">
              {activeMachines.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground gap-1">
                  <BarChart2 className="h-6 w-6 text-muted-foreground/40" />
                  <span>No active machine depreciation in period</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={activeMachines}
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/60" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtPesoAxis} />
                    <YAxis
                      dataKey="machineName"
                      type="category"
                      tick={{ fontSize: 10 }}
                      width={130}
                      tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)}
                    />
                    <Tooltip
                      formatter={(v: number) => [pesoFmt.format(v), "Depreciation"]}
                      contentStyle={{ fontSize: "11px", borderRadius: "8px" }}
                    />
                    <Bar dataKey="depreciation" name="Depreciation" radius={[0, 4, 4, 0]} barSize={20}>
                      {activeMachines.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Chart 3: Output vs Depreciation (Observational Relationship) */}
          <div className="rounded-xl border border-border p-4 bg-card shadow-sm lg:col-span-2">
            <div className="mb-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Production Output vs. Depreciation (Observational Relationship)
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Observes actual units produced alongside resulting UOP depreciation expense across producing equipment
              </p>
            </div>

            <div className="h-[260px] w-full">
              {uopScatter.filter((m) => m.productionOutput > 0 || m.depreciation > 0).length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  No active UOP output recorded in selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={uopScatter.filter((m) => m.productionOutput > 0 || m.depreciation > 0)}
                    margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
                    <XAxis
                      dataKey="machineName"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                      width={55}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      tickFormatter={fmtPesoAxis}
                      width={65}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        name === "Depreciation" ? pesoFmt.format(v) : numFmt.format(v),
                        name,
                      ]}
                      contentStyle={{ fontSize: "11px", borderRadius: "8px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: 8 }} />
                    <Bar
                      yAxisId="left"
                      dataKey="productionOutput"
                      name="Production Output"
                      fill="#0ea5e9"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="depreciation"
                      name="Depreciation"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
