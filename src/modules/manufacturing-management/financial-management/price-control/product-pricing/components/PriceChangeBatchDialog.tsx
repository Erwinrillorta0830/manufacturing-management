"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceControlSearchableSelect } from "../../shared/PriceControlSearchableSelect";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import type { DirtyPreviewLine, SaveAllResult, Supplier } from "../types";
import { generateBatchReferenceNo } from "../../shared/batchReference";
import { formatPHP } from "../utils/format";

type FieldErrors = Partial<Record<"supplier_id" | "remarks", string>>;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    suppliers: Supplier[];
    batchSupplierOptions?: Supplier[];
    defaultSupplierId: number | null;
    priceLineCount: number;
    costLineCount: number;
    offPageDirtyCount?: number;
    previewLines: DirtyPreviewLine[];
    onSubmit: (payload: {
        supplier_id: number;
        reference_no?: string;
        remarks: string;
    }) => Promise<SaveAllResult>;
};

function supplierLabel(supplier: Supplier) {
    const shortcut = String(supplier.supplier_shortcut ?? "").trim();
    const name = String(supplier.supplier_name ?? "").trim();
    return shortcut && name ? `${shortcut} - ${name}` : name || `Supplier #${supplier.id}`;
}

export function PriceChangeBatchDialog({
    open,
    onOpenChange,
    suppliers,
    batchSupplierOptions,
    defaultSupplierId,
    priceLineCount,
    costLineCount,
    offPageDirtyCount = 0,
    previewLines,
    onSubmit,
}: Props) {
    const [supplierId, setSupplierId] = React.useState(defaultSupplierId ? String(defaultSupplierId) : "");
    const [referenceNo, setReferenceNo] = React.useState("");
    const [remarks, setRemarks] = React.useState("");
    const [errors, setErrors] = React.useState<FieldErrors>({});
    const [submitting, setSubmitting] = React.useState(false);

    const requiresSupplier = priceLineCount > 0 || costLineCount > 0;
    const requiresRemarks = priceLineCount > 0;
    const supplierOptions = batchSupplierOptions ?? suppliers;

    React.useEffect(() => {
        if (!open) return;
        setSupplierId(defaultSupplierId ? String(defaultSupplierId) : "");
        setReferenceNo(generateBatchReferenceNo());
        setRemarks("");
        setErrors({});
    }, [defaultSupplierId, open]);

    async function submit() {
        const nextErrors: FieldErrors = {};
        const parsedSupplierId = Number(supplierId);
        const trimmedRemarks = remarks.trim();

        if (requiresSupplier) {
            if (!Number.isFinite(parsedSupplierId) || parsedSupplierId <= 0) {
                nextErrors.supplier_id = "Supplier is required.";
            }
        }
        if (requiresRemarks) {
            if (!trimmedRemarks) {
                nextErrors.remarks = "Remarks is required.";
            }
        }

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSubmitting(true);
        try {
            const result = await onSubmit({
                supplier_id: parsedSupplierId,
                reference_no: referenceNo.trim() || undefined,
                remarks: trimmedRemarks,
            });
            if (result.success) {
                onOpenChange(false);
            }
        } finally {
            setSubmitting(false);
        }
    }

    const canSubmit =
        !submitting &&
        (!requiresSupplier || Number(supplierId) > 0) &&
        (!requiresRemarks || remarks.trim().length > 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {requiresRemarks ? "New Price Change Batch" : "Review changes before saving"}
                    </DialogTitle>
                    <DialogDescription>
                        {requiresRemarks
                            ? "Group the pending price edits into one document for approval."
                            : "Confirm the list cost changes below before submitting for approval."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                        <div>
                            <div className="text-xs font-medium uppercase text-muted-foreground">Price Lines</div>
                            <div className="mt-1 text-lg font-semibold">{priceLineCount}</div>
                        </div>
                        <div>
                            <div className="text-xs font-medium uppercase text-muted-foreground">List Cost Lines</div>
                            <div className="mt-1 text-lg font-semibold">{costLineCount}</div>
                        </div>
                    </div>

                    {priceLineCount > 0 && costLineCount > 0 ? (
                        <Alert>
                            <AlertDescription>
                                Price and list cost are submitted together; both must be valid to save.
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    {offPageDirtyCount > 0 ? (
                        <Alert>
                            <AlertDescription>
                                This save includes {offPageDirtyCount} edit
                                {offPageDirtyCount === 1 ? "" : "s"} from other pages not visible in the grid.
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    <div className="rounded-md border">
                        <div className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">
                            Records to be updated
                        </div>
                        <div className="max-h-[40vh] overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="w-[110px]">Type</TableHead>
                                        <TableHead className="w-[80px]">Kind</TableHead>
                                        <TableHead className="w-[130px] text-right">Current</TableHead>
                                        <TableHead className="w-[130px] text-right">Proposed</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewLines.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                                                No valid changes to preview.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        previewLines.map((line) => (
                                            <TableRow key={`${line.product_id}-${line.kind}-${line.tier_label}`}>
                                                <TableCell className="max-w-[280px]">
                                                    <div className="truncate font-medium">{line.product_name}</div>
                                                    {line.product_code ? (
                                                        <div className="truncate text-xs text-muted-foreground">
                                                            {line.product_code}
                                                        </div>
                                                    ) : null}
                                                </TableCell>
                                                <TableCell>{line.tier_label}</TableCell>
                                                <TableCell>
                                                    <Badge variant={line.kind === "price" ? "default" : "secondary"}>
                                                        {line.kind === "price" ? "Price" : "List Cost"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatPHP(line.current_value)}
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {line.validation_error ? (
                                                        <span className="text-destructive">{line.validation_error}</span>
                                                    ) : (
                                                        formatPHP(line.proposed_value)
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {requiresSupplier ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label>
                                    Supplier
                                    <span className="text-destructive"> *</span>
                                </Label>
                                <PriceControlSearchableSelect
                                    value={supplierId}
                                    onValueChange={(value) => {
                                        setSupplierId(value);
                                        setErrors((prev) => ({ ...prev, supplier_id: undefined }));
                                    }}
                                    placeholder="Select supplier"
                                    disabled={submitting}
                                    options={supplierOptions.map((supplier) => ({
                                        value: String(supplier.id),
                                        label: supplierLabel(supplier),
                                    }))}
                                />
                                {errors.supplier_id ? (
                                    <p className="text-xs text-destructive">{errors.supplier_id}</p>
                                ) : null}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="price-change-reference">Reference No.</Label>
                                <Input
                                    id="price-change-reference"
                                    value={referenceNo}
                                    placeholder="Optional supplier quote or memo reference"
                                    readOnly
                                    disabled={submitting}
                                />
                            </div>

                            {requiresRemarks ? (
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="price-change-remarks">
                                        Remarks
                                        <span className="text-destructive"> *</span>
                                    </Label>
                                    <Textarea
                                        id="price-change-remarks"
                                        value={remarks}
                                        onChange={(event) => {
                                            setRemarks(event.target.value);
                                            setErrors((prev) => ({ ...prev, remarks: undefined }));
                                        }}
                                        placeholder="Explain why this batch should be approved"
                                        className="min-h-24 resize-y"
                                        aria-invalid={Boolean(errors.remarks)}
                                        disabled={submitting}
                                    />
                                    {errors.remarks ? (
                                        <p className="text-xs text-destructive">{errors.remarks}</p>
                                    ) : null}
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={!canSubmit}>
                        {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {requiresRemarks ? "Submit Batch" : "Confirm save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
