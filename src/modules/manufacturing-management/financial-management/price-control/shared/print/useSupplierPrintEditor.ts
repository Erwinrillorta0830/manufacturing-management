"use client";

import * as React from "react";
import { toast } from "sonner";

import type { MatrixRow, PriceType, Unit } from "../../product-pricing/types";
import * as pcrApi from "../../price-change-request/providers/pcrApi";
import type { PriceTypeOption, UnitOption } from "../../price-change-request/providers/pcrApi";
import {
    buildSupplierPrintParams,
    fetchSupplierPrintMatrixPages,
} from "../supplier-batch/supplierPrintMatrix";
import * as pricingApi from "../../product-pricing/providers/pricingApi";
import { PRINT_CONFIRM_PRODUCT_THRESHOLD } from "./printConstants";
import {
    buildSupplierPrintFiltersText,
    supplierPrintPdfOptions,
    tiersForSupplierPrintMode,
    type SupplierPrintTierMode,
} from "./supplierPrintTiers";

export type OpenSupplierPrintArgs = {
    supplierId: number;
    supplierName: string;
    tierMode: SupplierPrintTierMode;
    exportModeLabel: string;
};

type PendingSupplierPrintJob = OpenSupplierPrintArgs & {
    groupIds: number[];
    totalGroups: number;
};

function toPriceTypes(priceTypes: PriceTypeOption[]): PriceType[] {
    return priceTypes.map((priceType) => ({
        price_type_id: priceType.price_type_id,
        price_type_name: String(priceType.price_type_name ?? `#${priceType.price_type_id}`),
        sort: priceType.sort ?? null,
    }));
}

function toUnits(units: UnitOption[]): Unit[] {
    return units.map((unit) => ({
        unit_id: unit.unit_id,
        unit_name: unit.unit_name ?? null,
        unit_shortcut: unit.unit_shortcut ?? null,
        order: unit.order ?? null,
    }));
}

export function useSupplierPrintEditor() {
    const [printOpen, setPrintOpen] = React.useState(false);
    const [printRows, setPrintRows] = React.useState<MatrixRow[]>([]);
    const [printPriceTypes, setPrintPriceTypes] = React.useState<PriceType[]>([]);
    const [printUnits, setPrintUnits] = React.useState<Unit[]>([]);
    const [printUsedUnitIds, setPrintUsedUnitIds] = React.useState<Set<number>>(new Set());
    const [printTiers, setPrintTiers] = React.useState<string[]>([]);
    const [printFiltersText, setPrintFiltersText] = React.useState("");
    const [printGeneratedAtText, setPrintGeneratedAtText] = React.useState("");
    const [printSupplierNames, setPrintSupplierNames] = React.useState<string[]>([]);
    const [printPdfTitle, setPrintPdfTitle] = React.useState<string | undefined>();
    const [printBlocksPerPage, setPrintBlocksPerPage] = React.useState<number | undefined>();
    const [printPdfSaveAsName, setPrintPdfSaveAsName] = React.useState<string | undefined>();
    const [printDefaultFontSize, setPrintDefaultFontSize] = React.useState(6);

    const [isBusy, setIsBusy] = React.useState(false);
    const [prepareOpen, setPrepareOpen] = React.useState(false);
    const [prepareProgress, setPrepareProgress] = React.useState({ done: 0, total: 0 });
    const [largeConfirmOpen, setLargeConfirmOpen] = React.useState(false);
    const [pendingJob, setPendingJob] = React.useState<PendingSupplierPrintJob | null>(null);

    const abortRef = React.useRef<AbortController | null>(null);

    const cancelPrepare = React.useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setPrepareOpen(false);
        setIsBusy(false);
    }, []);

    const cancelLargeConfirm = React.useCallback(() => {
        setLargeConfirmOpen(false);
        setPendingJob(null);
        setIsBusy(false);
    }, []);

    const continuePreparation = React.useCallback(async (job: PendingSupplierPrintJob) => {
        const controller = new AbortController();
        abortRef.current = controller;
        const { signal } = controller;

        setIsBusy(true);
        setPrepareProgress({ done: 0, total: job.totalGroups });
        setPrepareOpen(true);

        try {
            const [priceTypesResult, lookupsResult, matrixResult] = await Promise.all([
                pcrApi.getPriceTypes(),
                pcrApi.getLookups(),
                fetchSupplierPrintMatrixPages(job.supplierId, job.groupIds, {
                    signal,
                    onProgress: (done, total) => setPrepareProgress({ done, total }),
                }),
            ]);

            if (signal.aborted) return;

            const mappedPriceTypes = toPriceTypes(priceTypesResult.data ?? []);
            const mappedUnits = toUnits(lookupsResult.units ?? []);
            const tiers = tiersForSupplierPrintMode(mappedPriceTypes, job.tierMode);
            const pdfOptions = supplierPrintPdfOptions({
                supplierName: job.supplierName,
                tierMode: job.tierMode,
            });
            const now = new Date();

            setPrintGeneratedAtText(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
            setPrintFiltersText(
                buildSupplierPrintFiltersText({
                    supplierName: job.supplierName,
                    exportModeLabel: job.exportModeLabel,
                }),
            );
            setPrintRows(matrixResult.rows);
            setPrintPriceTypes(mappedPriceTypes);
            setPrintUnits(mappedUnits);
            setPrintUsedUnitIds(matrixResult.usedUnitIds);
            setPrintTiers(tiers);
            setPrintSupplierNames([job.supplierName]);
            setPrintPdfTitle(pdfOptions.pdfTitle);
            setPrintBlocksPerPage(pdfOptions.blocksPerPage);
            setPrintPdfSaveAsName(pdfOptions.pdfSaveAsName);
            setPrintDefaultFontSize(pdfOptions.defaultFontSize);
            setPrintOpen(true);
        } catch (error: unknown) {
            if (signal.aborted) return;
            const message = error instanceof Error ? error.message : "Failed to open print editor";
            toast.error(message);
        } finally {
            setPrepareOpen(false);
            setIsBusy(false);
            abortRef.current = null;
        }
    }, []);

    const confirmLargePrint = React.useCallback(() => {
        const job = pendingJob;
        if (!job) return;

        setLargeConfirmOpen(false);
        setPendingJob(null);
        void continuePreparation(job);
    }, [pendingJob, continuePreparation]);

    const openSupplierPrint = React.useCallback(
        async (args: OpenSupplierPrintArgs) => {
            setIsBusy(true);
            try {
                const metaRes = await pricingApi.getPrintMatrixMeta(buildSupplierPrintParams(args.supplierId));
                const { meta, groupIds } = metaRes;

                if (meta.totalGroups === 0) {
                    toast.error("No linked products found for the selected supplier.");
                    return;
                }

                const job: PendingSupplierPrintJob = {
                    ...args,
                    totalGroups: meta.totalGroups,
                    groupIds,
                };

                if (meta.totalGroups > PRINT_CONFIRM_PRODUCT_THRESHOLD) {
                    setPendingJob(job);
                    setLargeConfirmOpen(true);
                    return;
                }

                await continuePreparation(job);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Failed to open print editor";
                toast.error(message);
            } finally {
                setIsBusy(false);
            }
        },
        [continuePreparation],
    );

    const unitName = React.useCallback(
        (id: number | null | undefined) => {
            if (!id) return "";
            const unit = printUnits.find((entry) => entry.unit_id === Number(id));
            return unit?.unit_name ?? unit?.unit_shortcut ?? "";
        },
        [printUnits],
    );

    return {
        isBusy,
        openSupplierPrint,
        cancelPrepare,
        cancelLargeConfirm,
        confirmLargePrint,
        modalsProps: {
            largeConfirmOpen,
            pendingTotalGroups: pendingJob?.totalGroups ?? 0,
            onConfirmLargePrint: confirmLargePrint,
            onCancelLargePrint: cancelLargeConfirm,
            prepareOpen,
            prepareDone: prepareProgress.done,
            prepareTotal: prepareProgress.total,
            onCancelPrepare: cancelPrepare,
            printOpen,
            onPrintOpenChange: setPrintOpen,
            printRows,
            printFiltersText,
            printGeneratedAtText,
            unitName,
            printUnits,
            printPriceTypes,
            printTiers,
            printUsedUnitIds,
            printSupplierNames,
            printPdfTitle,
            printBlocksPerPage,
            printPdfSaveAsName,
            printDefaultFontSize,
        },
    };
}
