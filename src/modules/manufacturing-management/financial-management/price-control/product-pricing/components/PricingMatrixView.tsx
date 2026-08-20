// src/modules/supply-chain-management/product-pricing-management/product-pricing/components/PricingMatrixView.tsx
"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { useLookups } from "../hooks/useLookups";
import { usePriceTypes } from "../hooks/usePriceTypes";
import { usePricingMatrix } from "../hooks/usePricingMatrix";

import PricingFiltersBar from "./PricingFiltersBar";
import PricingTable from "./PricingTable";
import BulkSaveBar from "./BulkSaveBar";
import { PriceChangeBatchDialog } from "./PriceChangeBatchDialog";
import { CreatePriceChangeBatchDialog } from "../../price-change-request/components/CreatePriceChangeBatchDialog";
import { SessionExpiredPanel } from "../../shared/SessionExpiredPanel";

import { buildMatrixTierKeys, priceViewFilterLabel } from "../utils/pivot";
import * as api from "../providers/pricingApi";
import * as pcrApi from "../../price-change-request/providers/pcrApi";
import type { PrintFilterParams } from "../providers/pricingApi";
import PrintPricingDialog from "./PrintPricingDialog";
import PrintPrepareDialog from "./PrintPrepareDialog";
import PrintLargeJobConfirmDialog from "./PrintLargeJobConfirmDialog";

import { exportSupplierBatchExcel } from "../../shared/supplier-batch/supplierBatchExcel";
import {
    ExcelExportOptionsDialog,
    type ExcelExportColumnMode,
} from "../../shared/supplier-batch/ExcelExportOptionsDialog";
import { parseSupplierBatchExcelImport } from "../../price-change-request/utils/supplierBatchExcel";
import { productIdsFromMatrixRows } from "../../shared/supplier-batch/flattenPrintMatrix";
import { fetchSupplierPrintMatrix } from "../../shared/supplier-batch/supplierPrintMatrix";
import { requireSingleSupplier } from "../../shared/supplier-batch/requireSingleSupplier";
import type { BatchImportPrefill } from "../../price-change-request/types";

import type {
    Brand,
    Category,
    MatrixRow,
    PricingFilters,
    Supplier,
    Unit,
} from "../types";

type SupplierScope = "ALL" | "LINKED_ONLY";

import {
    PRINT_CONFIRM_PRODUCT_THRESHOLD,
    PRINT_GROUP_CHUNK_SIZE,
} from "../../shared/print/printConstants";
import { buildProductPricingPdfSaveAsName } from "../../shared/print/pdfFileNames";
import { DEFAULT_TABLE_BLOCKS_PER_PAGE } from "../utils/printLayout";

type PendingPrintJob = {
    filters: PricingFilters;
    printParams: PrintFilterParams;
    totalGroups: number;
    groupIds: number[];
};

function safeStr(v: unknown): string {
    const s = String(v ?? "").trim();
    if (!s || s === "undefined" || s === "null") return "";
    return s;
}

function toBool01(v: boolean, default01: "0" | "1"): "0" | "1" {
    if (typeof v !== "boolean") return default01;
    return v ? "1" : "0";
}

function toMap<T extends Record<string, string | number | null | undefined>>(
    arr: T[],
    idKey: keyof T,
    labelKey: keyof T,
): Map<number, string> {
    const map = new Map<number, string>();

    for (const item of arr) {
        const id = Number(item[idKey]);
        const label = String(item[labelKey] ?? "");

        if (Number.isFinite(id) && label) {
            map.set(id, label);
        }
    }

    return map;
}

function getIds(
    filters: PricingFilters,
    arrayKey: "category_ids" | "brand_ids" | "unit_ids" | "supplier_ids",
): string[] {
    return filters[arrayKey].map((item) => String(item));
}

function labelListFromIds(ids: string[], byId: Map<number, string>): string[] {
    const out: string[] = [];

    for (const raw of ids) {
        const id = Number(raw);
        out.push(Number.isFinite(id) ? byId.get(id) ?? raw : raw);
    }

    return out.filter(Boolean);
}

function buildFiltersText(args: {
    filters: PricingFilters;
    categoriesById: Map<number, string>;
    brandsById: Map<number, string>;
    unitsById: Map<number, string>;
    suppliersById: Map<number, string>;
    priceTypes: import("../types").PriceType[];
}): string {
    const { filters, categoriesById, brandsById, unitsById, suppliersById, priceTypes } = args;

    const parts: string[] = [];

    const q = safeStr(filters.q);

    const categoryIds = getIds(filters, "category_ids");
    const brandIds = getIds(filters, "brand_ids");
    const unitIds = getIds(filters, "unit_ids");
    const supplierIds = getIds(filters, "supplier_ids");

    if (q) parts.push(`Search: ${q}`);

    if (categoryIds.length) {
        const names = labelListFromIds(categoryIds, categoriesById);
        parts.push(`Categories: ${names.join(", ")}`);
    } else {
        parts.push(`Categories: All Categories`);
    }

    if (brandIds.length) {
        const names = labelListFromIds(brandIds, brandsById);
        parts.push(`Brands: ${names.join(", ")}`);
    } else {
        parts.push(`Brands: All Brands`);
    }

    if (unitIds.length) {
        const names = labelListFromIds(unitIds, unitsById);
        parts.push(`Units: ${names.join(", ")}`);
    }

    if (supplierIds.length) {
        const names = labelListFromIds(supplierIds, suppliersById);
        parts.push(`Suppliers: ${names.join(", ")}`);
    }

    if (supplierIds.length && filters.supplier_scope === "LINKED_ONLY") {
        parts.push("Scope: Linked Only");
    }

    if (filters.active_only) parts.push("Active Only");
    if (filters.missing_tier) parts.push("Missing Tier");

    parts.push(
        `Price view: ${priceViewFilterLabel({
            priceView: filters.price_view,
            priceTypeIds: filters.price_type_ids,
            priceTypes,
            showListPrice: filters.show_list_price,
        })}`,
    );

    return parts.join(" • ");
}

function uniqNumSetFromRows(
    rows: MatrixRow[],
    key: "product_category" | "product_brand" | "unit_of_measurement",
): Set<number> {
    const result = new Set<number>();

    for (const row of rows) {
        const value = Number(row.display?.[key]);
        if (!Number.isNaN(value) && value > 0) {
            result.add(value);
        }
    }

    return result;
}

function sameNumberArray(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }

    return true;
}

function buildPrintFilterParams(filters: PricingFilters): PrintFilterParams {
    return {
        q: safeStr(filters.q) || undefined,
        category_ids: filters.category_ids.length ? filters.category_ids.join(",") : undefined,
        brand_ids: filters.brand_ids.length ? filters.brand_ids.join(",") : undefined,
        unit_ids: filters.unit_ids.length ? filters.unit_ids.join(",") : undefined,
        supplier_ids: filters.supplier_ids.length ? filters.supplier_ids.join(",") : undefined,
        supplier_scope: filters.supplier_scope,
        active_only: toBool01(filters.active_only, "1"),
        missing_tier: toBool01(filters.missing_tier, "0"),
    };
}

function enrichPrintMatrixRows(
    rows: MatrixRow[],
    lookupMaps: {
        categoriesById: Map<number, string>;
        brandsById: Map<number, string>;
    },
): MatrixRow[] {
    return rows.map((row) => ({
        ...row,
        category_name: row.display.product_category
            ? lookupMaps.categoriesById.get(Number(row.display.product_category)) ?? null
            : null,
        brand_name: row.display.product_brand
            ? lookupMaps.brandsById.get(Number(row.display.product_brand)) ?? null
            : null,
    }));
}

function buildLookupMaps(args: {
    categories: Category[];
    brands: Brand[];
    units: Unit[];
    suppliers: Supplier[];
}) {
    const categoriesById = toMap(args.categories, "category_id", "category_name");
    const brandsById = toMap(args.brands, "brand_id", "brand_name");

    const unitsById = new Map<number, string>();
    for (const unit of args.units) {
        const id = Number(unit.unit_id);
        const label = String(unit.unit_shortcut ?? unit.unit_name ?? "");
        if (Number.isFinite(id) && label) {
            unitsById.set(id, label);
        }
    }

    const suppliersById = new Map<number, string>();
    for (const supplier of args.suppliers) {
        const id = Number(supplier.id);
        const shortcut = safeStr(supplier.supplier_shortcut);
        const name = safeStr(supplier.supplier_name);
        const label = shortcut ? `${shortcut} — ${name}` : name;

        if (Number.isFinite(id) && label) {
            suppliersById.set(id, label);
        }
    }

    return { categoriesById, brandsById, unitsById, suppliersById };
}

export default function PricingMatrixView() {
    const pt = usePriceTypes();

    const [lookupFilterInput, setLookupFilterInput] = React.useState<Partial<PricingFilters>>({
        supplier_scope: "ALL",
        supplier_ids: [],
        category_ids: [],
        brand_ids: [],
    });

    const lookups = useLookups(lookupFilterInput);

    const lookupMaps = React.useMemo(
        () =>
            buildLookupMaps({
                categories: lookups.categories,
                brands: lookups.brands,
                units: lookups.units,
                suppliers: lookups.suppliers,
            }),
        [lookups.categories, lookups.brands, lookups.units, lookups.suppliers],
    );

    const { matrix, dirtySummary } = usePricingMatrix({
        categoriesById: lookupMaps.categoriesById,
        brandsById: lookupMaps.brandsById,
        unitsById: lookupMaps.unitsById,
        unitsList: lookups.units,
        priceTypes: pt.priceTypes,
        updatedBy: null,
    });

    React.useEffect(() => {
        setLookupFilterInput({
            supplier_scope: matrix.filters.supplier_scope,
            supplier_ids: matrix.filters.supplier_ids,
            category_ids: matrix.filters.category_ids,
            brand_ids: matrix.filters.brand_ids,
        });
    }, [
        matrix.filters.supplier_scope,
        matrix.filters.supplier_ids,
        matrix.filters.category_ids,
        matrix.filters.brand_ids,
    ]);

    const selectedSupplierIds = React.useMemo(
        () => matrix.filters.supplier_ids.map((id) => String(id)),
        [matrix.filters.supplier_ids],
    );

    const printSupplierNames = React.useMemo(
        () => labelListFromIds(selectedSupplierIds, lookupMaps.suppliersById),
        [lookupMaps.suppliersById, selectedSupplierIds],
    );

    const supplierScope: SupplierScope = matrix.filters.supplier_scope;
    const supplierFilterActive =
        selectedSupplierIds.length > 0 && supplierScope === "LINKED_ONLY";
    const batchSupplierOptions = React.useMemo(() => {
        if (!supplierFilterActive || selectedSupplierIds.length === 0) {
            return lookups.suppliers;
        }
        const allowed = new Set(selectedSupplierIds.map(Number));
        return lookups.suppliers.filter((supplier) => allowed.has(supplier.id));
    }, [supplierFilterActive, selectedSupplierIds, lookups.suppliers]);

    const defaultBatchSupplierId = React.useMemo(() => {
        if (!supplierFilterActive || selectedSupplierIds.length !== 1) return null;
        const id = Number(selectedSupplierIds[0]);
        return Number.isFinite(id) && id > 0 ? id : null;
    }, [supplierFilterActive, selectedSupplierIds]);

    const currentRows = React.useMemo<MatrixRow[]>(
        () => (Array.isArray(matrix.rows) ? matrix.rows : []),
        [matrix.rows],
    );
    const allowedCategoryIds = React.useMemo(() => {
        if (!supplierFilterActive) return null;
        return uniqNumSetFromRows(currentRows, "product_category");
    }, [supplierFilterActive, currentRows]);

    const allowedBrandIds = React.useMemo(() => {
        if (!supplierFilterActive) return null;
        return uniqNumSetFromRows(currentRows, "product_brand");
    }, [supplierFilterActive, currentRows]);

    const allowedUnitIds = React.useMemo(() => {
        if (!supplierFilterActive) return null;

        const ids = new Set<number>();

        for (const row of currentRows) {
            for (const key of Object.keys(row.variantsByUnitId)) {
                const unitId = Number(key);
                if (!Number.isNaN(unitId) && unitId > 0) {
                    ids.add(unitId);
                }
            }
        }

        if (ids.size === 0) {
            const fallback = uniqNumSetFromRows(currentRows, "unit_of_measurement");
            for (const id of fallback) ids.add(id);
        }

        return ids;
    }, [supplierFilterActive, currentRows]);

    const scopedCategories = React.useMemo(() => {
        if (!supplierFilterActive || !allowedCategoryIds) return lookups.categories;
        return lookups.categories.filter((item) => allowedCategoryIds.has(Number(item.category_id)));
    }, [supplierFilterActive, allowedCategoryIds, lookups.categories]);

    const scopedBrands = React.useMemo(() => {
        if (!supplierFilterActive || !allowedBrandIds) return lookups.brands;
        return lookups.brands.filter((item) => allowedBrandIds.has(Number(item.brand_id)));
    }, [supplierFilterActive, allowedBrandIds, lookups.brands]);

    const scopedUnits = React.useMemo(() => {
        if (!supplierFilterActive || !allowedUnitIds) return lookups.units;
        return lookups.units.filter((item) => allowedUnitIds.has(Number(item.unit_id)));
    }, [supplierFilterActive, allowedUnitIds, lookups.units]);

    const sanitizeKeyRef = React.useRef<string>("");

    React.useEffect(() => {
        if (!supplierFilterActive) {
            sanitizeKeyRef.current = "";
            return;
        }

        if (matrix.loading) return;
        if (!currentRows.length) return;
        if (!allowedCategoryIds || !allowedBrandIds || !allowedUnitIds) return;

        const key = `${selectedSupplierIds.join(",")}|${supplierScope}`;
        if (sanitizeKeyRef.current === key) return;

        const currentCat = matrix.filters.category_ids;
        const currentBrand = matrix.filters.brand_ids;
        const currentUnit = matrix.filters.unit_ids;

        const nextCat = currentCat.filter((id) => allowedCategoryIds.has(Number(id)));
        const nextBrand = currentBrand.filter((id) => allowedBrandIds.has(Number(id)));
        const nextUnit = currentUnit.filter((id) => allowedUnitIds.has(Number(id)));

        const willChange =
            !sameNumberArray(currentCat, nextCat) ||
            !sameNumberArray(currentBrand, nextBrand) ||
            !sameNumberArray(currentUnit, nextUnit);

        sanitizeKeyRef.current = key;

        if (!willChange) return;

        matrix.setFilters((prev: PricingFilters): PricingFilters => ({
            ...prev,
            category_ids: nextCat,
            brand_ids: nextBrand,
            unit_ids: nextUnit,
        }));
    }, [
        supplierFilterActive,
        supplierScope,
        selectedSupplierIds,
        matrix.loading,
        currentRows,
        allowedCategoryIds,
        allowedBrandIds,
        allowedUnitIds,
        matrix.filters.category_ids,
        matrix.filters.brand_ids,
        matrix.filters.unit_ids,
        matrix.setFilters,
        matrix,
    ]);

    const [printOpen, setPrintOpen] = React.useState(false);
    const [batchDialogOpen, setBatchDialogOpen] = React.useState(false);
    const [unsavedAction, setUnsavedAction] = React.useState<"refresh" | "discard" | null>(null);
    const [printFiltersText, setPrintFiltersText] = React.useState("");
    const [printGeneratedAt, setPrintGeneratedAt] = React.useState("");
    const [printPdfSaveAsName, setPrintPdfSaveAsName] = React.useState("");
    const [isPrinting, setIsPrinting] = React.useState(false);
    const [printMatrixRows, setPrintMatrixRows] = React.useState<MatrixRow[]>([]);
    const [printTiers, setPrintTiers] = React.useState<string[]>([]);
    const [printUsedUnitIds, setPrintUsedUnitIds] = React.useState<Set<number>>(new Set());
    const [printPrepareOpen, setPrintPrepareOpen] = React.useState(false);
    const [printPrepareProgress, setPrintPrepareProgress] = React.useState({ done: 0, total: 0 });
    const [largePrintConfirmOpen, setLargePrintConfirmOpen] = React.useState(false);
    const [pendingPrintJob, setPendingPrintJob] = React.useState<PendingPrintJob | null>(null);
    const [excelBusy, setExcelBusy] = React.useState(false);
    const [excelOptionsOpen, setExcelOptionsOpen] = React.useState(false);
    const [importPrefill, setImportPrefill] = React.useState<BatchImportPrefill | null>(null);
    const [createBatchOpen, setCreateBatchOpen] = React.useState(false);
    const importFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const printAbortRef = React.useRef<AbortController | null>(null);

    const cancelPrintPrepare = React.useCallback(() => {
        printAbortRef.current?.abort();
        printAbortRef.current = null;
        setPrintPrepareOpen(false);
        setIsPrinting(false);
    }, []);

    const cancelLargePrintConfirm = React.useCallback(() => {
        setLargePrintConfirmOpen(false);
        setPendingPrintJob(null);
        setIsPrinting(false);
    }, []);

    const continuePrintPreparation = React.useCallback(
        async (job: PendingPrintJob) => {
            const controller = new AbortController();
            printAbortRef.current = controller;
            const { signal } = controller;

            setIsPrinting(true);
            setPrintPrepareProgress({ done: 0, total: job.totalGroups });
            setPrintPrepareOpen(true);

            try {
                const assembled: MatrixRow[] = [];
                const usedUnitIds = new Set<number>();

                for (let offset = 0; offset < job.groupIds.length; offset += PRINT_GROUP_CHUNK_SIZE) {
                    if (signal.aborted) return;

                    const chunk = job.groupIds.slice(offset, offset + PRINT_GROUP_CHUNK_SIZE);
                    const pageRes = await api.getPrintMatrixPage(
                        {
                            ...job.printParams,
                            group_ids: chunk.join(","),
                        },
                        { signal },
                    );

                    assembled.push(...(pageRes.data ?? []));
                    for (const unitId of pageRes.usedUnitIds ?? []) {
                        usedUnitIds.add(unitId);
                    }

                    setPrintPrepareProgress({
                        done: Math.min(offset + chunk.length, job.totalGroups),
                        total: job.totalGroups,
                    });
                }

                const enriched = enrichPrintMatrixRows(assembled, lookupMaps);
                enriched.sort((a, b) =>
                    (a.display.product_name || "").localeCompare(b.display.product_name || ""),
                );

                const resolvedFiltersText = buildFiltersText({
                    filters: job.filters,
                    categoriesById: lookupMaps.categoriesById,
                    brandsById: lookupMaps.brandsById,
                    unitsById: lookupMaps.unitsById,
                    suppliersById: lookupMaps.suppliersById,
                    priceTypes: pt.priceTypes,
                });

                const printableTiers = buildMatrixTierKeys(pt.priceTypes);
                const now = new Date();

                setPrintGeneratedAt(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
                setPrintPdfSaveAsName(
                    buildProductPricingPdfSaveAsName(
                        job.filters.supplier_ids,
                        lookupMaps.suppliersById,
                        now,
                    ),
                );
                setPrintFiltersText(resolvedFiltersText);
                setPrintMatrixRows(enriched);
                setPrintTiers(printableTiers);
                setPrintUsedUnitIds(usedUnitIds);
                setPrintOpen(true);
            } catch (error: unknown) {
                if (signal.aborted) return;
                const message = error instanceof Error ? error.message : "Failed to open print editor";
                toast.error(message);
            } finally {
                setPrintPrepareOpen(false);
                setIsPrinting(false);
                printAbortRef.current = null;
            }
        },
        [lookupMaps, pt.priceTypes],
    );

    const confirmLargePrint = React.useCallback(() => {
        const job = pendingPrintJob;
        if (!job) return;

        setLargePrintConfirmOpen(false);
        setPendingPrintJob(null);
        void continuePrintPreparation(job);
    }, [pendingPrintJob, continuePrintPreparation]);

    const openPrint = React.useCallback(async () => {
        setIsPrinting(true);
        try {
            const filters = matrix.filters;
            const printParams = buildPrintFilterParams(filters);

            const metaRes = await api.getPrintMatrixMeta(printParams);
            const { meta, groupIds } = metaRes;

            if (meta.totalGroups === 0) {
                toast.warning("No printable products found for the current filters.");
                return;
            }

            const job: PendingPrintJob = {
                filters,
                printParams,
                totalGroups: meta.totalGroups,
                groupIds,
            };

            if (meta.totalGroups > PRINT_CONFIRM_PRODUCT_THRESHOLD) {
                setPendingPrintJob(job);
                setLargePrintConfirmOpen(true);
                return;
            }

            await continuePrintPreparation(job);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to open print editor";
            toast.error(message);
        } finally {
            setIsPrinting(false);
        }
    }, [matrix.filters, continuePrintPreparation]);

    React.useEffect(() => {
        if (lookups.error) toast.error(lookups.error);
        if (pt.error) toast.error(pt.error);
    }, [lookups.error, pt.error]);

    const isInitialLoad =
        currentRows.length === 0 &&
        !matrix.error &&
        (lookups.loading || pt.loading || matrix.loading);

    React.useEffect(() => {
        if (dirtySummary.dirtyCount === 0) return;

        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirtySummary.dirtyCount]);

    const handleSave = React.useCallback(() => {
        if (dirtySummary.dirtyCount > 0) {
            setBatchDialogOpen(true);
        }
    }, [dirtySummary.dirtyCount]);

    const loadSupplierExcelMatrix = React.useCallback(async (supplierId: number) => {
        const matrixResult = await fetchSupplierPrintMatrix(supplierId);
        if (matrixResult.totalGroups === 0) {
            throw new Error("No linked products found for the selected supplier.");
        }
        return matrixResult;
    }, []);

    const handleExportExcel = React.useCallback(async (mode: ExcelExportColumnMode) => {
        const supplier = requireSingleSupplier(matrix.filters.supplier_ids, lookups.suppliers);
        if (!supplier) return;

        const includeProposedColumns = mode === "with-proposed";
        setExcelBusy(true);
        try {
            const data = await loadSupplierExcelMatrix(supplier.id);
            const productIds = includeProposedColumns ? productIdsFromMatrixRows(data.rows) : [];
            const [pendingPriceResult, pendingCostResult] = includeProposedColumns
                ? await Promise.all([
                      pcrApi.getPendingPriceRequestsForProducts(productIds),
                      pcrApi.getPendingCostRequestsForProducts(productIds),
                  ])
                : [{ data: [] }, { data: [] }];
            await exportSupplierBatchExcel({
                supplierId: supplier.id,
                supplierName: supplier.name,
                matrixRows: data.rows,
                priceTypes: pt.priceTypes,
                units: lookups.units,
                filenamePrefix: "product-pricing",
                includeListCost: true,
                includeProposedColumns,
                pendingPriceRequests: pendingPriceResult.data,
                pendingCostRequests: pendingCostResult.data,
            });
            toast.success("Excel template downloaded.");
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to export Excel.");
        } finally {
            setExcelBusy(false);
        }
    }, [loadSupplierExcelMatrix, lookups.suppliers, lookups.units, matrix.filters.supplier_ids, pt.priceTypes]);

    const openExcelOptions = React.useCallback(() => {
        if (!requireSingleSupplier(matrix.filters.supplier_ids, lookups.suppliers)) return;
        setExcelOptionsOpen(true);
    }, [lookups.suppliers, matrix.filters.supplier_ids]);

    const handleImportExcelClick = React.useCallback(() => {
        if (!requireSingleSupplier(matrix.filters.supplier_ids, lookups.suppliers)) return;
        importFileInputRef.current?.click();
    }, [lookups.suppliers, matrix.filters.supplier_ids]);

    const openCreateBatchDialog = React.useCallback(() => {
        setImportPrefill(null);
        setCreateBatchOpen(true);
    }, []);

    const handleImportExcelFile = React.useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;

            const supplier = requireSingleSupplier(matrix.filters.supplier_ids, lookups.suppliers);
            if (!supplier) return;

            setExcelBusy(true);
            try {
                const data = await loadSupplierExcelMatrix(supplier.id);
                const parsed = await parseSupplierBatchExcelImport({
                    file,
                    expectedSupplierId: supplier.id,
                    priceTypes: pt.priceTypes,
                    matrixRows: data.rows,
                });

                if (!parsed.ok) {
                    const preview = parsed.errors.slice(0, 5).join("\n");
                    const suffix =
                        parsed.errors.length > 5
                            ? `\n…and ${parsed.errors.length - 5} more issue(s).`
                            : "";
                    toast.error(`Import validation failed.\n${preview}${suffix}`);
                    return;
                }

                setImportPrefill(parsed.prefill);
                setCreateBatchOpen(true);
                toast.success("Imported prices loaded into the new batch dialog.");
            } catch (error: unknown) {
                toast.error(error instanceof Error ? error.message : "Failed to import Excel.");
            } finally {
                setExcelBusy(false);
            }
        },
        [
            loadSupplierExcelMatrix,
            lookups.suppliers,
            matrix,
            pt.priceTypes,
        ],
    );

    const actionBarLoading =
        Boolean(matrix.loading) || isPrinting || excelBusy || lookups.loading || pt.loading;

    const requestRefresh = React.useCallback(() => {
        if (dirtySummary.dirtyCount > 0) {
            setUnsavedAction("refresh");
            return;
        }
        void matrix.refresh();
    }, [matrix, dirtySummary.dirtyCount]);

    const requestDiscard = React.useCallback(() => {
        if (dirtySummary.dirtyCount > 0) {
            setUnsavedAction("discard");
            return;
        }
        dirtySummary.discardAll();
    }, [dirtySummary]);

    const confirmUnsavedAction = React.useCallback(() => {
        const action = unsavedAction;
        setUnsavedAction(null);
        if (action === "refresh") {
            dirtySummary.discardAll();
            void matrix.refresh();
            return;
        }
        if (action === "discard") {
            dirtySummary.discardAll();
        }
    }, [matrix, dirtySummary, unsavedAction]);

    if (lookups.unauthorized || pt.unauthorized || matrix.unauthorized) {
        return <SessionExpiredPanel returnPath="/fm/price-control/product-pricing" />;
    }

    if (isInitialLoad) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col px-0">
            <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="shrink-0">
                    <PricingFiltersBar
                        filters={matrix.filters}
                        setFilters={matrix.setFilters}
                        resetFilters={matrix.resetFilters}
                        categories={scopedCategories}
                        brands={scopedBrands}
                        units={scopedUnits}
                        suppliers={lookups.suppliers}
                        priceTypes={pt.priceTypes}
                    />
                </div>

                <div className="shrink-0">
                    <Separator />
                </div>

                <div className="shrink-0">
                    <BulkSaveBar
                        dirtyCount={dirtySummary.dirtyCount}
                        priceDirtyCount={dirtySummary.priceDirtyCount}
                        costDirtyCount={dirtySummary.costDirtyCount}
                        offPageDirtyCount={dirtySummary.offPageDirtyCount}
                        onSave={handleSave}
                        onDiscard={requestDiscard}
                        onRefresh={requestRefresh}
                        onPrint={openPrint}
                        onExportExcel={openExcelOptions}
                        onImportExcel={handleImportExcelClick}
                        onNewBatch={openCreateBatchDialog}
                        loading={actionBarLoading}
                    />
                    <input
                        ref={importFileInputRef}
                        type="file"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={(event) => void handleImportExcelFile(event)}
                    />
                </div>

                {matrix.error ? (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Products could not be loaded</AlertTitle>
                        <AlertDescription className="space-y-3">
                            <p>{matrix.error}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => requestRefresh()}
                                disabled={Boolean(matrix.loading)}
                            >
                                {matrix.loading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Retry
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col">
                    <PricingTable matrix={matrix} dirtyVersion={dirtySummary.dirtyVersion} />
                </div>

                <PrintLargeJobConfirmDialog
                    open={largePrintConfirmOpen}
                    totalGroups={pendingPrintJob?.totalGroups ?? 0}
                    onContinue={confirmLargePrint}
                    onCancel={cancelLargePrintConfirm}
                />

                <PrintPrepareDialog
                    open={printPrepareOpen}
                    prepared={printPrepareProgress.done}
                    total={printPrepareProgress.total}
                    onCancel={cancelPrintPrepare}
                />

                <PrintPricingDialog
                    open={printOpen}
                    onOpenChange={setPrintOpen}
                    rows={printMatrixRows}
                    filtersText={printFiltersText}
                    generatedAtText={printGeneratedAt}
                    unitName={(id) => (id ? lookupMaps.unitsById.get(Number(id)) ?? "" : "")}
                    units={lookups.units}
                    priceTypes={pt.priceTypes}
                    tiers={printTiers}
                    usedUnitIds={printUsedUnitIds}
                    supplierNames={printSupplierNames}
                    pdfSaveAsName={printPdfSaveAsName}
                    blocksPerPage={DEFAULT_TABLE_BLOCKS_PER_PAGE}
                />

                <ExcelExportOptionsDialog
                    open={excelOptionsOpen}
                    onOpenChange={setExcelOptionsOpen}
                    busy={excelBusy}
                    onConfirm={(mode) => {
                        setExcelOptionsOpen(false);
                        void handleExportExcel(mode);
                    }}
                />

                <PriceChangeBatchDialog
                    open={batchDialogOpen}
                    onOpenChange={setBatchDialogOpen}
                    suppliers={lookups.suppliers}
                    batchSupplierOptions={batchSupplierOptions}
                    defaultSupplierId={defaultBatchSupplierId}
                    priceLineCount={dirtySummary.priceDirtyCount}
                    costLineCount={dirtySummary.costDirtyCount}
                    offPageDirtyCount={dirtySummary.offPageDirtyCount}
                    previewLines={dirtySummary.dirtyPreviewLines}
                    onSubmit={(payload) => dirtySummary.saveAll(payload)}
                />

                <CreatePriceChangeBatchDialog
                    open={createBatchOpen}
                    onOpenChange={(open) => {
                        setCreateBatchOpen(open);
                        if (!open) setImportPrefill(null);
                    }}
                    suppliers={lookups.suppliers}
                    onCreated={() => void matrix.refresh()}
                    importPrefill={importPrefill}
                />

                <AlertDialog
                    open={unsavedAction != null}
                    onOpenChange={(open) => {
                        if (!open) setUnsavedAction(null);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {unsavedAction === "refresh"
                                    ? `You have ${dirtySummary.dirtyCount} unsaved change(s). Refreshing will reload the grid and discard those edits.${
                                          dirtySummary.offPageDirtyCount > 0
                                              ? ` ${dirtySummary.offPageDirtyCount} of those are on other pages.`
                                              : ""
                                      }`
                                    : `You have ${dirtySummary.dirtyCount} unsaved change(s). This action cannot be undone.${
                                          dirtySummary.offPageDirtyCount > 0
                                              ? ` ${dirtySummary.offPageDirtyCount} of those are on other pages.`
                                              : ""
                                      }`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep editing</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={confirmUnsavedAction}>
                                {unsavedAction === "refresh" ? "Refresh anyway" : "Discard changes"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
