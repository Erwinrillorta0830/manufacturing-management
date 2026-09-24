"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertTriangle, AlertCircle, ShieldCheck} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import { ApprovalAction, InvoiceRow } from "../types";

interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingAction: {
    type: ApprovalAction;
    data: InvoiceRow | InvoiceRow[];
  } | null;
  isProcessing: boolean;
  onConfirm: () => Promise<void>;
}

export function ActionConfirmationModal({
  open,
  onOpenChange,
  pendingAction,
  isProcessing,
  onConfirm,
}: ConfirmationModalProps) {
  const selectedItems = useMemo(() => {
    if (!pendingAction?.data) return [];
    return Array.isArray(pendingAction.data)
      ? pendingAction.data
      : [pendingAction.data];
  }, [pendingAction]);

  const isBulk = selectedItems.length > 1;
  const isApprove = pendingAction?.type === "APPROVE";
  const totalAmount = useMemo(
    () =>
      selectedItems.reduce((sum, item) => sum + (item.total_amount || 0), 0),
    [selectedItems],
  );

  if (!pendingAction) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md p-0 overflow-hidden border-border/80 shadow-2xl rounded-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={pendingAction.type + selectedItems.length}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col p-6 space-y-4"
          >
            <AlertDialogHeader className="space-y-2">
              <AlertDialogTitle className="flex items-center gap-2.5 text-lg font-bold">
                <div
                  className={`rounded-xl p-2 ${
                    isApprove
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {isApprove ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                </div>
                <span>
                  Confirm {isApprove ? "Approval" : "Rejection"}
                </span>
                {isBulk && (
                  <span className="ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {selectedItems.length} items
                  </span>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4" asChild>
                <div className="space-y-4 text-sm text-muted-foreground pt-1">
                  <p>
                    Are you sure you want to{" "}
                    <strong
                      className={
                        isApprove
                          ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                          : "text-rose-600 dark:text-rose-400 font-semibold"
                      }
                    >
                      {pendingAction.type}
                    </strong>{" "}
                    the cancellation request{isBulk ? "s" : ""}?
                  </p>

                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 text-xs shadow-2xs">
                    {!isBulk ? (
                      <table className="w-full">
                        <tbody>
                          <tr className="border-b border-border/50">
                            <td className="py-2 text-muted-foreground font-medium uppercase text-[10px] tracking-wider">
                              Invoice No.
                            </td>
                            <td className="py-2 text-right font-bold text-foreground">
                              {selectedItems[0]?.invoice_no}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 text-muted-foreground font-medium uppercase text-[10px] tracking-wider">
                              Total Amount
                            </td>
                            <td className="py-2 text-right font-bold text-foreground tabular-nums">
                              {formatCurrency(selectedItems[0]?.total_amount)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <div className="space-y-2">
                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {selectedItems.map((item, idx) => (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.18,
                                delay: Math.min(idx * 0.03, 0.2),
                              }}
                              className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0"
                            >
                              <span className="font-semibold text-foreground">
                                {item.invoice_no}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-foreground/80">
                                {formatCurrency(item.total_amount)}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                        <div className="flex justify-between pt-2.5 border-t border-border/60 font-bold text-primary">
                          <span>Total Batch Amount</span>
                          <span className="tabular-nums">{formatCurrency(totalAmount)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    {isApprove ? (
                      <Alert
                        variant="destructive"
                        className="bg-destructive/10 border-destructive/20 py-2.5 rounded-xl"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-xs font-semibold">Irreversible Action</AlertTitle>
                        <AlertDescription className="text-[11px] leading-relaxed">
                          Voids invoice and resets the linked Sales Order to &apos;For Invoicing&apos;.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert className="py-2.5 rounded-xl border-border/60 bg-muted/40">
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <AlertTitle className="text-xs font-semibold">Return to Dispatch</AlertTitle>
                        <AlertDescription className="text-[11px] text-muted-foreground leading-relaxed">
                          Returns invoice items to the active dispatch list.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-2">
              <AlertDialogCancel
                disabled={isProcessing}
                className="rounded-xl transition-all"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  onConfirm();
                }}
                disabled={isProcessing}
                className={`rounded-xl transition-all font-semibold ${
                  isApprove
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...
                  </>
                ) : (
                  `Confirm ${isApprove ? "Approval" : "Rejection"}`
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </motion.div>
        </AnimatePresence>
      </AlertDialogContent>
    </AlertDialog>
  );
}
