import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Supplier, RawMaterial, SupplierFormState, LinkedProduct, SupplierCatalogUpdatePayload, SupplierPageResponse, LinkedProductPageResponse } from "../types";
import {
    MapPin, Phone, Mail, Award, FileText, CheckCircle2,
    AlertCircle, Globe, Building2, UserSquare2, Link as LinkIcon, Plus, Loader2, Search, X
} from "lucide-react";
import { toast } from "sonner";
import SupplierTable from "./SupplierTable";
import SupplierFormModal from "./SupplierFormModal";
import SupplierEvaluationModal from "./SupplierEvaluationModal";
import SupplierCatalogMatrixModal from "./SupplierCatalogMatrixModal";
import {
    fetchLinkedProducts,
    fetchLinkedProductsPage,
    fetchSupplierPage,
    saveSupplierCatalogUpdates,
    isSupplierActive,
    isSupplierNonBuy,
    isSupplierForeign,
    cleanNotes
} from "../services/supplier.service";
import type { SupplierForeignFilter, SupplierStatusFilter } from "../services/procurement-api";
import PaginationFooter from "./PaginationFooter";
import { isForeignCountry } from "../supplier-country";

interface SuppliersDirectoryProps {
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    supplierForm: SupplierFormState;
    setSupplierForm: React.Dispatch<React.SetStateAction<SupplierFormState>>;
    supplierError?: string | null;
    isEditingSupplier?: boolean;
    onStartEditSupplier?: (supplier: Supplier) => void;
    onCreateSupplier: (e: React.FormEvent) => void;
    rawMaterials?: RawMaterial[];
    supplierRefreshKey?: number;
}

const EMPTY_SUPPLIER_PAGE: SupplierPageResponse = {
    data: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    counts: { active: 0, inactive: 0, all: 0 }
};

const EMPTY_LINKED_PRODUCT_PAGE: LinkedProductPageResponse = {
    data: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 }
};

export default function SuppliersDirectory({
    isModalOpen,
    setIsModalOpen,
    supplierForm,
    setSupplierForm,
    supplierError,
    isEditingSupplier = false,
    onStartEditSupplier,
    onCreateSupplier,
    rawMaterials = [],
    supplierRefreshKey = 0
}: SuppliersDirectoryProps) {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("active");
    const [foreignFilter, setForeignFilter] = useState<SupplierForeignFilter>("all");
    const [supplierPage, setSupplierPage] = useState(1);
    const [supplierPageSize, setSupplierPageSize] = useState(10);
    const [supplierPageData, setSupplierPageData] = useState<SupplierPageResponse>(EMPTY_SUPPLIER_PAGE);
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);
    const [supplierPageError, setSupplierPageError] = useState<string | null>(null);
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

    // Modals state
    const [isEvaluationOpen, setIsEvaluationOpen] = useState(false);
    const [isCatalogMatrixOpen, setIsCatalogMatrixOpen] = useState(false);

    // Linked products state
    const [linkedProducts, setLinkedProducts] = useState<LinkedProduct[]>([]);
    const [linkedProductPage, setLinkedProductPage] = useState(1);
    const [linkedProductPageSize, setLinkedProductPageSize] = useState(10);
    const [linkedProductSearch, setLinkedProductSearch] = useState("");
    const [linkedProductPageData, setLinkedProductPageData] = useState<LinkedProductPageResponse>(EMPTY_LINKED_PRODUCT_PAGE);
    const [loadingLinkedProductPage, setLoadingLinkedProductPage] = useState(false);
    const [loadingLinkedProducts, setLoadingLinkedProducts] = useState(false);
    const [savingCatalogUpdates, setSavingCatalogUpdates] = useState(false);
    const linkedProductRequestId = useRef(0);
    const previousActiveSupplierId = useRef<number | null>(null);

    const filteredSuppliers = supplierPageData.data;

    const activeSupplier = useMemo(() => {
        if (selectedSupplierId !== null) {
            return filteredSuppliers.find(s => s.id === selectedSupplierId);
        }
        return filteredSuppliers[0];
    }, [selectedSupplierId, filteredSuppliers]);

    const activeSupplierId = activeSupplier?.id ?? null;

    const loadSupplierPage = useCallback(async (
        page: number,
        pageSize: number,
        nextSearch: string,
        nextStatus: SupplierStatusFilter,
        nextForeign: SupplierForeignFilter
    ) => {
        setLoadingSuppliers(true);
        setSupplierPageError(null);
        try {
            const data = await fetchSupplierPage({
                page,
                pageSize,
                search: nextSearch,
                status: nextStatus,
                foreign: nextForeign
            });
            setSupplierPageData(data);
            if (data.pagination.totalPages < page) {
                setSupplierPage(data.pagination.totalPages);
            }
            setSelectedSupplierId(previous => data.data.some(supplier => supplier.id === previous)
                ? previous
                : (data.data[0]?.id ?? null));
        } catch (error) {
            console.error(error);
            setSupplierPageError((error as Error).message || "Failed to load suppliers");
            setSupplierPageData(previous => ({ ...previous, data: [] }));
        } finally {
            setLoadingSuppliers(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadSupplierPage(supplierPage, supplierPageSize, search, statusFilter, foreignFilter);
        }, search.trim() ? 250 : 0);

        return () => window.clearTimeout(timer);
    }, [foreignFilter, loadSupplierPage, search, statusFilter, supplierPage, supplierPageSize, supplierRefreshKey]);

    const loadLinkedProductPage = useCallback(async (
        supplierId: number | null,
        page: number,
        pageSize: number,
        searchTerm: string,
        requestId: number,
        signal: AbortSignal
    ) => {
        if (supplierId === null) {
            if (requestId !== linkedProductRequestId.current) return;
            setLinkedProductPageData(EMPTY_LINKED_PRODUCT_PAGE);
            setLoadingLinkedProductPage(false);
            return;
        }

        setLoadingLinkedProductPage(true);
        try {
            const data = await fetchLinkedProductsPage(supplierId, page, pageSize, searchTerm, signal);
            if (signal.aborted || requestId !== linkedProductRequestId.current) return;
            setLinkedProductPageData(data);
            if (data.pagination.totalPages < page) {
                setLinkedProductPage(data.pagination.totalPages);
            }
        } catch (error) {
            if (signal.aborted || requestId !== linkedProductRequestId.current) return;
            console.error(error);
            setLinkedProductPageData(EMPTY_LINKED_PRODUCT_PAGE);
        } finally {
            if (requestId === linkedProductRequestId.current) {
                setLoadingLinkedProductPage(false);
            }
        }
    }, []);

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
        const requestId = linkedProductRequestId.current + 1;
        linkedProductRequestId.current = requestId;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            void loadLinkedProductPage(
                activeSupplierId,
                linkedProductPage,
                linkedProductPageSize,
                linkedProductSearch,
                requestId,
                controller.signal
            );
        }, linkedProductSearch.trim() ? 250 : 0);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [activeSupplierId, linkedProductPage, linkedProductPageSize, linkedProductSearch, loadLinkedProductPage]);

    useEffect(() => {
        if (previousActiveSupplierId.current !== null && previousActiveSupplierId.current !== activeSupplierId) {
            setLinkedProductSearch("");
            setLinkedProductPage(1);
            setLinkedProductPageData(EMPTY_LINKED_PRODUCT_PAGE);
        }
        previousActiveSupplierId.current = activeSupplierId;
    }, [activeSupplierId]);

    useEffect(() => {
        if (isCatalogMatrixOpen && activeSupplierId !== null) {
            void loadLinkedProducts(activeSupplierId);
        }
    }, [activeSupplierId, isCatalogMatrixOpen, loadLinkedProducts]);

    const handleSelectSupplier = (supplierId: number) => {
        setSelectedSupplierId(supplierId);
        setLinkedProductSearch("");
        setLinkedProductPage(1);
        setLinkedProductPageData(EMPTY_LINKED_PRODUCT_PAGE);
    };

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setSupplierPage(1);
        setLinkedProductPage(1);
    };

    const handleStatusFilterChange = (value: SupplierStatusFilter) => {
        setStatusFilter(value);
        setSupplierPage(1);
        setLinkedProductPage(1);
    };

    const handleForeignFilterChange = (value: SupplierForeignFilter) => {
        setForeignFilter(value);
        setSupplierPage(1);
        setLinkedProductPage(1);
    };

    const handleSupplierPageChange = (page: number) => {
        setSupplierPage(page);
        setLinkedProductPage(1);
    };

    const handleSupplierPageSizeChange = (pageSize: number) => {
        setSupplierPageSize(pageSize);
        setSupplierPage(1);
        setLinkedProductPage(1);
    };

    const handleLinkedProductPageSizeChange = (pageSize: number) => {
        setLinkedProductPageSize(pageSize);
        setLinkedProductPage(1);
    };

    const handleLinkedProductSearchChange = (value: string) => {
        setLinkedProductSearch(value);
        setLinkedProductPage(1);
    };

    const clearLinkedProductSearch = () => {
        setLinkedProductSearch("");
        setLinkedProductPage(1);
    };

    const handleSaveCatalogUpdates = async (payload: SupplierCatalogUpdatePayload) => {
        if (activeSupplierId === null || payload.supplierId !== activeSupplierId) {
            throw new Error("Select a supplier before saving catalog updates.");
        }
        setSavingCatalogUpdates(true);
        try {
            const result = await saveSupplierCatalogUpdates(payload);
            const refreshRequestId = linkedProductRequestId.current + 1;
            linkedProductRequestId.current = refreshRequestId;
            await Promise.all([
                loadLinkedProductPage(
                    activeSupplierId,
                    linkedProductPage,
                    linkedProductPageSize,
                    linkedProductSearch,
                    refreshRequestId,
                    new AbortController().signal
                ),
                loadLinkedProducts(activeSupplierId)
            ]);
            const addedCount = result.added?.length || 0;
            const removedCount = result.removed?.length || 0;
            toast.success(`Catalog updates saved (${addedCount} added, ${removedCount} removed)`);
        } catch (e) {
            console.error(e);
            toast.error((e as Error).message || "Failed to save catalog updates. Please try again.");
            throw e;
        } finally {
            setSavingCatalogUpdates(false);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
            {/* Left side: Directory List & Filter Toolbar */}
            <SupplierTable
                filteredSuppliers={filteredSuppliers}
                totalSuppliers={supplierPageData.pagination.total}
                statusCounts={supplierPageData.counts}
                selectedSupplierId={selectedSupplierId}
                onSelectSupplier={handleSelectSupplier}
                search={search}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusFilterChange={handleStatusFilterChange}
                foreignFilter={foreignFilter}
                onForeignFilterChange={handleForeignFilterChange}
                onOpenRegisterModal={() => setIsModalOpen(true)}
                onOpenEvaluationModal={() => setIsEvaluationOpen(true)}
                page={supplierPage}
                pageSize={supplierPageSize}
                totalPages={supplierPageData.pagination.totalPages}
                onPageChange={handleSupplierPageChange}
                onPageSizeChange={handleSupplierPageSizeChange}
                loading={loadingSuppliers}
                error={supplierPageError}
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
                                                {linkedProductPageData.pagination.total} Linked
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Catalog items and raw materials supplied by {activeSupplier.supplier_name}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                                    <div className="relative w-full sm:w-64">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <input
                                            type="search"
                                            value={linkedProductSearch}
                                            onChange={event => handleLinkedProductSearchChange(event.target.value)}
                                            placeholder="Search linked items by name or code..."
                                            aria-label="Search linked items by name or code"
                                            className="h-8 w-full rounded-lg border bg-background pl-8 pr-8 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary"
                                        />
                                        {linkedProductSearch && (
                                            <button
                                                type="button"
                                                onClick={clearLinkedProductSearch}
                                                aria-label="Clear linked item search"
                                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsCatalogMatrixOpen(true)}
                                        className="text-xs text-primary-foreground font-bold bg-primary hover:bg-primary/95 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 self-start sm:self-auto"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Manage Catalog Matrix
                                    </button>
                                </div>
                            </div>

                            {/* Linked Products Preview Grid */}
                            {loadingLinkedProductPage ? (
                                <div className="text-center text-xs text-muted-foreground py-6 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    <span>Loading associated products...</span>
                                </div>
                            ) : linkedProductPageData.data.length === 0 ? (
                                linkedProductSearch.trim() ? (
                                    <div className="text-center p-8 border border-dashed rounded-2xl bg-muted/5 flex flex-col items-center justify-center gap-2">
                                        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                                            <Search className="h-6 w-6" />
                                        </div>
                                        <h5 className="text-xs font-bold text-foreground">No linked items match your search</h5>
                                        <p className="text-[11px] text-muted-foreground max-w-sm">
                                            Try another product name or code, or clear the search to view all associated items.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={clearLinkedProductSearch}
                                            className="mt-2 text-xs text-primary font-bold border border-primary/30 hover:bg-primary/10 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
                                        >
                                            Clear search
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center p-8 border border-dashed rounded-2xl bg-muted/5 flex flex-col items-center justify-center gap-2">
                                        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                                            <LinkIcon className="h-6 w-6" />
                                        </div>
                                        <h5 className="text-xs font-bold text-foreground">No Raw Materials Linked</h5>
                                        <p className="text-[11px] text-muted-foreground max-w-sm">
                                            Associate raw materials or catalog items to this vendor to streamline purchase orders and landed cost allocation.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setIsCatalogMatrixOpen(true)}
                                            className="mt-2 text-xs text-primary-foreground font-bold bg-primary hover:bg-primary/95 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Associate First Product
                                        </button>
                                    </div>
                                )
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {linkedProductPageData.data.map((lp: LinkedProduct) => {
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
                                                    onClick={() => setIsCatalogMatrixOpen(true)}
                                                    className="text-[10px] font-bold text-primary hover:text-primary/80 shrink-0"
                                                >
                                                    Manage
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <PaginationFooter
                                page={linkedProductPage}
                                pageSize={linkedProductPageSize}
                                total={linkedProductPageData.pagination.total}
                                totalPages={linkedProductPageData.pagination.totalPages}
                                onPageChange={setLinkedProductPage}
                                onPageSizeChange={handleLinkedProductPageSizeChange}
                                itemLabel="linked products"
                            />
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
                key={`supplier-catalog-${activeSupplierId ?? "none"}-${isCatalogMatrixOpen ? "open" : "closed"}`}
                isOpen={isCatalogMatrixOpen}
                onClose={() => setIsCatalogMatrixOpen(false)}
                supplier={activeSupplier || null}
                rawMaterials={rawMaterials}
                linkedProducts={linkedProducts}
                loadingLinkedProducts={loadingLinkedProducts}
                onSaveUpdates={handleSaveCatalogUpdates}
                savingUpdates={savingCatalogUpdates}
            />
        </div>
    );
}
