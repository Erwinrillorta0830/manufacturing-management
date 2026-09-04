import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import { QuotationHeader, QuotationSnapshotNode, CatalogProduct, SelectedQuoteProduct, Customer, Project } from "../types";

import { generateQuotationPDF } from "../utils/exportQuotationPDF";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseCustomerLookupResponse(value: unknown): Customer[] {
    if (Array.isArray(value)) return value as Customer[];
    if (isRecord(value) && Array.isArray(value.data)) return value.data as Customer[];
    return [];
}

export function useQuotation() {
    // List view vs Create view
    const [view, setView] = useState<"list" | "create">("list");

    // Master Quotations
    const [quotes, setQuotes] = useState<QuotationHeader[]>([]);
    const [loadingQuotes, setLoadingQuotes] = useState(true);
    const [selectedQuote, setSelectedQuote] = useState<QuotationHeader | null>(null);
    const [snapshots, setSnapshots] = useState<QuotationSnapshotNode[]>([]);
    const [loadingSnapshots, setLoadingSnapshots] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Create Quotation Flow States
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
    const [customerSearchText, setCustomerSearchText] = useState<string>("");
    const [quoteNumber, setQuoteNumber] = useState<string>("");
    const [projectName, setProjectName] = useState("");
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [remarks, setRemarks] = useState<string>("");
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    
    // Master data lookups
    const [priceTypes, setPriceTypes] = useState<{ price_type_id: number; price_type_name: string }[]>([]);
    const [selectedPriceTypeId, setSelectedPriceTypeId] = useState<string>("");
    const [pendingPriceTypeId, setPendingPriceTypeId] = useState<string>("");
    const [isPriceTypeWarningOpen, setIsPriceTypeWarningOpen] = useState(false);
    const [showValidationErrors, setShowValidationErrors] = useState(false);
    
    // Project portfolio database registry
    const [localProjects, setLocalProjects] = useState<{ id: number; project_name: string; customer_id: number; customer_name: string; customer_code: string; status?: string }[]>([]);
    const customerLookupRequestId = useRef(0);

    const mergeCustomer = (customer: Customer) => {
        setCustomers(previous => {
            const existing = previous.findIndex(item => String(item.id) === String(customer.id));
            if (existing === -1) return [...previous, customer];
            return previous.map((item, index) => index === existing ? customer : item);
        });
    };

    const loadCustomerById = async (customerId: number | string): Promise<Customer | null> => {
        const response = await fetch(`/api/manufacturing/finished-goods/customers/lookup?customerId=${encodeURIComponent(String(customerId))}&limit=1`);
        if (!response.ok) return null;
        const data = parseCustomerLookupResponse(await response.json());
        const customer = data[0] || null;
        if (customer) mergeCustomer(customer);
        return customer;
    };

    // Load master list of quotations
    const loadQuotes = async () => {
        setLoadingQuotes(true);
        try {
            const res = await fetch("/api/manufacturing/finished-goods/quotes");
            if (!res.ok) throw new Error("Failed to fetch quotations");
            const data = await res.json();
            setQuotes(data);
        } catch (e) {
            console.error("Error loading quotes:", e);
            toast.error(e instanceof Error ? e.message : "Failed to load quotations");
        } finally {
            setLoadingQuotes(false);
        }
    };

    // Initialize module metadata
    useEffect(() => {
        loadQuotes();
        
        // Fetch a bounded customer lookup and independently load projects. The
        // project endpoint includes customer details so this no longer depends
        // on a full customer-directory response.
        Promise.all([
            fetch("/api/manufacturing/finished-goods/customers/lookup?limit=10"),
            fetch("/api/manufacturing/finished-goods/projects")
        ])
            .then(async ([customerRes, projectRes]) => {
                const customerData = customerRes.ok
                    ? parseCustomerLookupResponse(await customerRes.json())
                    : [];
                setCustomers(customerData);

                if (!projectRes.ok) return;
                const projectData: unknown = await projectRes.json();
                const projects = Array.isArray(projectData) ? projectData as Project[] : [];
                const mapped = projects.map(p => {
                    const matchedCust = customerData.find(c => c.customer_code === p.customer_code);
                    const projectCustomerId = p.customer_id !== undefined && p.customer_id !== null
                        ? Number(p.customer_id)
                        : matchedCust ? Number(matchedCust.id) : 0;
                    return {
                        id: p.id,
                        project_name: p.project_name,
                        customer_id: Number.isFinite(projectCustomerId) ? projectCustomerId : 0,
                        customer_name: p.customer_name || matchedCust?.customer_name || `Code: ${p.customer_code}`,
                        customer_code: p.customer_code,
                        status: p.status
                    };
                });
                setLocalProjects(mapped);
            })
            .catch(e => console.error("Error fetching quotation customer metadata:", e));

        // Fetch price types
        fetch("/api/manufacturing/finished-goods/price-types")
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setPriceTypes(data);
            })
            .catch(e => console.error("Error fetching price types:", e));

        // Fetch product types and master catalog products
        setLoadingProducts(true);
        Promise.all([
            fetch("/api/manufacturing/finished-goods/products?limit=-1&isActive=1").then(r => r.ok ? r.json() : []),
            fetch("/api/manufacturing/sales-order?action=create-lookups").then(r => r.ok ? r.json() : {})
        ]).then(([productsData, lookupsData]: [Record<string, unknown>[], Record<string, unknown>]) => {
            const fgOnly = productsData.filter((p: Record<string, unknown>) => p.has_versions === true);
            setCatalogProducts(fgOnly as unknown as CatalogProduct[]);
            
            if (lookupsData.products) setAllProducts(lookupsData.products as unknown as CatalogProduct[]);
            if (lookupsData.productTypes) setProductTypes(lookupsData.productTypes as Record<string, unknown>[]);
            
            setLoadingProducts(false);
        }).catch(e => {
            console.error("Error fetching catalog:", e);
            setLoadingProducts(false);
        });
    }, []);

    // Load specific price sheets when Price Type selection changes
    useEffect(() => {
        if (!selectedPriceTypeId) {
            setPriceTypeRatesMap({});
            return;
        }
        fetch(`/api/manufacturing/finished-goods/price-types?priceTypeId=${selectedPriceTypeId}`)
            .then(res => res.ok ? res.json() : [])
            .then((data) => {
                const map: Record<number, number> = {};
                (data as { product_id: number | { product_id: number } | null; price: string | number }[]).forEach(item => {
                    const prodId = typeof item.product_id === "object" && item.product_id !== null ? item.product_id.product_id : item.product_id;
                    if (prodId) {
                        map[Number(prodId)] = parseFloat(String(item.price)) || 0;
                    }
                });
                setPriceTypeRatesMap(map);

                // Dynamically update preloaded rates on already selected items list
                setSelectedProductsList(prev => prev.map(item => {
                    const preloadedRate = map[item.product?.product_id || 0] || item.product?.price_per_unit || 0;
                    return {
                        ...item,
                        priceTypePrice: preloadedRate,
                        agreedPrice: item.agreedPrice === item.priceTypePrice ? preloadedRate : item.agreedPrice
                    };
                }));
            })
            .catch(e => console.error("Error loading price type rules:", e));
    }, [selectedPriceTypeId]);

    const viewQuoteDetails = async (quote: QuotationHeader) => {
        setSelectedQuote(quote);
        setIsDetailModalOpen(true);
        setLoadingSnapshots(true);
        try {
            const res = await fetch(`/api/manufacturing/finished-goods/quotes/snapshots?quoteId=${quote.id}`);
            if (!res.ok) throw new Error("Failed to load snapshot details");
            const data = await res.json();
            setSnapshots(data);
        } catch (e) {
            console.error("Error fetching snapshots:", e);
            toast.error(e instanceof Error ? e.message : "Failed to fetch snapshot details");
        } finally {
            setLoadingSnapshots(false);
        }
    };

    // Initialize fresh new quote flow
    const initCreateFlow = () => {
        setView("create");
        setSelectedProductsList([]);
        setRemarks("");
        setProjectName("");
        setSelectedProjectId(null);
        setSelectedCustomerId("");
        setCustomerSearchText("");
        setSelectedPriceTypeId("");
        setShowValidationErrors(false);
        
        // Generate QT-YYYYMMDD-HHMMSS
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        setQuoteNumber(`QT-${year}${month}${day}-${hour}${min}${sec}`);
    };

    const startCreateQuoteForProject = async (projName: string, customerId: number, projectId?: number) => {
        setView("create");
        setSelectedProductsList([]);
        setRemarks("");
        setProjectName(projName);
        setSelectedCustomerId(customerId === 0 ? "" : String(customerId));
        setSelectedPriceTypeId("");
        setShowValidationErrors(false);

        if (projectId) {
            setSelectedProjectId(projectId);
        } else {
            // Find database project id inside localProjects list
            const matchedProj = localProjects.find(p => p.project_name === projName);
            if (matchedProj) {
                setSelectedProjectId(Number(matchedProj.id));
            } else {
                setSelectedProjectId(null);
            }
        }

        let matchedCust = customers.find(c => Number(c.id) === customerId);
        if (!matchedCust && customerId > 0) {
            try {
                matchedCust = await loadCustomerById(customerId) || undefined;
            } catch (error) {
                console.error("Error loading project customer:", error);
            }
        }
        if (matchedCust) {
            setCustomerSearchText(`${matchedCust.customer_name} (${matchedCust.customer_code})`);
            // Auto-Fill the Price Type Template!
            if (matchedCust.price_type_id) {
                handlePriceTypeChange(String(matchedCust.price_type_id));
            }
        } else {
            setCustomerSearchText(customerId === 0 ? "" : `Customer ID: ${customerId}`);
        }

        // Generate QT-YYYYMMDD-HHMMSS
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        setQuoteNumber(`QT-${year}${month}${day}-${hour}${min}${sec}`);
    };

    const registerNewProject = async (name: string, customerId: number, customerName: string) => {
        const cleanedName = name.trim().toUpperCase();
        const matchedCust = customers.find(c => Number(c.id) === customerId);
        const customerCode = matchedCust ? matchedCust.customer_code : "GEN-CUST";

        try {
            const res = await fetch("/api/manufacturing/finished-goods/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_name: cleanedName,
                    customer_code: customerCode
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to register project");
            }

            const newProj = await res.json();
            
            // Re-fetch projects to update state
            const projRes = await fetch("/api/manufacturing/finished-goods/projects");
            if (projRes.ok) {
                const projData = await projRes.json();
                const projects = Array.isArray(projData) ? projData as Project[] : [];
                const mapped = projects.map(p => {
                    const matchedCust = customers.find((c: Customer) => c.customer_code === p.customer_code);
                    const projectCustomerId = p.customer_id !== undefined && p.customer_id !== null
                        ? Number(p.customer_id)
                        : matchedCust ? Number(matchedCust.id) : 0;
                    return {
                        id: p.id,
                        project_name: p.project_name,
                        customer_id: Number.isFinite(projectCustomerId) ? projectCustomerId : 0,
                        customer_name: p.customer_name || matchedCust?.customer_name || `Code: ${p.customer_code}`,
                        customer_code: p.customer_code,
                        status: p.status
                    };
                });
                setLocalProjects(mapped);
            }

            // Auto-select for create flow
            setProjectName(newProj.project_name);
            setSelectedProjectId(newProj.id);
            setSelectedCustomerId(String(customerId));
            setCustomerSearchText(customerName);
            toast.success(`Project "${newProj.project_name}" registered!`);

            return newProj;
        } catch (e) {
            console.error("Error registering project:", e);
            toast.error(e instanceof Error ? e.message : "Error registering project");
            return null;
        }
    };

    const reviseQuotation = async (quote: QuotationHeader) => {
        setLoadingSnapshots(true);
        try {
            const res = await fetch(`/api/manufacturing/finished-goods/quotes/snapshots?quoteId=${quote.id}`);
            if (!res.ok) throw new Error("Failed to load snapshot details for revision");
            const snapshotItems: QuotationSnapshotNode[] = await res.json();
            
            // Map snapshots to SelectedQuoteProduct format
            const mappedProducts: SelectedQuoteProduct[] = snapshotItems.map(item => {
                const prodMatch = allProducts.find(p => String(p.product_id) === String(item.product_id)) || catalogProducts.find(p => String(p.product_id) === String(item.product_id));
                const catalogProd: CatalogProduct = prodMatch || {
                    product_id: item.product_id,
                    product_name: item.node_name,
                    product_code: "",
                    price_per_unit: item.frozen_total_cost_php,
                    cost_per_unit: item.frozen_unit_cost_php,
                    unit_of_measurement: { unit_shortcut: item.uom }
                };

                let parentId = item.parent_id ? Number(item.parent_id) : (catalogProd.parent_product_id ? Number(catalogProd.parent_product_id) : undefined);
                let productTypeId = item.product_type_id ? Number(item.product_type_id) : (catalogProd.product_type ? Number(catalogProd.product_type) : undefined);

                // Fallback for parent ID if nested
                if (!parentId && catalogProd.parent_id && (catalogProd.parent_id as Record<string, unknown>).id) {
                    parentId = Number((catalogProd.parent_id as Record<string, unknown>).id);
                }

                // Inherit product_type from parent if missing on child
                if (parentId && !productTypeId) {
                    const parentProd = allProducts.find(p => String(p.product_id) === String(parentId)) || catalogProducts.find(p => String(p.product_id) === String(parentId));
                    if (parentProd && parentProd.product_type) {
                        productTypeId = Number(parentProd.product_type);
                    }
                }

                return {
                    line_id: Math.random(),
                    product_type_id: productTypeId,
                    parent_product_id: parentId,
                    product: catalogProd,
                    priceTypePrice: item.frozen_unit_cost_php,
                    agreedPrice: item.frozen_total_cost_php,
                    versionId: item.version_id,
                    versionName: item.version_name
                };
            });

            setSelectedProductsList(mappedProducts);
            
            // Generate revised quote number e.g. QT-XXXXXXXXX-REV1
            const baseNum = quote.quote_number;
            let newQuoteNum = baseNum;
            const revMatch = baseNum.match(/-REV(\d+)$/);
            if (revMatch) {
                const nextRev = parseInt(revMatch[1]) + 1;
                newQuoteNum = baseNum.replace(/-REV\d+$/, `-REV${nextRev}`);
            } else {
                newQuoteNum = `${baseNum}-REV1`;
            }
            
            setQuoteNumber(newQuoteNum);
            
            const custIdStr = typeof quote.customer_id === "object" && quote.customer_id !== null
                ? String((quote.customer_id as Customer).id)
                : String(quote.customer_id);
            setSelectedCustomerId(custIdStr);
            
            const custNameStr = typeof quote.customer_id === "object" && quote.customer_id !== null
                ? `${(quote.customer_id as Customer).customer_name} (${(quote.customer_id as Customer).customer_code})`
                : `Cust ID: ${quote.customer_id}`;
            setCustomerSearchText(custNameStr);

            // Fetch and set price type template if customer has one. The
            // customer may not be in the bounded autocomplete result set.
            let matchedCust = customers.find(c => String(c.id) === custIdStr);
            if (!matchedCust && custIdStr && custIdStr !== "null") {
                matchedCust = await loadCustomerById(custIdStr) || undefined;
            }
            if (matchedCust && matchedCust.price_type_id) {
                handlePriceTypeChange(String(matchedCust.price_type_id));
            } else {
                setSelectedPriceTypeId("");
            }

            setRemarks(quote.remarks || "");
            
            const quoteProj = quote.project_id && typeof quote.project_id === "object" ? quote.project_id as Project : null;
            setProjectName(quoteProj ? quoteProj.project_name : "");
            setSelectedProjectId(quoteProj ? quoteProj.id : null);

            setView("create");
        } catch (e) {
            console.error("Error preparing revision:", e);
            toast.error(e instanceof Error ? e.message : "Failed to prepare revision");
        } finally {
            setLoadingSnapshots(false);
        }
    };
    
    // Catalog and selected products
    const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
    const [allProducts, setAllProducts] = useState<CatalogProduct[]>([]);
    const [productTypes, setProductTypes] = useState<Record<string, unknown>[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [selectedProductsList, setSelectedProductsList] = useState<SelectedQuoteProduct[]>([]);
    const nextLineIdRef = useRef(1);
    const [priceTypeRatesMap, setPriceTypeRatesMap] = useState<Record<number, number>>({});
    const [savingQuote, setSavingQuote] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
    const itemsPerPage = 10;
    
    // Helper to add an empty row to the grid
    const addEmptyRow = () => {
        setSelectedProductsList(prev => [...prev, {
            line_id: nextLineIdRef.current++,
            priceTypePrice: 0,
            agreedPrice: 0
        }]);
    };

    // Replace old addProductToQuote with one that supports the line_id if needed
    const addProductToQuote = (prod: CatalogProduct) => {
        const alreadyExists = selectedProductsList.some(item => item.product?.product_id === prod.product_id);
        toast.dismiss();
        if (alreadyExists) {
            toast.info("Product already added to list");
            return;
        }
        const preloadedPrice = priceTypeRatesMap[prod.product_id] || prod.price_per_unit || 0;
        setSelectedProductsList(prev => [...prev, {
            line_id: nextLineIdRef.current++,
            product: prod,
            priceTypePrice: preloadedPrice,
            agreedPrice: preloadedPrice
        }]);
        toast.success(`Added ${prod.product_name} to quotation draft`);
    };

    const updateRow = (lineId: number, field: string, value: unknown) => {
        setSelectedProductsList(prev => prev.map(item => {
            if (item.line_id === lineId) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const handleRowProductSelect = (lineId: number, prod: CatalogProduct | null) => {
        setSelectedProductsList(prev => prev.map(item => {
            if (item.line_id === lineId) {
                if (!prod) return { ...item, product: null };
                const preloadedPrice = priceTypeRatesMap[prod.product_id] || prod.price_per_unit || 0;
                return {
                    ...item,
                    product: prod,
                    priceTypePrice: preloadedPrice,
                    agreedPrice: preloadedPrice
                };
            }
            return item;
        }));
    };

    const removeProductFromQuote = (lineIdOrProductId: number) => {
        setSelectedProductsList(prev => prev.filter(item => 
            item.line_id !== lineIdOrProductId && 
            item.product?.product_id !== lineIdOrProductId
        ));
    };

    const changeProductVersion = (lineIdOrProductId: number, versionId: number | null, versionName: string | null) => {
        setSelectedProductsList(prev => prev.map(item => {
            if ((item.line_id && item.line_id === lineIdOrProductId) || (item.product?.product_id === lineIdOrProductId)) {
                return { ...item, versionId, versionName };
            }
            return item;
        }));
    };

    const handleAgreedPriceChange = (lineIdOrProductId: number, val: number) => {
        setSelectedProductsList(prev => prev.map(item => {
            if ((item.line_id && item.line_id === lineIdOrProductId) || (item.product?.product_id === lineIdOrProductId)) {
                return { ...item, agreedPrice: val };
            }
            return item;
        }));
    };

    const handleSearchCustomers = async (searchVal: string) => {
        setCustomerSearchText(searchVal);
        setSelectedCustomerId(""); // Clear selection to allow display of lists
        const requestId = customerLookupRequestId.current + 1;
        customerLookupRequestId.current = requestId;
        try {
            const res = await fetch(`/api/manufacturing/finished-goods/customers/lookup?search=${encodeURIComponent(searchVal)}&limit=10`);
            if (res.ok) {
                const data = parseCustomerLookupResponse(await res.json());
                if (requestId === customerLookupRequestId.current) setCustomers(data);
            }
        } catch (err) {
            console.error("Error querying customers:", err);
        }
    };

    const handlePriceTypeChange = (priceTypeId: string) => {
        if (selectedProductsList.length > 0) {
            setPendingPriceTypeId(priceTypeId);
            setIsPriceTypeWarningOpen(true);
        } else {
            setSelectedPriceTypeId(priceTypeId);
        }
    };

    const confirmPriceTypeChange = () => {
        setSelectedPriceTypeId(pendingPriceTypeId);
        setIsPriceTypeWarningOpen(false);
    };

    const cancelPriceTypeChange = () => {
        setPendingPriceTypeId("");
        setIsPriceTypeWarningOpen(false);
    };

    const selectCustomer = (id: string, nameCode: string) => {
        setSelectedCustomerId(id);
        setCustomerSearchText(nameCode);

        // Customer-Driven Price Type Auto-Fill
        const customer = customers.find(c => c.id.toString() === id);
        const autoPriceTypeId = customer?.price_type_id || customer?.default_price_type_id;
        if (autoPriceTypeId) {
            handlePriceTypeChange(String(autoPriceTypeId));
        }
    };

    const submitQuotation = async () => {
        // Enforce required fields validations
        if (!projectName.trim() || !selectedCustomerId || !selectedPriceTypeId || !quoteNumber.trim()) {
            toast.error("Please fill in all required fields highlighted in red.");
            setShowValidationErrors(true);
            return;
        }
        if (selectedProductsList.length === 0) {
            toast.error("Please add at least one product to the quotation list");
            return;
        }

        const missingProducts = selectedProductsList.some(item => !item.product);
        if (missingProducts) {
            toast.error("Please ensure all rows have a selected product, or remove empty rows.");
            return;
        }

        // Open custom save confirmation modal
        setIsConfirmModalOpen(true);
    };

    const confirmSubmitQuotation = async () => {
        setIsConfirmModalOpen(false);
        setSavingQuote(true);
        try {
            // Dynamically fetch and verify the COGS/BOM Cost for each selected product
            const productsWithLatestCost = await Promise.all(selectedProductsList.map(async (item) => {
                if (!item.product) return null;
                let latestCost = Number(item.product.cost_per_unit || 0);
                try {
                    const url = item.versionId 
                        ? `/api/manufacturing/finished-goods/bom-cost?productId=${item.product.product_id}&versionId=${item.versionId}`
                        : `/api/manufacturing/finished-goods/bom-cost?productId=${item.product.product_id}`;
                    const resBOM = await fetch(url);
                    if (resBOM.ok) {
                        const costData = await resBOM.json();
                        if (costData && typeof costData.cost === "number" && costData.cost > 0) {
                            latestCost = costData.cost;
                        }
                    }
                } catch (err) {
                    console.error(`Error calculating dynamic BOM cost for product ${item.product.product_id}:`, err);
                }
                return {
                    ...item,
                    product: item.product,
                    resolvedCost: latestCost
                };
            }));

            const validProducts = productsWithLatestCost.filter(item => item !== null);

            const totalSelling = validProducts.reduce((sum, item) => sum + Number(item.agreedPrice || 0), 0);
            const totalCost = validProducts.reduce((sum, item) => sum + Number(item.resolvedCost || 0), 0);

            // Construct Philippine Time (PHT, UTC+8) date representation
            const dateUTC = new Date();
            const datePHT = new Date(dateUTC.getTime() + (8 * 60 * 60 * 1000));
            const quoteDateStr = datePHT.toISOString().replace(/Z$/, "");

            let resolvedProjectId = selectedProjectId;
            if (!resolvedProjectId && projectName.trim()) {
                const matchedCust = customers.find(c => String(c.id) === selectedCustomerId);
                const customerName = matchedCust ? matchedCust.customer_name : "";
                const newProj = await registerNewProject(projectName.trim(), parseInt(selectedCustomerId), customerName);
                if (newProj && newProj.id) {
                    resolvedProjectId = newProj.id;
                }
            }

            const header = {
                quote_number: quoteNumber.trim(),
                customer_id: parseInt(selectedCustomerId),
                project_id: resolvedProjectId,
                price_type_id: selectedPriceTypeId ? parseInt(selectedPriceTypeId) : null,
                frozen_price_type_name: selectedPriceTypeId ? priceTypes.find(pt => String(pt.price_type_id) === selectedPriceTypeId)?.price_type_name || null : null,
                total_selling_price: totalSelling,
                total_simulated_cost: totalCost,
                forex_rate_used: 61.39,
                remarks: remarks || "",
                quote_date: quoteDateStr
            };

            const snapshots = validProducts.map(item => {
                let pName = null;
                let pType = null;
                
                if (item.parent_product_id) {
                    const pMatch = allProducts.find(p => p.product_id === item.parent_product_id) || catalogProducts.find(p => p.product_id === item.parent_product_id);
                    if (pMatch) pName = pMatch.product_name;
                }
                if (item.product_type_id) {
                    const tMatch = productTypes.find(pt => pt.id === item.product_type_id);
                    if (tMatch) pType = String(tMatch.name);
                }

                return {
                    product_id: item.product.product_id,
                    parent_id: item.parent_product_id || null,
                    parent_product_name: pName || null,
                    product_type_id: item.product_type_id || null,
                    product_type_name: pType || null,
                    version_id: item.versionId || 1, // Store the selected version ID
                    node_name: item.product.product_name,
                    node_type: "product_quota",
                    quantity: 1,
                    uom: item.product.unit_of_measurement?.unit_shortcut || (item.product as unknown as Record<string, unknown>).unit_shortcut || "PCS",
                    frozen_unit_cost_php: item.resolvedCost,
                    frozen_total_cost_php: item.agreedPrice // Save the target agreed price into the cost snapshot tree for quote tracking
                };
            });

            const res = await fetch("/api/manufacturing/finished-goods/quotes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ header, snapshots })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to save quotation");
            }

            toast.success(`Quotation ${quoteNumber} saved successfully!`);
            setView("list");
            loadQuotes();
        } catch (e) {
            console.error("Save quotation error:", e);
            toast.error(e instanceof Error ? e.message : "Error saving quotation");
        } finally {
            setSavingQuote(false);
        }
    };

    const handlePrintQuotation = () => {
        if (!selectedQuote) return;
        
        let customerName = "Unknown Customer";
        if (selectedQuote.customer_id) {
            customerName = typeof selectedQuote.customer_id === "object" && 'customer_name' in selectedQuote.customer_id
                ? selectedQuote.customer_id.customer_name
                : customers.find(c => String(c.id) === String(selectedQuote.customer_id))?.customer_name || "Unknown Customer";
        }

        let projNameStr = "Unknown Project";
        if (selectedQuote.project_id) {
            projNameStr = typeof selectedQuote.project_id === "object" && 'project_name' in selectedQuote.project_id
                ? selectedQuote.project_id.project_name
                : allProjects.find(p => p.projectId === Number((selectedQuote.project_id as unknown as Record<string, unknown>)?.id || selectedQuote.project_id))?.projectName || "Unknown Project";
        }

        const priceTypeName = priceTypes.find(pt => pt.price_type_id.toString() === selectedPriceTypeId)?.price_type_name || "Custom Price Tier";

        // Extract dynamically fetched creator name, fallback to local session if missing
        let createdByStr = selectedQuote.created_by_name;
        if (!createdByStr || createdByStr === "System Admin") {
            try {
                const sessionUser = localStorage.getItem("user_name") || localStorage.getItem("user_fname");
                if (sessionUser) createdByStr = sessionUser;
            } catch {
                // ignore
            }
        }
        if (!createdByStr) createdByStr = "System Admin";

        // Map snapshots to include accurate type and version strings from catalog
        const resolvedSnapshots = snapshots.map(snap => {
            const prodMatch = allProducts.find(p => String(p.product_id) === String(snap.product_id)) || catalogProducts.find(p => String(p.product_id) === String(snap.product_id));
            
            let typeName = snap.product_type_name || "Finished Goods";
            if (!snap.product_type_name && prodMatch) {
                let pTypeId = prodMatch.product_type ? Number(prodMatch.product_type) : undefined;
                if (!pTypeId && prodMatch.parent_product_id) {
                    const parentProd = allProducts.find(p => String(p.product_id) === String(prodMatch.parent_product_id));
                    if (parentProd && parentProd.product_type) {
                        pTypeId = Number(parentProd.product_type);
                    }
                }
                const ptMatch = productTypes.find(pt => pt.id === pTypeId);
                if (ptMatch) typeName = String(ptMatch.name);
            }

            const versionName = snap.version_name || "v1.0";
            if (prodMatch && (prodMatch as unknown as Record<string, unknown>).has_versions) {
                // If the product has versions, and the snapshot has a version_id but no version_name, try to find it
                // (Though usually the snapshot will have version_name saved, we fallback just in case)
            }

            return {
                node_name: snap.node_name,
                type_name: typeName,
                version_name: versionName,
                uom: snap.uom,
                frozen_unit_cost_php: snap.frozen_unit_cost_php,
                frozen_total_cost_php: snap.frozen_total_cost_php
            };
        });

        generateQuotationPDF({
            quote: selectedQuote,
            snapshots: resolvedSnapshots,
            customerName,
            projectName: projNameStr,
            priceTypeName,
            createdByName: createdByStr
        });
        
        toast.success("Simulation Report PDF generated!");
    };

    // Reset current page when query changes
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery]);

    // Filtered products list for selector searchbox using debounced search and grouped/sorted by Parent Product Family
    const filteredCatalog = useMemo(() => {
        const filtered = catalogProducts.filter(p => 
            p.product_name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            (p.product_code || "").toLowerCase().includes(debouncedSearchQuery.toLowerCase())
        );

        // Sort by Parent Product Name (Product Family hierarchy) first, then by individual variation Name
        return [...filtered].sort((a, b) => {
            const familyA = a.parent_id?.product_name || a.product_name;
            const familyB = b.parent_id?.product_name || b.product_name;
            const famCompare = familyA.localeCompare(familyB);
            if (famCompare !== 0) return famCompare;
            return a.product_name.localeCompare(b.product_name);
        });
    }, [catalogProducts, debouncedSearchQuery]);

    const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage);
    
    const paginatedCatalog = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredCatalog.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredCatalog, currentPage]);

    // Virtual Project Portfolio List: maps each project_name to a single portfolio
    const allProjects = useMemo(() => {
        const projectMap = new Map<string, { projectId: number; projectName: string; customerId: number; customerName: string; customerCode: string; projectStatus: string; quoteCount: number; latest: QuotationHeader; history: QuotationHeader[] }>();
        
        quotes.forEach(q => {
            const projObj = q.project_id && typeof q.project_id === "object" ? q.project_id as Project : null;
            const key = projObj?.project_name || `No Project Name`;
            if (key === "No Project Name") return;
            
            const cust = q.customer_id && typeof q.customer_id === "object" ? q.customer_id as Customer : null;
            const custId = cust ? Number(cust.id) : Number(q.customer_id || 0);
            const custName = cust ? cust.customer_name : `Customer ID: ${q.customer_id}`;
            const custCode = cust ? cust.customer_code : "";
            
            if (!projectMap.has(key)) {
                projectMap.set(key, {
                    projectId: projObj ? Number(projObj.id) : 0,
                    projectName: key,
                    customerId: custId,
                    customerName: custName,
                    customerCode: custCode,
                    projectStatus: projObj?.status || "Draft",
                    quoteCount: 1,
                    latest: q,
                    history: [q]
                });
            } else {
                const group = projectMap.get(key)!;
                group.quoteCount += 1;
                group.history.push(q);
                const currTime = group.latest.quote_date ? new Date(group.latest.quote_date).getTime() : 0;
                const checkTime = q.quote_date ? new Date(q.quote_date).getTime() : 0;
                if (checkTime > currTime) {
                    group.latest = q;
                }
            }
        });
        
        // Also add database projects that don't have quotes yet!
        localProjects.forEach(lp => {
            if (!projectMap.has(lp.project_name)) {
                projectMap.set(lp.project_name, {
                    projectId: lp.id,
                    projectName: lp.project_name,
                    customerId: lp.customer_id,
                    customerName: lp.customer_name,
                    customerCode: lp.customer_code || "",
                    projectStatus: lp.status || "Draft",
                    quoteCount: 0,
                    latest: {
                        id: 0,
                        quote_number: "No Quotes Yet",
                        customer_id: lp.customer_id,
                        total_selling_price: 0,
                        total_simulated_cost: 0,
                        forex_rate_used: 61.39,
                        status: "Draft",
                        project_id: {
                            id: lp.id,
                            project_name: lp.project_name,
                            customer_code: lp.customer_code
                        }
                    },
                    history: []
                });
            }
        });
        
        return Array.from(projectMap.values());
    }, [quotes, localProjects]);

    return {
        view,
        setView,
        quotes,
        loadingQuotes,
        selectedQuote,
        setSelectedQuote,
        snapshots,
        loadingSnapshots,
        isDetailModalOpen,
        setIsDetailModalOpen,
        customers,
        setCustomers,
        selectedCustomerId,
        customerSearchText,
        quoteNumber,
        setQuoteNumber,
        remarks,
        setRemarks,
        projectName,
        setProjectName,
        selectedProjectId,
        setSelectedProjectId,
        priceTypes,
        selectedPriceTypeId,
        setSelectedPriceTypeId,
        catalogProducts,
        loadingProducts,
        selectedProductsList,
        searchQuery,
        setSearchQuery,
        currentPage,
        setCurrentPage,
        priceTypeRatesMap,
        savingQuote,
        loadQuotes,
        viewQuoteDetails,
        initCreateFlow,
        reviseQuotation,
        handlePrintQuotation,
        isConfirmModalOpen,
        setIsConfirmModalOpen,
        isPriceTypeWarningOpen,
        handlePriceTypeChange,
        confirmPriceTypeChange,
        cancelPriceTypeChange,
        addProductToQuote,
        removeProductFromQuote,
        handleAgreedPriceChange,
        handleSearchCustomers,
        selectCustomer,
        submitQuotation,
        confirmSubmitQuotation,
        productTypes,
        allProducts,
        addEmptyRow,
        updateRow,
        handleRowProductSelect,
        filteredCatalog,
        totalPages,
        paginatedCatalog,
        changeProductVersion,
        showValidationErrors,
        setShowValidationErrors,
        localProjects,
        registerNewProject,
        allProjects,
        startCreateQuoteForProject
    };
}
