import { directusFetch, getDirectusBase } from "../utils/directus";
import { getPhDbTimestamp } from "../utils/date-utils";
import {
  StockAdjustmentHeader,
  StockAdjustmentDetail,
  StockAdjustmentItem,
  StockAdjustmentProduct,
} from "../types/stock-adjustment.schema";
import { fetchProductOnhand } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";

interface RawItem {
  id?: number;
  doc_no: string;
  quantity: number;
  product_id?: {
    id: number;
    product_id: number;
    product_name?: string;
    product_code?: string;
    cost_per_unit?: number;
    price_per_unit?: number;
    product_brand?: { brand_name: string };
    product_category?: { category_name: string };
    unit_id?: number;
    unit_of_measurement?: { unit_id?: number; unit_name: string; order: number };
    barcode?: string;
    description?: string;
  };
  unit_id?: number | { unit_id?: number; id?: number; unit_name?: string } | null;
  cost_per_unit?: number;
  brand_name?: string;
  unit_name?: string;
  rfid_tags?: string[];
  rfid_count?: number;
  inferred_supplier_id?: number;
  current_stock?: number;
  lot_id?: { lot_id?: number; lot_name?: string } | number | null;
  lot_name?: string | null;
  inventory_lot_id?: number | null;
  batch_no?: string | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  inventory_condition?: string | null;
  qa_status?: string | null;
}

interface PPSData {
  product_id: number | { id: number };
  supplier_id: number | { id: number };
}

interface AttachmentItem {
  id?: number;
  stock_adjustment_id?: number;
  attachment?: unknown;
  created_at?: string | null;
  created_by?: number | string | null;
}

interface RfidStatusItem {
  productId: number;
  quantity?: number;
  count?: number;
}

const DIRECTUS_URL = getDirectusBase();

async function syncInventoryLotBatch(params: {
  lot_id?: number | null;
  product_id: number;
  batch_no?: string | null;
  branch_id?: number | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  unit_cost?: number;
  inventory_condition?: string;
  qa_status?: string;
  doc_no: string;
  userId?: number | null;
}): Promise<number | null> {
  if (!params.batch_no || String(params.batch_no).trim() === "") {
    return null;
  }
  const cleanBatchNo = String(params.batch_no).trim();
  const lotId = params.lot_id ? Number(params.lot_id) : null;
  const productId = Number(params.product_id);
  const branchId = Number(params.branch_id || 0);

  try {
    const filterAnd: Record<string, unknown>[] = [
      { product_id: { _eq: productId } },
      { batch_no: { _eq: cleanBatchNo } },
    ];
    if (lotId) {
      filterAnd.push({ lot_id: { _eq: lotId } });
    }

    const existingRes = await directusFetch<{ data: Array<{ id: number; inventory_lot_id?: number }> }>(
      `${DIRECTUS_URL}/items/mm_inventory_lots?filter={"_and":${JSON.stringify(filterAnd)},"_or":[{"branch_id":{"_eq":${branchId}}},{"branch_id":{"_null":true}}]}&limit=1&fields=id,inventory_lot_id`
    ).catch(() => ({ data: [] }));

    if (existingRes.data && existingRes.data.length > 0) {
      const found = existingRes.data[0];
      return found.inventory_lot_id || found.id;
    }

    // Resolve fallback lot_id if none provided
    let effectiveLotId = lotId;
    if (!effectiveLotId && branchId) {
      const lotRes = await directusFetch<{ data: Array<{ id: number; lot_id?: number }> }>(
        `${DIRECTUS_URL}/items/mm_lots?filter={"branch_id":{"_eq":${branchId}}}&limit=1&fields=id,lot_id`
      ).catch(() => ({ data: [] }));
      if (lotRes.data && lotRes.data.length > 0) {
        effectiveLotId = lotRes.data[0].lot_id || lotRes.data[0].id;
      }
    }
    if (!effectiveLotId) effectiveLotId = 1;

    const expDate = params.expiry_date || null;
    const mfgDate = params.manufacturing_date || null;
    const batchPayload = {
      lot_id: effectiveLotId,
      branch_id: branchId,
      product_id: productId,
      batch_no: cleanBatchNo,
      manufacturing_date: mfgDate,
      expiry_date: expDate,
      expiration_date: expDate,
      unit_cost: Number(params.unit_cost || 0),
      qa_status: params.inventory_condition || params.qa_status || "GOOD",
      status: "ACTIVE",
      source_type: "STOCK_ADJUSTMENT",
      source_reference: params.doc_no,
      remarks: `Created from Stock Adjustment IN - ${params.doc_no}`,
      created_by: params.userId || null,
      updated_by: params.userId || null,
    };

    const createRes = await directusFetch<{ data: { id: number; inventory_lot_id?: number } }>(
      `${DIRECTUS_URL}/items/mm_inventory_lots`,
      {
        method: "POST",
        body: JSON.stringify(batchPayload),
      }
    ).catch(async () => {
      return directusFetch<{ data: { id: number; inventory_lot_id?: number } }>(
        `${DIRECTUS_URL}/items/inventory_lots`,
        {
          method: "POST",
          body: JSON.stringify(batchPayload),
        }
      ).catch((err) => {
        console.error("Failed to create inventory lot in directus:", err);
        return null;
      });
    });

    if (createRes?.data) {
      return createRes.data.inventory_lot_id || createRes.data.id;
    }
  } catch (err) {
    console.error("Error in syncInventoryLotBatch:", err);
  }

  return null;
}
const SPRING_API_URL = process.env.SPRING_API_BASE_URL;

/**
 * Service for handling Stock Adjustment data interactions.
 */
export const stockAdjustmentService = {
  /**
   * Fetch all stock adjustment headers with optional filtering
   */
  async fetchAllHeaders(params?: { search?: string; branchId?: number; type?: string; status?: string }) {
    let query = `fields=*,branch_id.branch_name,branch_id.id,supplier_id.id,supplier_id.supplier_name,created_by.user_fname,created_by.user_lname,created_by.user_id,posted_by.user_fname,posted_by.user_lname,items.id,stock_adjustment.id&sort=-created_at`;

    const filters: Record<string, unknown> = {
      is_delete: { _neq: true },
      doc_no: { _nstarts_with: "CONV" }
    };

    if (params?.branchId) filters.branch_id = { _eq: params.branchId };
    if (params?.type) filters.type = { _eq: params.type };

    if (params?.status) {
      if (params.status === "Posted") {
        filters.isPosted = { _eq: true };
      } else if (params.status === "Unposted") {
        filters.isPosted = { _neq: true };
      }
    }

    if (params?.search) {
      filters._or = [
        { doc_no: { _icontains: params.search } },
        { remarks: { _icontains: params.search } }
      ];
    }

    if (Object.keys(filters).length > 0) {
      query += `&filter=${encodeURIComponent(JSON.stringify(filters))}`;
    }

    const res = await directusFetch<{ data: StockAdjustmentHeader[] }>(`${DIRECTUS_URL}/items/mm_stock_adjustment_header?${query}`);
    const headers = res.data;

    if (headers.length === 0) return [];

    // Pre-parse remarks metadata for each header to resolve exact supplier
    const parsedHeaders = headers.map(header => {
      let supplierId: number | null = null;
      let cleanedRemarks = String(header.remarks || "").trim();
      const match = cleanedRemarks.match(/\[SUPPLIER_ID:\s*(\d+)\]/);
      if (match) {
        supplierId = Number(match[1]);
        cleanedRemarks = cleanedRemarks.replace(/\s*\[SUPPLIER_ID:\s*(\d+)\]/g, "").trim();
      }
      return {
        ...header,
        remarks: cleanedRemarks,
        parsed_supplier_id: supplierId
      };
    });

    const docNos = parsedHeaders.map(h => h.doc_no);
    const itemsRes = await directusFetch<{ data: RawItem[] }>(
      `${DIRECTUS_URL}/items/mm_stock_adjustment?filter={"doc_no":{"_in":${JSON.stringify(docNos)}}}&fields=doc_no,quantity,product_id.product_id,product_id.price_per_unit,product_id.cost_per_unit,unit_id.unit_name&limit=-1`
    );
    const allItems = itemsRes.data || [];

    const itemsMap = new Map<string, RawItem[]>();
    allItems.forEach((item: RawItem) => {
      if (!itemsMap.has(item.doc_no)) itemsMap.set(item.doc_no, []);
      itemsMap.get(item.doc_no)!.push(item);
    });

    const productIds = allItems
      .map((item: RawItem) => {
        const p = item.product_id;
        if (typeof p === 'object' && p !== null) return p.product_id || p.id;
        return p;
      })
      .filter((pid): pid is number => typeof pid === 'number' || (typeof pid === 'string' && !isNaN(Number(pid))));

    const productToSupplierMap = new Map<number, number>();
    const supplierMap = new Map<number, string>();

    if (productIds.length > 0) {
      try {
        const ppsRes = await directusFetch<{ data: PPSData[] }>(
          `${DIRECTUS_URL}/items/product_per_supplier?filter={"product_id":{"_in":${JSON.stringify(productIds)}}}&fields=product_id,supplier_id&limit=-1`
        );
        const ppsData: PPSData[] = ppsRes.data || [];
        ppsData.forEach((pps: PPSData) => {
          const pId = typeof pps.product_id === 'object' ? pps.product_id.id : pps.product_id;
          const sId = typeof pps.supplier_id === 'object' ? pps.supplier_id.id : pps.supplier_id;
          if (pId && sId && !productToSupplierMap.has(Number(pId))) {
            productToSupplierMap.set(Number(pId), Number(sId));
          }
        });
      } catch (err) {
        console.error("Error inferring suppliers in fetchAllHeaders:", err);
      }
    }

    // Collect all parsed supplier IDs along with any inferred ones
    const supplierIds = Array.from(new Set([
      ...parsedHeaders.map(h => h.parsed_supplier_id).filter((id): id is number => id !== null),
      ...Array.from(productToSupplierMap.values())
    ]));

    if (supplierIds.length > 0) {
      try {
        const suppliersRes = await directusFetch<{ data: Array<{ id: number; supplier_name: string }> }>(
          `${DIRECTUS_URL}/items/suppliers?filter={"id":{"_in":${JSON.stringify(supplierIds)}}}&fields=id,supplier_name&limit=-1`
        );
        const suppliersData = suppliersRes.data || [];
        suppliersData.forEach((s) => {
          supplierMap.set(Number(s.id), s.supplier_name);
        });
      } catch (err) {
        console.error("Error fetching suppliers in fetchAllHeaders:", err);
      }
    }

    return parsedHeaders.map(header => {
      const headerItems = itemsMap.get(header.doc_no) || [];
      const totalAmount = headerItems.reduce((sum: number, item: RawItem) => {
        const cost = item.product_id?.cost_per_unit || item.product_id?.price_per_unit || 0;
        return sum + ((item.quantity || 0) * cost);
      }, 0);

      // Resolve supplier from remarks metadata first
      let resolvedSupplier: { id: number; supplier_name: string } | null = null;
      if (header.parsed_supplier_id) {
        const sName = supplierMap.get(header.parsed_supplier_id);
        if (sName) {
          resolvedSupplier = { id: header.parsed_supplier_id, supplier_name: sName };
        }
      }

      // Fallback to legacy inference
      if (!resolvedSupplier && headerItems.length > 0) {
        for (const item of headerItems) {
          const pId = Number(typeof item.product_id === 'object' ? (item.product_id?.product_id || item.product_id?.id) : item.product_id);
          const sId = productToSupplierMap.get(pId);
          if (sId) {
            const sName = supplierMap.get(sId);
            if (sName) {
              resolvedSupplier = { id: sId, supplier_name: sName };
              break;
            }
          }
        }
      }

      return {
        ...header,
        items: headerItems,
        amount: totalAmount > 0 ? totalAmount : (Number(header.amount) || 0),
        supplier_id: resolvedSupplier as unknown
      };
    });
  },

  /**
   * Fetch a single stock adjustment with all its items and RFID tags
   */
  async fetchById(id: number): Promise<StockAdjustmentDetail> {
    const headerRes = await directusFetch<{ data: StockAdjustmentHeader }>(
      `${DIRECTUS_URL}/items/mm_stock_adjustment_header/${id}?fields=*,branch_id.id,branch_id.branch_name,supplier_id.id,supplier_id.supplier_name,created_by.user_fname,created_by.user_lname,posted_by.user_fname,posted_by.user_lname`
    );
    const header = headerRes.data;

    const itemsRes = await directusFetch<{ data: RawItem[] }>(
      `${DIRECTUS_URL}/items/mm_stock_adjustment?filter={"doc_no":{"_eq":"${header.doc_no}"}}&fields=id,doc_no,product_id,inventory_lot_id,lot_id,batch_no,manufacturing_date,expiry_date,branch_id,type,created_at,quantity,unit_cost,inventory_condition,source_type,created_by,updated_by,updated_at,remarks,unit_id,lot_id.lot_id,lot_id.lot_name,product_id.product_id,product_id.product_name,product_id.product_code,product_id.cost_per_unit,product_id.price_per_unit,product_id.unit_of_measurement,product_id.unit_of_measurement.unit_id,product_id.unit_of_measurement.unit_name,product_id.unit_of_measurement.order,product_id.product_brand.brand_name,product_id.product_category.category_name,product_id.barcode,product_id.description,unit_id.unit_id,unit_id.unit_name&limit=-1`
    );
    const items = (itemsRes.data || []).map((item: RawItem) => {
      const cost = item.cost_per_unit || item.product_id?.cost_per_unit || item.product_id?.price_per_unit || 0;
      const lotId = (item.lot_id && typeof item.lot_id === 'object') ? item.lot_id.lot_id : (typeof item.lot_id === 'number' ? item.lot_id : undefined);
      const lotName = (item.lot_id && typeof item.lot_id === 'object') ? item.lot_id.lot_name : (item.lot_name || undefined);
      const resolvedUnitId = (item.unit_id && typeof item.unit_id === 'object')
        ? (item.unit_id as { unit_id?: number; id?: number }).unit_id || (item.unit_id as { unit_id?: number; id?: number }).id
        : (item.unit_id ? Number(item.unit_id) : (item.product_id?.unit_of_measurement?.unit_id || (typeof item.product_id?.unit_of_measurement === 'number' ? item.product_id.unit_of_measurement : undefined)));

      return {
        ...item,
        lot_id: lotId,
        lot_name: lotName,
        inventory_lot_id: item.inventory_lot_id ? Number(item.inventory_lot_id) : undefined,
        batch_no: item.batch_no || undefined,
        manufacturing_date: item.manufacturing_date || undefined,
        expiry_date: item.expiry_date || undefined,
        inventory_condition: item.inventory_condition || undefined,
        qa_status: (item.inventory_condition as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || "GOOD",
        product_name: item.product_id?.description || item.product_id?.product_name || "Unknown Product",
        product_code: item.product_id?.product_code,
        cost_per_unit: cost,
        unit_id: resolvedUnitId ? Number(resolvedUnitId) : undefined,
        unit_name: (typeof item.unit_id === 'object' && item.unit_id !== null ? item.unit_id.unit_name : undefined) || item.product_id?.unit_of_measurement?.unit_name || item.unit_name || "pcs",
        brand_name: item.product_id?.product_brand?.brand_name || item.brand_name || "N/A",
        category_name: item.product_id?.product_category?.category_name || "N/A"
      };
    });

    const productIds = items
      .map((item: RawItem) => {
        const p = item.product_id;
        if (typeof p === 'object' && p !== null) return p.product_id || p.id;
        return p;
      })
      .filter((pid): pid is number => typeof pid === 'number' || (typeof pid === 'string' && !isNaN(Number(pid))));

    if (productIds.length > 0) {
      try {
        const ppsRes = await directusFetch<{ data: PPSData[] }>(
          `${DIRECTUS_URL}/items/product_per_supplier?filter={"product_id":{"_in":${JSON.stringify(productIds)}}}&fields=product_id,supplier_id&limit=-1`
        );
        const ppsData: PPSData[] = ppsRes.data || [];
        const productToSupplierMap = new Map<number, number>();
        ppsData.forEach((pps: PPSData) => {
          const pId = typeof pps.product_id === 'object' ? pps.product_id.id : pps.product_id;
          const sId = typeof pps.supplier_id === 'object' ? pps.supplier_id.id : pps.supplier_id;
          if (pId && sId && !productToSupplierMap.has(Number(pId))) {
            productToSupplierMap.set(Number(pId), Number(sId));
          }
        });

        items.forEach((item: RawItem) => {
          const pId = Number(typeof item.product_id === 'object' ? (item.product_id?.product_id || item.product_id?.id) : item.product_id);
          if (productToSupplierMap.has(pId)) {
            item.inferred_supplier_id = productToSupplierMap.get(pId);
          }
        });
      } catch (err) {
        console.error("Error inferring suppliers:", err);
      }
    }

    const totalAmount = items.reduce((sum: number, item: RawItem) => {
      return sum + ((item.quantity || 0) * (item.cost_per_unit || 0));
    }, 0);

    // Resolve supplier from remarks metadata
    let supplierId: number | null = null;
    let cleanedRemarks = String(header.remarks || "").trim();
    const match = cleanedRemarks.match(/\[SUPPLIER_ID:\s*(\d+)\]/);
    if (match) {
      supplierId = Number(match[1]);
      cleanedRemarks = cleanedRemarks.replace(/\s*\[SUPPLIER_ID:\s*(\d+)\]/g, "").trim();
    }

    let resolvedSupplier: { id: number; supplier_name: string } | null = null;
    if (supplierId) {
      try {
        const sRes = await directusFetch<{ data: { id: number; supplier_name: string } }>(
          `${DIRECTUS_URL}/items/suppliers/${supplierId}?fields=id,supplier_name`
        );
        if (sRes.data) {
          resolvedSupplier = { id: Number(sRes.data.id), supplier_name: sRes.data.supplier_name };
        }
      } catch (err) {
        console.error("Failed to fetch resolved supplier in fetchById:", err);
      }
    }

    if (!resolvedSupplier && items.length > 0) {
      // Fallback: try legacy inference
      const firstWithInferred = items.find(item => item.inferred_supplier_id);
      if (firstWithInferred && firstWithInferred.inferred_supplier_id) {
        try {
          const sRes = await directusFetch<{ data: { id: number; supplier_name: string } }>(
            `${DIRECTUS_URL}/items/suppliers/${firstWithInferred.inferred_supplier_id}?fields=id,supplier_name`
          );
          if (sRes.data) {
            resolvedSupplier = { id: Number(sRes.data.id), supplier_name: sRes.data.supplier_name };
          }
        } catch (err) {
          console.error("Failed to fetch legacy inferred supplier in fetchById:", err);
        }
      }
    }

    const itemsWithTags = items.map((item: RawItem) => {
      return {
        ...item,
        rfid_tags: [],
        rfid_count: 0
      };
    });

    // Fetch attachments — FK references mm_stock_adjustment.id (items), not the header id.
    // We use the item IDs belonging to this doc_no to look up attachments.
    let attachments: AttachmentItem[] = [];
    try {
      const docItemIdsRes = await directusFetch<{ data: { id: number }[] }>(
        `${DIRECTUS_URL}/items/mm_stock_adjustment?filter={"doc_no":{"_eq":"${header.doc_no}"}}&fields=id&limit=-1`
      );
      const docItemIds = (docItemIdsRes.data || []).map((i) => i.id);
      if (docItemIds.length > 0) {
        const attachmentsRes = await directusFetch<{ data: AttachmentItem[] }>(
          `${DIRECTUS_URL}/items/mm_stock_adjustment_attachment?filter={"stock_adjustment_id":{"_in":${JSON.stringify(docItemIds)}}}&limit=-1`
        );
        attachments = attachmentsRes.data || [];

        // Since `attachment` is a string in DB (not a true relational field),
        // we manually fetch the file metadata from directus_files to populate it.
        const fileIds = attachments.map(a => typeof a.attachment === 'string' ? a.attachment : null).filter(Boolean);
        if (fileIds.length > 0) {
          try {
            const filesRes = await directusFetch<{ data: { id: string; type?: string; filename_download?: string; filesize?: number }[] }>(
              `${DIRECTUS_URL}/files?filter={"id":{"_in":${JSON.stringify(fileIds)}}}&fields=id,type,filename_download,filesize`
            );
            const filesMap = new Map((filesRes.data || []).map(f => [f.id, f]));
            attachments = attachments.map(a => ({
              ...a,
              attachment: typeof a.attachment === 'string' ? (filesMap.get(a.attachment) || a.attachment) : a.attachment
            }));
          } catch (fileErr) {
            console.warn("Failed to fetch file metadata:", fileErr);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch stock adjustment attachments:", err);
    }

    // Group discrete mm_stock_adjustment rows by product_id so multi-lot/batch lines are cleanly assembled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productGroupMap = new Map<number, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemsWithTags.forEach((item: any) => {
      const prodObj = typeof item.product_id === 'object' && item.product_id !== null ? item.product_id : null;
      const pId = Number(prodObj?.product_id || prodObj?.id || item.product_id);
      const itemQty = Number(item.quantity || 0);

      const batchObj = {
        inventory_lot_id: item.inventory_lot_id ? Number(item.inventory_lot_id) : undefined,
        batch_no: String(item.batch_no || '').trim(),
        manufacturing_date: item.manufacturing_date || null,
        expiry_date: item.expiry_date || null,
        quantity: itemQty,
        unit_cost: item.cost_per_unit,
        qa_status: (item.inventory_condition as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || "GOOD",
      };

      const lotIdNum = item.lot_id ? Number(item.lot_id) : 1;
      const lotNameStr = item.lot_name || `Lot #${lotIdNum}`;

      const existing = productGroupMap.get(pId);
      if (!existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lotGroup: any = {
          lot_id: lotIdNum,
          lot_name: lotNameStr,
          max_batch_capacity: 10,
          unit_id: item.unit_id ? Number(item.unit_id) : null,
          unit_name: item.unit_name,
          allocated_quantity: itemQty,
          batches: item.batch_no ? [batchObj] : [],
        };

        productGroupMap.set(pId, {
          ...item,
          quantity: itemQty,
          lot_allocations: item.batch_no ? [lotGroup] : [],
        } as unknown as StockAdjustmentItem);
      } else {
        existing.quantity = (Number(existing.quantity) || 0) + itemQty;
        if (!existing.lot_allocations) existing.lot_allocations = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let existingLotGroup = existing.lot_allocations.find((lg: any) => Number(lg.lot_id) === lotIdNum);
        if (!existingLotGroup) {
          existingLotGroup = {
            lot_id: lotIdNum,
            lot_name: lotNameStr,
            max_batch_capacity: 10,
            unit_id: item.unit_id ? Number(item.unit_id) : null,
            unit_name: item.unit_name,
            allocated_quantity: 0,
            batches: [],
          };
          existing.lot_allocations.push(existingLotGroup);
        }
        existingLotGroup.allocated_quantity = (existingLotGroup.allocated_quantity || 0) + itemQty;
        if (item.batch_no) {
          existingLotGroup.batches.push(batchObj);
        }
      }
    });

    const assembledItems = Array.from(productGroupMap.values());

    return {
      ...header,
      remarks: cleanedRemarks,
      items: assembledItems.length > 0 ? assembledItems : itemsWithTags,
      amount: totalAmount > 0 ? totalAmount : (Number(header.amount) || 0),
      supplier_id: resolvedSupplier as unknown,
      stock_adjustment_attachment: attachments,
    } as unknown as StockAdjustmentDetail;
  },
  async fetchProductInventory(productId: number, branchId: number, _token?: string): Promise<number> {
    void _token;
    try {
      const list = await fetchProductOnhand({ branchId, productId });
      if (list.length > 0) {
        return Number(list[0].onhandQuantity || 0);
      }
      return 0;
    } catch (error) {
      console.error("Failed to fetch product inventory:", error);
      return 0;
    }
  },

  async fetchBranchInventory(branchId: number, _token?: string): Promise<{ product_id: number; running_inventory: number }[]> {
    void _token;
    try {
      const list = await fetchProductOnhand({ branchId });
      return list.map((item) => ({
        product_id: Number(item.productId),
        running_inventory: Number(item.onhandQuantity || 0),
      }));
    } catch (error) {
      console.error("Failed to fetch branch inventory:", error);
      return [];
    }
  },

  async fetchBranchRFIDStatus(branchId: number, token: string): Promise<RfidStatusItem[]> {
    try {
      const url = `${SPRING_API_URL}/api/view-rfid-onhand?branchId=${branchId}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (error) {
      console.error("Failed to fetch branch RFID status:", error);
      return [];
    }
  },

  async checkRFIDStatus(productId: number, branchId: number, token: string): Promise<RfidStatusItem | null> {
    try {
      const url = `${SPRING_API_URL}/api/view-rfid-onhand?branchId=${branchId}`;
      
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`
        },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return null;

      const data = await res.json();
      if (Array.isArray(data)) {
        return data.find((item: RfidStatusItem) => item.productId === productId) || null;
      }
      return null;
    } catch (error) {
      console.error("Failed to check RFID status:", error);
      return null;
    }
  },

  async checkRFIDExists(rfid: string, token: string, branchId?: number): Promise<{ exists: boolean; location?: string }> {
    try {
      // 1. Check Spring API (Inventory On Hand)
      const springUrl = new URL(`${SPRING_API_URL}/api/view-rfid-onhand`);
      springUrl.searchParams.set("rfid", rfid);
      if (branchId) springUrl.searchParams.set("branchId", String(branchId));

      const springRes = await fetch(springUrl.toString(), {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (springRes.ok) {
        const data = await springRes.json();
        const hasInventory = Array.isArray(data) ? data.length > 0 : (data && typeof data === 'object' && ('productId' in data || 'id' in data));
        if (hasInventory) {
          const locationName = Array.isArray(data) && data[0]?.branch_name ? data[0].branch_name : "Inventory";
          return { exists: true, location: locationName };
        }
      }

      // 2. Check Directus Historical Records (Cross-Module)
      const collections = [
        { name: "stock_adjustment_rfid", label: "Stock Adjustment" },
        { name: "rts_item_rfid", label: "Return to Supplier" },
        { name: "sales_return_rfid", label: "Sales Return" }
      ];

      const historicalChecks = await Promise.all(
        collections.map(async (coll) => {
          try {
            const res = await directusFetch<{ data: unknown[] }>(
              `${DIRECTUS_URL}/items/${coll.name}?filter={"rfid_tag":{"_eq":"${rfid}"}}&fields=id&limit=1`
            );
            return { name: coll.label, exists: res.data && res.data.length > 0 };
          } catch (e) {
            console.warn(`Failed to check historical RFID in ${coll.name}:`, e);
            return { name: coll.label, exists: false };
          }
        })
      );

      const found = historicalChecks.find(c => c.exists);
      if (found) {
        return { exists: true, location: `Registered in ${found.name}` };
      }

      return { exists: false };
    } catch (error) {
      console.error("Failed to check RFID availability:", error);
      return { exists: false };
    }
  },

  /**
   * Create a new Stock Adjustment (Header + Items)
   */
  async create(payload: { header: Record<string, unknown>; items: StockAdjustmentItem[]; userId?: number }) {
    const { header, items } = payload;

    let finalRemarks = String(header.remarks || "").trim();
    // Clean any existing supplier tags to be safe
    finalRemarks = finalRemarks.replace(/\s*\[SUPPLIER_ID:\s*(\d+)\]/g, "").trim();
    if (header.supplier_id) {
      finalRemarks = `${finalRemarks}\n[SUPPLIER_ID: ${header.supplier_id}]`.trim();
    }

    // 0. Resolve missing unit_ids from products table
    const missingUnitProductIds = items
      .filter((i) => !i.unit_id)
      .map((i) => Number(i.product_id))
      .filter((id) => !isNaN(id) && id > 0);

    const productUnitMap = new Map<number, number>();
    if (missingUnitProductIds.length > 0) {
      try {
        const prodRes = await directusFetch<{ data: Array<{ product_id: number; unit_of_measurement?: number | { unit_id?: number; id?: number } }> }>(
          `${DIRECTUS_URL}/items/products?filter={"product_id":{"_in":${JSON.stringify(missingUnitProductIds)}}}&fields=product_id,unit_of_measurement,unit_of_measurement.unit_id&limit=-1`
        );
        (prodRes.data || []).forEach((p) => {
          const uId = typeof p.unit_of_measurement === 'object' && p.unit_of_measurement !== null
            ? (p.unit_of_measurement.unit_id || p.unit_of_measurement.id)
            : p.unit_of_measurement;
          if (uId) productUnitMap.set(Number(p.product_id), Number(uId));
        });
      } catch (e) {
        console.warn("Failed to fetch fallback unit_ids for products:", e);
      }
    }

    const nowPHT = getPhDbTimestamp();

    const headerRes = await directusFetch<{ data: { id: number } }>(`${DIRECTUS_URL}/items/mm_stock_adjustment_header`, {
      method: "POST",
      body: JSON.stringify({
        doc_no: header.doc_no,
        branch_id: header.branch_id,
        supplier_id: header.supplier_id,
        type: header.type,
        remarks: finalRemarks,
        amount: header.amount || items.reduce((acc: number, item: StockAdjustmentItem) => acc + (item.quantity * (item.cost_per_unit || 0)), 0),
        isPosted: 0,
        created_by: payload.userId || null,
        updated_by: payload.userId || null,
        created_at: nowPHT,
        updated_at: nowPHT,
        date_created: nowPHT,
        date_updated: nowPHT,
      }),
    });
    const headerId = headerRes.data.id;

    // Explode multi-lot & multi-batch allocations into 1 discrete row per lot-batch in mm_stock_adjustment
    const explodedItems: StockAdjustmentItem[] = [];
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItem = item as any;
      if (Array.isArray(rawItem.lot_allocations) && rawItem.lot_allocations.length > 0) {
        for (const group of rawItem.lot_allocations) {
          for (const b of (group.batches || [])) {
            const bQty = Number(b.quantity || 0);
            if (bQty > 0) {
              explodedItems.push({
                ...item,
                lot_id: group.lot_id ? Number(group.lot_id) : item.lot_id,
                inventory_lot_id: b.inventory_lot_id ? Number(b.inventory_lot_id) : undefined,
                batch_no: String(b.batch_no || item.batch_no || "").trim(),
                quantity: bQty,
                manufacturing_date: b.manufacturing_date || item.manufacturing_date,
                expiry_date: b.expiry_date || item.expiry_date,
                cost_per_unit: b.unit_cost !== undefined ? Number(b.unit_cost) : item.cost_per_unit,
                inventory_condition: b.qa_status || item.inventory_condition || item.qa_status,
              });
            }
          }
        }
      } else if (Array.isArray((item as Record<string, unknown>).allocations) && ((item as Record<string, unknown>).allocations as Array<Record<string, unknown>>).length > 0) {
        for (const alloc of ((item as Record<string, unknown>).allocations as Array<Record<string, unknown>>)) {
          const allocQty = Number(alloc.allocated_quantity || alloc.quantity || 0);
          if (allocQty > 0) {
            explodedItems.push({
              ...item,
              lot_id: alloc.lot_id ? Number(alloc.lot_id) : item.lot_id,
              inventory_lot_id: alloc.inventory_lot_id ? Number(alloc.inventory_lot_id) : undefined,
              batch_no: String(alloc.batch_no || item.batch_no || "").trim(),
              quantity: allocQty,
              manufacturing_date: (alloc.manufacturing_date as string) || item.manufacturing_date,
              expiry_date: (alloc.expiry_date as string) || item.expiry_date,
              cost_per_unit: alloc.unit_cost !== undefined ? Number(alloc.unit_cost) : item.cost_per_unit,
              inventory_condition: (alloc.qa_status as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || item.inventory_condition || item.qa_status,
            });
          }
        }
      } else {
        explodedItems.push(item);
      }
    }

    const itemsPayload = await Promise.all(
      explodedItems.map(async (item: StockAdjustmentItem) => {
        const resolvedUnitId = item.unit_id ? Number(item.unit_id) : (productUnitMap.get(Number(item.product_id)) || null);
        
        let resolvedInventoryLotId = item.inventory_lot_id ? Number(item.inventory_lot_id) : null;
        if (!resolvedInventoryLotId && item.batch_no) {
          resolvedInventoryLotId = await syncInventoryLotBatch({
            lot_id: item.lot_id,
            product_id: Number(item.product_id),
            batch_no: item.batch_no,
            branch_id: Number(header.branch_id),
            manufacturing_date: item.manufacturing_date,
            expiry_date: item.expiry_date,
            unit_cost: item.cost_per_unit != null ? Number(item.cost_per_unit) : undefined,
            inventory_condition: item.inventory_condition || item.qa_status,
            doc_no: String(header.doc_no || ""),
            userId: payload.userId,
          });
        }

        return {
          doc_no: header.doc_no,
          stock_adjustment_id: headerId,
          product_id: Number(item.product_id),
          inventory_lot_id: resolvedInventoryLotId || null,
          lot_id: item.lot_id ? Number(item.lot_id) : null,
          batch_no: item.batch_no || null,
          manufacturing_date: item.manufacturing_date || null,
          expiry_date: item.expiry_date || null,
          inventory_condition: item.inventory_condition || item.qa_status || "GOOD",
          source_type: "MANUAL",
          branch_id: Number(header.branch_id),
          type: header.type,
          quantity: Number(item.quantity),
          unit_cost: item.cost_per_unit ? Number(item.cost_per_unit) : 0,
          remarks: item.remarks || "Stock Adjustment",
          unit_id: resolvedUnitId ? Number(resolvedUnitId) : null,
          created_by: payload.userId || null,
          updated_by: payload.userId || null,
          created_at: nowPHT,
          updated_at: nowPHT,
          date_created: nowPHT,
          date_updated: nowPHT,
        };
      })
    );

    const itemsRes = await directusFetch<{ data: Array<{ id: number }> | { id: number } }>(`${DIRECTUS_URL}/items/mm_stock_adjustment?fields=id`, {
      method: "POST",
      body: JSON.stringify(itemsPayload),
    });

    // Save attachments linked to first new item's id
    const headerAttachments = header.stock_adjustment_attachment;
    if (headerAttachments && Array.isArray(headerAttachments) && headerAttachments.length > 0) {
      const createdItems = Array.isArray(itemsRes.data) ? itemsRes.data : [itemsRes.data];
      const firstItemId = createdItems[0]?.id;
      if (firstItemId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const atts = (headerAttachments as any[]).map((att: any) => ({
          stock_adjustment_id: firstItemId,
          attachment: typeof att.attachment === 'object' && att.attachment !== null
            ? (att.attachment as { id: string | number }).id
            : (att.attachment || att),
          created_by: payload.userId || null,
          updated_by: payload.userId || null,
          updated_at: nowPHT,
          created_at: nowPHT,
          date_updated: nowPHT,
          date_created: nowPHT,
        }));
        await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment_attachment`, {
          method: "POST",
          body: JSON.stringify(atts),
        }).catch(err => console.error("Failed to save attachments on creation:", err));
      }
    }

    return headerRes.data;
  },

  /**
   * Update an existing Stock Adjustment
   */
  async update(id: number, payload: { header: Record<string, unknown>; items: StockAdjustmentItem[]; userId?: number }) {
    let finalRemarks = String(payload.header.remarks || "").trim();
    finalRemarks = finalRemarks.replace(/\s*\[SUPPLIER_ID:\s*(\d+)\]/g, "").trim();
    if (payload.header.supplier_id) {
      finalRemarks = `${finalRemarks}\n[SUPPLIER_ID: ${payload.header.supplier_id}]`.trim();
    }

    const nowPHT = getPhDbTimestamp();

    const headerPayload = {
      doc_no: payload.header.doc_no,
      type: payload.header.type,
      branch_id: Number(payload.header.branch_id),
      remarks: finalRemarks,
      supplier_id: payload.header.supplier_id ? Number(payload.header.supplier_id) : null,
      amount: Number(payload.header.amount),
      updated_by: payload.userId || null,
      updated_at: nowPHT,
      date_updated: nowPHT,
    };

    await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment_header/${id}`, {
      method: "PATCH",
      body: JSON.stringify(headerPayload),
    });

    const existingItemsRes = await directusFetch<{ data: { id: number }[] }>(
      `${DIRECTUS_URL}/items/mm_stock_adjustment?filter={"doc_no":{"_eq":"${payload.header.doc_no}"}}&fields=id`
    );
    const itemIds = existingItemsRes.data.map((i: { id: number }) => i.id);

    // Fetch existing attachments so we can restore them (since items will be deleted)
    let attachmentsToRestore: AttachmentItem[] = [];
    if (itemIds.length > 0) {
      try {
        const attRes = await directusFetch<{ data: AttachmentItem[] }>(
          `${DIRECTUS_URL}/items/mm_stock_adjustment_attachment?filter={"stock_adjustment_id":{"_in":${JSON.stringify(itemIds)}}}&fields=id,attachment&limit=-1`
        );
        attachmentsToRestore = attRes.data || [];
      } catch (err) {
        console.warn("Failed to fetch attachments before update:", err);
      }
    }

    // Delete old attachments first using old item IDs (FK cascade cascade)
    if (attachmentsToRestore.length > 0) {
      try {
        const attIds = attachmentsToRestore.map(a => a.id);
        await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment_attachment`, {
          method: "DELETE",
          body: JSON.stringify(attIds),
        });
      } catch (err) {
        console.warn("Failed to delete attachments during update:", err);
      }
    }

    if (itemIds.length > 0) {
      await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment`, {
        method: "DELETE",
        body: JSON.stringify(itemIds),
      });
    }

    // 3.5. Resolve missing unit_ids from products table
    const missingUnitProductIds = payload.items
      .filter((i) => !i.unit_id)
      .map((i) => Number(i.product_id))
      .filter((id) => !isNaN(id) && id > 0);

    const productUnitMap = new Map<number, number>();
    if (missingUnitProductIds.length > 0) {
      try {
        const prodRes = await directusFetch<{ data: Array<{ product_id: number; unit_of_measurement?: number | { unit_id?: number; id?: number } }> }>(
          `${DIRECTUS_URL}/items/products?filter={"product_id":{"_in":${JSON.stringify(missingUnitProductIds)}}}&fields=product_id,unit_of_measurement,unit_of_measurement.unit_id&limit=-1`
        );
        (prodRes.data || []).forEach((p) => {
          const uId = typeof p.unit_of_measurement === 'object' && p.unit_of_measurement !== null
            ? (p.unit_of_measurement.unit_id || p.unit_of_measurement.id)
            : p.unit_of_measurement;
          if (uId) productUnitMap.set(Number(p.product_id), Number(uId));
        });
      } catch (e) {
        console.warn("Failed to fetch fallback unit_ids for products:", e);
      }
    }

    // 4. Re-create items (exploding multi-lot and multi-batch allocations into 1 discrete row per lot-batch)
    const explodedItems: StockAdjustmentItem[] = [];
    for (const item of payload.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItem = item as any;
      if (Array.isArray(rawItem.lot_allocations) && rawItem.lot_allocations.length > 0) {
        for (const group of rawItem.lot_allocations) {
          for (const b of (group.batches || [])) {
            const bQty = Number(b.quantity || 0);
            if (bQty > 0) {
              explodedItems.push({
                ...item,
                lot_id: group.lot_id ? Number(group.lot_id) : item.lot_id,
                inventory_lot_id: b.inventory_lot_id ? Number(b.inventory_lot_id) : undefined,
                batch_no: String(b.batch_no || item.batch_no || "").trim(),
                quantity: bQty,
                manufacturing_date: b.manufacturing_date || item.manufacturing_date,
                expiry_date: b.expiry_date || item.expiry_date,
                cost_per_unit: b.unit_cost !== undefined ? Number(b.unit_cost) : item.cost_per_unit,
                inventory_condition: b.qa_status || item.inventory_condition || item.qa_status,
              });
            }
          }
        }
      } else if (Array.isArray((item as Record<string, unknown>).allocations) && ((item as Record<string, unknown>).allocations as Array<Record<string, unknown>>).length > 0) {
        for (const alloc of ((item as Record<string, unknown>).allocations as Array<Record<string, unknown>>)) {
          const allocQty = Number(alloc.allocated_quantity || alloc.quantity || 0);
          if (allocQty > 0) {
            explodedItems.push({
              ...item,
              lot_id: alloc.lot_id ? Number(alloc.lot_id) : item.lot_id,
              inventory_lot_id: alloc.inventory_lot_id ? Number(alloc.inventory_lot_id) : undefined,
              batch_no: String(alloc.batch_no || item.batch_no || "").trim(),
              quantity: allocQty,
              manufacturing_date: (alloc.manufacturing_date as string) || item.manufacturing_date,
              expiry_date: (alloc.expiry_date as string) || item.expiry_date,
              cost_per_unit: alloc.unit_cost !== undefined ? Number(alloc.unit_cost) : item.cost_per_unit,
              inventory_condition: (alloc.qa_status as "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED") || item.inventory_condition || item.qa_status,
            });
          }
        }
      } else {
        explodedItems.push(item);
      }
    }

    const itemsPayload = await Promise.all(
      explodedItems.map(async (item: StockAdjustmentItem) => {
        const resolvedUnitId = item.unit_id ? Number(item.unit_id) : (productUnitMap.get(Number(item.product_id)) || null);
        
        let resolvedInventoryLotId = item.inventory_lot_id ? Number(item.inventory_lot_id) : null;
        if (!resolvedInventoryLotId && item.batch_no) {
          resolvedInventoryLotId = await syncInventoryLotBatch({
            lot_id: item.lot_id,
            product_id: Number(item.product_id),
            batch_no: item.batch_no,
            branch_id: Number(payload.header.branch_id),
            manufacturing_date: item.manufacturing_date,
            expiry_date: item.expiry_date,
            unit_cost: item.cost_per_unit != null ? Number(item.cost_per_unit) : undefined,
            inventory_condition: item.inventory_condition || item.qa_status,
            doc_no: String(payload.header.doc_no || ""),
            userId: payload.userId,
          });
        }

        return {
          doc_no: payload.header.doc_no,
          stock_adjustment_id: id,
          product_id: Number(item.product_id),
          inventory_lot_id: resolvedInventoryLotId || null,
          lot_id: item.lot_id ? Number(item.lot_id) : null,
          batch_no: item.batch_no || null,
          manufacturing_date: item.manufacturing_date || null,
          expiry_date: item.expiry_date || null,
          inventory_condition: item.inventory_condition || item.qa_status || "GOOD",
          source_type: "MANUAL",
          branch_id: Number(payload.header.branch_id),
          type: payload.header.type,
          quantity: Number(item.quantity),
          unit_cost: item.cost_per_unit ? Number(item.cost_per_unit) : 0,
          remarks: item.remarks || "Stock Adjustment",
          unit_id: resolvedUnitId ? Number(resolvedUnitId) : null,
          created_by: payload.userId || null,
          updated_by: payload.userId || null,
          created_at: nowPHT,
          updated_at: nowPHT,
          date_created: nowPHT,
          date_updated: nowPHT,
        };
      })
    );

    const itemsRes = await directusFetch<{ data: Array<{ id: number }> | { id: number } }>(`${DIRECTUS_URL}/items/mm_stock_adjustment?fields=id`, {
      method: "POST",
      body: JSON.stringify(itemsPayload),
    });
    const createdItems = Array.isArray(itemsRes.data) ? itemsRes.data : [itemsRes.data];

    // Save/restore attachments linked to first new item's id
    const targetAttachments = payload.header.stock_adjustment_attachment !== undefined
      ? (payload.header.stock_adjustment_attachment as AttachmentItem[])
      : attachmentsToRestore;

    if (targetAttachments && Array.isArray(targetAttachments) && targetAttachments.length > 0) {
      const firstItemId = createdItems[0]?.id;
      if (firstItemId) {
        const atts = targetAttachments.map((att) => ({
          stock_adjustment_id: firstItemId,
          attachment: typeof att.attachment === 'object' && att.attachment !== null
            ? (att.attachment as { id: string | number }).id
            : (att.attachment || att),
          created_by: payload.userId || null,
          updated_by: payload.userId || null,
          updated_at: nowPHT,
          created_at: nowPHT,
          date_updated: nowPHT,
          date_created: nowPHT,
        }));
        await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment_attachment`, {
          method: "POST",
          body: JSON.stringify(atts),
        }).catch(err => console.error("Failed to update attachments:", err));
      } else {
        console.warn("No item id returned on update — attachments could not be linked.");
      }
    }

    return { success: true };
  },

  /**
   * Post (finalize) a Stock Adjustment
   */
  async postStockAdjustment(id: number, userId?: number) {
    const nowPHT = getPhDbTimestamp();

    const res = await directusFetch<{ data: unknown }>(`${DIRECTUS_URL}/items/mm_stock_adjustment_header/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        isPosted: 1,
        posted_by: userId || null,
        updated_by: userId || null,
        postedAt: nowPHT,
        posted_at: nowPHT,
        updated_at: nowPHT,
        date_updated: nowPHT,
      }),
    });

    try {
      const headerRes = await directusFetch<{ data: { doc_no: string; branch_id?: number; type?: string } }>(
        `${DIRECTUS_URL}/items/mm_stock_adjustment_header/${id}?fields=doc_no,branch_id,type`
      );
      const header = headerRes.data;
      if (header?.doc_no) {
        const itemsRes = await directusFetch<{
          data: Array<{
            id: number;
            product_id: number;
            inventory_lot_id?: number | null;
            lot_id?: number | null;
            batch_no?: string | null;
            manufacturing_date?: string | null;
            expiry_date?: string | null;
            branch_id?: number | null;
            type?: string | null;
            unit_cost?: number;
            inventory_condition?: string;
            created_by?: number | null;
          }>;
        }>(
          `${DIRECTUS_URL}/items/mm_stock_adjustment?filter={"doc_no":{"_eq":"${header.doc_no}"}}&fields=id,product_id,inventory_lot_id,lot_id,batch_no,manufacturing_date,expiry_date,branch_id,type,unit_cost,inventory_condition,created_by&limit=-1`
        );

        const items = itemsRes.data || [];
        for (const item of items) {
          if (item.batch_no) {
            const batchId = await syncInventoryLotBatch({
              lot_id: item.lot_id,
              product_id: Number(item.product_id),
              batch_no: item.batch_no,
              branch_id: item.branch_id || header.branch_id || null,
              manufacturing_date: item.manufacturing_date,
              expiry_date: item.expiry_date,
              unit_cost: item.unit_cost != null ? Number(item.unit_cost) : undefined,
              inventory_condition: item.inventory_condition,
              doc_no: header.doc_no,
              userId: userId || item.created_by,
            });

            if (batchId && item.inventory_lot_id !== batchId) {
              await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment/${item.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  inventory_lot_id: batchId,
                  updated_by: userId || null,
                  updated_at: nowPHT,
                  date_updated: nowPHT,
                }),
              }).catch((e) => console.warn("Failed to patch item inventory_lot_id:", e));
            }
          }
        }

        if (items.length > 0) {
          const itemIds = items.map((i) => i.id);
          await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment`, {
            method: "PATCH",
            body: JSON.stringify({
              keys: itemIds,
              data: {
                ...(userId ? { updated_by: userId } : {}),
                updated_at: nowPHT,
                date_updated: nowPHT,
              }
            })
          }).catch(e => console.warn("Failed to patch item updated_by on post:", e));
        }
      }
    } catch (err) {
      console.warn("Error syncing inventory batches on post:", err);
    }

    return res;
  },

  /**
   * Soft-delete a draft Stock Adjustment (marks is_delete = 1, sets deleted_at, deleted_by)
   */
  async deleteStockAdjustment(id: number, userId?: number) {
    const headerRes = await directusFetch<{ data: { doc_no: string, id: number } }>(`${DIRECTUS_URL}/items/mm_stock_adjustment_header/${id}?fields=doc_no,id`);
    const docNo = headerRes.data?.doc_no;

    if (docNo) {
      const itemsRes = await directusFetch<{ data: { id: number }[] }>(
        `${DIRECTUS_URL}/items/mm_stock_adjustment?filter={"doc_no":{"_eq":"${docNo}"}}&fields=id`
      );
      const itemIds = itemsRes.data.map((i: { id: number }) => i.id);
      if (itemIds.length > 0) {
        await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment`, {
          method: "DELETE",
          body: JSON.stringify(itemIds),
        }).catch(e => console.warn("Failed to clean up draft items on soft-delete:", e));
      }
    }

    const nowPHT = getPhDbTimestamp();
    await directusFetch(`${DIRECTUS_URL}/items/mm_stock_adjustment_header/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        is_delete: 1,
        deleted_at: nowPHT,
        deletedAt: nowPHT,
        deleted_by: userId || null,
        updated_by: userId || null,
        updated_at: nowPHT,
        date_updated: nowPHT,
      }),
    });
  },

  /**
   * Fetch all branches for the dropdown
   */
  async fetchBranches() {
    const res = await directusFetch<{ data: { id: number; branch_name: string; branch_code: string }[] }>(`${DIRECTUS_URL}/items/branches?fields=id,branch_name,branch_code&sort=branch_name&limit=-1`);
    return res.data;
  },

  /**
   * Fetch approved products (SKUs) for the dropdown
   */
  async fetchProducts(params?: { search?: string }) {
    let query = `fields=product_id,product_name,product_code,price_per_unit,cost_per_unit,barcode,description,unit_of_measurement,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.order,product_brand.brand_name,product_category.category_name,product_type,product_type.*,parent_id&limit=100&sort=product_name`;

    const filters: Record<string, unknown> = {
      isActive: { _eq: 1 }
    };

    if (params?.search) {
      filters._or = [
        { product_name: { _icontains: params.search } },
        { description: { _icontains: params.search } },
        { product_code: { _icontains: params.search } },
        { barcode: { _icontains: params.search } }
      ];
    }

    query += `&filter=${JSON.stringify(filters)}`;

    const res = await directusFetch<{ data: unknown[] }>(`${DIRECTUS_URL}/items/products?${query}`);
    const products = res.data || [];

    return products.map((item: unknown) => {
      const p = item as Record<string, unknown>;
      const uom = p['unit_of_measurement'] as Record<string, unknown> | number | undefined;
      const uomObj = typeof uom === 'object' && uom !== null ? uom : undefined;
      const brand = p['product_brand'] as Record<string, unknown> | undefined;
      const cat = p['product_category'] as Record<string, unknown> | undefined;
      const resolvedUnitId = uomObj ? (uomObj['unit_id'] || uomObj['id']) : (typeof uom === 'number' ? uom : null);

      return {
        ...p,
        id: p['product_id'],
        product_name: (p['description'] as string) || (p['product_name'] as string) || "",
        unit_name: (uomObj?.['unit_name'] as string) || (p['unit_name'] as string) || "pcs",
        unit_id: resolvedUnitId ? Number(resolvedUnitId) : null,
        brand_name: brand?.['brand_name'] || p['brand_name'] || "N/A",
        product_type: p['product_type'],
        product_category: p['product_category'],
        category_name: cat?.['category_name'] || (typeof p['product_category'] === 'string' ? p['product_category'] : undefined),
      };
    }) as unknown as StockAdjustmentProduct[];
  },

  /**
   * Fetch active suppliers (nonBuy = 0) for the supplier dropdown.
   */
  async fetchSuppliers() {
    const res = await directusFetch<{ data: Array<{ id: number; supplier_name: string; supplier_shortcut: string }> }>(
      `${DIRECTUS_URL}/items/suppliers?fields=id,supplier_name,supplier_shortcut,nonBuy&filter[nonBuy][_eq]=0&sort=supplier_name&limit=-1`
    );
    return res.data.map((s) => ({
      id: s.id,
      supplier_name: s.supplier_name,
      supplier_shortcut: s.supplier_shortcut,
    }));
  },

  /**
   * Fetch all available units (UoM)
   */
  async fetchUnits() {
    const res = await directusFetch<{ data: { unit_id: number; unit_name: string; unit_shortcut: string; order: number }[] }>(`${DIRECTUS_URL}/items/units?fields=unit_id,unit_name,unit_shortcut,order&sort=unit_name&limit=-1`);
    return res.data || [];
  },

  /**
   * Fetch products linked to a specific supplier via the
   * product_per_supplier junction table.
   */
  async fetchProductsBySupplier(supplierId: number, search?: string) {
    const ppsRes = await directusFetch<{ data: PPSData[] }>(
      `${DIRECTUS_URL}/items/product_per_supplier?filter[supplier_id][_eq]=${supplierId}&fields=product_id&limit=-1`
    );
    const supplierProductIds: number[] = (ppsRes.data || []).map((r) => {
      const pid = typeof r.product_id === 'object' ? (r.product_id as Record<string, unknown>)['id'] : r.product_id;
      return Number(pid);
    });

    if (supplierProductIds.length === 0) return [];

    const filters: Record<string, unknown> = {
      _and: [
        { isActive: { _eq: 1 } },
        {
          _or: [
            { product_id: { _in: supplierProductIds } },
            { parent_id: { _in: supplierProductIds } },
          ],
        },
      ],
    };

    if (search) {
      (filters._and as unknown[]).push({
        _or: [
          { product_name: { _icontains: search } },
          { description: { _icontains: search } },
          { product_code: { _icontains: search } },
          { barcode: { _icontains: search } },
        ],
      });
    }

    const query = `fields=product_id,product_name,product_code,price_per_unit,cost_per_unit,barcode,description,unit_of_measurement,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.order,product_brand.brand_name,product_category.category_name,product_type,product_type.*,parent_id&limit=500&sort=product_name&filter=${JSON.stringify(filters)}`;
    const res = await directusFetch<{ data: unknown[] }>(`${DIRECTUS_URL}/items/products?${query}`);
    const products = res.data || [];

    return products.map((item: unknown) => {
      const p = item as Record<string, unknown>;
      const uom = p['unit_of_measurement'] as Record<string, unknown> | number | undefined;
      const uomObj = typeof uom === 'object' && uom !== null ? uom : undefined;
      const brand = p['product_brand'] as Record<string, unknown> | undefined;
      const cat = p['product_category'] as Record<string, unknown> | undefined;
      const resolvedUnitId = uomObj ? (uomObj['unit_id'] || uomObj['id']) : (typeof uom === 'number' ? uom : null);

      return {
        ...p,
        id: p['product_id'],
        product_name: (p['description'] as string) || (p['product_name'] as string) || "",
        unit_name: (uomObj?.['unit_name'] as string) || (p['unit_name'] as string) || "pcs",
        unit_id: resolvedUnitId ? Number(resolvedUnitId) : null,
        brand_name: brand?.['brand_name'] || p['brand_name'] || "N/A",
        product_type: p['product_type'],
        product_category: p['product_category'],
        category_name: cat?.['category_name'] || (typeof p['product_category'] === 'string' ? p['product_category'] : undefined),
      };
    }) as unknown as StockAdjustmentProduct[];
  },

  /**
   * Fetch the next available document number for a given adjustment type.
   */
  async fetchNextDocNo(type: "IN" | "OUT"): Promise<string> {
    const prefix = type === "IN" ? "SAIN" : "SAOUT";
    const year = new Date().getFullYear();
    const searchPrefix = `${prefix}-${year}-`;

    const res = await directusFetch<{ data: Array<{ doc_no: string }> }>(
      `${DIRECTUS_URL}/items/mm_stock_adjustment_header?filter[doc_no][_starts_with]=${searchPrefix}&fields=doc_no&sort=-doc_no&limit=1`
    );

    const latest = res.data?.[0]?.doc_no;
    let nextNumber = 1;

    if (latest) {
      const parts = latest.split("-");
      const lastPart = parts[parts.length - 1];
      const parsed = parseInt(lastPart, 10);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }

    // Format with padding: 001, 002, etc.
    return `${searchPrefix}${nextNumber.toString().padStart(3, "0")}`;
  },
};
