import { useState, useMemo, useEffect } from "react";
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
    const [productBatches, setProductBatches] = useState<BatchItem[]>([]);
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

            const isPkg = isItemPkg(m);
            if (typeFilter === "raw") return !isPkg;
            if (typeFilter === "pkg") return isPkg;
            return true;
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

    const handleToggleExpand = async (productId: number) => {
        if (expandedProductId === productId) {
            setExpandedProductId(null);
            setProductBatches([]);
            return;
        }

        setExpandedProductId(productId);
        setLoadingBatches(true);
        try {
            const data = await fetchProductInventoryDetails(productId);
            setProductBatches(data);
        } catch (e) {
            console.error(e);
            toast.error(e instanceof Error ? e.message : "Failed to load inventory details");
        } finally {
            setLoadingBatches(false);
        }
    };

    // Group batches by branch name for rendering
    const groupedByBranch = useMemo(() => {
        const branchesMap: Record<string, BranchGroupedBatches> = {};

        productBatches.forEach((item: BatchItem) => {
            const branch = item.branch_id || { branch_name: "Unassigned Warehouse", branch_code: "N/A" };
            const branchName = branch.branch_name || "Unassigned Warehouse";
            const branchCode = branch.branch_code || "N/A";

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
                reception_date: item.shipment_id?.date_received || "N/A",
                shipment_ref: item.shipment_id?.reference_number || "N/A"
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
        familyGroups,
        sortedFiltered,
        handleToggleExpand,
        groupedByBranch,
        page,
        setPage,
        pageSize,
        setPageSize,
        isItemPkg
    };
}
