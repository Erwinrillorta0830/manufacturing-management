import React, { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Package, Minus, Plus, Filter, Box, Layers, Archive } from "lucide-react";
import {
  StockAdjustmentProduct,
  StockAdjustmentItem,
  ProductClassification,
  ProductTypeFilter,
} from "../../types/stock-adjustment.schema";

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierName: string;
  branchName: string;
  products: StockAdjustmentProduct[];
  isLoading: boolean;
  rfidProductIds?: Set<number> | number[];
  initialSelectedItems: StockAdjustmentItem[];
  onConfirm: (items: StockAdjustmentItem[]) => void;
}

export const PRODUCT_CLASSIFICATION_CONFIG: Record<
  ProductClassification,
  {
    label: string;
    shortLabel: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  RM: {
    label: "Raw Materials (RM)",
    shortLabel: "RM",
    badgeBg: "bg-emerald-500/10 dark:bg-emerald-950/30",
    badgeText: "text-emerald-700 dark:text-emerald-400",
    badgeBorder: "border-emerald-500/30 dark:border-emerald-700/40",
    icon: Layers,
  },
  PKG: {
    label: "Packaging (PKG)",
    shortLabel: "PKG",
    badgeBg: "bg-amber-500/10 dark:bg-amber-950/30",
    badgeText: "text-amber-700 dark:text-amber-400",
    badgeBorder: "border-amber-500/30 dark:border-amber-700/40",
    icon: Archive,
  },
  FG: {
    label: "Finished Goods (FG)",
    shortLabel: "FG",
    badgeBg: "bg-blue-500/10 dark:bg-blue-950/30",
    badgeText: "text-blue-700 dark:text-blue-400",
    badgeBorder: "border-blue-500/30 dark:border-blue-700/40",
    icon: Box,
  },
};

/**
 * Robust classifier for determining product classification:
 * RM (Raw Materials), PKG (Packaging), FG (Finished Goods)
 */
export function getProductClassification(product: StockAdjustmentProduct): ProductClassification {
  // 1. Directus product_type ID check
  const pt = product.product_type;
  let typeId: number | null = null;
  let typeName = "";

  if (typeof pt === "number") {
    typeId = pt;
  } else if (typeof pt === "string" && !isNaN(Number(pt)) && Number(pt) > 0) {
    typeId = Number(pt);
  } else if (typeof pt === "object" && pt !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ptObj = pt as Record<string, any>;
    if (ptObj.id || ptObj.product_type_id || ptObj.type_id) {
      typeId = Number(ptObj.id || ptObj.product_type_id || ptObj.type_id);
    }
    typeName = String(ptObj.name || ptObj.type_name || ptObj.description || "").toLowerCase();
  } else if (typeof pt === "string") {
    typeName = pt.toLowerCase();
  }

  if (typeId === 389) return "RM";
  if (typeId === 390) return "PKG";
  if (typeId === 388) return "FG";

  if (typeName) {
    if (typeName.includes("raw") || typeName.includes("ingredient") || typeName === "rm" || typeName.includes("bulk")) return "RM";
    if (typeName.includes("packag") || typeName.includes("container") || typeName.includes("bottle") || typeName === "pkg" || typeName.includes("wrapper") || typeName.includes("cap")) return "PKG";
    if (typeName.includes("finish") || typeName.includes("commercial") || typeName === "fg") return "FG";
  }

  // 2. Category name check
  const cat = product.category_name || (typeof product.product_category === "object" && product.product_category !== null ? (product.product_category as { category_name?: string }).category_name : String(product.product_category || ""));
  const catLower = String(cat || "").toLowerCase();
  if (catLower) {
    if (catLower.includes("raw") || catLower.includes("ingredient") || catLower.includes("bulk") || catLower.includes("chemical")) return "RM";
    if (catLower.includes("packag") || catLower.includes("bottle") || catLower.includes("cap") || catLower.includes("container") || catLower.includes("wrapping") || catLower.includes("label")) return "PKG";
    if (catLower.includes("finish") || catLower.includes("commercial")) return "FG";
  }

  // 3. Product code prefix check
  const codeLower = String(product.product_code || "").toLowerCase();
  if (codeLower.startsWith("rm-") || codeLower.startsWith("rm_") || codeLower.startsWith("raw-")) return "RM";
  if (codeLower.startsWith("pkg-") || codeLower.startsWith("pkg_") || codeLower.startsWith("pack-") || codeLower.startsWith("pkg")) return "PKG";
  if (codeLower.startsWith("fg-") || codeLower.startsWith("fg_") || codeLower.startsWith("fin-")) return "FG";

  // 4. Product description / name keywords
  const text = `${product.description || ""} ${product.product_name || ""}`.toLowerCase();
  if (
    text.includes("purified process water") ||
    text.includes("purified water") ||
    text.includes("raw material") ||
    text.includes("ingredient") ||
    text.includes("chemical") ||
    text.includes("flavor") ||
    text.includes("bulk liquid") ||
    text.includes("bulk ")
  ) {
    return "RM";
  }
  if (
    text.includes("pet bottle") ||
    text.includes("bottle") ||
    text.includes("cap") ||
    text.includes("packaging") ||
    text.includes("wrapper") ||
    text.includes("sheet") ||
    text.includes("pouch") ||
    text.includes("carton") ||
    text.includes("label") ||
    text.includes("seal")
  ) {
    return "PKG";
  }

  return "FG";
}

export function ProductSelectionModal({
  isOpen,
  onClose,
  supplierName,
  branchName,
  products,
  isLoading,
  initialSelectedItems,
  onConfirm,
}: ProductSelectionModalProps) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>("ALL");
  const [cartItems, setCartItems] = useState<StockAdjustmentItem[]>([]);

  // Initialize cart when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCartItems(initialSelectedItems || []);
      setCatalogSearch("");
      setProductTypeFilter("ALL");
    }
  }, [isOpen, initialSelectedItems]);

  // Pre-calculate classification for all products
  const classifiedProducts = useMemo(() => {
    return products.map((p) => ({
      ...p,
      _classification: getProductClassification(p),
    }));
  }, [products]);

  // Calculate counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<ProductTypeFilter, number> = {
      ALL: classifiedProducts.length,
      RM: 0,
      PKG: 0,
      FG: 0,
    };
    classifiedProducts.forEach((p) => {
      counts[p._classification] = (counts[p._classification] || 0) + 1;
    });
    return counts;
  }, [classifiedProducts]);

  // Filter products by classification and search query
  const filteredProducts = useMemo(() => {
    let result = classifiedProducts;

    // 1. Classification filter
    if (productTypeFilter !== "ALL") {
      result = result.filter((p) => p._classification === productTypeFilter);
    }

    // 2. Search query filter
    if (catalogSearch.trim()) {
      const t = catalogSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.description?.toLowerCase().includes(t) ||
          p.product_name?.toLowerCase().includes(t) ||
          p.product_code?.toLowerCase().includes(t) ||
          p.barcode?.toLowerCase().includes(t)
      );
    }

    return result;
  }, [classifiedProducts, productTypeFilter, catalogSearch]);

  const addedProductIds = useMemo(() => {
    const ids = new Set<number>();
    cartItems.forEach((item) => {
      if (item.product_id) ids.add(Number(item.product_id));
    });
    return ids;
  }, [cartItems]);

  const handleAddToCart = (product: StockAdjustmentProduct) => {
    const productId = product.product_id || product.id;
    if (addedProductIds.has(Number(productId))) return;

    const resolvedUnitId = product.unit_id
      ? (typeof product.unit_id === 'object' ? (product.unit_id as { unit_id?: number; id?: number }).unit_id || (product.unit_id as { unit_id?: number; id?: number }).id : Number(product.unit_id))
      : (product.unit_of_measurement?.unit_id ? Number(product.unit_of_measurement.unit_id) : undefined);

    const newItem: StockAdjustmentItem = {
      product_id: Number(productId),
      product_name: product.description || product.product_name,
      product_code: product.product_code,
      quantity: 1,
      branch_id: 0, // Will be set by form
      type: "IN",   // Will be set by form
      cost_per_unit: product.cost_per_unit || product.price_per_unit || 0,
      unit_id: resolvedUnitId ? Number(resolvedUnitId) : undefined,
      unit_name: product.unit_name || "pcs",
      brand_name: product.brand_name || "N/A",
      barcode: product.barcode || "N/A",
      description: product.description || "No description available.",
      unit_order: product.unit_of_measurement?.order || 1,
      remarks: "",
    };

    setCartItems([...cartItems, newItem]);
  };

  const handleRemoveFromCart = (productId: number) => {
    setCartItems(cartItems.filter((item) => Number(item.product_id) !== productId));
  };

  const handleUpdateQuantity = (productId: number, delta: number) => {
    setCartItems(
      cartItems.map((item) => {
        if (Number(item.product_id) === productId) {
          const newQty = Math.max(1, (item.quantity || 1) + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      return sum + (item.quantity || 0) * (item.cost_per_unit || 0);
    }, 0);
  }, [cartItems]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[95vw] w-[1400px] xl:w-[1550px] 2xl:w-[1700px] h-[90vh] max-h-[1000px] p-0 overflow-hidden flex flex-col bg-background shadow-2xl border-border">
        <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between shrink-0 bg-card">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Add Products to {(branchName || "Selected Branch").toUpperCase()}
            </DialogTitle>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              SUPPLIER: <span className="text-primary">{supplierName || "Selected Supplier"}</span>
            </span>
          </div>
          {cartItems.length > 0 && (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-3 py-1 font-mono">
              {cartItems.length} in Cart
            </Badge>
          )}
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* LEFT PANEL - CATALOG */}
          <div className="w-[65%] flex flex-col border-r border-border bg-background">
            {/* Filter Toolbar: Search + Product Type Filter (Tabs on wide / Dropdown on smaller) */}
            <div className="p-4 border-b border-border shrink-0 flex items-center justify-between gap-3 bg-card/60">
              <div className="relative w-60 md:w-72 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search SKU or Name..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full pl-9 pr-4 h-10 text-xs font-medium border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-none"
                />
              </div>

              {/* Product Type Filter Tabs (shown when wide enough: 2xl:flex hidden) */}
              <div className="hidden 2xl:flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                <Button
                  size="sm"
                  variant={productTypeFilter === "ALL" ? "default" : "outline"}
                  onClick={() => setProductTypeFilter("ALL")}
                  className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none shrink-0 transition-all ${
                    productTypeFilter === "ALL"
                      ? "bg-primary text-primary-foreground font-black"
                      : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ALL
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === "ALL" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {categoryCounts.ALL}
                  </span>
                </Button>

                <Button
                  size="sm"
                  variant={productTypeFilter === "RM" ? "default" : "outline"}
                  onClick={() => setProductTypeFilter("RM")}
                  className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none whitespace-nowrap shrink-0 transition-all ${
                    productTypeFilter === "RM"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                      : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Raw Materials (RM)
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === "RM" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {categoryCounts.RM}
                  </span>
                </Button>

                <Button
                  size="sm"
                  variant={productTypeFilter === "PKG" ? "default" : "outline"}
                  onClick={() => setProductTypeFilter("PKG")}
                  className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none whitespace-nowrap shrink-0 transition-all ${
                    productTypeFilter === "PKG"
                      ? "bg-amber-600 hover:bg-amber-700 text-white font-black"
                      : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Packaging (PKG)
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === "PKG" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {categoryCounts.PKG}
                  </span>
                </Button>

                <Button
                  size="sm"
                  variant={productTypeFilter === "FG" ? "default" : "outline"}
                  onClick={() => setProductTypeFilter("FG")}
                  className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none whitespace-nowrap shrink-0 transition-all ${
                    productTypeFilter === "FG"
                      ? "bg-blue-600 hover:bg-blue-700 text-white font-black"
                      : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Finished Goods (FG)
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === "FG" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {categoryCounts.FG}
                  </span>
                </Button>
              </div>

              {/* Product Type Dropdown Filter (shown when tabs do not fit: 2xl:hidden flex) */}
              <div className="flex 2xl:hidden items-center gap-2 min-w-[200px] justify-end flex-1">
                <Select
                  value={productTypeFilter}
                  onValueChange={(val) => setProductTypeFilter(val as ProductTypeFilter)}
                >
                  <SelectTrigger className="h-10 text-xs font-bold bg-background border-border rounded-lg min-w-[190px] w-full max-w-[240px]">
                    <div className="flex items-center gap-2 truncate">
                      <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <SelectValue placeholder="Classification" />
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end" className="min-w-[220px]">
                    <SelectItem value="ALL" className="text-xs font-semibold cursor-pointer">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>ALL</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {categoryCounts.ALL}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="RM" className="text-xs font-semibold cursor-pointer">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">Raw Materials (RM)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          {categoryCounts.RM}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="PKG" className="text-xs font-semibold cursor-pointer">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="text-amber-700 dark:text-amber-400 font-bold">Packaging (PKG)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          {categoryCounts.PKG}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="FG" className="text-xs font-semibold cursor-pointer">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="text-blue-700 dark:text-blue-400 font-bold">Finished Goods (FG)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          {categoryCounts.FG}
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* CATALOG GRID */}
            <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-44 rounded-xl bg-muted/40 animate-pulse border border-border" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-bold text-foreground mb-1">No products found</p>
                  <p className="text-xs text-muted-foreground max-w-sm mb-4">
                    {catalogSearch
                      ? `No items match "${catalogSearch}" under classification "${productTypeFilter}".`
                      : `No products found under classification "${productTypeFilter}".`}
                  </p>
                  {(productTypeFilter !== "ALL" || catalogSearch) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setProductTypeFilter("ALL");
                        setCatalogSearch("");
                      }}
                      className="text-xs font-bold"
                    >
                      Show All Products
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
                  {filteredProducts.map((product) => {
                    const pid = Number(product.product_id || product.id);
                    const isAdded = addedProductIds.has(pid);
                    const classification = product._classification;
                    const config = PRODUCT_CLASSIFICATION_CONFIG[classification];
                    const ClassIcon = config.icon;

                    return (
                      <div
                        key={pid}
                        className={`flex flex-col bg-card rounded-xl border p-4 transition-all shadow-sm ${
                          isAdded
                            ? "border-primary/60 dark:border-primary/40 ring-1 ring-primary/20 bg-primary/[0.02]"
                            : "border-border hover:border-primary/30 hover:shadow-md"
                        }`}
                      >
                        <div className="flex-1">
                          {/* Classification Tag & SKU Header */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
                              <ClassIcon className="w-2.5 h-2.5" />
                              {config.shortLabel}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono font-bold">
                              {product.product_code || "SKU: N/A"}
                            </span>
                          </div>

                          <div className="flex justify-between items-start gap-2 mb-2">
                            <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-2 pr-1 group-hover:text-primary transition-colors">
                              {product.description || product.product_name}
                            </h3>
                            {isAdded && (
                              <div className="bg-primary text-primary-foreground rounded-full p-0.5 shrink-0 mt-0.5 shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>

                          {/* Brand & UoM */}
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0 h-4 border-border/70 text-muted-foreground">
                              {product.brand_name || "GENERIC"}
                            </Badge>
                            {product.unit_name && (
                              <div className="inline-flex items-center gap-1 text-[9px] font-bold uppercase text-primary font-mono">
                                <Package className="w-2.5 h-2.5" />
                                {product.unit_name}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-auto pt-2 text-center border-t border-border/40">
                          <div className="text-lg font-black text-primary font-mono mb-0.5">
                            ₱{Number(product.cost_per_unit || product.price_per_unit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-3">/ {product.unit_name || "UNIT"}</div>

                          {isAdded ? (
                            <Button
                              variant="outline"
                              className="w-full h-9 text-[11px] font-bold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-950/30 uppercase rounded-md"
                              onClick={() => handleRemoveFromCart(pid)}
                            >
                              REMOVE
                            </Button>
                          ) : (
                            <Button
                              className="w-full h-9 text-[11px] font-bold bg-primary hover:bg-primary/90 text-white shadow-sm uppercase rounded-md"
                              onClick={() => handleAddToCart(product)}
                            >
                              ADD TO ORDER
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL - CART SUMMARY */}
          <div className="w-[35%] flex flex-col bg-muted/5">
            <div className="p-4 border-b border-border shrink-0 flex items-center justify-between bg-card">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-wider">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                CART SUMMARY
              </div>
              <div className="w-6 h-6 flex items-center justify-center bg-primary text-white text-[11px] font-bold rounded-full shadow-sm">
                {cartItems.length}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="p-4 rounded-full border border-dashed border-border mb-4 bg-muted/30">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 text-muted-foreground/30">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-muted-foreground mb-1">EMPTY CART</p>
                  <p className="text-xs text-muted-foreground/70">Select products from the grid to add<br/>them to your order.</p>
                </div>
              ) : (
                cartItems.map((item) => {
                  const pid = Number(item.product_id);
                  const cost = Number(item.cost_per_unit || 0);
                  const qty = item.quantity || 1;
                  const total = cost * qty;

                  return (
                    <div key={pid} className="bg-card rounded-xl border border-border p-4 shadow-sm relative">
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <h4 className="text-sm font-bold text-foreground leading-tight line-clamp-2 pr-4">
                          {item.product_name}
                        </h4>
                      </div>

                      <div className="text-[11px] text-muted-foreground mb-2 font-mono">
                        ₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>

                      {item.unit_name && (
                        <div className="inline-block text-[10px] font-bold uppercase text-primary mb-3 tracking-wide bg-primary/10 px-2 py-0.5 rounded">
                          {item.unit_name}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                        <div className="flex items-center bg-background border border-border rounded-md overflow-hidden h-9">
                          <button
                            className="w-9 flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                            onClick={() => handleUpdateQuantity(pid, -1)}
                            disabled={qty <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            value={qty === 0 ? "" : qty}
                            onChange={(e) => {
                              let val = parseInt(e.target.value, 10);
                              if (isNaN(val) || val < 1) val = 1;
                              setCartItems(cartItems.map((cItem) => {
                                if (Number(cItem.product_id) === pid) {
                                  return { ...cItem, quantity: val };
                                }
                                return cItem;
                              }));
                            }}
                            className="w-12 h-9 text-center text-sm font-bold border-x border-border focus:outline-none focus:ring-0 bg-transparent p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            min={1}
                          />
                          <button
                            className="w-9 flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                            onClick={() => handleUpdateQuantity(pid, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="text-right flex flex-col justify-end h-9">
                          <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Subtotal</div>
                          <div className="text-base font-bold text-foreground leading-none font-mono">
                            ₱{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-border bg-card shrink-0">
              <div className="flex items-center justify-between mb-4 px-4 py-3 bg-card rounded-xl border border-border shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Grand</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total</span>
                </div>
                <span className="text-xl font-black text-primary font-mono">
                  ₱{cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <Button
                className="w-full h-12 text-xs font-black bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/20 dark:shadow-none uppercase rounded-xl transition-all duration-300 hover:scale-[1.02] mb-3"
                disabled={cartItems.length === 0}
                onClick={() => {
                  onConfirm(cartItems);
                  onClose();
                }}
              >
                CONFIRM ORDER
              </Button>

              <Button
                variant="ghost"
                className="w-full h-9 text-xs font-bold text-muted-foreground hover:text-foreground rounded-lg uppercase"
                onClick={onClose}
              >
                BACK TO BRANCH
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
