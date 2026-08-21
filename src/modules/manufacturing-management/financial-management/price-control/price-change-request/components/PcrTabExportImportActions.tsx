"use client";

import * as React from "react";
import { FileDown, FileSpreadsheet, FileUp, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
    mode: "price" | "cost";
    busy: boolean;
    onExportPdf: () => void;
    onExportExcel: () => void;
    onImportExcelClick: () => void;
    onImportExcelFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
    importFileInputRef: React.RefObject<HTMLInputElement | null>;
    showNewBatch?: boolean;
    onNewBatch?: () => void;
    exportOnly?: boolean;
};

export function PcrTabExportImportActions({
    mode,
    busy,
    onExportPdf,
    onExportExcel,
    onImportExcelClick,
    onImportExcelFile,
    importFileInputRef,
    showNewBatch = false,
    onNewBatch,
    exportOnly = false,
}: Props) {
    const pdfLabel = mode === "price" ? "Export PDF" : "Export PDF";
    const excelLabel = "Export Excel";

    return (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={onExportPdf}
            >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                {pdfLabel}
            </Button>
            <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={onExportExcel}
            >
                {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                {excelLabel}
            </Button>
            {!exportOnly ? (
                <>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={busy}
                        onClick={onImportExcelClick}
                    >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                        Import Excel
                    </Button>
                    <input
                        ref={importFileInputRef}
                        type="file"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={(event) => void onImportExcelFile(event)}
                    />
                </>
            ) : null}
            {!exportOnly && showNewBatch && onNewBatch ? (
                <Button type="button" onClick={onNewBatch} className="w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    New Batch
                </Button>
            ) : null}
        </div>
    );
}
