"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2 } from "lucide-react";
import { disbursementProvider } from "../../providers/fetchProvider";
import { SupplierDto } from "../../types";
import { toast } from "sonner";
import { formatTIN } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/utils/utils";

interface AddPayeeModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (createdPayee?: SupplierDto) => void;
    supplierType?: "TRADE" | "NON-TRADE";
    allowSupplierTypeSelect?: boolean;
}

export function AddPayeeModal({
    open,
    onClose,
    onSuccess,
    supplierType = "TRADE",
    allowSupplierTypeSelect = false,
}: AddPayeeModalProps) {
    const [name, setName] = useState("");
    const [type, setType] = useState<"TRADE" | "NON-TRADE">(supplierType);
    const [tin, setTin] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [bankDetails, setBankDetails] = useState("");
    const [submitting, setSubmitting] = useState(false);

    React.useEffect(() => {
        if (open) {
            setType(supplierType);
            setName("");
            setTin("");
            setEmail("");
            setPhone("");
            setBankDetails("");
        }
    }, [open, supplierType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            return toast.error("Payee name is required.");
        }
        if (!tin.trim()) {
            return toast.error("TIN number is required.");
        }

        setSubmitting(true);
        try {
            const created = await disbursementProvider.createPayee({
                supplier_name: name.trim(),
                supplier_type: type,
                tin_number: tin.trim(),
                email_address: email.trim() || undefined,
                phone_number: phone.trim() || undefined,
                bank_details: bankDetails.trim() || undefined,
            });

            toast.success(`Payee "${name.trim()}" created successfully!`);
            onSuccess(created);
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create payee");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-[500px] bg-background border-border shadow-2xl rounded-xl">
                <DialogHeader className="space-y-1">
                    <DialogTitle className="text-lg font-black uppercase flex items-center gap-2 text-foreground">
                        <UserPlus className="w-5 h-5 text-primary" />
                        Register New Payee
                    </DialogTitle>
                    <DialogDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Create a new {type.toLowerCase()} payee record for disbursements.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-foreground">
                            Payee / Supplier Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            placeholder="e.g., ACME Industrial Corp."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="h-9 text-xs font-semibold"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-foreground">
                                Payee Type <span className="text-destructive">*</span>
                            </Label>
                            {allowSupplierTypeSelect ? (
                                <select
                                    className="h-9 w-full rounded-sm border border-input bg-background px-2 text-xs font-bold text-foreground shadow-sm"
                                    value={type}
                                    onChange={(e) => setType(e.target.value as "TRADE" | "NON-TRADE")}
                                >
                                    <option value="TRADE">TRADE</option>
                                    <option value="NON-TRADE">NON-TRADE</option>
                                </select>
                            ) : (
                                <Input
                                    value={type}
                                    readOnly
                                    disabled
                                    className="h-9 text-xs font-bold bg-muted uppercase"
                                />
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-foreground">
                                TIN Number <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                placeholder="000-000-000-000"
                                value={tin}
                                onChange={(e) => setTin(formatTIN(e.target.value))}
                                className="h-9 text-xs font-semibold"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-foreground">Email Address</Label>
                            <Input
                                type="email"
                                placeholder="payee@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-9 text-xs font-semibold"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-foreground">Phone Number</Label>
                            <Input
                                placeholder="09XXXXXXXXX"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                                className="h-9 text-xs font-semibold"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-foreground">Bank Details (Optional)</Label>
                        <Input
                            placeholder="Bank Name, Account #, Branch"
                            value={bankDetails}
                            onChange={(e) => setBankDetails(e.target.value)}
                            className="h-9 text-xs font-semibold"
                        />
                    </div>

                    <DialogFooter className="pt-3 border-t border-border">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={submitting}
                            className="h-9 text-xs font-bold"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting}
                            className="h-9 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Create Payee
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
