"use client";

import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export type ExcelExportColumnMode = "with-proposed" | "without-proposed";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    busy?: boolean;
    onConfirm: (mode: ExcelExportColumnMode) => void;
};

export function ExcelExportOptionsDialog({ open, onOpenChange, busy = false, onConfirm }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Export Excel</DialogTitle>
                    <DialogDescription>
                        Choose whether this workbook should include editable proposed-value columns.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    <p>
                        Use proposed columns when the file will be edited and imported back into the system.
                    </p>
                    <p>
                        Export without proposed columns when the file is only for review or sharing current values.
                    </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                        type="button"
                        disabled={busy}
                        className="h-auto min-w-0 justify-start whitespace-normal py-3 text-left"
                        onClick={() => onConfirm("with-proposed")}
                    >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        <span className="min-w-0">With proposed columns</span>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        className="h-auto min-w-0 justify-start whitespace-normal py-3 text-left"
                        onClick={() => onConfirm("without-proposed")}
                    >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        <span className="min-w-0">Without proposed columns</span>
                    </Button>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
