import React, { useState, useEffect, useRef } from "react";
import { SupplierFormState, PSGCItem } from "../types";
import { Building2, AlertCircle, UserSquare2, Plus, Trash2, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchPHProvinces, fetchPHCities, fetchPHBarangays } from "../services/supplier.service";
import { SUPPLIER_COUNTRY_OPTIONS, isPhilippinesCountry } from "../supplier-country";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";
import { SearchableCountrySelect } from "@/app/(manufacturing-management)/mm/suppliers/_components/SearchableCountrySelect";

export interface SupplierFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplierForm: SupplierFormState;
    setSupplierForm: React.Dispatch<React.SetStateAction<SupplierFormState>>;
    supplierError?: string | null;
    isEditingSupplier?: boolean;
    onCreateSupplier: (e: React.FormEvent) => void;
}

export default function SupplierFormModal({
    isOpen,
    onClose,
    supplierForm,
    setSupplierForm,
    supplierError,
    isEditingSupplier = false,
    onCreateSupplier
}: SupplierFormModalProps) {
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

    const isPH = isPhilippinesCountry(supplierForm.country);

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

    const loadProvinces = async () => {
        setLoadingProvinces(true);
        const list = await fetchPHProvinces();
        setProvinces(list);
        setLoadingProvinces(false);
    };

    const handleCountrySelect = (country: string) => {
        const nextIsPH = isPhilippinesCountry(country);

        setSelectedProvinceCode("");
        setSelectedCityCode("");
        setSelectedBarangayCode("");
        setCities([]);
        setBarangays([]);

        setSupplierForm(prev => {
            const previousIsPH = isPhilippinesCountry(prev.country);
            return {
                ...prev,
                country,
                state_province: nextIsPH || previousIsPH ? "" : prev.state_province,
                city: nextIsPH || previousIsPH ? "" : prev.city,
                brgy: "",
                is_foreign: nextIsPH ? 0 : 1,
                default_currency: nextIsPH ? "PHP" : "USD",
                currency: nextIsPH ? "PHP" : "USD"
            };
        });
    };

    useEffect(() => {
        if (isOpen && isPH) {
            loadProvinces();
        }
    }, [isOpen, isPH]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedProvinceCode("");
            setSelectedCityCode("");
            setSelectedBarangayCode("");
            setProvinces([]);
            setCities([]);
            setBarangays([]);
        }
    }, [isOpen]);

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
        if (isOpen && isPH && provinces.length > 0 && supplierForm.state_province && !selectedProvinceCode) {
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
    }, [isOpen, isPH, provinces, supplierForm.state_province, selectedProvinceCode]);

    useEffect(() => {
        if (isOpen && isPH && cities.length > 0 && supplierForm.city && !selectedCityCode) {
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
    }, [isOpen, isPH, cities, supplierForm.city, selectedCityCode]);

    useEffect(() => {
        if (isOpen && isPH && barangays.length > 0 && supplierForm.brgy && !selectedBarangayCode) {
            const matchedBrgy = barangays.find(b => b.name.toLowerCase() === (supplierForm.brgy || "").toLowerCase());
            if (matchedBrgy) {
                setSelectedBarangayCode(matchedBrgy.code);
            }
        }
    }, [isOpen, isPH, barangays, supplierForm.brgy, selectedBarangayCode]);

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
                        className="bg-card text-foreground w-full max-w-lg border rounded-xl shadow-lg p-6 space-y-4"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-bold text-sm flex items-center gap-2">
                                <Building2 className="h-4.5 w-4.5 text-primary" />
                                {isEditingSupplier ? "Edit Vendor / Supplier Profile" : "Register Vendor / Supplier"}
                            </h3>
                            <button
                                onClick={onClose}
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
                                                    className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
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
                                    <label htmlFor="supplier-country" className="text-[11px] font-semibold text-muted-foreground">Country <span className="text-red-500">*</span></label>
                                    <SearchableCountrySelect
                                        id="supplier-country"
                                        options={SUPPLIER_COUNTRY_OPTIONS.map(country => ({
                                            value: country.name,
                                            label: country.name,
                                        }))}
                                        value={supplierForm.country}
                                        onValueChange={handleCountrySelect}
                                        placeholder="-- Select Country --"
                                        searchPlaceholder="Search countries..."
                                        required
                                        className="rounded-lg px-3 py-2 text-xs font-medium"
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
    );
}
