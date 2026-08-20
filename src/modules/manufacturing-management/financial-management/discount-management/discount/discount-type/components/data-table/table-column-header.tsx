"use client";

import type { Column } from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function DataTableColumnHeader<TData, TValue>({
  column,
  label,
  className,
}: {
  column: Column<TData, TValue>;
  label: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <div className={cn("text-sm font-semibold px-2 py-1", className)}>{label}</div>;
  }

  const isSorted = column.getIsSorted();

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(isSorted === "asc")}
      className={cn(
        "group inline-flex items-center gap-1 rounded-md px-2 py-1 text-left text-sm font-semibold hover:bg-accent",
        className,
      )}
    >
      <span>{label}</span>
      {isSorted === "desc" ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : isSorted === "asc" ? (
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}
