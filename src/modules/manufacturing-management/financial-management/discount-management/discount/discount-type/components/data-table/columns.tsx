"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "./table-column-header";

import type { DiscountTypeRow, AppliedLine } from "../../type";

function pctLabel(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(10).replace(/\.?0+$/, "")}%`;
}

export const columns: ColumnDef<DiscountTypeRow>[] = [
  {
    accessorKey: "discount_type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Discount Type" />
    ),
    enableSorting: true,
    enableHiding: true,
    cell: ({ row }) => <div className="font-medium">{row.original.discount_type}</div>,
  },
  {
    accessorKey: "total_percent",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Total Percent" />
    ),
    enableSorting: true,
    enableHiding: true,
    cell: ({ row }) => <div>{pctLabel(row.original.total_percent)}</div>,
  },
  {
    id: "applied_lines",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Applied Lines (in order)" />
    ),
    enableSorting: false,
    enableHiding: true,
    cell: ({ row }) => {
      const lines = row.original.applied_lines ?? [];
      if (!lines.length) return <span className="text-muted-foreground">—</span>;

      return (
        <div className="flex flex-wrap gap-2">
          {lines.map((l: AppliedLine, idx: number) => (
            <Badge key={`${l?.line_id ?? "x"}-${idx}`} variant="secondary">
              {String(l?.code ?? `L${l?.line_id ?? ""}`)}{" "}
              {l?.percentage != null ? `(${pctLabel(l.percentage)})` : ""}
            </Badge>
          ))}
        </div>
      );
    },
  },
];
