import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
    MovementFilters,
    ProductLookup,
    BranchLookup,
    LotLookup,
    ProductReportNode,
    BatchReportEntry
} from "../types";
import {
    fetchInventoryData,
    fetchLotsList,
    fetchInventoryMovements,
    fetchVersionsForProducts,
    buildBatchesFromMovements,
    RawProduct,
    RawBranch,
    RawBatch
} from "../services/inventory-reports-api";

export function useInventoryReports() {
    const [activeProductType, setActiveProductType] = useState<number>(388); // Default: 388 (Finished Goods)
    const [filters, setFilters] = useState<MovementFilters>({
        productId: null,
        branchId: null,
        lotId: null,
        batchNo: "",
        startDate: "",
        endDate: ""
    });

    // Reset product SKU filter if active product type changes
    useEffect(() => {
        queueMicrotask(() => {
            setFilters((prev) => ({
                ...prev,
                productId: null
            }));
        });
    }, [activeProductType]);

    const [searchQuery, setSearchQuery] = useState("");
    const [batches, setBatches] = useState<RawBatch[]>([]);
    const [loading, setLoading] = useState(false);

    // Lookup states
    const [products, setProducts] = useState<ProductLookup[]>([]);
    const [branches, setBranches] = useState<BranchLookup[]>([]);
    const [lotsList, setLotsList] = useState<LotLookup[]>([]);
    const [versionMapState, setVersionMapState] = useState<Map<number, string>>(new Map());

    // Raw products state from BFF (includes UOM shortcut details)
    const [rawProducts, setRawProducts] = useState<RawProduct[]>([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [lotsData, invData, movementsData] = await Promise.all([
                fetchLotsList().catch(() => []),
                fetchInventoryData().catch(() => ({ products: [], batches: [], branches: [] })),
                fetchInventoryMovements().catch(() => [])
            ]);

            setLotsList(lotsData);
            setRawProducts(invData.products || []);

            // Extract Finished Goods product IDs to fetch recipe version names
            const fgProductIds = (invData.products || []).filter((p) => {
                const typeVal = p.product_type;
                const productTypeId = typeVal && typeof typeVal === "object"
                    ? Number(typeVal.id)
                    : (typeVal !== undefined && typeVal !== null ? Number(typeVal) : undefined);
                return productTypeId === 388;
            }).map(p => p.product_id);

            const vMap = await fetchVersionsForProducts(fgProductIds);
            setVersionMapState(vMap);

            // Aggregate batch items strictly from inventory_movements ledger
            const aggregatedBatches = buildBatchesFromMovements(movementsData, invData.batches || [], vMap);
            setBatches(aggregatedBatches);

            // Map products for dropdown lookup options
            const mappedProducts: ProductLookup[] = (invData.products || []).map((p: RawProduct) => {
                const typeVal = p.product_type;
                const productTypeId = typeVal && typeof typeVal === "object"
                    ? Number(typeVal.id)
                    : (typeVal !== undefined && typeVal !== null ? Number(typeVal) : undefined);
                return {
                    productId: p.product_id,
                    productName: p.product_name,
                    productCode: p.product_code,
                    productType: productTypeId
                };
            });
            setProducts(mappedProducts);

            // Map branches for dropdown lookup options
            const mappedBranches: BranchLookup[] = (invData.branches || []).map((b: RawBranch) => ({
                branchId: b.id,
                branchName: b.branch_name
            }));
            setBranches(mappedBranches);
        } catch (e) {
            console.error("Failed to load inventory reports data:", e);
            toast.error("Failed to load inventory data");
        } finally {
            setLoading(false);
        }
    }, []);

    // Connect to Server-Sent Events (SSE) stream for real-time inventory updates
    useEffect(() => {
        const eventSource = new EventSource("/api/manufacturing/inventory/movements/stream");

        eventSource.addEventListener("movement", () => {
            // Trigger a silent reload of inventory lots when a movement occurs in the background
            loadData();
        });

        eventSource.addEventListener("error", (err) => {
            console.error("[SSE] EventSource error, auto-reconnecting...", err);
        });

        return () => {
            eventSource.close();
        };
    }, [loadData]);

    // Initial load
    useEffect(() => {
        queueMicrotask(() => {
            loadData();
        });
    }, [loadData]);

    const setSingleFilter = (key: keyof MovementFilters, value: unknown) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value
        }));
    };

    // Client-side Grouping and Hierarchical Tree aggregation
    // For Finished Goods (388): 4-Level Tree (Product ➔ Version ➔ Lots ➔ Batch)
    // For Raw Materials (389) / Packaging (390): 2-Level Tree (Product ➔ Lots / Batches)
    const groupedData = useMemo<ProductReportNode[]>(() => {
        if (rawProducts.length === 0 && batches.length === 0) return [];

        // Build lookup maps for performance
        const branchMap = new Map<number, string>();
        branches.forEach((b) => branchMap.set(b.branchId, b.branchName));

        const lotMap = new Map<number, LotLookup>();
        lotsList.forEach((l) => lotMap.set(l.lotId, l));

        const productUOMMap = new Map<number, string>();
        rawProducts.forEach((p) => {
            const uom = p.unit_of_measurement?.unit_shortcut || "units";
            productUOMMap.set(p.product_id, uom);
        });

        // 1. Filter batches (inventory lot assignments) based on top filters
        const filteredBatches = batches.filter((b) => {
            // Branch filter (null means All Branches)
            if (filters.branchId !== null && b.branch_id !== filters.branchId) {
                return false;
            }

            // Location Lot filter (null means All Locations)
            if (filters.lotId !== null && b.lot_id !== filters.lotId) {
                return false;
            }

            // Product filter (null means All Products)
            if (filters.productId !== null && b.product_id !== filters.productId) {
                return false;
            }

            // Product type filter (Finished Goods, Raw Materials, Packaging Items)
            const matchedProduct = rawProducts.find((p) => p.product_id === b.product_id);
            if (!matchedProduct) return false;

            const typeVal = matchedProduct.product_type;
            const productTypeId = typeVal && typeof typeVal === "object"
                ? Number(typeVal.id)
                : (typeVal !== undefined && typeVal !== null ? Number(typeVal) : null);

            if (productTypeId !== activeProductType) {
                return false;
            }

            // Manufacturing Date filter (exact match against created_on date portion)
            if (filters.startDate) {
                const createdDate = b.created_on ? b.created_on.split("T")[0] : null;
                if (createdDate !== filters.startDate) {
                    return false;
                }
            }

            // Expiry Date filter (exact match against expiration_date date portion)
            if (filters.endDate) {
                const expiryDate = b.expiration_date ? b.expiration_date.split("T")[0] : null;
                if (expiryDate !== filters.endDate) {
                    return false;
                }
            }

            // Search query filter (matches product code/name, lot name, or batch number)
            if (searchQuery.trim()) {
                const query = searchQuery.trim().toLowerCase();
                const matchedProduct = rawProducts.find((p) => p.product_id === b.product_id);
                const prodName = matchedProduct?.product_name?.toLowerCase() || "";
                const prodCode = matchedProduct?.product_code?.toLowerCase() || "";
                const lotName = b.lot_name?.toLowerCase() || "";
                const batchNo = b.batch_no?.toLowerCase() || b.lot_number?.toLowerCase() || "";

                if (
                    !prodName.includes(query) &&
                    !prodCode.includes(query) &&
                    !lotName.includes(query) &&
                    !batchNo.includes(query)
                ) {
                    return false;
                }
            }

            return true;
        });

        // 2. Group filtered batches into tree structures
        const productNodesMap = new Map<number, ProductReportNode>();

        filteredBatches.forEach((b) => {
            let node = productNodesMap.get(b.product_id);
            if (!node) {
                const matchedProduct = rawProducts.find((p) => p.product_id === b.product_id);
                node = {
                    productId: b.product_id,
                    productName: matchedProduct?.product_name || `Product #${b.product_id}`,
                    productCode: matchedProduct?.product_code || `SKU-${b.product_id}`,
                    uomShortcut: productUOMMap.get(b.product_id) || "units",
                    totalAvailable: 0,
                    versions: activeProductType === 388 ? [] : undefined,
                    lots: activeProductType !== 388 ? [] : undefined
                };
                productNodesMap.set(b.product_id, node);
            }

            // Resolve Lot max capacity and space utilization
            const lotId = b.lot_id ? Number(b.lot_id) : null;
            const lotInfo = lotId !== null ? lotMap.get(lotId) : null;
            const maxCapacity = lotInfo?.maxBatchCapacity || 10;
            const quantity = Number(b.quantity_received || 0);
            const onHandQuantity = Number(b.on_hand_quantity ?? quantity);
            const reservedQuantity = Number(b.reserved_quantity || 0);

            // Look up branch name
            const branchName = branchMap.get(b.branch_id) || `Branch #${b.branch_id}`;

            const versionId = b.version_id ? Number(b.version_id) : null;
            const versionName = b.version_name || (versionId !== null ? (versionMapState.get(versionId) || `Version #${versionId}`) : "Default Version");

            const lotName = b.lot_name || lotInfo?.lotName || (lotId !== null ? `Lot #${lotId}` : "Unassigned");

            const lotEntry: BatchReportEntry = {
                lineId: b.line_id,
                productId: b.product_id,
                versionId,
                versionName,
                branchId: b.branch_id,
                branchName,
                lotId,
                lotName,
                maxBatchCapacity: maxCapacity,
                sourceDocumentNo: b.source_reference || "N/A",
                transactionType: b.transaction_type || (b.source_type ? String(b.source_type).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Legacy Stock"),
                batchNo: b.batch_no || b.lot_number || "LOT-N/A",
                quantity,
                onHandQuantity,
                reservedQuantity,
                unitCost: Number(b.final_landed_unit_cost || b.base_unit_cost_php || 0),
                qaStatus: b.qa_status || "Passed",
                remarks: b.remarks || b.rejection_reason || null,
                expiryDate: b.expiration_date || null,
                createdOn: b.created_on || null
            };

            if (activeProductType === 388) {
                // 4-Level Grouping for Finished Goods: Product ➔ Version ➔ Lot ➔ Batch
                if (!node.versions) node.versions = [];

                let versionNode = node.versions.find(v => v.versionId === versionId || (v.versionId === null && versionId === null));
                if (!versionNode) {
                    versionNode = {
                        versionId,
                        versionName,
                        subtotalQuantity: 0,
                        lots: []
                    };
                    node.versions.push(versionNode);
                }

                let lotNode = versionNode.lots.find(l => l.lotId === lotId && l.branchId === b.branch_id);
                if (!lotNode) {
                    lotNode = {
                        lotId,
                        lotName,
                        branchId: b.branch_id,
                        branchName,
                        maxBatchCapacity: maxCapacity,
                        subtotalQuantity: 0,
                        batches: []
                    };
                    versionNode.lots.push(lotNode);
                }

                lotNode.batches.push(lotEntry);
            } else {
                // 3-Level Grouping for Raw Materials & Packaging Items: Product ➔ Lot ➔ Batch
                if (!node.lots) node.lots = [];

                let lotNode = node.lots.find(l => l.lotId === lotId && l.branchId === b.branch_id);
                if (!lotNode) {
                    lotNode = {
                        lotId,
                        lotName,
                        branchId: b.branch_id,
                        branchName,
                        maxBatchCapacity: maxCapacity,
                        subtotalQuantity: 0,
                        batches: []
                    };
                    node.lots.push(lotNode);
                }

                lotNode.batches.push(lotEntry);
            }
        });

        // 3. Finalize totals and sort nodes recursively
        const result: ProductReportNode[] = [];
        productNodesMap.forEach((node) => {
            if (activeProductType === 388 && node.versions) {
                // 4-Level Finished Goods Subtotal Summing & Sorting
                node.versions.forEach((ver) => {
                    ver.lots.forEach((lot) => {
                        lot.subtotalQuantity = lot.batches.reduce((sum, item) => sum + item.quantity, 0);
                        // Sort batches by batch number
                        lot.batches.sort((a, b) => a.batchNo.localeCompare(b.batchNo));
                    });
                    // Sort lots by branch name ➔ lot name
                    ver.lots.sort((a, b) => {
                        const bComp = a.branchName.localeCompare(b.branchName);
                        if (bComp !== 0) return bComp;
                        return a.lotName.localeCompare(b.lotName);
                    });
                    ver.subtotalQuantity = ver.lots.reduce((sum, l) => sum + l.subtotalQuantity, 0);
                });

                // Sort versions by version name
                node.versions.sort((a, b) => a.versionName.localeCompare(b.versionName));
                node.totalAvailable = node.versions.reduce((sum, v) => sum + v.subtotalQuantity, 0);

                if (node.versions.length > 0) {
                    result.push(node);
                }
            } else if (node.lots) {
                // 3-Level Raw Materials & Packaging Items Subtotal Summing & Sorting
                node.lots.forEach((lot) => {
                    lot.subtotalQuantity = lot.batches.reduce((sum, item) => sum + item.quantity, 0);
                    // Sort batches by batch number
                    lot.batches.sort((a, b) => a.batchNo.localeCompare(b.batchNo));
                });
                // Sort lots by branch name ➔ lot name
                node.lots.sort((a, b) => {
                    const bComp = a.branchName.localeCompare(b.branchName);
                    if (bComp !== 0) return bComp;
                    return a.lotName.localeCompare(b.lotName);
                });
                node.totalAvailable = node.lots.reduce((sum, l) => sum + l.subtotalQuantity, 0);

                if (node.lots.length > 0) {
                    result.push(node);
                }
            }
        });

        // Sort products alphabetically by product name
        return result.sort((a, b) => a.productName.localeCompare(b.productName));
    }, [batches, rawProducts, branches, lotsList, filters, searchQuery, activeProductType, versionMapState]);

    return {
        filters,
        searchQuery,
        setSearchQuery,
        batches,
        loading,
        products,
        branches,
        lotsList,
        loadMovements: loadData,
        loadLookups: () => Promise.resolve(),
        setSingleFilter,
        groupedData,
        rawProducts,
        activeProductType,
        setActiveProductType
    };
}
