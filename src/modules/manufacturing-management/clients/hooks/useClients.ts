import { useState, useEffect } from "react";
import { Customer, PaymentTerm, StoreType } from "../types";
import { toast } from "sonner";

export interface ClientProduct {
    id: number;
    name: string;
    code: string;
}

export interface ClientProductVersion {
    version_id: number;
    version_name: string;
    status: string;
}

export interface CustomerOverrideItem {
    product_id: number;
    version_id: number;
}

export function useClients() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [storeTypes, setStoreTypes] = useState<StoreType[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

    // Form inputs state
    const [formData, setFormData] = useState({
        customer_code: "",
        customer_name: "",
        customer_tin: "",
        contact_number: "",
        customer_email: "",
        store_name: "",
        store_type_id: "",
        payment_term: "",
        province: "",
        city: "",
        brgy: "",
        latitude: "",
        longitude: "",
        isActive: true
    });

    // Customer specific product version overrides state
    const [products, setProducts] = useState<ClientProduct[]>([]);
    const [versionsMap, setVersionsMap] = useState<Record<number, ClientProductVersion[]>>({});
    const [overrides, setOverrides] = useState<Record<number, number>>({});
    const [loadingBomSettings, setLoadingBomSettings] = useState(false);
    const [bomSettingsError, setBomSettingsError] = useState<string | null>(null);

    // PSGC address data state
    const [provinces, setProvinces] = useState<{ code: string; name: string }[]>([]);
    const [cities, setCities] = useState<{ code: string; name: string; provinceCode: string | boolean }[]>([]);
    const [barangays, setBarangays] = useState<{ code: string; name: string; cityCode: string }[]>([]);
    
    const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
    const [selectedCityCode, setSelectedCityCode] = useState("");
    const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);

    // Load customers and store types
    const loadData = async () => {
        setLoading(true);
        try {
            const [custRes, storeRes, paymentRes] = await Promise.all([
                fetch("/api/manufacturing/finished-goods/customers?all=true"),
                fetch("/api/manufacturing/finished-goods/store-types"),
                fetch("/api/manufacturing/payment-terms")
            ]);
            
            if (custRes.ok) {
                const custData = await custRes.json();
                setCustomers(custData);
            }
            if (storeRes.ok) {
                const storeData = await storeRes.json();
                setStoreTypes(storeData);
            }
            if (paymentRes.ok) {
                const paymentData = await paymentRes.json();
                setPaymentTerms(Array.isArray(paymentData) ? paymentData : []);
            }
        } catch (err) {
            console.error("Error loading client data:", err);
            toast.error("Failed to load customer registry");
        } finally {
            setLoading(false);
        }
    };

    // Load PSGC address references
    const loadProvincesAndCities = async () => {
        try {
            const [provRes, cityRes] = await Promise.all([
                fetch("/api/psgc/provinces"),
                fetch("/api/psgc/cities-municipalities")
            ]);
            
            if (provRes.ok) {
                const provList = await provRes.json();
                setProvinces(provList);
            }
            if (cityRes.ok) {
                const cityList = await cityRes.json();
                setCities(cityList);
            }
        } catch (err) {
            console.error("Error loading PSGC location list:", err);
        }
    };

    useEffect(() => {
        loadData();
        loadProvincesAndCities();
    }, []);

    // Load barangays dynamically when city changes
    useEffect(() => {
        const loadBarangays = async () => {
            if (!selectedCityCode) {
                setBarangays([]);
                return;
            }
            setBarangays([]);
            try {
                const res = await fetch(`/api/psgc/cities-municipalities/${selectedCityCode}/barangays`);
                if (!res.ok) {
                    throw new Error(`Barangay lookup failed with status ${res.status}`);
                }

                const data: unknown = await res.json();
                if (!Array.isArray(data)) {
                    throw new Error("Barangay lookup returned an invalid response");
                }

                const list = data
                    .filter((item): item is { code: string; name: string } => {
                        return typeof item === "object" && item !== null
                            && typeof (item as { code?: unknown }).code === "string"
                            && typeof (item as { name?: unknown }).name === "string";
                    })
                    .map((item) => ({
                        code: item.code,
                        name: item.name,
                        cityCode: selectedCityCode,
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name));

                setBarangays(list);

                // If we are editing, map the barangay name string to the correct code.
                if (editingCustomer?.brgy) {
                    const matchedBrgy = list.find((b) => b.name.toLowerCase() === editingCustomer.brgy!.toLowerCase());
                    if (matchedBrgy) {
                        setFormData(prev => ({ ...prev, brgy: matchedBrgy.code }));
                    }
                }
            } catch (err) {
                setBarangays([]);
                console.error("Error loading barangays:", err);
            }
        };
        loadBarangays();
    }, [selectedCityCode, editingCustomer]);

    // Handle modal open for create or edit
    const openCreateModal = () => {
        setEditingCustomer(null);
        setOverrides({});
        setFormData({
            customer_code: "",
            customer_name: "",
            customer_tin: "",
            contact_number: "",
            customer_email: "",
            store_name: "",
            store_type_id: "",
            payment_term: "",
            province: "",
            city: "",
            brgy: "",
            latitude: "",
            longitude: "",
            isActive: true
        });
        setSelectedProvinceCode("");
        setSelectedCityCode("");
        setIsModalOpen(true);
    };

    const openEditModal = async (c: Customer) => {
        setEditingCustomer(c);
        setProducts([]);
        setVersionsMap({});
        setOverrides({});
        setLoadingBomSettings(true);
        setBomSettingsError(null);
        
        // Find matching province and city codes from strings to bind select menus
        const matchedProv = provinces.find(p => p.name.toLowerCase() === (c.province || "").toLowerCase());
        const provCode = matchedProv ? matchedProv.code : "";
        setSelectedProvinceCode(provCode);

        const matchedCity = cities.find(ct => ct.name.toLowerCase() === (c.city || "").toLowerCase());
        const ctCode = matchedCity ? matchedCity.code : "";
        setSelectedCityCode(ctCode);

        // Map store_type_id if it's an object
        let storeTypeId = "";
        const rawStoreType = c.store_type || c.store_type_id;
        if (rawStoreType) {
            storeTypeId = typeof rawStoreType === "object" ? String(rawStoreType.id) : String(rawStoreType);
        }

        const rawPaymentTerm = c.payment_term;
        const paymentTermId = rawPaymentTerm && typeof rawPaymentTerm === "object"
            ? String(rawPaymentTerm.id)
            : rawPaymentTerm
                ? String(rawPaymentTerm)
                : "";

        setFormData({
            customer_code: c.customer_code,
            customer_name: c.customer_name,
            customer_tin: c.customer_tin || "",
            contact_number: c.contact_number || "",
            customer_email: c.customer_email || "",
            store_name: c.store_name || "",
            store_type_id: storeTypeId,
            payment_term: paymentTermId,
            province: c.province || "",
            city: c.city || "",
            brgy: c.brgy || "",
            latitude: c.latitude !== undefined && c.latitude !== null ? String(c.latitude) : "",
            longitude: c.longitude !== undefined && c.longitude !== null ? String(c.longitude) : "",
            isActive: c.isActive === 1 || c.isActive === true
        });
        
        // Open modal first to ensure instant UI response
        setIsModalOpen(true);

        // Load customer version overrides, products, and BOM versions together so
        // the settings tab never shows a partial or misleading empty state.
        try {
            const [overrideRes, resProds] = await Promise.all([
                fetch(`/api/manufacturing/finished-goods/customer-product-version?customerId=${c.id}`),
                fetch("/api/manufacturing/finished-goods/products?limit=250")
            ]);

            if (!overrideRes.ok) {
                throw new Error("Failed to load customer BOM settings");
            }
            if (overrideRes.ok) {
                const overrideList = await overrideRes.json();
                const map: Record<number, number> = {};
                overrideList.forEach((item: CustomerOverrideItem) => {
                    map[item.product_id] = item.version_id;
                });
                setOverrides(map);
            }
            if (!resProds.ok) {
                throw new Error("Failed to load finished goods for BOM settings");
            }

            const prodsData = await resProds.json();
            const finishedGoods = (prodsData || []).filter((p: { product_type?: number }) => Number(p.product_type) === 388);
            const mappedProds = finishedGoods.map((p: { product_id: number; product_name: string; product_code?: string }) => ({
                id: p.product_id,
                name: p.product_name,
                code: p.product_code || `SKU-${p.product_id}`
            }));
            setProducts(mappedProds);

            const results = await Promise.all(mappedProds.map(async (p: ClientProduct) => {
                const verRes = await fetch(`/api/manufacturing/finished-goods/versions?productId=${p.id}`);
                if (!verRes.ok) {
                    throw new Error(`Failed to load BOM versions for ${p.name}`);
                }
                const verData = await verRes.json();
                return { productId: p.id, versions: verData as ClientProductVersion[] };
            }));

            const vMap: Record<number, ClientProductVersion[]> = {};
            results.forEach(r => {
                vMap[r.productId] = r.versions;
            });
            setVersionsMap(vMap);
        } catch (err) {
            console.error("Failed to load products/versions for customer settings:", err);
            setBomSettingsError(err instanceof Error ? err.message : "Failed to load BOM settings");
            toast.error("Failed to load BOM settings. Close and reopen the customer to retry.");
        } finally {
            setLoadingBomSettings(false);
        }
    };

    // Auto-generate customer code based on name
    const handleCustomerNameChange = (name: string) => {
        setFormData(prev => {
            const next = { ...prev, customer_name: name };
            if (!editingCustomer && name.trim()) {
                const words = name.trim().toUpperCase().split(/\s+/).slice(0, 3);
                const prefix = words.map(w => w.replace(/[^A-Z0-9]/g, "").slice(0, 3)).join("-");
                const random = Math.floor(100 + Math.random() * 900);
                next.customer_code = `CUST-${prefix}-${random}`;
            }
            return next;
        });
    };

    // Save customer (Create or Update)
    const handleSaveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.customer_code.trim() || !formData.customer_name.trim()) {
            toast.error("Customer Code and Customer Name are required");
            return;
        }

        // Map province and city names from selected codes
        const provName = provinces.find(p => p.code === selectedProvinceCode)?.name || formData.province;
        const cityName = cities.find(c => c.code === selectedCityCode)?.name || formData.city;
        const brgyName = barangays.find(b => b.code === formData.brgy)?.name || formData.brgy;

        // Parse coordinates
        const latVal = formData.latitude.trim();
        const lngVal = formData.longitude.trim();
        const parsedLatitude = latVal ? parseFloat(latVal) : null;
        const parsedLongitude = lngVal ? parseFloat(lngVal) : null;

        const payload = {
            customer_code: formData.customer_code.trim(),
            customer_name: formData.customer_name.trim(),
            customer_tin: formData.customer_tin.trim() || undefined,
            contact_number: formData.contact_number.trim() || undefined,
            customer_email: formData.customer_email.trim() || undefined,
            store_name: formData.store_name.trim() || undefined,
            store_type: formData.store_type_id ? Number(formData.store_type_id) : null,
            payment_term: formData.payment_term ? Number(formData.payment_term) : null,
            province: provName.trim() || undefined,
            city: cityName.trim() || undefined,
            brgy: brgyName.trim() || undefined,
            latitude: parsedLatitude !== null && !isNaN(parsedLatitude) ? parsedLatitude : null,
            longitude: parsedLongitude !== null && !isNaN(parsedLongitude) ? parsedLongitude : null,
            isActive: formData.isActive ? 1 : 0
        };

        try {
            if (editingCustomer) {
                // Update
                const res = await fetch(`/api/manufacturing/finished-goods/customers?id=${editingCustomer.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || "Failed to update client account");
                }
                toast.success("Client account updated successfully");
            } else {
                // Create
                const res = await fetch("/api/manufacturing/finished-goods/customers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || "Failed to create client account");
                }
                toast.success("Client account registered successfully");
            }
            
            setIsModalOpen(false);
            loadData();
        } catch (err) {
            console.error("Save client error:", err);
            const message = err instanceof Error ? err.message : "Failed to save client details";
            toast.error(message);
        }
    };

    // Delete customer (soft delete)
    const handleDeleteCustomer = async (id: number | string) => {
        if (!confirm("Are you sure you want to delete this customer account? This will set their status to Inactive and restrict them from new transactions.")) {
            return;
        }
        try {
            const res = await fetch(`/api/manufacturing/finished-goods/customers?id=${id}`, {
                method: "DELETE"
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to delete client record");
            }
            toast.success("Client record deleted successfully");
            loadData();
        } catch (err) {
            console.error("Delete client error:", err);
            const message = err instanceof Error ? err.message : "Failed to delete client account";
            toast.error(message);
        }
    };

    // Save product version override override settings
    const updateProductVersionOverride = async (productId: number, versionId: number | null) => {
        if (!editingCustomer) return;
        try {
            const res = await fetch("/api/manufacturing/finished-goods/customer-product-version", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customerId: editingCustomer.id,
                    productId,
                    versionId
                })
            });
            if (res.ok) {
                setOverrides(prev => {
                    const next = { ...prev };
                    if (versionId === null) {
                        delete next[productId];
                    } else {
                        next[productId] = versionId;
                    }
                    return next;
                });
                toast.success("Customer product version override updated");
            } else {
                const err = await res.json();
                throw new Error(err.error || "Failed to save override");
            }
        } catch (err) {
            console.error("Error saving customer version override:", err);
            toast.error(err instanceof Error ? err.message : "Failed to save setting");
        }
    };

    // Client filtering logic
    const filteredCustomers = customers.filter(c => {
        const matchesSearch =
            c.customer_name.toLowerCase().includes(searchText.toLowerCase()) ||
            c.customer_code.toLowerCase().includes(searchText.toLowerCase()) ||
            (c.customer_tin || "").toLowerCase().includes(searchText.toLowerCase()) ||
            (c.customer_email || "").toLowerCase().includes(searchText.toLowerCase()) ||
            (c.province || "").toLowerCase().includes(searchText.toLowerCase()) ||
            (c.city || "").toLowerCase().includes(searchText.toLowerCase()) ||
            (c.brgy || "").toLowerCase().includes(searchText.toLowerCase());

        const activeBool = c.isActive === 1 || c.isActive === true;
        if (statusFilter === "active") return matchesSearch && activeBool;
        if (statusFilter === "inactive") return matchesSearch && !activeBool;
        return matchesSearch;
    });

    return {
        customers: filteredCustomers,
        storeTypes,
        setStoreTypes,
        loading,
        searchText,
        setSearchText,
        statusFilter,
        setStatusFilter,
        isModalOpen,
        setIsModalOpen,
        editingCustomer,
        formData,
        setFormData,
        provinces,
        cities,
        barangays,
        paymentTerms,
        selectedProvinceCode,
        setSelectedProvinceCode,
        selectedCityCode,
        setSelectedCityCode,
        openCreateModal,
        openEditModal,
        handleCustomerNameChange,
        handleSaveCustomer,
        handleDeleteCustomer,
        products,
        versionsMap,
        overrides,
        loadingBomSettings,
        bomSettingsError,
        updateProductVersionOverride,
        refresh: loadData
    };
}
