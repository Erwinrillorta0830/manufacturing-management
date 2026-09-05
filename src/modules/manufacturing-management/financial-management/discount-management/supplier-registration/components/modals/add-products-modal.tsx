"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProducts } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/hooks/useProducts";
import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

interface AddProductsModalProps {
  open: boolean;
  onClose: () => void;
  onAddProducts: (productIds: number[]) => Promise<boolean>;
  assignedProductIds: number[];
}

export function AddProductsModal({
  open,
  onClose,
  onAddProducts,
  assignedProductIds,
}: AddProductsModalProps) {
  const { products, isLoading: productsLoading } = useProducts();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out products already assigned and de-duplicate the available list
  const availableProducts = useMemo(() => {
    const assignedSet = new Set(assignedProductIds.map((id) => Number(id)));
    const uniqueProducts = new Map<number, (typeof products)[0]>();

    products.forEach((p) => {
      const productId = Number(
        p.product_id || (p as { id?: number; product_id?: number }).id,
      );
      if (!assignedSet.has(productId) && !uniqueProducts.has(productId)) {
        uniqueProducts.set(productId, p);
      }
    });

    return Array.from(uniqueProducts.values());
  }, [products, assignedProductIds]);

  // Filter available products based on search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return availableProducts;
    const query = searchQuery.toLowerCase();
    return availableProducts.filter(
      (p) =>
        (p.short_description?.toLowerCase() ?? "").includes(query) ||
        (p.product_name?.toLowerCase() ?? "").includes(query) ||
        (String(p.unit_of_measurement ?? "").toLowerCase()).includes(query),
    );
  }, [availableProducts, searchQuery]);

  const toggleProduct = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleClose = () => {
    setSearchQuery("");
    setSelectedIds(new Set());
    onClose();
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    const success = await onAddProducts(Array.from(selectedIds));
    if (success) {
      handleClose();
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[800px] h-[80vh] flex flex-col gap-0 p-0"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Select Products</DialogTitle>
          <DialogDescription>
            Choose multiple products to add to this supplier.
          </DialogDescription>

          <div className="relative mt-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full px-6">
            <div className="py-2 space-y-1">
              {productsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  {searchQuery ? "No products found" : "All products assigned"}
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <label
                    key={product.product_id}
                    className="flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group"
                  >
                    <Checkbox
                      checked={selectedIds.has(product.product_id)}
                      onCheckedChange={() => toggleProduct(product.product_id)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none truncate group-hover:text-primary transition-colors">
                        {product.product_name || product.short_description}
                      </p>
                      {product.unit_of_measurement != null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {product.unit_of_measurement}
                        </p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || isSubmitting}
            className="min-w-[140px]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              `Add ${selectedIds.size > 0 ? selectedIds.size : ""} Product${selectedIds.size !== 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

