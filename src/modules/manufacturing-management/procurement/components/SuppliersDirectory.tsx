import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Supplier, RawMaterial, SupplierFormState, LinkedProduct } from "../types";
import {
    MapPin, Phone, Mail, Award, FileText, CheckCircle2,
    AlertCircle, Globe, Building2, UserSquare2, Trash2, Link as LinkIcon, Plus, Loader2
} from "lucide-react";
import { toast } from "sonner";
import SupplierTable, { SupplierStatusFilter, SupplierForeignFilter } from "./SupplierTable";
import SupplierFormModal from "./SupplierFormModal";
import SupplierEvaluationModal from "./SupplierEvaluationModal";
import SupplierCatalogMatrixModal from "./SupplierCatalogMatrixModal";
import {
    fetchLinkedProducts,
    linkProductToSupplier,
    unlinkProductFromSupplier,
    isSupplierActive,
    isSupplierNonBuy,
    isSupplierForeign,
    cleanNotes
} from "../services/supplier.service";
import { isForeignCountry } from "../supplier-country";

interface SuppliersDirectoryProps {
    suppliers: Supplier[];
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    supplierForm: SupplierFormState;
    setSupplierForm: React.Dispatch<React.SetStateAction<SupplierFormState>>;
    supplierError?: string | null;
    isEditingSupplier?: boolean;
    onStartEditSupplier?: (supplier: Supplier) => void;
    onCreateSupplier: (e: React.FormEvent) => void;
    rawMaterials?: RawMaterial[];
}

export default function SuppliersDirectory({
    suppliers,
    isModalOpen,
    setIsModalOpen,
    supplierForm,
    setSupplierForm,
    supplierError,
    isEditingSupplier = false,
    onStartEditSupplier,
    onCreateSupplier,
    rawMaterials = []
}: SuppliersDirectoryProps) {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("active");
    const [foreignFilter, setForeignFilter] = useState<SupplierForeignFilter>("all");
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

    // Modals state
    const [isEvaluationOpen, setIsEvaluationOpen] = useState(false);
    const [isCatalogMatrixOpen, setIsCatalogMatrixOpen] = useState(false);

    // Linked products state
    const [linkedProducts, setLinkedProducts] = useState<LinkedProduct[]>([]);
    const [loadingLinkedProducts, setLoadingLinkedProducts] = useState(false);
    const [unlinkingLinkId, setUnlinkingLinkId] = useState<number | null>(null);

    const checkForeign = useCallback((s: Supplier | null | undefined): boolean => {
        return isSupplierForeign(s);
    }, []);

    const filteredSuppliers = useMemo(() => {
        const normalizedSearch = search.toLowerCase();
        return suppliers.filter(s => {
            const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isSupplierActive(s) : !isSupplierActive(s));
            if (!matchesStatus) return false;

            const isForeign = checkForeign(s);
            const matchesForeign = foreignFilter === "all" || (foreignFilter === "foreign" ? isForeign : !isForeign);
            if (!matchesForeign) return false;

            return s.supplier_name.toLowerCase().includes(normalizedSearch) ||
                s.supplier_shortcut?.toLowerCase().includes(normalizedSearch) ||
                s.tin_number?.includes(search);
        });
    }, [suppliers, search, statusFilter, foreignFilter, checkForeign]);

    const activeSupplier = useMemo(() => {
        if (selectedSupplierId !== null) {
            return filteredSuppliers.find(s => s.id === selectedSupplierId);
        }
        return filteredSuppliers[0];
    }, [selectedSupplierId, filteredSuppliers]);

    const activeSupplierId = activeSupplier?.id ?? null;

    const loadLinkedProducts = useCallback(async (supplierId: number) => {
        setLoadingLinkedProducts(true);
        try {
            const data = await fetchLinkedProducts(supplierId);
            setLinkedProducts(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingLinkedProducts(false);
        }
    }, []);

    useEffect(() => {
        if (activeSupplierId !== null) {
            loadLinkedProducts(activeSupplierId);
        } else {
            setLinkedProducts([]);
        }
    }, [activeSupplierId, loadLinkedProducts]);

    const handleLinkMultipleProducts = async (productIds: string[]) => {
        if (productIds.length === 0 || activeSupplierId === null) return;
        try {
            await Promise.all(
                productIds.map(id => linkProductToSupplier(activeSupplierId, Number(id)))
            );
            toast.success(`Successfully linked ${productIds.length} products`);
            await loadLinkedProducts(activeSupplierId);
        } catch (e) {
            console.error(e);
            toast.error("Failed to link one or more products");
            throw e;
        }
    };

    const handleUnlinkProduct = async (linkId: number) => {
        if (unlinkingLinkId !== null || activeSupplierId === null) return;
        setUnlinkingLinkId(linkId);
        try {
            await unlinkProductFromSupplier(linkId);
            toast.success("Product unlinked successfully");
            await loadLinkedProducts(activeSupplierId);
        } catch (e) {
            console.error(e);
            toast.error((e as Error).message || "Failed to unlink product. Please try again.");
        } finally {
            setUnlinkingLinkId(null);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
            {/* Left side: Directory List & Filter Toolbar */}
            <SupplierTable
                suppliers={suppliers}
                filteredSuppliers={filteredSuppliers}
                selectedSupplierId={selectedSupplierId}
                onSelectSupplier={setSelectedSupplierId}
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                foreignFilter={foreignFilter}
                onForeignFilterChange={setForeignFilter}
                onOpenRegisterModal={() => setIsModalOpen(true)}
                onOpenEvaluationModal={() => setIsEvaluationOpen(true)}
            />

            {/* Right side: Detailed Supplier Profile */}
            <div className="flex-1 border rounded-xl bg-card overflow-y-auto p-6 shadow-sm flex flex-col gap-6">
                {activeSupplier ? (
                    <>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-6">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-lg font-bold text-foreground leading-tight">{activeSupplier.supplier_name}</h2>
                                        {!isSupplierActive(activeSupplier) ? (
                                            <span className="bg-red-500/10 text-red-600 border border-red-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
                                                Inactive
                                            </span>
                                        ) : (
                                            <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
                                                Active
                                            </span>
                                        )}
                                        {isSupplierNonBuy(activeSupplier) && (
                                            <span className="bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
                                                Non-Buy
                                            </span>
                                        )}
                                        {isSupplierForeign(activeSupplier) ? (
                                            <span className="bg-amber-500/15 text-amber-700 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1">
                                                <Globe className="h-3 w-3" /> Foreign Import{(activeSupplier.default_currency || activeSupplier.currency) ? ` (${activeSupplier.default_currency || activeSupplier.currency})` : ""}
                                            </span>
                                        ) : (
                                            <span className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1">
                                                <Building2 className="h-3 w-3" /> Local ({activeSupplier.default_currency || "PHP"})
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => onStartEditSupplier?.(activeSupplier)}
                                            className="text-[10px] text-primary hover:underline font-bold border border-primary/20 px-2 py-1 rounded bg-primary/5 hover:bg-primary/10 transition-all cursor-pointer"
                                        >
                                            Edit Details
                                        </button>
                                        <button
                                            onClick={() => setIsEvaluationOpen(true)}
                                            className="text-[10px] font-bold text-amber-700 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                                        >
                                            <Award className="h-3 w-3 text-amber-600" /> Evaluate
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <UserSquare2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    Representatives: <strong className="text-foreground font-medium">{(activeSupplier.representatives || []).length} Registered</strong>
                                </p>
                            </div>
                            <div className="text-left sm:text-right font-mono text-[10px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg border">
                                <div>TIN: {activeSupplier.tin_number || "Pending Registration"}</div>
                            </div>
                        </div>

                        {/* Profile Info Fields */}
                        <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-4">
                                <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2 border-l-4 border-primary pl-2.5 mb-2">
                                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                                    Company Address
                                </h4>
                                <div className="space-y-2.5 text-xs text-foreground/80">
                                    <p className="flex gap-2">
                                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                        <span>
                                            {activeSupplier.address ? `${activeSupplier.address}, ` : ""}
                                            {activeSupplier.brgy ? `Brgy. ${activeSupplier.brgy}, ` : ""}
                                            {activeSupplier.city ? `${activeSupplier.city}, ` : ""}
                                            {activeSupplier.state_province ? `${activeSupplier.state_province}, ` : ""}
                                            {activeSupplier.postal_code ? `${activeSupplier.postal_code}, ` : ""}
                                            {activeSupplier.country}
                                        </span>
                                    </p>
                                    <p className="flex gap-2 items-center">
                                        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span>
                                            Region Scope: {
                                                !isForeignCountry(activeSupplier.country)
                                                    ? `Domestic (${activeSupplier.country || 'Philippines'})`
                                                    : `International (${activeSupplier.country})`
                                            }
                                        </span>
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2 border-l-4 border-primary pl-2.5 mb-2">
                                    <Phone className="h-4 w-4 text-primary shrink-0" />
                                    Communications & Contact
                                </h4>
                                <div className="space-y-2.5 text-xs text-foreground/80">
                                    <p className="flex gap-2 items-center">
                                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span>Phone: {activeSupplier.phone_number || "No Contact Number"}</span>
                                    </p>
                                    <p className="flex gap-2 items-center">
                                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span>Email: {activeSupplier.email_address || "No Email Registered"}</span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Trade terms */}
                        <div className="space-y-4 pt-4">
                            <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2 border-l-4 border-primary pl-2.5 mb-2">
                                <Award className="h-4 w-4 text-primary shrink-0" />
                                Commercial Agreement & Trade Terms
                            </h4>
                            <div className="grid gap-4 sm:grid-cols-4">
                                <div className="border p-4 rounded-xl bg-muted/10 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Payment Terms</span>
                                    <p className="text-xs font-semibold text-foreground">{activeSupplier.payment_terms || "Cash On Delivery"}</p>
                                </div>
                                <div className="border p-4 rounded-xl bg-muted/10 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Delivery Terms</span>
                                    <p className="text-xs font-semibold text-foreground">{activeSupplier.delivery_terms || "FOB / Delivery"}</p>
                                </div>
                                <div className="border p-4 rounded-xl bg-muted/10 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Default / Operating Currency</span>
                                    <p className="text-xs font-semibold text-foreground">{activeSupplier.default_currency || "PHP"}</p>
                                </div>
                                <div className="border p-4 rounded-xl bg-muted/10 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">TIN Status</span>
                                    {activeSupplier.tin_number ? (
                                        <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                            Verified
                                        </p>
                                    ) : (
                                        <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                                            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                            Unverified
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {cleanNotes(activeSupplier.notes_or_comments) && (
                            <div className="space-y-2 bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl mt-4">
                                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider flex items-center gap-1">
                                    <FileText className="h-3.5 w-3.5" />
                                    Vendor Agreements / Audit Notes
                                </span>
                                <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">{cleanNotes(activeSupplier.notes_or_comments)}</p>
                            </div>
                        )}

                        {/* Representatives Card */}
                        <div className="space-y-4 pt-4 border-t">
                            <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2 border-l-4 border-primary pl-2.5 mb-2">
                                <UserSquare2 className="h-4 w-4 text-primary shrink-0" />
                                Representatives ({(activeSupplier.representatives || []).length})
                            </h4>
                            {(activeSupplier.representatives || []).length > 0 ? (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {(activeSupplier.representatives || []).map((rep, rIdx) => {
                                        const fullName = [rep.first_name, rep.middle_name, rep.last_name, rep.suffix].filter(Boolean).join(" ");
                                        return (
                                            <div key={rep.id || rIdx} className="border rounded-xl p-3 bg-muted/20 space-y-1">
                                                <p className="text-xs font-bold text-foreground">{fullName}</p>
                                                {rep.contact_number && (
                                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                        <Phone className="h-3 w-3" /> {rep.contact_number}
                                                    </p>
                                                )}
                                                {rep.email && (
                                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                                                        <Mail className="h-3 w-3" /> {rep.email}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">No representatives registered for this supplier</p>
                            )}
                        </div>

                        {/* Associated Products Section Header */}
                        <div className="space-y-4 pt-5 border-t">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-xs">
                                        <LinkIcon className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-xs font-black text-foreground uppercase tracking-wider">
                                                Associated Raw Materials & Catalog Items
                                            </h4>
                                            <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3 text-primary" />
                                                {linkedProducts.length} Linked
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Catalog items and raw materials supplied by {activeSupplier.supplier_name}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setIsCatalogMatrixOpen(true)}
                                    className="text-xs text-primary-foreground font-bold bg-primary hover:bg-primary/95 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 self-start sm:self-auto"
                                >
                                    <Plus className="h-3.5 w-3.5" /> Manage Catalog Matrix
                                </button>
                            </div>

                            {/* Linked Products Preview Grid */}
                            {loadingLinkedProducts ? (
                                <div className="text-center text-xs text-muted-foreground py-6 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    <span>Loading associated products...</span>
                                </div>
                            ) : linkedProducts.length === 0 ? (
                                <div className="text-center p-8 border border-dashed rounded-2xl bg-muted/5 flex flex-col items-center justify-center gap-2">
                                    <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                                        <LinkIcon className="h-6 w-6" />
                                    </div>
                                    <h5 className="text-xs font-bold text-foreground">No Raw Materials Linked</h5>
                                    <p className="text-[11px] text-muted-foreground max-w-sm">
                                        Associate raw materials or catalog items to this vendor to streamline purchase orders and landed cost allocation.
                                    </p>
                                    <button
                                        onClick={() => setIsCatalogMatrixOpen(true)}
                                        className="mt-2 text-xs text-primary-foreground font-bold bg-primary hover:bg-primary/95 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Associate First Product
                                    </button>
                                </div>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {linkedProducts.map((lp: LinkedProduct) => {
                                        const uom = lp.product_id?.unit_of_measurement?.unit_shortcut || lp.product_id?.unit_of_measurement?.unit_name;
                                        return (
                                            <div
                                                key={lp.id}
                                                className="border border-border/80 hover:border-primary/40 rounded-2xl p-3.5 flex items-center justify-between bg-card hover:bg-muted/10 transition-all shadow-xs hover:shadow-sm group border-l-4 border-l-primary/60 hover:border-l-primary"
                                            >
                                                <div className="space-y-1 min-w-0 pr-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {lp.product_id?.product_code && (
                                                            <span className="font-mono text-[9px] text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md font-bold uppercase shrink-0">
                                                                {lp.product_id.product_code}
                                                            </span>
                                                        )}
                                                        <span className="text-xs font-bold text-foreground truncate block">
                                                            {lp.product_id?.product_name || "Unknown Product"}
                                                        </span>
                                                        {uom && (
                                                            <span className="text-[10px] text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded border italic">
                                                                {uom}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground truncate">
                                                        {lp.product_id?.description || "No product description recorded"}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleUnlinkProduct(lp.id)}
                                                    disabled={unlinkingLinkId === lp.id}
                                                    className="text-muted-foreground hover:text-red-600 p-2 rounded-xl hover:bg-red-500/10 transition-all cursor-pointer shrink-0 opacity-80 group-hover:opacity-100"
                                                    title="Unlink Product"
                                                >
                                                    {unlinkingLinkId === lp.id ? <Loader2 className="h-4 w-4 animate-spin text-red-500" /> : <Trash2 className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground h-full">
                        <Building2 className="h-16 w-16 mb-4 text-muted-foreground/30" />
                        {selectedSupplierId !== null
                            ? "The selected supplier is hidden by the current status filter. Choose the matching filter to view it."
                            : "No supplier selected or registered."}
                    </div>
                )}
            </div>

            {/* Modals */}
            <SupplierFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                supplierForm={supplierForm}
                setSupplierForm={setSupplierForm}
                supplierError={supplierError}
                isEditingSupplier={isEditingSupplier}
                onCreateSupplier={onCreateSupplier}
            />

            <SupplierEvaluationModal
                isOpen={isEvaluationOpen}
                onClose={() => setIsEvaluationOpen(false)}
                supplier={activeSupplier || null}
            />

            <SupplierCatalogMatrixModal
                isOpen={isCatalogMatrixOpen}
                onClose={() => setIsCatalogMatrixOpen(false)}
                supplier={activeSupplier || null}
                rawMaterials={rawMaterials}
                linkedProducts={linkedProducts}
                loadingLinkedProducts={loadingLinkedProducts}
                onLinkProducts={handleLinkMultipleProducts}
                onUnlinkProduct={handleUnlinkProduct}
                unlinkingLinkId={unlinkingLinkId}
            />
        </div>
    );
}
