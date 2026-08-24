"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Ban,
  Building,
  Calendar,
  EllipsisVertical,
  Eye,
  Package,
  ShieldCheck,
  SquarePen,
  Tag,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import { AssetTableData } from "../../types";
import { formatPHP, calculateAssetFinancials, getAssetImageUrl, parseDateTimeSafe } from "../../utils/lib";
import { DataTableColumnHeader } from "./table-column-header";

// --- Sub-components ---

const AssetCell = ({
  imageId,
  itemName,
}: {
  imageId: string | null;
  itemName: string;
}) => {
  const imageUrl = getAssetImageUrl(imageId);
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 overflow-hidden rounded-md border bg-muted flex items-center justify-center shrink-0">
        {imageUrl ? (
          <Image
            src={imageUrl}
            width={100}
            height={100}
            alt={itemName}
            className="h-full w-full object-cover transition-all hover:scale-110"
            unoptimized
          />
        ) : (
          <Package className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>
    </div>
  );
};

const ConditionBadge = ({ condition }: { condition: string }) => {
  const variants: Record<
    string,
    "default" | "destructive" | "outline" | "secondary"
  > = {
    Good: "default",
    Bad: "destructive",
    "Under Maintenance": "secondary",
    Discontinued: "outline",
  };
  return <Badge variant={variants[condition] || "outline"}>{condition}</Badge>;
};

interface AssetTableMeta {
  onEdit: (asset: AssetTableData) => void;
  onView: (asset: AssetTableData) => void;
}

// --- Column Definitions ---

export const columns: ColumnDef<AssetTableData>[] = [
  {
    accessorKey: "item_name",
    enableSorting: false,
    header: () => (
      <span className="text-xs font-semibold tracking-wider text-muted-foreground select-none">
        Asset
      </span>
    ),
    meta: {
      label: "Item Name",
      placeholder: "Search assets...",
      variant: "text",
    },
    cell: ({ row, table }) => {
      const name = row.original.item_name;
      const isValid = name && name !== "N/A";
      // const barcode = row.original.barcode;
      // const rfid = row.original.rfid_code;
      // const serial = row.original.serial;
      const meta = table.options.meta as AssetTableMeta;

      return (
        <div
          className="flex items-center gap-3 group max-w-62.5 cursor-pointer"
          title={name || "Unnamed Asset"}
          onClick={(e) => {
            e.stopPropagation();
            meta?.onView?.(row.original);
          }}
        >
          <AssetCell imageId={row.original.item_image} itemName={name} />
          <div className="flex flex-col min-w-0">
            <span
              title={name || undefined}
              className={`font-semibold truncate group-hover:text-primary transition-colors ${
                !isValid ? "text-muted-foreground italic" : "text-foreground"
              }`}
            >
              {name || "Unnamed Asset"}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {!isValid && (
                <span className="text-[10px] text-orange-600 font-bold uppercase tracking-tight">
                  Missing Item Link
                </span>
              )}
              {/* {barcode && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  BC: {barcode}
                </span>
              )}
              {rfid && !barcode && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  RFID: {rfid}
                </span>
              )}
              {serial && !barcode && !rfid && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  SN: {serial}
                </span>
              )} */}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "classification_name",
    enableSorting: false,
    header: () => (
      <span className="text-xs font-semibold tracking-wider text-muted-foreground select-none">
        Classification
      </span>
    ),
    meta: {
      label: "Classification",
      variant: "text",
      icon: Tag,
    },
    filterFn: (row, id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const cellVal = (row.getValue(id) as string) || "N/A";
      return value.includes(cellVal);
    },
    cell: ({ row }) => {
      const val = row.getValue("classification_name") as string;
      return val ? (
        <span title={val} className="truncate block max-w-40">
          {val}
        </span>
      ) : (
        <span className="text-muted-foreground italic">N/A</span>
      );
    },
  },
  {
    accessorKey: "asset_type",
    enableSorting: false,
    header: () => (
      <span className="text-xs font-semibold tracking-wider text-muted-foreground select-none">
        Asset Type
      </span>
    ),
    meta: {
      label: "Asset Type",
      variant: "multiSelect",
      options: [
        { label: "Administrative", value: "Administrative" },
        { label: "Production", value: "Production" },
      ],
    },
    filterFn: (row, id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const cellVal = (row.getValue(id) as string) || "Administrative";
      return value.includes(cellVal);
    },
    cell: ({ row }) => {
      const type = row.original.asset_type || "Administrative";
      return (
        <Badge
          variant={type === "Production" ? "default" : "secondary"}
          className="whitespace-nowrap font-medium"
        >
          {type === "Production" ? "Production" : "Administrative"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "depreciation_method",
    enableSorting: false,
    header: () => (
      <span className="text-xs font-semibold tracking-wider text-muted-foreground select-none">
        Depreciation
      </span>
    ),
    meta: {
      label: "Depreciation",
      variant: "multiSelect",
      options: [
        { label: "Straight Line", value: "Straight Line" },
        { label: "Units of Production", value: "Units of Production" },
      ],
    },
    filterFn: (row, id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const cellVal = (row.getValue(id) as string) || "Straight Line";
      return value.includes(cellVal);
    },
    cell: ({ row }) => {
      const method = row.original.depreciation_method || "Straight Line";
      const isUOP = method === "Units of Production";
      return (
        <Badge
          variant="outline"
          className={`whitespace-nowrap font-medium ${
            isUOP
              ? "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/40"
              : "border-slate-300 text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-900/30"
          }`}
        >
          {isUOP ? "Units of Production" : "Straight Line"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "department_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Department" />
    ),
    meta: {
      label: "Department",
      variant: "text",
      icon: Building,
    },
    filterFn: (row, id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const cellVal = (row.getValue(id) as string) || "Unassigned";
      return value.includes(cellVal);
    },
    cell: ({ row }) => {
      const val = row.getValue("department_name") as string;
      return val ? (
        <span title={val} className="truncate block max-w-40">
          {val}
        </span>
      ) : (
        <span className="text-muted-foreground italic">Unassigned</span>
      );
    },
  },
  {
    accessorKey: "assigned_to_name",
    enableSorting: false,
    header: () => (
      <span className="text-xs font-semibold tracking-wider text-muted-foreground select-none">
        Assigned To
      </span>
    ),
    meta: {
      label: "Assigned To",
      variant: "text",
      icon: Building,
    },
    filterFn: (row, id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const cellVal = (row.getValue(id) as string) || "Unassigned";
      return value.includes(cellVal);
    },
    cell: ({ row }) => {
      const val = row.getValue("assigned_to_name") as string;
      return val ? (
        <span title={val} className="truncate block max-w-40">
          {val}
        </span>
      ) : (
        <span className="text-muted-foreground italic">Unassigned</span>
      );
    },
  },
  {
    accessorKey: "condition",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Condition" />
    ),
    meta: {
      label: "Condition",
      variant: "multiSelect",
      options: [
        { label: "Good", value: "Good", icon: ShieldCheck },
        { label: "Bad", value: "Bad", icon: AlertTriangle },
        { label: "Maintenance", value: "Under Maintenance", icon: Wrench },
        { label: "Discontinued", value: "Discontinued", icon: Ban },
      ],
    },
    filterFn: (row, id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const cellVal = (row.getValue(id) as string) || "";
      return value.includes(cellVal);
    },
    cell: ({ row }) => <ConditionBadge condition={row.getValue("condition")} />,
  },
  {
    accessorKey: "acquisition_cost",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Acquisition Cost" />
    ),
    cell: ({ row }) => {
      const acqCost =
        row.original.acquisition_cost != null && Number(row.original.acquisition_cost) > 0
          ? Number(row.original.acquisition_cost)
          : Number(row.original.cost_per_item || 0) * Number(row.original.quantity || 1);
      return <div className="font-semibold text-foreground">{formatPHP(acqCost)}</div>;
    },
  },
  {
    accessorKey: "residual_value",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Residual Value" />
    ),
    cell: ({ row }) => {
      const resVal = Number(row.original.residual_value || 0);
      return <div className="font-medium text-muted-foreground">{formatPHP(resVal)}</div>;
    },
  },
  {
    accessorKey: "book_value",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Book Value" />
    ),
    cell: ({ row }) => {
      const asset = row.original;
      const financials = calculateAssetFinancials(asset);

      return (
        <span className="font-bold text-primary">
          {formatPHP(financials.bookValue)}
        </span>
      );
    },
  },
  {
    accessorKey: "date_acquired",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Acquired" />
    ),
    filterFn: (row, id, filterValue: { from?: Date; to?: Date }) => {
      if (!filterValue || (!filterValue.from && !filterValue.to)) return true;
      const dateStr = row.getValue(id) as string;
      if (!dateStr) return false;
      const rowDate = parseDateTimeSafe(dateStr);
      if (!rowDate) return false;

      if (filterValue.from && filterValue.to) {
        const from = new Date(filterValue.from);
        from.setHours(0, 0, 0, 0);
        const to = new Date(filterValue.to);
        to.setHours(23, 59, 59, 999);
        return rowDate >= from && rowDate <= to;
      }
      if (filterValue.from) {
        const from = new Date(filterValue.from);
        from.setHours(0, 0, 0, 0);
        return rowDate >= from;
      }
      if (filterValue.to) {
        const to = new Date(filterValue.to);
        to.setHours(23, 59, 59, 999);
        return rowDate <= to;
      }
      return true;
    },
    cell: ({ row }) => {
      const date = row.getValue("date_acquired") as string;
      if (!date) return <span className="text-muted-foreground">—</span>;
      const d = parseDateTimeSafe(date);
      if (!d) return <span className="text-muted-foreground">{date}</span>;
      const hasTime = date.includes("T") || date.includes(":") || date.includes(" ");
      return (
        <div className="flex flex-col text-xs leading-tight">
          <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
            <span>
              {new Intl.DateTimeFormat("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              }).format(d)}
            </span>
          </div>
          {hasTime && (
            <span className="text-[11px] text-muted-foreground pl-5 whitespace-nowrap">
              {new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              }).format(d)}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const meta = table.options.meta as AssetTableMeta;
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0" size="icon">
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => meta?.onEdit(row.original)}>
                <SquarePen className="mr-2 h-4 w-4" /> Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => meta?.onView(row.original)}>
                <Eye className="mr-2 h-4 w-4" /> View Details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
