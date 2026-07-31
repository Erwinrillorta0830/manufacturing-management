import { useState, useMemo } from "react";
import {
    InventoryData,
    InventoryTab,
    LedgerType,
    ExpiryFilter,
    StockLevelProduct,
    GroupedBatchProduct,
    BatchItem
} from "../types/inventory.types";

export function useInventoryFilters(data: InventoryData | null) {
    const [activeTab, setActiveTab] = useState<InventoryTab>("stock");
    const [ledgerType, setLedgerType] = useState<LedgerType>("raw");
    const [filterBranch, setFilterBranch] = useState("all");
    const [filterBrand, setFilterBrand] = useState("all");
    const [filterCategory, setFilterCategory] = useState("all");
    const [filterProduct, setFilterProduct] = useState("all");
    const [filterStartDate, setFilterStartDate] = useState("");
    const [filterEndDate, setFilterEndDate] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [lowStockFilter, setLowStockFilter] = useState(false);
    const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");

    // Expand states
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
    const [expandedBatches, setExpandedBatches] = useState<Record<number, boolean>>({});
    const [expandedLedgers, setExpandedLedgers] = useState<Record<number, boolean>>({});

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({ ...prev, [key]: prev[key] === false }));
    };
    const isExpanded = (key: string) => expandedGroups[key] !== false;
    const toggleProductExpand = (prodId: number) => {
        setExpandedProducts(prev => ({ ...prev, [prodId]: !prev[prodId] }));
    };
    const toggleBatchExpand = (batchId: number) => {
        setExpandedBatches(prev => ({ ...prev, [batchId]: !prev[batchId] }));
    };
    const toggleLedgerExpand = (ledgerId: number) => {
        setExpandedLedgers(prev => ({ ...prev, [ledgerId]: !prev[ledgerId] }));
    };

    // 1. Group movement batches (or ledger fallback) to get current stock levels per product
    const stockLevels = useMemo<StockLevelProduct[]>(() => {
        if (!data) return [];
        const { ledger, batches = [], products } = data;

        const stockMap: Record<number, { qty: number; branches: Record<number, number> }> = {};

        if (batches && batches.length > 0) {
            batches.forEach((b: any) => {
                const pId = Number(b.product_id);
                const bId = Number(b.branch_id);
                const qty = Number(b.available_quantity ?? b.on_hand_quantity ?? b.quantity_received ?? 0);

                if (!stockMap[pId]) {
                    stockMap[pId] = { qty: 0, branches: {} };
                }
                stockMap[pId].qty += qty;
                stockMap[pId].branches[bId] = (stockMap[pId].branches[bId] || 0) + qty;
            });
        } else if (ledger && ledger.length > 0) {
            ledger.forEach((entry: any) => {
                const entryDate = entry.documentDate || entry.date_added || "";
                if (filterStartDate && entryDate < filterStartDate) return;
                if (filterEndDate && entryDate > filterEndDate) return;

                const pId = Number(entry.productId || entry.product_id);
                const qty = Number(entry.quantity) || 0;
                const bId = Number(entry.branchId || entry.branch_id);

                if (!stockMap[pId]) {
                    stockMap[pId] = { qty: 0, branches: {} };
                }
                stockMap[pId].qty += qty;
                stockMap[pId].branches[bId] = (stockMap[pId].branches[bId] || 0) + qty;
            });
        }

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
        const categories: Record<string, Record<string, StockLevelProduct[]>> = {};

        stockLevels.forEach(prod => {
            const cat = prod.product_category?.category_name || "Unassigned Category";
            const brand = prod.product_brand?.brand_name || "Generic Brand";

            if (!categories[cat]) categories[cat] = {};
            if (!categories[cat][brand]) categories[cat][brand] = [];
            categories[cat][brand].push(prod);
        });

        return categories;
    }, [stockLevels]);

    // 2. Consolidated FIFO product batches
    const productBatchesGrouped = useMemo<GroupedBatchProduct[]>(() => {
        if (!data) return [];
        const { batches, products, branches = [] } = data;

        const groupedMap: Record<number, BatchItem[]> = {};
        batches.forEach(b => {
            const pId = Number(b.product_id);
            if (!groupedMap[pId]) groupedMap[pId] = [];
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

            const totalStock = mappedBatches.reduce((sum, b) => sum + Number(b.available_quantity ?? b.on_hand_quantity ?? b.quantity_received ?? 0), 0);
            const totalValue = mappedBatches.reduce((sum, b) => sum + (Number(b.available_quantity ?? b.on_hand_quantity ?? b.quantity_received ?? 0) * Number(b.final_landed_unit_cost || b.base_unit_cost_php || 0)), 0);

            const activeExpirations = mappedBatches.map(b => b.expiration_date).filter(Boolean) as string[];
            const oldestExpiry = activeExpirations.length > 0 ? activeExpirations.sort()[0] : null;

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
            const prod = products.find(p => Number(p.product_id) === Number(l.productId || l.product_id));
            const branchObj = branches.find(br => Number(br.id) === Number(l.branchId || l.branch_id));
            const branchName = branchObj ? branchObj.branch_name : `Branch #${l.branchId || l.branch_id}`;

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

            const matchesBranch = filterBranch === "all" || String(l.branchId || l.branch_id) === filterBranch;
            const matchesBrand = filterBrand === "all" || brandName === filterBrand;
            const matchesCategory = filterCategory === "all" || categoryName === filterCategory;
            const matchesProduct = filterProduct === "all" || String(l.productId || l.product_id) === filterProduct;

            const entryDate = l.documentDate || l.date_added || "";
            const matchesStartDate = !filterStartDate || entryDate >= filterStartDate;
            const matchesEndDate = !filterEndDate || entryDate <= filterEndDate;

            return matchesBranch && matchesBrand && matchesCategory && matchesProduct && matchesStartDate && matchesEndDate;
        });
    }, [data, searchQuery, ledgerType, filterBranch, filterBrand, filterCategory, filterProduct, filterStartDate, filterEndDate]);

    return {
        activeTab,
        setActiveTab,
        ledgerType,
        setLedgerType,
        filterBranch,
        setFilterBranch,
        filterBrand,
        setFilterBrand,
        filterCategory,
        setFilterCategory,
        filterProduct,
        setFilterProduct,
        filterStartDate,
        setFilterStartDate,
        filterEndDate,
        setFilterEndDate,
        searchQuery,
        setSearchQuery,
        lowStockFilter,
        setLowStockFilter,
        expiryFilter,
        setExpiryFilter,

        // Expand states
        expandedGroups,
        expandedProducts,
        expandedBatches,
        expandedLedgers,
        toggleGroup,
        isExpanded,
        toggleProductExpand,
        toggleBatchExpand,
        toggleLedgerExpand,

        // Computed
        stockLevels,
        groupedStock,
        productBatchesGrouped,
        filteredLedger
    };
}
