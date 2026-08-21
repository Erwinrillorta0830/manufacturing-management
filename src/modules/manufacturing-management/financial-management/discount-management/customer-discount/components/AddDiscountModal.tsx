"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus } from "lucide-react";
import { Customer, CustomerDiscount, Supplier, Category, DiscountType } from "../types";

interface AddDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  suppliers: Supplier[];
  categories: Category[];
  discountTypes: DiscountType[];
  onAdd: (data: Partial<CustomerDiscount>) => Promise<void>;
}

export function AddDiscountModal({
  isOpen,
  onClose,
  customer,
  suppliers,
  categories,
  discountTypes,
  onAdd,
}: AddDiscountModalProps) {
  const [supplierId, setSupplierId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [discountTypeId, setDiscountTypeId] = useState<string>("");

  const handleAdd = async () => {
    if (!customer || !supplierId || !discountTypeId) return;
    
    await onAdd({
      customer_code: customer.customer_code,
      supplier_id: parseInt(supplierId),
      category_id: categoryId ? parseInt(categoryId) : undefined,
      discount_type: parseInt(discountTypeId),
    });

    // Reset fields and close
    setSupplierId("");
    setCategoryId("");
    setDiscountTypeId("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Add Customer Discount</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Supplier</label>
            <SearchableSelect
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="Select Supplier"
              options={suppliers.map((s) => ({ value: String(s.id), label: s.supplier_name }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Category</label>
            <SearchableSelect
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Select Category"
              options={categories.map((c) => ({ value: String(c.category_id), label: c.category_name }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Discount Type</label>
            <SearchableSelect
              value={discountTypeId}
              onValueChange={setDiscountTypeId}
              placeholder="Select Type"
              options={discountTypes.map((dt) => ({ 
                value: String(dt.id), 
                label: `${dt.discount_type} (${Number(dt.total_percent).toFixed(2)}%)` 
              }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleAdd} 
            className="gap-2"
            disabled={!supplierId || !discountTypeId}
          >
            <Plus className="h-4 w-4" /> Save Discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
