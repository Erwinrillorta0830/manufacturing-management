/* eslint-disable */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
    Boxes,
    History,
    AlertTriangle,
    // disabled-lint-next-line @typescript-eslint/no-unused-vars
    CheckCircle,
    Search,
    // disabled-lint-next-line @typescript-eslint/no-unused-vars
    Filter,
    TrendingDown,
    Calendar,
    ArrowUpRight,
    ArrowDownLeft,
    Layers,
    Loader2,
    RefreshCw,
    // disabled-lint-next-line @typescript-eslint/no-unused-vars
    ShieldAlert,
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Tag,
    Sliders,
    Plus,
    X,
    Bookmark
} from "lucide-react";
// disabled-lint-next-line @typescript-eslint/no-unused-vars
interface LedgerItem {
    id: number;
    product_id: number;
    transaction_type: string;
    quantity: number;
    balance_after: number;
    created_date: string;
    reference_no?: string;
    remarks?: string;
}

interface BatchItem {
    line_id: number;
    product_id: number;
    branch_id: number;
    lot_number: string;
    expiration_date: string | null;
    quantity_received: number;
    base_unit_cost_php: number;
    final_landed_unit_cost?: number;
    branch_name?: string;
    expiryStatus?: string;
    daysToExpiry?: number;
}

export default function InventoryModule() {
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<{ ledger: any[]; batches: any[]; products: any[]; branches: any[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"stock" | "batches" | "ledger" | "picking" | "receiving">("stock");
    const [ledgerType, setLedgerType] = useState<"raw" | "fg">("raw");
    const [filterBranch, setFilterBranch] = useState("all");
    const [filterBrand, setFilterBrand] = useState("all");
    const [filterCategory, setFilterCategory] = useState("all");
    const [filterProduct, setFilterProduct] = useState("all");
    const [filterStartDate, setFilterStartDate] = useState("");
    const [filterEndDate, setFilterEndDate] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [lowStockFilter, setLowStockFilter] = useState(false);
    const [expiryFilter, setExpiryFilter] = useState<"all" | "active" | "soon" | "expired">("all");
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
    const [expandedBatches, setExpandedBatches] = useState<Record<number, boolean>>({});
    const [expandedLedgers, setExpandedLedgers] = useState<Record<number, boolean>>({});
    const [flashStates, setFlashStates] = useState<Record<number, "up" | "down">>({});
    const prevStocksRef = React.useRef<Record<number, number>>({});

    // Stock adjustment modal states
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [adjProductId, setAdjProductId] = useState("");
    const [adjBranchId, setAdjBranchId] = useState("1");
    const [adjQty, setAdjQty] = useState("");
    const [adjType, setAdjType] = useState("Stock Take Reconciliation");
    const [adjRemarks, setAdjRemarks] = useState("");
    const [adjDate, setAdjDate] = useState(new Date().toISOString().split("T")[0]);
    const [submittingAdj, setSubmittingAdj] = useState(false);

    // Picking & Receiving States
    const [pickingList, setPickingList] = useState<any[]>([]);
    const [receivingJOs, setReceivingJOs] = useState<any[]>([]);
    const [pickingLoading, setPickingLoading] = useState(false);
    const [receivingLoading, setReceivingLoading] = useState(false);

    // Modals & Active selections
    const [isPickingModalOpen, setIsPickingModalOpen] = useState(false);
    const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
    const [selectedPickingJO, setSelectedPickingJO] = useState<any | null>(null);
    const [selectedReceivingJO, setSelectedReceivingJO] = useState<any | null>(null);

    // Picking form state
    const [pickingSubmitting, setPickingSubmitting] = useState(false);

    // Receiving form state
    const [recQtyProduced, setRecQtyProduced] = useState("");
    const [recLotNumber, setRecLotNumber] = useState("");
    const [recExpirationDate, setRecExpirationDate] = useState("");
    const [recUnitCost, setRecUnitCost] = useState("");
    const [recSubmitting, setRecSubmitting] = useState(false);

    // Yield Allocation & Cost Variance output states (after successful receiving)
    const [receivingResult, setReceivingResult] = useState<any | null>(null);
    const [showReceivingResult, setShowReceivingResult] = useState(false);

    const loadPickingData = async () => {
        setPickingLoading(true);
        try {
            const res = await fetch("/api/manufacturing/inventory/picking");
            if (res.ok) {
                setPickingList(await res.json());
            } else {
                throw new Error("Failed to load picking data.");
            }
        } catch (e: any) {
            toast.error(e.message || "Failed to load picking lists.");
        } finally {
            setPickingLoading(false);
        }
    };

    const loadReceivingData = async () => {
        setReceivingLoading(true);
        try {
            const res = await fetch("/api/manufacturing/inventory/receiving");
            if (res.ok) {
                setReceivingJOs(await res.json());
            } else {
                throw new Error("Failed to load receiving job orders.");
            }
        } catch (e: any) {
            toast.error(e.message || "Failed to load receiving job orders.");
        } finally {
            setReceivingLoading(false);
        }
    };

    const handleConfirmPick = async (jo: any) => {
        if (!jo || !jo.allocationResults || jo.allocationResults.length === 0) {
            toast.error("No FIFO allocation results found for this Job Order. Schedulers must run the allocation check first.");
            return;
        }

        const itemsToPick: any[] = [];
        jo.allocationResults.forEach((alloc: any) => {
            const productId = alloc.component_product_id;
            if (alloc.batches && Array.isArray(alloc.batches)) {
                alloc.batches.forEach((b: any) => {
                    itemsToPick.push({
                        productId,
                        lotNumber: b.lot_number,
                        quantity: b.quantity
                    });
                });
            }
        });

        if (itemsToPick.length === 0) {
            toast.warning("No materials are allocated to pick for this Job Order.");
            return;
        }

        if (!jo.branch_id) {
            toast.error("Error: Job Order is missing branch_id allocation.");
            return;
        }

        setPickingSubmitting(true);
        try {
            const res = await fetch("/api/manufacturing/inventory/picking", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    joId: jo.jo_id,
                    branchId: Number(jo.branch_id),
                    items: itemsToPick
                })
            });

            if (res.ok) {
                toast.success(`Successfully picked and transferred stock to WIP for ${jo.jo_id}!`);
                setIsPickingModalOpen(false);
                loadPickingData();
                loadInventoryData();
            } else {
                const result = await res.json();
                throw new Error(result.error || "Failed to process pick.");
            }
        } catch (err: any) {
            toast.error(err.message || "An error occurred during picking.");
        } finally {
            setPickingSubmitting(false);
        }
    };

    const handleConfirmReceiving = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedReceivingJO) return;

        const qty = parseFloat(recQtyProduced);
        if (isNaN(qty) || qty <= 0) {
            toast.warning("Please enter a valid yield quantity.");
            return;
        }

        setRecSubmitting(true);
        try {
            const res = await fetch("/api/manufacturing/inventory/receiving", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    joId: selectedReceivingJO.jo_id,
                    productId: selectedReceivingJO.product_id,
                    quantityProduced: qty,
                    lotNumber: recLotNumber,
                    expirationDate: recExpirationDate,
                    unitCost: parseFloat(recUnitCost) || 0
                })
            });

            const result = await res.json();

            if (res.ok && result.success) {
                toast.success(`Yield received and Job Order ${selectedReceivingJO.jo_id} closed successfully!`);
                setReceivingResult(result);
                setShowReceivingResult(true);
                loadReceivingData();
                loadInventoryData();
            } else {
                throw new Error(result.error || "Failed to receive yield.");
            }
        } catch (err: any) {
            toast.error(err.message || "An error occurred during yield receiving.");
        } finally {
            setRecSubmitting(false);
        }
    };

    // Tab change loader hook
    useEffect(() => {
        if (activeTab === "picking") {
            loadPickingData();
        } else if (activeTab === "receiving") {
            loadReceivingData();
        }
    }, [activeTab]);

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({ ...prev, [key]: prev[key] === false }));
    };
    const isExpanded = (key: string) => {
        return expandedGroups[key] !== false; // default to true
    };
    const toggleProductExpand = (prodId: number) => {
        setExpandedProducts(prev => ({ ...prev, [prodId]: !prev[prodId] }));
    };
    const toggleBatchExpand = (batchId: number) => {
        setExpandedBatches(prev => ({ ...prev, [batchId]: !prev[batchId] }));
    };
    const toggleLedgerExpand = (ledgerId: number) => {
        setExpandedLedgers(prev => ({ ...prev, [ledgerId]: !prev[ledgerId] }));
    };

    const loadInventoryData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/manufacturing/inventory");
            if (res.ok) {
                setData(await res.json());
            } else {
                throw new Error("Failed to load inventory logs from server");
            }
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            toast.error(e.message || "Failed to load inventory.");
        } finally {
            setLoading(false);
        }
    };

    const handlePostAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjProductId || !adjQty) {
            toast.warning("Please select a product and input quantity.");
            return;
        }

        const qty = parseFloat(adjQty);
        if (isNaN(qty) || qty === 0) {
            toast.warning("Please enter a valid non-zero quantity.");
            return;
        }

        setSubmittingAdj(true);
        try {
            const res = await fetch("/api/manufacturing/inventory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId: Number(adjProductId),
                    branchId: Number(adjBranchId),
                    quantity: qty,
                    documentType: adjType,
                    documentDescription: adjRemarks,
                    documentDate: adjDate
                })
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.error || "Failed to submit stock adjustment.");
            }

            toast.success("Stock adjustment successfully posted!");
            setIsAdjustmentModalOpen(false);
            // Reset form
            setAdjProductId("");
            setAdjQty("");
            setAdjRemarks("");

            // Reload inventory
            loadInventoryData();
        } catch (err) {
            toast.error((err as Error).message || "An error occurred.");
        } finally {
            setSubmittingAdj(false);
        }
    };

    useEffect(() => {
        // 1. Initial Load
        loadInventoryData();

        // 2. Establish Realtime WebSocket Connection
        let ws: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDisposed = false;
        let reconnectAttempts = 0;

        const connectWebSocket = () => {
            if (isDisposed) return;
            if (reconnectAttempts >= 10) {
                console.warn("[Directus Realtime] Maximum reconnect attempts reached (10). Standing by.");
                return;
            }

            try {
                const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://vtc:8074";
                const wsUrl = `${baseUrl.replace(/^http/, "ws")}/websocket`;

                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log("[Directus Realtime] Connected to WebSocket");
                    reconnectAttempts = 0; // Reset on successful connection

                    // Authenticate with the server using the static token 'test'
                    ws?.send(JSON.stringify({
                        type: "auth",
                        access_token: "test"
                    }));
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);

                        // Handle authentication success -> Subscribe to collections
                        if (msg.type === "auth" && msg.status === "ok") {
                            console.log("[Directus Realtime] Authenticated successfully");

                            // Subscribe to inventory_movements
                            ws?.send(JSON.stringify({
                                type: "subscribe",
                                collection: "inventory_movements",
                                query: { fields: ["*"] }
                            }));

                            // Subscribe to product_ledger
                            ws?.send(JSON.stringify({
                                type: "subscribe",
                                collection: "product_ledger",
                                query: { fields: ["*"] }
                            }));
                        }

                        // Handle event message -> Trigger silent refresh
                        if (msg.type === "subscription" && (msg.event === "create" || msg.event === "update" || msg.event === "delete")) {
                            console.log(`[Directus Realtime] Event detected (${msg.event} on ${msg.collection}). Refreshing dashboard...`);

                            // Silent API refresh
                            fetch("/api/manufacturing/inventory")
                                .then(res => res.ok ? res.json() : null)
                                .then(json => {
                                    if (json) setData(json);
                                })
                                .catch(() => { });
                        }
                    } catch (e) {
                        console.error("[Directus Realtime] Error parsing WebSocket message:", e);
                    }
                };

                ws.onclose = () => {
                    ws = null;
                    if (!isDisposed && reconnectAttempts < 10) {
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                        console.log(`[Directus Realtime] WebSocket closed. Attempting reconnect ${reconnectAttempts}/10 in ${delay}ms...`);
                        reconnectTimeout = setTimeout(connectWebSocket, delay);
                    }
                };

                ws.onerror = (errorEvent) => {
                    const errorMessage = errorEvent instanceof Error ? errorEvent.message : "Connection refused or network down";
                    // Downgraded to warn: WS errors are expected when the Directus realtime endpoint
                    // is unreachable (e.g. dev mode, network drop). Reconnection is handled by onclose.
                    console.warn("[Directus Realtime] WebSocket unavailable:", errorMessage);
                };

            } catch {
                if (!isDisposed && reconnectAttempts < 10) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    reconnectTimeout = setTimeout(connectWebSocket, delay);
                }
            }
        };

        connectWebSocket();

        // 3. Fallback Polling interval (every 10s as a secondary sync layer)
        const pollInterval = setInterval(() => {
            if (document.visibilityState === "visible") {
                fetch("/api/manufacturing/inventory")
                    .then(res => res.ok ? res.json() : null)
                    .then(json => {
                        if (json) setData(json);
                    })
                    .catch(() => { });
            }
        }, 10000);

        return () => {
            isDisposed = true;
            if (ws) {
                ws.close();
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            clearInterval(pollInterval);
        };
    }, []);

    useEffect(() => {
        if (!data) return;
        const { ledger } = data;

        // Compute new stock levels map
        const newStocks: Record<number, number> = {};
        // disabled-lint-next-line @typescript-eslint/no-explicit-any
        ledger.forEach((entry: any) => {
            const pId = Number(entry.productId);
            const qty = Number(entry.quantity) || 0;
            newStocks[pId] = (newStocks[pId] || 0) + qty;
        });

        // Compare with previous stocks
        const newFlashStates: Record<number, "up" | "down"> = {};
        let hasChanges = false;

        Object.entries(newStocks).forEach(([pIdStr, newQty]) => {
            const pId = Number(pIdStr);
            const oldQty = prevStocksRef.current[pId];
            if (oldQty !== undefined && oldQty !== newQty) {
                newFlashStates[pId] = newQty > oldQty ? "up" : "down";
                hasChanges = true;

                // Trigger toast notification
                // disabled-lint-next-line @typescript-eslint/no-explicit-any
                const prod = data.products.find((p: any) => Number(p.product_id) === pId);
                const prodName = prod ? prod.product_name : `Product #${pId}`;
                const diff = Math.abs(newQty - oldQty);
                if (newQty > oldQty) {
                    toast.success(`Stock increased for ${prodName} (+${diff.toLocaleString()})`);
                } else {
                    toast.info(`Stock decreased for ${prodName} (-${diff.toLocaleString()})`);
                }
            }
        });

        if (hasChanges) {
            setFlashStates(prev => ({ ...prev, ...newFlashStates }));

            // Clear flash animation state after 2.5 seconds
            const timer = setTimeout(() => {
                setFlashStates(prev => {
                    const next = { ...prev };
                    Object.keys(newFlashStates).forEach(k => {
                        delete next[Number(k)];
                    });
                    return next;
                });
            }, 2500);

            return () => clearTimeout(timer);
        }

        // Save current stocks for next comparison
        prevStocksRef.current = newStocks;
    }, [data]);

    // 1. Group ledger to get current stock levels per product
    const stockLevels = useMemo(() => {
        if (!data) return [];
        const { ledger, products } = data;

        const stockMap: Record<number, { qty: number; branches: Record<number, number> }> = {};

        ledger.forEach(entry => {
            const entryDate = entry.documentDate || entry.date_added || "";
            if (filterStartDate && entryDate < filterStartDate) return;
            if (filterEndDate && entryDate > filterEndDate) return;

            const pId = Number(entry.productId);
            const qty = Number(entry.quantity) || 0;
            const bId = Number(entry.branchId);

            if (!stockMap[pId]) {
                stockMap[pId] = { qty: 0, branches: {} };
            }
            stockMap[pId].qty += qty;
            stockMap[pId].branches[bId] = (stockMap[pId].branches[bId] || 0) + qty;
        });

        return products.map(prod => {
            const stockInfo = stockMap[Number(prod.product_id)] || { qty: 0, branches: {} };
            const currentStock = filterBranch === "all" ? stockInfo.qty : (stockInfo.branches[Number(filterBranch)] || 0);
            return {
                ...prod,
                currentStock,
                branchStocks: stockInfo.branches
            };
        }).filter(item => {
            const matchesLedgerType = ledgerType === "fg" ? !!item.is_finished_good : !item.is_finished_good;
            if (!matchesLedgerType) return false;

            const brandName = item.product_brand?.brand_name || "Generic Brand";
            const categoryName = item.product_category?.category_name || "Unassigned Category";

            const query = searchQuery.toLowerCase();
            const matchesQuery = item.product_name.toLowerCase().includes(query) ||
                item.product_code.toLowerCase().includes(query) ||
                brandName.toLowerCase().includes(query) ||
                categoryName.toLowerCase().includes(query);

            const matchesLowStock = !lowStockFilter || item.currentStock < 50;
            const matchesBrand = filterBrand === "all" || brandName === filterBrand;
            const matchesCategory = filterCategory === "all" || categoryName === filterCategory;
            const matchesProduct = filterProduct === "all" || String(item.product_id) === filterProduct;
            const matchesBranch = filterBranch === "all" || (item.branchStocks[Number(filterBranch)] !== undefined && item.branchStocks[Number(filterBranch)] > 0);

            return matchesQuery && matchesLowStock && matchesBrand && matchesCategory && matchesProduct && matchesBranch;
        });
    }, [data, searchQuery, lowStockFilter, ledgerType, filterBranch, filterBrand, filterCategory, filterProduct, filterStartDate, filterEndDate]);

    // Grouping category > brand > product
    const groupedStock = useMemo(() => {
        const categories: Record<string, Record<string, typeof stockLevels>> = {};

        stockLevels.forEach(prod => {
            const cat = prod.product_category?.category_name || "Unassigned Category";
            const brand = prod.product_brand?.brand_name || "Generic Brand";

            if (!categories[cat]) {
                categories[cat] = {};
            }
            if (!categories[cat][brand]) {
                categories[cat][brand] = [];
            }
            categories[cat][brand].push(prod);
        });

        return categories;
    }, [stockLevels]);

    // 2. Consolidated FIFO product batches (Main table & Dropdown table)
    const productBatchesGrouped = useMemo(() => {
        if (!data) return [];
        const { batches, products, branches = [] } = data;

        const groupedMap: Record<number, typeof batches> = {};
        batches.forEach(b => {
            const pId = Number(b.product_id);
            if (!groupedMap[pId]) {
                groupedMap[pId] = [];
            }
            groupedMap[pId].push(b);
        });

        return products.map(prod => {
            const prodBatches = groupedMap[Number(prod.product_id)] || [];

            const mappedBatches = prodBatches.map(b => {
                const branchObj = branches.find(br => Number(br.id) === Number(b.branch_id));
                const branchName = branchObj ? branchObj.branch_name : (Number(b.branch_id) === 1 || Number(b.branch_id) === 183 ? "Main Branch" : Number(b.branch_id) === 163 ? "Urdaneta Branch" : `Branch #${b.branch_id}`);

                const daysToExpiry = b.expiration_date
                    ? Math.ceil((new Date(b.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                    : null;

                let status: "active" | "soon" | "expired" = "active";
                if (daysToExpiry !== null) {
                    if (daysToExpiry < 0) status = "expired";
                    else if (daysToExpiry <= 90) status = "soon";
                }

                return {
                    ...b,
                    branch_name: branchName,
                    daysToExpiry,
                    expiryStatus: status
                };
            });

            const totalStock = mappedBatches.reduce((sum, b) => sum + Number(b.quantity_received || 0), 0);
            const totalValue = mappedBatches.reduce((sum, b) => sum + (Number(b.quantity_received || 0) * Number(b.final_landed_unit_cost || b.base_unit_cost_php || 0)), 0);

            // Find oldest active batch expiry
            const activeExpirations = mappedBatches
                .map(b => b.expiration_date)
                .filter(Boolean) as string[];
            const oldestExpiry = activeExpirations.length > 0
                ? activeExpirations.sort()[0]
                : null;

            return {
                ...prod,
                batches: mappedBatches,
                totalStock,
                totalValue,
                batchesCount: mappedBatches.length,
                oldestExpiry
            };
        }).filter(p => {
            const matchesLedgerType = ledgerType === "fg" ? !!p.is_finished_good : !p.is_finished_good;
            if (!matchesLedgerType) return false;

            const brandName = p.product_brand?.brand_name || "Generic Brand";
            const categoryName = p.product_category?.category_name || "Unassigned Category";

            const query = searchQuery.toLowerCase();
            const matchesQuery = p.product_name.toLowerCase().includes(query) ||
                p.product_code.toLowerCase().includes(query) ||
                brandName.toLowerCase().includes(query) ||
                categoryName.toLowerCase().includes(query) ||
                p.batches.some((b: BatchItem) => (b.lot_number || "").toLowerCase().includes(query) || (b.branch_name || "").toLowerCase().includes(query));

            if (!matchesQuery) return false;

            const matchesBranch = filterBranch === "all" || p.batches.some((b: BatchItem) => String(b.branch_id) === filterBranch);
            const matchesBrand = filterBrand === "all" || brandName === filterBrand;
            const matchesCategory = filterCategory === "all" || categoryName === filterCategory;
            const matchesProduct = filterProduct === "all" || String(p.product_id) === filterProduct;

            const matchesDateRange = p.batches.length === 0 || p.batches.some((b: BatchItem) => {
                const expDate = b.expiration_date || "";
                const matchesStartDate = !filterStartDate || !expDate || expDate >= filterStartDate;
                const matchesEndDate = !filterEndDate || !expDate || expDate <= filterEndDate;
                return matchesStartDate && matchesEndDate;
            });

            const matchesExpiry = expiryFilter === "all" || p.batches.some((b: BatchItem) => b.expiryStatus === expiryFilter);

            return matchesBranch && matchesBrand && matchesCategory && matchesProduct && matchesDateRange && matchesExpiry;
        });
    }, [data, searchQuery, expiryFilter, ledgerType, filterBranch, filterBrand, filterCategory, filterProduct, filterStartDate, filterEndDate]);

    // 3. Filtered Audit Ledger
    const filteredLedger = useMemo(() => {
        if (!data) return [];
        const { ledger, products, branches = [] } = data;

        return ledger.map(l => {
            const prod = products.find(p => Number(p.product_id) === Number(l.productId));
            const branchObj = branches.find(br => Number(br.id) === Number(l.branchId));
            const branchName = branchObj ? branchObj.branch_name : `Branch #${l.branchId}`;

            return {
                ...l,
                productName: prod?.product_name || "Unknown Product",
                productCode: prod?.product_code || "",
                unitName: prod?.unit_of_measurement?.unit_name || "Units",
                branchName: branchName,
                is_finished_good: prod?.is_finished_good,
                product_brand: prod?.product_brand,
                product_category: prod?.product_category
            };
        }).filter(l => {
            const matchesLedgerType = ledgerType === "fg" ? !!l.is_finished_good : !l.is_finished_good;
            if (!matchesLedgerType) return false;

            const brandName = l.product_brand?.brand_name || "Generic Brand";
            const categoryName = l.product_category?.category_name || "Unassigned Category";

            const query = searchQuery.toLowerCase();
            const matchesQuery = l.productName.toLowerCase().includes(query) ||
                l.productCode.toLowerCase().includes(query) ||
                (l.documentNo && l.documentNo.toLowerCase().includes(query)) ||
                (l.documentDescription && l.documentDescription.toLowerCase().includes(query)) ||
                l.branchName.toLowerCase().includes(query);

            if (!matchesQuery) return false;

            const matchesBranch = filterBranch === "all" || String(l.branchId) === filterBranch;
            const matchesBrand = filterBrand === "all" || brandName === filterBrand;
            const matchesCategory = filterCategory === "all" || categoryName === filterCategory;
            const matchesProduct = filterProduct === "all" || String(l.productId) === filterProduct;

            const entryDate = l.documentDate || l.date_added || "";
            const matchesStartDate = !filterStartDate || entryDate >= filterStartDate;
            const matchesEndDate = !filterEndDate || entryDate <= filterEndDate;

            return matchesBranch && matchesBrand && matchesCategory && matchesProduct && matchesStartDate && matchesEndDate;
        });
    }, [data, searchQuery, ledgerType, filterBranch, filterBrand, filterCategory, filterProduct, filterStartDate, filterEndDate]);

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center p-24 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-semibold">Loading manufacturing inventory dashboard...</span>
            </div>
        );
    }

    // Metrics counters
    const totalStockVal = stockLevels.reduce((sum, s) => sum + (s.currentStock * (s.cost_per_unit || 0)), 0);
    const lowStockCount = stockLevels.filter(s => s.currentStock < 50).length;
    const soonExpiredCount = data?.batches.filter(b => {
        if (!b.expiration_date) return false;
        const days = Math.ceil((new Date(b.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 90;
    }).length || 0;

    return (
        <div className="space-y-6">
            <style>{`
                @keyframes flash-green {
                    0% { background-color: rgba(16, 185, 129, 0.25); }
                    100% { background-color: transparent; }
                }
                @keyframes flash-red {
                    0% { background-color: rgba(239, 68, 68, 0.25); }
                    100% { background-color: transparent; }
                }
                .animate-flash-up {
                    animation: flash-green 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .animate-flash-down {
                    animation: flash-red 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
            {/* KPI metrics bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Estimated Stock Value</span>
                        <h4 className="text-lg font-black text-foreground mt-1">₱{totalStockVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Based on active standard costs</span>
                    </div>
                    <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                        <Boxes className="h-5 w-5 text-emerald-500" />
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Consolidated SKUs</span>
                        <h4 className="text-lg font-black text-foreground mt-1">{stockLevels.length} Products</h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Active catalog items</span>
                    </div>
                    <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                        <Layers className="h-5 w-5 text-primary" />
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Shortages & Low Stock</span>
                        <h4 className="text-lg font-black text-amber-500 mt-1">{lowStockCount} Items</h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Stock balance &lt; 50 units</span>
                    </div>
                    <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                        <TrendingDown className="h-5 w-5 text-amber-500" />
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Lots Expiring (90 days)</span>
                        <h4 className="text-lg font-black text-rose-500 mt-1">{soonExpiredCount} Batches</h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Active FIFO inventory warning</span>
                    </div>
                    <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                        <AlertTriangle className="h-5 w-5 text-rose-500" />
                    </div>
                </div>
            </div>

            {/* View navigation & Controls */}
            <div className="border border-border rounded-xl bg-card p-4 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-3">
                    <div className="flex bg-muted/40 border border-border p-1 rounded-lg gap-1 overflow-x-auto max-w-full">
                        <button
                            onClick={() => { setActiveTab("stock"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "stock" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                        >
                            <Boxes className="h-4 w-4" /> Stock Balances
                        </button>
                        <button
                            onClick={() => { setActiveTab("batches"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "batches" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                        >
                            <Calendar className="h-4 w-4" /> FIFO Batches
                        </button>
                        <button
                            onClick={() => { setActiveTab("ledger"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "ledger" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                        >
                            <History className="h-4 w-4" /> Audit Ledger
                        </button>
                        <button
                            onClick={() => { setActiveTab("picking"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "picking" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                        >
                            <ArrowUpRight className="h-4 w-4" /> Material Picking
                        </button>
                        <button
                            onClick={() => { setActiveTab("receiving"); setSearchQuery(""); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 shrink-0 ${activeTab === "receiving" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                }`}
                        >
                            <ArrowDownLeft className="h-4 w-4" /> Yield Receiving
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-lg uppercase tracking-wider shadow-xs">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            Live
                        </div>
                        <button
                            onClick={() => setIsAdjustmentModalOpen(true)}
                            className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all border-none cursor-pointer shadow-xs"
                        >
                            <Sliders className="h-3.5 w-3.5" /> Post Adjustment
                        </button>
                        <button
                            onClick={loadInventoryData}
                            className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                            disabled={loading}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Sync stock
                        </button>
                    </div>
                </div>
                {(activeTab === "stock" || activeTab === "batches" || activeTab === "ledger") && (
                    <>
                        {/* Ledger Switcher */}
                        <div className="flex bg-muted/50 border border-border p-0.5 rounded-lg w-fit">
                            <button
                                type="button"
                                onClick={() => {
                                    setLedgerType("raw");
                                    setFilterProduct("all");
                                }}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${ledgerType === "raw" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                    }`}
                            >
                                <Boxes className="h-4 w-4" /> Raw Materials & Packaging Items
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setLedgerType("fg");
                                    setFilterProduct("all");
                                }}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${ledgerType === "fg" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground bg-transparent"
                                    }`}
                            >
                                <Layers className="h-4 w-4" /> Finished Goods
                            </button>
                        </div>

                        {/* Advanced Multi-Criteria Filters */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-muted/20 p-3 rounded-lg border border-border">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Branch</label>
                                <select
                                    value={filterBranch}
                                    onChange={(e) => setFilterBranch(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                                >
                                    <option value="all">All Branches</option>
                                    {data?.branches?.map(b => (
                                        <option key={b.id} value={String(b.id)}>{b.branch_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Brand</label>
                                <select
                                    value={filterBrand}
                                    onChange={(e) => setFilterBrand(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                                >
                                    <option value="all">All Brands</option>
                                    {Array.from(new Set(data?.products?.map(p => p.product_brand?.brand_name).filter(Boolean))).map(brand => (
                                        <option key={String(brand)} value={String(brand)}>{String(brand)}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Category</label>
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                                >
                                    <option value="all">All Categories</option>
                                    {Array.from(new Set(data?.products?.map(p => p.product_category?.category_name).filter(Boolean))).map(cat => (
                                        <option key={String(cat)} value={String(cat)}>{String(cat)}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Product</label>
                                <select
                                    value={filterProduct}
                                    onChange={(e) => setFilterProduct(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground font-semibold outline-none"
                                >
                                    <option value="all">All Products</option>
                                    {data?.products?.filter(p => ledgerType === "fg" ? p.is_finished_good : !p.is_finished_good).map(p => (
                                        <option key={p.product_id} value={String(p.product_id)}>{p.product_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">Start Date</label>
                                <input
                                    type="date"
                                    value={filterStartDate}
                                    onChange={(e) => setFilterStartDate(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-foreground outline-none font-semibold"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">End Date</label>
                                <input
                                    type="date"
                                    value={filterEndDate}
                                    onChange={(e) => setFilterEndDate(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-foreground outline-none font-semibold"
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* Filter section */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search by product name, code, brand, or lot number..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>

                    {activeTab === "stock" && (
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="lowStockChk"
                                checked={lowStockFilter}
                                onChange={(e) => setLowStockFilter(e.target.checked)}
                                className="h-4 w-4 rounded bg-background border-slate-800 text-primary accent-primary"
                            />
                            <label htmlFor="lowStockChk" className="text-xs text-muted-foreground font-bold select-none cursor-pointer">
                                Low Stock (&lt;50) only
                            </label>
                        </div>
                    )}

                    {activeTab === "batches" && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground font-bold">Expiry Status:</span>
                            <select
                                value={expiryFilter}
                                // disabled-lint-next-line @typescript-eslint/no-explicit-any
                                onChange={(e: any) => setExpiryFilter(e.target.value)}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground font-semibold outline-none"
                            >
                                <option value="all">All Batches</option>
                                <option value="active">Safe Lots (&gt;90 days)</option>
                                <option value="soon">Expiring Soon (&le;90 days)</option>
                                <option value="expired">Expired Lots</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Tables / Lists depending on active tab */}
                <div className="overflow-x-auto">
                    {activeTab === "stock" && (
                        <div className="space-y-4">
                            {Object.keys(groupedStock).map((catName) => {
                                const catBrands = groupedStock[catName];
                                const catKey = `cat-${catName}`;
                                const catExpanded = isExpanded(catKey);

                                // Calculate category total stock and value
                                let catTotalStock = 0;
                                let catTotalValue = 0;
                                let catProductsCount = 0;

                                Object.values(catBrands).forEach(prods => {
                                    prods.forEach(p => {
                                        catTotalStock += p.currentStock;
                                        catTotalValue += p.currentStock * (p.cost_per_unit || 0);
                                        catProductsCount++;
                                    });
                                });

                                return (
                                    <div key={catName} className="border border-border rounded-xl overflow-hidden bg-muted/5">
                                        {/* Category Header */}
                                        <button
                                            onClick={() => toggleGroup(catKey)}
                                            className="w-full flex items-center justify-between bg-muted/30 p-4 border-none text-left cursor-pointer transition-all hover:bg-muted/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                {catExpanded ? <ChevronDown className="h-4.5 w-4.5 text-primary" /> : <ChevronRight className="h-4.5 w-4.5 text-primary" />}
                                                <FolderOpen className="h-4.5 w-4.5 text-amber-500" />
                                                <div>
                                                    <span className="text-xs font-extrabold text-foreground tracking-wider uppercase">{catName}</span>
                                                    <span className="text-[10px] text-muted-foreground block mt-0.5">{catProductsCount} Products</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs font-black text-foreground block">₱{catTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                <span className="text-[9px] text-muted-foreground block">Total Stock: {catTotalStock.toLocaleString()} Units</span>
                                            </div>
                                        </button>

                                        {/* Brand Level */}
                                        {catExpanded && (
                                            <div className="p-4 space-y-4 bg-muted/10 border-t border-border">
                                                {Object.keys(catBrands).map((brandName) => {
                                                    const brandProds = catBrands[brandName];
                                                    const brandKey = `brand-${catName}-${brandName}`;
                                                    const brandExpanded = isExpanded(brandKey);

                                                    const brandTotalStock = brandProds.reduce((sum, p) => sum + p.currentStock, 0);
                                                    const brandTotalValue = brandProds.reduce((sum, p) => sum + (p.currentStock * (p.cost_per_unit || 0)), 0);

                                                    return (
                                                        <div key={brandName} className="border border-border rounded-lg overflow-hidden bg-card">
                                                            {/* Brand Header */}
                                                            <button
                                                                onClick={() => toggleGroup(brandKey)}
                                                                className="w-full flex items-center justify-between bg-muted/20 px-4 py-3 border-none text-left cursor-pointer transition-all hover:bg-muted/40"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    {brandExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                                    <Tag className="h-4 w-4 text-primary" />
                                                                    <span className="text-xs font-bold text-foreground">{brandName}</span>
                                                                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-2 font-semibold">
                                                                        {brandProds.length} SKUs
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-6 text-[11px] font-bold text-foreground">
                                                                    <span>Stock: {brandTotalStock.toLocaleString()} Units</span>
                                                                    <span className="text-primary">₱{brandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                </div>
                                                            </button>

                                                            {/* Products list table */}
                                                            {brandExpanded && (
                                                                <div className="overflow-x-auto border-t border-border">
                                                                    <table className="w-full border-collapse text-left text-[11px]">
                                                                        <thead>
                                                                            <tr className="border-b border-border bg-muted/20 text-muted-foreground font-extrabold">
                                                                                <th className="py-2.5 px-4">Product details</th>
                                                                                <th className="py-2.5 px-4 text-right hidden sm:table-cell">Standard Cost</th>
                                                                                <th className="py-2.5 px-4 text-right">Stock Balance</th>
                                                                                <th className="py-2.5 px-4 text-right hidden md:table-cell">Asset Value</th>
                                                                                <th className="py-2.5 px-4">Status</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {brandProds.map((prod, idx) => {
                                                                                const assetVal = prod.currentStock * (prod.cost_per_unit || 0);
                                                                                const uom = prod.unit_of_measurement?.unit_name || "Units";
                                                                                const isLow = prod.currentStock < 50;
                                                                                const isExpanded = !!expandedProducts[Number(prod.product_id)];

                                                                                const flash = flashStates[Number(prod.product_id)];
                                                                                const trClass = `border-b border-border/40 last:border-b-0 hover:bg-muted/20 cursor-pointer select-none transition-all duration-300 ${flash === "up" ? "animate-flash-up" : flash === "down" ? "animate-flash-down" : ""
                                                                                    }`;

                                                                                return (
                                                                                    <React.Fragment key={prod.product_id || idx}>
                                                                                        <tr
                                                                                            className={trClass}
                                                                                            onClick={() => toggleProductExpand(Number(prod.product_id))}
                                                                                        >
                                                                                            <td className="py-3 px-4">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90 text-primary" : ""}`} />
                                                                                                    <div>
                                                                                                        <span className="font-bold text-foreground block">
                                                                                                            {prod.product_name}
                                                                                                            {prod.unit_of_measurement?.unit_name && (
                                                                                                                <span className="text-muted-foreground text-[10px] ml-1.5 font-normal">
                                                                                                                    ({prod.unit_of_measurement.unit_name})
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </span>
                                                                                                        <span className="text-[10px] text-muted-foreground font-mono">Code: {prod.product_code}</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="py-3 px-4 text-right font-medium text-foreground hidden sm:table-cell">₱{prod.cost_per_unit?.toFixed(2) || "0.00"}</td>
                                                                                            <td className="py-3 px-4 text-right font-extrabold">
                                                                                                <span className={prod.currentStock < 0 ? "text-red-500 flex items-center justify-end gap-1" : isLow ? "text-amber-500 animate-pulse" : "text-foreground"}>
                                                                                                    {prod.currentStock < 0 && <AlertTriangle className="h-3 w-3 text-red-500 animate-bounce" />}
                                                                                                    {prod.currentStock.toLocaleString()} {uom}
                                                                                                </span>
                                                                                            </td>
                                                                                            <td className="py-3 px-4 text-right font-bold text-foreground hidden md:table-cell">₱{assetVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                                                            <td className="py-3 px-4">
                                                                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${prod.currentStock < 0
                                                                                                        ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                                                                        : isLow
                                                                                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                                                                            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                                                                    }`}>
                                                                                                    {prod.currentStock < 0 ? "Stock Deficit" : isLow ? "Low Stock" : "Optimal"}
                                                                                                </span>
                                                                                            </td>
                                                                                        </tr>
                                                                                        {isExpanded && (
                                                                                            <tr className="bg-muted/10 border-b border-border/30">
                                                                                                <td colSpan={5} className="p-4">
                                                                                                    <div className="border-l-2 border-primary/45 pl-4 py-1.5 space-y-2">
                                                                                                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stock Breakdown by Branch</div>
                                                                                                        {Object.keys(prod.branchStocks || {}).length > 0 ? (
                                                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                                                                                {Object.entries(prod.branchStocks).map(([bId, qty]) => {
                                                                                                                    const branchObj = data?.branches?.find(br => Number(br.id) === Number(bId));
                                                                                                                    const branchName = branchObj ? branchObj.branch_name : `Branch #${bId}`;
                                                                                                                    return (
                                                                                                                        <div key={bId} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
                                                                                                                            <span className="text-[10px] font-medium text-muted-foreground">{branchName}</span>
                                                                                                                            <span className={`text-[11px] font-bold ${(qty as number) < 0 ? "text-red-400" : "text-foreground"}`}>
                                                                                                                                {(qty as number).toLocaleString()} {uom}
                                                                                                                            </span>
                                                                                                                        </div>
                                                                                                                    );
                                                                                                                })}
                                                                                                            </div>
                                                                                                        ) : (
                                                                                                            <div className="text-[10px] text-muted-foreground italic">No branch stock records.</div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </td>
                                                                                            </tr>
                                                                                        )}
                                                                                    </React.Fragment>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {stockLevels.length === 0 && (
                                <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                                    No products match search filters.
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "batches" && (
                        <table className="w-full border-collapse text-left text-xs">
                            <thead>
                                <tr className="border-b border-input text-muted-foreground">
                                    <th className="py-3 px-4 font-bold">Product Details</th>
                                    <th className="py-3 px-4 font-bold text-right">Total Stock</th>
                                    <th className="py-3 px-4 font-bold text-right hidden sm:table-cell">Landed Asset Value</th>
                                    <th className="py-3 px-4 font-bold text-center">Active Batches</th>
                                    <th className="py-3 px-4 font-bold hidden md:table-cell">Oldest Batch Expiry</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productBatchesGrouped.map((prod, idx) => {
                                    const isExpanded = !!expandedBatches[Number(prod.product_id)];

                                    return (
                                        <React.Fragment key={prod.product_id || idx}>
                                            <tr
                                                className="border-b border-input/60 hover:bg-muted/10 cursor-pointer select-none"
                                                onClick={() => toggleBatchExpand(Number(prod.product_id))}
                                            >
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90 text-primary" : ""}`} />
                                                        <div>
                                                            <span className="font-extrabold text-foreground block text-sm">{prod.product_name}</span>
                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">{prod.product_code} • {prod.product_category?.category_name || "Unassigned"}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 text-right font-black text-foreground text-sm">
                                                    {prod.totalStock.toLocaleString()} {prod.unit_of_measurement?.unit_shortcut || "PCS"}
                                                </td>
                                                <td className="py-3.5 px-4 text-right font-bold text-foreground hidden sm:table-cell">
                                                    ₱{prod.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="py-3.5 px-4 text-center font-bold text-primary">
                                                    <span className="bg-primary/10 px-2.5 py-1 rounded-full text-xs">
                                                        {prod.batchesCount} Batches
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 font-bold text-muted-foreground hidden md:table-cell">
                                                    {prod.oldestExpiry ? (
                                                        <span className="font-mono text-foreground">{prod.oldestExpiry}</span>
                                                    ) : (
                                                        <span className="italic text-muted-foreground/60">No Expirations (Static)</span>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-muted/5">
                                                    <td colSpan={5} className="p-4 border-b border-input">
                                                        <div className="border-l-4 border-primary pl-4 py-2 space-y-3">
                                                            <h5 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                                                <Bookmark className="h-4 w-4 text-primary" />
                                                                FIFO Lot Batch Breakdown
                                                            </h5>
                                                            <div className="overflow-x-auto border border-input rounded-xl bg-card">
                                                                <table className="w-full text-xs text-left">
                                                                    <thead>
                                                                        <tr className="bg-muted/30 border-b border-input text-[9px] font-black uppercase text-muted-foreground">
                                                                            <th className="py-2.5 px-3">Lot Number</th>
                                                                            <th className="py-2.5 px-3">Warehouse Branch</th>
                                                                            <th className="py-2.5 px-3 text-right">Received Qty</th>
                                                                            <th className="py-2.5 px-3 text-right">Landed Unit Cost</th>
                                                                            <th className="py-2.5 px-3 text-right">Landed Total Value</th>
                                                                            <th className="py-2.5 px-3">Expiry / Reception Date</th>
                                                                            <th className="py-2.5 px-3 text-center">Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-input/50">
                                                                        {prod.batches.length === 0 ? (
                                                                            <tr>
                                                                                <td colSpan={7} className="py-4 text-center text-muted-foreground italic">
                                                                                    No active batches found for this product.
                                                                                </td>
                                                                            </tr>
                                                                        ) : (
                                                                            prod.batches.map((batch: BatchItem, bIdx: number) => {
                                                                                const cost = Number(batch.final_landed_unit_cost || batch.base_unit_cost_php || 0);
                                                                                return (
                                                                                    <tr key={bIdx} className="hover:bg-muted/10 font-medium text-foreground">
                                                                                        <td className="py-2 px-3 font-bold font-mono">
                                                                                            {batch.lot_number}
                                                                                        </td>
                                                                                        <td className="py-2 px-3 font-semibold text-muted-foreground">
                                                                                            {batch.branch_name}
                                                                                        </td>
                                                                                        <td className="py-2 px-3 text-right font-black">
                                                                                            {Number(batch.quantity_received).toLocaleString()}
                                                                                        </td>
                                                                                        <td className="py-2 px-3 text-right font-bold text-muted-foreground">
                                                                                            ₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                        </td>
                                                                                        <td className="py-2 px-3 text-right font-bold">
                                                                                            ₱{(Number(batch.quantity_received) * cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                        </td>
                                                                                        <td className="py-2 px-3 font-semibold text-muted-foreground">
                                                                                            {batch.expiration_date || <span className="italic text-[10px]">Static (No Expiration)</span>}
                                                                                        </td>
                                                                                        <td className="py-2 px-3 text-center">
                                                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${batch.expiryStatus === "expired"
                                                                                                    ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                                                                                    : batch.expiryStatus === "soon"
                                                                                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                                                                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                                                                }`}>
                                                                                                {batch.expiryStatus === "expired"
                                                                                                    ? "EXPIRED"
                                                                                                    : batch.expiryStatus === "soon"
                                                                                                        ? `Expiring in ${batch.daysToExpiry} days`
                                                                                                        : "Active Safe"}
                                                                                            </span>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}

                                {productBatchesGrouped.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                                            No active FIFO product batches found matching search filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === "ledger" && (
                        <table className="w-full border-collapse text-left text-xs">
                            <thead>
                                <tr className="border-b border-input text-muted-foreground">
                                    <th className="py-3 px-4 font-bold">Tx Date</th>
                                    <th className="py-3 px-4 font-bold hidden sm:table-cell">Doc No</th>
                                    <th className="py-3 px-4 font-bold">Product</th>
                                    <th className="py-3 px-4 font-bold hidden sm:table-cell">Document Type</th>
                                    <th className="py-3 px-4 font-bold hidden md:table-cell">Description</th>
                                    <th className="py-3 px-4 font-bold hidden sm:table-cell">Branch</th>
                                    <th className="py-3 px-4 font-bold text-right">Movement</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLedger.map((log, idx) => {
                                    const qty = Number(log.quantity) || 0;
                                    const isAddition = qty > 0;
                                    const isExpanded = !!expandedLedgers[Number(log.id)];

                                    return (
                                        <React.Fragment key={log.id || idx}>
                                            <tr
                                                className="border-b border-input/60 hover:bg-muted/10 cursor-pointer select-none"
                                                onClick={() => toggleLedgerExpand(Number(log.id))}
                                            >
                                                <td className="py-3.5 px-4 font-semibold text-muted-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90 text-primary" : ""}`} />
                                                        {log.documentDate}
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 font-extrabold text-foreground hidden sm:table-cell">{log.documentNo || "ADJ"}</td>
                                                <td className="py-3.5 px-4">
                                                    <div>
                                                        <span className="font-bold text-foreground block">{log.productName}</span>
                                                        <span className="text-[10px] text-muted-foreground">{log.productCode}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 font-semibold text-muted-foreground hidden sm:table-cell">{log.documentType}</td>
                                                <td className="py-3.5 px-4 text-muted-foreground max-w-[200px] truncate hidden md:table-cell">{log.documentDescription}</td>
                                                <td className="py-3.5 px-4 font-semibold text-foreground hidden sm:table-cell">{log.branchName}</td>
                                                <td className="py-3.5 px-4 text-right">
                                                    <span className={`inline-flex items-center gap-1 font-extrabold ${isAddition ? "text-emerald-500" : "text-rose-500"}`}>
                                                        {isAddition ? (
                                                            <>
                                                                <ArrowUpRight className="h-3 w-3" /> +{qty.toLocaleString()} {log.unitName}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ArrowDownLeft className="h-3 w-3" /> {qty.toLocaleString()} {log.unitName}
                                                            </>
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-muted/5 border-b border-input">
                                                    <td colSpan={7} className="p-4">
                                                        <div className="border-l-4 border-primary pl-4 py-1.5 space-y-2">
                                                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Transaction Ledger Details</div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Document Number</div>
                                                                    <div className="text-xs font-semibold text-foreground mt-0.5">{log.documentNo || "ADJ"}</div>
                                                                </div>
                                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Document Type</div>
                                                                    <div className="text-xs font-semibold text-foreground mt-0.5">{log.documentType}</div>
                                                                </div>
                                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Branch Location</div>
                                                                    <div className="text-xs font-semibold text-foreground mt-0.5">{log.branchName}</div>
                                                                </div>
                                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Description / Remarks</div>
                                                                    <div className="text-xs font-semibold text-foreground mt-0.5 whitespace-pre-wrap">{log.documentDescription || "No details provided."}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}

                                {filteredLedger.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                                            No transaction history entries.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === "picking" && (
                        <div className="space-y-4">
                            {pickingLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                                    <span className="text-xs font-semibold">Loading picking sheets...</span>
                                </div>
                            ) : (
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-input text-muted-foreground">
                                            <th className="py-3 px-4 font-bold">Job Order ID</th>
                                            <th className="py-3 px-4 font-bold">Target Good</th>
                                            <th className="py-3 px-4 font-bold">Target Qty</th>
                                            <th className="py-3 px-4 font-bold">Branch Location</th>
                                            <th className="py-3 px-4 font-bold">Picking Status</th>
                                            <th className="py-3 px-4 font-bold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pickingList.filter(jo =>
                                            searchQuery ? jo.jo_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                (jo.product_name || "").toLowerCase().includes(searchQuery.toLowerCase()) : true
                                        ).map((jo) => (
                                            <tr key={jo.jo_id} className="border-b border-input/60 hover:bg-muted/10">
                                                <td className="py-3.5 px-4 font-extrabold text-foreground">{jo.jo_id}</td>
                                                <td className="py-3.5 px-4 font-bold text-foreground">{jo.product_name || `Product #${jo.product_id}`}</td>
                                                <td className="py-3.5 px-4 font-bold text-foreground">{(jo.quantity || 0).toLocaleString()} units</td>
                                                <td className="py-3.5 px-4 font-semibold text-muted-foreground">{data?.branches?.find(b => Number(b.id) === Number(jo.branch_id))?.branch_name || (Number(jo.branch_id) === 1 || Number(jo.branch_id) === 183 ? "Main Branch" : Number(jo.branch_id) === 163 ? "Urdaneta Branch" : `Branch #${jo.branch_id}`)}</td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${jo.isPicked
                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                        }`}>
                                                        {jo.isPicked ? "Picked (In WIP)" : "Pending Pick"}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedPickingJO(jo);
                                                            setIsPickingModalOpen(true);
                                                        }}
                                                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${jo.isPicked
                                                                ? "bg-muted text-foreground border-border hover:bg-muted/20"
                                                                : "bg-primary text-primary-foreground border-transparent hover:bg-primary/95 shadow-sm"
                                                            }`}
                                                    >
                                                        {jo.isPicked ? "View Pick Sheet" : "Generate Pick Sheet"}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {pickingList.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                                                    No active released Job Orders found for picking.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === "receiving" && (
                        <div className="space-y-4">
                            {receivingLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                                    <span className="text-xs font-semibold">Loading job orders...</span>
                                </div>
                            ) : (
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-input text-muted-foreground">
                                            <th className="py-3 px-4 font-bold">Job Order ID</th>
                                            <th className="py-3 px-4 font-bold">Finished Good</th>
                                            <th className="py-3 px-4 font-bold">Target Qty</th>
                                            <th className="py-3 px-4 font-bold">Branch Location</th>
                                            <th className="py-3 px-4 font-bold">Status</th>
                                            <th className="py-3 px-4 font-bold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {receivingJOs.filter(jo =>
                                            searchQuery ? jo.jo_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                (jo.product_name || "").toLowerCase().includes(searchQuery.toLowerCase()) : true
                                        ).map((jo) => (
                                            <tr key={jo.jo_id} className="border-b border-input/60 hover:bg-muted/10">
                                                <td className="py-3.5 px-4 font-extrabold text-foreground">{jo.jo_id}</td>
                                                <td className="py-3.5 px-4 font-bold text-foreground">{jo.product_name || `Product #${jo.product_id}`}</td>
                                                <td className="py-3.5 px-4 font-bold text-foreground">{(jo.quantity || 0).toLocaleString()} units</td>
                                                <td className="py-3.5 px-4 font-semibold text-muted-foreground">{data?.branches?.find(b => Number(b.id) === Number(jo.branch_id))?.branch_name || (Number(jo.branch_id) === 1 || Number(jo.branch_id) === 183 ? "Main Branch" : Number(jo.branch_id) === 163 ? "Urdaneta Branch" : `Branch #${jo.branch_id}`)}</td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${jo.status === "Finished"
                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                        }`}>
                                                        {jo.status === "Finished" ? "Closed (Finished)" : "In Production"}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    {jo.status === "Finished" ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setReceivingResult({
                                                                    yieldAllocations: jo.yieldAllocations || [],
                                                                    materialCostVariances: jo.materialCostVariances
                                                                });
                                                                setSelectedReceivingJO(jo);
                                                                setShowReceivingResult(true);
                                                            }}
                                                            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted/20 cursor-pointer transition-all"
                                                        >
                                                            View Yield Report
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedReceivingJO(jo);
                                                                setRecQtyProduced(String(jo.quantity));
                                                                setRecLotNumber(`MFG-${jo.jo_id}`);
                                                                setRecExpirationDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
                                                                const stdProd = data?.products?.find(p => p.product_id === jo.product_id);
                                                                setRecUnitCost(String(stdProd?.cost_per_unit || 0));
                                                                setIsReceivingModalOpen(true);
                                                            }}
                                                            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-transparent bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer shadow-sm transition-all"
                                                        >
                                                            Receive Yield & Close JO
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {receivingJOs.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                                                    No ongoing/released Job Orders found for yield receiving.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Stock Adjustment Modal */}
            {isAdjustmentModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-300">
                    <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                            <div>
                                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                    <Sliders className="h-4.5 w-4.5 text-primary" />
                                    Post Stock Adjustment
                                </h3>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Post manual corrections, losses, or reconciliations directly to the ledger.</p>
                            </div>
                            <button
                                onClick={() => setIsAdjustmentModalOpen(false)}
                                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handlePostAdjustment} className="p-5 space-y-4">
                            {/* Product selection */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Product SKU</label>
                                <select
                                    value={adjProductId}
                                    onChange={e => setAdjProductId(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                    required
                                >
                                    <option value="">Select product to adjust...</option>
                                    {data?.products.map(p => (
                                        <option key={p.product_id} value={p.product_id}>
                                            {p.product_name} ({p.product_code})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Grid: Branch ID & Quantity */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Branch ID</label>
                                    <select
                                        value={adjBranchId}
                                        onChange={e => setAdjBranchId(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                    >
                                        {data?.branches && data.branches.length > 0 ? (
                                            data.branches.map(br => (
                                                <option key={br.id} value={br.id}>
                                                    {br.branch_name}
                                                </option>
                                            ))
                                        ) : (
                                            <>
                                                <option value="1">Branch 1 (Main Warehouse)</option>
                                                <option value="2">Branch 2 (Logistics Hub)</option>
                                                <option value="3">Branch 3 (Factory Storage)</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Qty Change</label>
                                    <input
                                        type="number"
                                        step="any"
                                        placeholder="e.g. -50 or 120"
                                        value={adjQty}
                                        onChange={e => setAdjQty(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                        required
                                    />
                                    <span className="text-[9px] text-muted-foreground block mt-0.5">Use negative numbers to deduct</span>
                                </div>
                            </div>

                            {/* Adjustment Type & Date */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Adjustment Type</label>
                                    <select
                                        value={adjType}
                                        onChange={e => setAdjType(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                    >
                                        <option value="Stock Take Reconciliation">Stock Reconciliation</option>
                                        <option value="Loss / Damage Adjustment">Spill/Loss/Damage</option>
                                        <option value="Quality Scrap Deduction">Quality Scrap</option>
                                        <option value="Reclassification Adjustment">Reclassification</option>
                                        <option value="Supplier Inbound Shortage">Supplier Shortage</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Effective Date</label>
                                    <input
                                        type="date"
                                        value={adjDate}
                                        onChange={e => setAdjDate(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Remarks / Description */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Remarks / Description</label>
                                <textarea
                                    rows={2}
                                    placeholder="Enter reasoning (e.g., Damaged during forklift operation, reconciliation after annual audit)..."
                                    value={adjRemarks}
                                    onChange={e => setAdjRemarks(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none"
                                    required
                                />
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                                <button
                                    type="button"
                                    onClick={() => setIsAdjustmentModalOpen(false)}
                                    className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingAdj}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all border-none flex items-center gap-1.5 shadow-sm"
                                >
                                    {submittingAdj ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-3.5 w-3.5" /> Save Adjustment
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WMS Picking Sheet Modal */}
            {isPickingModalOpen && selectedPickingJO && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-300">
                    <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                            <div>
                                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                    <ArrowUpRight className="h-4.5 w-4.5 text-primary" />
                                    Material Picking Sheet: {selectedPickingJO.jo_id}
                                </h3>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Deduct raw stocks and transfer component lots to WIP storage.</p>
                            </div>
                            <button
                                onClick={() => setIsPickingModalOpen(false)}
                                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/10 p-3 rounded-xl border border-border/60">
                                <div>
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Target Product</span>
                                    <div className="text-xs font-bold mt-0.5">{selectedPickingJO.product_name}</div>
                                </div>
                                <div>
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Target Run Qty</span>
                                    <div className="text-xs font-bold mt-0.5">{(selectedPickingJO.quantity || 0).toLocaleString()} units</div>
                                </div>
                                <div>
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Branch</span>
                                    <div className="text-xs font-bold mt-0.5">
                                        {data?.branches?.find(b => Number(b.id) === Number(selectedPickingJO.branch_id))?.branch_name || (Number(selectedPickingJO.branch_id) === 1 || Number(selectedPickingJO.branch_id) === 183 ? "Main Branch" : Number(selectedPickingJO.branch_id) === 163 ? "Urdaneta Branch" : `Branch #${selectedPickingJO.branch_id}`)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Pick Status</span>
                                    <div className="text-xs font-bold mt-0.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${selectedPickingJO.isPicked ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                                            }`}>
                                            {selectedPickingJO.isPicked ? "Picked" : "Pending"}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Required Component Allocations (FIFO Lots)</h4>
                                <div className="border border-border rounded-xl overflow-hidden bg-card">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-muted/30 border-b border-border text-muted-foreground">
                                                <th className="p-2.5 font-bold">Component Name</th>
                                                <th className="p-2.5 font-bold">Required Qty</th>
                                                <th className="p-2.5 font-bold">FIFO Lot Number</th>
                                                <th className="p-2.5 font-bold">Expiry Date</th>
                                                <th className="p-2.5 font-bold text-right">Pick Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedPickingJO.isPicked ? (
                                                selectedPickingJO.pickedItems && selectedPickingJO.pickedItems.map((item: any, idx: number) => {
                                                    const name = data?.products?.find(p => p.product_id === item.productId)?.product_name || `Component #${item.productId}`;
                                                    return (
                                                        <tr key={idx} className="border-b border-border/40 last:border-0">
                                                            <td className="p-2.5 font-semibold text-foreground">{name}</td>
                                                            <td className="p-2.5 text-muted-foreground">-</td>
                                                            <td className="p-2.5 font-extrabold text-foreground">{item.lotNumber}</td>
                                                            <td className="p-2.5 text-muted-foreground">Passed</td>
                                                            <td className="p-2.5 text-right font-bold text-emerald-600">{item.quantity.toLocaleString()} units</td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                selectedPickingJO.allocationResults && selectedPickingJO.allocationResults.map((alloc: any, idx: number) => {
                                                    return (
                                                        <React.Fragment key={idx}>
                                                            {alloc.batches && alloc.batches.length > 0 ? (
                                                                alloc.batches.map((batch: any, bIdx: number) => (
                                                                    <tr key={`${idx}-${bIdx}`} className="border-b border-border/40 last:border-0 hover:bg-muted/5">
                                                                        <td className="p-2.5 font-semibold text-foreground">
                                                                            {bIdx === 0 ? alloc.component_name : <span className="text-muted-foreground pl-3">↳ Lot Split</span>}
                                                                        </td>
                                                                        <td className="p-2.5 text-muted-foreground font-semibold">
                                                                            {bIdx === 0 ? `${alloc.required.toLocaleString(undefined, { maximumFractionDigits: 2 })} units` : ""}
                                                                        </td>
                                                                        <td className="p-2.5 font-extrabold text-foreground">{batch.lot_number}</td>
                                                                        <td className="p-2.5 text-muted-foreground font-bold">{batch.expiration_date}</td>
                                                                        <td className="p-2.5 text-right font-bold text-amber-600">{batch.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} units</td>
                                                                    </tr>
                                                                ))
                                                            ) : (
                                                                <tr className="border-b border-border/40 last:border-0 text-rose-500">
                                                                    <td className="p-2.5 font-semibold">{alloc.component_name}</td>
                                                                    <td className="p-2.5 font-semibold">{alloc.required.toLocaleString()} units</td>
                                                                    <td colSpan={3} className="p-2.5 text-right font-bold text-[10px] uppercase">Deficit: {alloc.deficit.toLocaleString()} units (NO STOCK)</td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                                <button
                                    type="button"
                                    onClick={() => setIsPickingModalOpen(false)}
                                    className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                                >
                                    Close
                                </button>
                                {!selectedPickingJO.isPicked && (
                                    <button
                                        type="button"
                                        onClick={() => handleConfirmPick(selectedPickingJO)}
                                        disabled={pickingSubmitting || selectedPickingJO.allocationResults?.some((a: any) => a.deficit > 0)}
                                        className="bg-primary hover:bg-primary/95 text-primary-foreground border-transparent text-xs font-bold px-4 py-2 rounded-lg cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                                    >
                                        {pickingSubmitting ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transferring...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="h-3.5 w-3.5" /> Confirm Pick & Issue to WIP
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* WMS Yield Receiving Modal */}
            {isReceivingModalOpen && selectedReceivingJO && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-300">
                    <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                            <div>
                                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                    <ArrowDownLeft className="h-4.5 w-4.5 text-primary" />
                                    Receive Yield & Close JO: {selectedReceivingJO.jo_id}
                                </h3>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Input the packaging output to release finished stock and close production.</p>
                            </div>
                            <button
                                onClick={() => setIsReceivingModalOpen(false)}
                                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmReceiving} className="p-5 space-y-4">
                            {/* Materials Consumed Summary */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">WIP Materials Consumed (Actually Picked)</label>
                                <div className="border border-border bg-muted/10 p-2.5 rounded-lg text-[10px] space-y-1 max-h-[100px] overflow-y-auto font-semibold">
                                    {selectedReceivingJO.actualConsumed && selectedReceivingJO.actualConsumed.length > 0 ? (
                                        selectedReceivingJO.actualConsumed.map((c: any, idx: number) => {
                                            const name = data?.products?.find(p => p.product_id === c.productId)?.product_name || `Component #${c.productId}`;
                                            return (
                                                <div key={idx} className="flex justify-between items-center py-0.5 border-b border-border/40 last:border-none">
                                                    <span className="text-foreground">{name} (Lot: {c.lotNumber})</span>
                                                    <span className="font-extrabold text-muted-foreground">{c.quantity.toLocaleString()} units</span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-rose-500 py-1">WARNING: No picking record detected. (Did you bypass picking?)</div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Product SKU (FG)</label>
                                    <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground">
                                        {selectedReceivingJO.product_name}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Target Production Run</label>
                                    <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground">
                                        {(selectedReceivingJO.quantity || 0).toLocaleString()} units
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Actual Packaging Yield</label>
                                    <input
                                        type="number"
                                        step="any"
                                        placeholder="e.g. 4980"
                                        value={recQtyProduced}
                                        onChange={e => setRecQtyProduced(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                        required
                                    />
                                    <span className="text-[9px] text-muted-foreground block mt-0.5">Input the exact final packed yield</span>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Yield Lot Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. MFG-JO-XXXX"
                                        value={recLotNumber}
                                        onChange={e => setRecLotNumber(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-bold"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Expiration Date</label>
                                    <input
                                        type="date"
                                        value={recExpirationDate}
                                        onChange={e => setRecExpirationDate(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Unit Cost (Standard COGS)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={recUnitCost}
                                        onChange={e => setRecUnitCost(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                                <button
                                    type="button"
                                    onClick={() => setIsReceivingModalOpen(false)}
                                    className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={recSubmitting}
                                    className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all border-none flex items-center gap-1.5 shadow-sm"
                                >
                                    {recSubmitting ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Closing JO...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="h-3.5 w-3.5" /> Close Job Order & Post FG Stock
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WMS Yield Allocation & Cost Variance Result Modal */}
            {showReceivingResult && receivingResult && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-card border border-border w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-border flex items-center justify-between bg-primary/5">
                            <div>
                                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                    <Bookmark className="h-4.5 w-4.5 text-primary" />
                                    Production Closure Summary: {selectedReceivingJO?.jo_id}
                                </h3>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Yield allocations back to Sales Orders and Material Cost Variance analysis.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowReceivingResult(false);
                                    setIsReceivingModalOpen(false);
                                }}
                                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
                            {/* Yield Allocations section */}
                            <div className="space-y-2">
                                <h4 className="text-[11px] font-black uppercase tracking-wider text-primary">Proportional Yield Split back to Sales Orders</h4>
                                <div className="border border-border rounded-xl overflow-hidden bg-card">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                                                <th className="p-2.5 font-bold">Sales Order No</th>
                                                <th className="p-2.5 font-bold">Customer Name</th>
                                                <th className="p-2.5 font-bold">Consolidated Target</th>
                                                <th className="p-2.5 font-bold text-right">Proportionally Allocated Yield</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {receivingResult.yieldAllocations && receivingResult.yieldAllocations.length > 0 ? (
                                                receivingResult.yieldAllocations.map((alloc: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-border/40 last:border-0 hover:bg-muted/5">
                                                        <td className="p-2.5 font-extrabold text-foreground">{alloc.order_no}</td>
                                                        <td className="p-2.5 font-semibold text-muted-foreground">{alloc.customer_name}</td>
                                                        <td className="p-2.5 text-foreground font-semibold">{alloc.target_qty.toLocaleString()} units</td>
                                                        <td className="p-2.5 text-right font-black text-primary">{alloc.allocated_yield.toLocaleString()} units</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="p-4 text-center text-muted-foreground font-semibold">
                                                        No Sales Orders were linked to this Job Order. Yield loaded directly to branch warehouse stock.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Material Cost Variance section */}
                            {receivingResult.materialCostVariances && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[11px] font-black uppercase tracking-wider text-primary">Material Cost Variance Analysis</h4>
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${receivingResult.materialCostVariances.total_variance <= 0
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                            }`}>
                                            {receivingResult.materialCostVariances.total_variance <= 0 ? "Favorable Variance" : "Unfavorable Variance"}
                                        </span>
                                    </div>

                                    {/* Cost Summary Cards */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="p-3 bg-muted/15 border border-border rounded-xl">
                                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Standard Material Cost</span>
                                            <h4 className="text-sm font-bold text-foreground mt-1">
                                                PHP {receivingResult.materialCostVariances.standard_total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </h4>
                                        </div>
                                        <div className="p-3 bg-muted/15 border border-border rounded-xl">
                                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Actual Picked Cost</span>
                                            <h4 className="text-sm font-bold text-foreground mt-1">
                                                PHP {receivingResult.materialCostVariances.actual_total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </h4>
                                        </div>
                                        <div className="p-3 bg-muted/15 border border-border rounded-xl">
                                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Material Cost Variance</span>
                                            <h4 className={`text-sm font-black mt-1 ${receivingResult.materialCostVariances.total_variance <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                }`}>
                                                {receivingResult.materialCostVariances.total_variance > 0 ? "+" : ""}
                                                PHP {receivingResult.materialCostVariances.total_variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </h4>
                                        </div>
                                    </div>

                                    {/* Component Cost Breakdowns */}
                                    <div className="border border-border rounded-xl overflow-hidden bg-card">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                                                    <th className="p-2.5 font-bold">Component Name</th>
                                                    <th className="p-2.5 font-bold">Standard Usage (BOM)</th>
                                                    <th className="p-2.5 font-bold">Actual Usage (WIP)</th>
                                                    <th className="p-2.5 font-bold">Std cost</th>
                                                    <th className="p-2.5 font-bold">Act cost</th>
                                                    <th className="p-2.5 font-bold text-right">Variance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {receivingResult.materialCostVariances.details && receivingResult.materialCostVariances.details.map((detail: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-border/40 last:border-0 hover:bg-muted/5">
                                                        <td className="p-2.5 font-bold text-foreground">{detail.productName}</td>
                                                        <td className="p-2.5 text-muted-foreground font-semibold">
                                                            {detail.standardQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} units
                                                        </td>
                                                        <td className="p-2.5 font-bold text-foreground">
                                                            {detail.actualQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} units
                                                        </td>
                                                        <td className="p-2.5 text-muted-foreground font-semibold">
                                                            PHP {detail.standardTotalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="p-2.5 text-foreground font-semibold">
                                                            PHP {detail.actualTotalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className={`p-2.5 text-right font-bold ${detail.variance <= 0 ? "text-emerald-500" : "text-rose-500"
                                                            }`}>
                                                            {detail.variance > 0 ? "+" : ""}
                                                            PHP {detail.variance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowReceivingResult(false);
                                        setIsReceivingModalOpen(false);
                                    }}
                                    className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-6 py-2 rounded-lg cursor-pointer shadow-sm transition-all border-none"
                                >
                                    Done & Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
