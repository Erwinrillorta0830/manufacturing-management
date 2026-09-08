"use client";

import { useState, useMemo, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { StockConversionProduct } from "../types/stock-conversion.types";
import { getColumns } from "./columns";
import { DataTable } from "@/components/ui/new-data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableCombobox } from "@/modules/manufacturing-management/stock-transfer/shared/components/searchable-combobox";

interface StockConversionTableProps {
  data: StockConversionProduct[];
  totalCount: number;
  page: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  onConvertClick: (product: StockConversionProduct) => void;
  onRefresh: () => void;
  onFilterChange: (filters: Record<string, string>) => void;
  loadProductsInventory: (productIds: number[]) => void;
  isLoading?: boolean;
  branches?: Array<{ id: number; branch_name?: string; name?: string; isActive?: number | boolean | string }>;
  selectedBranchId?: number;
  onBranchChange?: (branchId: number | undefined) => void;
  options?: {
    brands: { id: number; name: string }[];
    categories: { id: number; name: string }[];
    units: { id: number; name: string }[];
    suppliers: { id: number; name: string; shortcut: string }[];
  };
  convertingId?: number | null;
}

const INVENTORY_TYPE_OPTIONS = [
  { value: "FINISHED_GOODS", label: "Finished Goods" },
  { value: "RAW_MATERIALS", label: "Raw Materials" },
];

export function StockConversionTable({
  data,
  totalCount,
  page,
  pageSize,
  setPage,
  setPageSize,
  onConvertClick,
  onRefresh,
  onFilterChange,
  loadProductsInventory,
  isLoading,
  branches,
  selectedBranchId,
  onBranchChange,
  options,
  convertingId,
}: StockConversionTableProps) {
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [inventoryType, setInventoryType] = useState<string>("FINISHED_GOODS");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [hasStockFilter, setHasStockFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [localBranchId, setLocalBranchId] = useState<number | undefined>(selectedBranchId);

  // Sync local branch when prop changes externally
  useEffect(() => {
    queueMicrotask(() => {
      setLocalBranchId(selectedBranchId);
    });
  }, [selectedBranchId]);

  const uniqueBrands = useMemo(() => {
    if (options?.brands?.length) return options.brands;
    const set = new Set<string>();
    return data.map(d => d.brand).filter(b => {
      if (!b || b === "Unknown" || set.has(b)) return false;
      set.add(b);
      return true;
    }).map(b => ({ id: 0, name: b }));
  }, [options, data]);

  const uniqueCategories = useMemo(() => {
    if (options?.categories?.length) return options.categories;
    const set = new Set<string>();
    return data.map(d => d.category).filter(c => {
      if (!c || c === "Unknown" || set.has(c)) return false;
      set.add(c);
      return true;
    }).map(c => ({ id: 0, name: c }));
  }, [options, data]);

  const uniqueUnits = useMemo(() => {
    if (options?.units?.length) return options.units;
    const set = new Set<string>();
    return data.map(d => d.currentUnit).filter(u => {
      if (!u || u === "Unknown" || set.has(u)) return false;
      set.add(u);
      return true;
    }).map(u => ({ id: 0, name: u }));
  }, [options, data]);

  const uniqueSuppliers = useMemo(() => {
    const suppliers = options?.suppliers?.length ? options.suppliers : [];
    const map = new Map<string, string>();
    
    // Add from props
    suppliers.forEach(s => {
      if (s.name?.trim() && s.shortcut?.trim()) map.set(s.name.trim(), s.shortcut.trim());
    });
    
    // Add from data (fallbacks)
    if (!suppliers.length) {
      data.forEach((d) => {
        if (d.supplierName?.trim() && d.supplierShortcut?.trim()) {
          map.set(d.supplierName.trim(), d.supplierShortcut.trim());
        }
      });
    }

    return Array.from(map.entries()).map(([name, shortcut]) => {
      const found = suppliers.find(s => s.name === name);
      return { id: found?.id || 0, name, shortcut };
    });
  }, [options, data]);

  const isPrimaryFilterSelected = !!localBranchId && (inventoryType === "FINISHED_GOODS" || !!supplierFilter);

  const handleInventoryTypeChange = (val: string | null) => {
    const nextType = val || "FINISHED_GOODS";
    setInventoryType(nextType);
    if (nextType === "FINISHED_GOODS") {
      setSupplierFilter("");
    }
  };

  const handleApplyFilters = (searchOverride?: string, branchOverride?: number) => {
    const filterPayload: Record<string, string> = {};
    
    // Safety check: ensure activeSearch is a string. 
    // onClick={handleApplyFilters} passes the event object, which we must ignore.
    const activeSearch = (typeof searchOverride === 'string') ? searchOverride : searchQuery;
    const activeBranchId = branchOverride !== undefined ? branchOverride : localBranchId;

    filterPayload.inventoryType = inventoryType;

    if (inventoryType !== "FINISHED_GOODS" && supplierFilter) {
      // Find by name OR shortcut to be safe
      const found = uniqueSuppliers.find(s => s.name === supplierFilter || s.shortcut === supplierFilter);
      filterPayload.supplierShortcut = found?.shortcut || supplierFilter;
    }
    if (brandFilter) filterPayload.productBrand = brandFilter;
    if (categoryFilter) filterPayload.productCategory = categoryFilter;
    if (unitFilter) filterPayload.unitName = unitFilter;
    if (activeSearch && typeof activeSearch === 'string' && activeSearch.trim()) {
      filterPayload.search = activeSearch.trim();
    }

    setPage(1);
    const finalPayload = { 
      ...filterPayload, 
      branchId: activeBranchId ? String(activeBranchId) : "" 
    };
    onBranchChange?.(activeBranchId);
    onFilterChange(finalPayload);
  };

  // Filters now only apply when the "Apply" button is clicked, per user preference.
  // Search query remains reactive but debounced for a better user experience.
  useEffect(() => {
    const handler = setTimeout(() => {
      // Apply filters if there is a search query OR if the search query was just cleared
      // This ensures that deleting the search string actually resets the list.
      if (localBranchId && (inventoryType === "FINISHED_GOODS" || supplierFilter)) {
        handleApplyFilters();
      }
    }, 400);

    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleClearFilters = () => {
    setBrandFilter("");
    setCategoryFilter("");
    setUnitFilter("");
    setInventoryType("FINISHED_GOODS");
    setSupplierFilter("");
    setHasStockFilter(false);
    setSearchQuery("");
    setLocalBranchId(undefined);
    setPage(1);
    onBranchChange?.(undefined);
    onFilterChange({});
  };

  const filteredData = useMemo(() => {
    if (!hasStockFilter) return data;
    return data.filter(item => item.quantity > 0 && (item.availableUnits?.length ?? 0) > 0);
  }, [data, hasStockFilter]);

  const effectiveTotalCount = useMemo(() => {
    if (hasStockFilter) return filteredData.length;
    return totalCount;
  }, [hasStockFilter, filteredData.length, totalCount]);

  const canConvert = selectedBranchId !== undefined && selectedBranchId > 0;
  const columns = useMemo(
    () => getColumns(onConvertClick, (id: number) => loadProductsInventory([id]), canConvert, convertingId),
    [onConvertClick, loadProductsInventory, canConvert, convertingId]
  );

  const filterActions = (
    <div className="flex items-center gap-1.5 xl:gap-2 flex-nowrap shrink-0">
      {/* Primary Controls: Branch, Inventory Type & Supplier side by side */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="w-[145px]">
          <SearchableCombobox
            options={branches
              ?.filter((b) => b.isActive === undefined || b.isActive === 1 || b.isActive === true || b.isActive === "1")
              .map((b) => ({
                value: String(b.id),
                label: String(b.branch_name || b.name || b.id),
              })) || []}
            value={localBranchId ? String(localBranchId) : ""}
            onValueChange={(val: string | null) => setLocalBranchId(val ? Number(val) : undefined)}
            placeholder="Select Branch"
            className="h-9"
            disabled={isLoading}
          />
        </div>

        <div className="w-[145px]">
          <SearchableCombobox
            options={INVENTORY_TYPE_OPTIONS}
            value={inventoryType}
            onValueChange={handleInventoryTypeChange}
            placeholder="Inventory Type"
            className="h-9"
            disabled={isLoading}
          />
        </div>

        <div className="w-[150px]">
          <SearchableCombobox
            options={uniqueSuppliers.map(s => ({
              value: s.name || "Unknown",
              label: s.name || "Unknown",
            }))}
            value={supplierFilter}
            onValueChange={setSupplierFilter}
            placeholder={inventoryType === "FINISHED_GOODS" ? "Not Applicable" : "Select Supplier"}
            className="h-9"
            disabled={isLoading || inventoryType === "FINISHED_GOODS"}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="hidden lg:block w-px h-5 bg-slate-200 dark:bg-slate-800 shrink-0" />

      {/* Secondary Filters Group */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div 
          className={`flex items-center space-x-1.5 bg-blue-500/5 px-2.5 py-1 rounded-md border border-blue-500/10 h-9 transition-colors shrink-0 ${(!isPrimaryFilterSelected || isLoading) ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-blue-500/10"}`}
          onClick={(e) => {
            if (isLoading || !isPrimaryFilterSelected) return;
            if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).getAttribute("role") === "checkbox") return;
            setHasStockFilter(prev => !prev);
            setPage(1);
          }}
        >
          <Checkbox 
            id="convertible-only" 
            checked={hasStockFilter} 
            onCheckedChange={(checked) => {
              setHasStockFilter(!!checked);
              setPage(1);
            }} 
            disabled={isLoading || !isPrimaryFilterSelected}
          />
          <Label 
            htmlFor="convertible-only" 
            className={`text-[10px] font-bold cursor-pointer uppercase tracking-tight select-none whitespace-nowrap ${(!isPrimaryFilterSelected) ? "text-muted-foreground opacity-50" : "text-blue-600 dark:text-blue-400"}`}
          >
            Convertible Only
          </Label>
        </div>

        <div className="w-[110px]">
          <SearchableCombobox
            options={uniqueBrands.map(b => ({
              value: b.name || "Unknown",
              label: b.name || "Unknown",
            }))}
            value={brandFilter}
            onValueChange={setBrandFilter}
            placeholder="All Brands"
            className="h-9"
            disabled={isLoading || !isPrimaryFilterSelected}
          />
        </div>

        <div className="w-[125px]">
          <SearchableCombobox
            options={uniqueCategories.map(c => ({
              value: c.name || "Unknown",
              label: c.name || "Unknown",
            }))}
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            placeholder="Categories"
            className="h-9"
            disabled={isLoading || !isPrimaryFilterSelected}
          />
        </div>

        <div className="w-[100px]">
          <SearchableCombobox
            options={uniqueUnits.map(u => ({
              value: u.name || "Unknown",
              label: u.name || "Unknown",
            }))}
            value={unitFilter}
            onValueChange={setUnitFilter}
            placeholder="All Units"
            className="h-9"
            disabled={isLoading || !isPrimaryFilterSelected}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button 
            variant="default" 
            size="sm" 
            onClick={() => handleApplyFilters()} 
            disabled={isLoading || !isPrimaryFilterSelected}
            className="h-9 px-2.5 text-xs font-bold uppercase bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            Apply
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClearFilters} 
            disabled={isLoading || !isPrimaryFilterSelected}
            className="h-9 px-2.5 text-xs font-bold uppercase border-slate-200 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
          >
            Clear
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onRefresh} 
            disabled={isLoading || !isPrimaryFilterSelected} 
            className="h-9 w-9 rounded-lg hover:bg-blue-50 text-blue-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background rounded-xl p-4">
      <DataTable
        columns={columns}
        data={filteredData}
        pageCount={Math.ceil(effectiveTotalCount / pageSize)}
        pagination={{
          pageIndex: page - 1,
          pageSize: pageSize,
        }}
        onPaginationChange={(p) => {
          setPage(p.pageIndex + 1);
          setPageSize(p.pageSize);
        }}
        manualPagination={!hasStockFilter}
        onSearch={(val) => {
          setSearchQuery(val);
        }}
        searchKey="productName"
        isLoading={isLoading}
        actionComponent={filterActions}
        emptyTitle={
          !isPrimaryFilterSelected
            ? (inventoryType === "FINISHED_GOODS"
                ? "Select a Branch to start"
                : "Select a Branch and Supplier to start")
            : "No products found"
        }
        emptyDescription={
          !isPrimaryFilterSelected
            ? (inventoryType === "FINISHED_GOODS"
                ? "Please choose a branch from the filters above and click Apply to view stock levels."
                : "Please choose both a branch and a supplier from the filters above and click Apply to view stock levels.")
            : (hasStockFilter
                ? "No products with convertible stock found."
                : "Try adjusting your filters.")
        }
      />
    </div>
  );
}