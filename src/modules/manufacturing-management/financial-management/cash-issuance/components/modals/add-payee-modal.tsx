"use client";

import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, AlertCircle, UserSquare2, Plus, Trash2, Globe, UserPlus, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchActiveSupplierCurrencies, fetchPHProvinces, fetchPHCities, fetchPHBarangays } from "@/modules/manufacturing-management/procurement/services/supplier.service";
import { SUPPLIER_COUNTRY_OPTIONS, isPhilippinesCountry, PHILIPPINES_COUNTRY } from "@/modules/manufacturing-management/procurement/supplier-country";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";
import { SearchableCountrySelect } from "@/app/(manufacturing-management)/mm/suppliers/_components/SearchableCountrySelect";
import { PURCHASE_ORDER_DELIVERY_TERMS } from "@/modules/manufacturing-management/purchase-order/commercial-terms";
import { createSupplier } from "@/modules/manufacturing-management/procurement/services/procurement-api";
import { disbursementProvider } from "../../providers/fetchProvider";
import { SupplierCurrencyOption, SupplierFormState, PSGCItem, SupplierRepresentative } from "@/modules/manufacturing-management/procurement/types";
import { SupplierDto } from "../../types";
import { formatTIN } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discount/utils/utils";
import { toast } from "sonner";

interface AddPayeeModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (createdPayee?: SupplierDto) => void;
    supplierType?: "TRADE" | "NON-TRADE";
    allowSupplierTypeSelect?: boolean;
}

const LOCAL_CURRENCY_OPTION: SupplierCurrencyOption = {
    forex_id: 0,
    currency_code: "PHP",
    currency_name: "Philippine Peso",
    symbol: "₱",
    is_active: 1
};

export function AddPayeeModal({
    open,
    onClose,
    onSuccess,
    supplierType = "TRADE",
    allowSupplierTypeSelect = true,
}: AddPayeeModalProps) {
    const [type, setType] = useState<"TRADE" | "NON-TRADE">(supplierType);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const submitLock = useRef(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // NON-TRADE form state
    const [nonTradeName, setNonTradeName] = useState("");
    const [nonTradeTin, setNonTradeTin] = useState("");
    const [nonTradeEmail, setNonTradeEmail] = useState("");
    const [nonTradePhone, setNonTradePhone] = useState("");
    const [nonTradeBankDetails, setNonTradeBankDetails] = useState("");

    // TRADE form state (identical to SupplierFormModal)
    const [supplierForm, setSupplierForm] = useState<SupplierFormState>({
        supplier_name: "",
        supplier_shortcut: "",
        supplier_type: supplierType,
        tin_number: "",
        phone_number: "",
        email_address: "",
        address: "",
        city: "",
        brgy: "",
        state_province: "",
        country: PHILIPPINES_COUNTRY,
        postal_code: "",
        payment_terms: "",
        delivery_terms: "",
        currency: "PHP",
        default_currency: "PHP",
        notes_or_comments: "",
        isActive: true,
        nonBuy: false as boolean | number,
        is_foreign: 0,
        representatives: [] as SupplierRepresentative[]
    });

    const [supplierError, setSupplierError] = useState<string | null>(null);

    // PSGC States
    const [provinces, setProvinces] = useState<PSGCItem[]>([]);
    const [cities, setCities] = useState<PSGCItem[]>([]);
    const [barangays, setBarangays] = useState<PSGCItem[]>([]);

    const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
    const [selectedCityCode, setSelectedCityCode] = useState("");
    const [selectedBarangayCode, setSelectedBarangayCode] = useState("");

    const [loadingProvinces, setLoadingProvinces] = useState(false);
    const [loadingCities, setLoadingCities] = useState(false);
    const [loadingBarangays, setLoadingBarangays] = useState(false);
    const [supplierCurrencies, setSupplierCurrencies] = useState<SupplierCurrencyOption[]>([]);
    const [loadingSupplierCurrencies, setLoadingSupplierCurrencies] = useState(false);
    const [currencyError, setCurrencyError] = useState<string | null>(null);

    const isPH = isPhilippinesCountry(supplierForm.country);
    const activeForeignCurrencies = supplierCurrencies.filter(option => {
        const code = option.currency_code.trim().toUpperCase();
        return code !== "PHP" && option.is_active !== false && Number(option.is_active ?? 1) !== 0;
    });
    const selectedCurrency = String(supplierForm.default_currency || supplierForm.currency || "").trim().toUpperCase();
    const preferredForeignCurrency = activeForeignCurrencies.find(option => option.currency_code.toUpperCase() === selectedCurrency)
        || activeForeignCurrencies[0];
    const foreignLabelCode = selectedCurrency && selectedCurrency !== "PHP"
        ? selectedCurrency
        : preferredForeignCurrency?.currency_code.toUpperCase();
    const currencyOptions = [
        LOCAL_CURRENCY_OPTION,
        ...(selectedCurrency && selectedCurrency !== "PHP" && !activeForeignCurrencies.some(option => option.currency_code.toUpperCase() === selectedCurrency)
            ? [{
                forex_id: -1,
                currency_code: selectedCurrency,
                currency_name: "Inactive or unavailable currency",
                is_active: 0
            }]
            : []),
        ...activeForeignCurrencies
    ];

    // Reset when modal opens/closes or supplierType changes
    useEffect(() => {
        if (open) {
            setType(supplierType);
            setSupplierError(null);
            setCurrencyError(null);

            setNonTradeName("");
            setNonTradeTin("");
            setNonTradeEmail("");
            setNonTradePhone("");
            setNonTradeBankDetails("");

            setSupplierForm({
                supplier_name: "",
                supplier_shortcut: "",
                supplier_type: supplierType,
                tin_number: "",
                phone_number: "",
                email_address: "",
                address: "",
                city: "",
                brgy: "",
                state_province: "",
                country: PHILIPPINES_COUNTRY,
                postal_code: "",
                payment_terms: "",
                delivery_terms: "",
                currency: "PHP",
                default_currency: "PHP",
                notes_or_comments: "",
                isActive: true,
                nonBuy: false,
                is_foreign: 0,
                representatives: []
            });

            setSelectedProvinceCode("");
            setSelectedCityCode("");
            setSelectedBarangayCode("");
        }
    }, [open, supplierType]);

    // Load PSGC Provinces when Trade and PH
    const loadProvinces = async () => {
        setLoadingProvinces(true);
        try {
            const list = await fetchPHProvinces();
            setProvinces(list);
        } catch {
            setProvinces([]);
        } finally {
            setLoadingProvinces(false);
        }
    };

    useEffect(() => {
        if (open && type === "TRADE" && isPH) {
            loadProvinces();
        }
    }, [open, type, isPH]);

    // Load Forex Currencies when Trade
    useEffect(() => {
        if (!open || type !== "TRADE") return;

        let cancelled = false;
        setLoadingSupplierCurrencies(true);
        setCurrencyError(null);

        fetchActiveSupplierCurrencies()
            .then(options => {
                if (!cancelled) setSupplierCurrencies(options);
            })
            .catch(error => {
                if (!cancelled) {
                    setSupplierCurrencies([]);
                    setCurrencyError(error instanceof Error ? error.message : "Active supplier currencies could not be loaded.");
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingSupplierCurrencies(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, type]);

    useEffect(() => {
        if (!open) {
            setSelectedProvinceCode("");
            setSelectedCityCode("");
            setSelectedBarangayCode("");
            setProvinces([]);
            setCities([]);
            setBarangays([]);
        }
    }, [open]);

    const handleCountrySelect = (country: string) => {
        const nextIsPH = isPhilippinesCountry(country);

        setSelectedProvinceCode("");
        setSelectedCityCode("");
        setSelectedBarangayCode("");
        setCities([]);
        setBarangays([]);

        setSupplierForm(prev => {
            const previousIsPH = isPhilippinesCountry(prev.country);
            const nextCurrency = nextIsPH ? "PHP" : preferredForeignCurrency?.currency_code.toUpperCase() || "";
            return {
                ...prev,
                country,
                state_province: nextIsPH || previousIsPH ? "" : prev.state_province,
                city: nextIsPH || previousIsPH ? "" : prev.city,
                brgy: "",
                is_foreign: nextIsPH ? 0 : 1,
                default_currency: nextCurrency,
                currency: nextCurrency
            };
        });
        if (nextIsPH || preferredForeignCurrency) {
            setCurrencyError(null);
        } else {
            setCurrencyError("No active foreign currencies are configured. Foreign suppliers cannot be saved until forex_configurations has an active currency.");
        }
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

    const handleClassificationChange = (newType: "TRADE" | "NON-TRADE") => {
        setType(newType);
        setSupplierForm(prev => ({ ...prev, supplier_type: newType }));
        setSupplierError(null);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (submitLock.current) return;

        if (type === "TRADE") {
            const isForeignRequested = Number(supplierForm.is_foreign) === 1 || (selectedCurrency !== "" && selectedCurrency !== "PHP");
            const isActiveForeignCurrency = activeForeignCurrencies.some(option => option.currency_code.toUpperCase() === selectedCurrency);
            if (isForeignRequested && (!isActiveForeignCurrency || !foreignLabelCode)) {
                setCurrencyError("Select an active foreign currency from forex_configurations before saving this supplier.");
                return;
            }

            submitLock.current = true;
            setIsSubmitting(true);
            setSupplierError(null);
            try {
                const res = await createSupplier({
                    ...supplierForm,
                    supplier_type: "TRADE",
                    isActive: supplierForm.isActive ? 1 : 0,
                    is_foreign: Number(supplierForm.is_foreign) || 0,
                    nonBuy: supplierForm.nonBuy ? 1 : 0,
                }) as { data?: SupplierDto } | SupplierDto;
                const created = (res && typeof res === "object" && "data" in res && res.data) ? res.data : (res as SupplierDto);
                toast.success(`Trade supplier "${supplierForm.supplier_name.trim()}" registered successfully!`);
                onSuccess(created);
                onClose();
            } catch (error) {
                const msg = error instanceof Error ? error.message : "Failed to register trade supplier";
                setSupplierError(msg);
                toast.error(msg);
            } finally {
                submitLock.current = false;
                setIsSubmitting(false);
            }
        } else {
            if (!nonTradeName.trim()) {
                toast.error("Payee Name is required.");
                return;
            }
            if (!nonTradeTin.trim()) {
                toast.error("TIN Number is required.");
                return;
            }

            submitLock.current = true;
            setIsSubmitting(true);
            setSupplierError(null);
            try {
                const created = await disbursementProvider.createPayee({
                    supplier_name: nonTradeName.trim(),
                    supplier_type: "NON-TRADE",
                    tin_number: nonTradeTin.trim(),
                    email_address: nonTradeEmail.trim() || undefined,
                    phone_number: nonTradePhone.trim() || undefined,
                    bank_details: nonTradeBankDetails.trim() || undefined,
                });

                toast.success(`Non-Trade payee "${nonTradeName.trim()}" created successfully!`);
                onSuccess(created);
                onClose();
            } catch (error) {
                const msg = error instanceof Error ? error.message : "Failed to create non-trade payee";
                setSupplierError(msg);
                toast.error(msg);
            } finally {
                submitLock.current = false;
                setIsSubmitting(false);
            }
        }
    };

    if (!mounted || typeof window === "undefined") return null;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent showCloseButton={false} className="max-w-lg w-full p-6 bg-card text-foreground border rounded-xl shadow-lg z-[9999] space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                    <DialogTitle className="font-bold text-sm flex items-center gap-2">
                        {type === "TRADE" ? (
                            <>
                                <Building2 className="h-4.5 w-4.5 text-primary" />
                                Register Vendor / Supplier
                            </>
                        ) : (
                            <>
                                <UserPlus className="h-4.5 w-4.5 text-primary" />
                                Register Non-Trade Payee
                            </>
                        )}
                    </DialogTitle>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground text-xs font-bold cursor-pointer"
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

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {type === "NON-TRADE" ? (
                                /* NON-TRADE FORM UI */
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">
                                            Vendor Classification <span className="text-red-500">*</span>
                                        </label>
                                        {allowSupplierTypeSelect ? (
                                            <select
                                                value={type}
                                                onChange={e => handleClassificationChange(e.target.value as "TRADE" | "NON-TRADE")}
                                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold"
                                            >
                                                <option value="TRADE">Trade</option>
                                                <option value="NON-TRADE">Non-Trade</option>
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={type}
                                                readOnly
                                                disabled
                                                className="w-full rounded-lg border bg-muted px-3 py-2 text-xs font-bold uppercase"
                                            />
                                        )}
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">
                                            Payee / Supplier Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. ACME Industrial Corp."
                                            value={nonTradeName}
                                            onChange={e => setNonTradeName(e.target.value)}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-semibold text-muted-foreground">
                                                TIN Number <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="000-000-000-000"
                                                value={nonTradeTin}
                                                onChange={e => setNonTradeTin(formatTIN(e.target.value))}
                                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-semibold text-muted-foreground">Phone Number</label>
                                            <input
                                                type="text"
                                                placeholder="09XXXXXXXXX"
                                                value={nonTradePhone}
                                                onChange={e => setNonTradePhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Email Address</label>
                                        <input
                                            type="email"
                                            placeholder="payee@example.com"
                                            value={nonTradeEmail}
                                            onChange={e => setNonTradeEmail(e.target.value)}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Bank Details (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="Bank Name, Account #, Branch"
                                            value={nonTradeBankDetails}
                                            onChange={e => setNonTradeBankDetails(e.target.value)}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 mt-2"
                                    >
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                                        {isSubmitting ? "Creating Payee..." : "Complete Registration"}
                                    </button>
                                </div>
                            ) : (
                                /* TRADE FORM UI - 100% Exact Replica of SupplierFormModal */
                                <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
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
                                            onChange={e => setSupplierForm({...supplierForm, tin_number: formatTIN(e.target.value)})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label htmlFor="supplier-status-trade" className="text-[11px] font-semibold text-muted-foreground">
                                            Initial Supplier Status <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            id="supplier-status-trade"
                                            value={supplierForm.isActive ? "active" : "inactive"}
                                            onChange={e => setSupplierForm({ ...supplierForm, isActive: e.target.value === "active" })}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold"
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label htmlFor="supplier-classification-trade" className="text-[11px] font-semibold text-muted-foreground">
                                            Vendor Classification <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            id="supplier-classification-trade"
                                            required
                                            aria-required="true"
                                            value={type}
                                            onChange={e => handleClassificationChange(e.target.value as "TRADE" | "NON-TRADE")}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold"
                                        >
                                            <option value="">-- Select Classification --</option>
                                            <option value="TRADE">Trade</option>
                                            <option value="NON-TRADE">Non-Trade</option>
                                        </select>
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
                                            popoverClassName="z-[10000]"
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
                                                        popoverClassName="z-[10000]"
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
                                                        popoverClassName="z-[10000]"
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
                                                        popoverClassName="z-[10000]"
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
                                                        disabled={!preferredForeignCurrency}
                                                        onClick={() => setSupplierForm(prev => ({
                                                            ...prev,
                                                            is_foreign: 1,
                                                            default_currency: preferredForeignCurrency?.currency_code.toUpperCase() || "",
                                                            currency: preferredForeignCurrency?.currency_code.toUpperCase() || ""
                                                        }))}
                                                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                                            Number(supplierForm.is_foreign) === 1
                                                                ? "bg-amber-500/15 text-amber-700 border-amber-500/40 shadow-sm"
                                                                : "bg-background text-muted-foreground border-input hover:text-foreground"
                                                        }`}
                                                    >
                                                        <Globe className="h-3 w-3" /> {foreignLabelCode ? `Foreign Import (${foreignLabelCode})` : "Foreign Import (Unavailable)"}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-semibold text-muted-foreground">Default Currency</label>
                                                <select
                                                    value={selectedCurrency}
                                                    onChange={e => {
                                                        const curr = e.target.value.toUpperCase();
                                                        const isFor = curr !== "PHP" ? 1 : 0;
                                                        setSupplierForm(prev => ({
                                                            ...prev,
                                                            default_currency: curr,
                                                            currency: curr,
                                                            is_foreign: isFor
                                                        }));
                                                        setCurrencyError(null);
                                                    }}
                                                    className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-primary text-foreground h-[31px]"
                                                >
                                                    {!selectedCurrency && (
                                                        <option value="" disabled>
                                                            Select an active currency
                                                        </option>
                                                    )}
                                                    {currencyOptions.map(option => (
                                                        <option key={`${option.forex_id}-${option.currency_code}`} value={option.currency_code} disabled={option.is_active === 0}>
                                                            {option.currency_code} ({option.currency_name})
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {loadingSupplierCurrencies
                                                        ? "Loading active currencies..."
                                                        : activeForeignCurrencies.length > 0
                                                            ? "Foreign currencies are sourced from forex_configurations."
                                                            : "PHP only: no active foreign currencies are configured."}
                                                </p>
                                                {currencyError && (
                                                    <p className="text-[10px] text-red-600" role="alert">{currencyError}</p>
                                                )}
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
                                            {PURCHASE_ORDER_DELIVERY_TERMS.map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
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

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        aria-busy={isSubmitting}
                                        className="col-span-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-sm cursor-pointer animate-none disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmitting ? "Saving..." : "Complete Registration"}
                                    </button>
                                </div>
                            )}
                        </form>
            </DialogContent>
        </Dialog>
    );
}
