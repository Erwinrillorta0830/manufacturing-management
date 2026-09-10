import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { DiscountType } from "../types/discount-type.schema";
import { ProductPerSupplierWithDetails } from "../types/product-per-suppplier.schema";
import { Combobox } from "./ui/Combobox";

interface ProductListItemProps {
  product: ProductPerSupplierWithDetails;
  discountTypes: DiscountType[];
  disabled?: boolean;
  onDiscountChange: (
    productPerSupplierId: number,
    discountTypeId: number | null,
  ) => void;
  onRemove: (productPerSupplierId: number) => void;
}

export function ProductListItem({
  product,
  discountTypes,
  disabled = false,
  onDiscountChange,
  onRemove,
}: ProductListItemProps) {
  return (
    <TableRow className="hover:bg-muted/30 transition-colors group">
      {/* Product info */}
      <TableCell className="py-3 px-6">
        <p className="text-sm font-semibold text-foreground truncate">
          {product.product_name}
        </p>
        {product.unit_of_measurement != null && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {product.unit_of_measurement}
          </p>
        )}
      </TableCell>

      {/* Discount selector */}
      <TableCell className="py-3 px-6 w-[280px]">
        <Combobox
          options={[
            { value: "none", label: "No Discount" },
            ...discountTypes.map((dt) => ({
              value: dt.id.toString(),
              label: dt.discount_type,
            })),
          ]}
          value={product.discount_type?.toString() || "none"}
          onValueChange={(v) => {
            const discountId = !v || v === "none" ? null : parseInt(v);
            onDiscountChange(product.id, discountId);
          }}
          disabled={disabled}
          placeholder="No Discount"
          className="h-9 w-full"
        />
      </TableCell>

      {/* Remove */}
      <TableCell className="py-3 px-6 w-[80px] text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
              title="Remove Product"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Product?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove <strong>{product.product_name}</strong> from this supplier?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRemove(product.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
