'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, ShoppingCart, Loader2, Package, Trash2 } from 'lucide-react';
import { EnrichedProduct } from '../../types/stock-transfer.types';
import { QuantityStepper } from './QuantityStepper';
import { getAssetUrl } from '@/lib/assets';

interface ProductSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: EnrichedProduct) => void;
  sourceBranch?: string;
  selectedProducts?: EnrichedProduct[];
  onUpdateQty?: (productId: number, qty: number) => void;
  onRemoveItem?: (productId: number) => void;
}

export function ProductSelectionModal({ open, onOpenChange, onSelect, sourceBranch, selectedProducts = [], onUpdateQty, onRemoveItem }: ProductSelectionModalProps) {
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  useEffect(() => {
    if (!open) return;
    const fetchCatalog = async () => {
      setLoading(true);
      try {
        const query = search ? `&search=${encodeURIComponent(search)}` : '';
        const branchQuery = sourceBranch ? `&branch_id=${sourceBranch}` : '';
        const res = await fetch(`/api/scm/warehouse-management/stock-transfer?action=products${query}${branchQuery}`);
        if (res.ok) {
          const data = await res.json();
          setProducts(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch product catalog:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchCatalog, 300);
    return () => clearTimeout(debounce);
  }, [open, search, sourceBranch]);

  const categories = React.useMemo(() => {
    const list = new Set<string>();
    products.forEach((p) => {
      if (typeof p.product_category === 'object' && p.product_category !== null) {
        list.add((p.product_category as { category_name?: string }).category_name || 'Uncategorized');
      } else if (p.product_category) {
        list.add(String(p.product_category));
      }
    });
    return Array.from(list);
  }, [products]);

  const handleSelect = (product: EnrichedProduct) => {
    onSelect(product);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col gap-0 overflow-hidden bg-card border-border shadow-2xl">
        <DialogHeader className="p-6 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Select Transfer Products
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground uppercase font-bold tracking-widest opacity-70">
                Browse catalog and select items to request for transfer.
              </DialogDescription>
            </div>
            {selectedProducts.length > 0 && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-3 py-1 font-mono">
                {selectedProducts.length} Selected
              </Badge>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <Input
                placeholder="Search products by SKU, name, barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 bg-background border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary/20 text-sm"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              <Button
                size="sm"
                variant={categoryFilter === 'ALL' ? 'default' : 'outline'}
                onClick={() => setCategoryFilter('ALL')}
                className="h-10 text-xs font-bold rounded-lg px-4 shadow-none"
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat}
                  size="sm"
                  variant={categoryFilter === cat ? 'default' : 'outline'}
                  onClick={() => setCategoryFilter(cat)}
                  className="h-10 text-xs font-bold rounded-lg px-4 shadow-none whitespace-nowrap"
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* CATALOG GRID */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            <div>
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs font-bold tracking-wider uppercase">Loading Catalog...</span>
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Package className="w-12 h-12 text-muted-foreground/30 mb-2" />
                  <h4 className="font-bold text-base text-foreground">No Products Found</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    No items match your search criteria.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-8">
                  {products.map((product) => {
                    const imgUrl = getAssetUrl(product.product_image);

                    return (
                      <div 
                        key={product.product_id}
                        className="group relative bg-background border border-border/60 rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all duration-300 flex flex-col"
                      >
                        <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
                          {imgUrl ? (
                            <Image
                              src={imgUrl}
                              alt={product.product_name}
                              fill
                              unoptimized
                              className="object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="text-2xl font-black text-muted-foreground/10 group-hover:scale-110 transition-transform duration-500 font-mono">
                              {product.product_name?.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute top-2 left-2 z-10">
                            <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-[8px] font-black tracking-widest uppercase border-border/50">
                              {typeof product.product_brand === 'object' && product.product_brand !== null 
                                ? (product.product_brand as { brand_name?: string }).brand_name 
                                : product.product_brand || 'GENERIC'}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="p-3 flex-1 flex flex-col gap-3">
                          <div className="space-y-1.5 flex-1">
                            <h3 className="font-bold text-xs line-clamp-2 leading-[1.3] text-foreground/90 font-sans group-hover:text-primary transition-colors">
                              {product.product_name}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                               <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60 font-mono">
                                <span>ID: {product.product_id}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[9px] text-primary/70 font-bold uppercase tracking-tighter">
                                <Package className="w-2.5 h-2.5" />
                                <span>{typeof product.unit_of_measurement === 'object' && product.unit_of_measurement !== null ? (product.unit_of_measurement as { unit_name?: string }).unit_name : String(product.unit_of_measurement || 'PCS')}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/30">
                            <div className="text-xs font-black text-primary font-mono bg-primary/5 px-2 py-0.5 rounded">
                              ₱{Number((product as { cost_per_unit?: number }).cost_per_unit || 0).toLocaleString()}
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 text-[10px] font-black uppercase tracking-widest hov hover:bg-primary/10 hover:text-primary rounded-md"
                              onClick={() => handleSelect(product)}
                            >
                              SELECT
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SIDE CART */}
          <div className="w-72 border-l border-border bg-muted/10 flex flex-col hidden lg:flex">
            <div className="p-6 border-b border-border bg-card">
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <ShoppingCart className="w-4 h-4 text-primary" />
                DRAFT LIST
                <Badge variant="secondary" className="ml-auto font-mono text-[10px] bg-primary/10 text-primary border-none">{selectedProducts.length}</Badge>
              </h3>
            </div>
            <ScrollArea className="flex-1 min-h-0 bg-card/40">
              <div className="p-3 space-y-2">
                {selectedProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-20 filter grayscale">
                    <ShoppingCart className="w-10 h-10 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">List is empty</p>
                  </div>
                ) : (
                  selectedProducts.map((p, idx) => {
                    const pid = p.product_id;
                    const uom = typeof p.unit_of_measurement === 'object' && p.unit_of_measurement !== null 
                      ? (p.unit_of_measurement as { unit_name?: string }).unit_name 
                      : (p.unit_of_measurement || 'PCS');
                    const qty = (p as EnrichedProduct & { quantity?: number }).quantity || 1;
                    const cartImgUrl = getAssetUrl(p.product_image);

                    return (
                      <div key={idx} className="bg-background border border-border/40 rounded-lg p-2.5 hover:border-primary/30 transition-all group/item shadow-none">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {cartImgUrl ? (
                              <div className="h-8 w-8 rounded-md bg-muted/40 border border-border/50 overflow-hidden shrink-0 relative">
                                <Image
                                  src={cartImgUrl}
                                  alt={p.product_name}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              </div>
                            ) : null}
                            <p className="text-[10px] font-bold line-clamp-2 leading-tight flex-1 text-foreground/80">{p.product_name}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground/30 hover:text-destructive hover:bg-transparent -mt-1 -mr-1 shrink-0"
                            onClick={() => onRemoveItem?.(Number(pid))}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        <div className="flex items-center justify-between">
                           <QuantityStepper 
                             value={qty}
                             max={9999}
                             onChange={(val) => onUpdateQty?.(Number(pid), val)}
                             className="h-7 w-fit"
                             size="sm"
                           />
                          <div className="flex flex-col items-end">
                            <span className="font-black text-primary text-[11px] font-mono tracking-tighter">₱{Number((p as { totalAmount?: number }).totalAmount || (p as { cost_per_unit?: number }).cost_per_unit || 0).toLocaleString()}</span>
                            <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest">{uom}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {selectedProducts.length > 0 && (
              <div className="p-4 border-t border-border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">Estimated Total</span>
                  <span className="text-sm font-black text-primary font-mono tracking-tighter">
                    ₱{selectedProducts.reduce((sum, p) => sum + Number((p as { totalAmount?: number }).totalAmount || (p as { cost_per_unit?: number }).cost_per_unit || 0), 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
