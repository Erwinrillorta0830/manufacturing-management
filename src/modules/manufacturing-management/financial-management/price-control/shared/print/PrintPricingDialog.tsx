"use client";

import * as React from "react";
import type { MatrixRow, PriceType, Unit } from "../../product-pricing/types";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { generatePricingMatrixPdf } from "../../product-pricing/utils/printPdf";
import { DEFAULT_TABLE_BLOCKS_PER_PAGE } from "../../product-pricing/utils/printLayout";
import { openPricingMatrixPrintWindow } from "../../product-pricing/utils/printPricingMatrixHtml";

type Paper = "a4" | "legal" | "a3";
type Orient = "landscape" | "portrait";
type PrintLayout = "table" | "cards";

type Props = {
    open: boolean;
    onOpenChange: (v: boolean) => void;

    rows: MatrixRow[];
    filtersText: string;
    generatedAtText: string;

    unitName: (id: number | null | undefined) => string;
    units?: Unit[];
    priceTypes?: PriceType[];
    tiers?: string[];
    usedUnitIds?: Set<number>;
    supplierNames?: string[];

    pdfTitle?: string;
    blocksPerPage?: number;
    pdfSaveAsName?: string;
    defaultFontSize?: number;
};

export default function PrintPricingDialog(props: Props) {
    const {
        open,
        onOpenChange,
        rows,
        filtersText,
        generatedAtText,
        pdfTitle,
        blocksPerPage = DEFAULT_TABLE_BLOCKS_PER_PAGE,
        pdfSaveAsName,
        defaultFontSize = 6,
    } = props;

    const [paper, setPaper] = React.useState<Paper>("a4");
    const [orientation, setOrientation] = React.useState<Orient>("landscape");
    const [fontSize, setFontSize] = React.useState<number>(defaultFontSize);
    const [compact, setCompact] = React.useState(true);
    const [includeBarcode, setIncludeBarcode] = React.useState(true);
    const [layout, setLayout] = React.useState<PrintLayout>("table");

    React.useEffect(() => {
        if (open) {
            setFontSize(defaultFontSize);
        }
    }, [open, defaultFontSize]);

    const downloadPdf = React.useCallback(() => {
        generatePricingMatrixPdf(rows, {
            layout,
            paper,
            orientation,
            fontSize,
            compact,
            includeBarcode,
            priceTypes: props.priceTypes,
            tiers: props.tiers,
            units: props.units,
            usedUnitIds: props.usedUnitIds,
            supplierNames: props.supplierNames,
            filtersText,
            title: pdfTitle,
            blocksPerPage: layout === "cards" ? undefined : blocksPerPage,
            cardsPerPage: layout === "cards" ? 6 : undefined,
            saveAsName: pdfSaveAsName,
        });
    }, [
        rows,
        layout,
        paper,
        orientation,
        fontSize,
        compact,
        includeBarcode,
        filtersText,
        pdfTitle,
        blocksPerPage,
        pdfSaveAsName,
        props.priceTypes,
        props.tiers,
        props.units,
        props.usedUnitIds,
        props.supplierNames,
    ]);

    const printInBrowser = React.useCallback(() => {
        openPricingMatrixPrintWindow(rows, {
            layout,
            paper,
            orientation,
            fontSize,
            compact,
            includeBarcode,
            priceTypes: props.priceTypes,
            tiers: props.tiers,
            units: props.units,
            usedUnitIds: props.usedUnitIds,
        });
    }, [rows, layout, paper, orientation, fontSize, compact, includeBarcode, props.priceTypes, props.tiers, props.units, props.usedUnitIds]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[94vw] max-w-[760px] overflow-hidden p-0">
                <div className="flex flex-col">
                    <div className="px-6 pt-6">
                        <DialogHeader className="space-y-0">
                            <DialogTitle className="text-xl font-semibold leading-none">
                                Print Editor
                            </DialogTitle>
                        </DialogHeader>

                        <div className="mt-3 space-y-1">
                            <div className="text-xs text-muted-foreground">
                                Generated:{" "}
                                <span className="text-foreground/80">{generatedAtText}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Filters:{" "}
                                <span className="text-foreground/80">
                                    {filtersText ? filtersText : "(none)"}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Prepared:{" "}
                                <span className="text-foreground/80">
                                    {rows.length.toLocaleString()} product group{rows.length === 1 ? "" : "s"}
                                </span>
                            </div>
                        </div>

                        <Separator className="mt-5" />
                    </div>

                    <div className="px-6 py-5">
                        <div className="grid gap-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Layout</Label>
                                    <Select value={layout} onValueChange={(v) => setLayout(v as PrintLayout)}>
                                        <SelectTrigger className="h-11 rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="table">Table</SelectItem>
                                            <SelectItem value="cards">Cards</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Paper</Label>
                                    <Select value={paper} onValueChange={(v) => setPaper(v as Paper)}>
                                        <SelectTrigger className="h-11 rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="a4">A4</SelectItem>
                                            <SelectItem value="legal">Legal</SelectItem>
                                            <SelectItem value="a3">A3</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Orientation</Label>
                                    <Select
                                        value={orientation}
                                        onValueChange={(v) => setOrientation(v as Orient)}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="landscape">Landscape</SelectItem>
                                            <SelectItem value="portrait">Portrait</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Font size</Label>
                                    <Select
                                        value={String(fontSize)}
                                        onValueChange={(v) => setFontSize(Number(v))}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="5">5</SelectItem>
                                            <SelectItem value="6">6</SelectItem>
                                            <SelectItem value="7">7</SelectItem>
                                            <SelectItem value="8">8</SelectItem>
                                            <SelectItem value="9">9</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Options</Label>
                                <div className="grid gap-2 md:grid-cols-2">
                                    <label className="flex items-center justify-between rounded-xl border px-4 py-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium leading-none">Compact</div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                0.5 inch page margins; maximizes printable area.
                                            </div>
                                        </div>
                                        <Switch checked={compact} onCheckedChange={setCompact} />
                                    </label>

                                    <label className="flex items-center justify-between rounded-xl border px-4 py-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium leading-none">Barcode</div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                Include barcode details.
                                            </div>
                                        </div>
                                        <Switch
                                            checked={includeBarcode}
                                            onCheckedChange={setIncludeBarcode}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t bg-background px-6 py-4">
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                            <Button
                                variant="outline"
                                className="h-11 rounded-xl"
                                onClick={() => onOpenChange(false)}
                            >
                                Close
                            </Button>
                            <Button
                                variant="outline"
                                className="h-11 rounded-xl"
                                onClick={printInBrowser}
                            >
                                Print
                            </Button>
                            <Button className="h-11 rounded-xl px-6" onClick={downloadPdf}>
                                Download PDF
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
