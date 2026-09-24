"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SalesInvoice } from "../types";
import { Loader2, FileText, AlertCircle, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const formSchema = z.object({
  reason_code: z.string().min(1, "Please select a reason code"),
  remarks: z.string().min(5, "Remarks must be at least 5 characters"),
});

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  onSuccess: () => void;
}

export function RequestCancellationModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: RequestModalProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason_code: "",
      remarks: "",
    },
  });

  // Reset form when modal closes or invoice changes
  React.useEffect(() => {
    if (!isOpen) {
      form.reset({
        reason_code: "",
        remarks: "",
      });
    }
  }, [isOpen, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!invoice) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/manufacturing/invoicing-and-billing/invoice-cancellation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: invoice.invoice_id,
            sales_order_id: invoice.order_id,
            reason_code: values.reason_code,
            remarks: values.remarks,
            requested_by: 1, // Placeholder for Auth Context
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to submit request");

      // Using Sonner Success
      toast.success("Request Submitted", {
        description: `Cancellation request for ${invoice.invoice_no} is now pending approval.`,
      });

      form.reset();
      onSuccess();
      onClose();
    } catch {
      // Using Sonner Error
      toast.error("Submission Error", {
        description: "Could not process the request. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-border/80 shadow-2xl rounded-2xl">
        <AnimatePresence mode="wait">
          {!invoice ? (
            <motion.div
              key="loading-invoice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-12 space-y-3"
            >
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-medium">
                Loading invoice details...
              </span>
            </motion.div>
          ) : (
            <motion.div
              key={`loaded-${invoice.invoice_id}`}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex flex-col p-6 space-y-4"
            >
              <DialogHeader className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold">
                      Request Invoice Cancellation
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Submitting locks this invoice and forwards it to Audit for cancellation approval.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Invoice Summary Card */}
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground text-sm">
                      {invoice.invoice_no}
                    </span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
                    Order #{invoice.order_id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                  <span>Customer: <strong className="text-foreground">{invoice.customer_name}</strong></span>
                  <span className="font-bold text-foreground tabular-nums">
                    {formatCurrency(invoice.total_amount)}
                  </span>
                </div>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
                  <FormField
                    control={form.control}
                    name="reason_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">
                          Defect / Cancellation Reason <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Select a reason code" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="Wrong Price">Wrong Price</SelectItem>
                            <SelectItem value="System Error">System Error</SelectItem>
                            <SelectItem value="Printer Jam">Printer Jam</SelectItem>
                            <SelectItem value="Typographical Error">
                              Typographical Error
                            </SelectItem>
                            <SelectItem value="Customer Cancellation">
                              Customer Cancellation
                            </SelectItem>
                            <SelectItem value="Duplicate Invoice">
                              Duplicate Invoice
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">
                          Mandatory Remarks <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Provide detailed justification for the cancellation request..."
                            className="resize-none min-h-24 rounded-xl text-xs"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter className="pt-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold text-xs shadow-xs"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        "Submit Cancellation Request"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
