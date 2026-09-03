import { stockConversionRepo, DIRECTUS_API, DIRECTUS_TOKEN } from "./stock-conversion.repo";
import { normalizeProductName, generateConversionDocNo } from "./stock-conversion.helpers";
import type { StockConversionProduct, StockConversionPayload } from "../types/stock-conversion.types";
import { AppError } from "../utils/error-handler";
import { allocateStock } from "@/modules/manufacturing-management/shared/services/stock-allocation.engine";
import { getPhDbTimestamp } from "../utils/date-utils";

interface DirectusProduct {
  id?: string | number;
  product_id: string | number;
  product_name: string;
  parent_id?: string | number | null;
  unit_of_measurement?: string | number | { unit_id: string | number } | null;
  unit_of_measurement_count?: string | number | null;
  unit_count?: string | number | null;
  product_code?: string | null;
  cost_per_unit?: string | number | null;
  price_per_unit?: string | number | null;
  product_brand?: string | number | { brand_id: string | number } | null;
  product_category?: string | number | { category_id: string | number } | null;
  description?: string | null;
  product_per_supplier?: Array<{ supplier_id?: number | { id?: number; supplier_id?: number; supplier_name?: string; supplier_shortcut?: string } }>;
  product_supplier?: number | { id?: number; supplier_id?: number; supplier_name?: string; supplier_shortcut?: string };
}

interface DirectusLookup {
  brand_id?: number;
  brand_name?: string;
  category_id?: number;
  category_name?: string;
  unit_id?: number;
  unit_name?: string;
  id?: number;
  supplier_name?: string;
  supplier_shortcut?: string;
  product_id?: number;
  supplier_id?: number;
}

export const stockConversionService = {
  async getStockList(limit: number, offset: number, branchId?: number, hasStock?: boolean, extraFilters?: Record<string, string>, token?: string) {
    let preFetchedInventory: Record<number, number> | null = null;
    const t0 = Date.now();

    // 1. Resolve filter IDs first to avoid relational Forbidden joins
    const allOptions = await stockConversionRepo.fetchFilterOptions();
    console.log(`[Perf] Step 1 - fetchFilterOptions: ${Date.now() - t0}ms`);

    // Do not show data on load if either branch or supplier is not selected
    if (!branchId || !extraFilters?.supplierShortcut) {
      return { data: [], totalCount: 0, options: allOptions };
    }

    const andClauses: Record<string, unknown>[] = [];

    let filterProductIds: number[] | null = null;

    if (extraFilters && typeof extraFilters === 'object') {
      const f = extraFilters as Record<string, string>;
      if (f.productBrand) {
        const found = allOptions.brands.find((b: { id: number; name: string }) => b.name === f.productBrand);
        if (found?.id) andClauses.push({ product_brand: { _eq: found.id } });
      }
      if (f.productCategory) {
        const found = allOptions.categories.find((c: { id: number; name: string }) => c.name === f.productCategory);
        if (found?.id) andClauses.push({ product_category: { _eq: found.id } });
      }
      if (f.unitName) {
        const found = allOptions.units.find((u: { id: number; name: string }) => u.name === f.unitName);
        if (found?.id) andClauses.push({ unit_of_measurement: { _eq: found.id } });
      }
      if (f.search && f.search.trim()) {
        const s = f.search.trim();
        andClauses.push({
          _or: [
            { product_name: { _icontains: s } },
            { product_code: { _icontains: s } },
            { description: { _icontains: s } },
            { barcode: { _icontains: s } },
          ],
        });
      }
      if (f.supplierShortcut) {
        const res = await fetch(`${DIRECTUS_API}/items/product_per_supplier?filter[supplier_id][supplier_shortcut][_eq]=${encodeURIComponent(f.supplierShortcut)}&fields=product_id&limit=-1`, {
          headers: { "Authorization": `Bearer ${DIRECTUS_TOKEN}` }
        });
        if (res.ok) {
          const json = await res.json();
          const pIds = (json.data || []).map((d: Record<string, unknown>) => {
            if (typeof d.product_id === 'object' && d.product_id !== null) {
              const obj = d.product_id as Record<string, unknown>;
              return Number(obj.product_id || obj.id || 0);
            }
            return Number(d.product_id || 0);
          }).filter((id: number) => !isNaN(id) && id > 0);

          if (pIds.length > 0) {
            filterProductIds = pIds;
          } else {
            return { data: [], totalCount: 0, options: allOptions };
          }
        }
      }
    }

    // 2. Optimization: Handle 'Convertible Only' via branch-wide fetch
    if (hasStock && branchId) {
      try {
        const inv = await stockConversionRepo.fetchInventory(token, branchId);
        preFetchedInventory = inv;
        
        const stockProductIds = Object.entries(inv)
          .filter(([, qty]) => (qty as unknown as number) > 0)
          .map(([id]) => Number(id));

        console.log(`[StockConversionService] Convertible only: found ${stockProductIds.length} items with stock in branch ${branchId}`);

        if (stockProductIds.length > 0) {
          const stockSet = new Set(stockProductIds);
          // INTERSECT: Only keep IDs that match BOTH filters (Supplier AND Stock)
          if (filterProductIds !== null) {
            filterProductIds = filterProductIds.filter(id => stockSet.has(id));
          } else {
            filterProductIds = stockProductIds;
          }

          if (filterProductIds.length === 0) {
            console.log(`[StockConversionService] No matching products after intersecting supplier and stock filters`);
            return { data: [], totalCount: 0, options: allOptions };
          }
        } else {
          console.log(`[StockConversionService] No products with stock found for branch ${branchId}`);
          return { data: [], totalCount: 0, options: allOptions };
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        const errCode = (err as { code?: string }).code;
        console.warn("[Service] Inventory optimization failed:", errMsg);
        if (errCode === "AUTH_ERROR") {
          return { data: [], totalCount: 0, options: allOptions, authError: true };
        }
      }
    }

    // Finalize ID filter
    if (filterProductIds !== null && filterProductIds.length > 0) {
      // Chunk to prevent massive URLs (capped at ~500 IDs)
      const chunkedIds = filterProductIds.slice(0, 500);
      andClauses.push({
        product_id: { _in: chunkedIds }
      });
    }

    let filterString = "";
    if (andClauses.length === 1) {
      filterString = `filter=${encodeURIComponent(JSON.stringify(andClauses[0]))}`;
    } else if (andClauses.length > 1) {
      filterString = `filter=${encodeURIComponent(JSON.stringify({ _and: andClauses }))}`;
    }

    const t2 = Date.now();
    const fetchLimit = hasStock ? -1 : limit;
    const fetchOffset = hasStock ? 0 : offset;
    const prodJson = await stockConversionRepo.fetchProducts(fetchLimit, fetchOffset, filterString);
    const products = prodJson.data || [];
    const totalCount = prodJson.meta?.filter_count || 0;
    console.log(`[Perf] Step 2 - fetchProducts: ${Date.now() - t2}ms (${products.length} products)`);

    if (products.length === 0) return { data: [], totalCount: 0, options: allOptions };

    // 4. Parallel Enrichment Fetching (only fetch what we DON'T already have)
    // allOptions already has brands, categories, units, suppliers — reuse those!
    const t4 = Date.now();
    const [invRes] = await Promise.all([
      (async () => {
        if (preFetchedInventory) return preFetchedInventory;
        if (!branchId) return {};
        try {
          return await stockConversionRepo.fetchInventory(token, branchId);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Parallel inventory fetch failed";
          console.warn("[Service] Parallel inventory fetch failed:", message);
          return {}; 
        }
      })()
    ]);
    console.log(`[Perf] Step 4 - inventory: ${Date.now() - t4}ms`);

    // 4.5 Group Enrichment: Fetch all siblings in the same family to ensure unit conversion is possible
    const currentProductIds = products.map((p: DirectusProduct) => Number(p.product_id));
    const currentParentIds = products.map((p: DirectusProduct) => p.parent_id).filter(Boolean).map(Number) as (number | string)[];
    
    // Optimization: Only fetch parents/siblings for items that actually have a parent or are likely to be a parent
    const allPotentialParentIds = [...new Set([...currentParentIds, ...currentProductIds])].filter(id => id !== 0) as (number | string)[];
    const productNamesToFetch = [...new Set(products.map((p: DirectusProduct) => String(p.product_name)))].filter(name => name && name !== "undefined") as (string)[];

    const t5 = Date.now();
    const [familyByParent, familyBySelf, familyByName] = await Promise.all([
      stockConversionRepo.fetchItemsInChunks<DirectusProduct>("products", "parent_id", allPotentialParentIds, "product_id,product_name,description,parent_id,unit_of_measurement,unit_of_measurement_count,product_code,cost_per_unit,price_per_unit,product_per_supplier.supplier_id.id,product_per_supplier.supplier_id.supplier_name,product_per_supplier.supplier_id.supplier_shortcut"),
      stockConversionRepo.fetchItemsInChunks<DirectusProduct>("products", "product_id", currentParentIds as (number | string)[], "product_id,product_name,description,parent_id,unit_of_measurement,unit_of_measurement_count,product_code,cost_per_unit,price_per_unit,product_per_supplier.supplier_id.id,product_per_supplier.supplier_id.supplier_name,product_per_supplier.supplier_id.supplier_shortcut"),
      stockConversionRepo.fetchItemsInChunks<DirectusProduct>("products", "product_name", productNamesToFetch, "product_id,product_name,description,parent_id,unit_of_measurement,unit_of_measurement_count,product_code,cost_per_unit,price_per_unit,product_per_supplier.supplier_id.id,product_per_supplier.supplier_id.supplier_name,product_per_supplier.supplier_id.supplier_shortcut")
    ]);
    console.log(`[Perf] Step 4.5 - familyEnrichment: ${Date.now() - t5}ms`);
    console.log(`[Perf] TOTAL so far: ${Date.now() - t0}ms`);

    const familyProducts = [...products, ...familyByParent, ...familyBySelf, ...familyByName];
    const uniqueFamilyProducts = Array.from(new Map(familyProducts.map(p => [Number(p.product_id), p])).values());

    const inventory = invRes;

    // Resolve supplier mappings for ALL family members to ensure they show up in the table
    const allFamilyProductIds = uniqueFamilyProducts.map(p => Number(p.product_id));
    const supplierMappings = await stockConversionRepo.fetchItemsInChunks<DirectusLookup>(
      "product_per_supplier", 
      "product_id", 
      allFamilyProductIds, 
      "product_id,supplier_id.id,supplier_id.supplier_name,supplier_id.supplier_shortcut"
    );

    // 5. Build Lookup Maps (reuse allOptions instead of re-fetching)
    const unitMap = new Map<number, string>(allOptions.units.map((u: { id: number; name: string }) => [u.id, u.name]));
    const brandMap = new Map<number, string>(allOptions.brands.map((b: { id: number; name: string }) => [b.id, b.name]));
    const catMap = new Map<number, string>(allOptions.categories.map((c: { id: number; name: string }) => [c.id, c.name]));
    
    // Resolve supplier names from allOptions (no extra API call needed)
    const supplierNameMap = new Map<number, { name: string; shortcut: string }>(
      allOptions.suppliers.map((s: { id: number; name: string; shortcut: string }) => [s.id, { name: s.name, shortcut: s.shortcut }])
    );

    const productSupplierMap = new Map<number, number[]>();
    supplierMappings.forEach((m: DirectusLookup) => {
      // Handle potential relational objects for product_id and supplier_id
      const pId = typeof m.product_id === 'object' ? Number((m.product_id as Record<string, unknown>)?.id || (m.product_id as Record<string, unknown>)?.product_id || 0) : Number(m.product_id);
      const sId = typeof m.supplier_id === 'object' ? Number((m.supplier_id as Record<string, unknown>)?.id || (m.supplier_id as Record<string, unknown>)?.supplier_id || 0) : Number(m.supplier_id);
      
      if (!isNaN(pId) && !isNaN(sId)) {
        if (!productSupplierMap.has(pId)) productSupplierMap.set(pId, []);
        productSupplierMap.get(pId)!.push(sId);
      }
    });

    // 6. Grouping and Mapping (Using full family data)
    const parentIds = new Set(uniqueFamilyProducts.map((p: DirectusProduct) => p.parent_id).filter(Boolean).map(Number));
    const productGroups = new Map<string, DirectusProduct[]>();
    
    uniqueFamilyProducts.forEach((p: DirectusProduct) => {
      const pId = Number(p.product_id);
      const parentId = p.parent_id ? Number(p.parent_id) : undefined;
      const normalizedName = normalizeProductName(p.product_name);
      
      // Grouping logic:
      // 1. If it has a parent, group by Parent ID
      // 2. If it is a parent itself, group by its own ID
      // 3. If it has a name, group by Name
      // 4. Fallback: unique group by ID (prevents nameless items from merging)
      const groupKey = parentId ? `ID-${parentId}` : 
                      (parentIds.has(pId) ? `ID-${pId}` : 
                      (normalizedName ? `NAME-${normalizedName}` : `ID-${pId}`));
                      
      if (!productGroups.has(groupKey)) productGroups.set(groupKey, []);
      productGroups.get(groupKey)!.push(p);
    });

    const result: StockConversionProduct[] = products.map((p: DirectusProduct) => {
      const pId = Number(p.product_id || p.id);
      const parentId = p.parent_id ? Number(p.parent_id) : undefined;
      const normalizedName = normalizeProductName(p.product_name);
      
      const groupKey = parentId ? `ID-${parentId}` : (parentIds.has(pId) ? `ID-${pId}` : `NAME-${normalizedName}`);
      const group = productGroups.get(groupKey) || [p];

      const brandId = Number(typeof p.product_brand === 'object' ? (p.product_brand as DirectusLookup)?.brand_id : p.product_brand);
      const categoryId = Number(typeof p.product_category === 'object' ? (p.product_category as DirectusLookup)?.category_id : p.product_category);
      const unitId = Number(typeof p.unit_of_measurement === 'object' ? (p.unit_of_measurement as DirectusLookup)?.unit_id : p.unit_of_measurement);

      const availableUnitsMap = new Map<number, { unitId: number; name: string; conversionFactor: number; targetProductId: number }>();
      group
        .filter((v: DirectusProduct) => Number(typeof v.unit_of_measurement === 'object' ? (v.unit_of_measurement as DirectusLookup)?.unit_id : v.unit_of_measurement) !== unitId)
        .forEach((v: DirectusProduct) => {
          const vUnitId = Number(typeof v.unit_of_measurement === 'object' ? (v.unit_of_measurement as DirectusLookup)?.unit_id : v.unit_of_measurement);
          const dbFactor = Number(v.unit_of_measurement_count) || 1;
          const targetUnitName = unitMap.get(vUnitId) || "Unknown";
          if (!availableUnitsMap.has(vUnitId)) {
            availableUnitsMap.set(vUnitId, {
              unitId: vUnitId,
              name: targetUnitName,
              conversionFactor: (targetUnitName.toLowerCase().includes("piece") || targetUnitName.toLowerCase() === "pcs") ? 1 : dbFactor,
              targetProductId: Number(v.product_id)
            });
          }
        });
      const availableUnits = Array.from(availableUnitsMap.values());

      // Supplier Logic
      let finalSupplierName = "No Supplier";
      let finalSupplierShortcut = "";

      const findInMap = (id: number) => {
        const ids = productSupplierMap.get(id) || [];
        return ids.map(sid => supplierNameMap.get(sid)).find(Boolean);
      };

      const findInExpanded = (prod: DirectusProduct) => {
        const expanded = Array.isArray(prod.product_per_supplier) ? prod.product_per_supplier : [];
        if (expanded.length > 0) {
          const firstSup = expanded[0]?.supplier_id;
          if (typeof firstSup === 'object' && firstSup !== null) {
            const s = firstSup as Record<string, unknown>;
            const sId = Number(s.id || s.supplier_id || 0);
            return { 
                name: String(s.supplier_name || supplierNameMap.get(sId)?.name || "No Supplier"), 
                shortcut: String(s.supplier_shortcut || supplierNameMap.get(sId)?.shortcut || "") 
            };
          } else if (typeof firstSup === 'number') {
            const mapped = supplierNameMap.get(firstSup);
            return mapped ? { name: mapped.name, shortcut: mapped.shortcut } : null;
          }
        }
        return null;
      };

      const fallbackProduct = parentId ? uniqueFamilyProducts.find(pf => Number(pf.product_id || pf.id) === parentId) : null;
      const supInfo = findInMap(pId) || findInExpanded(p) || (fallbackProduct ? (findInMap(parentId!) || findInExpanded(fallbackProduct)) : null);

      if (supInfo) {
        finalSupplierName = supInfo.name || "No Supplier";
        finalSupplierShortcut = supInfo.shortcut || "";
      }

      const currentUnitName = unitMap.get(unitId) || "Unknown";
      const dbFactor = Number(p.unit_of_measurement_count ?? p.unit_count) || 1;
      const sourceFactor = (currentUnitName.toLowerCase().includes("piece") || currentUnitName.toLowerCase() === "pcs") ? 1 : dbFactor;
      
      const rawQuantity = inventory[pId] || 0;
      const finalQuantity = rawQuantity;


      const isParent = !parentId || parentIds.has(pId);

      return {
        productId: pId,
        parentId: parentId || null,
        isParent,
        supplierName: finalSupplierName,
        supplierShortcut: finalSupplierShortcut,
        brand: brandMap.get(brandId) || "Unknown",
        category: catMap.get(categoryId) || "Unknown",
        productCode: p.product_code || "",
        productName: p.description || p.product_name || "",
        productDescription: p.description || p.product_name || "",
        family: groupKey,
        currentUnit: currentUnitName,
        currentUnitId: unitId,
        quantity: finalQuantity,
        pricePerUnit: Number(p.cost_per_unit || p.price_per_unit || 0),
        totalAmount: Number((finalQuantity * Number(p.cost_per_unit || p.price_per_unit || 0)).toFixed(2)),
        conversionFactor: sourceFactor,
        inventoryLoaded: false,
        availableUnits,
      };
    });

    // 7. Refined 'Convertible Only' filter: Must have stock AND at least one sibling unit to convert into
    let finalResult = result;
    if (hasStock) {
      finalResult = result.filter(p => p.quantity > 0 && (p.availableUnits?.length ?? 0) > 0);
    }

    // 8. Sort by:
    // 1. Product Family (Grouped)
    // 2. Root Parent Product first (isParent === true)
    // 3. Smallest to biggest unit/conversionFactor (TIE > IB > BAG > BOX)
    finalResult.sort((a, b) => {
      const familyCompare = (a.family || "").localeCompare(b.family || "");
      if (familyCompare !== 0) return familyCompare;
      
      // Root parent product ALWAYS comes first in the family
      if (a.isParent && !b.isParent) return -1;
      if (!a.isParent && b.isParent) return 1;

      // Smallest to biggest unit (TIE > IB > BAG > BOX)
      return (a.conversionFactor || 0) - (b.conversionFactor || 0);
    });

    // 9. Manual pagination when hasStock is ON (since we fetched all products above)
    if (hasStock) {
      const finalResultSlice = finalResult.slice(offset, offset + limit);
      console.log(`[Perf] Step 9 - final mapping+sort+slice: ${Date.now() - t0}ms (TOTAL)`);
      return {
        data: finalResultSlice,
        totalCount: finalResult.length,
        options: allOptions
      };
    }

    console.log(`[Perf] Step 9 - final mapping+sort: ${Date.now() - t0}ms (TOTAL)`);

    return { 
      data: finalResult, 
      totalCount: hasStock ? finalResult.length : totalCount, 
      options: allOptions 
    };
  },

  async executeConversion(payload: StockConversionPayload, token?: string) {
    const docNo = generateConversionDocNo();
    const targetProductId = payload.targetProductId || payload.productId;
    const sourceFactor = Number(payload.sourceFactor || 1);
    const targetFactor = Number(payload.targetFactor || 1);
    
    // 1. Validate the conversion math on the backend for integrity
    const totalBaseUnits = Number(payload.quantityToConvert) * sourceFactor;
    const expectedConvertedQty = Math.floor(totalBaseUnits / targetFactor);
    const remainderBaseUnits = totalBaseUnits % targetFactor;

    if (remainderBaseUnits !== 0) {
      const requiredMultiple = targetFactor / sourceFactor;
      throw new Error(`Invalid conversion quantity: Converting ${payload.quantityToConvert} units leaves a remainder of ${remainderBaseUnits / sourceFactor} units. Conversion requires exact multiples of ${requiredMultiple} unit(s).`);
    }

    if (payload.convertedQuantity > expectedConvertedQty) {
      throw new Error(`Invalid conversion: ${payload.quantityToConvert} units of source cannot produce ${payload.convertedQuantity} units of target (Expected max: ${expectedConvertedQty}).`);
    }
    
    if (expectedConvertedQty <= 0) {
      throw new Error(`Insufficient quantity: The source amount is not enough to create at least one unit of the target.`);
    }

    // 2. FETCH LATEST INVENTORY - Final server-side check to prevent over-drawing
    const inventory = await stockConversionRepo.fetchInventory(token, payload.branchId, `product_id=${payload.productId}`);
    const rawStock = inventory[payload.productId] || 0;
    const availableSourceUnits = rawStock;

    if (payload.quantityToConvert > availableSourceUnits) {
      throw new Error(`Insufficient stock: You requested to convert ${payload.quantityToConvert} units, but only ${availableSourceUnits} are available in branch ${payload.branchId}.`);
    }

    // 3. Target Lot Capacity and UOM Validation Safeguards
    if (payload.targetLotId) {
      try {
        const lotRes = await fetch(
          `${DIRECTUS_API}/items/mm_lots/${payload.targetLotId}?fields=lot_id,lot_name,unit_id,max_batch_capacity`,
          { headers: { ...(DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : {}) }, cache: "no-store" }
        ).catch(() => null);
        if (lotRes && lotRes.ok) {
          const lotJson = await lotRes.json();
          const targetLot = lotJson.data;
          if (targetLot) {
            const maxCap = Number(targetLot.max_batch_capacity || 0);
            if (maxCap > 0 && payload.convertedQuantity > maxCap) {
              throw new Error(`Target Lot Capacity Exceeded: Target storage rack "${targetLot.lot_name}" has a max capacity of ${maxCap}, but conversion output is ${payload.convertedQuantity}.`);
            }
          }
        }
      } catch (lotErr) {
        if (lotErr instanceof Error && lotErr.message.includes("Capacity Exceeded")) {
          throw lotErr;
        }
      }
    }

    // Resolve FEFO source batch allocation for batch genealogy
    let sourceBatchDesc = payload.sourceBatchNo || "";
    if (!sourceBatchDesc) {
      try {
        const fefoPlan = await allocateStock({
          productId: payload.productId,
          branchId: payload.branchId,
          requestedQuantity: payload.quantityToConvert,
        });
        if (fefoPlan.allocations.length > 0) {
          sourceBatchDesc = fefoPlan.allocations.map(a => `${a.batch_no} (qty: ${a.allocated_quantity})`).join(", ");
        }
      } catch (err) {
        console.warn("[StockConversion] FEFO allocation lookup warning:", err);
      }
    }

    // Resolve product descriptions for source and target
    let sourceProdDesc = `Product #${payload.productId}`;
    let targetProdDesc = `Product #${targetProductId}`;
    try {
      const prodRes = await fetch(
        `${DIRECTUS_API}/items/products?filter={"product_id":{"_in":[${payload.productId},${targetProductId}]}}&fields=product_id,product_name,description&limit=2`,
        { headers: { ...(DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : {}) }, cache: "no-store" }
      ).catch(() => null);
      if (prodRes && prodRes.ok) {
        const pJson = await prodRes.json();
        const pList: DirectusProduct[] = pJson.data || [];
        const sP = pList.find(p => Number(p.product_id || p.id) === payload.productId);
        const tP = pList.find(p => Number(p.product_id || p.id) === targetProductId);
        if (sP) sourceProdDesc = sP.description || sP.product_name || sourceProdDesc;
        if (tP) targetProdDesc = tP.description || tP.product_name || targetProdDesc;
      }
    } catch (err) {
      console.warn("[StockConversion] Product description lookup error:", err);
    }

    const remarkStr = `Conversion: ${payload.quantityToConvert} source units (${sourceProdDesc}) to ${payload.convertedQuantity} target units (${targetProdDesc})${sourceBatchDesc ? ` [Source FEFO: ${sourceBatchDesc}]` : ''}`;
    const totalAmount = Number((payload.quantityToConvert * payload.pricePerUnit).toFixed(2));

    try {
      // 1. Create a SINGLE header for the entire conversion transaction
      const nowPHT = getPhDbTimestamp();
      const headerRes = await stockConversionRepo.createStockAdjustmentHeader({
        doc_no: docNo, 
        type: "OUT", 
        branch_id: payload.branchId, 
        created_by: payload.userId, 
        updated_by: payload.userId,
        posted_by: payload.userId, 
        amount: totalAmount, 
        remarks: remarkStr,
        isPosted: true,
        postedAt: nowPHT,
        posted_at: nowPHT,
        created_at: nowPHT,
        updated_at: nowPHT,
        date_created: nowPHT,
        date_updated: nowPHT,
      });
      const headerId = headerRes?.data?.id || null;

      // 2. Create the OUT movement(s) (Source Product) with exact batch and lot tracking
      let outId: number | undefined;
      let inId: number | undefined;
      const validAllocations = (payload.sourceAllocations || []).filter(a => (a.allocated_quantity || 0) > 0);

      // Pre-resolve any missing source lot IDs if batch_no is available
      const cleanAllocations = await Promise.all(
        validAllocations.map(async (alloc) => {
          let invLotId = alloc.inventory_lot_id;
          let lotId = alloc.lot_id;
          let mfgDate = alloc.manufacturing_date;
          let expDate = alloc.expiry_date;

          if ((!invLotId || !lotId || !expDate) && alloc.batch_no) {
            try {
              const res = await fetch(
                `${DIRECTUS_API}/items/mm_inventory_lots?filter={"_and":[{"product_id":{"_eq":${payload.productId}}},{"batch_no":{"_eq":"${encodeURIComponent(alloc.batch_no)}"}}]}&limit=1&fields=id,inventory_lot_id,lot_id,manufacturing_date,expiry_date,expiration_date`,
                { headers: { ...(DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : {}) }, cache: "no-store" }
              ).catch(() => null);
              if (res && res.ok) {
                const j = await res.json();
                if (j.data && j.data.length > 0) {
                  const bRow = j.data[0];
                  invLotId = invLotId || Number(bRow.inventory_lot_id || bRow.id);
                  lotId = lotId || (typeof bRow.lot_id === 'object' && bRow.lot_id ? Number(bRow.lot_id.id || bRow.lot_id.lot_id) : Number(bRow.lot_id || 0));
                  mfgDate = mfgDate || bRow.manufacturing_date || null;
                  expDate = expDate || bRow.expiry_date || bRow.expiration_date || null;
                }
              }
            } catch {
              // Ignore lookup failure
            }
          }

          return {
            ...alloc,
            inventory_lot_id: invLotId,
            lot_id: lotId,
            manufacturing_date: mfgDate,
            expiry_date: expDate,
          };
        })
      );

      if (cleanAllocations.length > 0) {
        for (const alloc of cleanAllocations) {
          const outRes = await stockConversionRepo.createStockAdjustment({
            doc_no: docNo, 
            stock_adjustment_id: headerId,
            product_id: payload.productId, 
            branch_id: payload.branchId, 
            type: "OUT", 
            quantity: Number(alloc.allocated_quantity || 0), 
            unit_id: payload.sourceUnitId || 1,
            unit_cost: alloc.unit_cost ?? (payload.pricePerUnit || 0),
            inventory_condition: (alloc.qa_status as 'GOOD' | 'DAMAGED' | 'QUARANTINED' | 'EXPIRED') || "GOOD",
            source_type: "STOCK_CONVERSION",
            inventory_lot_id: alloc.inventory_lot_id ? Number(alloc.inventory_lot_id) : null,
            lot_id: alloc.lot_id ? Number(alloc.lot_id) : null,
            batch_no: alloc.batch_no || null,
            manufacturing_date: alloc.manufacturing_date || null,
            expiry_date: alloc.expiry_date || null,
            created_by: payload.userId, 
            updated_by: payload.userId, 
            created_at: nowPHT,
            updated_at: nowPHT,
            date_created: nowPHT,
            date_updated: nowPHT,
            remarks: remarkStr
          });
          if (!outId) outId = outRes.data?.id;
        }
      } else {
        // Fallback for single batch or non-split allocation
        let srcInvLotId = payload.sourceInventoryLotId;
        let srcLotId = payload.sourceLotId;
        let srcMfgDate = payload.sourceManufacturingDate;
        let srcExpDate = payload.sourceExpiryDate;

        if ((!srcInvLotId || !srcLotId) && payload.sourceBatchNo) {
          try {
            const res = await fetch(
              `${DIRECTUS_API}/items/mm_inventory_lots?filter={"_and":[{"product_id":{"_eq":${payload.productId}}},{"batch_no":{"_eq":"${encodeURIComponent(payload.sourceBatchNo)}"}}]}&limit=1&fields=id,inventory_lot_id,lot_id,manufacturing_date,expiry_date,expiration_date`,
              { headers: { ...(DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : {}) }, cache: "no-store" }
            ).catch(() => null);
            if (res && res.ok) {
              const j = await res.json();
              if (j.data && j.data.length > 0) {
                const bRow = j.data[0];
                srcInvLotId = srcInvLotId || Number(bRow.inventory_lot_id || bRow.id);
                srcLotId = srcLotId || (typeof bRow.lot_id === 'object' && bRow.lot_id ? Number(bRow.lot_id.id || bRow.lot_id.lot_id) : Number(bRow.lot_id || 0));
                srcMfgDate = srcMfgDate || bRow.manufacturing_date || null;
                srcExpDate = srcExpDate || bRow.expiry_date || bRow.expiration_date || null;
              }
            }
          } catch {
            // Ignore lookup failure
          }
        }

        const outRes = await stockConversionRepo.createStockAdjustment({
          doc_no: docNo, 
          stock_adjustment_id: headerId,
          product_id: payload.productId, 
          branch_id: payload.branchId, 
          type: "OUT", 
          quantity: payload.quantityToConvert, 
          unit_id: payload.sourceUnitId || 1,
          unit_cost: payload.pricePerUnit || 0,
          inventory_condition: "GOOD",
          source_type: "STOCK_CONVERSION",
          inventory_lot_id: srcInvLotId ? Number(srcInvLotId) : null,
          lot_id: srcLotId ? Number(srcLotId) : null,
          batch_no: payload.sourceBatchNo || null,
          manufacturing_date: srcMfgDate || null,
          expiry_date: srcExpDate || null,
          created_by: payload.userId, 
          updated_by: payload.userId, 
          created_at: nowPHT,
          updated_at: nowPHT,
          date_created: nowPHT,
          date_updated: nowPHT,
          remarks: remarkStr
        });
        outId = outRes.data?.id;
      }

      // 3. Process Target Batches and IN Adjustments (Multi-Lot & Multi-Batch Support)
      const inRatio = (payload.convertedQuantity && payload.quantityToConvert) ? (payload.convertedQuantity / payload.quantityToConvert) : 1;
      const targetUnitCost = inRatio > 0 ? (payload.pricePerUnit / inRatio) : payload.pricePerUnit;

      const targetBatchesToCreate: Array<{
        lotId: number;
        batchNo: string;
        quantity: number;
        manufacturingDate: string | null;
        expiryDate: string | null;
        qaStatus: string;
        unitCost: number;
      }> = [];

      if (payload.targetAllocations && payload.targetAllocations.length > 0) {
        payload.targetAllocations.forEach((g) => {
          (g.batches || []).forEach((b) => {
            if (Number(b.quantity || 0) > 0 && b.batch_no && String(b.batch_no).trim()) {
              targetBatchesToCreate.push({
                lotId: Number(g.lot_id),
                batchNo: String(b.batch_no).trim(),
                quantity: Number(b.quantity || 0),
                manufacturingDate: b.manufacturing_date || payload.targetManufacturingDate || null,
                expiryDate: b.expiry_date || payload.targetExpiryDate || null,
                qaStatus: b.qa_status || payload.targetQaStatus || "GOOD",
                unitCost: Number(b.unit_cost ?? targetUnitCost),
              });
            }
          });
        });
      } else if (payload.targetLotId && payload.targetBatchNo && payload.targetBatchNo.trim()) {
        targetBatchesToCreate.push({
          lotId: Number(payload.targetLotId),
          batchNo: String(payload.targetBatchNo).trim(),
          quantity: Number(payload.convertedQuantity || 0),
          manufacturingDate: payload.targetManufacturingDate || null,
          expiryDate: payload.targetExpiryDate || null,
          qaStatus: payload.targetQaStatus || "GOOD",
          unitCost: targetUnitCost,
        });
      }

      const headers = {
        "Content-Type": "application/json",
        ...(DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : {}),
      };

      for (const tBatch of targetBatchesToCreate) {
        let targetInventoryLotId: number | null = null;
        try {
          // Check if batch already exists in this lot
          const checkRes = await fetch(
            `${DIRECTUS_API}/items/mm_inventory_lots?filter={"_and":[{"lot_id":{"_eq":${tBatch.lotId}}},{"product_id":{"_eq":${targetProductId}}},{"batch_no":{"_eq":"${encodeURIComponent(tBatch.batchNo)}"}}],"_or":[{"branch_id":{"_eq":${payload.branchId}}},{"branch_id":{"_null":true}}]}&limit=1&fields=id,inventory_lot_id`,
            { headers, cache: "no-store" }
          ).catch(() => null);

          if (checkRes && checkRes.ok) {
            const checkJson = await checkRes.json();
            if (checkJson.data && checkJson.data.length > 0) {
              const found = checkJson.data[0];
              targetInventoryLotId = Number(found.inventory_lot_id || found.id);
            }
          }

          if (!targetInventoryLotId) {
            const batchPayload = {
              lot_id: tBatch.lotId,
              branch_id: payload.branchId,
              product_id: targetProductId,
              batch_no: tBatch.batchNo,
              manufacturing_date: tBatch.manufacturingDate,
              expiry_date: tBatch.expiryDate,
              expiration_date: tBatch.expiryDate,
              unit_cost: Number(tBatch.unitCost || 0),
              initial_quantity: Number(tBatch.quantity || 0),
              current_quantity: Number(tBatch.quantity || 0),
              available_quantity: Number(tBatch.quantity || 0),
              qa_status: tBatch.qaStatus || "GOOD",
              status: "ACTIVE",
              source_type: "STOCK_CONVERSION",
              source_reference: docNo,
              remarks: `Converted from ${sourceProdDesc} (${sourceBatchDesc || payload.sourceBatchNo || "Batch N/A"})`,
              created_by: payload.userId || null,
              updated_by: payload.userId || null,
              created_at: nowPHT,
              updated_at: nowPHT,
              date_created: nowPHT,
              date_updated: nowPHT,
            };

            let createRes = await fetch(`${DIRECTUS_API}/items/mm_inventory_lots`, {
              method: "POST",
              headers,
              body: JSON.stringify(batchPayload),
            }).catch(() => null);

            if (!createRes || !createRes.ok) {
              createRes = await fetch(`${DIRECTUS_API}/items/inventory_lots`, {
                method: "POST",
                headers,
                body: JSON.stringify(batchPayload),
              }).catch(() => null);
            }

            if (createRes && createRes.ok) {
              const createJson = await createRes.json();
              const createdId = createJson.data?.inventory_lot_id || createJson.data?.id;
              targetInventoryLotId = Number(createdId);
              console.log(`[StockConversion] Created new target inventory lot: ${tBatch.batchNo} (ID: ${createdId})`);
            } else {
              console.warn(`[StockConversion] Failed to create target inventory lot:`, await createRes?.text());
            }
          }
        } catch (err) {
          console.error("[StockConversion] Error syncing target batch:", err);
        }

        // 4. Create the IN movement for this batch
        const inRes = await stockConversionRepo.createStockAdjustment({
          doc_no: docNo, 
          stock_adjustment_id: headerId,
          product_id: targetProductId, 
          branch_id: payload.branchId, 
          type: "IN", 
          quantity: tBatch.quantity, 
          unit_id: payload.targetUnitId || 1,
          unit_cost: tBatch.unitCost,
          inventory_condition: (tBatch.qaStatus as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || "GOOD",
          source_type: "STOCK_CONVERSION",
          lot_id: tBatch.lotId,
          batch_no: tBatch.batchNo,
          inventory_lot_id: targetInventoryLotId || null,
          manufacturing_date: tBatch.manufacturingDate,
          expiry_date: tBatch.expiryDate,
          created_by: payload.userId, 
          updated_by: payload.userId, 
          created_at: nowPHT,
          updated_at: nowPHT,
          date_created: nowPHT,
          date_updated: nowPHT,
          remarks: remarkStr
        });
        if (!inId) inId = inRes?.data?.id;
      }

      // Handle RFIDs for Traceability - Ensure no duplicates and absolute uniqueness
      const rfidEntries: { rfid_tag: string; stock_adjustment_id: number; created_by: number }[] = [];
      const seenEntries = new Set<string>();
      
      const sourceTags = payload.sourceRfidTags || [];
      const targetTags = payload.rfidTags?.map(t => t.rfid_tag) || [];

      // CROSS-CHECK: Ensure a source tag is not being reused as a target tag in the same transaction
      const overlap = sourceTags.find(tag => targetTags.includes(tag));
      if (overlap) {
        throw new Error(`RFID ${overlap} cannot be used as both source and target in the same transaction.`);
      }

      const addRfidEntry = (tag: string, adjId: number) => {
        const key = `${tag}-${adjId}`;
        if (!seenEntries.has(key)) {
          rfidEntries.push({ 
            rfid_tag: tag, 
            stock_adjustment_id: adjId,
            created_by: payload.userId || 0
          });
          seenEntries.add(key);
        }
      };

      if (sourceTags.length && outId) {
        // 1. Mark existing tags as inactive globally
        await stockConversionRepo.updateRfidStatus(sourceTags, "inactive");
        
        // 2. Link them to the OUT adjustment for the audit trail
        sourceTags.forEach(tag => addRfidEntry(tag, outId));
      }

      if (targetTags.length && inId) {
        // 3. Link new tags to the IN adjustment for the audit trail
        targetTags.forEach(tag => addRfidEntry(tag, inId));
      }

      if (rfidEntries.length > 0) {
        await stockConversionRepo.insertStockAdjustmentRfids(rfidEntries);
      }

      return { success: true, docNo };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error during conversion";
      throw new AppError("CONVERT_ERROR", `Conversion failed: ${message}`, 500);
    }
  }
};
