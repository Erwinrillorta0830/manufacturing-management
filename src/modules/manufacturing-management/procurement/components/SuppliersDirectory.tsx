import React, { useState, useEffect, useRef } from "react";
import { Supplier, RawMaterial, PSGCItem, SupplierFormState } from "../types";
import { Search, Plus, MapPin, Phone, Mail, Award, FileText, CheckCircle2, AlertCircle, Globe, Building2, UserSquare2, Trash2, Link, X, Loader2 } from "lucide-react";
import { fetchLinkedProducts, linkProductToSupplier, unlinkProductFromSupplier, fetchPHProvinces, fetchPHCities, fetchPHBarangays } from "../services/procurement-api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";



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
    onToggleSupplierActive?: (supplier: Supplier) => Promise<void>;
    rawMaterials?: RawMaterial[];
}

export interface LinkedProduct {
    id: number;
    supplier_id: number;
    product_id?: {
        product_id: number;
        product_code?: string;
        product_name?: string;
        description?: string;
        unit_of_measurement?: {
            unit_id: number;
            unit_name?: string;
            unit_shortcut?: string;
        };
    };
}

type SupplierStatusFilter = "active" | "inactive" | "all";
type SupplierForeignFilter = "all" | "local" | "foreign";

const isSupplierActive = (supplier: Supplier): boolean => Number(supplier.isActive) !== 0;
const isSupplierNonBuy = (supplier: Supplier): boolean => supplier.nonBuy === true || Number(supplier.nonBuy) === 1;

const cleanNotes = (notes: string | null | undefined): string => {
    if (!notes) return "";
    return notes.replace(/\[Currency:\s*\w+\]/, "").trim();
};

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
    onToggleSupplierActive,
    rawMaterials = []
}: SuppliersDirectoryProps) {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("active");
    const [foreignFilter, setForeignFilter] = useState<SupplierForeignFilter>("all");
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
    const [isSubmittingSupplier, setIsSubmittingSupplier] = useState(false);
    const supplierSubmitLock = useRef(false);

    const [provinces, setProvinces] = useState<PSGCItem[]>([]);
    const [cities, setCities] = useState<PSGCItem[]>([]);
    const [barangays, setBarangays] = useState<PSGCItem[]>([]);

    const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
    const [selectedCityCode, setSelectedCityCode] = useState("");
    const [selectedBarangayCode, setSelectedBarangayCode] = useState("");

    const [loadingProvinces, setLoadingProvinces] = useState(false);
    const [loadingCities, setLoadingCities] = useState(false);
    const [loadingBarangays, setLoadingBarangays] = useState(false);

    const isSupplierForeign = React.useCallback((s: Supplier | null | undefined): boolean => {
        if (!s) return false;
        if (Number(s.is_foreign) === 1 || (s.is_foreign as unknown) === true) return true;
        const curr = String(s.currency || s.default_currency || "").toUpperCase();
        if (curr === "USD") return true;
        return Boolean(s.country) && s.country?.toLowerCase() !== "philippines" && s.country?.toLowerCase() !== "ph";
    }, []);

    const filteredSuppliers = React.useMemo(() => {
        const normalizedSearch = search.toLowerCase();
        return suppliers.filter(s => {
            const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isSupplierActive(s) : !isSupplierActive(s));
            if (!matchesStatus) return false;

            const isForeign = isSupplierForeign(s);
            const matchesForeign = foreignFilter === "all" || (foreignFilter === "foreign" ? isForeign : !isForeign);
            if (!matchesForeign) return false;

            return s.supplier_name.toLowerCase().includes(normalizedSearch) ||
                s.supplier_shortcut?.toLowerCase().includes(normalizedSearch) ||
                s.tin_number?.includes(search);
        });
    }, [suppliers, search, statusFilter, foreignFilter, isSupplierForeign]);

    const activeSupplier = React.useMemo(() => {
        if (selectedSupplierId !== null) {
            return filteredSuppliers.find(s => s.id === selectedSupplierId);
        }
        return filteredSuppliers[0];
    }, [selectedSupplierId, filteredSuppliers]);
    const activeSupplierId = activeSupplier?.id ?? null;

    const isPH = !supplierForm.country || supplierForm.country.toLowerCase() === "philippines" || supplierForm.country.toLowerCase() === "ph";

    const handleSupplierSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        if (supplierSubmitLock.current) {
            event.preventDefault();
            return;
        }

        supplierSubmitLock.current = true;
        setIsSubmittingSupplier(true);
        try {
            await onCreateSupplier(event);
        } finally {
            supplierSubmitLock.current = false;
            setIsSubmittingSupplier(false);
        }
    };

    useEffect(() => {
        if (isModalOpen && isPH) {
            loadProvinces();
        }
    }, [isModalOpen, isPH]);

    useEffect(() => {
        if (!isModalOpen) {
            setSelectedProvinceCode("");
            setSelectedCityCode("");
            setSelectedBarangayCode("");
            setProvinces([]);
            setCities([]);
            setBarangays([]);
        }
    }, [isModalOpen]);

    const loadProvinces = async () => {
        setLoadingProvinces(true);
        const list = await fetchPHProvinces();
        setProvinces(list);
        setLoadingProvinces(false);
    };

    const handleProvinceSelect = async (code: string) => {
        setSelectedProvinceCode(code);
        setSelectedCityCode("");
        setSelectedBarangayCode("");
        setCities([]);
        setBarangays([]);
        
        const matched = provinces.find(p => p.code === code);
        const name = matched ? matched.name : "";
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSupplierForm((prev: any) => ({
            ...prev,
            state_province: name,
            city: "",
            brgy: ""
        }));

        if (code) {
            setLoadingCities(true);
            const list = await fetchPHCities(code);
            setCities(list);
            setLoadingCities(false);
        }
    };

    const handleCitySelect = async (code: string) => {
        setSelectedCityCode(code);
        setSelectedBarangayCode("");
        setBarangays([]);
        
        const matched = cities.find(c => c.code === code);
        const name = matched ? matched.name : "";
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSupplierForm((prev: any) => ({
            ...prev,
            city: name,
            brgy: ""
        }));

        if (code) {
            setLoadingBarangays(true);
            const list = await fetchPHBarangays(code);
            setBarangays(list);
            setLoadingBarangays(false);
        }
    };

    const handleBarangaySelect = (code: string) => {
        setSelectedBarangayCode(code);
        
        const matched = barangays.find(b => b.code === code);
        const name = matched ? matched.name : "";
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSupplierForm((prev: any) => ({
            ...prev,
            brgy: name
        }));
    };

    // Resolve codes from names when editing
    useEffect(() => {
        if (isModalOpen && isPH && provinces.length > 0 && supplierForm.state_province && !selectedProvinceCode) {
            const matchedProv = provinces.find(p => p.name.toLowerCase() === (supplierForm.state_province || "").toLowerCase());
            if (matchedProv) {
                setSelectedProvinceCode(matchedProv.code);
                setLoadingCities(true);
                fetchPHCities(matchedProv.code).then(list => {
                    setCities(list);
                    setLoadingCities(false);
                });
            }
        }
    }, [isModalOpen, isPH, provinces, supplierForm.state_province, selectedProvinceCode]);

    useEffect(() => {
        if (isModalOpen && isPH && cities.length > 0 && supplierForm.city && !selectedCityCode) {
            const matchedCity = cities.find(c => c.name.toLowerCase() === (supplierForm.city || "").toLowerCase());
            if (matchedCity) {
                setSelectedCityCode(matchedCity.code);
                setLoadingBarangays(true);
                fetchPHBarangays(matchedCity.code).then(list => {
                    setBarangays(list);
                    setLoadingBarangays(false);
                });
            }
        }
    }, [isModalOpen, isPH, cities, supplierForm.city, selectedCityCode]);

    useEffect(() => {
        if (isModalOpen && isPH && barangays.length > 0 && supplierForm.brgy && !selectedBarangayCode) {
            const matchedBrgy = barangays.find(b => b.name.toLowerCase() === (supplierForm.brgy || "").toLowerCase());
            if (matchedBrgy) {
                setSelectedBarangayCode(matchedBrgy.code);
            }
        }
    }, [isModalOpen, isPH, barangays, supplierForm.brgy, selectedBarangayCode]);

    const [linkedProducts, setLinkedProducts] = useState<LinkedProduct[]>([]);
    const [loadingLinkedProducts, setLoadingLinkedProducts] = useState(false);

    const [isLinkingOpen, setIsLinkingOpen] = useState(false);
    const [selectedProductIdsToLink, setSelectedProductIdsToLink] = useState<string[]>([]);
    const [linkProductSearch, setLinkProductSearch] = useState("");
    const [linkedFilterSearch, setLinkedFilterSearch] = useState("");
    const [linkingLoading, setLinkingLoading] = useState(false);
    const [unlinkingLinkId, setUnlinkingLinkId] = useState<number | null>(null);

    const loadLinkedProducts = async (supplierId: number) => {
        setLoadingLinkedProducts(true);
        try {
            const data = await fetchLinkedProducts(supplierId);
            setLinkedProducts(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingLinkedProducts(false);
        }
    };

    useEffect(() => {
        if (activeSupplierId !== null) {
            loadLinkedProducts(activeSupplierId);
        } else {
            setLinkedProducts([]);
        }
        setIsLinkingOpen(false);
        setSelectedProductIdsToLink([]);
        setLinkProductSearch("");
        setLinkedFilterSearch("");
    }, [activeSupplierId]);

    const handleLinkMultipleProducts = async () => {
        if (selectedProductIdsToLink.length === 0 || activeSupplierId === null) return;
        setLinkingLoading(true);
        try {
            await Promise.all(
                selectedProductIdsToLink.map(id => linkProductToSupplier(activeSupplierId, Number(id)))
            );
            toast.success(`Successfully linked ${selectedProductIdsToLink.length} products`);
            setIsLinkingOpen(false);
            setSelectedProductIdsToLink([]);
            setLinkProductSearch("");
            await loadLinkedProducts(activeSupplierId);
        } catch (e) {
            console.error(e);
            toast.error("Failed to link one or more products");
        } finally {
            setLinkingLoading(false);
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
            {/* Left side: Directory list */}
            <div className="w-full lg:w-2/5 flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm">
                <div className="p-4 border-b space-y-3 shrink-0 bg-muted/20">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-primary" />
                            Suppliers Directory ({filteredSuppliers.length})
                        </h3>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="inline-flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm"
                        >
                            <Plus className="h-3.5 w-3.5" /> Register
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 flex-1" role="group" aria-label="Supplier status filter">
                            {(["active", "inactive", "all"] as SupplierStatusFilter[]).map(filter => {
                                const count = suppliers.filter(s =>
                                    filter === "all" || (filter === "active" ? isSupplierActive(s) : !isSupplierActive(s))
                                ).length;
                                return (
                                    <button
                                        key={filter}
                                        type="button"
                                        onClick={() => setStatusFilter(filter)}
                                        className={`rounded-md px-2 py-1 text-[10px] font-bold capitalize transition-colors ${
                                            statusFilter === filter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {filter} ({count})
                                    </button>
                                );
                            })}
                        </div>
                        <select
                            value={foreignFilter}
                            onChange={e => setForeignFilter(e.target.value as SupplierForeignFilter)}
                            className="rounded-lg border bg-background px-2 py-1 text-[10px] font-bold text-foreground outline-none focus:ring-1 focus:ring-primary h-[31px]"
                            aria-label="Filter supplier classification"
                        >
                            <option value="all">All Origins</option>
                            <option value="local">Local (PHP)</option>
                            <option value="foreign">Foreign (USD)</option>
                        </select>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search suppliers name, TIN, code..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary font-medium"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors hover:bg-muted rounded"
                                title="Clear Search"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y">
                    {filteredSuppliers.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                            No suppliers found. Click &quot;Register&quot; to add one.
                        </div>
                    ) : (
                        filteredSuppliers.map(s => {
                            const isForeign = isSupplierForeign(s);
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setSelectedSupplierId(s.id)}
                                    className={`w-full text-left p-4 hover:bg-muted/40 transition-all flex flex-col gap-1.5 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus:bg-primary/5 active:translate-y-0 ${
                                        activeSupplier?.id === s.id ? "bg-primary/5 border-l-2 border-primary" : ""
                                    } ${!isSupplierActive(s) ? "opacity-60" : ""}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="font-semibold text-xs text-foreground truncate">{s.supplier_name}</span>
                                        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                            {isSupplierNonBuy(s) && (
                                                <span className="bg-amber-500/15 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide">
                                                    Non-Buy
                                                </span>
                                            )}
                                            {!isSupplierActive(s) && (
                                                <span className="bg-red-500/15 text-red-600 border border-red-500/20 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide">
                                                    Inactive
                                                </span>
                                            )}
                                            {isForeign ? (
                                                <span className="bg-amber-500/15 text-amber-700 border border-amber-500/30 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide flex items-center gap-0.5">
                                                    <Globe className="h-2.5 w-2.5" /> FOREIGN IMPORT
                                                </span>
                                            ) : (
                                                <span className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide flex items-center gap-0.5">
                                                    <Building2 className="h-2.5 w-2.5" /> LOCAL
                                                </span>
                                            )}
                                            {s.supplier_shortcut && (
                                                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                    {s.supplier_shortcut}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                        <span className="truncate flex items-center gap-1">
                                            <MapPin className="h-3 w-3 shrink-0" />
                                            {s.city || "No Address"}, {s.country}
                                        </span>
                                        {s.tin_number && (
                                            <span className="font-mono text-[9px] bg-muted px-1 rounded">TIN: {s.tin_number}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right side: Detailed Supplier Profile */}
            <div className="flex-1 border rounded-xl bg-card overflow-y-auto p-6 shadow-sm flex flex-col gap-6">
                {activeSupplier ? (
                    <>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-6">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
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
                                                <Globe className="h-3 w-3" /> Foreign Import ({activeSupplier.default_currency || "USD"})
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
                                            onClick={() => onToggleSupplierActive?.(activeSupplier)}
                                            className={`text-[10px] font-bold border px-2 py-1 rounded transition-all cursor-pointer ${
                                                !isSupplierActive(activeSupplier)
                                                    ? "text-emerald-600 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:underline"
                                                    : "text-red-600 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:underline"
                                            }`}
                                        >
                                            {!isSupplierActive(activeSupplier) ? "Activate" : "Deactivate"}
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
                                                (!activeSupplier.country || activeSupplier.country.toLowerCase() === "philippines" || activeSupplier.country.toLowerCase() === "ph")
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

                        {/* Associated Products Section */}
                        <div className="space-y-4 pt-5 border-t">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-xs">
                                        <Link className="h-4 w-4" />
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

                                {!isLinkingOpen && (
                                    <button
                                        onClick={() => setIsLinkingOpen(true)}
                                        className="text-xs text-primary-foreground font-bold bg-primary hover:bg-primary/95 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 self-start sm:self-auto"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Link Raw Material / Product
                                    </button>
                                )}
                            </div>

                            {/* Linking Drawer / Panel */}
                            <AnimatePresence>
                                {isLinkingOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, y: -10 }}
                                        animate={{ opacity: 1, height: "auto", y: 0 }}
                                        exit={{ opacity: 0, height: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="bg-muted/20 p-4 rounded-2xl border border-primary/20 w-full space-y-3.5 shadow-xs overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between border-b pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <Globe className="h-4 w-4 text-primary shrink-0" />
                                                <span className="text-xs font-extrabold text-foreground">
                                                    Select Catalog Items to Associate
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {selectedProductIdsToLink.length > 0 && (
                                                    <span className="text-[10px] bg-primary text-primary-foreground font-bold px-2.5 py-0.5 rounded-full shadow-xs">
                                                        {selectedProductIdsToLink.length} Selected
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setIsLinkingOpen(false);
                                                        setSelectedProductIdsToLink([]);
                                                        setLinkProductSearch("");
                                                    }}
                                                    className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg hover:bg-muted transition-all"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {/* Search Bar and Quick Select Actions */}
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <div className="relative flex-1">
                                                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                                                <input
                                                    type="text"
                                                    placeholder="Search unlinked raw materials by code or name..."
                                                    value={linkProductSearch}
                                                    onChange={e => setLinkProductSearch(e.target.value)}
                                                    className="w-full rounded-xl border bg-background pl-9 pr-8 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                />
                                                {linkProductSearch && (
                                                    <button
                                                        onClick={() => setLinkProductSearch("")}
                                                        className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Quick Select All / Deselect buttons */}
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {(() => {
                                                    const availableRM = rawMaterials.filter(rm => {
                                                        const isLinked = linkedProducts.some(lp => {
                                                            const lpProdId = typeof lp.product_id === "object" ? (lp.product_id as Record<string, unknown>)?.product_id || (lp.product_id as Record<string, unknown>)?.id : lp.product_id;
                                                            return Number(lpProdId) === Number(rm.product_id);
                                                        });
                                                        if (isLinked) return false;
                                                        const query = linkProductSearch.toLowerCase().trim();
                                                        if (!query) return true;
                                                        return rm.product_name.toLowerCase().includes(query) || (rm.product_code && rm.product_code.toLowerCase().includes(query));
                                                    });
                                                    
                                                    const allSelected = availableRM.length > 0 && availableRM.every(rm => selectedProductIdsToLink.includes(String(rm.product_id)));

                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (allSelected) {
                                                                    const availIds = new Set(availableRM.map(rm => String(rm.product_id)));
                                                                    setSelectedProductIdsToLink(prev => prev.filter(id => !availIds.has(id)));
                                                                } else {
                                                                    const availIds = availableRM.map(rm => String(rm.product_id));
                                                                    setSelectedProductIdsToLink(prev => Array.from(new Set([...prev, ...availIds])));
                                                                }
                                                            }}
                                                            disabled={availableRM.length === 0}
                                                            className="text-[10px] font-bold text-muted-foreground hover:text-foreground border px-2.5 py-1.5 rounded-xl bg-background hover:bg-muted/50 disabled:opacity-50 transition-all cursor-pointer"
                                                        >
                                                            {allSelected ? "Deselect All" : "Select All Unlinked"}
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Available Products Grid List */}
                                        <div className="border rounded-xl bg-background p-2 max-h-[220px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                            {(() => {
                                                const available = rawMaterials.filter(rm => {
                                                    const isLinked = linkedProducts.some(lp => {
                                                        const lpProdId = typeof lp.product_id === "object" ? (lp.product_id as Record<string, unknown>)?.product_id || (lp.product_id as Record<string, unknown>)?.id : lp.product_id;
                                                        return Number(lpProdId) === Number(rm.product_id);
                                                    });
                                                    if (isLinked) return false;
                                                    const query = linkProductSearch.toLowerCase().trim();
                                                    if (!query) return true;
                                                    return rm.product_name.toLowerCase().includes(query) || (rm.product_code && rm.product_code.toLowerCase().includes(query));
                                                });

                                                if (available.length === 0) {
                                                    return (
                                                        <div className="col-span-2 text-center py-6 text-xs text-muted-foreground italic flex flex-col items-center justify-center gap-1">
                                                            <AlertCircle className="h-4 w-4 text-muted-foreground/40" />
                                                            <span>No unlinked raw materials match your search</span>
                                                        </div>
                                                    );
                                                }

                                                return available.map(rm => {
                                                    const isChecked = selectedProductIdsToLink.includes(String(rm.product_id));
                                                    const uomName = rm.unit_of_measurement?.unit_shortcut || rm.unit_of_measurement?.unit_name;
                                                    return (
                                                        <div
                                                            key={rm.product_id}
                                                            onClick={() => {
                                                                const valStr = String(rm.product_id);
                                                                if (isChecked) {
                                                                    setSelectedProductIdsToLink(prev => prev.filter(id => id !== valStr));
                                                                } else {
                                                                    setSelectedProductIdsToLink(prev => [...prev, valStr]);
                                                                }
                                                            }}
                                                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                                                                isChecked
                                                                    ? "border-primary bg-primary/5 shadow-xs"
                                                                    : "border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/30"
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => {}} // Handled by container click
                                                                    className="rounded text-primary focus:ring-0 h-4 w-4 shrink-0"
                                                                />
                                                                <div className="min-w-0 space-y-0.5">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        {rm.product_code && (
                                                                            <span className="font-mono text-[9px] font-bold bg-muted px-1.5 py-0.5 rounded text-foreground border shrink-0">
                                                                                {rm.product_code}
                                                                            </span>
                                                                        )}
                                                                        <span className="text-xs font-bold text-foreground truncate">
                                                                            {rm.product_name}
                                                                        </span>
                                                                    </div>
                                                                    {uomName && (
                                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                            <span className="bg-primary/5 text-primary px-1.5 rounded font-semibold border border-primary/10">
                                                                                {uomName}
                                                                            </span>
                                                                            {rm.cost_per_unit > 0 && (
                                                                                <span className="font-mono text-[10px]">
                                                                                    ₱{Number(rm.cost_per_unit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                        
                                        {/* Footer Action Bar */}
                                        <div className="flex items-center justify-between pt-1 border-t">
                                            <span className="text-[11px] font-medium text-muted-foreground">
                                                {selectedProductIdsToLink.length} material(s) selected
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setIsLinkingOpen(false);
                                                        setSelectedProductIdsToLink([]);
                                                        setLinkProductSearch("");
                                                    }}
                                                    className="text-muted-foreground hover:text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-muted transition-all"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleLinkMultipleProducts}
                                                    disabled={selectedProductIdsToLink.length === 0 || linkingLoading}
                                                    className="bg-primary text-primary-foreground px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-primary/95 disabled:opacity-50 transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                                                >
                                                    {linkingLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Linking...</> : `Link Selected Items (${selectedProductIdsToLink.length})`}
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Filter search bar for Linked Products if list is larger than 3 items */}
                            {linkedProducts.length > 3 && (
                                <div className="relative">
                                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Filter linked raw materials..."
                                        value={linkedFilterSearch}
                                        onChange={e => setLinkedFilterSearch(e.target.value)}
                                        className="w-full rounded-xl border bg-background pl-9 pr-8 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                    />
                                    {linkedFilterSearch && (
                                        <button
                                            onClick={() => setLinkedFilterSearch("")}
                                            className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Linked Products Cards Display Grid */}
                            {loadingLinkedProducts ? (
                                <div className="text-center text-xs text-muted-foreground py-6 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    <span>Loading associated products...</span>
                                </div>
                            ) : linkedProducts.length === 0 ? (
                                <div className="text-center p-8 border border-dashed rounded-2xl bg-muted/5 flex flex-col items-center justify-center gap-2">
                                    <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                                        <Link className="h-6 w-6" />
                                    </div>
                                    <h5 className="text-xs font-bold text-foreground">No Raw Materials Linked</h5>
                                    <p className="text-[11px] text-muted-foreground max-w-sm">
                                        Associate raw materials or catalog items to this vendor to streamline purchase orders and landed cost allocation.
                                    </p>
                                    {!isLinkingOpen && (
                                        <button
                                            onClick={() => setIsLinkingOpen(true)}
                                            className="mt-2 text-xs text-primary-foreground font-bold bg-primary hover:bg-primary/95 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Associate First Product
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {linkedProducts.filter(lp => {
                                        if (!linkedFilterSearch.trim()) return true;
                                        const q = linkedFilterSearch.toLowerCase().trim();
                                        const code = lp.product_id?.product_code || "";
                                        const name = lp.product_id?.product_name || "";
                                        return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
                                    }).map((lp: LinkedProduct) => {
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

            <AnimatePresence>
                {isModalOpen && (
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
                            className="bg-card text-foreground w-full max-w-lg border rounded-xl shadow-lg p-6 space-y-4"
                        >
                            <div className="flex items-center justify-between border-b pb-3">
                                <h3 className="font-bold text-sm flex items-center gap-2">
                                    <Building2 className="h-4.5 w-4.5 text-primary" />
                                    {isEditingSupplier ? "Edit Vendor / Supplier Profile" : "Register Vendor / Supplier"}
                                </h3>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-muted-foreground hover:text-foreground text-xs font-bold"
                                >
                                    Close
                                </button>
                            </div>

                            {supplierError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                                    <span>{supplierError}</span>
                                </div>
                            )}

                            <form onSubmit={handleSupplierSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Supplier Corporate Name <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Nabati Foods Philippines Inc."
                                            value={supplierForm.supplier_name}
                                            onChange={e => setSupplierForm({...supplierForm, supplier_name: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Supplier Code / Shortcut <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. NFPI"
                                            value={supplierForm.supplier_shortcut}
                                            onChange={e => setSupplierForm({...supplierForm, supplier_shortcut: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Tax Identifier (TIN Number)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 009-003-737-000"
                                            value={supplierForm.tin_number}
                                            onChange={e => setSupplierForm({...supplierForm, tin_number: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    {/* Representatives List (One-to-Many) */}
                                    <div className="col-span-2 border-t pt-4 mt-2 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                                                <UserSquare2 className="h-4 w-4" /> Representatives ({(supplierForm.representatives || []).length})
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const reps = [...(supplierForm.representatives || [])];
                                                    reps.push({ first_name: "", last_name: "", middle_name: "", suffix: "", email: "", contact_number: "" });
                                                    setSupplierForm({ ...supplierForm, representatives: reps });
                                                }}
                                                className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline border border-dashed border-primary/40 px-2.5 py-1 rounded bg-primary/5 hover:bg-primary/10 transition-all cursor-pointer"
                                            >
                                                <Plus className="h-3 w-3" /> Add Representative
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                                            {(supplierForm.representatives || []).map((rep, idx) => (
                                                <div key={idx} className="bg-muted/30 border rounded-lg p-3 relative space-y-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const reps = (supplierForm.representatives || []).filter((_, i) => i !== idx);
                                                            setSupplierForm({ ...supplierForm, representatives: reps });
                                                        }}
                                                        className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                    
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-muted-foreground uppercase">First Name <span className="text-red-500">*</span></label>
                                                            <input
                                                                type="text"
                                                                required
                                                                placeholder="First Name"
                                                                value={rep.first_name || ""}
                                                                onChange={e => {
                                                                    const reps = [...(supplierForm.representatives || [])];
                                                                    reps[idx] = { ...reps[idx], first_name: e.target.value };
                                                                    setSupplierForm({ ...supplierForm, representatives: reps });
                                                                }}
                                                                className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Last Name <span className="text-red-500">*</span></label>
                                                            <input
                                                                type="text"
                                                                required
                                                                placeholder="Last Name"
                                                                value={rep.last_name || ""}
                                                                onChange={e => {
                                                                    const reps = [...(supplierForm.representatives || [])];
                                                                    reps[idx] = { ...reps[idx], last_name: e.target.value };
                                                                    setSupplierForm({ ...supplierForm, representatives: reps });
                                                                }}
                                                                className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Middle Name</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Middle Name"
                                                                value={rep.middle_name || ""}
                                                                onChange={e => {
                                                                    const reps = [...(supplierForm.representatives || [])];
                                                                    reps[idx] = { ...reps[idx], middle_name: e.target.value };
                                                                    setSupplierForm({ ...supplierForm, representatives: reps });
                                                                }}
                                                                className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Suffix</label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. Jr., III"
                                                                value={rep.suffix || ""}
                                                                onChange={e => {
                                                                    const reps = [...(supplierForm.representatives || [])];
                                                                    reps[idx] = { ...reps[idx], suffix: e.target.value };
                                                                    setSupplierForm({ ...supplierForm, representatives: reps });
                                                                }}
                                                                className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Email (Required if no phone) <span className="text-red-500">*</span></label>
                                                            <input
                                                                type="email"
                                                                placeholder="e.g. email@company.com"
                                                                value={rep.email || ""}
                                                                onChange={e => {
                                                                    const reps = [...(supplierForm.representatives || [])];
                                                                    reps[idx] = { ...reps[idx], email: e.target.value };
                                                                    setSupplierForm({ ...supplierForm, representatives: reps });
                                                                }}
                                                                className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Contact Number (Required if no email) <span className="text-red-500">*</span></label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. 09171234567"
                                                                value={rep.contact_number || ""}
                                                                onChange={e => {
                                                                    const reps = [...(supplierForm.representatives || [])];
                                                                    reps[idx] = { ...reps[idx], contact_number: e.target.value };
                                                                    setSupplierForm({ ...supplierForm, representatives: reps });
                                                                }}
                                                                className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {(supplierForm.representatives || []).length === 0 && (
                                                <div className="text-center py-4 border border-dashed rounded-lg bg-muted/10">
                                                    <span className="text-xs text-muted-foreground italic">No representatives added yet.</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Phone Number</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 0917-123-4567"
                                            value={supplierForm.phone_number}
                                            onChange={e => setSupplierForm({...supplierForm, phone_number: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Email Address</label>
                                        <input
                                            type="email"
                                            placeholder="e.g. caezar@nabati.com"
                                            value={supplierForm.email_address}
                                            onChange={e => setSupplierForm({...supplierForm, email_address: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Business Street Address <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. San Nicolas, City of Tarlac"
                                            value={supplierForm.address}
                                            onChange={e => setSupplierForm({...supplierForm, address: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="space-y-1.5 col-span-2">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Country</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Philippines"
                                            value={supplierForm.country}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const isNonPH = Boolean(val.trim()) && val.trim().toLowerCase() !== "philippines" && val.trim().toLowerCase() !== "ph";
                                                setSupplierForm(prev => ({
                                                    ...prev,
                                                    country: val,
                                                    state_province: isNonPH ? prev.state_province : "",
                                                    city: isNonPH ? prev.city : "",
                                                    brgy: isNonPH ? prev.brgy : "",
                                                    is_foreign: isNonPH ? 1 : prev.is_foreign,
                                                    default_currency: isNonPH ? "USD" : prev.default_currency,
                                                    currency: isNonPH ? "USD" : prev.currency
                                                }));
                                                if (isNonPH) {
                                                    setSelectedProvinceCode("");
                                                    setSelectedCityCode("");
                                                    setSelectedBarangayCode("");
                                                }
                                            }}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    {/* Supplier Classification & Currency */}
                                    <div className="col-span-2 p-3 rounded-xl border bg-muted/20 space-y-2.5">
                                        <label className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Globe className="h-3.5 w-3.5 text-primary" /> Supplier Classification & Operating Currency
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-semibold text-muted-foreground">Classification</label>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSupplierForm(prev => ({
                                                            ...prev,
                                                            is_foreign: 0,
                                                            default_currency: "PHP",
                                                            currency: "PHP"
                                                        }))}
                                                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                                            Number(supplierForm.is_foreign) === 0
                                                                ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 shadow-sm"
                                                                : "bg-background text-muted-foreground border-input hover:text-foreground"
                                                        }`}
                                                    >
                                                        <Building2 className="h-3 w-3" /> Local (PHP)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSupplierForm(prev => ({
                                                            ...prev,
                                                            is_foreign: 1,
                                                            default_currency: "USD",
                                                            currency: "USD"
                                                        }))}
                                                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                                            Number(supplierForm.is_foreign) === 1
                                                                ? "bg-amber-500/15 text-amber-700 border-amber-500/40 shadow-sm"
                                                                : "bg-background text-muted-foreground border-input hover:text-foreground"
                                                        }`}
                                                    >
                                                        <Globe className="h-3 w-3" /> Foreign Import (USD)
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-semibold text-muted-foreground">Default Currency</label>
                                                <select
                                                    value={supplierForm.default_currency || supplierForm.currency || "PHP"}
                                                    onChange={e => {
                                                        const curr = e.target.value;
                                                        const isFor = curr === "USD" ? 1 : 0;
                                                        setSupplierForm(prev => ({
                                                            ...prev,
                                                            default_currency: curr,
                                                            currency: curr,
                                                            is_foreign: isFor
                                                        }));
                                                    }}
                                                    className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-primary text-foreground h-[31px]"
                                                >
                                                    <option value="PHP">PHP (Philippine Peso)</option>
                                                    <option value="USD">USD (US Dollar)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence mode="wait">
                                        {isPH ? (
                                            <motion.div
                                                key="ph-fields"
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className="col-span-2 grid grid-cols-2 gap-4"
                                            >
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-muted-foreground">
                                                        Province {loadingProvinces && "(Loading...)"}
                                                    </label>
                                                    <CreatableSelect
                                                        options={provinces.map(p => ({ value: p.code, label: p.name }))}
                                                        value={selectedProvinceCode}
                                                        onValueChange={handleProvinceSelect}
                                                        placeholder="Select Province..."
                                                        className="text-xs font-semibold"
                                                    />
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-muted-foreground">
                                                        City / Municipality {loadingCities && "(Loading...)"}
                                                    </label>
                                                    <CreatableSelect
                                                        options={cities.map(c => ({ value: c.code, label: c.name }))}
                                                        value={selectedCityCode}
                                                        onValueChange={handleCitySelect}
                                                        placeholder="Select City..."
                                                        disabled={!selectedProvinceCode}
                                                        className="text-xs font-semibold"
                                                    />
                                                </div>

                                                <div className="space-y-1.5 col-span-2">
                                                    <label className="text-[11px] font-semibold text-muted-foreground">
                                                        Barangay {loadingBarangays && "(Loading...)"}
                                                    </label>
                                                    <CreatableSelect
                                                        options={barangays.map(b => ({ value: b.code, label: b.name }))}
                                                        value={selectedBarangayCode}
                                                        onValueChange={handleBarangaySelect}
                                                        placeholder="Select Barangay..."
                                                        disabled={!selectedCityCode}
                                                        className="text-xs font-semibold"
                                                    />
                                                </div>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="intl-fields"
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className="col-span-2 grid grid-cols-2 gap-4"
                                            >
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-muted-foreground">State / Province</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. California"
                                                        value={supplierForm.state_province}
                                                        onChange={e => setSupplierForm({...supplierForm, state_province: e.target.value})}
                                                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                    />
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-muted-foreground">City</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Los Angeles"
                                                        value={supplierForm.city}
                                                        onChange={e => setSupplierForm({...supplierForm, city: e.target.value})}
                                                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Payment Terms <span className="text-red-500">*</span></label>
                                        <select
                                            required
                                            value={supplierForm.payment_terms}
                                            onChange={e => setSupplierForm({...supplierForm, payment_terms: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold font-medium"
                                        >
                                            <option value="">-- Select Payment Terms --</option>
                                            <option value="Cash On Delivery">Cash On Delivery</option>
                                            <option value="Net 15 Days">Net 15 Days</option>
                                            <option value="Net 30 Days">Net 30 Days</option>
                                            <option value="Net 60 Days">Net 60 Days</option>
                                            <option value="Letter of Credit">Letter of Credit</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Delivery Terms <span className="text-red-500">*</span></label>
                                        <select
                                            required
                                            value={supplierForm.delivery_terms}
                                            onChange={e => setSupplierForm({...supplierForm, delivery_terms: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold font-medium"
                                        >
                                            <option value="">-- Select Delivery Terms --</option>
                                            <option value="Delivery">Local Delivery</option>
                                            <option value="FOB (Free on Board)">FOB (Free on Board)</option>
                                            <option value="EXW (Ex Works)">EXW (Ex Works)</option>
                                            <option value="CIF (Cost, Insurance & Freight)">CIF (Cost, Insurance & Freight)</option>
                                            <option value="DDP (Delivered Duty Paid)">DDP (Delivered Duty Paid)</option>
                                            <option value="FOB / Delivery">FOB / Delivery</option>
                                        </select>
                                    </div>

                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Vendor Agreements / Notes</label>
                                        <textarea
                                            placeholder="e.g. Any standard notes or terms of contracts..."
                                            value={supplierForm.notes_or_comments}
                                            onChange={e => setSupplierForm({...supplierForm, notes_or_comments: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium min-h-[60px]"
                                        />
                                    </div>

                                    <div className="col-span-2 mt-2 p-3 rounded-xl border bg-muted/20 flex flex-col gap-2">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={supplierForm.nonBuy === true || supplierForm.nonBuy === 1}
                                                onChange={e => setSupplierForm({...supplierForm, nonBuy: e.target.checked})}
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                            <span className="text-xs font-bold text-foreground">Mark as Non-Buy Supplier</span>
                                        </label>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed pl-6">
                                            <strong>Legend:</strong> If this is ticked, the supplier is marked as <em>Non-Buy</em>. 
                                            This means you cannot create or process purchase orders for them. They are retained 
                                            in the system purely for reference, historical data, or non-procurement purposes.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmittingSupplier}
                                    aria-busy={isSubmittingSupplier}
                                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-sm cursor-pointer animate-none disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmittingSupplier ? "Saving..." : isEditingSupplier ? "Save Changes" : "Complete Registration"}
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
