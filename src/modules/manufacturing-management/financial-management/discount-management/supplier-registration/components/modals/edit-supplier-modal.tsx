"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Supplier } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";
import { EditSupplierForm } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/components/forms/edit-supplier-form";
import { Badge } from "@/components/ui/badge";

interface EditSupplierModalProps {
  supplier: Supplier | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditSupplierModal({
  supplier,
  open,
  onClose,
  onSuccess,
}: EditSupplierModalProps) {
  if (!supplier) return null;

  const handleSuccess = () => {
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">
                Edit Supplier
              </DialogTitle>
              <DialogDescription className="mt-1">
                Update supplier information for {supplier.supplier_name}
              </DialogDescription>
            </div>
            <Badge variant={supplier.isActive === 1 ? "default" : "secondary"}>
              {supplier.isActive === 1 ? "Active" : "Inactive"}
            </Badge>
          </div>
        </DialogHeader>

        <div className="mt-4">
          <EditSupplierForm
            supplier={supplier}
            onSuccess={handleSuccess}
            onCancel={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

