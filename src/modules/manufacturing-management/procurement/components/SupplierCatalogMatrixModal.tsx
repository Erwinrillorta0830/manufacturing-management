import React, { useEffect, useMemo, useState } from "react";
import { Supplier, RawMaterial, LinkedProduct, SupplierCatalogUpdatePayload } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { Link, Search, Trash2, X, AlertCircle, Loader2, CheckCircle2, Globe, Save } from "lucide-react";
import { normalizeProductRelationId } from "../product-relation";

export interface SupplierCatalogMatrixModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
    rawMaterials: RawMaterial[];
    linkedProducts: LinkedProduct[];
    loadingLinkedProducts: boolean;
    onSaveUpdates: (payload: SupplierCatalogUpdatePayload) => Promise<void>;
    savingUpdates: boolean;
}

function getLinkedProductId(link: LinkedProduct): number {
    const relation = link.product_id as unknown;
    if (typeof relation === "number" || typeof relation === "string") return Number(relation);
    if (relation && typeof relation === "object") {
        const product = relation as { product_id?: number | string; id?: number | string };
        return Number(product.product_id ?? product.id);
    }
    return NaN;
}

function getHierarchyStatus(parentId: unknown): {
    label: "Parent Product" | "Packaging Variant" | "Hierarchy Unavailable";
    className: string;
} {
    if (parentId === null) {
        return {
            label: "Parent Product",
            className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        };
    }

    if (parentId !== undefined
        && !(typeof parentId === "string" && parentId.trim() === "")
        && normalizeProductRelationId(parentId) !== null) {
        return {
            label: "Packaging Variant",
            className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        };
    }

    return {
        label: "Hierarchy Unavailable",
        className: "border-border bg-muted text-muted-foreground"
    };
}

function HierarchyBadge({ parentId }: { parentId: unknown }) {
    const hierarchy = getHierarchyStatus(parentId);

    return (
        <span
            className={`inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${hierarchy.className}`}
            aria-label={hierarchy.label}
        >
            {hierarchy.label}
        </span>
    );
}

function toStagedLinkedProduct(supplierId: number, material: RawMaterial): LinkedProduct {
    return {
        id: 0,
        supplier_id: supplierId,
        product_id: {
            product_id: material.product_id,
            product_code: material.product_code,
            product_name: material.product_name,
            description: material.description,
            parent_id: material.parent_id,
            unit_of_measurement: material.unit_of_measurement
        }
    };
}

export default function SupplierCatalogMatrixModal({
    isOpen,
    onClose,
    supplier,
    rawMaterials = [],
    linkedProducts = [],
    loadingLinkedProducts,
    onSaveUpdates,
    savingUpdates
}: SupplierCatalogMatrixModalProps) {
    const [initialLinkedProducts, setInitialLinkedProducts] = useState<LinkedProduct[]>([]);
    const [stagedLinkedProducts, setStagedLinkedProducts] = useState<LinkedProduct[]>([]);
    const [pendingAddedProductIds, setPendingAddedProductIds] = useState<number[]>([]);
    const [pendingRemovedLinkIds, setPendingRemovedLinkIds] = useState<number[]>([]);
    const [initializedSupplierId, setInitializedSupplierId] = useState<number | null>(null);
    const [linkProductSearch, setLinkProductSearch] = useState("");
    const [linkedFilterSearch, setLinkedFilterSearch] = useState("");

    useEffect(() => {
        if (!isOpen) {
            setInitializedSupplierId(null);
            setInitialLinkedProducts([]);
            setStagedLinkedProducts([]);
            setPendingAddedProductIds([]);
            setPendingRemovedLinkIds([]);
            setLinkProductSearch("");
            setLinkedFilterSearch("");
            return;
        }

        if (!supplier || loadingLinkedProducts || initializedSupplierId === supplier.id) return;

        setInitialLinkedProducts(linkedProducts);
        setStagedLinkedProducts(linkedProducts);
        setPendingAddedProductIds([]);
        setPendingRemovedLinkIds([]);
        setInitializedSupplierId(supplier.id);
    }, [isOpen, supplier, loadingLinkedProducts, initializedSupplierId, linkedProducts]);

    const initialLinkByProductId = useMemo(() => {
        const map = new Map<number, LinkedProduct>();
        initialLinkedProducts.forEach(link => {
            const productId = getLinkedProductId(link);
            if (Number.isInteger(productId) && productId > 0) map.set(productId, link);
        });
        return map;
    }, [initialLinkedProducts]);

    const stagedProductIds = useMemo(
        () => new Set(stagedLinkedProducts.map(getLinkedProductId).filter(productId => Number.isInteger(productId))),
        [stagedLinkedProducts]
    );

    const availableRM = useMemo(() => rawMaterials.filter(material => {
        if (stagedProductIds.has(Number(material.product_id))) return false;
        const query = linkProductSearch.toLowerCase().trim();
        if (!query) return true;
        return material.product_name.toLowerCase().includes(query)
            || Boolean(material.product_code?.toLowerCase().includes(query));
    }), [rawMaterials, stagedProductIds, linkProductSearch]);

    const filteredLinkedProducts = useMemo(() => stagedLinkedProducts.filter(link => {
        if (!linkedFilterSearch.trim()) return true;
        const query = linkedFilterSearch.toLowerCase().trim();
        const product = link.product_id;
        const code = typeof product === "object" ? product?.product_code || "" : "";
        const name = typeof product === "object" ? product?.product_name || "" : "";
        return code.toLowerCase().includes(query) || name.toLowerCase().includes(query);
    }), [stagedLinkedProducts, linkedFilterSearch]);

    const hasChanges = pendingAddedProductIds.length > 0 || pendingRemovedLinkIds.length > 0;

    const stageProducts = (materials: RawMaterial[]) => {
        if (!supplier || materials.length === 0) return;

        const newMaterials = materials.filter(material => !stagedProductIds.has(Number(material.product_id)));
        if (newMaterials.length === 0) return;

        setStagedLinkedProducts(previous => [
            ...previous,
            ...newMaterials.map(material => toStagedLinkedProduct(supplier.id, material))
        ]);

        const newProductIds = newMaterials.map(material => Number(material.product_id));
        setPendingAddedProductIds(previous => Array.from(new Set([
            ...previous,
            ...newProductIds.filter(productId => !initialLinkByProductId.has(productId))
        ])));

        const restoredLinkIds = newMaterials
            .map(material => initialLinkByProductId.get(Number(material.product_id))?.id)
            .filter((linkId): linkId is number => Number.isInteger(linkId));
        if (restoredLinkIds.length > 0) {
            setPendingRemovedLinkIds(previous => previous.filter(linkId => !restoredLinkIds.includes(linkId)));
        }
    };

    const stageUnlink = (link: LinkedProduct) => {
        const productId = getLinkedProductId(link);
        if (!Number.isInteger(productId)) return;

        setStagedLinkedProducts(previous => previous.filter(item => getLinkedProductId(item) !== productId));

        const initialLink = initialLinkByProductId.get(productId);
        if (initialLink) {
            setPendingRemovedLinkIds(previous => Array.from(new Set([...previous, initialLink.id])));
        } else {
            setPendingAddedProductIds(previous => previous.filter(id => id !== productId));
        }
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
            onClose();
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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 15 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 15 }}
                        transition={{ type: "spring", duration: 0.3 }}
                        className="bg-card text-foreground w-full max-w-3xl border rounded-2xl shadow-xl p-6 space-y-5"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Link className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-foreground">Supplier Raw Material Catalog Matrix</h3>
                                    <p className="text-[11px] text-muted-foreground">{supplier.supplier_name}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg hover:bg-muted"
                                aria-label="Close catalog matrix"
                            >
                                <X className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        <div className="bg-muted/20 p-4 rounded-2xl border border-primary/20 space-y-3 shadow-xs">
                            <div className="flex items-center justify-between border-b pb-2.5">
                                <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs font-extrabold text-foreground">Select Catalog Items to Associate</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => stageProducts(availableRM)}
                                    disabled={availableRM.length === 0 || savingUpdates}
                                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground border px-2.5 py-1 rounded-xl bg-background hover:bg-muted/50 disabled:opacity-50 transition-all cursor-pointer"
                                >
                                    Add All Unlinked
                                </button>
                            </div>

                            <div className="relative">
                                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search unlinked raw materials by code or name..."
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

                            <div className="border rounded-xl bg-background max-h-[220px] overflow-auto">
                                <table className="w-full min-w-[720px] text-left">
                                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                                        <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                                            <th scope="col" className="w-12 px-3 py-2 font-bold">Add</th>
                                            <th scope="col" className="w-32 px-3 py-2 font-bold">Product Code</th>
                                            <th scope="col" className="px-3 py-2 font-bold">Catalog Item</th>
                                            <th scope="col" className="w-32 px-3 py-2 font-bold">Hierarchy</th>
                                            <th scope="col" className="w-20 px-3 py-2 font-bold">UOM</th>
                                            <th scope="col" className="w-28 px-3 py-2 text-right font-bold">Unit Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/70">
                                        {loadingLinkedProducts ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading catalog...
                                                </td>
                                            </tr>
                                        ) : availableRM.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-6 text-xs text-muted-foreground italic">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <AlertCircle className="h-4 w-4 text-muted-foreground/40" />
                                                        <span>No unlinked raw materials match your search</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            availableRM.map(material => {
                                                const uomName = material.unit_of_measurement?.unit_shortcut || material.unit_of_measurement?.unit_name;
                                                return (
                                                    <tr
                                                        key={material.product_id}
                                                        onClick={() => stageProducts([material])}
                                                        className="cursor-pointer align-middle text-xs transition-colors hover:bg-muted/40"
                                                    >
                                                        <td className="px-3 py-2">
                                                            <input
                                                                id={`catalog-product-${material.product_id}`}
                                                                type="checkbox"
                                                                checked={false}
                                                                onChange={() => stageProducts([material])}
                                                                onClick={event => event.stopPropagation()}
                                                                aria-label={`Add ${material.product_name}`}
                                                                className="rounded text-primary focus:ring-0 h-4 w-4"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 font-mono font-bold text-[10px] text-foreground break-all">
                                                            {material.product_code || "—"}
                                                        </td>
                                                        <td className="px-3 py-2 font-bold text-foreground whitespace-normal break-words">
                                                            {material.product_name}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <HierarchyBadge parentId={material.parent_id} />
                                                        </td>
                                                        <td className="px-3 py-2 text-[10px] font-semibold text-primary">{uomName || "—"}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-[10px] text-foreground">
                                                            {material.cost_per_unit > 0
                                                                ? `₱${Number(material.cost_per_unit).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                                                                : "—"}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    Staged Linked Materials ({stagedLinkedProducts.length})
                                </h4>
                                {stagedLinkedProducts.length > 3 && (
                                    <div className="relative w-48">
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
                                    No raw materials currently staged for this vendor.
                                </div>
                            ) : (
                                <div className="border rounded-xl bg-background max-h-[220px] overflow-auto">
                                    <table className="w-full min-w-[640px] text-left">
                                        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                                            <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                                                <th scope="col" className="w-32 px-3 py-2 font-bold">Product Code</th>
                                                <th scope="col" className="px-3 py-2 font-bold">Catalog Item</th>
                                                <th scope="col" className="w-32 px-3 py-2 font-bold">Hierarchy</th>
                                                <th scope="col" className="w-20 px-3 py-2 font-bold">UOM</th>
                                                <th scope="col" className="w-20 px-3 py-2 text-right font-bold">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/70">
                                            {filteredLinkedProducts.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-6 text-xs text-muted-foreground italic">
                                                        No staged linked raw materials match your search.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLinkedProducts.map(link => {
                                                    const product = link.product_id;
                                                    const uom = product?.unit_of_measurement?.unit_shortcut || product?.unit_of_measurement?.unit_name;
                                                    const productName = product?.product_name || "Unknown Product";
                                                    return (
                                                        <tr key={getLinkedProductId(link)} className="align-middle text-xs transition-colors hover:bg-muted/40">
                                                            <td className="px-3 py-2 font-mono font-bold text-[10px] text-primary break-all">
                                                                {product?.product_code || "—"}
                                                            </td>
                                                            <td className="px-3 py-2 font-bold text-foreground whitespace-normal break-words">{productName}</td>
                                                            <td className="px-3 py-2">
                                                                <HierarchyBadge parentId={product?.parent_id} />
                                                            </td>
                                                            <td className="px-3 py-2 text-[10px] font-semibold text-muted-foreground">{uom || "—"}</td>
                                                            <td className="px-3 py-2 text-right">
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
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t pt-4">
                            <span className="text-[11px] font-medium text-muted-foreground">
                                {hasChanges
                                    ? `${pendingAddedProductIds.length} addition(s), ${pendingRemovedLinkIds.length} removal(s) pending`
                                    : "No unsaved catalog changes"}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
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
