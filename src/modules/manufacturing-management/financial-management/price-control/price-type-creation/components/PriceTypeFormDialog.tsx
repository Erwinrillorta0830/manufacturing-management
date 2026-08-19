"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PriceType } from "../../product-pricing/types";

interface PriceTypeFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: Partial<PriceType>) => Promise<void>;
    initialData?: PriceType | null;
    isPending?: boolean;
}

export function PriceTypeFormDialog({
    open,
    onOpenChange,
    onSubmit,
    initialData,
    isPending,
}: PriceTypeFormDialogProps) {
    const [name, setName] = React.useState("");
    const [sort, setSort] = React.useState<string>("");

    React.useEffect(() => {
        if (open) {
            setName(initialData?.price_type_name ?? "");
            setSort(initialData?.sort?.toString() ?? "");
        }
    }, [open, initialData]);

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({
            price_type_name: name,
            sort: sort ? parseInt(sort, 10) : null,
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] rounded-2xl">
                <DialogHeader>
                    <DialogTitle>{initialData ? "Edit Price Type" : "New Price Type"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleFormSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Price Type Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. A, B, Retail, Wholesale"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="sort">Sort Order</Label>
                        <Input
                            id="sort"
                            type="number"
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                            placeholder="1"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
