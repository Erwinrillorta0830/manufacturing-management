"use client";

import * as React from "react";
import { toast } from "sonner";

import * as api from "../providers/pcrApi";
import { generateBatchReferenceNo } from "../../shared/batchReference";
import type { BatchImportPrefill, CreateCCRPayload, CreatePriceChangeBatchPayload } from "../types";
import { buildTierPriceMap, lookupTierPrice } from "../utils/tierPriceLookup";
import {
    COST_MAX_DECIMAL_PLACES,
    PRICE_MAX_DECIMAL_PLACES,
    formatCostNumber,
    formatPriceNumber,
    parseDecimalInput,
} from "../../shared/pricePrecision";
import { useEditableGridNavigation } from "./useEditableGridNavigation";

type FieldErrors = Partial<Record<"supplier_id" | "remarks" | "lines", string>>;

function safeStr(value: unknown): string {
    const text = String(value ?? "").trim();
    return text && text !== "undefined" && text !== "null" ? text : "";
}

export function supplierText(supplier: api.SupplierOption): string {
    const shortcut = safeStr(supplier.supplier_shortcut);
    const name = safeStr(supplier.supplier_name);
    return shortcut ? `${shortcut} - ${name}` : name || `Supplier #${supplier.id}`;
}

export function formatMoney(value: number | null | undefined) {
    return formatPriceNumber(value);
}

export function formatCostMoney(value: number | null | undefined) {
    return formatCostNumber(value);
}

export function priceTypeLabel(priceType: api.PriceTypeOption) {
    return safeStr(priceType.price_type_name) || `#${priceType.price_type_id}`;
}

function unitOptionLabel(unit: api.UnitOption) {
    return safeStr(unit.unit_name) || safeStr(unit.unit_shortcut);
}

function sortPriceTypes(priceTypes: api.PriceTypeOption[]) {
    return [...priceTypes].sort((a, b) => {
        const aSort = Number(a.sort ?? Number.MAX_SAFE_INTEGER);
        const bSort = Number(b.sort ?? Number.MAX_SAFE_INTEGER);
        return aSort - bSort || priceTypeLabel(a).localeCompare(priceTypeLabel(b));
    });
}

export function cellKey(productId: number, priceTypeId: number) {
    return `${productId}:${priceTypeId}`;
}

export function parsePriceInput(value: string) {
    return parseDecimalInput(value, PRICE_MAX_DECIMAL_PLACES);
}

export function parseCostInput(value: string) {
    return parseDecimalInput(value, COST_MAX_DECIMAL_PLACES);
}



function applyPendingRows(
    map: Map<string, number>,
    priceRows: api.PendingPriceRequestLookupRow[],
    costRows: api.PendingCostRequestLookupRow[],
) {
    for (const row of priceRows) {
        if (row.proposed_price === null) continue;
        map.set(cellKey(row.product_id, row.price_type_id), row.proposed_price);
    }
    for (const row of costRows) {
        if (row.proposed_cost === null) continue;
        map.set(`${row.product_id}:LIST`, row.proposed_cost);
    }
}

const DEFAULT_CATALOG_PAGE_SIZE = 50;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
    importPrefill: BatchImportPrefill | null;
};

export function useCreateBatchState({
    open,
    onOpenChange,
    onCreated,
    importPrefill,
}: Props) {
    const [referenceNo, setReferenceNo] = React.useState("");
    const [remarks, setRemarks] = React.useState("");
    const [errors, setErrors] = React.useState<FieldErrors>({});
    const [priceTypes, setPriceTypes] = React.useState<api.PriceTypeOption[]>([]);
    const [unitLabelMap, setUnitLabelMap] = React.useState<Map<number, string>>(new Map());
    const [products, setProducts] = React.useState<api.ProductSearchRow[]>([]);
    const [productCatalog, setProductCatalog] = React.useState<Map<number, api.ProductSearchRow>>(new Map());
    const [tierPriceMap, setTierPriceMap] = React.useState<Map<string, number | null>>(new Map());
    const [draftPrices, setDraftPrices] = React.useState<Map<string, string>>(new Map());
    const [draftCosts, setDraftCosts] = React.useState<Map<number, string>>(new Map());
    const [currentCostMap, setCurrentCostMap] = React.useState<Map<number, number | null>>(new Map());
    const [pendingValues, setPendingValues] = React.useState<Map<string, number>>(new Map());
    const [catalogPage, setCatalogPage] = React.useState(1);
    const [catalogPageSize, setCatalogPageSize] = React.useState(DEFAULT_CATALOG_PAGE_SIZE);
    const [catalogTotal, setCatalogTotal] = React.useState(0);
    const [catalogTotalVariants, setCatalogTotalVariants] = React.useState(0);
    const [catalogTotalPages, setCatalogTotalPages] = React.useState(0);
    const [catalogQuery, setCatalogQuery] = React.useState("");
    const [localCatalogQ, setLocalCatalogQ] = React.useState("");
    const [loadingPriceTypes, setLoadingPriceTypes] = React.useState(false);
    const [loadingProducts, setLoadingProducts] = React.useState(false);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [importedProductIds, setImportedProductIds] = React.useState<number[]>([]);
    const [catalogViewMode, setCatalogViewMode] = React.useState<"catalog" | "imported">("catalog");

    const productCatalogRef = React.useRef(productCatalog);
    const tierPriceMapRef = React.useRef(tierPriceMap);
    const pendingValuesRef = React.useRef(pendingValues);
    productCatalogRef.current = productCatalog;
    tierPriceMapRef.current = tierPriceMap;
    pendingValuesRef.current = pendingValues;

    const resetCatalogState = React.useCallback(() => {
        setProducts([]);
        setProductCatalog(new Map());
        setTierPriceMap(new Map());
        setDraftPrices(new Map());
        setDraftCosts(new Map());
        setCurrentCostMap(new Map());
        setPendingValues(new Map());
        setCatalogPage(1);
        setCatalogPageSize(DEFAULT_CATALOG_PAGE_SIZE);
        setCatalogTotal(0);
        setCatalogTotalVariants(0);
        setCatalogTotalPages(0);
        setCatalogQuery("");
        setLocalCatalogQ("");
    }, []);

    const mergePendingRequests = React.useCallback(async (productIds: number[]) => {
        const ids = Array.from(new Set(productIds.filter((id) => Number.isFinite(id) && id > 0)));
        if (ids.length === 0) return;
        const [pendingPriceResult, pendingCostResult] = await Promise.all([
            api.getPendingPriceRequestsForProducts(ids),
            api.getPendingCostRequestsForProducts(ids),
        ]);
        setPendingValues((prev) => {
            const next = new Map(prev);
            applyPendingRows(next, pendingPriceResult.data, pendingCostResult.data);
            return next;
        });
    }, []);

    React.useEffect(() => {
        if (!open) {
            setReferenceNo("");
            setRemarks("");
            setErrors({});
            resetCatalogState();
            setLoadError(null);
            setSaving(false);
            setImportedProductIds([]);
            setCatalogViewMode("catalog");
            return;
        }
        setReferenceNo(generateBatchReferenceNo());
    }, [open, resetCatalogState]);

    React.useEffect(() => {
        if (!open || !importPrefill) return;
        setRemarks(importPrefill.remarks);
        setReferenceNo(generateBatchReferenceNo());
        setErrors({});
        setProductCatalog(new Map(importPrefill.productCatalog));
        setTierPriceMap(new Map(importPrefill.tierPriceMap));
        setDraftPrices(new Map(importPrefill.draftPrices));
        setDraftCosts(new Map(importPrefill.draftCosts));
        setCurrentCostMap(new Map(importPrefill.currentCostMap));
        setPendingValues(new Map());
        void mergePendingRequests(importPrefill.importedProductIds);
        setImportedProductIds(importPrefill.importedProductIds);
        setCatalogViewMode("imported");
        setCatalogPage(1);
        setCatalogQuery("");
        setLocalCatalogQ("");
    }, [open, importPrefill, mergePendingRequests]);

    React.useEffect(() => {
        if (!open) return;
        let alive = true;
        setLoadingPriceTypes(true);
        Promise.all([api.getPriceTypes(), api.getLookups()])
            .then(([priceTypesResult, lookupsResult]) => {
                if (!alive) return;
                setPriceTypes(sortPriceTypes(priceTypesResult.data ?? []));
                setUnitLabelMap(
                    new Map(
                        lookupsResult.units
                            .map((unit): [number, string] | null => {
                                const id = Number(unit.unit_id);
                                const label = unitOptionLabel(unit);
                                return Number.isFinite(id) && id > 0 && label ? [id, label] : null;
                            })
                            .filter((entry): entry is [number, string] => entry !== null),
                    ),
                );
            })
            .catch((error: unknown) => {
                if (!alive) return;
                setPriceTypes([]);
                setUnitLabelMap(new Map());
                setLoadError(error instanceof Error ? error.message : "Failed to load price types and units");
            })
            .finally(() => { if (alive) setLoadingPriceTypes(false); });
        return () => { alive = false; };
    }, [open]);

    React.useEffect(() => {
        if (!open) return;
        let alive = true;
        setLoadingProducts(true);
        setLoadError(null);
        api.getProductsPage({
            active_only: "1",
            page: String(catalogPage), page_size: String(catalogPageSize), q: catalogQuery || undefined,
        })
            .then(async (result) => {
                if (!alive) return;
                const productIds = result.data.map((row) => row.product_id);
                const [priceResult, pendingPriceResult, pendingCostResult] = await Promise.all([
                    api.getPricesForProducts(productIds),
                    api.getPendingPriceRequestsForProducts(productIds),
                    api.getPendingCostRequestsForProducts(productIds),
                ]);
                if (!alive) return;
                setProducts(result.data);
                setCatalogTotal(Number(result.meta?.total ?? result.data.length));
                setCatalogTotalVariants(Number(result.meta?.totalVariants ?? result.data.length));
                setCatalogTotalPages(Math.max(0, Number(result.meta?.totalPages ?? 0)));
                setProductCatalog((prev) => {
                    const next = new Map(prev);
                    for (const row of result.data) next.set(row.product_id, row);
                    return next;
                });
                setCurrentCostMap((prev) => {
                    const next = new Map(prev);
                    for (const row of result.data) next.set(row.product_id, row.cost_per_unit ?? null);
                    return next;
                });
                setTierPriceMap((prev) => {
                    const next = new Map(prev);
                    for (const [key, value] of buildTierPriceMap(priceResult.data)) next.set(key, value);
                    return next;
                });
                setPendingValues((prev) => {
                    const next = new Map(prev);
                    applyPendingRows(next, pendingPriceResult.data, pendingCostResult.data);
                    return next;
                });
            })
            .catch((error: unknown) => {
                if (!alive) return;
                setProducts([]);
                setLoadError(error instanceof Error ? error.message : "Failed to load supplier products");
            })
            .finally(() => { if (alive) setLoadingProducts(false); });
        return () => { alive = false; };
    }, [open, catalogPage, catalogPageSize, catalogQuery]);

    const applyCatalogSearch = React.useCallback(() => {
        setCatalogQuery(localCatalogQ.trim());
        setCatalogPage(1);
    }, [localCatalogQ]);

    const importedProducts = React.useMemo(
        () => importedProductIds.map((id) => productCatalog.get(id)).filter((p): p is api.ProductSearchRow => Boolean(p)),
        [importedProductIds, productCatalog],
    );

    const gridProducts = catalogViewMode === "imported" ? importedProducts : products;
    const showingImportedView = catalogViewMode === "imported" && importedProductIds.length > 0;
    const catalogStartIndex = catalogTotal > 0 && products.length > 0 ? (catalogPage - 1) * catalogPageSize + 1 : 0;
    const catalogEndIndex = catalogTotal > 0 && products.length > 0 ? catalogStartIndex + products.length - 1 : 0;
    const canCatalogPrev = catalogPage > 1;
    const canCatalogNext = catalogTotalPages > 0 ? catalogPage < catalogTotalPages : false;



    const priceTypesById = React.useMemo(() => {
        const map = new Map<number, api.PriceTypeOption>();
        for (const pt of priceTypes) map.set(pt.price_type_id, pt);
        return map;
    }, [priceTypes]);

    const currentPriceFor = React.useCallback(
        (product: api.ProductSearchRow, pt: api.PriceTypeOption) =>
            lookupTierPrice(tierPriceMapRef.current, product.product_id, pt.price_type_id),
        [],
    );

    const validation = React.useMemo(() => {
        let validPrice = 0, validCost = 0;
        const invPrice = new Set<string>(), invCost = new Set<number>();
        for (const [key, raw] of draftPrices) {
            if (pendingValues.has(key)) continue;
            const r = parsePriceInput(raw);
            if (r.error) invPrice.add(key);
            if (r.value !== null) validPrice++;
        }
        for (const [pid, raw] of draftCosts) {
            if (pendingValues.has(`${pid}:LIST`)) continue;
            const r = parseCostInput(raw);
            if (r.error) invCost.add(pid);
            if (r.value !== null) validCost++;
        }
        return { validPriceCount: validPrice, validCostCount: validCost, validCount: validPrice + validCost, invalidPriceKeys: invPrice, invalidCostIds: invCost, invalidKeys: invPrice };
    }, [draftCosts, draftPrices, pendingValues]);

    const showListCost = true;

    const currentCostFor = React.useCallback(
        (product: api.ProductSearchRow) => currentCostMap.get(product.product_id) ?? null,
        [currentCostMap],
    );

    const unitLabelFor = React.useCallback(
        (product: api.ProductSearchRow) => {
            const id = Number(product.unit_of_measurement);
            return Number.isFinite(id) && id > 0 ? unitLabelMap.get(id) ?? null : null;
        },
        [unitLabelMap],
    );

    const setDraftCost = React.useCallback((product: api.ProductSearchRow, value: string) => {
        if (pendingValuesRef.current.has(`${product.product_id}:LIST`)) return;
        setDraftCosts((prev) => { const n = new Map(prev); if (value.trim()) n.set(product.product_id, value); else n.delete(product.product_id); return n; });
        setErrors((prev) => ({ ...prev, lines: undefined }));
    }, []);

    const setDraftPrice = React.useCallback(
        (product: api.ProductSearchRow, priceTypeId: number, value: string) => {
            setDraftPrices((prev) => {
                const next = new Map(prev);
                const key = cellKey(product.product_id, priceTypeId);
                if (pendingValuesRef.current.has(key)) return prev;
                if (value.trim()) next.set(key, value); else next.delete(key);
                return next;
            });
            setErrors((prev) => ({ ...prev, lines: undefined }));
        },
        [],
    );

    const buildLines = React.useCallback((): CreatePriceChangeBatchPayload["lines"] => {
        const lines: CreatePriceChangeBatchPayload["lines"] = [];
        const covered = new Set<string>();
        const catalog = productCatalogRef.current;
        const addLine = (pid: number, ptid: number, raw: string) => {
            const key = cellKey(pid, ptid);
            if (covered.has(key) || pendingValuesRef.current.has(key)) return;
            const product = catalog.get(pid);
            const pt = priceTypesById.get(ptid);
            const parsed = parsePriceInput(raw);
            if (!product || !pt || parsed.value === null || parsed.error) return;
            covered.add(key);
            lines.push({ product_id: pid, price_type_id: ptid, current_price: currentPriceFor(product, pt), proposed_price: parsed.value });
        };
        for (const [key, raw] of draftPrices) { const [p, t] = key.split(":"); addLine(Number(p), Number(t), raw); }
        return lines;
    }, [currentPriceFor, draftPrices, priceTypesById]);

    const buildCostLines = React.useCallback((): CreateCCRPayload[] => {
        const items: CreateCCRPayload[] = [];
        for (const [pid, raw] of draftCosts) {
            if (pendingValuesRef.current.has(`${pid}:LIST`)) continue;
            const parsed = parseCostInput(raw);
            if (parsed.value === null || parsed.error) continue;
            const product = productCatalogRef.current.get(pid);
            if (!product) continue;
            items.push({ product_id: pid, proposed_cost: parsed.value, current_cost: currentCostMap.get(pid) ?? null });
        }
        return items;
    }, [currentCostMap, draftCosts]);

    const gridNav = useEditableGridNavigation({
        rowCount: gridProducts.length,
        colCount: priceTypes.length + (showListCost ? 1 : 0),
        disabled: saving,
        onPasteSkipped: (count) => toast.warning(`${count} pasted cell(s) skipped. Only non-negative numbers are accepted.`),
    });

    const catalogLoading = loadingPriceTypes || loadingProducts;

    const canSubmit =
        !saving && !catalogLoading && Boolean(remarks.trim()) &&
        validation.validCount > 0 && validation.invalidPriceKeys.size === 0 && validation.invalidCostIds.size === 0;

    const handleSubmit = React.useCallback(async () => {
        const nextErrors: FieldErrors = {};
        const trimmedRemarks = remarks.trim();
        if (!trimmedRemarks) nextErrors.remarks = "Remarks is required.";
        if (validation.invalidPriceKeys.size > 0 || validation.invalidCostIds.size > 0) nextErrors.lines = "Fix invalid proposed prices or list costs before submitting.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSaving(true);
        try {
            const priceLines = buildLines();
            const costItems = buildCostLines();
            if (priceLines.length === 0 && costItems.length === 0) { setErrors({ lines: "Enter at least one proposed price or list cost." }); return; }
            
            const result = await api.saveMixedPricingChanges({
                price_lines: priceLines,
                cost_items: costItems,
                batch: {
                    reference_no: referenceNo || undefined,
                    remarks: trimmedRemarks,
                },
            });
            toast.success(`Created ${result.price.created} price line(s) and ${result.cost.created} list cost line(s).`);
            onCreated();
            onOpenChange(false);
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to create price change batch");
        } finally { setSaving(false); }
    }, [buildCostLines, buildLines, onCreated, onOpenChange, referenceNo, remarks, validation.invalidCostIds.size, validation.invalidPriceKeys.size]);

    return {
        referenceNo, remarks, errors, setErrors, setRemarks,
        priceTypes, unitLabelMap, products, productCatalog, tierPriceMap,
        draftPrices, draftCosts, currentCostMap, pendingValues,
        catalogPage, setCatalogPage, catalogPageSize, setCatalogPageSize,
        catalogTotal, catalogTotalVariants, catalogTotalPages,
        catalogQuery, localCatalogQ, setLocalCatalogQ,
        loadingPriceTypes, loadingProducts,
        loadError, saving, importedProductIds, catalogViewMode, setCatalogViewMode,
        applyCatalogSearch,
        gridProducts, showingImportedView,
        catalogStartIndex, catalogEndIndex, canCatalogPrev, canCatalogNext,
        currentPriceFor, unitLabelFor, currentCostFor, setDraftCost, setDraftPrice,
        validation, gridNav, catalogLoading, canSubmit, handleSubmit,
    };
}
