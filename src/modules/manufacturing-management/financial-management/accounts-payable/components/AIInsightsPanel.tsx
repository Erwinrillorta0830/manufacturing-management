"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Sparkles, RefreshCw, AlertTriangle, Lightbulb, Target,
  Briefcase, Wallet, Building2, CheckCircle2, AlertCircle,
  Info, CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatPeso } from "../utils";
import type { APRecord } from "../types";

type HealthStatus = "healthy" | "caution" | "critical";
interface FocusArea { category: "Trade" | "Non-Trade"; headline: string; observations: string[]; }
interface AgingRow { bucket: string; outstanding: number; note: string; }
interface APInsight {
  summary: string; healthStatus: HealthStatus;
  keyFindings: string[]; risks: string[]; recommendations: string[];
  focusAreas: FocusArea[]; topSupplier: { name: string; outstanding: number } | null;
  aging: AgingRow[]; generatedBy: "openai" | "anthropic" | "gemini" | "rules-engine";
  generatedAt: string;
}
interface APIResponse { success: boolean; data?: APInsight; message?: string; }
interface APInsightSummary {
  recordCount: number;
  totalPayable: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
  totalOverdue: number;
  categories: Array<{
    category: "Trade" | "Non-Trade";
    count: number;
    payable: number;
    paid: number;
    outstanding: number;
    overdue: number;
  }>;
  aging: AgingRow[];
  topSuppliers: Array<{ name: string; outstanding: number }>;
}

const HEALTH: Record<HealthStatus, { label: string; chip: string; dot: string; }> = {
  healthy:  { label: "Healthy",  chip: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", dot: "bg-emerald-500" },
  caution:  { label: "Caution",  chip: "bg-amber-500/10 text-amber-700 border-amber-500/30",     dot: "bg-amber-500"   },
  critical: { label: "Critical", chip: "bg-rose-500/10 text-rose-700 border-rose-500/30",         dot: "bg-rose-500"   },
};

function cn(...c: Array<string | false | null | undefined>): string { return c.filter(Boolean).join(" "); }

function CategoryPill({ category }: { category: "Trade" | "Non-Trade" }) {
  const isTrade = category === "Trade";
  const Icon = isTrade ? Briefcase : Wallet;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
      isTrade ? "bg-sky-500/10 text-sky-700 border-sky-500/30" : "bg-amber-500/10 text-amber-700 border-amber-500/30")}>
      <Icon className="h-3 w-3" />{category}
    </span>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{children}</p>
    </div>
  );
}

function AISkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}

interface AIInsightsPanelProps { records: APRecord[]; }

export function AIInsightsPanel({ records }: AIInsightsPanelProps) {
  const [insight,   setInsight]   = useState<APInsight | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const payload = useMemo(() => {
    const summary: APInsightSummary = {
      recordCount: records.length,
      totalPayable: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueCount: 0,
      totalOverdue: 0,
      categories: [
        { category: "Trade", count: 0, payable: 0, paid: 0, outstanding: 0, overdue: 0 },
        { category: "Non-Trade", count: 0, payable: 0, paid: 0, outstanding: 0, overdue: 0 },
      ],
      aging: [
        { bucket: "0-30", outstanding: 0, note: "Not yet due or due within 30 days" },
        { bucket: "31-60", outstanding: 0, note: "Mildly past due" },
        { bucket: "61-90", outstanding: 0, note: "Significantly past due" },
        { bucket: "91+", outstanding: 0, note: "Critical - escalate payments" },
      ],
      topSuppliers: [],
    };
    const categoryMap = new Map(summary.categories.map((item) => [item.category, item]));
    const supplierTotals = new Map<string, number>();

    for (const record of records) {
      summary.totalPayable += record.amountPayable;
      summary.totalPaid += record.amountPaid;
      summary.totalOutstanding += record.outstandingBalance;
      const isOverdue = record.aging !== null && record.aging >= 0 && record.outstandingBalance > 0;
      if (isOverdue) {
        summary.overdueCount += 1;
        summary.totalOverdue += record.outstandingBalance;
      }

      const category = categoryMap.get(record.apCategory);
      if (category) {
        category.count += 1;
        category.payable += record.amountPayable;
        category.paid += record.amountPaid;
        category.outstanding += record.outstandingBalance;
        if (isOverdue) category.overdue += 1;
      }

      if (record.outstandingBalance > 0) {
        supplierTotals.set(
          record.supplier,
          (supplierTotals.get(record.supplier) ?? 0) + record.outstandingBalance,
        );
        const aging = record.aging ?? -1;
        const bucketIndex = aging <= 30 ? 0 : aging <= 60 ? 1 : aging <= 90 ? 2 : 3;
        summary.aging[bucketIndex].outstanding += record.outstandingBalance;
      }
    }

    summary.topSuppliers = Array.from(supplierTotals, ([name, outstanding]) => ({ name, outstanding }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5);

    return { summary };
  }, [records]);

  const fetchInsight = useCallback(async () => {
    if (records.length === 0) { setInsight(null); setError("No records to analyze."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/manufacturing/financial-management/accounts-payable/ai-insights", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      const json = (await res.json()) as APIResponse;
      if (!json.success || !json.data) throw new Error(json.message || "AI endpoint returned an error.");
      setInsight(json.data); setFetchedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setInsight(null);
    } finally { setLoading(false); }
  }, [payload, records.length]);

  if (records.length === 0) {
    return (
      <Card className="relative overflow-hidden border-border shadow-none">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-fuchsia-500/5 to-sky-500/5 pointer-events-none" aria-hidden />
        <CardContent className="relative py-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shrink-0">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black">AI Insights</p>
            <p className="text-[11px] text-muted-foreground">Adjust your filters to give the AI something to analyze.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const generatedByLabel =
    insight?.generatedBy === "rules-engine" ? "Rules-based analysis" :
    insight?.generatedBy === "openai"      ? "OpenAI" :
    insight?.generatedBy === "anthropic"   ? "Anthropic" :
    insight?.generatedBy === "gemini"      ? "Gemini" : "AI";

  return (
    <Card className="relative overflow-hidden border-border shadow-none">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-fuchsia-500/5 to-sky-500/5 pointer-events-none" aria-hidden />
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 blur-3xl pointer-events-none" aria-hidden />

      <CardHeader className="relative border-b border-border/50 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shrink-0">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                AI Insights
                {insight && (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", HEALTH[insight.healthStatus].chip)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH[insight.healthStatus].dot)} />
                    {HEALTH[insight.healthStatus].label}
                  </span>
                )}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Powered by {generatedByLabel}
                {insight && fetchedAt
                  ? ` \u00b7 refreshed ${new Date(fetchedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
                  : " \u00b7 click refresh to generate"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInsight} disabled={loading}
            className="h-8 px-3 text-xs gap-1.5 self-start sm:self-auto">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {insight ? "Re-analyze" : "Generate insights"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="relative pt-4">
        {loading ? <AISkeleton /> :
         error ? (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-red-700">Could not generate insights</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        ) : !insight ? (
          <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
              <Sparkles className="h-5 w-5 text-violet-600" />
            </div>
            <p className="text-sm font-bold">Ready when you are</p>
            <p className="text-[11px] text-muted-foreground max-w-md">
              Click <span className="font-black text-foreground">Generate insights</span> to analyze
              the {records.length} record{records.length === 1 ? "" : "s"} currently in view.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Executive summary */}
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Executive summary</p>
              </div>
              <p className="text-sm leading-relaxed">{insight.summary}</p>
            </div>

            {/* Key findings */}
            {insight.keyFindings.length > 0 && (
              <div>
                <SectionLabel icon={<Target className="h-3.5 w-3.5" />}>Key findings</SectionLabel>
                <ul className="space-y-1.5">
                  {insight.keyFindings.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Focus areas */}
            {insight.focusAreas.length > 0 && (
              <div>
                <SectionLabel icon={<Briefcase className="h-3.5 w-3.5" />}>Focus areas</SectionLabel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insight.focusAreas.map(area => (
                    <div key={area.category}
                      className={cn("relative overflow-hidden rounded-xl border bg-card p-3.5",
                        area.category === "Trade" ? "border-sky-500/30" : "border-amber-500/30")}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <CategoryPill category={area.category} />
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          {area.observations.length} insight{area.observations.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="text-xs font-black leading-tight mb-1.5">{area.headline}</p>
                      <ul className="space-y-1">
                        {area.observations.map((obs, i) => (
                          <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-current shrink-0" />
                            <span>{obs}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top supplier + Aging */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insight.topSupplier && (
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Largest exposure</p>
                  </div>
                  <p className="text-sm font-black truncate">{insight.topSupplier.name}</p>
                  <p className="text-lg font-black tabular-nums text-primary mt-0.5">
                    {formatPeso(insight.topSupplier.outstanding)}
                  </p>
                </div>
              )}

              {insight.aging.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aging buckets</p>
                  </div>
                  <div className="space-y-1.5">
                    {insight.aging.map(b => {
                      const max = Math.max(1, ...insight.aging.map(x => x.outstanding));
                      const pct = (b.outstanding / max) * 100;
                      const tone = b.bucket === "91+"  ? "bg-rose-500"
                                : b.bucket === "61-90" ? "bg-amber-500"
                                : b.bucket === "31-60" ? "bg-sky-500"
                                                        : "bg-emerald-500";
                      return (
                        <div key={b.bucket} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold">{b.bucket} days</span>
                            <span className="font-mono tabular-nums">{formatPeso(b.outstanding)}</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Risks + Recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Risks</p>
                </div>
                {insight.risks.length > 0 ? (
                  <ul className="space-y-1.5">
                    {insight.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">No significant risks identified.</p>
                )}
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="h-3.5 w-3.5 text-emerald-700" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Recommendations</p>
                </div>
                {insight.recommendations.length > 0 ? (
                  <ul className="space-y-1.5">
                    {insight.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">No recommendations at this time.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
