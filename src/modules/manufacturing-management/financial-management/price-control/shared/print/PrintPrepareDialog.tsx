"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type Props = {
    open: boolean;
    prepared: number;
    total: number;
    onCancel: () => void;
};

export default function PrintPrepareDialog(props: Props) {
    const { open, prepared, total, onCancel } = props;

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onCancel();
            }}
        >
            <DialogContent
                className="max-w-md"
                onEscapeKeyDown={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Preparing print…</DialogTitle>
                    <DialogDescription>
                        Loading product groups and tier prices for the print editor.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-2">
                    <div className="text-sm text-muted-foreground">
                        Prepared{" "}
                        <span className="font-medium text-foreground">
                            {prepared.toLocaleString()} / {total.toLocaleString()}
                        </span>{" "}
                        product group{total === 1 ? "" : "s"}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{
                                width: total > 0 ? `${Math.min(100, (prepared / total) * 100)}%` : "0%",
                            }}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
