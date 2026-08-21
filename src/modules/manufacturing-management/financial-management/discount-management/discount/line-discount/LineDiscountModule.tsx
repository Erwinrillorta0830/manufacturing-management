// src/modules/financial-management/line-discount/LineDiscountModule.tsx
"use client";

import * as React from "react";
import { ColumnFiltersState } from "@tanstack/react-table";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

import type { LineDiscountRow } from "./type";
import { useLineDiscounts } from "./hooks/useLineDiscounts";
import { columns } from "./components/data-table/columns";
import { LineDiscountDataTable } from "./components/data-table";
import { LineDiscountTableSkeleton } from "./components/data-table/skeleton-loader";

import LineDiscountDialog from "./components/LineDiscountDialog";

export default function LineDiscountModule() {
  const { rows, loading, create, update } = useLineDiscounts();

  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  const [selected, setSelected] = React.useState<LineDiscountRow | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <div className="text-lg font-semibold">Line Discounts</div>
          <div className="text-sm text-muted-foreground">
            Register single line discounts used in sequential bundles.
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <LineDiscountTableSkeleton />
          ) : (
            <LineDiscountDataTable
              columns={columns}
              data={rows}
              columnFilters={columnFilters}
              onColumnFiltersChange={setColumnFilters}
              tableMeta={{
                onCreate: () => {
                  setSelected(null);
                  setCreateOpen(true);
                },
                onEdit: (row: LineDiscountRow) => {
                  setSelected(row);
                  setEditOpen(true);
                },
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Create */}
      <LineDiscountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        initial={null}
        onSubmit={create}
      />

      {/* Edit */}
      <LineDiscountDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={selected}
        onSubmit={async (payload) => {
          if (!selected) return;
          await update(selected.id, payload);
        }}
      />


    </div>
  );
}
