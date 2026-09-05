"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRepresentatives } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/hooks/useRepresentatives";
import { Supplier } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";
import {
  CreditCard,
  Hash,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useSupplierProducts } from "../../hooks/useSupplierProduct";
import { AddRepresentativeForm } from "../forms/add-representative-form";
import { ManageProductsModal } from "./manage-products-modal";
import { RepresentativeCard } from "./view-representative-details";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

interface SupplierDetailsModalProps {
  supplier: Supplier | null;
  open: boolean;
  onClose: () => void;
}

interface EmptyInfoProps {
  message?: string;
}

function EmptyInfo({
  message = "The complete physical office location and mailing address for this supplier have not yet been documented.",
}: EmptyInfoProps) {
  const isLong = message.length > 12;
  const displayMessage = isLong ? `${message.substring(0, 18)}...` : message;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-sm font-normal text-muted-foreground/60 italic cursor-help">
            {displayMessage}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-75">
          <p className="text-xs leading-relaxed">{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SupplierDetailsModal({
  supplier,
  open,
  onClose,
}: SupplierDetailsModalProps) {
  const [showAddRepForm, setShowAddRepForm] = useState(false);
  const [manageProductsOpen, setManageProductsOpen] = useState(false);
  const { representatives, isLoading, removeRepresentative, refresh } =
    useRepresentatives(supplier?.id || null);

  const { products, isLoading: productsLoading } = useSupplierProducts(
    supplier?.id || null,
  );

  if (!supplier) return null;

  const handleAddRepSuccess = () => {
    setShowAddRepForm(false);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-bold mb-2">
                {supplier.supplier_name}
              </DialogTitle>
              <div className="flex flex-1 gap-2">
                <Badge variant="secondary" className="rounded-sm">
                  {supplier.supplier_type}
                </Badge>
                {supplier.nonBuy ? (
                  <Badge variant="outline" className="rounded-sm text-amber-600 border-amber-600 bg-amber-50">
                    Non-Buy
                  </Badge>
                ) : null}
                <div className="flex items-center text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span>TIN: {supplier.tin_number}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Supplier Information */}
          <div className="text-lg font-semibold">Supplier Information</div>
          <Card className="shadow-none gap-2 rounded-lg">
            <CardHeader>
              <div className="flex flex-row">
                <div className="flex flex-1 gap-4">
                  {supplier.supplier_image ? (
                    <Image
                      src={`${API_BASE_URL}/assets/${supplier.supplier_image}`}
                      alt={supplier.supplier_name}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full object-cover border aspect-square"
                      unoptimized
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full flex items-center justify-center border">
                      <span className="text-lg font-bold text-muted-foreground">
                        {supplier.supplier_name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <div className="flex font-medium">
                      <span className="mr-4"> {supplier.supplier_name}</span>
                      <Badge
                        className="text-xs"
                        variant={
                          supplier.isActive === 1 ? "default" : "secondary"
                        }
                      >
                        {supplier.isActive === 1 ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1.5 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {supplier.phone_number ? (
                          supplier.phone_number
                        ) : (
                          <EmptyInfo message="No primary office contact number has been registered for this supplier at this time." />
                        )}
                      </span>
                      <span className="text-muted-foreground">&bull;</span>
                      <span className="flex items-center gap-1.5 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {supplier.email_address ? (
                          supplier.email_address
                        ) : (
                          <EmptyInfo message="A verified business email address is currently not available in our records for this company." />
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Supplier Representative Form */}
                <div className="flex flex-1 justify-end py-2">
                  {/* 3. The "Add New" Button - Always visible, styled to match the group */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 rounded-full border border-dashed hover:text-blue-600 transition-all z-20 mr-1"
                    onClick={() => setShowAddRepForm(!showAddRepForm)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  {isLoading ? (
                    <div className="h-12 w-12 rounded-full bg-accent animate-pulse" />
                  ) : (
                    <div className="flex items-center -space-x-3  transition-all duration-300 delay-75 ease-in-out">
                      {/* 1. Show existing avatars */}
                      {representatives.slice(0, 5).map((rep) => (
                        <RepresentativeCard
                          key={rep.id}
                          representative={rep}
                          onRemove={removeRepresentative}
                        />
                      ))}
                      {/* 2. Overflow Counter (+N) */}
                      {representatives.length > 5 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="relative h-12 w-12 rounded-full bg-muted-foreground border-2 border-white flex items-center justify-center text-xs font-bold cursor-pointer  z-10">
                                +{representatives.length - 5}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <div className="space-y-2">
                                {representatives.slice(5).map((rep) => (
                                  <div
                                    key={rep.id}
                                    className="text-xs flex items-center justify-between gap-4"
                                  >
                                    <span>
                                      {rep.first_name} {rep.last_name}
                                    </span>
                                    <button
                                      onClick={() =>
                                        removeRepresentative(rep.id!)
                                      }
                                      className="text-slate-500 hover:text-red-400"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 ">
              <div className="border p-5 rounded-sm">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground">
                  Comments
                </p>
                <p className="text-sm font-sans font-medium">
                  {supplier.notes_or_comments ? (
                    supplier.notes_or_comments
                  ) : (
                    <EmptyInfo message="There are no notes or historical remarks recorded for this supplier at this time." />
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 w-full gap-20">
                <div className="flex flex-col w-full gap-2 text-sm uppercase">
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Location
                  </span>
                  <div className="flex flex-col gap-1 capitalize">
                    <p className="text-sm">
                      {supplier.address ? (
                        supplier.address
                      ) : (
                        <EmptyInfo message="No address has been registered" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      {[
                        supplier.brgy,
                        supplier.city,
                        supplier.state_province,
                        supplier.country,
                      ]
                        .filter((val) => val && val !== "null")
                        .join(", ")}
                      {supplier.postal_code &&
                        supplier.postal_code !== "null" &&
                        ` ${supplier.postal_code}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm uppercase">
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Payment & Delivery
                  </span>
                  <span className="flex gap-2">
                    <Badge variant="secondary">
                      {supplier.payment_terms || "Unavailable"}
                    </Badge>
                    <Badge variant="secondary">
                      {supplier.delivery_terms || "Unavailable"}
                    </Badge>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          {!isLoading && representatives.length === 0 && !showAddRepForm && (
            <span className="text-xs text-slate-400 ml-4 italic">
              No representatives yet. Click the + to add.
            </span>
          )}

          <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg border border-dashed">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-background rounded-full border">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Product Catalog</p>
                <p className="text-xs text-muted-foreground">
                  {productsLoading
                    ? "Loading..."
                    : `${products.length} products assigned`}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageProductsOpen(true)}
            >
              Manage Products
            </Button>
          </div>

          {/* Supplier Representative Form */}
          <div>
            {showAddRepForm && (
              <div className="mb-4">
                <AddRepresentativeForm
                  supplierId={supplier.id!}
                  onSuccess={handleAddRepSuccess}
                  onCancel={() => setShowAddRepForm(false)}
                />
                <Separator className="mt-4" />
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      <ManageProductsModal
        supplierId={supplier.id!}
        supplierName={supplier.supplier_name}
        open={manageProductsOpen}
        onClose={() => setManageProductsOpen(false)}
      />
    </Dialog>
  );
}

