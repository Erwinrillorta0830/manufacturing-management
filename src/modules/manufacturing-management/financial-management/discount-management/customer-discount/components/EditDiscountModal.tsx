"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ModalSearchableSelect } from "./ModalSearchableSelect";
import { Save } from "lucide-react";
import { CustomerDiscount, Supplier, Category, DiscountType } from "../types";

interface EditDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  discount: CustomerDiscount | null;
  suppliers: Supplier[];
  categories: Category[];
  discountTypes: DiscountType[];
  onEdit: (data: Partial<CustomerDiscount> & { id: number }) => Promise<void>;
}

export function EditDiscountModal({
  isOpen,
  onClose,
  discount,
  suppliers,
  categories,
  discountTypes,
  onEdit,
}: EditDiscountModalProps) {
  const [productType, setProductType] = useState<"raw" | "finished">("raw");
  const [supplierId, setSupplierId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [discountTypeId, setDiscountTypeId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && discount) {
      const sId = typeof discount.supplier_id === 'object' ? discount.supplier_id?.id : discount.supplier_id;
      const cId = typeof discount.category_id === 'object' ? discount.category_id?.category_id : discount.category_id;
      const dtId = typeof discount.discount_type === 'object' ? discount.discount_type?.id : discount.discount_type;
      
      setProductType(sId ? "raw" : "finished");
      setSupplierId(sId ? String(sId) : "");
      setCategoryId(cId ? String(cId) : "");
      setDiscountTypeId(dtId ? String(dtId) : "");
    }
  }, [isOpen, discount]);

  const handleEdit = async () => {
    if (isSaving) return;
    if (!discount || !discountTypeId) return;
    if (productType === "raw" && !supplierId) return;
    
    try {
      setIsSaving(true);
      await onEdit({
        id: discount.id,
        supplier_id: productType === "finished" ? null : parseInt(supplierId),
        category_id: categoryId ? parseInt(categoryId) : undefined,
        discount_type: parseInt(discountTypeId),
      });

      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const isSaveDisabled = 
    isSaving ||
    !discountTypeId || 
    (productType === "raw" && !supplierId);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Edit Customer Discount</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase text-muted-foreground">Product Type</label>
            <RadioGroup 
              value={productType} 
              onValueChange={(val) => {
                setProductType(val as "raw" | "finished");
                if (val === "finished") {
                  setSupplierId("");
                }
              }}
              className="flex items-center gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="raw" id="edit-raw-materials" />
                <Label htmlFor="edit-raw-materials" className="font-normal cursor-pointer">Raw Materials / Packaging</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="finished" id="edit-finished-goods" />
                <Label htmlFor="edit-finished-goods" className="font-normal cursor-pointer">Finished Goods</Label>
              </div>
            </RadioGroup>
          </div>

          {productType === "raw" && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground">Supplier</label>
              <ModalSearchableSelect
                value={supplierId}
                onValueChange={setSupplierId}
                placeholder="Select Supplier"
                options={suppliers.map((s) => ({ value: String(s.id), label: s.supplier_name }))}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Category</label>
            <ModalSearchableSelect
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Select Category"
              options={categories.map((c) => ({ value: String(c.category_id), label: c.category_name }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Discount Type</label>
            <ModalSearchableSelect
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
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button 
            onClick={handleEdit} 
            className="gap-2"
            disabled={isSaveDisabled}
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full" /> 
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="h-4 w-4" /> Save Changes
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
