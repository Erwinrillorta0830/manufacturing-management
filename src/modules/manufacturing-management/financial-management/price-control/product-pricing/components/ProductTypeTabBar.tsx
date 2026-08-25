import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProductType } from "../types";
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

type Props = {
    productTypes: ProductType[];
    activeProductTypeId: number | null;
    onTabChange: (newTypeId: number) => void;
    dirtyCount: number;
    loading?: boolean;
};

export function ProductTypeTabBar({
    productTypes,
    activeProductTypeId,
    onTabChange,
    dirtyCount,
    loading,
}: Props) {
    const [pendingTabChange, setPendingTabChange] = useState<number | null>(null);

    const handleTabClick = (typeId: number) => {
        if (typeId === activeProductTypeId) return;
        
        if (dirtyCount > 0) {
            setPendingTabChange(typeId);
        } else {
            onTabChange(typeId);
        }
    };

    const confirmTabChange = () => {
        if (pendingTabChange !== null) {
            onTabChange(pendingTabChange);
            setPendingTabChange(null);
        }
    };

    if (loading || productTypes.length === 0) {
        return (
            <div className="flex items-center space-x-4 border-b pb-2 mb-4 animate-pulse">
                <div className="h-8 w-24 bg-muted rounded-md" />
                <div className="h-8 w-24 bg-muted rounded-md" />
                <div className="h-8 w-24 bg-muted rounded-md" />
            </div>
        );
    }

    return (
        <>
            <div className="flex items-center space-x-1 border-b mb-4 overflow-x-auto no-scrollbar">
                {productTypes.map((pt) => {
                    const isActive = pt.id === activeProductTypeId;
                    return (
                        <button
                            key={pt.id}
                            onClick={() => handleTabClick(pt.id)}
                            className={cn(
                                "px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                                pt.name.toLowerCase() === "finished goods" && !isActive && "font-semibold"
                            )}
                        >
                            {pt.name}
                        </button>
                    );
                })}
            </div>

            <AlertDialog
                open={pendingTabChange !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingTabChange(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Switch tabs without saving?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have {dirtyCount} unsaved change(s). Switching tabs will discard them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingTabChange(null)}>
                            Keep editing
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmTabChange} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                            Discard & Switch
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
