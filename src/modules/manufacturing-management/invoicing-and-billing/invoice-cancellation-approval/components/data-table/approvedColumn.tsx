"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { CircleCheck } from "lucide-react";
import { InvoiceRow } from "@/modules/manufacturing-management/invoicing-and-billing/invoice-cancellation-approval/types";
import { DataTableColumnHeader } from "./table-column-header";

export const approvedColumns: ColumnDef<InvoiceRow>[] = [
  {
    accessorKey: "invoice_no",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Invoice No." />
    ),
    meta: { label: "Invoice No" },
  },
  {
    accessorKey: "customer_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Customer" />
    ),
    meta: { label: "Customer" },
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium text-xs text-foreground">
          {row.original.customer_name || "-"}
        </span>
        {row.original.customer_code && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {row.original.customer_code}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "total_amount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Amount" />
    ),
    meta: { label: "Total Amount" },
    cell: ({ row }) => {
      const amount = row.original.total_amount;
      return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(amount);
    },
  },
  {
    accessorKey: "sales_order_id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="S.O No." />
    ),
    meta: { label: "Sales Order Id" },
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.sales_order_id}
      </span>
    ),
  },
  {
    accessorKey: "reason_code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Reason Type" />
    ),
    meta: { label: "Reason Code" },
    cell: ({ row }) => (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        {row.original.reason_code}
      </Badge>
    ),
  },
  {
    accessorKey: "remarks",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Remarks" />
    ),
    meta: { label: "Remarks" },
    cell: ({ row }) => (
      <span className="text-xs italic text-muted-foreground line-clamp-1 max-w-37.5">
        {row.original.remarks || "No remarks"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: { label: "Status" },
    cell: () => {
      return (
        <Badge variant="secondary" className="px-1.5">
          <CircleCheck className="text-green-500" />
          Approved
        </Badge>
      );
    },
  },
  {
    accessorKey: "date_approved",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Date Approved" />
    ),
    meta: { label: "Date Approved" },
    cell: ({ row }) => {
      const date = row.original.date_approved;
      if (!date)
        return (
          <span className="text-muted-foreground italic text-xs">N/A</span>
        );

      return (
        <div className="flex flex-col">
          <span className="text-xs font-medium">
            {new Date(date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(date).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      );
    },
  },
];
