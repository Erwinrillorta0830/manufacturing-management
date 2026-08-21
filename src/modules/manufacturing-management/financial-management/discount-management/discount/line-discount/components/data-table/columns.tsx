// src/modules/financial-management/line-discount/components/data-table/columns.tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical, SquarePen } from "lucide-react";

import type { LineDiscountRow } from "../../type";
import { DataTableColumnHeader } from "./table-column-header";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function fmtPct(v: string | number) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "");
  return n.toFixed(10).replace(/\.?0+$/, "");
}

interface LineDiscountTableMeta {
  onEdit: (row: LineDiscountRow) => void;
}

export const columns: ColumnDef<LineDiscountRow>[] = [
  {
    accessorKey: "line_discount",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Code" />,
    meta: {
      label: "Code",
      placeholder: "Search code...",
      variant: "text",
    },
    cell: ({ row }) => <div className="font-medium">{row.original.line_discount}</div>,
  },
  {
    accessorKey: "percentage",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Percent" />,
    cell: ({ row }) => <div className="font-mono">{fmtPct(row.original.percentage)}</div>,
  },
  {
    accessorKey: "description",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Description" />,
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground truncate max-w-[520px]">
        {row.original.description || "—"}
      </div>
    ),
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const meta = table.options.meta as LineDiscountTableMeta;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0" size="icon">
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => meta?.onEdit?.(row.original)}>
              <SquarePen className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
