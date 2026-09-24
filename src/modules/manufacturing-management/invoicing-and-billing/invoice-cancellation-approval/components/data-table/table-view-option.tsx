import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceRow } from "../../types";
import { Settings2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface TableToolbarProps {
  table: Table<InvoiceRow>;
}

export function TableToolbar({ table }: TableToolbarProps) {
  const hideableColumns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && column.getCanHide(),
    );

  const isAllVisible = hideableColumns.every((col) => col.getIsVisible());

  return (
    <div className="flex items-center justify-between px-0">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 transition-all hover:bg-muted"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden lg:inline text-xs">View</span>
              <span className="lg:hidden text-xs">Columns</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0 text-xs text-muted-foreground font-semibold">
                Toggle Columns
              </DropdownMenuLabel>
              {!isAllVisible && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    table.resetColumnVisibility();
                    toast.success("Columns reset to default view", {
                      duration: 1500,
                    });
                  }}
                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
            </div>
            <DropdownMenuSeparator />
            {hideableColumns.map((column) => {
              const label = String(
                ((column.columnDef.meta as Record<string, unknown>)?.label as string) ??
                (typeof column.columnDef.header === "string"
                  ? column.columnDef.header
                  : column.id)
              );
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize text-xs cursor-pointer transition-colors duration-150"
                  checked={column.getIsVisible()}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(value) => {
                    column.toggleVisibility(!!value);
                    toast.info(
                      `${label.replace(/_/g, " ")} column ${value ? "shown" : "hidden"}`,
                      { duration: 1500 }
                    );
                  }}
                >
                  {label.replace(/_/g, " ")}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
