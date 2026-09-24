"use client";

import { memo } from "react";
import * as React from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { Pie, PieChart, Cell } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const COLOR_MAP: Record<string, string> = {
  APPROVED: "#22c55e",
  REJECTED: "#ef4444",
  PENDING: "#94a3b8",
};

const chartConfig = {
  count: {
    label: "Decisions",
  },
  APPROVED: {
    label: "Approved",
    color: "#22c55e",
  },
  REJECTED: {
    label: "Rejected",
    color: "#ef4444",
  },
  PENDING: {
    label: "Pending",
    color: "#94a3b8",
  },
} satisfies ChartConfig;

interface PieChartProps {
  data: { status: string; count: number; fill: string }[];
}

export const InvoiceSummaryPieChart = memo(function InvoiceSummaryPieChart({
  data,
}: PieChartProps) {
  const totalFinalized = React.useMemo(() => {
    return data
      .filter((item) => item.status !== "PENDING")
      .reduce((acc, curr) => acc + curr.count, 0);
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
      className="h-full"
    >
      <Card className="flex flex-col h-full rounded-xl border shadow-xs transition-shadow hover:shadow-md">
        <CardHeader className="items-center pb-0">
          <CardTitle>Approval Ratio</CardTitle>
          <CardDescription>Finalized Auditor Decisions</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-0">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square h-115 w-full"
          >
            <PieChart>
              <ChartTooltip
                content={<ChartTooltipContent nameKey="status" hideLabel />}
              />
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                stroke="#ffffff"
                strokeWidth={2}
                label={({ payload }) => {
                  return payload.status;
                }}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      COLOR_MAP[entry.status] ||
                      (entry.fill?.startsWith("#") ? entry.fill : "#94a3b8")
                    }
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2 text-sm">
          <div className="flex gap-2 leading-none font-medium">
            Decision throughput is stable <TrendingUp className="h-4 w-4" />
          </div>

          <div className="text-muted-foreground leading-none">
            Showing {totalFinalized} finalized requests (Excludes Pending)
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
});
