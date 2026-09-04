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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, ShoppingCart, Loader2, Package, Trash2, Box, Layers, Archive, Filter, ImageOff } from 'lucide-react';
import { EnrichedProduct } from '../../types/stock-transfer.types';
import { QuantityStepper } from './QuantityStepper';
import { getAssetUrl } from '@/lib/assets';

function ProductCardImage({
  imgUrl,
  alt,
  fallbackText,
}: {
  imgUrl?: string | null;
  alt: string;
  fallbackText?: string;
}) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [imgUrl]);

  if (!imgUrl) {
    return (
      <div className="text-2xl font-black text-muted-foreground/10 group-hover:scale-110 transition-transform duration-500 font-mono">
        {fallbackText?.substring(0, 2).toUpperCase() || 'NA'}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center p-3 text-center text-muted-foreground bg-muted/30 w-full h-full select-none">
        <ImageOff className="w-6 h-6 mb-1 text-muted-foreground/40" />
        <span className="text-[10px] font-bold text-muted-foreground/80 leading-tight">Failed to load</span>
        <span className="text-[8px] text-muted-foreground/50 leading-tight mt-0.5 max-w-[120px] truncate" title="Image asset not found or unreachable">
          Not found / unreachable
        </span>
      </div>
    );
  }

  return (
    <Image
      src={imgUrl}
      alt={alt}
      fill
      unoptimized
      onError={() => setLoadError(true)}
      className="object-cover group-hover:scale-105 transition-transform duration-500"
    />
  );
}

function CartItemThumbnail({
  imgUrl,
  alt,
  fallbackText,
}: {
  imgUrl?: string | null;
  alt: string;
  fallbackText?: string;
}) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [imgUrl]);

  if (!imgUrl || loadError) {
    return (
      <div 
        className="h-8 w-8 rounded-md bg-muted/40 border border-border/50 flex items-center justify-center shrink-0"
        title={loadError ? 'Image failed to load (not found/unreachable)' : undefined}
      >
        {loadError ? (
          <ImageOff className="w-3.5 h-3.5 text-muted-foreground/40" />
        ) : (
          <span className="text-[9px] font-bold font-mono text-muted-foreground/40">
            {fallbackText?.substring(0, 2).toUpperCase() || 'NA'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="h-8 w-8 rounded-md bg-muted/40 border border-border/50 overflow-hidden shrink-0 relative">
      <Image
        src={imgUrl}
        alt={alt}
        fill
        unoptimized
        onError={() => setLoadError(true)}
        className="object-cover"
      />
    </div>
  );
}

export type ProductClassification = 'RM' | 'PKG' | 'FG';
export type ProductTypeFilter = 'ALL' | ProductClassification;

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
    label: 'Raw Materials (RM)',
    shortLabel: 'RM',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-950/30',
    badgeText: 'text-emerald-700 dark:text-emerald-400',
    badgeBorder: 'border-emerald-500/30 dark:border-emerald-700/40',
    icon: Layers,
  },
  PKG: {
    label: 'Packaging (PKG)',
    shortLabel: 'PKG',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-950/30',
    badgeText: 'text-amber-700 dark:text-amber-400',
    badgeBorder: 'border-amber-500/30 dark:border-amber-700/40',
    icon: Archive,
  },
  FG: {
    label: 'Finished Goods (FG)',
    shortLabel: 'FG',
    badgeBg: 'bg-blue-500/10 dark:bg-blue-950/30',
    badgeText: 'text-blue-700 dark:text-blue-400',
    badgeBorder: 'border-blue-500/30 dark:border-blue-700/40',
    icon: Box,
  },
};

/**
 * Robust classifier for determining product classification:
 * RM (Raw Materials), PKG (Packaging), FG (Finished Goods)
 */
export function getProductClassification(product: EnrichedProduct): ProductClassification {
  // 1. Directus product_type ID check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pt = (product as any).product_type;
  let typeId: number | null = null;
  let typeName = '';

  if (typeof pt === 'number') {
    typeId = pt;
  } else if (typeof pt === 'string' && !isNaN(Number(pt)) && Number(pt) > 0) {
    typeId = Number(pt);
  } else if (typeof pt === 'object' && pt !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ptObj = pt as Record<string, any>;
    if (ptObj.id || ptObj.product_type_id || ptObj.type_id) {
      typeId = Number(ptObj.id || ptObj.product_type_id || ptObj.type_id);
    }
    typeName = String(ptObj.name || ptObj.type_name || ptObj.description || '').toLowerCase();
  } else if (typeof pt === 'string') {
    typeName = pt.toLowerCase();
  }

  if (typeId === 389) return 'RM';
  if (typeId === 390) return 'PKG';
  if (typeId === 388) return 'FG';

  if (typeName) {
    if (typeName.includes('raw') || typeName.includes('ingredient') || typeName === 'rm' || typeName.includes('bulk')) return 'RM';
    if (typeName.includes('packag') || typeName.includes('container') || typeName.includes('bottle') || typeName === 'pkg' || typeName.includes('wrapper') || typeName.includes('cap')) return 'PKG';
    if (typeName.includes('finish') || typeName.includes('commercial') || typeName === 'fg') return 'FG';
  }

  // 2. Category name check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cat = (product as any).category_name || (typeof product.product_category === 'object' && product.product_category !== null ? (product.product_category as { category_name?: string }).category_name : String(product.product_category || ''));
  const catLower = String(cat || '').toLowerCase();
  if (catLower) {
    if (catLower.includes('raw') || catLower.includes('ingredient') || catLower.includes('bulk') || catLower.includes('chemical')) return 'RM';
    if (catLower.includes('packag') || catLower.includes('bottle') || catLower.includes('cap') || catLower.includes('container') || catLower.includes('wrapping') || catLower.includes('label')) return 'PKG';
    if (catLower.includes('finish') || catLower.includes('commercial') || catLower.includes('bihon') || catLower.includes('canton') || catLower.includes('noodle') || catLower.includes('pasta')) return 'FG';
  }

  // 3. Product code prefix check
  const codeLower = String(product.product_code || '').toLowerCase();
  if (codeLower.startsWith('rm-') || codeLower.startsWith('rm_') || codeLower.startsWith('raw-')) return 'RM';
  if (codeLower.startsWith('pkg-') || codeLower.startsWith('pkg_') || codeLower.startsWith('pack-') || codeLower.startsWith('pkg') || codeLower.startsWith('pm-')) return 'PKG';
  if (codeLower.startsWith('fg-') || codeLower.startsWith('fg_') || codeLower.startsWith('fin-') || codeLower.startsWith('test-pgb') || codeLower.startsWith('pgb')) return 'FG';

  // 4. Product description / name keywords
  const text = `${product.description || ''} ${product.product_name || ''}`.toLowerCase();
  if (
    text.includes('bihon') ||
    text.includes('canton') ||
    text.includes('noodle') ||
    text.includes('pasta') ||
    text.includes('finished good') ||
    text.includes('commercial')
  ) {
    return 'FG';
  }
  if (
    text.includes('purified process water') ||
    text.includes('purified water') ||
    text.includes('raw material') ||
    text.includes('ingredient') ||
    text.includes('chemical') ||
    text.includes('flavor') ||
    text.includes('bulk liquid') ||
    text.includes('bulk ')
  ) {
    return 'RM';
  }
  if (
    text.includes('pet bottle') ||
    text.includes('bottle') ||
    text.includes('cap') ||
    text.includes('packaging') ||
    text.includes('wrapper') ||
    text.includes('sheet') ||
    text.includes('pouch') ||
    text.includes('carton') ||
    text.includes('label') ||
    text.includes('seal')
  ) {
    return 'PKG';
  }

  return 'FG';
}

const ProductCardItem = React.memo(function ProductCardItem({
  product,
  onSelect,
}: {
  product: EnrichedProduct & { _classification: ProductClassification };
  onSelect: (product: EnrichedProduct) => void;
}) {
  const imgUrl = getAssetUrl(product.product_image);
  const classification = product._classification;
  const config = PRODUCT_CLASSIFICATION_CONFIG[classification];
  const ClassIcon = config.icon;

  return (
    <div className="group relative bg-background border border-border/60 rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all duration-300 flex flex-col">
      <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
        <ProductCardImage
          imgUrl={imgUrl}
          alt={product.description || product.product_name}
          fallbackText={product.description || product.product_name}
        />
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
          <span
            className={`inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shadow-sm ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}
          >
            <ClassIcon className="w-2.5 h-2.5" />
            {config.shortLabel}
          </span>
        </div>
        <div className="absolute top-2 right-2 z-10">
          <Badge
            variant="outline"
            className="bg-background/80 backdrop-blur-sm text-[8px] font-black tracking-widest uppercase border-border/50"
          >
            {typeof product.product_brand === 'object' && product.product_brand !== null
              ? (product.product_brand as { brand_name?: string }).brand_name
              : product.product_brand || 'GENERIC'}
          </Badge>
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-3">
        <div className="space-y-1.5 flex-1">
          <h3 className="font-bold text-xs line-clamp-2 leading-[1.3] text-foreground/90 font-sans group-hover:text-primary transition-colors">
            {product.description || product.product_name}
          </h3>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60 font-mono">
              <span>ID: {product.product_code || product.barcode || product.product_id}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-primary/70 font-bold uppercase tracking-tighter">
              <Package className="w-2.5 h-2.5" />
              <span>
                {typeof product.unit_of_measurement === 'object' && product.unit_of_measurement !== null
                  ? (product.unit_of_measurement as { unit_name?: string }).unit_name
                  : String(product.unit_of_measurement || 'PCS')}
              </span>
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
            className="h-7 text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 hover:text-primary rounded-md"
            onClick={() => onSelect(product)}
          >
            SELECT
          </Button>
        </div>
      </div>
    </div>
  );
});

const CartItemRow = React.memo(function CartItemRow({
  item,
  onUpdateQty,
  onRemoveItem,
}: {
  item: EnrichedProduct;
  onUpdateQty?: (productId: number, qty: number) => void;
  onRemoveItem?: (productId: number) => void;
}) {
  const pid = item.product_id;
  const uom =
    typeof item.unit_of_measurement === 'object' && item.unit_of_measurement !== null
      ? (item.unit_of_measurement as { unit_name?: string }).unit_name
      : item.unit_of_measurement || 'PCS';
  const qty = (item as EnrichedProduct & { quantity?: number }).quantity || 1;
  const cartImgUrl = getAssetUrl(item.product_image);

  return (
    <div className="bg-background border border-border/40 rounded-lg p-2.5 hover:border-primary/30 transition-all group/item shadow-none">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <CartItemThumbnail
            imgUrl={cartImgUrl}
            alt={item.product_name}
            fallbackText={item.description || item.product_name}
          />
          <p className="text-[10px] font-bold line-clamp-2 leading-tight flex-1 text-foreground/80">
            {item.description || item.product_name}
          </p>
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
          <span className="font-black text-primary text-[11px] font-mono tracking-tighter">
            ₱{Number((item as { totalAmount?: number }).totalAmount || (item as { cost_per_unit?: number }).cost_per_unit || 0).toLocaleString()}
          </span>
          <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest">{uom}</span>
        </div>
      </div>
    </div>
  );
});

interface ProductSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: EnrichedProduct) => void;
  sourceBranch?: string;
  selectedProducts?: EnrichedProduct[];
  onUpdateQty?: (productId: number, qty: number) => void;
  onRemoveItem?: (productId: number) => void;
}

export function ProductSelectionModal({
  open,
  onOpenChange,
  onSelect,
  sourceBranch,
  selectedProducts = [],
  onUpdateQty,
  onRemoveItem,
}: ProductSelectionModalProps) {
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>('ALL');

  useEffect(() => {
    if (!open) return;
    const fetchCatalog = async () => {
      setLoading(true);
      try {
        const branchQuery = sourceBranch ? `&branch_id=${sourceBranch}` : '';
        const res = await fetch(`/api/scm/warehouse-management/stock-transfer?action=products${branchQuery}`);
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

    fetchCatalog();
  }, [open, sourceBranch]);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setSearch('');
        setProductTypeFilter('ALL');
      });
    }
  }, [open]);

  // Pre-calculate classification for all products
  const classifiedProducts = React.useMemo(() => {
    return products.map((p) => ({
      ...p,
      _classification: getProductClassification(p),
    }));
  }, [products]);

  // Calculate counts per category
  const categoryCounts = React.useMemo(() => {
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

  const filteredProducts = React.useMemo(() => {
    let result = classifiedProducts;

    // 1. Product Type Filter
    if (productTypeFilter !== 'ALL') {
      result = result.filter((p) => p._classification === productTypeFilter);
    }

    // 2. Client-side Search Filter (Instant without reload)
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((p) => {
        const name = (p.product_name || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const code = (p.product_code || '').toLowerCase();
        const barcode = (p.barcode || '').toLowerCase();
        const id = String(p.product_id || '');
        const brand =
          typeof p.product_brand === 'object' && p.product_brand !== null
            ? (p.product_brand as { brand_name?: string }).brand_name?.toLowerCase() || ''
            : String(p.product_brand || '').toLowerCase();

        return (
          name.includes(q) ||
          desc.includes(q) ||
          code.includes(q) ||
          barcode.includes(q) ||
          id.includes(q) ||
          brand.includes(q)
        );
      });
    }

    return result;
  }, [classifiedProducts, productTypeFilter, search]);

  const handleSelect = React.useCallback(
    (product: EnrichedProduct) => {
      onSelect(product);
    },
    [onSelect]
  );

  const estimatedTotal = React.useMemo(() => {
    return selectedProducts.reduce(
      (sum, p) =>
        sum +
        Number(
          (p as { totalAmount?: number }).totalAmount ||
            (p as { cost_per_unit?: number }).cost_per_unit ||
            0
        ),
      0
    );
  }, [selectedProducts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] w-[1400px] xl:w-[1550px] 2xl:w-[1700px] h-[90vh] max-h-[95vh] p-0 flex flex-col gap-0 overflow-hidden bg-card border-border shadow-2xl">
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-start gap-3 pt-4">
            <div className="relative w-full sm:w-80 md:w-96 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <Input
                placeholder="Search products by SKU, name, barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 w-full bg-background border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary/20 text-sm"
              />
            </div>

            {/* Product Type Filter Tabs (shown on wide screens) */}
            <div className="hidden xl:flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              <Button
                size="sm"
                variant={productTypeFilter === 'ALL' ? 'default' : 'outline'}
                onClick={() => setProductTypeFilter('ALL')}
                className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none shrink-0 transition-all ${
                  productTypeFilter === 'ALL'
                    ? 'bg-primary text-primary-foreground font-black'
                    : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                ALL
                <span
                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {categoryCounts.ALL}
                </span>
              </Button>

              <Button
                size="sm"
                variant={productTypeFilter === 'RM' ? 'default' : 'outline'}
                onClick={() => setProductTypeFilter('RM')}
                className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none whitespace-nowrap shrink-0 transition-all ${
                  productTypeFilter === 'RM'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-black'
                    : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Raw Materials (RM)
                <span
                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === 'RM' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {categoryCounts.RM}
                </span>
              </Button>

              <Button
                size="sm"
                variant={productTypeFilter === 'PKG' ? 'default' : 'outline'}
                onClick={() => setProductTypeFilter('PKG')}
                className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none whitespace-nowrap shrink-0 transition-all ${
                  productTypeFilter === 'PKG'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white font-black'
                    : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Packaging (PKG)
                <span
                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === 'PKG' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {categoryCounts.PKG}
                </span>
              </Button>

              <Button
                size="sm"
                variant={productTypeFilter === 'FG' ? 'default' : 'outline'}
                onClick={() => setProductTypeFilter('FG')}
                className={`h-10 text-xs font-bold rounded-lg px-3.5 shadow-none whitespace-nowrap shrink-0 transition-all ${
                  productTypeFilter === 'FG'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white font-black'
                    : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Finished Goods (FG)
                <span
                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    productTypeFilter === 'FG' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {categoryCounts.FG}
                </span>
              </Button>
            </div>

            {/* Product Type Dropdown Filter (shown when tabs do not fit) */}
            <div className="flex xl:hidden items-center gap-2 min-w-[200px] justify-end flex-1">
              <Select
                value={productTypeFilter}
                onValueChange={(val) => setProductTypeFilter(val as ProductTypeFilter)}
              >
                <SelectTrigger className="h-10 text-xs font-bold bg-background border-border rounded-lg min-w-[190px] w-full max-w-[260px]">
                  <div className="flex items-center gap-2 truncate">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Classification" />
                  </div>
                </SelectTrigger>
                <SelectContent align="end" className="min-w-[240px]">
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
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Package className="w-12 h-12 text-muted-foreground/30 mb-2" />
                  <h4 className="font-bold text-base text-foreground">No Products Found</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    {search
                      ? `No items match "${search}" under classification "${productTypeFilter}".`
                      : `No products found under classification "${productTypeFilter}".`}
                  </p>
                  {productTypeFilter !== 'ALL' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setProductTypeFilter('ALL')}
                      className="mt-4 text-xs font-bold"
                    >
                      Show All Products
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 pb-8">
                  {filteredProducts.map((product) => (
                    <ProductCardItem
                      key={product.product_id}
                      product={product}
                      onSelect={handleSelect}
                    />
                  ))}
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
                <Badge variant="secondary" className="ml-auto font-mono text-[10px] bg-primary/10 text-primary border-none">
                  {selectedProducts.length}
                </Badge>
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
                  selectedProducts.map((p) => (
                    <CartItemRow
                      key={p.product_id}
                      item={p}
                      onUpdateQty={onUpdateQty}
                      onRemoveItem={onRemoveItem}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {selectedProducts.length > 0 && (
              <div className="p-4 border-t border-border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">
                    Estimated Total
                  </span>
                  <span className="text-sm font-black text-primary font-mono tracking-tighter">
                    ₱{estimatedTotal.toLocaleString()}
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
