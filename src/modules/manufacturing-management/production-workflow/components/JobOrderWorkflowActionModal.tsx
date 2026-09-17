"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ImagePlus, PauseCircle, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { validateManufacturingImage } from "../services/production-yield-image";

export type ProductionWorkflowAction =
    | "place-on-hold"
    | "resume-production"
    | "complete-production"
    | "terminate-production";

interface JobOrderWorkflowActionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    action: ProductionWorkflowAction | null;
    loading?: boolean;
    onSubmit: (payload: { remarks?: string; resolutionRemarks?: string; terminationImage?: File | null }) => Promise<boolean>;
}

const ACTION_COPY: Record<ProductionWorkflowAction, {
    title: string;
    description: string;
    fieldLabel?: string;
    placeholder?: string;
    submitLabel: string;
    icon: React.ReactNode;
    destructive?: boolean;
}> = {
    "place-on-hold": {
        title: "Place Production on Hold",
        description: "Stop new production activity until the issue has been resolved. A reason is required for the audit trail.",
        fieldLabel: "Hold reason",
        placeholder: "Describe the issue requiring production to stop...",
        submitLabel: "Place on Hold",
        icon: <PauseCircle className="h-5 w-5 text-amber-600" />
    },
    "resume-production": {
        title: "Resume Production",
        description: "Confirm how the hold was resolved before allowing another production session.",
        fieldLabel: "Resolution remarks",
        placeholder: "Describe the corrective action and resolution...",
        submitLabel: "Resume Production",
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    },
    "complete-production": {
        title: "Complete Production",
        description: "The server will verify route completion, target output, and exact material consumption before sending this Job Order to QA and reconciliation.",
        submitLabel: "Complete Production",
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    },
    "terminate-production": {
        title: "Terminate Production",
        description: "Use controlled termination for a run that cannot reach its planned output. Remaining WIP stays available for reconciliation or return.",
        fieldLabel: "Termination reason",
        placeholder: "Explain why production is being terminated...",
        submitLabel: "Terminate Production",
        icon: <XCircle className="h-5 w-5 text-destructive" />,
        destructive: true
    }
};

export function JobOrderWorkflowActionModal({
    open,
    onOpenChange,
    action,
    loading = false,
    onSubmit
}: JobOrderWorkflowActionModalProps) {
    const [remarks, setRemarks] = useState("");
    const [terminationImage, setTerminationImage] = useState<File | null>(null);
    const [terminationImagePreview, setTerminationImagePreview] = useState<string | null>(null);
    const [terminationImageError, setTerminationImageError] = useState<string | null>(null);
    const [terminationImageInputKey, setTerminationImageInputKey] = useState(0);

    React.useEffect(() => {
        return () => {
            if (terminationImagePreview) URL.revokeObjectURL(terminationImagePreview);
        };
    }, [terminationImagePreview]);

    if (!action) return null;
    const copy = ACTION_COPY[action];
    const requiresRemarks = Boolean(copy.fieldLabel);
    const requiresTerminationImage = action === "terminate-production";

    const handleTerminationImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        setTerminationImageError(null);
        if (!file) {
            setTerminationImage(null);
            setTerminationImagePreview(null);
            return;
        }

        const validationError = validateManufacturingImage(file, "Termination evidence");
        if (validationError) {
            setTerminationImage(null);
            setTerminationImagePreview(null);
            setTerminationImageError(validationError);
            event.target.value = "";
            return;
        }

        setTerminationImage(file);
        setTerminationImagePreview(URL.createObjectURL(file));
    };

    const removeTerminationImage = () => {
        setTerminationImage(null);
        setTerminationImagePreview(null);
        setTerminationImageError(null);
        setTerminationImageInputKey((current) => current + 1);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (requiresRemarks && !remarks.trim()) return;
        if (requiresTerminationImage && (!terminationImage || terminationImageError)) return;
        const succeeded = await onSubmit({
            ...(action === "resume-production"
                ? { resolutionRemarks: remarks.trim() }
                : { remarks: remarks.trim() }),
            ...(requiresTerminationImage ? { terminationImage } : {})
        });
        if (succeeded) onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {copy.icon}
                            {copy.title}
                        </DialogTitle>
                        <DialogDescription>{copy.description}</DialogDescription>
                    </DialogHeader>

                    {requiresRemarks ? (
                        <div className="space-y-2 py-5">
                            <Label htmlFor="workflow-action-remarks">{copy.fieldLabel} *</Label>
                            <Textarea
                                id="workflow-action-remarks"
                                value={remarks}
                                onChange={(event) => setRemarks(event.target.value)}
                                placeholder={copy.placeholder}
                                className="min-h-28 resize-y"
                                maxLength={5000}
                                autoFocus
                            />
                            <p className="text-[11px] text-muted-foreground">This remark is stored with the workflow status history.</p>
                        </div>
                    ) : (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 my-5 text-xs text-amber-800 dark:text-amber-300">
                            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Only proceed after verifying the production records shown for this Job Order.</span>
                        </div>
                    )}

                    {action === "terminate-production" && (
                        <div className="space-y-3 py-4">
                            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>Termination requires an authorized supervisor, manager, or administrator.</span>
                            </div>
                            <div className="space-y-2 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-3">
                                <div className="flex items-center gap-2">
                                    <ImagePlus className="h-4 w-4 text-destructive" />
                                    <Label htmlFor="job-order-termination-image">
                                        Termination Evidence Image <span className="text-destructive">*</span>
                                    </Label>
                                </div>
                                <Input
                                    key={terminationImageInputKey}
                                    id="job-order-termination-image"
                                    type="file"
                                    accept="image/jpeg,image/jpg,image/png,image/webp"
                                    required
                                    onChange={handleTerminationImageChange}
                                    disabled={loading}
                                    aria-describedby="job-order-termination-image-help"
                                />
                                <p id="job-order-termination-image-help" className="text-[11px] text-muted-foreground">
                                    Upload one PNG, JPG, or WEBP image. Maximum size: 5 MB.
                                </p>
                                {terminationImageError && (
                                    <p className="text-[11px] font-semibold text-destructive">{terminationImageError}</p>
                                )}
                                {terminationImage && terminationImagePreview && (
                                    <div className="flex items-center gap-3 rounded-lg border bg-background p-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={terminationImagePreview}
                                            alt="Termination evidence preview"
                                            className="h-16 w-16 rounded-md border object-cover"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-semibold">{terminationImage.name}</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {(terminationImage.size / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={removeTerminationImage}
                                            disabled={loading}
                                            aria-label="Remove termination evidence image"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="mt-5">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant={copy.destructive ? "destructive" : "default"}
                            disabled={loading
                                || (requiresRemarks && !remarks.trim())
                                || (requiresTerminationImage && (!terminationImage || Boolean(terminationImageError)))}
                        >
                            {loading ? "Saving..." : copy.submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
