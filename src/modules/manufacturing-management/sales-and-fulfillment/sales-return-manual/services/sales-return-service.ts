/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Sales Return — Core Service Logic
// =============================================================================
import type {
  SalesReturn,
  SalesReturnItem,
  SalesReturnStatusCard,
  SalesmanOption,
  CustomerOption,
  BranchOption,
  InvoiceOption,
  Brand,
  Category,
  Supplier,
  Unit,
  Product,
  ProductSupplierConnection,
  API_LineDiscount,
  API_SalesReturnType,
  PriceTypeOption,
  ProductPerPriceType,
} from "../type";

import * as repo from "../repositories/sales-return-repository";

// =============================================================================
// HELPERS
// =============================================================================

const parseBoolean = (val: any): boolean => {
  if (typeof val === "number") return val === 1;
  if (val && val.type === "Buffer" && Array.isArray(val.data)) {
    return val.data[0] === 1;
  }
  return val === true;
};

const nowPH = (): string => {
  // Add 8 hours (UTC+8) to UTC time to get Manila time.
  // Uses getUTC* methods to avoid any server local-timezone influence.
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
  const d = new Date(manilaMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const second = String(d.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const formatDateForAPI = (dateString: string | Date) => {
  try {
    if (!dateString) {
      return nowPH();
    }
    let dateStr = "";
    if (typeof dateString === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      dateStr = dateString;
    } else {
      const date = typeof dateString === "string" ? new Date(dateString) : dateString;
      const manilaMs = date.getTime() + 8 * 60 * 60 * 1000;
      const d = new Date(manilaMs);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      dateStr = `${year}-${month}-${day}`;
    }
    return `${dateStr}T00:00:00.000Z`;
  } catch {
    return nowPH();
  }
};

const cleanId = (id: any) => {
  if (id === null || id === undefined || id === "") return null;
  const num = Number(id);
  return isNaN(num) ? id : num;
};

/**
 * Builds a Map<discount_type_id, total_percentage> by retrieving pre-calculated
 * sequential compounded percentages from the discount_type collection.
 */
async function buildDiscountPercentMap(): Promise<Map<number, number>> {
  const result = await repo.getRawDiscountTypes();
  const rows = (result.data || []) as { id: number; total_percent: string | number }[];

  const discountMap = new Map<number, number>();
  rows.forEach((dt) => {
    discountMap.set(dt.id, parseFloat(String(dt.total_percent)) || 0);
  });

  return discountMap;
}

/**
 * Synchronizes an inventory lot based on unique keys.
 * Finds existing or creates a new one.
 */
async function syncInventoryLot(
  lotId: number,
  productId: number,
  branchId: number,
  batchNo: string,
  returnNo: string,
  userId: number,
  mfgDate: string | null,
  expDate: string | null
): Promise<number | null> {
  try {
    const existing = await repo.getInventoryLotByUniqueKeys(lotId, productId, batchNo);
    const data = existing.data || [];
    if (data.length > 0 && data[0].inventory_lot_id) {
      return Number(data[0].inventory_lot_id);
    }

    const payload = {
      lot_id: lotId,
      product_id: productId,
      branch_id: branchId,
      batch_no: batchNo,
      manufacturing_date: mfgDate,
      expiry_date: expDate,
      unit_cost: 0,
      qa_status: "GOOD",
      status: "ACTIVE",
      source_type: "Sales Return",
      source_reference: returnNo,
      created_by: userId,
      created_at: nowPH(),
      updated_at: nowPH(),
    };

    const created = await repo.createInventoryLot(payload);
    return created.data ? Number(created.data.inventory_lot_id) : null;
  } catch (e) {
    console.error("Failed to sync inventory lot:", e);
    return null;
  }
}

// =============================================================================
// PUBLIC SERVICE METHODS
// =============================================================================

/**
 * Fetches paginated sales return list.
 */
export async function fetchReturns(
  page: number = 1,
  limit: number = 10,
  filters: { salesman?: string; customer?: string; status?: string; invoiceNo?: string } = {},
): Promise<{ data: SalesReturn[]; total: number }> {
  const result = await repo.getRawReturns(page, limit, filters);

  const mappedData: SalesReturn[] = (result.data || []).map((item: any) => ({
    id: item.return_id,
    returnNo: item.return_number,
    invoiceNo: item.invoice_no,
    customerCode: item.customer_code,
    salesmanId: item.salesman_id,
    returnDate: item.return_date
      ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.return_date))
      : "N/A",
    totalAmount: parseFloat(item.total_amount) || 0,
    status: item.status || "Pending",
    remarks: item.remarks,
    orderNo: item.order_id || "",
    isThirdParty: parseBoolean(item.isThirdParty),
    priceType: item.price_type_id ? String(item.price_type_id) : "-",
    createdAt: item.created_at
      ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.created_at))
      : "-",
    receivedAt: item.received_at
      ? new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.received_at))
      : "-",
  }));

  return { data: mappedData, total: result.meta?.filter_count || 0 };
}

/**
 * Fetches return detail line items with product/unit/discount enrichment.
 */
export async function fetchReturnDetails(
  returnId: number,
  returnNo: string,
): Promise<SalesReturnItem[]> {
  if (!returnNo) return [];

  const [detailsRes, unitsRes, returnTypesRes] =
    await Promise.all([
      repo.getRawReturnDetails(returnNo),
      repo.getRawUnits(),
      repo.getRawReferences().then((refs) => refs[4]),
    ]);

  const rawItems = detailsRes.data || [];
  const units = (unitsRes.data || []) as unknown as Unit[];
  const returnTypes = (returnTypesRes.data || []) as unknown as API_SalesReturnType[];

  // Build aggregate discount percentage map from junction + line_discount tables
  const discountPercentMap = await buildDiscountPercentMap();

  return rawItems.map((detail: any) => {
    const product =
      typeof detail.product_id === "object" && detail.product_id !== null
        ? detail.product_id
        : {
            product_code: "N/A",
            product_name: `Unknown (ID: ${detail.product_id})`,
          };

    const unitId =
      typeof product.unit_of_measurement === "object"
        ? product.unit_of_measurement?.unit_id
        : product.unit_of_measurement;
    const unit = units.find((u: Unit) => u.unit_id === unitId);
    const returnTypeObj = returnTypes.find(
      (rt: API_SalesReturnType) => rt.type_id == detail.sales_return_type_id,
    );

    return {
      id: detail.detail_id || detail.id,
      productId: product.product_id,
      code: product.product_code || "N/A",
      description:
        product.product_name || product.description || "Unknown Item",
      unit: unit ? unit.unit_shortcut : "Pcs",
      unit_id: unitId ? Number(unitId) : undefined,
      quantity: Number(detail.quantity),
      unitPrice: Number(detail.unit_price),
      agreedPrice: detail.agreed_price !== undefined && detail.agreed_price !== null ? Number(detail.agreed_price) : Number(detail.unit_price),
      priceVariance: detail.price_variance ? Number(detail.price_variance) : 0,
      grossAmount: Number(detail.gross_amount),
      discountType: detail.discount_type ? Number(detail.discount_type) : "",
      discountAmount: (() => {
        const discId = detail.discount_type
          ? Number(detail.discount_type)
          : null;
        if (!discId) return 0;
        const percentage = discountPercentMap.get(discId) || 0;
        const gross = Number(detail.quantity) * Number(detail.unit_price);
        return Math.round(gross * (percentage / 100) * 100) / 100;
      })(),
      totalAmount: (() => {
        const gross = Number(detail.quantity) * Number(detail.unit_price);
        const discId = detail.discount_type
          ? Number(detail.discount_type)
          : null;
        if (!discId) return gross;
        const percentage = discountPercentMap.get(discId) || 0;
        return Math.round((gross - gross * (percentage / 100)) * 100) / 100;
      })(),
      lot_id: detail.lot_id ? Number(detail.lot_id) : null,
      batch: detail.batch || null,
      manufacturing_date: detail.manufacturing_date ? String(detail.manufacturing_date).substring(0, 10) : null,
      expiry_date: detail.expiry_date ? String(detail.expiry_date).substring(0, 10) : null,
      reason: detail.reason || "",
      sales_return_type_id: detail.sales_return_type_id
        ? Number(detail.sales_return_type_id)
        : "",
      returnType: returnTypeObj ? returnTypeObj.type_name : "Good Order",
      priceA: product.priceA,
      priceB: product.priceB,
      priceC: product.priceC,
      priceD: product.priceD,
      priceE: product.priceE,
      unitMultiplier: product.unit_of_measurement_count || 1,
    } as SalesReturnItem;
  });
}

/**
 * Fetches all reference data for dropdowns.
 */
export async function fetchReferences(): Promise<{
  salesmen: { value: string; label: string; code: string; branch: string }[];
  formSalesmen: SalesmanOption[];
  customers: { value: string; label: string }[];
  formCustomers: CustomerOption[];
  branches: BranchOption[];
  lineDiscounts: API_LineDiscount[];
  returnTypes: API_SalesReturnType[];
  priceTypes: PriceTypeOption[];
}> {
  const [salesmenRes, customersRes, branchesRes, lineDiscountsRes, returnTypesRes] =
    await repo.getRawReferences();

  // Fetch price types separately (not part of getRawReferences to avoid breaking the tuple)
  let priceTypesData: PriceTypeOption[] = [];
  try {
    const priceTypesRes = await repo.getRawPriceTypes();
    priceTypesData = ((priceTypesRes.data || []) as unknown as PriceTypeOption[]);
  } catch (err) {
    console.error("Failed to fetch price types:", err);
  }

  const salesmenData = (salesmenRes.data || []) as any[];
  const customersData = (customersRes.data || []) as any[];
  const branchesData = (branchesRes.data || []) as any[];

  // Build branch lookup for salesman enrichment
  const branchMap = new Map<number, string>();
  branchesData.forEach((b: any) => branchMap.set(b.id, b.branch_name));

  // Dropdown-formatted salesmen
  const salesmen = salesmenData.map((item: any) => ({
    value: item.id.toString(),
    label: item.salesman_name,
    code: item.salesman_code || "N/A",
    branch: branchMap.get(item.branch_code) || "N/A",
  }));

  // Form-formatted salesmen
  const formSalesmen: SalesmanOption[] = salesmenData.map((item: any) => ({
    id: item.id,
    name: item.salesman_name,
    code: item.salesman_code,
    priceType: item.price_type || "A",
    branchId: item.branch_code,
  }));

  // Dropdown-formatted customers
  const customers = customersData.map((item: any) => ({
    value: item.customer_code,
    label: item.customer_name,
  }));

  // Form-formatted customers
  const formCustomers: CustomerOption[] = customersData.map((item: any) => ({
    id: item.id,
    name: item.customer_name || item.store_name,
    code: item.customer_code,
    price_type_id: item.price_type_id,
  }));

  // Branches
  const branches: BranchOption[] = branchesData.map((item: any) => ({
    id: item.id,
    name: item.branch_name,
  }));

  // Enrich discount_type records with computed total_percent from junction + line_discount
  const discountPercentMap = await buildDiscountPercentMap();
  const rawDiscountTypes = (lineDiscountsRes.data || []) as any[];
  const enrichedLineDiscounts: API_LineDiscount[] = rawDiscountTypes.map((dt: any) => ({
    id: dt.id,
    discount_type: dt.discount_type,
    total_percent: String(dt.total_percent !== undefined && dt.total_percent !== null ? dt.total_percent : (discountPercentMap.get(dt.id) || 0)),
  }));

  return {
    salesmen,
    formSalesmen,
    customers,
    formCustomers,
    branches,
    lineDiscounts: enrichedLineDiscounts,
    returnTypes: (returnTypesRes.data || []) as unknown as API_SalesReturnType[],
    priceTypes: priceTypesData,
  };
}

/**
 * Fetches all lots.
 */
export async function fetchLots(): Promise<{ lot_id: number; lot_name: string; branch_id: number; unit_id: number; }[]> {
  const result = await repo.getRawLots();
  return (result.data || []) as { lot_id: number; lot_name: string; branch_id: number; unit_id: number; }[];
}

/**
 * Fetches the product catalog for the ProductLookupModal.
 */
export async function fetchProductCatalog(
  customerCode?: string,
  includeInactive = false,
): Promise<{
  brands: Brand[];
  categories: Category[];
  suppliers: Supplier[];
  units: Unit[];
  connections: ProductSupplierConnection[];
  supplierCategoryDiscount: any[];
  products: Product[];
  productPrices: ProductPerPriceType[];
}> {
  const catalogData = await repo.getRawProductCatalog(includeInactive);
  const [brandsRes, categoriesRes, suppliersRes, unitsRes, connectionsRes, productsRes, productPricesRes] = catalogData;

  let scdpcRes = { data: [] as any[] };

  if (customerCode) {
    scdpcRes = await repo.getRawSupplierCategoryDiscount(customerCode);
  }

  const connections = ((connectionsRes.data || []) as any[]).map((item: any) => ({
    id: item.id,
    supplier_id: item.supplier_id,
    product_id:
      typeof item.product_id === "object"
        ? item.product_id.product_id
        : item.product_id,
    discount_type: item.discount_type,
  }));

  const supplierCategoryDiscount = (scdpcRes.data || []).map((item: any) => ({
    id: item.id,
    customer_code: item.customer_code,
    supplier_id: item.supplier_id,
    category_id: item.category_id,
    discount_type: item.discount_type,
  }));

  const productPrices = ((productPricesRes?.data || []) as any[]).map((item: any) => ({
    id: item.id,
    price: item.price,
    status: item.status,
    price_type_id: typeof item.price_type_id === "object" && item.price_type_id !== null 
      ? (item.price_type_id.price_type_id || item.price_type_id.id)
      : item.price_type_id,
    product_id: typeof item.product_id === "object" && item.product_id !== null
      ? (item.product_id.product_id || item.product_id.id)
      : item.product_id,
  }));

  return {
    brands: (brandsRes.data || []) as unknown as Brand[],
    categories: (categoriesRes.data || []) as unknown as Category[],
    suppliers: (suppliersRes.data || []) as unknown as Supplier[],
    units: (unitsRes.data || []) as unknown as Unit[],
    connections: connections as ProductSupplierConnection[],
    supplierCategoryDiscount,
    products: (productsRes.data || []) as unknown as Product[],
    productPrices: productPrices as ProductPerPriceType[],
  };
}


/**
 * Fetches invoices, optionally filtered by customer code.
 */
export async function fetchInvoices(
  salesmanId?: string,
  customerCode?: string,
): Promise<InvoiceOption[]> {
  const result = await repo.getRawInvoices(salesmanId, customerCode);
  const rawData = (result.data || []) as any[];

  const uniqueInvoices = new Map<string, InvoiceOption>();
  rawData.forEach((item: any) => {
    const key = `${item.order_id || ""}_${item.invoice_no || ""}`;
    const isPosted = parseBoolean(item.isPosted);
    if (!isPosted && !uniqueInvoices.has(key)) {
      uniqueInvoices.set(key, {
        id: item.invoice_id,
        invoice_no: (item.invoice_no || "").toString(),
        order_id: (item.order_id || "").toString(),
        customerCode: item.customer_code || "",
        salesman_id: item.salesman_id || 0,
        amount: item.total_amount ? parseFloat(item.total_amount) : 0,
      });
    }
  });

  return Array.from(uniqueInvoices.values());
}

export async function fetchInvoiceDetails(invoiceId: number): Promise<any[]> {
  const result = await repo.getRawInvoiceDetails(invoiceId);
  return (result.data || []) as any[];
}




/**
 * Fetches the status card data for a return.
 */
export async function fetchStatusCard(
  returnId: number,
): Promise<SalesReturnStatusCard | null> {
  try {
    const result = await repo.getRawReturnById(returnId);
    const data = result.data as any;

    // Fetch linked invoice
    let appliedToText = "-";
    let appliedInvoiceId = null;
    let isInvoicePosted = false;
    try {
      const linkRes = await repo.getRawLinkedInvoice(returnId);
      const linkData = (linkRes.data || []) as any[];
      if (linkData.length > 0) {
        const linkedRec = linkData[0];
        if (linkedRec.invoice_no) {
          appliedToText = linkedRec.invoice_no.invoice_no || "-";
          appliedInvoiceId = linkedRec.invoice_no.invoice_id || null;
          isInvoicePosted = parseBoolean(linkedRec.invoice_no.isPosted);
        }
      }
    } catch {
      // Ignore link fetch errors
    }

    return {
      returnId: data.return_id,
      isApplied: data.isApplied === 1,
      dateApplied: data.updated_at
        ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data.updated_at))
        : "-",
      transactionStatus: data.status || "Closed",
      isPosted: parseBoolean(data.isPosted),
      isReceived: parseBoolean(data.isReceived),
      appliedTo: appliedToText,
      appliedInvoiceId,
      isInvoicePosted,
    };
  } catch {
    return null;
  }
}

/**
 * Creates a new sales return (header + details).
 */
export async function submitReturn(payload: any, userId: number): Promise<any> {
  if (payload.appliedInvoiceId) {
    const invoiceData = await repo.getInvoiceStatus(payload.appliedInvoiceId);
    const isPosted = parseBoolean(invoiceData?.data?.isPosted);
    if (isPosted) {
      throw new Error("This invoice has already been posted. You can only link to invoices that are not yet posted.");
    }
  }

  // Fetch line discounts for discount calculation
  const refsResult = await repo.getRawReferences();
  const returnTypes = (refsResult[4].data || []) as unknown as API_SalesReturnType[];

  // Build aggregate discount percentage map from junction + line_discount tables
  const lineDiscountMap = await buildDiscountPercentMap();

  const totalGross = payload.items.reduce(
    (sum: number, item: any) => {
      const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : Number(item.unitPrice);
      return Math.round((sum + Number(item.quantity) * agPrice) * 100) / 100;
    },
    0,
  );

  const totalDiscount = payload.items.reduce(
    (sum: number, item: any) => {
      const gross = Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100;
      const discId = item.discountType ? Number(item.discountType) : null;
      const percentage = discId ? lineDiscountMap.get(discId) || 0 : 0;
      const discount = Math.round(gross * (percentage / 100) * 100) / 100;
      return Math.round((sum + discount) * 100) / 100;
    },
    0,
  );

  const formattedDate = formatDateForAPI(payload.returnDate);
  const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
  const shortTimestamp = Math.floor(Date.now() / 1000).toString().slice(-4);
  const generatedReturnNo = `SR-${shortTimestamp}-${uniqueSuffix}`;

  const headerPayload = {
    return_number: generatedReturnNo,
    gross_amount: totalGross,
    discount_amount: totalDiscount,
    created_by: userId,
    invoice_no: payload.invoiceNo || "",
    customer_code: payload.customer || payload.customerCode,
    salesman_id: cleanId(payload.salesmanId),
    total_amount: Math.round(Number(payload.totalAmount) * 100) / 100,
    status: "Pending",
    return_date: formattedDate,
    price_type_id: payload.priceType ? Number(payload.priceType) : null,
    branch_id: cleanId(payload.branchId) ?? null,
    remarks: payload.remarks || "Created via Web App",
    order_id: payload.orderNo || "",
    isThirdParty: payload.isThirdParty ? 1 : 0,
    isApplied: payload.appliedInvoiceId ? 1 : 0,
    created_at: nowPH(),
    updated_at: nowPH(),
  };

  const headerResult = await repo.createReturnHeader(headerPayload);
  const headerData = headerResult.data as any;
  const finalReturnNo = headerData?.return_number || generatedReturnNo;
  const returnId = headerData?.id;

  // 🟢 Handle Optional Junction Link to Invoice
  if (payload.appliedInvoiceId && returnId) {
    try {
      const returnAmount = Math.round(Number(payload.totalAmount) * 100) / 100;
      await repo.createJunctionLink({
        return_no: returnId,
        invoice_no: payload.appliedInvoiceId,
        linked_by: userId,
        amount: returnAmount,
        created_at: nowPH(),
        updated_at: nowPH(),
      });
    } catch (e) {
      console.error("Failed to create junction link during submission", e);
    }
  }

  const detailPromises = payload.items.map(async (item: any) => {
    const matchedType = returnTypes.find(
      (t: API_SalesReturnType) => t.type_name === item.returnType,
    );
    const typeId = matchedType
      ? matchedType.type_id
      : returnTypes[0]?.type_id || 1;

    const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : Number(item.unitPrice);
    const gross = Math.round(Number(item.quantity) * agPrice * 100) / 100;
    const discId =
      item.discountType && item.discountType !== ""
        ? Number(item.discountType)
        : null;
    const percentage = discId ? lineDiscountMap.get(discId) || 0 : 0;
    const discountAmt = Math.round(gross * (percentage / 100) * 100) / 100;
    const variance = Math.round((Number(item.unitPrice) - agPrice) * Number(item.quantity) * 100) / 100;

    let finalInventoryLotId = null;
    if (item.batch && item.lot_id) {
      finalInventoryLotId = await syncInventoryLot(
        Number(item.lot_id),
        Number(item.productId || item.product_id || item.id),
        payload.branchId ? Number(payload.branchId) : 0,
        item.batch,
        finalReturnNo,
        userId,
        item.manufacturing_date || null,
        item.expiry_date || null
      );
    }

    const detailPayload = {
      return_no: finalReturnNo,
      product_id: Number(item.productId || item.product_id || item.id),
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
      agreed_price: agPrice,
      price_variance: variance,
      gross_amount: gross,
      discount_amount: discountAmt,
      total_amount: Math.round((gross - discountAmt) * 100) / 100,
      sales_return_type_id: typeId,
      discount_type: discId,
      lot_id: item.lot_id ? Number(item.lot_id) : null,
      batch: item.batch ? String(item.batch) : null,
      reason: item.reason || null,
      inventory_lot_id: finalInventoryLotId,
      unit_id: item.unit_id ? Number(item.unit_id) : null,
      manufacturing_date: item.manufacturing_date || null,
      expiry_date: item.expiry_date || null,
      created_at: nowPH(),
      status: "Draft",
    };

    await repo.createReturnDetail(detailPayload);
  });

  await Promise.all(detailPromises);
  return headerResult;
}

/**
 * Updates an existing sales return (header + details).
 */
export async function updateReturn(
  payload: {
    returnId: number;
    returnNo: string;
    items: any[];
    remarks: string;
    invoiceNo?: string;
    orderNo?: string;
    appliedInvoiceId?: number;
    isThirdParty?: boolean;
    branchId?: number | string;
  },
  userId: number,
): Promise<any> {
  // Fetch line discounts
  const refsResult = await repo.getRawReferences();
  const returnTypes = (refsResult[4].data || []) as unknown as API_SalesReturnType[];

  // Build aggregate discount percentage map from junction + line_discount tables
  const lineDiscountMap = await buildDiscountPercentMap();

  const totalGross = payload.items.reduce(
    (sum: number, item: any) => {
      const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : Number(item.unitPrice);
      return Math.round((sum + Number(item.quantity) * agPrice) * 100) / 100;
    },
    0,
  );

  const totalDiscount = payload.items.reduce(
    (sum: number, item: any) => {
      const gross = Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100;
      const discId =
        item.discountType &&
        item.discountType !== "No Discount" &&
        item.discountType !== ""
          ? Number(item.discountType)
          : null;
      const percentage = discId ? lineDiscountMap.get(discId) || 0 : 0;
      const discount = Math.round(gross * (percentage / 100) * 100) / 100;
      return Math.round((sum + discount) * 100) / 100;
    },
    0,
  );

  const totalNet = Math.round((totalGross - totalDiscount) * 100) / 100;

  const headerPayload: Record<string, any> = {
    remarks: payload.remarks ?? "",
    gross_amount: totalGross,
    discount_amount: totalDiscount,
    total_amount: totalNet,
    branch_id: cleanId(payload.branchId),
    invoice_no: payload.invoiceNo ?? "",
    order_id: payload.orderNo ?? "",
    isThirdParty: payload.isThirdParty ? 1 : 0,
    updated_at: nowPH(),
  };

  if (payload.hasOwnProperty("appliedInvoiceId")) {
    headerPayload.isApplied = payload.appliedInvoiceId ? 1 : 0;
  }

  await repo.updateReturnHeader(payload.returnId, headerPayload);

  // 🟢 Handle Junction Table with explicit Unlinking (null check)
  if (payload.hasOwnProperty("appliedInvoiceId")) {
    try {
      const linkResult = await repo.getJunctionLink(payload.returnId);
      const existingLinks = (linkResult.data || []) as any[];
      const existingLink = existingLinks.length > 0 ? existingLinks[0] : null;

      // Rule C: Prevent unlinking or changing if the current linked invoice is posted
      if (existingLink) {
        const currentInvoiceId = existingLink.invoice_no?.id || existingLink.invoice_no;
        if (currentInvoiceId && Number(currentInvoiceId) !== payload.appliedInvoiceId) {
          const currentInvoiceData = await repo.getInvoiceStatus(Number(currentInvoiceId));
          if (parseBoolean(currentInvoiceData?.data?.isPosted)) {
            throw new Error("This invoice has already been posted. Once an invoice is posted, it is locked and cannot be unlinked or changed.");
          }
        }
      }

      if (payload.appliedInvoiceId) {
        // Rule B: Prevent linking to a posted invoice
        const targetInvoiceData = await repo.getInvoiceStatus(payload.appliedInvoiceId);
        if (parseBoolean(targetInvoiceData?.data?.isPosted)) {
          throw new Error("This invoice has already been posted. You can only link to invoices that are not yet posted.");
        }

        // Link or Update
        if (existingLink) {
          await repo.updateJunctionLink(existingLink.id, {
            invoice_no: payload.appliedInvoiceId,
            linked_by: userId,
            amount: totalNet,
            updated_at: nowPH(),
          });
        } else {
          await repo.createJunctionLink({
            return_no: payload.returnId,
            invoice_no: payload.appliedInvoiceId,
            linked_by: userId,
            amount: totalNet,
            created_at: nowPH(),
            updated_at: nowPH(),
          });
        }
      } else if (payload.appliedInvoiceId === null && existingLink) {
        // Explicit Unlink (Delete)
        await repo.deleteJunctionLink(existingLink.id);
      }
    } catch (e: any) {
      console.error("Failed to sync junction link:", e);
      throw e;
    }
  }

  // Handle detail items: delete removed, update existing, create new
  const currentItems = await fetchReturnDetails(
    payload.returnId,
    payload.returnNo,
  );

  const payloadIds = payload.items
    .filter((item: any) => typeof item.id === "number")
    .map((item: any) => item.id);

  const itemsToDelete = currentItems.filter(
    (dbItem) => !payloadIds.includes(dbItem.id),
  );

  for (const item of itemsToDelete) {
    if (item.id) await repo.deleteReturnDetail(item.id as number);
  }

  for (const item of payload.items) {
    const matchedType = returnTypes.find(
      (t: API_SalesReturnType) => t.type_name === item.returnType,
    );
    const typeId = matchedType
      ? matchedType.type_id
      : returnTypes[0]?.type_id || 1;

    const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : Number(item.unitPrice);
    const gross = Math.round(Number(item.quantity) * agPrice * 100) / 100;
    const discId =
      item.discountType &&
      item.discountType !== "No Discount" &&
      item.discountType !== ""
        ? Number(item.discountType)
        : null;
    const percentage = discId ? lineDiscountMap.get(discId) || 0 : 0;
    const discountAmt = Math.round(gross * (percentage / 100) * 100) / 100;
    const variance = Math.round((Number(item.unitPrice) - agPrice) * Number(item.quantity) * 100) / 100;

    let finalInventoryLotId = null;
    if (item.batch && item.lot_id) {
      if (typeof item.id === "number") {
        const currentDbItem = currentItems.find((d: any) => d.id === item.id);
        if (currentDbItem && currentDbItem.batch !== item.batch) {
          if (currentDbItem.inventory_lot_id) {
            await repo.updateInventoryLotStatus(Number(currentDbItem.inventory_lot_id), "INACTIVE");
          }
        }
      }

      finalInventoryLotId = await syncInventoryLot(
        Number(item.lot_id),
        Number(item.productId || item.product_id),
        payload.branchId ? Number(payload.branchId) : 0,
        item.batch,
        payload.returnNo,
        userId,
        item.manufacturing_date || null,
        item.expiry_date || null
      );
    }

    const detailPayload = {
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
      agreed_price: agPrice,
      price_variance: variance,
      gross_amount: gross,
      discount_amount: discountAmt,
      total_amount: Math.round((gross - discountAmt) * 100) / 100,
      sales_return_type_id: typeId,
      discount_type: discId,
      lot_id: item.lot_id ? Number(item.lot_id) : null,
      batch: item.batch ? String(item.batch) : null,
      reason: item.reason || null,
      inventory_lot_id: finalInventoryLotId,
      unit_id: item.unit_id ? Number(item.unit_id) : null,
      manufacturing_date: item.manufacturing_date || null,
      expiry_date: item.expiry_date || null,
      updated_at: nowPH(),
    };

    if (typeof item.id === "string" && item.id.startsWith("added-")) {
      await repo.createReturnDetail({
        ...detailPayload,
        return_no: payload.returnNo,
        product_id: Number(item.productId || item.product_id),
        created_at: nowPH(),
        status: "Draft",
      });
    } else {
      await repo.updateReturnDetail(item.id, detailPayload);
    }
  }

  return { success: true };
}

/**
 * Updates the status of a sales return.
 */
export async function updateStatus(
  id: number,
  status: string,
  isReceived?: number,
  received_at?: string,
): Promise<any> {
  if (status === "Received") {
    try {
      const headerRes = await repo.getRawReturnById(id);
      const returnNo = headerRes.data?.return_number;
      if (returnNo) {
        const detailsRes = await repo.getRawReturnDetails(returnNo as string);
        const details = detailsRes.data || [];
        const detailPromises = details.map((d: any) =>
          repo.updateReturnDetail(d.detail_id, { status: "Returned" }),
        );
        await Promise.all(detailPromises);
      }
    } catch (e) {
      console.error("Failed to update sales return details status to Returned:", e);
    }
  }

  return repo.updateReturnStatus(id, status, isReceived, received_at);
}
