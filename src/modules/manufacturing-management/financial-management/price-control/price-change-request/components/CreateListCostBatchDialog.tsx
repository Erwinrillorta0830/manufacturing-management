"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import * as api from "../providers/pcrApi";
import { generateBatchReferenceNo } from "../../shared/batchReference";
import type { ListCostImportPrefill } from "../types";
import { isUnauthorizedError } from "../../shared/apiHttp";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    importPrefill: ListCostImportPrefill | null;
    onCreated: () => void;
    onUnauthorized?: () => void;
};

function formatMoney(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    return Number(value).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    });
}

export function CreateListCostBatchDialog({
    open,
    onOpenChange,
    importPrefill,
    onCreated,
    onUnauthorized,
}: Props) {
    const [referenceNo, setReferenceNo] = React.useState("");
    const [remarks, setRemarks] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [errors, setErrors] = React.useState<Partial<Record<"remarks", string>>>({});

    React.useEffect(() => {
        if (!open) {
            setReferenceNo("");
            setRemarks("");
            setErrors({});
            setSaving(false);
            return;
        }

        setReferenceNo(generateBatchReferenceNo());

        if (importPrefill) {
            setRemarks(importPrefill.remarks);
        }
    }, [open, importPrefill]);

    const lines = React.useMemo(() => importPrefill?.lines ?? [], [importPrefill?.lines]);

    const handleSubmit = React.useCallback(async () => {
        if (!importPrefill || lines.length === 0) {
            toast.error("No imported list cost lines to submit.");
            return;
        }

        const trimmedRemarks = remarks.trim();
        if (!trimmedRemarks) {
            setErrors({ remarks: "Remarks are required." });
            return;
        }

        setSaving(true);
        setErrors({});

        try {
            const result = await api.createBulkCostChangeRequests({
                items: lines.map((line) => ({
                    product_id: line.product_id,
                    proposed_cost: line.proposed_cost,
                    current_cost: line.current_cost,
                })),
                supplier_id: importPrefill.supplierId,
                reference_no: referenceNo.trim() || undefined,
                remarks: trimmedRemarks,
            });

            if ((result.created ?? 0) === 0) {
                if ((result.skipped_existing_pending ?? 0) > 0) {
                    toast.message("No new list cost requests were created because these items already have pending requests.");
                } else if ((result.skipped_duplicates ?? 0) > 0) {
                    toast.message("No new list cost requests were created — all entries were duplicates.");
                } else {
                    toast.message("No new list cost requests were created.");
                }
                return;
            }

            const skipped: string[] = [];
            if (result.skipped_duplicates) skipped.push(`${result.skipped_duplicates} duplicate(s) skipped`);
            if (result.skipped_existing_pending) skipped.push(`${result.skipped_existing_pending} already pending`);

            toast.success(
                `${result.created} list cost request(s) submitted successfully.${
                    skipped.length ? ` ${skipped.join(", ")}.` : ""
                }${result.reference_no ? ` Reference: ${result.reference_no}.` : ""}`,
            );
            onOpenChange(false);
            onCreated();
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) {
                onUnauthorized?.();
                return;
            }
            toast.error(error instanceof Error ? error.message : "Failed to submit list cost batch.");
        } finally {
            setSaving(false);
        }
    }, [importPrefill, lines, onCreated, onOpenChange, onUnauthorized, referenceNo, remarks]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>Submit Imported List Cost Batch</DialogTitle>
                    {importPrefill ? (
                        <p className="text-sm text-muted-foreground">
                            Supplier: <span className="font-medium text-foreground">{importPrefill.supplierName}</span>
                            {" · "}
                            {lines.length} product line{lines.length === 1 ? "" : "s"}
                        </p>
                    ) : null}
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="list-cost-reference-no">Reference No.</Label>
                            <Input
                                id="list-cost-reference-no"
                                value={referenceNo}
                                readOnly
                                disabled={saving}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="list-cost-remarks">Remarks</Label>
                            <Textarea
                                id="list-cost-remarks"
                                value={remarks}
                                onChange={(event) => {
                                    setRemarks(event.target.value);
                                    setErrors((prev) => ({ ...prev, remarks: undefined }));
                                }}
                                rows={3}
                                aria-invalid={Boolean(errors.remarks)}
                                disabled={saving}
                            />
                            {errors.remarks ? <p className="text-xs text-destructive">{errors.remarks}</p> : null}
                        </div>
                    </div>

                    <div className="rounded-md border">
                        <div className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">Imported Lines</div>
                        <div className="max-h-80 overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-background">
                                    <tr className="border-b text-left text-xs text-muted-foreground">
                                        <th className="px-3 py-2">Product</th>
                                        <th className="px-3 py-2">Code</th>
                                        <th className="px-3 py-2 text-right">Current</th>
                                        <th className="px-3 py-2 text-right">Proposed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((line) => (
                                        <tr key={line.product_id} className="border-b last:border-0">
                                            <td className="px-3 py-2">{line.product_name}</td>
                                            <td className="px-3 py-2 text-muted-foreground">
                                                {line.product_code ?? "-"}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {formatMoney(line.current_cost)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                                                {formatMoney(line.proposed_cost)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t px-6 py-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={saving || lines.length === 0}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Submit Batch
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
