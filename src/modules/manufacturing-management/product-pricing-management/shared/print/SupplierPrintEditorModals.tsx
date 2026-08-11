"use client";

import * as React from "react";

import PrintLargeJobConfirmDialog from "./PrintLargeJobConfirmDialog";
import PrintPrepareDialog from "./PrintPrepareDialog";
import PrintPricingDialog from "./PrintPricingDialog";
import type { useSupplierPrintEditor } from "./useSupplierPrintEditor";

type ModalsProps = ReturnType<typeof useSupplierPrintEditor>["modalsProps"];

export function SupplierPrintEditorModals(props: ModalsProps) {
    return (
        <>
            <PrintLargeJobConfirmDialog
                open={props.largeConfirmOpen}
                totalGroups={props.pendingTotalGroups}
                onContinue={props.onConfirmLargePrint}
                onCancel={props.onCancelLargePrint}
            />

            <PrintPrepareDialog
                open={props.prepareOpen}
                prepared={props.prepareDone}
                total={props.prepareTotal}
                onCancel={props.onCancelPrepare}
            />

            <PrintPricingDialog
                open={props.printOpen}
                onOpenChange={props.onPrintOpenChange}
                rows={props.printRows}
                filtersText={props.printFiltersText}
                generatedAtText={props.printGeneratedAtText}
                unitName={props.unitName}
                units={props.printUnits}
                priceTypes={props.printPriceTypes}
                tiers={props.printTiers}
                usedUnitIds={props.printUsedUnitIds}
                supplierNames={props.printSupplierNames}
                pdfTitle={props.printPdfTitle}
                blocksPerPage={props.printBlocksPerPage}
                pdfSaveAsName={props.printPdfSaveAsName}
                defaultFontSize={props.printDefaultFontSize}
            />
        </>
    );
}
