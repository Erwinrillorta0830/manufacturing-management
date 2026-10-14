import React, { useMemo, useState } from "react";
import { Supplier, RawMaterial, LinkedProduct, SupplierCatalogUpdatePayload } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { Link, Search, Trash2, X, AlertCircle, Loader2, CheckCircle2, Globe, Save } from "lucide-react";
import { PROCUREMENT_MONEY_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { normalizeProductRelationId } from "../product-relation";
import {
    filterSupplierCatalogProducts,
    getSupplierProductTypeLabel,
    getSupplierCatalogUomOptions,
    isSupplierEligibleProductType,
    SUPPLIER_ELIGIBLE_PRODUCT_TYPES
} from "../supplier-product-eligibility";

export interface SupplierCatalogMatrixModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
    catalogProducts: RawMaterial[];
    catalogLoadError?: string | null;
    linkedProducts: LinkedProduct[];
    loadingLinkedProducts: boolean;
    onSaveUpdates: (payload: SupplierCatalogUpdatePayload) => Promise<void>;
    savingUpdates: boolean;
}

type CatalogMaterial = {
    product_id: number;
    product_code?: string;
    product_name: string;
    description?: string | null;
    product_type?: number | string | { id?: number | string; type_id?: number | string; product_type_id?: number | string } | null;
    product_type_name?: string | null;
    parent_id?: number | null;
    unit_of_measurement?: {
        unit_id: number;
        unit_shortcut?: string;
        unit_name?: string;
    };
    cost_per_unit?: number;
};

function getLinkedProductId(link: LinkedProduct): number {
    return normalizeProductRelationId(link.product_id) ?? NaN;
}

function isEligibleLinkedProduct(link: LinkedProduct): boolean {
    return typeof link.product_id === "object"
        && isSupplierEligibleProductType(link.product_id.product_type);
}

function toCatalogMaterial(link: LinkedProduct): CatalogMaterial | null {
    const product = link.product_id;
    if (!product || typeof product !== "object") return null;

    const productId = normalizeProductRelationId(product);
    if (productId === null) return null;

    const productRecord = product as typeof product & { cost_per_unit?: number | string };
    const parentId = product.parent_id === null
        ? null
        : normalizeProductRelationId(product.parent_id) ?? undefined;

    return {
        product_id: productId,
        product_code: product.product_code,
        product_name: product.product_name || `Product ${productId}`,
        description: product.description,
        product_type: product.product_type,
        product_type_name: product.product_type_name,
        parent_id: parentId,
        unit_of_measurement: product.unit_of_measurement,
        cost_per_unit: Number(productRecord.cost_per_unit) || 0
    };
}

function ProductTypeBadge({ productType, productTypeName }: { productType: unknown; productTypeName?: string | null }) {
    const label = getSupplierProductTypeLabel(productType, productTypeName);
    const className = label === "Finished Goods"
        ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"
        : label === "Raw Materials"
            ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : label === "Packaging Items"
                ? "border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                : "border-border bg-muted text-muted-foreground";

    return (
        <span
            className={`inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${className}`}
            aria-label={label}
        >
            {label}
        </span>
    );
}

function toStagedLinkedProduct(supplierId: number, material: CatalogMaterial): LinkedProduct {
    return {
        id: 0,
        supplier_id: supplierId,
        product_id: {
            product_id: material.product_id,
            product_code: material.product_code,
            product_name: material.product_name,
            description: material.description,
            product_type: material.product_type,
            product_type_name: material.product_type_name,
            parent_id: material.parent_id,
            unit_of_measurement: material.unit_of_measurement
        }
    };
}

interface CatalogDraft {
    supplierId: number;
    initialLinkedProducts: LinkedProduct[];
    stagedLinkedProducts: LinkedProduct[];
    pendingAddedProductIds: number[];
    pendingRemovedLinkIds: number[];
}

function createCatalogDraft(supplierId: number, linkedProducts: LinkedProduct[]): CatalogDraft {
    const eligibleLinks = linkedProducts.filter(isEligibleLinkedProduct);
    return {
        supplierId,
        initialLinkedProducts: eligibleLinks,
        stagedLinkedProducts: eligibleLinks,
        pendingAddedProductIds: [],
        pendingRemovedLinkIds: []
    };
}

function getInitialLinkByProductId(linkedProducts: LinkedProduct[]): Map<number, LinkedProduct> {
    const map = new Map<number, LinkedProduct>();
    linkedProducts.forEach(link => {
        const productId = normalizeProductRelationId(link.product_id);
        if (productId !== null) map.set(productId, link);
    });
    return map;
}

const SUPPLIER_PRODUCT_TYPE_OPTIONS = SUPPLIER_ELIGIBLE_PRODUCT_TYPES.map(productTypeId => ({
    value: String(productTypeId),
    label: getSupplierProductTypeLabel(productTypeId)
}));

export default function SupplierCatalogMatrixModal({
    isOpen,
    onClose,
    supplier,
    catalogProducts = [],
    catalogLoadError = null,
    linkedProducts = [],
    loadingLinkedProducts,
    onSaveUpdates,
    savingUpdates
}: SupplierCatalogMatrixModalProps) {
    const [catalogDraft, setCatalogDraft] = useState<CatalogDraft | null>(null);
    const [linkProductSearch, setLinkProductSearch] = useState("");
    const [productTypeFilter, setProductTypeFilter] = useState("all");
    const [uomFilter, setUomFilter] = useState("all");
    const [linkedFilterSearch, setLinkedFilterSearch] = useState("");
    const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

    const activeDraft = catalogDraft?.supplierId === supplier?.id ? catalogDraft : null;
    const stagedLinkedProducts = activeDraft?.stagedLinkedProducts ?? linkedProducts.filter(isEligibleLinkedProduct);
    const pendingAddedProductIds = activeDraft?.pendingAddedProductIds ?? [];
    const pendingRemovedLinkIds = activeDraft?.pendingRemovedLinkIds ?? [];

    const stagedProductIds = useMemo(
        () => new Set(
            stagedLinkedProducts
                .map(link => normalizeProductRelationId(link.product_id))
                .filter((productId): productId is number => productId !== null)
        ),
        [stagedLinkedProducts]
    );

    const catalogCandidates = useMemo(() => {
        const candidates = new Map<number, CatalogMaterial>();
        catalogProducts.filter(material => isSupplierEligibleProductType(material.product_type)).forEach(material => {
            const productId = normalizeProductRelationId(material.product_id);
            if (productId !== null && !candidates.has(productId)) {
                candidates.set(productId, material);
            }
        });

        const initialLinkedProducts = activeDraft?.initialLinkedProducts ?? linkedProducts.filter(isEligibleLinkedProduct);
        initialLinkedProducts.forEach(link => {
            const material = toCatalogMaterial(link);
            if (material && !candidates.has(material.product_id)) {
                candidates.set(material.product_id, material);
            }
        });

        return Array.from(candidates.values());
    }, [activeDraft?.initialLinkedProducts, linkedProducts, catalogProducts]);

    const availableProducts = useMemo(() => filterSupplierCatalogProducts(
        catalogCandidates.filter(material => !stagedProductIds.has(Number(material.product_id))),
        {
            searchTerm: linkProductSearch,
            productTypeId: productTypeFilter,
            unitId: uomFilter
        }
    ), [catalogCandidates, stagedProductIds, linkProductSearch, productTypeFilter, uomFilter]);

    const uomOptions = useMemo(() => getSupplierCatalogUomOptions(catalogCandidates), [catalogCandidates]);

    const filteredLinkedProducts = useMemo(() => stagedLinkedProducts.filter(link => {
        if (!isEligibleLinkedProduct(link)) return false;
        if (!linkedFilterSearch.trim()) return true;
        const query = linkedFilterSearch.toLowerCase().trim();
        const product = link.product_id;
        const code = typeof product === "object" ? product?.product_code || "" : "";
        const name = typeof product === "object" ? product?.product_name || "" : "";
        return code.toLowerCase().includes(query) || name.toLowerCase().includes(query);
    }), [stagedLinkedProducts, linkedFilterSearch]);

    const hasChanges = pendingAddedProductIds.length > 0 || pendingRemovedLinkIds.length > 0;

    const toggleProductSelection = (productId: number) => {
        setSelectedProductIds(previous => previous.includes(productId)
            ? previous.filter(id => id !== productId)
            : [...previous, productId]);
    };

    const stageProducts = (materials: CatalogMaterial[]) => {
        if (!supplier || materials.length === 0) return;

        setCatalogDraft(previous => {
            const current = previous?.supplierId === supplier.id
                ? previous
                : createCatalogDraft(supplier.id, linkedProducts);
            const currentProductIds = new Set(
                current.stagedLinkedProducts
                    .map(link => normalizeProductRelationId(link.product_id))
                    .filter((productId): productId is number => productId !== null)
            );
            const newMaterials = materials.filter(material => !currentProductIds.has(Number(material.product_id)));
            if (newMaterials.length === 0) return current;

            const newProductIds = newMaterials.map(material => Number(material.product_id));
            const initialLinks = getInitialLinkByProductId(current.initialLinkedProducts);
            const restoredLinkIds = newMaterials
                .map(material => initialLinks.get(Number(material.product_id))?.id)
                .filter((linkId): linkId is number => Number.isInteger(linkId));

            return {
                ...current,
                stagedLinkedProducts: [
                    ...current.stagedLinkedProducts,
                    ...newMaterials.map(material => toStagedLinkedProduct(supplier.id, material))
                ],
                pendingAddedProductIds: Array.from(new Set([
                    ...current.pendingAddedProductIds,
                    ...newProductIds.filter(productId => !initialLinks.has(productId))
                ])),
                pendingRemovedLinkIds: restoredLinkIds.length > 0
                    ? current.pendingRemovedLinkIds.filter(linkId => !restoredLinkIds.includes(linkId))
                    : current.pendingRemovedLinkIds
            };
        });
    };

    const handleAddSelected = () => {
        const selectedMaterials = catalogCandidates.filter(material =>
            selectedProductIds.includes(Number(material.product_id))
                && !stagedProductIds.has(Number(material.product_id))
        );
        stageProducts(selectedMaterials);
        setSelectedProductIds([]);
    };

    const handleAddAll = () => {
        stageProducts(availableProducts);
        setSelectedProductIds([]);
    };

    const stageUnlink = (link: LinkedProduct) => {
        const productId = getLinkedProductId(link);
        if (!Number.isInteger(productId)) return;

        if (!supplier) return;

        setCatalogDraft(previous => {
            const current = previous?.supplierId === supplier.id
                ? previous
                : createCatalogDraft(supplier.id, linkedProducts);
            const initialLink = getInitialLinkByProductId(current.initialLinkedProducts).get(productId);

            return {
                ...current,
                stagedLinkedProducts: current.stagedLinkedProducts.filter(item => getLinkedProductId(item) !== productId),
                pendingRemovedLinkIds: initialLink
                    ? Array.from(new Set([...current.pendingRemovedLinkIds, initialLink.id]))
                    : current.pendingRemovedLinkIds,
                pendingAddedProductIds: initialLink
                    ? current.pendingAddedProductIds
                    : current.pendingAddedProductIds.filter(id => id !== productId)
            };
        });
    };

    const handleClose = () => {
        setCatalogDraft(null);
        setLinkProductSearch("");
        setProductTypeFilter("all");
        setUomFilter("all");
        setLinkedFilterSearch("");
        setSelectedProductIds([]);
        onClose();
    };

    const handleSaveUpdates = async () => {
        if (!supplier || !hasChanges || savingUpdates) return;

        const payload: SupplierCatalogUpdatePayload = {
            supplierId: supplier.id,
            addProductIds: pendingAddedProductIds,
            removeLinkIds: pendingRemovedLinkIds
        };

        try {
            await onSaveUpdates(payload);
            handleClose();
        } catch (error) {
            console.error(error);
        }
    };

    if (!supplier) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 15 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 15 }}
                        transition={{ type: "spring", duration: 0.3 }}
                        className="bg-card text-foreground w-full max-w-5xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto border rounded-2xl shadow-xl p-3 sm:p-4 lg:p-6 space-y-4 lg:space-y-5"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Link className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-foreground">Supplier Product Catalog Matrix</h3>
                                    <p className="text-[11px] text-muted-foreground">{supplier.supplier_name}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg hover:bg-muted"
                                aria-label="Close catalog matrix"
                            >
                                <X className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        <div className="bg-muted/20 p-4 rounded-2xl border border-primary/20 space-y-3 shadow-xs">
                            <div className="flex flex-col gap-2 border-b pb-2.5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Globe className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs font-extrabold text-foreground">Select Catalog Items to Associate</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedProductIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleAddSelected}
                                            disabled={savingUpdates}
                                            className="text-[10px] font-bold text-primary hover:text-primary/80 border border-primary/30 px-2.5 py-1 rounded-xl bg-primary/5 hover:bg-primary/10 disabled:opacity-50 transition-all cursor-pointer"
                                        >
                                            Add Selected Products
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleAddAll}
                                        disabled={availableProducts.length === 0 || savingUpdates}
                                        className="text-[10px] font-bold text-muted-foreground hover:text-foreground border px-2.5 py-1 rounded-xl bg-background hover:bg-muted/50 disabled:opacity-50 transition-all cursor-pointer"
                                    >
                                        Add All Unlinked
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
                                <div className="relative">
                                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search unlinked products by code or name..."
                                        value={linkProductSearch}
                                        onChange={event => setLinkProductSearch(event.target.value)}
                                        className="w-full rounded-xl border bg-background pl-9 pr-8 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                    />
                                    {linkProductSearch && (
                                        <button
                                            onClick={() => setLinkProductSearch("")}
                                            className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                                            aria-label="Clear unlinked catalog search"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                <label className="min-w-0 space-y-1">
                                    <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Product Type</span>
                                    <SearchableSelect
                                        value={productTypeFilter}
                                        onValueChange={setProductTypeFilter}
                                        options={[{ value: "all", label: "All Product Types" }, ...SUPPLIER_PRODUCT_TYPE_OPTIONS]}
                                        placeholder="All Product Types"
                                        className="h-8 rounded-xl bg-background text-xs font-medium"
                                    />
                                </label>
                                <label className="min-w-0 space-y-1">
                                    <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">UOM</span>
                                    <SearchableSelect
                                        value={uomFilter}
                                        onValueChange={setUomFilter}
                                        options={[{ value: "all", label: "All UOMs" }, ...uomOptions]}
                                        placeholder="All UOMs"
                                        className="h-8 rounded-xl bg-background text-xs font-medium"
                                    />
                                </label>
                            </div>

                            {loadingLinkedProducts ? (
                                <div className="py-6 text-center text-xs text-muted-foreground">
                                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading catalog...
                                </div>
                            ) : catalogLoadError ? (
                                <div className="py-6 text-center text-xs text-red-600">{catalogLoadError}</div>
                            ) : availableProducts.length === 0 ? (
                                <div className="flex items-center justify-center gap-1 py-6 text-center text-xs italic text-muted-foreground">
                                    <AlertCircle className="h-4 w-4 text-muted-foreground/40" />
                                    <span>No unlinked products match your search and filters</span>
                                </div>
                            ) : (
                                <>
                                    <div className="max-h-[220px] space-y-2 overflow-y-auto lg:hidden">
                                        {availableProducts.map(material => {
                                            const uomName = material.unit_of_measurement?.unit_shortcut || material.unit_of_measurement?.unit_name;
                                            const isSelected = selectedProductIds.includes(material.product_id);
                                            return (
                                                <label
                                                    key={material.product_id}
                                                    className={`flex min-w-0 cursor-pointer gap-3 rounded-xl border p-3 text-xs transition-colors hover:bg-muted/40 ${isSelected ? "border-primary/40 bg-primary/5" : "bg-background"}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleProductSelection(material.product_id)}
                                                        aria-label={`Select ${material.product_name}`}
                                                        className="mt-0.5 h-4 w-4 shrink-0 rounded text-primary focus:ring-0"
                                                    />
                                                    <div className="min-w-0 flex-1 space-y-2">
                                                        <div className="min-w-0">
                                                            <span className="block text-muted-foreground">Catalog Item</span>
                                                            <span className="block break-words font-bold text-foreground">{material.product_name}</span>
                                                        </div>
                                                        <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                                                            <div className="min-w-0">
                                                                <span className="block text-muted-foreground">Product Code</span>
                                                                <span className="block break-all font-mono font-semibold text-foreground">{material.product_code || "—"}</span>
                                                            </div>
                                                            <div>
                                                                <span className="block text-muted-foreground">Product Type</span>
                                                                <ProductTypeBadge productType={material.product_type} productTypeName={material.product_type_name} />
                                                            </div>
                                                            <div>
                                                                <span className="block text-muted-foreground">UOM</span>
                                                                <span className="font-semibold text-primary">{uomName || "—"}</span>
                                                            </div>
                                                            <div>
                                                                <span className="block text-muted-foreground">Unit Cost</span>
                                                                <span className="font-mono text-foreground">
                                                                    {(material.cost_per_unit ?? 0) > 0
                                                                        ? `₱${Number(material.cost_per_unit).toLocaleString("en-US", { minimumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE, maximumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE })}`
                                                                        : "—"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>

                                    <div className="hidden max-h-[220px] overflow-y-auto overflow-x-hidden rounded-xl border bg-background lg:block">
                                        <table className="w-full table-fixed text-left">
                                            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                                                <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                                                    <th scope="col" className="w-12 px-2 py-2 font-bold">Add</th>
                                                    <th scope="col" className="w-28 px-2 py-2 font-bold">Product Code</th>
                                                    <th scope="col" className="px-2 py-2 font-bold">Catalog Item</th>
                                                    <th scope="col" className="w-32 px-2 py-2 font-bold">Product Type</th>
                                                    <th scope="col" className="w-16 px-2 py-2 font-bold">UOM</th>
                                                    <th scope="col" className="w-24 px-2 py-2 text-right font-bold">Unit Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/70">
                                                {availableProducts.map(material => {
                                                    const uomName = material.unit_of_measurement?.unit_shortcut || material.unit_of_measurement?.unit_name;
                                                    return (
                                                        <tr
                                                            key={material.product_id}
                                                            onClick={() => toggleProductSelection(material.product_id)}
                                                            className={`cursor-pointer align-middle text-xs transition-colors hover:bg-muted/40 ${selectedProductIds.includes(material.product_id) ? "bg-primary/5" : ""}`}
                                                        >
                                                            <td className="px-2 py-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedProductIds.includes(material.product_id)}
                                                                    onChange={() => toggleProductSelection(material.product_id)}
                                                                    onClick={event => event.stopPropagation()}
                                                                    aria-label={`Select ${material.product_name}`}
                                                                    className="h-4 w-4 rounded text-primary focus:ring-0"
                                                                />
                                                            </td>
                                                            <td className="break-all px-2 py-2 font-mono text-[10px] font-bold text-foreground">
                                                                {material.product_code || "—"}
                                                            </td>
                                                            <td className="whitespace-normal break-words px-2 py-2 font-bold text-foreground">
                                                                {material.product_name}
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <ProductTypeBadge productType={material.product_type} productTypeName={material.product_type_name} />
                                                            </td>
                                                            <td className="break-words px-2 py-2 text-[10px] font-semibold text-primary">{uomName || "—"}</td>
                                                            <td className="break-words px-2 py-2 text-right font-mono text-[10px] text-foreground">
                                                                {(material.cost_per_unit ?? 0) > 0
                                                                    ? `₱${Number(material.cost_per_unit).toLocaleString("en-US", { minimumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE, maximumFractionDigits: PROCUREMENT_MONEY_DECIMAL_SCALE })}`
                                                                    : "—"}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    Staged Linked Products ({stagedLinkedProducts.length})
                                </h4>
                                {stagedLinkedProducts.length > 3 && (
                                <div className="relative w-full sm:w-48">
                                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Filter linked..."
                                            value={linkedFilterSearch}
                                            onChange={event => setLinkedFilterSearch(event.target.value)}
                                            className="w-full rounded-lg border bg-background pl-8 pr-6 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                )}
                            </div>

                            {loadingLinkedProducts ? (
                                <div className="text-center text-xs text-muted-foreground py-6 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    <span>Loading associated products...</span>
                                </div>
                            ) : stagedLinkedProducts.length === 0 ? (
                                <div className="text-center p-6 border border-dashed rounded-xl bg-muted/5 text-xs text-muted-foreground">
                                    No products currently staged for this vendor.
                                </div>
                            ) : filteredLinkedProducts.length === 0 ? (
                                <div className="text-center p-6 border border-dashed rounded-xl bg-muted/5 text-xs text-muted-foreground">
                                    No staged linked products match your search.
                                </div>
                            ) : (
                                <>
                                    <div className="max-h-[220px] space-y-2 overflow-y-auto lg:hidden">
                                        {filteredLinkedProducts.map(link => {
                                            const product = link.product_id;
                                            const uom = product?.unit_of_measurement?.unit_shortcut || product?.unit_of_measurement?.unit_name;
                                            const productName = product?.product_name || "Unknown Product";
                                            return (
                                                <div key={getLinkedProductId(link)} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border bg-background p-3">
                                                    <div className="min-w-0 flex-1 space-y-2">
                                                        <div className="min-w-0">
                                                            <span className="block text-[10px] text-muted-foreground">Catalog Item</span>
                                                            <span className="block break-words text-xs font-bold text-foreground">{productName}</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                                                            <div className="min-w-0">
                                                                <span className="block text-muted-foreground">Product Code</span>
                                                                <span className="block break-all font-mono font-semibold text-primary">{product?.product_code || "—"}</span>
                                                            </div>
                                                            <div>
                                                                <span className="block text-muted-foreground">Product Type</span>
                                                                <ProductTypeBadge productType={product?.product_type} productTypeName={product?.product_type_name} />
                                                            </div>
                                                            <div>
                                                                <span className="block text-muted-foreground">UOM</span>
                                                                <span className="font-semibold text-muted-foreground">{uom || "—"}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => stageUnlink(link)}
                                                        disabled={savingUpdates}
                                                        className="shrink-0 rounded-lg p-2 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                                                        title="Remove from staged catalog"
                                                        aria-label={`Remove ${productName} from staged catalog`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="hidden max-h-[220px] overflow-y-auto overflow-x-hidden rounded-xl border bg-background lg:block">
                                    <table className="w-full table-fixed text-left">
                                        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                                            <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                                                <th scope="col" className="w-28 px-2 py-2 font-bold">Product Code</th>
                                                <th scope="col" className="px-2 py-2 font-bold">Catalog Item</th>
                                                <th scope="col" className="w-32 px-2 py-2 font-bold">Product Type</th>
                                                <th scope="col" className="w-16 px-2 py-2 font-bold">UOM</th>
                                                <th scope="col" className="w-16 px-2 py-2 text-right font-bold">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/70">
                                            {filteredLinkedProducts.map(link => {
                                                    const product = link.product_id;
                                                    const uom = product?.unit_of_measurement?.unit_shortcut || product?.unit_of_measurement?.unit_name;
                                                    const productName = product?.product_name || "Unknown Product";
                                                    return (
                                                        <tr key={getLinkedProductId(link)} className="align-middle text-xs transition-colors hover:bg-muted/40">
                                                            <td className="break-all px-2 py-2 font-mono text-[10px] font-bold text-primary">
                                                                {product?.product_code || "—"}
                                                            </td>
                                                            <td className="whitespace-normal break-words px-2 py-2 font-bold text-foreground">{productName}</td>
                                                            <td className="px-2 py-2">
                                                                <ProductTypeBadge productType={product?.product_type} productTypeName={product?.product_type_name} />
                                                            </td>
                                                            <td className="break-words px-2 py-2 text-[10px] font-semibold text-muted-foreground">{uom || "—"}</td>
                                                            <td className="px-2 py-2 text-right">
                                                                <button
                                                                    onClick={() => stageUnlink(link)}
                                                                    disabled={savingUpdates}
                                                                    className="text-muted-foreground hover:text-red-600 p-1.5 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50"
                                                                    title="Remove from staged catalog"
                                                                    aria-label={`Remove ${productName} from staged catalog`}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">
                                {hasChanges
                                    ? `${pendingAddedProductIds.length} addition(s), ${pendingRemovedLinkIds.length} removal(s) pending`
                                    : "No unsaved catalog changes"}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={savingUpdates}
                                    className="px-4 py-2 rounded-xl text-xs font-bold border bg-background hover:bg-muted disabled:opacity-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleSaveUpdates()}
                                    disabled={!hasChanges || savingUpdates}
                                    className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary/95 disabled:opacity-50 transition-all shadow-xs inline-flex items-center gap-1.5"
                                >
                                    {savingUpdates ? (
                                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
                                    ) : (
                                        <><Save className="h-3.5 w-3.5" /> Save Updates</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
