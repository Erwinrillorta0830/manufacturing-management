"use client";

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
    open: boolean;
    totalGroups: number;
    onContinue: () => void;
    onCancel: () => void;
};

export default function PrintLargeJobConfirmDialog(props: Props) {
    const { open, totalGroups, onContinue, onCancel } = props;

    return (
        <AlertDialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onCancel();
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Prepare large print job?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This print job contains {totalGroups.toLocaleString()} product group
                        {totalGroups === 1 ? "" : "s"}. Preparing it may take a while.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onContinue}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
