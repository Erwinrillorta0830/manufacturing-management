"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/components/data-table/table-column-header";
import { Supplier } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";
import { formatDate } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/utils/utils";
import { ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  ChevronRight,
  Eye,
  Fingerprint,
  User,
} from "lucide-react";
import Image from "next/image";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

interface ColumnsProps {
  onView: (supplier: Supplier) => void;
}

export const createColumns = ({
  onView,
}: ColumnsProps): ColumnDef<Supplier>[] => [
  {
    accessorKey: "supplier_name",
    header: "Supplier Name",
    cell: ({ row }) => {
      const name = row.getValue("supplier_name") as string;
      const shortcut = row.original.supplier_shortcut;
      const image = row.original.supplier_image;
      return (
        <div className="flex items-center gap-3">
          {image ? (
            <Image
              src={`${API_BASE_URL}/assets/${image}`}
              alt={name}
              width={32}
              height={32}
              className="h-8 w-8 rounded-sm object-cover border shrink-0 aspect-square"
              unoptimized
            />
          ) : (
            <div className="h-8 w-8 rounded-sm flex items-center justify-center border bg-muted shrink-0">
              <span className="text-xs font-bold text-muted-foreground">
                {name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-bold text-foreground">{name}</span>
            {shortcut && (
              <span className="text-xs text-muted-foreground font-mono">{shortcut}</span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "contact_person",
    header: "Contact Person",
    cell: ({ row }) => (
      <div className="flex items-center gap-2 text-xs">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{row.getValue("contact_person") || "—"}</span>
      </div>
    ),
  },
  {
    accessorKey: "tin_number",
    header: "TIN Number",
    cell: ({ row }) => {
      const tin = row.getValue("tin_number") as string;
      return (
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Fingerprint className="h-3.5 w-3.5" />
          {tin || "—"}
        </div>
      );
    },
  },
  {
    accessorKey: "date_added",
    header: "Date Added",
    cell: ({ row }) => {
      const date = row.getValue("date_added") as string;
      return (
        <div className="flex items-center gap-2 text-xs">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{formatDate(date)}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => {
      const isActive = row.getValue("isActive") as number;
      return (
        <Badge variant={isActive === 1 ? "default" : "secondary"} className="font-normal text-[11px]">
          {isActive === 1 ? "Active" : "Inactive"}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right uppercase font-bold text-xs">Action</div>,
    cell: ({ row }) => {
      const supplier = row.original;

      return (
        <div className="text-right">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onView(supplier)}
            className="h-8 gap-2 text-primary hover:text-primary hover:bg-primary/10 px-3 font-semibold"
          >
            <Eye className="h-3.5 w-3.5" />
            Manage Discount
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    },
  },
];

