"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceTypeTable } from "./components/PriceTypeTable";
import { PriceTypeFormDialog } from "./components/PriceTypeFormDialog";
import { usePriceTypes } from "../product-pricing/hooks/usePriceTypes";
import { usePriceTypeActions } from "./hooks/usePriceTypeActions";
import type { PriceType } from "../product-pricing/types";
import { Skeleton } from "@/components/ui/skeleton";

export function PriceTypeCreationModule() {
    const { loading, priceTypes, error } = usePriceTypes();
    const { isPending, createPriceType, updatePriceType, deletePriceType } = usePriceTypeActions();

    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [editingPT, setEditingPT] = React.useState<PriceType | null>(null);

    // Refresh function (hacky way without react-query but matches existing pattern)
    const refresh = () => window.location.reload();

    const handleCreate = () => {
        setEditingPT(null);
        setDialogOpen(true);
    };

    const handleEdit = (pt: PriceType) => {
        setEditingPT(pt);
        setDialogOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (confirm("Are you sure you want to delete this price type?")) {
            await deletePriceType(id);
            refresh();
        }
    };

    const handleSubmit = async (data: Partial<PriceType>) => {
        if (editingPT) {
            await updatePriceType(editingPT.price_type_id, data);
        } else {
            await createPriceType(data);
        }
        refresh();
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-10 w-40 rounded-xl" />
                    <Skeleton className="h-10 w-32 rounded-xl" />
                </div>
                <Skeleton className="h-[400px] w-full rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Price Types</h2>
                    <p className="text-sm text-muted-foreground">
                        Manage price tiers used for product pricing.
                    </p>
                </div>
                <Button onClick={handleCreate} className="rounded-xl shadow-sm hover:shadow-md transition-all">
                    <Plus className="mr-2 h-4 w-4" />
                    New Price Type
                </Button>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                    Error loading price types: {error}
                </div>
            )}

            <PriceTypeTable
                priceTypes={priceTypes}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            <PriceTypeFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                initialData={editingPT}
                isPending={isPending}
            />
        </div>
    );
}
