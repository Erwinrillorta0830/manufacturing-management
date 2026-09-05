"use client";

import { useState, useRef, useCallback } from "react";
import { useForm, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Supplier,
  SupplierFormSchema,
  SupplierFormValues,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import {
  usePaymentTerms,
  useDeliveryTerms,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/hooks/useTerms";
import { Term } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/terms";
import { formatTIN } from "../../utils/utils";
import { Combobox } from "../ui/Combobox";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

interface EditSupplierFormProps {
  supplier: Supplier;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EditSupplierForm({
  supplier,
  onSuccess,
  onCancel,
}: EditSupplierFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("contact");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    supplier.supplier_image
      ? `${API_BASE_URL}/assets/${supplier.supplier_image}`
      : null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [imageCleared, setImageCleared] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = useCallback((file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is 2 MB (got ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(`Invalid file type. Allowed: JPEG, PNG, WebP, GIF`);
      return;
    }
    setSelectedFile(file);
    setImageCleared(false);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  }, [validateAndSetFile]);

  const clearImage = useCallback(() => {
    setSelectedFile(null);
    setImagePreview(null);
    setImageCleared(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const form = useForm({
    resolver: zodResolver(SupplierFormSchema),
    defaultValues: {
      supplier_name: supplier.supplier_name || "",
      supplier_shortcut: supplier.supplier_shortcut || "",
      supplier_type: supplier.supplier_type || "",
      tin_number: supplier.tin_number || "",
      contact_person: supplier.contact_person || "",
      email_address: supplier.email_address || "",
      phone_number: supplier.phone_number || "",
      address: supplier.address || "",
      brgy: supplier.brgy || "",
      city: supplier.city || "",
      state_province: supplier.state_province || "",
      postal_code: supplier.postal_code || "",
      country: supplier.country || "Philippines",
      payment_terms: supplier.payment_terms || "",
      delivery_terms: supplier.delivery_terms || "",
      isActive: supplier.isActive || 1,
      supplier_image: supplier.supplier_image || "",
      bank_details: supplier.bank_details || "",
      notes_or_comments: supplier.notes_or_comments || "",
      agreement_or_contract: supplier.agreement_or_contract || "",
      preferred_communication_method:
        supplier.preferred_communication_method || "",
      nonBuy: supplier.nonBuy !== undefined ? Boolean(supplier.nonBuy) : true,
    },
  });

  const { paymentTerms, isLoading: isLoadingPayment } = usePaymentTerms();
  const { deliveryTerms, isLoading: isLoadingDelivery } = useDeliveryTerms();

  const onSubmit = async (data: SupplierFormValues) => {
    setIsSubmitting(true);
    try {
      let imageId = supplier.supplier_image || "";

      // Upload new image if selected
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("folder_name", "supplier_profile_image");

        const uploadRes = await fetch("/api/manufacturing/financial-management/discount-management/supplier-registration/supplier-image-upload", {
          method: "POST",
          body: formData,
        });

        const uploadResult = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadResult.error || "Image upload failed");
        }

        imageId = uploadResult.data?.id || "";
      } else if (imageCleared) {
        imageId = "";
      }

      const response = await fetch(
        `/api/manufacturing/financial-management/discount-management/supplier-registration/suppliers/${supplier.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...data, supplier_image: imageId }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update supplier");
      }

      form.reset();
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update supplier",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = useCallback((errors: FieldErrors<SupplierFormValues>) => {
    const fieldTabMap: Record<string, string> = {
      supplier_name: "contact",
      supplier_shortcut: "contact",
      supplier_type: "contact",
      contact_person: "contact",
      email_address: "contact",
      phone_number: "contact",
      preferred_communication_method: "contact",
      address: "location",
      brgy: "location",
      city: "location",
      state_province: "location",
      postal_code: "location",
      country: "location",
      tin_number: "business",
      bank_details: "business",
      notes_or_comments: "business",
      agreement_or_contract: "business",
      supplier_image: "business",
      payment_terms: "terms",
      delivery_terms: "terms",
    };

    const errorTabs = new Set<string>();
    let firstTabWithError: string | null = null;

    Object.keys(errors).forEach((field) => {
      const tab = fieldTabMap[field];
      if (tab) {
        errorTabs.add(tab);
        if (!firstTabWithError) firstTabWithError = tab;
      }
    });

    if (errorTabs.size > 0) {
      const tabNames = Array.from(errorTabs)
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
        .join(", ");
      toast.error(`Please check these tabs for missing fields: ${tabNames}`);

      if (firstTabWithError) {
        setActiveTab(firstTabWithError);
      }
    }
  }, []);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="space-y-6"
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="contact">Contact Info</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="terms">Terms</TabsTrigger>
          </TabsList>

          {/* CONTACT INFORMATION TAB */}
          <TabsContent value="contact" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="supplier_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Supplier Name{" "}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Enter supplier name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supplier_shortcut"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Supplier Shortcut{" "}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., NFPI" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="supplier_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Supplier Type <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Combobox
                          options={[
                            { value: "TRADE", label: "TRADE" },
                            { value: "NON-TRADE", label: "NON-TRADE" },
                          ]}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Select supplier type"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Contact Person{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter contact person name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="email@example.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="09XXXXXXXXX" 
                            {...field} 
                            maxLength={11}
                            onChange={(e) => {
                              const formatted = e.target.value.replace(/\D/g, "").slice(0, 11);
                              field.onChange(formatted);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="preferred_communication_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Communication Method</FormLabel>
                      <FormControl>
                        <Input placeholder="Email, Phone, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* LOCATION TAB */}
          <TabsContent value="location" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Street Address <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Street address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="brgy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Barangay <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Barangay name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          City <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="City name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="state_province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Province <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Province name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="postal_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Postal Code{" "}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 2300" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Country <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Philippines" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* BUSINESS DETAILS TAB */}
          <TabsContent value="business" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <FormField
                  control={form.control}
                  name="tin_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        TIN Number <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="000-000-000-000"
                          {...field}
                          onChange={(e) => {
                            const formatted = formatTIN(e.target.value);
                            field.onChange(formatted);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Tax Identification Number (9-12 digits)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bank_details"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Details</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Bank name and account details"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes_or_comments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes / Comments</FormLabel>
                      <FormControl>
                        <Input placeholder="Additional notes" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="agreement_or_contract"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agreement / Contract</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Contract reference or URL"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nonBuy"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Non-Buy Supplier</FormLabel>
                        <FormDescription>
                          Indicate if this supplier is a non-buy supplier
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Supplier Profile Image Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Supplier Profile Image</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    {imagePreview ? (
                      <div className="relative">
                        <Image
                          src={imagePreview}
                          alt="Preview"
                          width={128}
                          height={128}
                          className="h-32 w-32 rounded-lg object-cover aspect-square"
                          unoptimized
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); clearImage(); }}
                          className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:bg-destructive/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          Click to replace
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-full bg-muted p-3 mb-2">
                          <Upload className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">Click or drag to upload</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          JPEG, PNG, WebP, GIF â€¢ Max 2 MB
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) validateAndSetFile(file);
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload a supplier logo or profile image
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TERMS & CONDITIONS TAB */}
          <TabsContent value="terms" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <FormField
                  control={form.control}
                  name="payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Payment Terms <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Combobox
                          options={paymentTerms.map((term: Term) => ({
                            value: term.name,
                            label: term.name,
                          }))}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder={
                            isLoadingPayment
                              ? "Loading terms..."
                              : "Select payment terms"
                          }
                          disabled={isLoadingPayment}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="delivery_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Delivery Terms <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Combobox
                          options={deliveryTerms.map((term: Term) => ({
                            value: term.name,
                            label: term.name,
                          }))}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder={
                            isLoadingDelivery
                              ? "Loading terms..."
                              : "Select delivery terms"
                          }
                          disabled={isLoadingDelivery}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

