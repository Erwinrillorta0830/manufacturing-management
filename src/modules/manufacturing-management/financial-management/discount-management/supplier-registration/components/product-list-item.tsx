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
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { DiscountType } from "../types/discount-type.schema";
import { ProductPerSupplierWithDetails } from "../types/product-per-suppplier.schema";
import { Combobox } from "./ui/Combobox";

interface ProductListItemProps {
  product: ProductPerSupplierWithDetails;
  discountTypes: DiscountType[];
  onDiscountChange: (
    productPerSupplierId: number,
    discountTypeId: number | null,
  ) => Promise<boolean>;
  onRemove: (productPerSupplierId: number) => Promise<boolean>;
}

export function ProductListItem({
  product,
  discountTypes,
  onDiscountChange,
  onRemove,
}: ProductListItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  return (
    <div className="grid grid-cols-[1fr_200px_40px] gap-4 items-center px-6 py-3 hover:bg-muted/30 transition-colors group">
      {/* Product info */}
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{product.product_name}</p>
        {product.unit_of_measurement != null && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {product.unit_of_measurement}
          </p>
        )}
      </div>

      {/* Discount selector */}
      <Combobox
        options={[
          { value: "none", label: "No Discount" },
          ...discountTypes.map((dt) => ({
            value: dt.id.toString(),
            label: dt.discount_type,
          })),
        ]}
        value={product.discount_type?.toString() || "none"}
        onValueChange={async (v) => {
          setIsUpdating(true);
          const discountId = !v || v === "none" ? null : parseInt(v);
          await onDiscountChange(product.id, discountId);
          setIsUpdating(false);
        }}
        disabled={isUpdating}
        placeholder="No Discount"
      />

      {/* Remove */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
