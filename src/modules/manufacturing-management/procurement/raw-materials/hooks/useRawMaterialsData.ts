import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { RawMaterialItem, TypeFilter, BranchGroupedBatches, BatchItem } from "../types/raw-materials.types";
import { fetchProductInventoryDetails } from "../services/raw-materials.service";

export interface FamilyGroup {
    id: string;
    parent: RawMaterialItem;
    children: RawMaterialItem[];
}

export function useRawMaterialsData(rawMaterials: RawMaterialItem[]) {
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
    const [loadingBatches, setLoadingBatches] = useState(false);
    const [inventoryDetailsError, setInventoryDetailsError] = useState<string | null>(null);
    const [productBatches, setProductBatches] = useState<BatchItem[]>([]);
    const inventoryRequestId = useRef(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Reset pagination to page 1 on search or filter change
    useEffect(() => {
        setPage(1);
    }, [search, typeFilter]);

    const isItemPkg = (item: RawMaterialItem) => {
        return Number(item.product_type) === 390;
    };

    const filtered = useMemo(() => {
        return rawMaterials.filter(m => {
            const matchesSearch = m.product_name.toLowerCase().includes(search.toLowerCase()) ||
                (m.product_code || "").toLowerCase().includes(search.toLowerCase());

            if (!matchesSearch) return false;

            const productTypeId = Number(m.product_type);
            if (typeFilter === "raw") return productTypeId === 389;
            if (typeFilter === "pkg") return productTypeId === 390;
            return productTypeId === 389 || productTypeId === 390;
        });
    }, [rawMaterials, search, typeFilter]);

    // Group items into Family Groups (Parent + Children) so pagination never splits a family across pages
    const familyGroups = useMemo<FamilyGroup[]>(() => {
        const parents = filtered.filter(rm => !rm.parent_id);
        const children = filtered.filter(rm => !!rm.parent_id);

        const groups: FamilyGroup[] = parents.map(parent => {
            const parentChildren = children.filter(child => Number(child.parent_id) === parent.product_id);
            return {
                id: `fam-${parent.product_id}`,
                parent,
                children: parentChildren
            };
        });

        // Add orphan children (whose parents are filtered out or unlinked) as standalone family groups
        children.forEach(child => {
            const isAlreadyIncluded = groups.some(g => g.children.some(c => c.product_id === child.product_id));
            if (!isAlreadyIncluded) {
                groups.push({
                    id: `orphan-${child.product_id}`,
                    parent: child,
                    children: []
                });
            }
        });

        return groups;
    }, [filtered]);

    // Flatten family groups into single list while keeping family order intact
    const sortedFiltered = useMemo(() => {
        const result: RawMaterialItem[] = [];
        familyGroups.forEach(fg => {
            result.push(fg.parent);
            if (fg.children.length > 0) {
                result.push(...fg.children);
            }
        });
        return result;
    }, [familyGroups]);

    const loadProductInventory = async (productId: number) => {
        const requestId = ++inventoryRequestId.current;
        setLoadingBatches(true);
        setInventoryDetailsError(null);

        try {
            const data = await fetchProductInventoryDetails(productId);
            if (requestId !== inventoryRequestId.current) return;
            setProductBatches(data);
        } catch {
            if (requestId !== inventoryRequestId.current) return;
            const message = "Unable to load inventory data at this time. Please retry.";
            setProductBatches([]);
            setInventoryDetailsError(message);
            toast.error(message);
        } finally {
            if (requestId === inventoryRequestId.current) {
                setLoadingBatches(false);
            }
        }
    };

    const handleToggleExpand = async (productId: number) => {
        if (expandedProductId === productId) {
            inventoryRequestId.current += 1;
            setExpandedProductId(null);
            setProductBatches([]);
            setInventoryDetailsError(null);
            setLoadingBatches(false);
            return;
        }

        setExpandedProductId(productId);
        setProductBatches([]);
        setInventoryDetailsError(null);
        await loadProductInventory(productId);
    };

    const retryInventoryDetails = () => {
        if (expandedProductId !== null) {
            void loadProductInventory(expandedProductId);
        }
    };

    // Group batches by branch name for rendering
    const groupedByBranch = useMemo(() => {
        const branchesMap: Record<string, BranchGroupedBatches> = {};

        productBatches.forEach((item: BatchItem) => {
            const branch = item.branch_id && typeof item.branch_id === "object" ? item.branch_id : null;
            const branchName = item.branch_name || branch?.branch_name || "Unassigned Warehouse";
            const branchCode = item.branch_code || branch?.branch_code || "N/A";

            if (!branchesMap[branchName]) {
                branchesMap[branchName] = {
                    branchName,
                    branchCode,
                    batches: [],
                    totalQty: 0
                };
            }

            branchesMap[branchName].batches.push({
                lot_number: item.lot_number || "BATCH-N/A",
                expiration_date: item.expiration_date,
                qty: Number(item.quantity_received || 0),
                reception_date: item.created_on || item.shipment_id?.date_received || "N/A",
                shipment_ref: item.source_reference || item.shipment_id?.reference_number || "N/A"
            });

            branchesMap[branchName].totalQty += Number(item.quantity_received || 0);
        });

        return Object.values(branchesMap);
    }, [productBatches]);

    return {
        search,
        setSearch,
        typeFilter,
        setTypeFilter,
        expandedProductId,
        loadingBatches,
        inventoryDetailsError,
        familyGroups,
        sortedFiltered,
        handleToggleExpand,
        retryInventoryDetails,
        groupedByBranch,
        page,
        setPage,
        pageSize,
        setPageSize,
        isItemPkg
    };
}
