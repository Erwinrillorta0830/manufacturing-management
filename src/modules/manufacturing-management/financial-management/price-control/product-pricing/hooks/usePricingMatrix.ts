"use client";

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { toast } from "sonner";

import type {
    MatrixRow,
    PricingFilters,
    ProductTierKey,
    Unit,
    ProductRow,
    VariantCell,
    PriceType,
    PriceChangeBatchLineInput,
    SavePriceChangeBatchInput,
    SaveAllResult,
    DirtyPreviewLine,
    DirtyCellMeta,
    PendingCellRequest,
} from "../types";
import * as api from "../providers/pricingApi";
import { clampMoney, moneyValuesEqual, toNumberOrNull } from "../utils/format";
import {
    buildMatrixTierKeys,
    emptyPivot,
    isListTierKey,
    pivotPrices,
    tierLabelForTierKey,
} from "../utils/pivot";
import { EMPTY_PRICE_ERROR, validatePrice } from "../utils/validators";
import { applyLoadError } from "../../shared/loadErrorState";
import { ApiHttpError, isUnauthorizedError } from "../../shared/apiHttp";

type DirtyKey = `${number}:${ProductTierKey}` | `v:${number}:${number}`;
type PendingKey = `${number}:${ProductTierKey}` | `v:${number}:${number}`;



type ProductsMeta = {
    total?: number;
    page?: number;
    page_size?: number;
    pageCount?: number;
    [key: string]: string | number | boolean | null | undefined;
} | undefined;

type MatrixProductRow = ProductRow & {
    __group_id?: number | null;
    parent_id?: number | null;
    product_category?: unknown;
    product_brand?: unknown;
};

const defaultFilters: PricingFilters = {
    q: "",
    category_ids: [],
    brand_ids: [],
    unit_ids: [],
    supplier_ids: [],
    supplier_scope: "ALL",
    active_only: true,
    missing_tier: false,
    price_view: "ALL",
    price_type_ids: [],
    show_list_price: false,
    product_type_ids: [],
    show_versions: false,
};

export function usePricingMatrix(args: {
    onSelectionChange?: (selected: Record<string, unknown>[]) => void;
    categoriesById: Map<number, string>;
    brandsById: Map<number, string>;
    unitsById: Map<number, string>;
    unitsList?: Unit[];
    priceTypes: PriceType[];
    updatedBy?: number | null;
}) {
    const { categoriesById, brandsById, unitsById, unitsList = [], priceTypes } = args;

    const matrixTierKeys = useMemo(() => buildMatrixTierKeys(priceTypes), [priceTypes]);
    const emptyPivotForTypes = useMemo(() => emptyPivot(priceTypes), [priceTypes]);

    const [filters, setFilters] = useState<PricingFilters>(defaultFilters);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [unauthorized, setUnauthorized] = useState(false);
    const [rows, setRows] = useState<MatrixRow[]>([]);
    const [meta, setMeta] = useState<ProductsMeta>(undefined);
    const [usedUnits, setUsedUnits] = useState<Unit[]>([]);
    const requestIdRef = useRef(0);

    const [dirty, setDirty] = useState<Map<DirtyKey, string>>(new Map());
    const [dirtyErrors, setDirtyErrors] = useState<Map<DirtyKey, string>>(new Map());
    const [dirtyMeta, setDirtyMeta] = useState<Map<DirtyKey, DirtyCellMeta>>(new Map());
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const dirtyErrorsRef = useRef(dirtyErrors);
    dirtyErrorsRef.current = dirtyErrors;

    const [dirtyVersion, setDirtyVersion] = useState(0);
    const bumpDirtyVersion = useCallback(() => setDirtyVersion((v) => v + 1), []);

    const [pendingMap, setPendingMap] = useState<Map<PendingKey, PendingCellRequest>>(new Map());
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    const pendingMapRef = useRef(pendingMap);
    pendingMapRef.current = pendingMap;

    const serverFiltersKey = useMemo(
        () =>
            JSON.stringify({
                q: filters.q,
                supplier_scope: filters.supplier_scope,
                active_only: filters.active_only,
                missing_tier: filters.missing_tier,
                category_ids: filters.category_ids ?? [],
                brand_ids: filters.brand_ids ?? [],
                unit_ids: filters.unit_ids ?? [],
                supplier_ids: filters.supplier_ids ?? [],
                product_type_ids: filters.product_type_ids ?? [],
                show_versions: filters.show_versions,
            }),
        [
            filters.q,
            filters.supplier_scope,
            filters.active_only,
            filters.missing_tier,
            filters.category_ids,
            filters.brand_ids,
            filters.unit_ids,
            filters.supplier_ids,
            filters.product_type_ids,
            filters.show_versions,
        ],
    );

    useEffect(() => {
        setPage(1);
    }, [serverFiltersKey]);

    const refresh = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);

        try {
            const dirtyProductIds = [...dirtyRef.current.keys()]
                .map((key) => Number(String(key).split(":")[0]))
                .filter((id) => Number.isFinite(id) && id > 0);

            const res = await api.getMatrixPage({
                q: filters.q || undefined,
                category_ids: filters.category_ids.length ? filters.category_ids.join(",") : undefined,
                brand_ids: filters.brand_ids.length ? filters.brand_ids.join(",") : undefined,
                unit_ids: filters.unit_ids.length ? filters.unit_ids.join(",") : undefined,
                supplier_ids: filters.supplier_ids.length ? filters.supplier_ids.join(",") : undefined,
                supplier_scope: filters.supplier_scope,
                active_only: filters.active_only ? "1" : "0",
                missing_tier: filters.missing_tier ? "1" : "0",
                product_type_ids: filters.product_type_ids.length ? filters.product_type_ids.join(",") : undefined,
                show_versions: filters.show_versions ? "1" : "0",
                page: String(page),
                page_size: String(pageSize),
                pending_product_ids:
                    dirtyProductIds.length > 0 ? dirtyProductIds.join(",") : undefined,
            });

            const products: MatrixProductRow[] = (res.data ?? []) as MatrixProductRow[];
            setMeta(res.meta);

            const unitIds = new Set<number>();
            for (const p of products) {
                const uom = toNumberOrNull(p.unit_of_measurement);
                if (uom !== null && Number.isFinite(uom)) {
                    unitIds.add(uom);
                }
            }

            const used = unitsList
                .filter((u) => unitIds.has(Number(u.unit_id)))
                .sort(
                    (a, b) =>
                        Number(a.order ?? 0) - Number(b.order ?? 0) ||
                        unitLabel(a).localeCompare(unitLabel(b)),
                );

            const usedFallback: Unit[] = Array.from(unitIds).map((id) => ({
                unit_id: id,
                unit_name: unitsById.get(id) ?? "",
                unit_shortcut: unitsById.get(id) ?? "",
            }));

            setUsedUnits(used.length ? used : usedFallback);

            const productIds = products
                .map((p) => toNumberOrNull(p.product_id))
                .filter((id): id is number => id !== null);

            const dirtyProductIdSet = new Set(dirtyProductIds);
            const pageProductIdSet = new Set(productIds);

            const priceMap = pivotPrices(priceTypes, res.prices ?? []);

            const pendingPriceRes = { data: res.pending_price_requests ?? [] };
            const pendingCostRes = { data: res.pending_cost_requests ?? [] };

            setPendingMap((prev) => {
                const nextPending = new Map<PendingKey, PendingCellRequest>();

                for (const [key, value] of prev) {
                    if (key.startsWith("v:")) {
                        if (dirtyRef.current.has(key as DirtyKey)) {
                            nextPending.set(key, value);
                        }
                    } else {
                        const pid = Number(String(key).split(":")[0]);
                        if (!pageProductIdSet.has(pid) && dirtyProductIdSet.has(pid)) {
                            nextPending.set(key, value);
                        }
                    }
                }

                for (const pcr of pendingPriceRes.data ?? []) {
                    const pidRaw = pcr.product_id;
                    const ptidRaw = pcr.price_type_id;
                    const pid = toNumberOrNull(typeof pidRaw === "object" ? pidRaw?.product_id : pidRaw);
                    const ptid = toNumberOrNull(typeof ptidRaw === "object" ? ptidRaw?.price_type_id : ptidRaw);
                    const vid = toNumberOrNull(pcr.version_id);
                    
                    if (pid !== null && ptid !== null) {
                        const key = vid !== null ? `v:${vid}:${ptid}` : `${pid}:${ptid}`;
                        nextPending.set(key as PendingKey, {
                            proposedValue: toNumberOrNull(pcr.proposed_price) ?? 0,
                            status: pcr.status ?? null,
                            applicationStatus: pcr.application_status ?? null,
                            effectiveAt: pcr.effective_at ?? null,
                        });
                    }
                }

                for (const ccr of pendingCostRes.data ?? []) {
                    const pidRaw = ccr.product_id;
                    const pid = toNumberOrNull(typeof pidRaw === "object" ? pidRaw?.product_id : pidRaw);
                    if (pid !== null) {
                        nextPending.set(`${pid}:LIST`, {
                            proposedValue: toNumberOrNull(ccr.proposed_cost) ?? 0,
                            status: ccr.status ?? null,
                            applicationStatus: ccr.application_status ?? null,
                            effectiveAt: ccr.effective_at ?? null,
                        });
                    }
                }

                return nextPending;
            });

            const groups = new Map<number, MatrixProductRow[]>();
            for (const p of products) {
                const groupId =
                    toNumberOrNull(p.__group_id) ??
                    toNumberOrNull(p.parent_id) ??
                    toNumberOrNull(p.product_id);

                if (groupId === null || !Number.isFinite(groupId) || groupId <= 0) continue;

                const existing = groups.get(groupId);
                if (existing) {
                    existing.push(p);
                } else {
                    groups.set(groupId, [p]);
                }
            }

            const assembled: MatrixRow[] = [];

            for (const [groupId, variants] of groups.entries()) {
                const display =
                    variants.find(
                        (v) =>
                            toNumberOrNull(v.product_id) !== null &&
                            toNumberOrNull(v.product_id) === groupId,
                    ) ??
                    variants.find((v) => v.parent_id == null) ??
                    variants[0];

                const categoryId = toNumberOrNull(display.product_category);
                const brandId = toNumberOrNull(display.product_brand);

                const cat = categoryId !== null ? categoriesById.get(categoryId) ?? null : null;
                const br = brandId !== null ? brandsById.get(brandId) ?? null : null;

                const variantsByUnitId: Record<number, VariantCell> = {};

                for (const v of variants) {
                    const uomId = toNumberOrNull(v.unit_of_measurement);
                    if (uomId === null || uomId <= 0) continue;

                    const productId = toNumberOrNull(v.product_id);
                    const piv =
                        productId !== null ? priceMap.get(productId) ?? emptyPivotForTypes : emptyPivotForTypes;

                    variantsByUnitId[uomId] = {
                        product: v,
                        tiers: { ...piv, LIST: toNumberOrNull(v.cost_per_unit) },
                    };
                }

                assembled.push({
                    group_id: groupId,
                    display,
                    variantsByUnitId,
                    category_name: cat,
                    brand_name: br,
                });
            }

            assembled.sort((a, b) => {
                const aName = typeof a.display.product_id === "object" ? (a.display.product_id?.product_name ?? "") : "";
                const bName = typeof b.display.product_id === "object" ? (b.display.product_id?.product_name ?? "") : "";
                return String(aName).localeCompare(String(bName));
            });

            if (requestId !== requestIdRef.current) return;

            setRows(assembled);
            setError(null);
            setUnauthorized(false);
        } catch (err: unknown) {
            if (requestId !== requestIdRef.current) return;

            setRows([]);
            setMeta(undefined);
            setUsedUnits([]);

            if (
                err instanceof ApiHttpError &&
                err.status === 404 &&
                err.message.includes("API route was not found")
            ) {
                toast.error(
                    "Restart the dev server (npm run dev:clean) — the pricing matrix API route is not compiled.",
                );
            }

            applyLoadError(err, "Failed to load pricing matrix", setUnauthorized, setError);
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [page, pageSize, categoriesById, brandsById, unitsById, unitsList, priceTypes, emptyPivotForTypes, filters]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const setCell = useCallback((productId: number, tier: ProductTierKey, raw: unknown) => {
        const key: DirtyKey = `${productId}:${tier}`;
        if (pendingMapRef.current.has(key)) return;

        const rawString = String(raw ?? "");
        const meta = snapshotDirtyCellMeta(rowsRef.current, productId, tier);

        if (!rawString.trim()) {
            if (meta.current_value === null) {
                setDirty((prev) => {
                    const next = new Map(prev);
                    next.delete(key);
                    return next;
                });
                setDirtyErrors((prev) => {
                    const next = new Map(prev);
                    next.delete(key);
                    return next;
                });
                setDirtyMeta((prev) => {
                    const next = new Map(prev);
                    next.delete(key);
                    return next;
                });
                bumpDirtyVersion();
                return;
            }

            setDirty((prev) => {
                const next = new Map(prev);
                next.set(key, "");
                return next;
            });
            setDirtyErrors((prev) => {
                const next = new Map(prev);
                next.set(key, EMPTY_PRICE_ERROR);
                return next;
            });
            setDirtyMeta((prev) => {
                const next = new Map(prev);
                next.set(key, meta);
                return next;
            });
            bumpDirtyVersion();
            return;
        }

        const parsedValue = toNumberOrNull(rawString.trim());
        const err = validatePrice(parsedValue, rawString.trim());
        const value = err ? parsedValue : clampMoney(parsedValue);

        if (!err && moneyValuesEqual(value, meta.current_value)) {
            setDirty((prev) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
            });
            setDirtyErrors((prev) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
            });
            setDirtyMeta((prev) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
            });
            bumpDirtyVersion();
            return;
        }

        setDirty((prev) => {
            const next = new Map(prev);
            next.set(key, rawString);
            return next;
        });

        setDirtyErrors((prev) => {
            const next = new Map(prev);
            if (err) next.set(key, err);
            else next.delete(key);
            return next;
        });

        setDirtyMeta((prev) => {
            const next = new Map(prev);
            next.set(key, meta);
            return next;
        });
        bumpDirtyVersion();
    }, [bumpDirtyVersion]);

    const setVersionCell = useCallback((versionId: number, priceTypeId: number, versionName: string, base: number | null, raw: unknown) => {
        const key: DirtyKey = `v:${versionId}:${priceTypeId}`;
        const rawString = String(raw ?? "");

        if (!rawString.trim()) {
            if (base === null) {
                setDirty((prev) => { const next = new Map(prev); next.delete(key); return next; });
                setDirtyErrors((prev) => { const next = new Map(prev); next.delete(key); return next; });
                setDirtyMeta((prev) => { const next = new Map(prev); next.delete(key); return next; });
                bumpDirtyVersion();
                return;
            }

            setDirty((prev) => { const next = new Map(prev); next.set(key, ""); return next; });
            setDirtyErrors((prev) => { const next = new Map(prev); next.set(key, EMPTY_PRICE_ERROR); return next; });
            setDirtyMeta((prev) => { const next = new Map(prev); next.set(key, { product_name: versionName, product_code: null, current_value: base }); return next; });
            bumpDirtyVersion();
            return;
        }

        const parsedValue = toNumberOrNull(rawString.trim());
        const err = validatePrice(parsedValue, rawString.trim());
        const value = err ? parsedValue : clampMoney(parsedValue);

        if (!err && moneyValuesEqual(value, base)) {
            setDirty((prev) => { const next = new Map(prev); next.delete(key); return next; });
            setDirtyErrors((prev) => { const next = new Map(prev); next.delete(key); return next; });
            setDirtyMeta((prev) => { const next = new Map(prev); next.delete(key); return next; });
            bumpDirtyVersion();
            return;
        }

        setDirty((prev) => { const next = new Map(prev); next.set(key, rawString); return next; });
        setDirtyErrors((prev) => {
            const next = new Map(prev);
            if (err) next.set(key, err);
            else next.delete(key);
            return next;
        });
        setDirtyMeta((prev) => {
            const next = new Map(prev);
            next.set(key, { product_name: versionName, product_code: null, current_value: base });
            return next;
        });
        bumpDirtyVersion();
    }, [bumpDirtyVersion]);

    const getCellValue = useCallback((productId: number, tier: ProductTierKey, base: number | null) => {
        const key: DirtyKey = `${productId}:${tier}`;
        const d = dirtyRef.current;
        if (d.has(key)) return d.get(key) ?? "";
        return base;
    }, []);

    const isDirty = useCallback((productId: number, tier: ProductTierKey) => {
        return dirtyRef.current.has(`${productId}:${tier}` as DirtyKey);
    }, []);

    const getError = useCallback((productId: number, tier: ProductTierKey) => {
        return dirtyErrorsRef.current.get(`${productId}:${tier}` as DirtyKey) ?? null;
    }, []);

    const getVersionCellValue = useCallback((versionId: number, priceTypeId: number, base: number | null) => {
        const key: DirtyKey = `v:${versionId}:${priceTypeId}`;
        const d = dirtyRef.current;
        if (d.has(key)) return d.get(key) ?? "";
        return base;
    }, []);

    const isVersionDirty = useCallback((versionId: number, priceTypeId: number) => {
        return dirtyRef.current.has(`v:${versionId}:${priceTypeId}` as DirtyKey);
    }, []);

    const getVersionError = useCallback((versionId: number, priceTypeId: number) => {
        return dirtyErrorsRef.current.get(`v:${versionId}:${priceTypeId}` as DirtyKey) ?? null;
    }, []);

    const getPendingRequest = useCallback((productId: number, tier: ProductTierKey) => {
        return pendingMap.get(`${productId}:${tier}` as PendingKey) ?? null;
    }, [pendingMap]);

    const getVersionPendingRequest = useCallback((versionId: number, priceTypeId: number) => {
        return pendingMapRef.current.get(`v:${versionId}:${priceTypeId}` as PendingKey) ?? null;
    }, []);

    const dirtyCounts = useMemo(() => {
        let price = 0;
        let cost = 0;

        for (const key of dirty.keys()) {
            if (key.startsWith("v:")) {
                price += 1;
                continue;
            }
            const tier = key.slice(key.indexOf(":") + 1);
            if (isListTierKey(tier)) cost += 1;
            else price += 1;
        }

        return { price, cost };
    }, [dirty]);

    const visibleProductIds = useMemo(() => {
        const ids = new Set<number>();
        for (const row of rows) {
            for (const variant of Object.values(row.variantsByUnitId)) {
                const productId = toNumberOrNull(variant.product.product_id);
                if (productId !== null) ids.add(productId);
            }
        }
        return ids;
    }, [rows]);

    const offPageDirtyCount = useMemo(() => {
        let count = 0;
        for (const key of dirty.keys()) {
            if (key.startsWith("v:")) continue;
            const productId = Number(key.split(":")[0]);
            if (!Number.isFinite(productId) || !visibleProductIds.has(productId)) {
                count += 1;
            }
        }
        return count;
    }, [dirty, visibleProductIds]);

    const findCurrentPrice = useCallback((productId: number, tier: ProductTierKey) => {
        for (const row of rows) {
            for (const v of Object.values(row.variantsByUnitId)) {
                const pid = toNumberOrNull(v.product.product_id);
                if (pid === productId) {
                    return toNumberOrNull(v.tiers[tier]);
                }
            }
        }
        return null;
    }, [rows]);

    const dirtyPreviewLines = useMemo((): DirtyPreviewLine[] => {
        const lines: DirtyPreviewLine[] = [];

        for (const [k, price] of dirty.entries()) {
            if (k.startsWith("v:")) {
                const parts = k.split(":");
                const ptid = Number(parts[2]);
                const meta = dirtyMeta.get(k);
                const proposed = parseDirtyProposedValue(price);
                const validation_error = dirtyErrors.get(k) ?? (price.trim() ? undefined : EMPTY_PRICE_ERROR);
                
                lines.push({
                    product_id: 0, // Not applicable for version preview line directly
                    product_name: meta?.product_name ?? `Version`,
                    product_code: null,
                    tier_label: tierLabelForTierKey(String(ptid), priceTypes),
                    kind: "price",
                    current_value: meta?.current_value ?? null,
                    proposed_value: proposed,
                    validation_error,
                });
                continue;
            }

            const productId = Number(k.slice(0, k.indexOf(":")));
            const tier = k.slice(k.indexOf(":") + 1);
            const meta = dirtyMeta.get(k);
            const product = findProductInRows(rows, productId);
            const pObj = typeof product?.product_id === "object" ? product?.product_id : null;
            const product_name = meta?.product_name ?? pObj?.product_name ?? `Product #${productId}`;
            const product_code = meta?.product_code ?? pObj?.product_code ?? null;

            if (!price.trim()) {
                const validation_error = dirtyErrors.get(k) ?? EMPTY_PRICE_ERROR;

                if (isListTierKey(tier)) {
                    const current_cost =
                        meta?.current_value ??
                        (product ? toNumberOrNull(product.cost_per_unit) : null);

                    lines.push({
                        product_id: productId,
                        product_name,
                        product_code,
                        tier_label: "List Cost",
                        kind: "cost",
                        current_value: current_cost,
                        proposed_value: null,
                        validation_error,
                    });
                    continue;
                }

                const priceTypeId = Number(tier);
                if (!Number.isFinite(priceTypeId) || priceTypeId <= 0) continue;

                lines.push({
                    product_id: productId,
                    product_name,
                    product_code,
                    tier_label: tierLabelForTierKey(tier, priceTypes),
                    kind: "price",
                    current_value: meta?.current_value ?? findCurrentPrice(productId, tier),
                    proposed_value: null,
                    validation_error,
                });
                continue;
            }

            const proposed = parseDirtyProposedValue(price);
            if (proposed === null) continue;

            if (isListTierKey(tier)) {
                const current_cost =
                    meta?.current_value ??
                    (product ? toNumberOrNull(product.cost_per_unit) : null);

                lines.push({
                    product_id: productId,
                    product_name,
                    product_code,
                    tier_label: "List Cost",
                    kind: "cost",
                    current_value: current_cost,
                    proposed_value: proposed,
                });
                continue;
            }

            const priceTypeId = Number(tier);
            if (!Number.isFinite(priceTypeId) || priceTypeId <= 0) continue;

            lines.push({
                product_id: productId,
                product_name,
                product_code,
                tier_label: tierLabelForTierKey(tier, priceTypes),
                kind: "price",
                current_value: meta?.current_value ?? findCurrentPrice(productId, tier),
                proposed_value: proposed,
            });
        }

        return lines.sort((a, b) => {
            const nameCompare = a.product_name.localeCompare(b.product_name);
            if (nameCompare !== 0) return nameCompare;
            if (a.kind !== b.kind) return a.kind === "price" ? -1 : 1;
            return a.tier_label.localeCompare(b.tier_label);
        });
    }, [dirty, dirtyErrors, dirtyMeta, findCurrentPrice, priceTypes, rows]);

    const saveAll = useCallback(async (batch?: SavePriceChangeBatchInput): Promise<SaveAllResult> => {
        if (dirtyErrors.size > 0) {
            toast.error("Please fix validation errors before submitting.");
            return { success: false, reason: "validation" };
        }

        const hasDirty = dirty.size > 0;
        if (!hasDirty) {
            toast.message("No changes to submit.");
            return { success: false, reason: "no_changes" };
        }

        const pcrItems: PriceChangeBatchLineInput[] = [];
        const costPcrItems: { product_id: number; proposed_cost: number; current_cost: number | null }[] = [];

        for (const [k, price] of dirty.entries()) {
            const proposed = parseDirtyProposedValue(price);

            if (k.startsWith("v:")) {
                const parts = k.split(":");
                const vid = Number(parts[1]);
                const ptid = Number(parts[2]);
                
                const meta = dirtyMeta.get(k);

                // Allow explicit null if they empty it (though validation usually prevents this if not originally empty)
                const finalPrice = price.trim() === "" ? null : proposed;
                
                // Find the product_id for this version
                let versionProductId = 0;
                rows_loop: for (const row of rows) {
                    if (row.display?.versions) {
                        for (const v of row.display.versions) {
                            if (v.version_id === vid) {
                                versionProductId = v.product_id;
                                break rows_loop;
                            }
                        }
                    }
                }

                if (finalPrice !== null && versionProductId > 0) {
                    pcrItems.push({
                        product_id: versionProductId,
                        version_id: vid,
                        price_type_id: ptid,
                        current_price: meta?.current_value ?? null,
                        proposed_price: finalPrice,
                    });
                }
                continue;
            }

            if (proposed === null) continue;

            const productId = Number(k.slice(0, k.indexOf(":")));
            const tier = k.slice(k.indexOf(":") + 1);

            const meta = dirtyMeta.get(k);

            if (isListTierKey(tier)) {
                let current_cost = meta?.current_value ?? null;
                if (current_cost === null) {
                    rows_loop: for (const row of rows) {
                        for (const v of Object.values(row.variantsByUnitId)) {
                            const pid = toNumberOrNull(v.product.product_id);
                            if (pid === productId) {
                                current_cost = toNumberOrNull(v.product.cost_per_unit);
                                break rows_loop;
                            }
                        }
                    }
                }

                costPcrItems.push({
                    product_id: productId,
                    proposed_cost: proposed,
                    current_cost,
                });
                continue;
            }

            const priceTypeId = Number(tier);
            if (!Number.isFinite(priceTypeId) || priceTypeId <= 0) continue;

            pcrItems.push({
                product_id: productId,
                price_type_id: priceTypeId,
                current_price: meta?.current_value ?? findCurrentPrice(productId, tier),
                proposed_price: proposed,
            });
        }

        if (pcrItems.length === 0 && costPcrItems.length === 0) {
            toast.error("No valid changes to submit.");
            return { success: false, reason: "no_valid_lines" };
        }

        if (costPcrItems.length > 0 && (!batch?.supplier_id || batch.supplier_id <= 0)) {
            toast.error("Supplier is required for List Cost requests.");
            return { success: false, reason: "missing_batch_fields" };
        }

        if (pcrItems.length > 0 && (!batch?.supplier_id || !batch.remarks.trim())) {
            toast.error("Supplier and batch remarks are required for price change batches.");
            return { success: false, reason: "missing_batch_fields" };
        }

        try {
            type CreateResult = {
                created?: number;
                skipped_existing_pending?: number;
                skipped_duplicates?: number;
            };

            const isMixedSave = pcrItems.length > 0 && costPcrItems.length > 0;

            if (isMixedSave) {
                try {
                    const mixedRes = await api.saveMixedPricingChanges({
                        batch: batch!,
                        price_lines: pcrItems,
                        cost_items: costPcrItems,
                    });

                    if ((mixedRes.created ?? 0) === 0) {
                        toast.message("No new price change requests were created.");
                        return { success: false, reason: "nothing_created" };
                    }

                    setDirty(new Map());
                    setDirtyErrors(new Map());
                    setDirtyMeta(new Map());
                    bumpDirtyVersion();
                    await refresh();

                    const skippedMessages = buildSkippedMessages(
                        (mixedRes.price.skipped_existing_pending ?? 0) +
                            (mixedRes.cost.skipped_existing_pending ?? 0),
                        (mixedRes.price.skipped_duplicates ?? 0) +
                            (mixedRes.cost.skipped_duplicates ?? 0),
                    );

                    toast.success(
                        `${mixedRes.created} price change request(s) submitted successfully.${
                            skippedMessages ? ` ${skippedMessages}` : ""
                        }`,
                    );
                    return { success: true, created: mixedRes.created };
                } catch (error: unknown) {
                    const parsed = parseMixedSaveError(error);
                    if (parsed.code === "mixed_save_preflight_failed") {
                        toast.error(formatMixedPreflightMessage(parsed));
                        return { success: false, reason: "mixed_preflight_failed" };
                    }
                    if (parsed.code === "mixed_save_rolled_back") {
                        toast.error(
                            "Save failed and was rolled back. No price batch or list cost requests were created.",
                        );
                        return { success: false, reason: "mixed_save_rolled_back" };
                    }
                    throw error;
                }
            }

            let priceCreated = 0;
            let costCreated = 0;
            let totalSkippedDuplicates = 0;
            let totalSkippedExistingPending = 0;

            if (pcrItems.length > 0) {
                const priceRes = (await api.createPriceChangeBatch(batch!, pcrItems)) as CreateResult;
                priceCreated = priceRes.created ?? 0;
                totalSkippedDuplicates += priceRes.skipped_duplicates ?? 0;
                totalSkippedExistingPending += priceRes.skipped_existing_pending ?? 0;

                if (priceCreated === 0) {
                    if (totalSkippedExistingPending > 0) {
                        toast.message(
                            "No new price requests were created because these items already have pending requests.",
                        );
                    } else if (totalSkippedDuplicates > 0) {
                        toast.message("No new changes - all entries were duplicates.");
                    } else {
                        toast.message("No new price requests were created.");
                    }
                    return { success: false, reason: "nothing_created" };
                }
            }

            if (costPcrItems.length > 0) {
                const costRes = (await api.createCostChangeRequests({
                    items: costPcrItems,
                    supplier_id: batch!.supplier_id,
                    reference_no: batch!.reference_no,
                    remarks: batch!.remarks,
                })) as CreateResult;
                costCreated = costRes.created ?? 0;
                totalSkippedDuplicates += costRes.skipped_duplicates ?? 0;
                totalSkippedExistingPending += costRes.skipped_existing_pending ?? 0;
            }

            const created = priceCreated + costCreated;

            if (created > 0) {
                setDirty(new Map());
                setDirtyErrors(new Map());
                setDirtyMeta(new Map());
                bumpDirtyVersion();
                await refresh();

                const skippedMessages = buildSkippedMessages(
                    totalSkippedExistingPending,
                    totalSkippedDuplicates,
                );

                toast.success(
                    `${created} price change request(s) submitted successfully.${
                        skippedMessages ? ` ${skippedMessages}` : ""
                    }`,
                );
                return { success: true, created };
            }

            if (totalSkippedExistingPending > 0) {
                toast.message("No new price requests were created because these items already have pending requests.");
                return { success: false, reason: "nothing_created" };
            }

            if (totalSkippedDuplicates > 0) {
                toast.message("No new changes - all entries were duplicates.");
                return { success: false, reason: "nothing_created" };
            }

            toast.message("No new price requests were created.");
            return { success: false, reason: "nothing_created" };
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) {
                setUnauthorized(true);
                return { success: false, reason: "api_error" };
            }
            toast.error(formatSaveErrorMessage(error));
            return { success: false, reason: "api_error" };
        }
    }, [dirty, dirtyErrors, dirtyMeta, refresh, rows, findCurrentPrice, bumpDirtyVersion]);

    const discardAll = useCallback(() => {
        setDirty(new Map());
        setDirtyErrors(new Map());
        setDirtyMeta(new Map());
        bumpDirtyVersion();
    }, [bumpDirtyVersion]);

    const resetFilters = useCallback(() => {
        setFilters(defaultFilters);
        setPage(1);
    }, []);

    const matrix = useMemo(
        () => ({
            TIERS: matrixTierKeys,
            loading,
            error,
            unauthorized,
            rows,
            meta,
            usedUnits,
            priceTypes,
            dirtyVersion,

            filters,
            setFilters,
            resetFilters,

            page,
            setPage,
            pageSize,
            setPageSize,

            setCell,
            getCellValue,
            getPendingRequest,
            isDirty,
            getError,
            
            setVersionCell,
            getVersionCellValue,
            getVersionPendingRequest,
            isVersionDirty,
            getVersionError,

            refresh,
        }),
        [
            matrixTierKeys,
            loading,
            error,
            unauthorized,
            rows,
            meta,
            usedUnits,
            priceTypes,
            dirtyVersion,
            filters,
            setFilters,
            resetFilters,
            page,
            setPage,
            pageSize,
            setPageSize,
            setCell,
            getCellValue,
            getPendingRequest,
            isDirty,
            getError,
            setVersionCell,
            getVersionCellValue,
            getVersionPendingRequest,
            isVersionDirty,
            getVersionError,
            refresh,
        ],
    );

    const dirtySummary = useMemo(
        () => ({
            dirtyVersion,
            dirtyCount: dirtyCounts.price + dirtyCounts.cost,
            priceDirtyCount: dirtyCounts.price,
            costDirtyCount: dirtyCounts.cost,
            offPageDirtyCount,
            dirtyPreviewLines,
            saveAll,
            discardAll,
        }),
        [
            dirtyVersion,
            dirtyCounts,
            offPageDirtyCount,
            dirtyPreviewLines,
            saveAll,
            discardAll,
        ],
    );

    return { matrix, dirtySummary };
}

function parseDirtyProposedValue(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return toNumberOrNull(trimmed);
}

function formatSaveErrorMessage(error: unknown): string {
    const displayMessage = "Failed to save changes";
    if (!(error instanceof Error)) return displayMessage;

    try {
        const parsed = JSON.parse(error.message) as Record<string, unknown>;
        const body = parsed.directus_body ?? parsed.body ?? parsed.details ?? parsed.error;
        if (typeof body === "string" && body.trim()) {
            try {
                const inner = JSON.parse(body) as Record<string, unknown>;
                const innerErrors = inner.errors;
                if (Array.isArray(innerErrors) && innerErrors.length > 0) {
                    const first = innerErrors[0] as Record<string, unknown>;
                    return String(first.message ?? body);
                }
                return body;
            } catch {
                return body;
            }
        }
        return error.message;
    } catch {
        return error.message;
    }
}

function buildSkippedMessages(skippedPending: number, skippedDuplicates: number): string {
    const parts: string[] = [];
    if (skippedPending > 0) parts.push(`${skippedPending} already pending`);
    if (skippedDuplicates > 0) parts.push(`${skippedDuplicates} duplicate(s) skipped`);
    return parts.length ? `${parts.join(", ")}.` : "";
}

type MixedSaveErrorPayload = {
    code?: string;
    price?: { would_create?: number; skipped_existing_pending?: number };
    cost?: { would_create?: number; skipped_existing_pending?: number };
};

function parseMixedSaveError(error: unknown): MixedSaveErrorPayload {
    if (!(error instanceof Error)) return {};

    try {
        const parsed = JSON.parse(error.message) as Record<string, unknown>;
        return {
            code: typeof parsed.code === "string" ? parsed.code : undefined,
            price: parsed.price as MixedSaveErrorPayload["price"],
            cost: parsed.cost as MixedSaveErrorPayload["cost"],
        };
    } catch {
        return {};
    }
}

function formatMixedPreflightMessage(payload: MixedSaveErrorPayload): string {
    const reasons: string[] = [];

    if ((payload.price?.would_create ?? 1) === 0) {
        if ((payload.price?.skipped_existing_pending ?? 0) > 0) {
            reasons.push("price changes are already pending");
        } else {
            reasons.push("no valid price lines to create");
        }
    }

    if ((payload.cost?.would_create ?? 1) === 0) {
        if ((payload.cost?.skipped_existing_pending ?? 0) > 0) {
            reasons.push("list cost changes are already pending");
        } else {
            reasons.push("no valid list cost lines to create");
        }
    }

    if (reasons.length === 0) {
        return "Cannot save mixed changes: both price and list cost must be valid to submit together.";
    }

    return `Cannot save mixed changes: ${reasons.join(" and ")}. No requests were created.`;
}

function snapshotDirtyCellMeta(
    rows: MatrixRow[],
    productId: number,
    tier: ProductTierKey,
): DirtyCellMeta {
    const product = findProductInRows(rows, productId);
    let current_value: number | null = null;

    if (isListTierKey(tier)) {
        current_value = product ? toNumberOrNull(product.cost_per_unit) : null;
    } else {
        for (const row of rows) {
            for (const variant of Object.values(row.variantsByUnitId)) {
                const pid = toNumberOrNull(variant.product.product_id);
                if (pid === productId) {
                    current_value = toNumberOrNull(variant.tiers[tier]);
                    break;
                }
            }
            if (current_value !== null) break;
        }
    }

    const pObj = typeof product?.product_id === "object" ? product?.product_id : null;
    return {
        product_name: pObj?.product_name ?? `Product #${productId}`,
        product_code: pObj?.product_code ?? null,
        current_value,
    };
}

function findProductInRows(rows: MatrixRow[], productId: number): ProductRow | null {
    for (const row of rows) {
        for (const variant of Object.values(row.variantsByUnitId)) {
            if (toNumberOrNull(variant.product.product_id) === productId) {
                return variant.product;
            }
        }
    }
    return null;
}

function unitLabel(u: Unit) {
    return (u.unit_shortcut ?? u.unit_name ?? "").toString();
}
