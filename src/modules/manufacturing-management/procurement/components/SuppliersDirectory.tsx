import React, { useState, useEffect, useRef } from "react";
import { Supplier, RawMaterial, PSGCItem } from "../types";
import { Search, Plus, MapPin, Phone, Mail, Award, FileText, CheckCircle2, AlertCircle, Globe, Building2, UserSquare2, Trash2, Link, X, Loader2 } from "lucide-react";
import { fetchLinkedProducts, linkProductToSupplier, unlinkProductFromSupplier, fetchPHProvinces, fetchPHCities, fetchPHBarangays } from "../services/procurement-api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";

interface SupplierFormState {
    supplier_name: string;
    supplier_shortcut: string;
    tin_number: string;
    phone_number: string;
    email_address: string;
    address: string;
    city: string;
    brgy: string;
    state_province: string;
    country: string;
    postal_code: string;
    payment_terms: string;
    delivery_terms: string;
    currency: string;
    notes_or_comments: string;
    nonBuy: boolean | number;
    representatives: import("../types").SupplierRepresentative[];
}

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

const isSupplierActive = (supplier: Supplier): boolean => Number(supplier.isActive) !== 0;
const isSupplierNonBuy = (supplier: Supplier): boolean => supplier.nonBuy === true || Number(supplier.nonBuy) === 1;

const getCurrencyFromNotes = (notes: string | null | undefined): string => {
    if (!notes) return "PHP";
    const match = notes.match(/\[Currency:\s*(\w+)\]/);
    return match ? match[1] : "PHP";
};

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

    const filteredSuppliers = React.useMemo(() => {
        const normalizedSearch = search.toLowerCase();
        return suppliers.filter(s => {
            const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isSupplierActive(s) : !isSupplierActive(s));
            if (!matchesStatus) return false;

            return s.supplier_name.toLowerCase().includes(normalizedSearch) ||
                s.supplier_shortcut?.toLowerCase().includes(normalizedSearch) ||
                s.tin_number?.includes(search);
        });
    }, [suppliers, search, statusFilter]);

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
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Supplier status filter">
                        {(["active", "inactive", "all"] as SupplierStatusFilter[]).map(filter => {
                            const count = suppliers.filter(s =>
                                filter === "all" || (filter === "active" ? isSupplierActive(s) : !isSupplierActive(s))
                            ).length;
                            return (
                                <button
                                    key={filter}
                                    type="button"
                                    onClick={() => setStatusFilter(filter)}
                                    className={`rounded-md px-2 py-1.5 text-[10px] font-bold capitalize transition-colors ${
                                        statusFilter === filter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {filter} ({count})
                                </button>
                            );
                        })}
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
                        filteredSuppliers.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSelectedSupplierId(s.id)}
                                className={`w-full text-left p-4 hover:bg-muted/40 transition-all flex flex-col gap-1.5 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus:bg-primary/5 active:translate-y-0 ${
                                    activeSupplier?.id === s.id ? "bg-primary/5 border-l-2 border-primary" : ""
                                } ${!isSupplierActive(s) ? "opacity-60" : ""}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold text-xs text-foreground truncate">{s.supplier_name}</span>
                                    <div className="flex items-center gap-1 shrink-0">
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
                        ))
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
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Preferred Currency</span>
                                    <p className="text-xs font-semibold text-foreground">{getCurrencyFromNotes(activeSupplier.notes_or_comments)}</p>
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
                        <div className="space-y-4 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2 border-l-4 border-primary pl-2.5">
                                    <Link className="h-4 w-4 text-primary shrink-0" />
                                    Associated Raw Materials & Products
                                </h4>
                                {!isLinkingOpen && (
                                    <button
                                        onClick={() => setIsLinkingOpen(true)}
                                        className="text-[10px] text-primary hover:underline font-bold border border-primary/20 px-2 py-1 rounded bg-primary/5 hover:bg-primary/10 transition-all cursor-pointer flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" /> Link Product
                                    </button>
                                )}
                            </div>

                            {isLinkingOpen && (
                                <div className="bg-muted/20 p-3 rounded-lg border w-full space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-foreground">Select Products to Link</span>
                                        {selectedProductIdsToLink.length > 0 && (
                                            <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                                                {selectedProductIdsToLink.length} selected
                                            </span>
                                        )}
                                    </div>
                                    
                                    <input
                                        type="text"
                                        placeholder="Search products to link..."
                                        value={linkProductSearch}
                                        onChange={e => setLinkProductSearch(e.target.value)}
                                        className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                    />
                                    
                                    <div className="border rounded-lg bg-background p-2.5 max-h-[160px] overflow-y-auto divide-y divide-muted/30">
                                        {rawMaterials.filter(rm => {
                                            // Filter out already linked products
                                            const isLinked = linkedProducts.some(lp => {
                                                const lpProdId = typeof lp.product_id === "object" ? (lp.product_id as Record<string, unknown>)?.product_id || (lp.product_id as Record<string, unknown>)?.id : lp.product_id;
                                                return Number(lpProdId) === Number(rm.product_id);
                                            });
                                            if (isLinked) return false;
                                            
                                            // Filter by search query
                                            const query = linkProductSearch.toLowerCase().trim();
                                            if (!query) return true;
                                            return rm.product_name.toLowerCase().includes(query) || (rm.product_code && rm.product_code.toLowerCase().includes(query));
                                        }).length === 0 ? (
                                            <div className="text-center py-4 text-xs text-muted-foreground italic">No products available to link</div>
                                        ) : (
                                            rawMaterials.filter(rm => {
                                                const isLinked = linkedProducts.some(lp => {
                                                    const lpProdId = typeof lp.product_id === "object" ? (lp.product_id as Record<string, unknown>)?.product_id || (lp.product_id as Record<string, unknown>)?.id : lp.product_id;
                                                    return Number(lpProdId) === Number(rm.product_id);
                                                });
                                                if (isLinked) return false;
                                                
                                                const query = linkProductSearch.toLowerCase().trim();
                                                if (!query) return true;
                                                return rm.product_name.toLowerCase().includes(query) || (rm.product_code && rm.product_code.toLowerCase().includes(query));
                                            }).map(rm => {
                                                const isChecked = selectedProductIdsToLink.includes(String(rm.product_id));
                                                return (
                                                    <label 
                                                        key={rm.product_id}
                                                        className="flex items-center gap-2 py-1.5 hover:bg-muted/10 cursor-pointer select-none text-xs font-semibold text-foreground px-2"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                const valStr = String(rm.product_id);
                                                                if (isChecked) {
                                                                    setSelectedProductIdsToLink(prev => prev.filter(id => id !== valStr));
                                                                } else {
                                                                    setSelectedProductIdsToLink(prev => [...prev, valStr]);
                                                                }
                                                            }}
                                                            className="rounded text-primary focus:ring-0 h-3.5 w-3.5"
                                                        />
                                                        <span>
                                                            {rm.product_code ? `[${rm.product_code}] ` : ""}{rm.product_name}
                                                            {rm.unit_of_measurement?.unit_name && (
                                                                <span className="text-[10px] text-muted-foreground font-normal ml-1 italic">
                                                                    ({rm.unit_of_measurement.unit_name})
                                                                </span>
                                                            )}
                                                        </span>
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>
                                    
                                    <div className="flex justify-end gap-2 pt-1">
                                        <button
                                            onClick={() => {
                                                setIsLinkingOpen(false);
                                                setSelectedProductIdsToLink([]);
                                                setLinkProductSearch("");
                                            }}
                                            className="text-muted-foreground hover:text-foreground text-xs font-semibold px-3 py-1.5"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleLinkMultipleProducts}
                                            disabled={selectedProductIdsToLink.length === 0 || linkingLoading}
                                            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/95 disabled:opacity-50 transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5"
                                        >
                                            {linkingLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Linking...</> : `Link Selected (${selectedProductIdsToLink.length})`}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {loadingLinkedProducts ? (
                                <div className="text-center text-xs text-muted-foreground py-4">
                                    Loading associated products...
                                </div>
                            ) : linkedProducts.length === 0 ? (
                                <div className="text-center text-xs text-muted-foreground/60 py-6 border border-dashed rounded-xl bg-muted/5">
                                    No raw materials linked to this supplier. Click &quot;+ Link Product&quot; to associate one.
                                </div>
                            ) : (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {linkedProducts.map((lp: LinkedProduct) => (
                                        <div key={lp.id} className="border rounded-xl p-3 flex items-center justify-between bg-muted/10">
                                            <div className="space-y-1 min-w-0 pr-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-mono text-[9px] text-muted-foreground bg-muted border px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                                        {lp.product_id?.product_code || "N/A"}
                                                    </span>
                                                    <span className="text-xs font-bold text-foreground truncate block">
                                                        {lp.product_id?.product_name || "Unknown Product"}
                                                        {lp.product_id?.unit_of_measurement?.unit_name && (
                                                            <span className="text-[10px] text-muted-foreground font-normal ml-1 italic">
                                                                ({lp.product_id.unit_of_measurement.unit_name})
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    {lp.product_id?.description || "No description"}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleUnlinkProduct(lp.id)}
                                                disabled={unlinkingLinkId === lp.id}
                                                className="text-muted-foreground hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
                                                title="Unlink Product"
                                            >
                                                {unlinkingLinkId === lp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    ))}
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
                                                setSupplierForm({...supplierForm, country: val, state_province: "", city: "", brgy: ""});
                                                setSelectedProvinceCode("");
                                                setSelectedCityCode("");
                                                setSelectedBarangayCode("");
                                            }}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
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

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Preferred Currency</label>
                                        <select
                                            value={supplierForm.currency}
                                            onChange={e => setSupplierForm({...supplierForm, currency: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold"
                                        >
                                            <option value="PHP">PHP (Philippine Peso)</option>
                                            <option value="USD">USD (US Dollar)</option>
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
