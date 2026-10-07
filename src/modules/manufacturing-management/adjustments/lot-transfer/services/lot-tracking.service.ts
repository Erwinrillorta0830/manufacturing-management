import { toast } from "sonner";
import type { BranchOption, LotTransferLookupDictionaries } from "../types";

export interface MMLot {
  lot_id: number;
  lot_name: string;
  branch_id: number;
  unit_id: number | null;
  unit_name?: string;
  max_batch_capacity: number;
  status: "ACTIVE" | "CLOSED" | "INACTIVE";
}

export interface MMProduct {
  productId: number;
  productName: string;
  productCode?: string;
  description?: string;
  skuCode?: string;
  uomId?: number | null;
  uomName?: string;
  productTypeId?: number | null;
  productTypeName?: string;
  productCategoryName?: string;
  unitCost?: number;
}

export interface MMBatchOnhand {
  branchId: number;
  inventoryLotId?: number | null;
  mmLotId?: number;
  productId: number;
  unitId?: number;
  batchNo: string;
  manufacturingDate?: string | null;
  expirationDate?: string | null;
  inventoryCondition: string;
  totalQuantityIn: number;
  totalQuantityOut: number;
  onhandQuantity: number;
  lotName?: string;
  productName?: string;
  unitName?: string;
}

export interface MMInventoryLot {
  inventory_lot_id: number;
  lot_id: number;
  branch_id: number;
  product_id: number;
  batch_no: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  unit_cost?: number;
  qa_status: string;
  status: string;
  available_quantity?: number;
  product_name?: string;
  product_code?: string;
  lot_name?: string;
  unit_name?: string;
  created_at?: string | null;
  product_type_id?: number | null;
  product_type_name?: string;
  product_category_name?: string;
  product_description?: string;
  classification_code?: string;
}

async function handleApiError(res: Response, fallback: string) {
  let detail = "";
  try {
    const json = await res.json();
    detail = json.error || json.message || "";
  } catch {
    detail = await res.text().catch(() => "");
  }

  const message = detail || `${fallback} (HTTP ${res.status})`;
  toast.error(message, {
    action: {
      label: "Dismiss",
      onClick: () => {},
    },
  });
  return message;
}

let cachedLookups: LotTransferLookupDictionaries | null = null;
let lastLookupFetch = 0;
const LOOKUP_CACHE_TTL = 30000;

export async function fetchNameLookups(forceRefresh = false): Promise<LotTransferLookupDictionaries> {
  const now = Date.now();
  if (!forceRefresh && cachedLookups && now - lastLookupFetch < LOOKUP_CACHE_TTL) {
    return cachedLookups;
  }
  try {
    const res = await fetch("/api/manufacturing/inventory-warehousing/adjustments/lot-transfer/lookups", {
      cache: "no-store",
    });
    if (!res.ok) {
      await handleApiError(res, "Failed to load master lookup data");
      return (
        cachedLookups || {
          lots: [],
          branches: [],
          units: [],
          users: [],
          products: [],
          maps: {
            lotNames: {},
            branchNames: {},
            unitNames: {},
            userNames: {},
            productNames: {},
          },
        }
      );
    }
    const data = await res.json();
    cachedLookups = data;
    lastLookupFetch = now;
    return data;
  } catch (err) {
    console.error("[LotTracking] Error fetching name lookups:", err);
    toast.error("Failed to connect to name lookup service.");
    return (
      cachedLookups || {
        lots: [],
        branches: [],
        units: [],
        users: [],
        products: [],
        maps: {
          lotNames: {},
          branchNames: {},
          unitNames: {},
          userNames: {},
          productNames: {},
        },
      }
    );
  }
}

export async function fetchLotsByBranch(branchId?: number): Promise<MMLot[]> {
  try {
    const qs = branchId ? `?branch_id=${branchId}&include_all=true` : "?include_all=true";
    const res = await fetch(`/api/manufacturing/inventory-warehousing/adjustments/adjustment-shared/lots${qs}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      await handleApiError(res, "Failed to load lots");
      return [];
    }
    const data = await res.json();
    const rows: Record<string, unknown>[] = Array.isArray(data) ? data : data?.data || [];
    return rows
      .map((r) => {
        const lotId = Number(r.lotId ?? r.lot_id ?? r.id ?? 0);
        const rawName = r.lotName ?? r.lot_name ?? r.name;
        const lotName = rawName ? String(rawName).trim() : (lotId > 0 ? `Lot #${lotId}` : "-");

        const rawBranch = r.branchId ?? r.branch_id;
        const bId =
          typeof rawBranch === "object" && rawBranch !== null
            ? Number((rawBranch as { id?: number; branch_id?: number }).id || (rawBranch as { id?: number; branch_id?: number }).branch_id || branchId || 0)
            : Number(rawBranch || branchId || 0);

        const rawUom = r.uomId ?? r.unitId ?? r.uom_id ?? r.unit_id;
        let unitId: number | null = null;
        let unitName: string | undefined = undefined;
        if (rawUom && typeof rawUom === "object") {
          const uObj = rawUom as { id?: number; unit_id?: number; unit_name?: string };
          unitId = uObj.unit_id ?? uObj.id ?? null;
          unitName = uObj.unit_name;
        } else if (rawUom !== null && rawUom !== undefined && rawUom !== "") {
          const parsed = Number(rawUom);
          if (!isNaN(parsed) && parsed > 0) unitId = parsed;
        }
        if (!unitName) {
          unitName = (r.uomName || r.unitName || r.uom_name || r.unit_name) as string | undefined;
        }

        const maxCapacity = Number(r.maxBatchCapacity ?? r.max_batch_capacity ?? 10);
        const status = ((r.status as string) || "ACTIVE").toUpperCase() as "ACTIVE" | "CLOSED" | "INACTIVE";

        return {
          lot_id: lotId,
          lot_name: lotName,
          branch_id: bId,
          unit_id: unitId,
          unit_name: unitName,
          max_batch_capacity: maxCapacity,
          status: status === "ACTIVE" || status === "CLOSED" || status === "INACTIVE" ? status : "ACTIVE",
        };
      })
      .filter((l) => l.lot_id > 0);
  } catch (err) {
    console.error("[LotTracking] Error fetching lots:", err);
    toast.error("Failed to connect to lots service.");
    return [];
  }
}

export async function fetchProducts(): Promise<MMProduct[]> {
  try {
    const res = await fetch("/api/manufacturing/inventory-warehousing/adjustments/adjustment-shared/lots/products", {
      cache: "no-store",
    });
    if (!res.ok) {
      await handleApiError(res, "Failed to load products");
      return [];
    }
    const data = await res.json();
    return (Array.isArray(data) ? data : data?.data || [])
      .map((r: Record<string, unknown>) => {
        const pId = Number(r.productId ?? r.product_id ?? r.id ?? 0);
        const rawName = r.productName ?? r.product_name ?? r.description ?? r.name ?? r.title;
        const prodName = rawName ? String(rawName).trim() : (pId > 0 ? `Product #${pId}` : "-");
        const pCode = (r.productCode ?? r.skuCode ?? r.product_code ?? r.sku_code ?? r.code) as string | undefined;
        const sCode = (r.skuCode ?? r.sku_code ?? r.productCode ?? r.product_code) as string | undefined;
        const pDesc = (r.description ?? r.product_description) as string | undefined;

        const rawUom = r.uomName ?? r.uom_name ?? r.unitName ?? r.unit_name;
        const uomId = r.uomId ?? r.uom_id ?? r.unitId ?? r.unit_id ? Number(r.uomId ?? r.uom_id ?? r.unitId ?? r.unit_id) : null;
        const uomName = rawUom ? String(rawUom).trim() : undefined;

        const ptId = r.productTypeId ?? r.product_type_id ? Number(r.productTypeId ?? r.product_type_id) : null;
        const ptName = (r.productTypeName ?? r.product_type_name) as string | undefined;
        const catName = (r.productCategoryName ?? r.category_name) as string | undefined;
        const unitCost = Number(r.unitCost ?? r.cost_per_unit ?? r.price_per_unit ?? 0);

        return {
          productId: pId,
          productName: prodName,
          productCode: pCode,
          description: pDesc ? String(pDesc).trim() : undefined,
          skuCode: sCode,
          uomId,
          uomName,
          productTypeId: ptId,
          productTypeName: ptName,
          productCategoryName: catName,
          unitCost,
        };
      })
      .filter((p: MMProduct) => p.productId > 0);
  } catch (err) {
    console.error("[LotTracking] Error fetching products:", err);
    toast.error("Failed to connect to product master service.");
    return [];
  }
}

export async function fetchBatchOnhand(params: {
  branchId?: number;
  productId?: number;
  lotId?: number;
  batchNo?: string;
}): Promise<MMBatchOnhand[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params.branchId) searchParams.set("branch", String(params.branchId));
    if (params.productId) searchParams.set("product", String(params.productId));
    if (params.lotId) searchParams.set("mmLot", String(params.lotId));
    if (params.batchNo) searchParams.set("batchNo", params.batchNo);

    const qs = searchParams.toString();
    const [res, lookups] = await Promise.all([
      fetch(`/api/manufacturing/inventory-warehousing/adjustments/adjustment-shared/batch-onhand${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      }),
      fetchNameLookups(),
    ]);

    if (!res.ok) {
      await handleApiError(res, "Failed to load live on-hand batches");
      return [];
    }
    const rawData = await res.json();
    const list: Record<string, unknown>[] = Array.isArray(rawData) ? rawData : rawData?.data || [];

    return list
      .filter((b) => Number(b.onhandQuantity ?? b.onhand_quantity ?? 0) > 0)
      .map((b) => {
        const bLotId = Number(b.mmLotId || b.mm_lot_id || b.lotId || b.lot_id || 0);
        const bBranchId = Number(b.branchId || b.branch_id || params.branchId || 0);
        const bUnitId = Number(b.unitId || b.unit_id || 0);
        const bProdId = Number(b.productId || b.product_id || params.productId || 0);

        const resolvedLotName = (b.lotName || b.lot_name || lookups.maps.lotNames[String(bLotId)] || "-") as string;
        const resolvedUnitName = (b.unitName || b.unit_name || lookups.maps.unitNames[String(bUnitId)] || "-") as string;
        const resolvedProdName = (b.productName || b.product_name || lookups.maps.productNames[String(bProdId)] || "-") as string;

        return {
          branchId: bBranchId,
          inventoryLotId: b.inventoryLotId ? Number(b.inventoryLotId) : b.inventory_lot_id ? Number(b.inventory_lot_id) : null,
          mmLotId: bLotId,
          productId: bProdId,
          unitId: bUnitId || undefined,
          batchNo: String(b.batchNo || b.batch_no || ""),
          manufacturingDate: (b.manufacturingDate || b.manufacturing_date || null) as string | null,
          expirationDate: (b.expirationDate || b.expiration_date || null) as string | null,
          inventoryCondition: String(b.inventoryCondition || b.inventory_condition || "GOOD"),
          totalQuantityIn: Number(b.totalQuantityIn ?? b.total_quantity_in ?? 0),
          totalQuantityOut: Number(b.totalQuantityOut ?? b.total_quantity_out ?? 0),
          onhandQuantity: Number(b.onhandQuantity ?? b.onhand_quantity ?? 0),
          lotName: resolvedLotName,
          productName: resolvedProdName,
          unitName: resolvedUnitName,
        };
      });
  } catch (err) {
    console.error("[LotTracking] Error fetching batch onhand:", err);
    toast.error("Failed to connect to live batch inventory service.");
    return [];
  }
}

export async function fetchInventoryLots(params: {
  branchId?: number;
  productId?: number;
  lotId?: number;
}): Promise<MMInventoryLot[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params.branchId) searchParams.set("branch_id", String(params.branchId));
    if (params.productId) searchParams.set("product_id", String(params.productId));
    if (params.lotId) searchParams.set("lot_id", String(params.lotId));

    const qs = searchParams.toString();
    const res = await fetch(`/api/manufacturing/inventory-warehousing/adjustments/adjustment-shared/inventory-lots${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      await handleApiError(res, "Failed to load inventory lots");
      return [];
    }
    const data = await res.json();
    return (data || [])
      .filter((r: Record<string, unknown>) => Number(r.quantity || r.available_quantity || 0) > 0)
      .map((r: Record<string, unknown>) => ({
      inventory_lot_id: Number(r.inventory_lot_id || r.id),
      lot_id: Number(r.lot_id || 0),
      branch_id: Number(r.branch_id || params.branchId || 0),
      product_id: Number(r.product_id || params.productId || 0),
      batch_no: String(r.batch_no || ""),
      manufacturing_date: (r.manufacturing_date as string) || null,
      expiry_date: (r.expiry_date as string) || null,
      unit_cost: Number(r.unit_cost || 0),
      qa_status: String(r.qa_status || "GOOD"),
      status: String(r.status || "ACTIVE"),
      available_quantity: Number(r.quantity || r.available_quantity || 0),
      product_name: r.product_name as string | undefined,
      product_code: r.product_code as string | undefined,
      lot_name: r.lot_name as string | undefined,
      unit_name: r.unit_name as string | undefined,
    }));
  } catch (err) {
    console.error("[LotTracking] Error fetching inventory lots:", err);
    toast.error("Failed to connect to inventory batch registry.");
    return [];
  }
}

export async function fetchBranches(): Promise<BranchOption[]> {
  try {
    const res = await fetch("/api/manufacturing/branches", { cache: "no-store" });
    if (!res.ok) {
      await handleApiError(res, "Failed to load active branches");
      return [];
    }
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data?.data || [];
    return rows
      .map((r: Record<string, unknown>) => {
        const isActiveRaw = r.isActive ?? r.is_active;
        const isActive = Number(isActiveRaw) === 1 || isActiveRaw === true || isActiveRaw === "1";
        return {
          id: Number(r.id || r.branch_id),
          branchName: String(r.branch_name || r.name || r.branchName || `Branch #${r.id}`),
          branchCode: (r.branch_code || r.code || r.branchCode) as string | undefined,
          isActive,
        };
      })
      .filter((b: BranchOption) => b.isActive);
  } catch (err) {
    console.error("[LotTracking] Error fetching branches:", err);
    toast.error("Failed to connect to branches service.");
    return [];
  }
}

/**
 * Fetch products that have inventory batches in a specific lot.
 * Leverages the lot batches reconciliation endpoint with source=lot-transfer
 * and enriches product metadata from the master products catalog.
 */
export async function fetchProductsByLot(lotId: number): Promise<MMProduct[]> {
  try {
    if (!lotId || lotId <= 0) return [];

    const [batchesRes, allProducts, lookups] = await Promise.all([
      fetch(
        `/api/manufacturing/inventory-warehousing/adjustments/adjustment-shared/lots/batches?lotId=${lotId}&source=lot-transfer`,
        { cache: "no-store" }
      ),
      fetchProducts(),
      fetchNameLookups(),
    ]);

    if (!batchesRes.ok) {
      await handleApiError(batchesRes, `Failed to load batches for lot #${lotId}`);
      return [];
    }

    const batchesData: Record<string, unknown>[] = await batchesRes.json();
    const productMap = new Map<number, MMProduct>();
    allProducts.forEach((p) => productMap.set(p.productId, p));

    const lotProductsMap = new Map<number, MMProduct>();

    (batchesData || []).forEach((b) => {
      const pId = Number(b.productId || b.product_id || 0);
      if (pId <= 0) return;

      const qty = Number(b.quantity ?? b.available_quantity ?? 0);
      if (qty <= 0) return; // Strictly ignore batches with 0 or negative quantity

      if (!lotProductsMap.has(pId)) {
        const masterProduct = productMap.get(pId);
        const lookupName = lookups.maps.productNames[String(pId)];
        const candidateName = masterProduct?.productName || String(b.productName || b.product_name || "");
        const resolvedName =
          candidateName && candidateName !== "Product #undefined"
            ? candidateName
            : (lookupName || `Product #${pId}`);

        const rawCode =
          masterProduct?.productCode ||
          masterProduct?.skuCode ||
          (b.itemCode as string) ||
          (b.productCode as string) ||
          (b.product_code as string);
        const resolvedCode = rawCode ? String(rawCode).trim() : undefined;

        const rawUom =
          masterProduct?.uomName ||
          (b.uomName as string) ||
          (b.unit_name as string);
        const resolvedUom = rawUom ? String(rawUom).trim() : undefined;

        const resolvedCost =
          masterProduct?.unitCost ??
          Number(b.unitCost || b.unit_cost || 0);

        lotProductsMap.set(pId, {
          productId: pId,
          productName: resolvedName,
          productCode: resolvedCode,
          skuCode: resolvedCode,
          uomId: masterProduct?.uomId ?? null,
          uomName: resolvedUom,
          productTypeId: masterProduct?.productTypeId ?? null,
          productTypeName: masterProduct?.productTypeName,
          productCategoryName: masterProduct?.productCategoryName,
          unitCost: resolvedCost,
        });
      }
    });

    return Array.from(lotProductsMap.values());
  } catch (err) {
    console.error("[LotTracking] Error fetching products by lot:", err);
    toast.error("Failed to connect to lot products service.");
    return [];
  }
}

/**
 * Fetch inventory batches available in a specific lot for a specific product.
 * Reconciles live on-hand quantities, expiry dates, and QA status.
 */
export async function fetchInventoryBatchesByLot(
  lotId: number,
  productId: number
): Promise<MMInventoryLot[]> {
  try {
    if (!lotId || lotId <= 0 || !productId || productId <= 0) return [];

    const [res, lookups] = await Promise.all([
      fetch(
        `/api/manufacturing/inventory-warehousing/adjustments/adjustment-shared/lots/batches?lotId=${lotId}&source=lot-transfer`,
        { cache: "no-store" }
      ),
      fetchNameLookups(),
    ]);

    if (!res.ok) {
      await handleApiError(res, "Failed to load lot inventory batches");
      return [];
    }

    const data: Record<string, unknown>[] = await res.json();
    return (data || [])
      .filter((b) => {
        const matchesProduct = Number(b.productId || b.product_id || 0) === Number(productId);
        const qty = Number(b.quantity ?? b.available_quantity ?? 0);
        return matchesProduct && qty > 0;
      })
      .map((b) => {
        const uId = Number(b.unitId || b.unit_id || 0);
        return {
          inventory_lot_id: Number(b.batchId || b.id || b.inventory_lot_id || 0),
          lot_id: Number(b.lotId || lotId),
          branch_id: Number(b.branchId || b.branch_id || 0),
          product_id: Number(b.productId || b.product_id || productId),
          batch_no: String(b.batchNumber || b.batch_no || ""),
          manufacturing_date: (b.manufacturingDate || b.manufacturing_date || null) as string | null,
          expiry_date: (b.expirationDate || b.expiry_date || null) as string | null,
          unit_cost: Number(b.unitCost || b.unit_cost || 0),
          qa_status: String(b.qaStatus || b.qa_status || "GOOD"),
          status: String(b.status || "ACTIVE"),
          available_quantity: Number(b.quantity ?? b.available_quantity ?? 0),
          product_name: (b.productName || b.product_name || lookups.maps.productNames[String(productId)] || "-") as string,
          product_code: (b.itemCode || b.product_code || b.productCode || "-") as string,
          lot_name: (b.lotName || b.lot_name || lookups.maps.lotNames[String(lotId)] || "-") as string,
          unit_name: (b.uomName || b.unit_name || (uId > 0 ? lookups.maps.unitNames[String(uId)] : "-") || "-") as string,
        };
      });
  } catch (err) {
    console.error("[LotTracking] Error fetching batches by lot:", err);
    toast.error("Failed to connect to lot batch inventory service.");
    return [];
  }
}

export interface LotProductWithBatches {
  productId: number;
  productName: string;
  productCode?: string;
  productDescription?: string;
  uomName?: string;
  productTypeId?: number | null;
  productTypeName?: string;
  productCategoryName?: string;
  batches: MMInventoryLot[];
}

/**
 * Fetch products and their active positive batches for a specific lot.
 * Only returns products that have at least one active batch with quantity > 0.
 */
export async function fetchLotProductsWithStock(
  lotId: number
): Promise<LotProductWithBatches[]> {
  try {
    if (!lotId || lotId <= 0) return [];

    const [batchesRes, allProducts, lookups] = await Promise.all([
      fetch(
        `/api/manufacturing/inventory-warehousing/adjustments/lot-transfer/batches?lotId=${lotId}`,
        { cache: "no-store" }
      ),
      fetchProducts(),
      fetchNameLookups(),
    ]);

    if (!batchesRes.ok) {
      await handleApiError(batchesRes, `Failed to load inventory for lot #${lotId}`);
      return [];
    }

    const json = await batchesRes.json();
    const batchesData: Record<string, unknown>[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.batches)
      ? json.batches
      : [];

    const productMap = new Map<number, MMProduct>();
    allProducts.forEach((p) => productMap.set(p.productId, p));

    const grouped = new Map<number, MMInventoryLot[]>();

    batchesData.forEach((b) => {
      const pId = Number(b.productId || b.product_id || 0);
      if (pId <= 0) return;

      const qty = Number(b.quantity ?? b.available_quantity ?? 0);
      if (qty <= 0) return; // Strictly ignore 0 and negative quantity!

      const status = String(b.status || "ACTIVE").toUpperCase();
      if (status === "INACTIVE" || status === "CLOSED") return; // Strictly ignore inactive/closed

      const uId = Number(b.unitId || b.unit_id || b.uomId || 0);
      const inventoryLot: MMInventoryLot = {
        inventory_lot_id: Number(b.inventoryLotId || b.batchId || b.id || b.inventory_lot_id || 0),
        lot_id: Number(b.lotId || b.lot_id || lotId),
        branch_id: Number(b.branchId || b.branch_id || 0),
        product_id: pId,
        batch_no: String(b.batchNumber || b.batch_no || ""),
        manufacturing_date: (b.manufacturingDate || b.manufacturing_date || null) as string | null,
        expiry_date: (b.expirationDate || b.expiry_date || null) as string | null,
        unit_cost: Number(b.unitCost || b.unit_cost || 0),
        qa_status: String(b.qaStatus || b.qa_status || "GOOD"),
        status,
        available_quantity: qty,
        product_name: (b.productName || b.product_name || lookups.maps.productNames[String(pId)] || "-") as string,
        product_code: (b.productCode || b.itemCode || b.product_code || "-") as string,
        lot_name: (b.lotName || b.lot_name || lookups.maps.lotNames[String(lotId)] || "-") as string,
        unit_name: (b.uomName || b.unit_name || (uId > 0 ? lookups.maps.unitNames[String(uId)] : "-") || "-") as string,
        created_at: (b.createdAt || b.created_at || b.dateReceived || b.date_received || null) as string | null,
        product_type_id: b.productTypeId ? Number(b.productTypeId) : null,
        product_type_name: (b.productTypeName as string) || undefined,
        product_category_name: (b.productCategoryName as string) || undefined,
        product_description: (b.productDescription as string) || undefined,
        classification_code: (b.classificationCode as string) || undefined,
      };

      const existing = grouped.get(pId) || [];
      existing.push(inventoryLot);
      grouped.set(pId, existing);
    });

    const result: LotProductWithBatches[] = [];

    grouped.forEach((batches, pId) => {
      if (batches.length === 0) return;

      const master = productMap.get(pId);
      const firstBatch = batches[0];
      const lookupName = lookups.maps.productNames[String(pId)];
      const candidateName = master?.productName || firstBatch.product_name;
      const resolvedName =
        candidateName && candidateName !== "Product #undefined"
          ? candidateName
          : (lookupName || `Product #${pId}`);

      const rawCode = master?.productCode || master?.skuCode || firstBatch.product_code;
      const resolvedCode = rawCode ? String(rawCode).trim() : undefined;

      const rawUom = master?.uomName || firstBatch.unit_name;
      const resolvedUom = rawUom ? String(rawUom).trim() : undefined;

      const resolvedDesc = master?.description || firstBatch.product_description || lookups.maps.productDescriptions?.[String(pId)];

      const resolvedTypeId = master?.productTypeId ?? firstBatch.product_type_id ?? null;
      const resolvedTypeName = master?.productTypeName || firstBatch.product_type_name;
      const resolvedCatName = master?.productCategoryName || firstBatch.product_category_name;

      result.push({
        productId: pId,
        productName: resolvedName,
        productCode: resolvedCode,
        productDescription: resolvedDesc,
        uomName: resolvedUom,
        productTypeId: resolvedTypeId,
        productTypeName: resolvedTypeName,
        productCategoryName: resolvedCatName,
        batches,
      });
    });

    return result;
  } catch (err) {
    console.error("[LotTracking] Error fetching lot products with stock:", err);
    toast.error("Failed to connect to lot inventory service.");
    return [];
  }
}

export interface LotTransferLotStats {
  lotId: number;
  lotName: string;
  branchId: number;
  unitId?: number | null;
  unitName: string;
  maxCapacity: number;
  totalOccupancy: number;
  totalBatchCount: number;
  matchingBatchesToMove: number;
  matchingQtyToMove: number;
  capacityLeft: number;
  hasNegativeStock?: boolean;
  negativeStockQty?: number;
}

export async function fetchLotTransferBatchStats(
  branchId: number,
  productTypeId?: number | null
): Promise<Record<number, LotTransferLotStats>> {
  try {
    if (!branchId || branchId <= 0) return {};
    const qs = new URLSearchParams();
    qs.set("branchId", String(branchId));
    if (productTypeId) qs.set("productTypeId", String(productTypeId));

    const res = await fetch(
      `/api/manufacturing/inventory-warehousing/adjustments/lot-transfer/batches?${qs.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      await handleApiError(res, "Failed to load authoritative lot batches and occupancy");
      return {};
    }
    const data = await res.json();
    return data?.lotStats || {};
  } catch (err) {
    console.error("[LotTracking] Error fetching lot transfer batch stats:", err);
    toast.error("Failed to connect to lot transfer batch statistics service.");
    return {};
  }
}
