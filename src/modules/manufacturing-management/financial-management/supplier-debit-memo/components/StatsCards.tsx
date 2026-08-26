// src/modules/financial-management/accounting/supplier-debit-memo/components/StatsCards.tsx

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PhilippinePeso, TrendingDown, FileText } from "lucide-react";
import { formatPeso } from "../utils";

interface Stats {
  total:          number;
  available:      number;
  pendingSOA:     number;
  totalAvailable: number;
  totalAmount:    number;
}

interface StatsCardsProps {
  stats:   Stats;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const pctAvailable = stats.totalAmount
    ? ((stats.totalAvailable / stats.totalAmount) * 100).toFixed(1)
    : "0.0";
  const pctUtilized = stats.totalAmount
    ? (((stats.totalAmount - stats.totalAvailable) / stats.totalAmount) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full">

      <Card className="shadow-none border-border">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm text-muted-foreground">Total Memos</span>
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight">{stats.total}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.available} available
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-none border-border">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm text-muted-foreground">Total Available Amount</span>
            <PhilippinePeso className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-amber-600">
            {formatPeso(stats.totalAvailable)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{pctAvailable}% of total debit</p>
        </CardContent>
      </Card>

      <Card className="shadow-none border-border">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm text-muted-foreground">Total Debit Amount</span>
            <TrendingDown className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight">
            {formatPeso(stats.totalAmount)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{pctUtilized}% utilized</p>
        </CardContent>
      </Card>

    </div>
  );
}